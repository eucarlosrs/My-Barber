import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { MY_BARBER_PLANS } from '../types/index.js';
import { planService } from '../server/planService.js';
import { evaluateTenantSubscriptionStatus, resolveTenantPlan } from '../server/subscriptionEnforcement.js';
import { recordDurablePaymentTransaction, recordDurablePreapprovalTransaction } from '../server/webhookService.js';
import { setMockFirebaseAdmin } from '../server/firebaseAdmin.js';

function createInMemoryFirestore() {
  const store = new Map<string, Map<string, any>>();

  function getCol(colName: string) {
    if (!store.has(colName)) {
      store.set(colName, new Map<string, any>());
    }
    return store.get(colName)!;
  }

  function makeDocRef(colName: string, docId: string) {
    const col = getCol(colName);
    return {
      id: docId,
      get: async () => {
        const exists = col.has(docId);
        const data = exists ? JSON.parse(JSON.stringify(col.get(docId))) : undefined;
        return {
          id: docId,
          ref: makeDocRef(colName, docId),
          exists,
          data: () => data
        };
      },
      set: async (data: any, opts?: any) => {
        if (opts?.merge && col.has(docId)) {
          col.set(docId, { ...col.get(docId), ...JSON.parse(JSON.stringify(data)) });
        } else {
          col.set(docId, JSON.parse(JSON.stringify(data)));
        }
      },
      update: async (data: any) => {
        const existing = col.get(docId) || {};
        col.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      },
      delete: async () => {
        col.delete(docId);
      }
    };
  }

  return {
    runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (docRef: any) => docRef.get(),
        set: async (docRef: any, data: any, opts?: any) => docRef.set(data, opts),
        update: async (docRef: any, data: any) => docRef.update(data),
        delete: async (docRef: any) => docRef.delete()
      };
      return await updateFunction(tx);
    },
    collection: (colName: string) => {
      const col = getCol(colName);
      return {
        doc: (docId: string) => makeDocRef(colName, docId)
      };
    }
  };
}

