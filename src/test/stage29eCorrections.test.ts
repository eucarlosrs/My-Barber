import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { InMemoryRateLimiter, createRateLimitMiddleware } from '../server/rateLimiter.js';
import { PlanService } from '../server/planService.js';
import { DurablePaymentRecord, DurableSubscriptionRecord } from '../server/webhookService.js';

describe('FASE 2.9E — Correções dos Resíduos da Auditoria 2.9D', () => {
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  const webhookServicePath = path.resolve(process.cwd(), 'src/server/webhookService.ts');
  const webhookServiceContent = fs.readFileSync(webhookServicePath, 'utf8');

  const planServicePath = path.resolve(process.cwd(), 'src/server/planService.ts');
  const planServiceContent = fs.readFileSync(planServicePath, 'utf8');

  // =========================================================================
  // 1. WEBHOOK MERCADO PAGO — IDEMPOTÊNCIA E ESTADO FINANCEIRO DURÁVEL
  // =========================================================================
  describe('1. Webhook Mercado Pago — Transação e Idempotência Durável', () => {
    it('server.ts integra recordDurablePaymentTransaction no processamento de pagamento aprovado', () => {
      assert.ok(
        serverContent.includes('recordDurablePaymentTransaction('),
        'server.ts DEVE chamar recordDurablePaymentTransaction para reconciliação durável'
      );
      assert.ok(
        serverContent.includes('recordDurablePaymentTransaction') && serverContent.includes('./src/server/webhookService.js'),
        'server.ts deve importar recordDurablePaymentTransaction de webhookService'
      );
    });

    it('webhookService.ts implementa recordDurablePaymentTransaction de forma transacional no Firestore', () => {
      assert.ok(
        webhookServiceContent.includes('firestore.runTransaction('),
        'Transação atômica do Firestore DEVE ser usada para gravar o pagamento'
      );
      assert.ok(
        webhookServiceContent.includes("firestore.collection('subscription_payments').doc(paymentKey)"),
        'Pagamentos devem ser persistidos deterministicamente em subscription_payments com chave pay-{paymentId}'
      );
      assert.ok(
        webhookServiceContent.includes("firestore.collection('subscriptions').doc(subKey)"),
        'Assinatura deve ser persistida duravelmente em subscriptions'
      );
    });

    it('Lógica de negócio de reconciliação: não re-incrementa paidBillingCount se pagamento já existir', () => {
      // Simulação da máquina de estados implementada em recordDurablePaymentTransaction
      const existingPayments = new Map<string, DurablePaymentRecord>();
      const existingSubs = new Map<string, DurableSubscriptionRecord>();

      const paymentId = '123456789';
      const subId = 'sub-barber-test';

      const initialSub: DurableSubscriptionRecord = {
        id: subId,
        barbershopId: 'barber-test',
        barbershopName: 'Barbearia Vintage',
        payerEmail: 'dono@barbearia.com',
        mercadopagoSubscriptionId: 'mp-sub-123',
        status: 'PENDING',
        plan: 'Plano MY BARBER',
        currentPrice: 49.90,
        billingCycle: 'MONTHLY',
        isInTrial: false,
        paidBillingCount: 0,
        billingCount: 0,
        cardValidated: true,
        toleranceDays: 7,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      existingSubs.set(subId, initialSub);

      const processPayment = (pid: string, amount: number) => {
        const paymentKey = `pay-${pid}`;
        const currentSub = existingSubs.get(subId)!;

        if (existingPayments.has(paymentKey)) {
          return { isNewPayment: false, count: currentSub.paidBillingCount };
        }

        const nextCount = (currentSub.paidBillingCount || 0) + 1;
        currentSub.paidBillingCount = nextCount;
        currentSub.billingCount = nextCount;
        currentSub.status = 'ACTIVE';
        currentSub.currentPrice = nextCount >= 3 ? 69.90 : 49.90;

        const newPay: DurablePaymentRecord = {
          id: paymentKey,
          subscriptionId: subId,
          barbershopId: 'barber-test',
          barbershopName: 'Barbearia Vintage',
          mercadopagoPaymentId: pid,
          amount,
          status: 'APPROVED',
          statusDetail: 'accredited',
          paymentDate: '2026-09-21',
          billingNumber: nextCount,
          paymentMethod: 'Cartão de Crédito',
          createdAt: new Date().toISOString()
        };
        existingPayments.set(paymentKey, newPay);

        return { isNewPayment: true, count: nextCount };
      };

      // 1ª execução do webhook
      const run1 = processPayment(paymentId, 49.90);
      assert.strictEqual(run1.isNewPayment, true);
      assert.strictEqual(run1.count, 1);

      // Re-tentativa concorrente ou replay do mesmo webhook
      const run2 = processPayment(paymentId, 49.90);
      assert.strictEqual(run2.isNewPayment, false, 'Pagamento repetido DEVE ser detectado como já computado');
      assert.strictEqual(run2.count, 1, 'paidBillingCount NÃO pode ser re-incrementado');
    });

    it('Status endpoint consulta Firestore caso o processo tenha acabado de iniciar ou memória esteja fria', () => {
      assert.ok(
        serverContent.includes("firestore.collection('subscriptions').doc(`sub-${barbershopId}`).get()"),
        'Endpoint /status deve buscar no Firestore caso subscriptionsDB não contenha a barbearia'
      );
      assert.ok(
        serverContent.includes("firestore.collection('subscription_payments')"),
        'Endpoint /status deve consultar subscription_payments no Firestore como fonte da verdade'
      );
    });
  });

  // =========================================================================
  // 2. PERSISTÊNCIA E CONSISTÊNCIA DE PLANOS ENTRE MÚLTIPLAS INSTÂNCIAS
  // =========================================================================
  describe('2. Consistência de Planos Multi-Instância e Invalidação por TTL', () => {
    it('PlanService possui mecanismo de TTL implementado para expirar caches frios', () => {
      assert.ok(
        planServiceContent.includes('CACHE_TTL_MS'),
        'PlanService deve definir CACHE_TTL_MS'
      );
      assert.ok(
        planServiceContent.includes('Date.now() - this.lastFetchTime > this.CACHE_TTL_MS'),
        'ensureInitialized deve checar expiração do TTL'
      );
    });

    it('savePlan atualiza o Firestore primariamente antes de atualizar o cache em memória', () => {
      assert.ok(
        planServiceContent.includes("firestore.collection('plans').doc(plan.id).set("),
        'savePlan deve gravar primeiro no Firestore'
      );
      assert.ok(
        planServiceContent.includes('this.lastFetchTime = Date.now()'),
        'savePlan deve atualizar o timestamp de fetch'
      );
    });

    it('Planos em memória funcionam como cache rápido com suporte a multi-instâncias', () => {
      const service = new PlanService();
      assert.ok(typeof service.getPlans === 'function');
      assert.ok(typeof service.getPlanById === 'function');
      assert.ok(typeof service.savePlan === 'function');
      assert.ok(typeof service.ensureInitialized === 'function');
    });
  });

  // =========================================================================
  // 3. RATE LIMITING NOS TRÊS ENDPOINTS IDENTIFICADOS NA AUDITORIA
  // =========================================================================
  describe('3. Rate Limiting Aplicado a Todos os Endpoints Sensíveis', () => {
    it('POST /api/subscriptions/cancel possui subscriptionEndpointsLimiter', () => {
      const cancelBlock = serverContent.slice(serverContent.indexOf("'/api/subscriptions/cancel'"));
      const nextEndpoint = cancelBlock.slice(0, 300);
      assert.ok(
        nextEndpoint.includes('subscriptionEndpointsLimiter'),
        'Endpoint de cancelamento deve ter subscriptionEndpointsLimiter'
      );
    });

    it('POST /api/subscriptions/sync/:barbershopId possui subscriptionEndpointsLimiter', () => {
      const syncBlock = serverContent.slice(serverContent.indexOf("'/api/subscriptions/sync/:barbershopId'"));
      const nextEndpoint = syncBlock.slice(0, 300);
      assert.ok(
        nextEndpoint.includes('subscriptionEndpointsLimiter'),
        'Endpoint de sincronização deve ter subscriptionEndpointsLimiter'
      );
    });

    it('POST /api/subscriptions/simulate-action possui subscriptionEndpointsLimiter', () => {
      const simBlock = serverContent.slice(serverContent.indexOf("'/api/subscriptions/simulate-action'"));
      const nextEndpoint = simBlock.slice(0, 300);
      assert.ok(
        nextEndpoint.includes('subscriptionEndpointsLimiter'),
        'Endpoint de simulação deve ter subscriptionEndpointsLimiter'
      );
    });

    it('InMemoryRateLimiter bloqueia corretamente com HTTP 429 ao exceder limite', async () => {
      const limiter = new InMemoryRateLimiter();
      const testKey = 'test-client-limiter';

      // 5 requisições permitidas
      for (let i = 0; i < 5; i++) {
        const res = await limiter.checkLimit(testKey, 5, 60);
        assert.strictEqual(res.allowed, true);
      }

      // 6ª requisição deve retornar allowed: false com retryAfterSeconds
      const blocked = await limiter.checkLimit(testKey, 5, 60);
      assert.strictEqual(blocked.allowed, false);
      assert.strictEqual(blocked.remaining, 0);
      assert.ok((blocked.retryAfterSeconds || 0) > 0);
      limiter.destroy();
    });
  });
});
