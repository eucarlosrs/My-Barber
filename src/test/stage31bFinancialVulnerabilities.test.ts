import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  recordDurablePaymentTransaction,
  DurableSubscriptionRecord,
  DurablePaymentRecord
} from '../server/webhookService.js';
import {
  evaluateTenantSubscriptionStatus,
  assertTenantSubscriptionActive,
  SubscriptionEnforcementError
} from '../server/subscriptionEnforcement.js';

describe('MY BARBER — FASE 3.1B: Correções das Vulnerabilidades Financeiras P1/P2', () => {
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  const webhookServicePath = path.resolve(process.cwd(), 'src/server/webhookService.ts');
  const webhookServiceContent = fs.readFileSync(webhookServicePath, 'utf8');

  const enforcementPath = path.resolve(process.cwd(), 'src/server/subscriptionEnforcement.ts');
  const enforcementContent = fs.readFileSync(enforcementPath, 'utf8');

  const teamControllerPath = path.resolve(process.cwd(), 'src/server/teamController.ts');
  const teamControllerContent = fs.readFileSync(teamControllerPath, 'utf8');

  const bookingControllerPath = path.resolve(process.cwd(), 'src/server/bookingController.ts');
  const bookingControllerContent = fs.readFileSync(bookingControllerPath, 'utf8');

  // =========================================================================
  // 1. INDEPENDÊNCIA DE MEMÓRIA & AUTORIDADE DO FIRESTORE (P1-01)
  // =========================================================================
  describe('1. P1-01: Independência de subscriptionsDB e autoridade Firestore no Webhook', () => {
    it('server.ts consulta o Firestore diretamente para localizar a assinatura no webhook de pagamento', () => {
      assert.ok(
        serverContent.includes("firestore.collection('subscriptions').doc(`sub-${externalRef}`).get()"),
        'server.ts DEVE consultar a coleção subscriptions no Firestore antes de processar o webhook'
      );
    });

    it('server.ts rejeita evento com HTTP 404 se a assinatura não existir no Firestore', () => {
      assert.ok(
        serverContent.includes('Assinatura sub-') && serverContent.includes('não encontrada no Firestore'),
        'server.ts DEVE falhar de forma fechada (404) quando assinatura não existe'
      );
    });

    it('recordDurablePaymentTransaction busca e persiste no Firestore sem depender de memória global', () => {
      assert.ok(
        webhookServiceContent.includes('transaction.get(subRef)'),
        'recordDurablePaymentTransaction DEVE ler do Firestore dentro da transação atômica'
      );
      assert.ok(
        webhookServiceContent.includes('transaction.set(subRef'),
        'recordDurablePaymentTransaction DEVE persistir a assinatura no Firestore dentro da transação'
      );
    });
  });

  // =========================================================================
  // 2. ASSINATURA CANCELED — ESTADO TERMINAL (P1-02)
  // =========================================================================
  describe('2. P1-02: Assinatura CANCELED é estado terminal e não é reativada por pagamentos atrasados', () => {
    it('webhookService impede reativação de assinatura CANCELED em pagamentos aprovados atrasados', () => {
      assert.ok(
        webhookServiceContent.includes("currentSub.status === 'CANCELED'"),
        'webhookService DEVE checar se o status atual é CANCELED'
      );
      assert.ok(
        webhookServiceContent.includes("sem reativação implícita") || webhookServiceContent.includes("status = 'CANCELED'"),
        'webhookService DEVE registrar que pagamentos tardios não ressuscitam assinatura CANCELED'
      );
    });

    it('server.ts no preapproval authorized não reativa assinatura CANCELED', () => {
      assert.ok(
        serverContent.includes("if (sub.status !== 'CANCELED')"),
        'server.ts DEVE proteger preapproval de sobrescrever assinatura CANCELED'
      );
    });

    it('endpoint sync não reativa assinatura CANCELED para ACTIVE', () => {
      assert.ok(
        serverContent.includes("if (subscription.status !== 'CANCELED')"),
        'sync endpoint DEVE preservar o estado terminal CANCELED'
      );
    });
  });

  // =========================================================================
  // 3. ENFORCEMENT REAL DE ACESSO (P1-03)
  // =========================================================================
  describe('3. P1-03: Enforcement centralizado e bloqueio operacional em inadimplência/cancelamento', () => {
    it('evaluateTenantSubscriptionStatus valida corretamente status permitidos e bloqueados', () => {
      // Ativa
      assert.strictEqual(
        evaluateTenantSubscriptionStatus({ status: 'ACTIVE', paidBillingCount: 1 } as any).allowed,
        true
      );
      // Trial de 14 dias
      assert.strictEqual(
        evaluateTenantSubscriptionStatus({ status: 'TRIAL_14_DAYS', paidBillingCount: 0 } as any).allowed,
        true
      );
      // Cancelada -> Bloqueada
      const canceledEval = evaluateTenantSubscriptionStatus({ status: 'CANCELED' } as any);
      assert.strictEqual(canceledEval.allowed, false);
      assert.strictEqual(canceledEval.statusCode, 403);
      assert.strictEqual(canceledEval.reason, 'CANCELED');

      // Suspensa -> Bloqueada
      const suspendedEval = evaluateTenantSubscriptionStatus({ status: 'SUSPENDED' } as any);
      assert.strictEqual(suspendedEval.allowed, false);
      assert.strictEqual(suspendedEval.statusCode, 402);
      assert.strictEqual(suspendedEval.reason, 'SUSPENDED');

      // Sem assinatura -> Bloqueada
      const nullEval = evaluateTenantSubscriptionStatus(null);
      assert.strictEqual(nullEval.allowed, false);
      assert.strictEqual(nullEval.statusCode, 402);
      assert.strictEqual(nullEval.reason, 'NO_SUBSCRIPTION');
    });

    it('evaluateTenantSubscriptionStatus concede carência de 7 dias para PAST_DUE e bloqueia após expiração', () => {
      const recentPastDue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const withinGrace = evaluateTenantSubscriptionStatus({
        status: 'PAST_DUE',
        pastDueSince: recentPastDue,
        toleranceDays: 7
      } as any);
      assert.strictEqual(withinGrace.allowed, true);

      const expiredPastDue = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const outsideGrace = evaluateTenantSubscriptionStatus({
        status: 'PAST_DUE',
        pastDueSince: expiredPastDue,
        toleranceDays: 7
      } as any);
      assert.strictEqual(outsideGrace.allowed, false);
      assert.strictEqual(outsideGrace.statusCode, 402);
      assert.strictEqual(outsideGrace.reason, 'PAST_DUE_EXPIRED');
    });

    it('teamController invoca assertTenantSubscriptionActive antes de criar profissional', () => {
      assert.ok(
        teamControllerContent.includes('assertTenantSubscriptionActive('),
        'teamController DEVE chamar assertTenantSubscriptionActive'
      );
      assert.ok(
        teamControllerContent.includes('TENANT_SUBSCRIPTION_SUSPENDED') || teamControllerContent.includes("subCheck.status === 'SUSPENDED'"),
        'teamController DEVE tratar status SUSPENDED/CANCELED'
      );
    });

    it('bookingController invoca assertTenantSubscriptionActive antes de agendar', () => {
      assert.ok(
        bookingControllerContent.includes('assertTenantSubscriptionActive('),
        'bookingController DEVE chamar assertTenantSubscriptionActive'
      );
      assert.ok(
        bookingControllerContent.includes('TENANT_SUBSCRIPTION_SUSPENDED'),
        'bookingController DEVE bloquear com TENANT_SUBSCRIPTION_SUSPENDED'
      );
    });
  });

  // =========================================================================
  // 4. PREVENÇÃO DE RACE CONDITION NA CRIAÇÃO DE ASSINATURA (P2-04)
  // =========================================================================
  describe('4. P2-04: Transação atômica de reserva contra concorrência em POST /api/subscriptions/create', () => {
    it('server.ts utiliza transação atômica no Firestore para subscription_creations lock', () => {
      assert.ok(
        serverContent.includes("firestore.collection('subscription_creations').doc(`create-${barbershopId}`)"),
        'server.ts DEVE gerenciar lock atômico em subscription_creations'
      );
      assert.ok(
        serverContent.includes('reservation.status === \'LOCKED\''),
        'server.ts DEVE retornar HTTP 409 quando lock concorrente está ativo'
      );
      assert.ok(
        serverContent.includes('reservation.status === \'ALREADY_EXISTS\''),
        'server.ts DEVE retornar HTTP 409 se já existir assinatura ativa'
      );
    });
  });

  // =========================================================================
  // 5. VALIDAÇÃO ESTRITA DE PLANOS (P2-05)
  // =========================================================================
  describe('5. P2-05: Rejeição de planos INACTIVE e inexistentes (sem fallback silencioso)', () => {
    it('server.ts rejeita plano inexistente com HTTP 400 sem fallback silencioso para PLANO_UNICO', () => {
      assert.ok(
        serverContent.includes("error: `Plano '${requestedPlanId}' não encontrado. Selecione um plano válido existente.`"),
        'server.ts DEVE retornar HTTP 400 informando que o plano solicitado não foi encontrado'
      );
    });

    it('server.ts rejeita plano INACTIVE com HTTP 409', () => {
      assert.ok(
        serverContent.includes("status !== 'ACTIVE'"),
        'server.ts DEVE verificar se o plano está ACTIVE'
      );
      assert.ok(
        serverContent.includes('está inativo e não pode ser contratado'),
        'server.ts DEVE retornar erro claro para plano inativo'
      );
    });
  });

  // =========================================================================
  // 6. TRATAMENTO DE REFUND & CHARGEBACK (P2-06)
  // =========================================================================
  describe('6. P2-06: Suporte a eventos de estorno e contestação (REFUNDED / CHARGED_BACK)', () => {
    it('DurablePaymentRecord e DurableSubscriptionRecord aceitam REFUNDED e CHARGED_BACK', () => {
      assert.ok(
        webhookServiceContent.includes("'REFUNDED'"),
        'webhookService DEVE aceitar status REFUNDED'
      );
      assert.ok(
        webhookServiceContent.includes("'CHARGED_BACK'"),
        'webhookService DEVE aceitar status CHARGED_BACK'
      );
    });

    it('recordDurablePaymentTransaction transita assinatura para PAST_DUE / SUSPENDED mediante estorno', () => {
      assert.ok(
        webhookServiceContent.includes("params.status === 'REFUNDED' || params.status === 'CHARGED_BACK'"),
        'recordDurablePaymentTransaction DEVE tratar explicitamente estornos'
      );
      assert.ok(
        webhookServiceContent.includes("currentSub.status = params.status === 'CHARGED_BACK' ? 'SUSPENDED' : 'PAST_DUE'"),
        'recordDurablePaymentTransaction DEVE alterar status da assinatura para PAST_DUE ou SUSPENDED'
      );
    });

    it('server.ts encaminha eventos refunded e charged_back para recordDurablePaymentTransaction', () => {
      assert.ok(
        serverContent.includes("status === 'refunded' || status === 'charged_back'"),
        'server.ts DEVE interceptar status refunded e charged_back'
      );
    });
  });

  // =========================================================================
  // 7. PROTEÇÃO CONTRA EVENTOS FORA DE ORDEM (P2-07)
  // =========================================================================
  describe('7. P2-07: Proteção contra eventos fora de ordem que poderiam retroceder assinatura', () => {
    it('recordDurablePaymentTransaction compara timestamps e impede que REJECTED antigo degrade assinatura ACTIVE', () => {
      assert.ok(
        webhookServiceContent.includes('isOldRejectedEvent'),
        'webhookService DEVE verificar se o evento rejeitado é mais antigo que o pagamento aprovado'
      );
      assert.ok(
        webhookServiceContent.includes('!isOldRejectedEvent'),
        'webhookService DEVE ignorar eventos rejeitados anacrônicos'
      );
    });
  });

  // =========================================================================
  // 8. FAIL-CLOSED NO PROCESSAMENTO DO MERCADO PAGO
  // =========================================================================
  describe('8. Fail-Closed no Webhook: eliminação de fallbacks arbitrários e aprovação padrão', () => {
    it('server.ts retorna HTTP 503 quando Mercado Pago tem falha de rede ou consulta', () => {
      assert.ok(
        serverContent.includes("res.status(503).json({ error: 'Mercado Pago temporariamente indisponível.' })"),
        'server.ts DEVE falhar de forma fechada (503) em falhas da API externa'
      );
    });

    it('server.ts não assume mais R$ 49.90 como fallback monetário se o valor não estiver presente', () => {
      assert.ok(
        serverContent.includes('rawAmount === undefined || rawAmount === null || isNaN(Number(rawAmount))'),
        'server.ts DEVE validar e rejeitar pagamentos sem valor monetário válido'
      );
      assert.ok(
        serverContent.includes("res.status(422).json({ error: 'Dados financeiros insuficientes para confirmação de pagamento.' })"),
        'server.ts DEVE retornar HTTP 422 em payload com dados incompletos'
      );
    });

    it('server.ts não assume status default "approved" silenciosamente', () => {
      assert.ok(
        !serverContent.includes("const status = paymentData?.status || req.body?.data?.status || 'approved'"),
        'server.ts NÃO PODE mais ter fallback padrão para approved'
      );
    });
  });
});