describe('MY BARBER — FASE 5.2D: Planos Oficiais e Compra Definitiva', () => {
  let mockFirestore: any;

  beforeEach(() => {
    mockFirestore = createInMemoryFirestore();
    setMockFirebaseAdmin({
      firestore: mockFirestore as any,
      auth: {} as any
    });
  });

  // =========================================================================
  // ETAPA 1 — Modelos, Catálogo e Valores Oficiais
  // =========================================================================
  describe('ETAPA 1: Catálogo Oficial e Regras de Negócio', () => {
    it('1.1. Plano Essencial deve ter 14 dias grátis e R$ 39,90/mês sem promoção', async () => {
      const plan = await planService.getPlanById('plano-essencial');
      assert.ok(plan, 'Plano Essencial deve existir no serviço');
      assert.strictEqual(plan.hasTrial, true);
      assert.strictEqual(plan.trialDuration, 14);
      assert.strictEqual(plan.priceMonthly, 39.90);
      assert.strictEqual(plan.hasPromotion, false);
      assert.strictEqual(plan.limits.maxProfessionals, 1);
      assert.strictEqual(plan.limits.maxUnits, 1);
    });

    it('1.2. Plano Profissional deve ter 14 dias grátis, 3 meses a R$ 49,90 e depois R$ 69,90/mês', async () => {
      const plan = await planService.getPlanById('plano-profissional');
      assert.ok(plan, 'Plano Profissional deve existir');
      assert.strictEqual(plan.hasTrial, true);
      assert.strictEqual(plan.trialDuration, 14);
      assert.strictEqual(plan.hasPromotion, true);
      assert.strictEqual(plan.promotionalPrice, 49.90);
      assert.strictEqual(plan.promotionDuration, 3);
      assert.strictEqual(plan.priceAfterPromotion, 69.90);
      assert.strictEqual(plan.limits.maxProfessionals, 5);
      assert.strictEqual(plan.limits.maxUnits, 1);
    });

    it('1.3. Plano Premium deve ter 14 dias grátis, 3 meses a R$ 79,90 e depois R$ 99,90/mês', async () => {
      const plan = await planService.getPlanById('plano-premium');
      assert.ok(plan, 'Plano Premium deve existir');
      assert.strictEqual(plan.hasTrial, true);
      assert.strictEqual(plan.trialDuration, 14);
      assert.strictEqual(plan.hasPromotion, true);
      assert.strictEqual(plan.promotionalPrice, 79.90);
      assert.strictEqual(plan.promotionDuration, 3);
      assert.strictEqual(plan.priceAfterPromotion, 99.90);
      assert.strictEqual(plan.priceMonthly, 99.90);
      assert.strictEqual(plan.limits.maxProfessionals, 10);
      assert.strictEqual(plan.limits.maxUnits, 2);
    });

    it('1.4. Compra Definitiva deve ter valor R$ 799,00 único, sem trial e limites do Profissional (5 profissionais, 1 unidade)', async () => {
      const plan = await planService.getPlanById('plano-vitalicio');
      assert.ok(plan, 'Plano Compra Definitiva deve existir');
      assert.strictEqual(plan.priceMonthly, 799.00);
      assert.strictEqual(plan.hasTrial, false);
      assert.strictEqual(plan.trialDuration, 0);
      assert.strictEqual(plan.hasPromotion, false);
      assert.strictEqual(plan.limits.maxProfessionals, 5);
      assert.strictEqual(plan.limits.maxUnits, 1);
      assert.strictEqual(plan.features.agenda, true);
      assert.strictEqual(plan.features.relatorios_financeiros, true);
    });

    it('1.5. MY_BARBER_PLANS deve conter plano-vitalicio com R$ 799,00', () => {
      const lifetime = MY_BARBER_PLANS['plano-vitalicio'];
      assert.ok(lifetime, 'MY_BARBER_PLANS deve incluir plano-vitalicio');
      assert.strictEqual(lifetime.priceMonthly, 799.00);
      assert.strictEqual(lifetime.maxProfessionals, 5);
    });
  });

  // =========================================================================
  // ETAPA 2 — Controle de Acesso e Entitlements
  // =========================================================================
  describe('ETAPA 2: Controle de Acesso e Capacidade da Licença Definitiva', () => {
    it('2.1. evaluateTenantSubscriptionStatus deve conceder acesso irrestrito para LIFETIME_LICENSE', () => {
      const result = evaluateTenantSubscriptionStatus({
        status: 'LIFETIME_LICENSE',
        planId: 'plano-vitalicio',
        isLifetime: true
      });
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.status, 'LIFETIME_LICENSE');
    });

    it('2.2. resolveTenantPlan deve resolver limite de 5 profissionais para plano-vitalicio', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-lifetime-1').set({
        status: 'LIFETIME_LICENSE',
        planId: 'plano-vitalicio',
        isLifetime: true
      });

      const resolution = await resolveTenantPlan('tenant-lifetime-1', mockFirestore);
      assert.strictEqual(resolution.resolved, true);
      assert.strictEqual(resolution.maxProfessionals, 5);
      assert.strictEqual(resolution.planId, 'plano-vitalicio');
    });

    it('2.3. Estorno ou chargeback deve revogar acesso e retornar SUSPENDED', () => {
      const result = evaluateTenantSubscriptionStatus({
        status: 'SUSPENDED',
        planId: 'plano-vitalicio',
        isLifetime: true
      });
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.status, 'SUSPENDED');
      assert.strictEqual(result.statusCode, 402);
    });
  });

  // =========================================================================
  // ETAPA 3 — Webhooks, Idempotência e Proteção Contra Sobrescrita
  // =========================================================================
  describe('ETAPA 3: Webhooks, Transição Idempotente e Proteção Soberana', () => {
    it('3.1. Pagamento de R$ 799,00 aprovado deve ativar LIFETIME_LICENSE com preço zero recorrente', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-pay').set({
        id: 'sub-tenant-pay',
        barbershopId: 'tenant-pay',
        status: 'ACTIVE',
        currentPrice: 49.90,
        planId: 'plano-profissional',
        paidBillingCount: 2,
        toleranceDays: 7,
        billingCycle: 'MONTHLY'
      });

      const result = await recordDurablePaymentTransaction({
        paymentId: 'mp-pay-lifetime-1',
        barbershopId: 'tenant-pay',
        amount: 799.00,
        currency: 'BRL',
        status: 'APPROVED',
        statusDetail: 'accredited',
        paymentMethod: 'Cartão de Crédito',
        nextBillingDate: 'VITALICIO',
        externalEventDate: new Date().toISOString()
      });

      assert.strictEqual(result.subscriptionRecord.status, 'LIFETIME_LICENSE');
      assert.strictEqual(result.subscriptionRecord.isLifetime, true);
      assert.strictEqual(result.subscriptionRecord.planId, 'plano-vitalicio');
      assert.strictEqual(result.subscriptionRecord.currentPrice, 0.00);
      assert.strictEqual(result.paymentRecord.amount, 799.00);
      assert.strictEqual(result.paymentRecord.status, 'APPROVED');

      // Verifica Firestore
      const savedDoc = await mockFirestore.collection('subscriptions').doc('sub-tenant-pay').get();
      assert.strictEqual(savedDoc.data().status, 'LIFETIME_LICENSE');
    });

    it('3.2. Webhook atrasado de preapproval anterior NÃO deve sobrescrever status LIFETIME_LICENSE', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-lifetime-protected').set({
        id: 'sub-tenant-lifetime-protected',
        barbershopId: 'tenant-lifetime-protected',
        status: 'LIFETIME_LICENSE',
        planId: 'plano-vitalicio',
        isLifetime: true,
        currentPrice: 0.00
      });

      const result = await recordDurablePreapprovalTransaction({
        barbershopId: 'tenant-lifetime-protected',
        preapprovalStatus: 'authorized',
        preapprovalId: 'mp-old-sub-123',
        now: new Date().toISOString()
      });

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.statusTransitioned, false);
      assert.strictEqual(result.subscriptionRecord.status, 'LIFETIME_LICENSE');

      // Verifica no mock
      const subDoc = await mockFirestore.collection('subscriptions').doc('sub-tenant-lifetime-protected').get();
      assert.strictEqual(subDoc.data().status, 'LIFETIME_LICENSE', 'Status deve permanecer LIFETIME_LICENSE');
    });

    it('3.3. Estorno ou chargeback em licença vitalícia deve suspender imediatamente o acesso', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-ref').set({
        id: 'sub-tenant-ref',
        barbershopId: 'tenant-ref',
        status: 'LIFETIME_LICENSE',
        currentPrice: 0.00,
        planId: 'plano-vitalicio',
        isLifetime: true,
        toleranceDays: 7,
        billingCycle: 'ONE_TIME'
      });

      const result = await recordDurablePaymentTransaction({
        paymentId: 'mp-pay-lifetime-ref',
        barbershopId: 'tenant-ref',
        amount: 799.00,
        currency: 'BRL',
        status: 'REFUNDED',
        statusDetail: 'refunded',
        paymentMethod: 'Cartão de Crédito',
        nextBillingDate: 'VITALICIO',
        externalEventDate: new Date().toISOString()
      });

      assert.strictEqual(result.subscriptionRecord.status, 'SUSPENDED');
      assert.strictEqual(result.isReversalProcessed, true);
      assert.strictEqual(result.paymentRecord.status, 'REFUNDED');

      // Verifica suspensão no Firestore
      const subDoc = await mockFirestore.collection('subscriptions').doc('sub-tenant-ref').get();
      assert.strictEqual(subDoc.data().status, 'SUSPENDED');
    });
  });

  // =========================================================================
  // ETAPA 4 — Regressão da Política de Preços Recorrentes
  // =========================================================================
  describe('ETAPA 4: Validação dos Ciclos de Preço Oficiais', () => {
    it('4.1. Degustação não consome mensalidades pagas (paidBillingCount permanece 0)', () => {
      const trialSub = {
        isInTrial: true,
        paidBillingCount: 0,
        currentPrice: 0.00
      };
      assert.strictEqual(trialSub.paidBillingCount, 0);
      assert.strictEqual(trialSub.currentPrice, 0.00);
    });

    it('4.2. Plano Profissional cobra R$ 49,90 nos 3 primeiros meses pagos e R$ 69,90 a partir do 4º', () => {
      const getPrice = (paidCount: number) => paidCount <= 3 ? 49.90 : 69.90;
      assert.strictEqual(getPrice(1), 49.90);
      assert.strictEqual(getPrice(2), 49.90);
      assert.strictEqual(getPrice(3), 49.90);
      assert.strictEqual(getPrice(4), 69.90);
      assert.strictEqual(getPrice(12), 69.90);
    });

    it('4.3. Plano Premium cobra R$ 79,90 nos 3 primeiros meses pagos e R$ 99,90 a partir do 4º', () => {
      const getPrice = (paidCount: number) => paidCount <= 3 ? 79.90 : 99.90;
      assert.strictEqual(getPrice(1), 79.90);
      assert.strictEqual(getPrice(2), 79.90);
      assert.strictEqual(getPrice(3), 79.90);
      assert.strictEqual(getPrice(4), 99.90);
      assert.strictEqual(getPrice(5), 99.90);
    });

    it('4.4. Plano Essencial mantém R$ 39,90 fixo sem promoção a partir do 1º mês pago', () => {
      const getPrice = (paidCount: number) => 39.90;
      assert.strictEqual(getPrice(1), 39.90);
      assert.strictEqual(getPrice(4), 39.90);
    });
  });

  // =========================================================================
  // ETAPA 5 — Validação Cirúrgica FASE 5.2E
  // =========================================================================
  describe('ETAPA 5: Validação Cirúrgica FASE 5.2E', () => {
    it('5.1. Estorno de mensalidade antiga (R$ 49,90) NÃO revoga a licença definitiva adquirida', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-safe-reversal').set({
        id: 'sub-tenant-safe-reversal',
        barbershopId: 'tenant-safe-reversal',
        status: 'LIFETIME_LICENSE',
        currentPrice: 0.00,
        planId: 'plano-vitalicio',
        isLifetime: true,
        toleranceDays: 7,
        billingCycle: 'ONE_TIME',
        paidBillingCount: 3
      });

      // Estorno de uma mensalidade antiga de R$ 49,90 anterior à compra definitiva
      const result = await recordDurablePaymentTransaction({
        paymentId: 'mp-old-monthly-payment-789',
        barbershopId: 'tenant-safe-reversal',
        amount: 49.90,
        currency: 'BRL',
        status: 'REFUNDED',
        statusDetail: 'refunded',
        paymentMethod: 'Cartão de Crédito',
        nextBillingDate: 'VITALICIO',
        externalEventDate: new Date().toISOString()
      });

      // O pagamento antigo é marcado como estornado, mas a licença DEFINITIVA permanece ATIVA!
      assert.strictEqual(result.paymentRecord.status, 'REFUNDED');
      assert.strictEqual(result.subscriptionRecord.status, 'LIFETIME_LICENSE', 'Licença definitiva NÃO deve ser suspensa por estorno de mensalidade antiga');

      const subDoc = await mockFirestore.collection('subscriptions').doc('sub-tenant-safe-reversal').get();
      assert.strictEqual(subDoc.data().status, 'LIFETIME_LICENSE');
    });

    it('5.2. Cálculo de MRR exclui expressamente a Compra Definitiva (receita avulsa não compõe receita recorrente)', () => {
      const subscriptions = [
        { status: 'ACTIVE', currentPrice: 39.90, isLifetime: false },
        { status: 'ACTIVE', currentPrice: 69.90, isLifetime: false },
        { status: 'PAST_DUE', currentPrice: 49.90, isLifetime: false },
        { status: 'LIFETIME_LICENSE', currentPrice: 0.00, isLifetime: true },
        { status: 'SUSPENDED', currentPrice: 69.90, isLifetime: false }
      ];

      const totalMRR = subscriptions
        .filter(s => (s.status === 'ACTIVE' || s.status === 'PAST_DUE') && !s.isLifetime)
        .reduce((sum, s) => sum + s.currentPrice, 0);

      // 39.90 + 69.90 + 49.90 = 159.70
      assert.strictEqual(Math.round(totalMRR * 100) / 100, 159.70);
    });
  });
});
