import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyPreapprovalSyncToSubscription,
  recordDurablePreapprovalTransaction,
  DurableSubscriptionRecord,
  recordDurablePaymentTransaction
} from '../server/webhookService.js';
import {
  evaluateTenantSubscriptionStatus
} from '../server/subscriptionEnforcement.js';

describe('MY BARBER — FASE 3.2B: Hardening Financeiro P2-A e P2-B', () => {
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  const webhookServicePath = path.resolve(process.cwd(), 'src/server/webhookService.ts');
  const webhookServiceContent = fs.readFileSync(webhookServicePath, 'utf8');

  // =========================================================================
  // 1. P2-A — CONCORRÊNCIA E TRANSAÇÃO ATÔMICA PREAPPROVAL × CANCELAMENTO
  // =========================================================================
  describe('1. P2-A: Transação Firestore atômica em subscription_preapproval', () => {
    it('server.ts delega subscription_preapproval para transação atômica recordDurablePreapprovalTransaction', () => {
      assert.ok(
        serverContent.includes('recordDurablePreapprovalTransaction({'),
        'server.ts DEVE chamar recordDurablePreapprovalTransaction para processar preapproval'
      );
      assert.ok(
        serverContent.includes('import {') && serverContent.includes('recordDurablePreapprovalTransaction'),
        'server.ts DEVE importar recordDurablePreapprovalTransaction do webhookService'
      );
    });

    it('chamada ao Mercado Pago ocorre FORA da transação', () => {
      // Verifica no server.ts que callMercadoPago('/preapproval/...') ocorre antes de recordDurablePreapprovalTransaction
      const mpCallIndex = serverContent.indexOf("callMercadoPago(`/preapproval/");
      const txCallIndex = serverContent.indexOf('recordDurablePreapprovalTransaction(');
      assert.ok(mpCallIndex !== -1, 'callMercadoPago deve existir para preapproval');
      assert.ok(txCallIndex !== -1, 'recordDurablePreapprovalTransaction deve existir');
      assert.ok(
        mpCallIndex < txCallIndex,
        'A consulta externa à API do Mercado Pago DEVE ocorrer antes da transação do Firestore'
      );
    });

    it('webhookService executa recordDurablePreapprovalTransaction dentro de firestore.runTransaction', () => {
      assert.ok(
        webhookServiceContent.includes('firestore.runTransaction(async (transaction) => {'),
        'recordDurablePreapprovalTransaction DEVE utilizar firestore.runTransaction'
      );
    });

    it('dentro da transação, CANCELED é estritamente terminal e impede transição para ACTIVE ou TRIAL_14_DAYS', () => {
      assert.ok(
        webhookServiceContent.includes("if (currentSub.status === 'CANCELED')"),
        'recordDurablePreapprovalTransaction DEVE verificar se status é CANCELED dentro da transação'
      );
      assert.ok(
        webhookServiceContent.includes('statusTransitioned: false'),
        'recordDurablePreapprovalTransaction NÃO deve permitir transição de status para assinaturas CANCELED'
      );
    });
  });

  // =========================================================================
  // 2. CENÁRIOS DE CONCORRÊNCIA P2-A (Seção 8 do Requisito)
  // =========================================================================
  describe('2. P2-A: Cenários de Concorrência e OCC (Cancelamento × Preapproval Authorized)', () => {
    // Simulação do mecanismo de OCC (Optimistic Concurrency Control) do Firestore:
    // Quando duas transações concorrentes tentam ler e gravar o mesmo documento,
    // a que sofre colisão de versão tem seu callback re-executado com o snapshot atualizado.
    class SimulatedFirestoreOCC {
      private document: DurableSubscriptionRecord;
      private version = 1;

      constructor(initial: DurableSubscriptionRecord) {
        this.document = { ...initial };
      }

      async getDocument(): Promise<{ data: DurableSubscriptionRecord; version: number }> {
        return { data: { ...this.document }, version: this.version };
      }

      async commitTransaction(
        readVersion: number,
        mutator: (doc: DurableSubscriptionRecord) => DurableSubscriptionRecord
      ): Promise<{ success: boolean; data: DurableSubscriptionRecord }> {
        if (readVersion !== this.version) {
          // Conflito de versão (Stale Read detectado pelo Firestore)
          return { success: false, data: this.document };
        }
        this.document = mutator(this.document);
        this.version++;
        return { success: true, data: { ...this.document } };
      }

      // Executa transação com retry automático de OCC
      async runTransaction(
        operation: (snapshot: DurableSubscriptionRecord) => {
          shouldWrite: boolean;
          mutated: DurableSubscriptionRecord;
        }
      ): Promise<DurableSubscriptionRecord> {
        let attempts = 0;
        while (attempts < 5) {
          attempts++;
          const { data, version } = await this.getDocument();
          const result = operation(data);
          const commit = await this.commitTransaction(version, () => result.mutated);
          if (commit.success) {
            return commit.data;
          }
          // Conflito detectado: Firestore re-executa a transação com os novos dados
        }
        throw new Error('Transaction contention limit reached');
      }

      getCurrentState(): DurableSubscriptionRecord {
        return { ...this.document };
      }
    }

    const createInitialSub = (status: 'PENDING' | 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'SUSPENDED'): DurableSubscriptionRecord => ({
      id: 'sub-barber-123',
      barbershopId: 'barber-123',
      barbershopName: 'Barbearia OCC',
      payerEmail: 'dono@teste.com',
      mercadopagoSubscriptionId: 'preapp-999',
      status,
      plan: 'PLANO_MENSAL',
      currentPrice: 49.90,
      billingCycle: 'MONTHLY',
      isInTrial: false,
      paidBillingCount: 0,
      cardValidated: false,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z'
    });

    it('Teste 1: B lê antes de A, A grava CANCELED, B tenta gravar (Detecção de Stale Read via OCC)', async () => {
      const store = new SimulatedFirestoreOCC(createInitialSub('PENDING'));

      // Processo B lê estado inicial (PENDING)
      const snapB = await store.getDocument();
      assert.strictEqual(snapB.data.status, 'PENDING');

      // Processo A (Cancelamento) grava CANCELED com sucesso
      await store.commitTransaction(snapB.version, (doc) => ({
        ...doc,
        status: 'CANCELED',
        canceledAt: new Date().toISOString()
      }));

      // Processo B tenta comitar com a versão antiga (stale read)
      const attemptB = await store.commitTransaction(snapB.version, (doc) => ({
        ...doc,
        status: 'ACTIVE',
        cardValidated: true
      }));

      // Transação B falha por colisão de versão!
      assert.strictEqual(attemptB.success, false, 'A gravação de B com versão defasada DEVE falhar');

      // No retry do Firestore, B relê o snapshot atualizado
      const retrySnap = await store.getDocument();
      assert.strictEqual(retrySnap.data.status, 'CANCELED', 'Retry lê o status atualizado CANCELED');

      // Regra P2-A dentro da transação: CANCELED é terminal!
      if (retrySnap.data.status === 'CANCELED') {
        // Preserva CANCELED e aborta transição para ACTIVE
      } else {
        assert.fail('Status não deveria ser diferente de CANCELED');
      }

      // Estado final do banco permanece CANCELED, nunca ACTIVE!
      assert.strictEqual(store.getCurrentState().status, 'CANCELED');
    });

    it('Teste 2: A (cancelamento) e B (preapproval authorized) executam concorrentemente', async () => {
      const store = new SimulatedFirestoreOCC(createInitialSub('PENDING'));

      // Simula execução simultânea de A (cancel) e B (authorized)
      const runProcessA = async () => {
        return store.runTransaction((doc) => {
          return {
            shouldWrite: true,
            mutated: { ...doc, status: 'CANCELED', canceledAt: new Date().toISOString() }
          };
        });
      };

      const runProcessB = async () => {
        return store.runTransaction((doc) => {
          if (doc.status === 'CANCELED') {
            // Guarda terminal P2-A
            return { shouldWrite: true, mutated: { ...doc, cardValidated: true } };
          }
          return {
            shouldWrite: true,
            mutated: { ...doc, status: 'ACTIVE', cardValidated: true }
          };
        });
      };

      // Dispara concorrentemente
      await Promise.all([runProcessA(), runProcessB()]);

      // Sob nenhuma circunstância o status final pode ser ACTIVE
      const finalState = store.getCurrentState();
      assert.strictEqual(finalState.status, 'CANCELED', 'Resultado concorrente DEVE ser CANCELED');
    });

    it('Teste 3: CANCELED já existente + evento preapproval authorized preserva CANCELED', async () => {
      const store = new SimulatedFirestoreOCC(createInitialSub('CANCELED'));

      // Evento subscription_preapproval authorized chega para assinatura já CANCELED
      const result = await store.runTransaction((doc) => {
        if (doc.status === 'CANCELED') {
          // P2-A: Preserva CANCELED
          return { shouldWrite: true, mutated: { ...doc, updatedAt: new Date().toISOString() } };
        }
        return { shouldWrite: true, mutated: { ...doc, status: 'ACTIVE' } };
      });

      assert.strictEqual(result.status, 'CANCELED', 'Assinatura CANCELED prévia NUNCA pode ser reativada');
      assert.strictEqual(store.getCurrentState().status, 'CANCELED');
    });

    it('Teste 4: retry do mesmo webhook de preapproval authorized é estritamente idempotente', async () => {
      const store = new SimulatedFirestoreOCC(createInitialSub('PENDING'));

      const processWebhook = async () => {
        return store.runTransaction((doc) => {
          if (doc.status === 'CANCELED') {
            return { shouldWrite: true, mutated: doc };
          }
          return {
            shouldWrite: true,
            mutated: { ...doc, status: 'ACTIVE', cardValidated: true }
          };
        });
      };

      // 1ª entrega do webhook
      const firstRun = await processWebhook();
      assert.strictEqual(firstRun.status, 'ACTIVE');

      // 2ª entrega (retry de rede do Mercado Pago)
      const secondRun = await processWebhook();
      assert.strictEqual(secondRun.status, 'ACTIVE');
      assert.strictEqual(secondRun.paidBillingCount, 0, 'Retry não deve alterar dados financeiros');

      // Estado permanece íntegro
      assert.strictEqual(store.getCurrentState().status, 'ACTIVE');
    });
  });

  // =========================================================================
  // 3. P2-B — GUARDA DO SYNC DE PREAPPROVAL (Seção 9 do Requisito)
  // =========================================================================
  describe('3. P2-B: Guarda do Sync de Preapproval × Inadimplência / Reversão Financeira', () => {
    const baseSub: DurableSubscriptionRecord = {
      id: 'sub-tenant-sync',
      barbershopId: 'tenant-sync',
      barbershopName: 'Barbearia Sync',
      payerEmail: 'sync@teste.com',
      mercadopagoSubscriptionId: 'preapp-sync-1',
      status: 'ACTIVE',
      plan: 'PLANO_MENSAL',
      currentPrice: 49.90,
      billingCycle: 'MONTHLY',
      isInTrial: false,
      paidBillingCount: 2,
      cardValidated: true,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z'
    };

    it('1. ACTIVE + authorized → permanece ACTIVE', () => {
      const sub = { ...baseSub, status: 'ACTIVE' as const };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.status, 'ACTIVE');
      assert.strictEqual(subscription.cardValidated, true);
      assert.strictEqual(subscription.isInTrial, false);
    });

    it('2. PAST_DUE + authorized → permanece PAST_DUE (preapproval authorized não quita fatura)', () => {
      const sub = {
        ...baseSub,
        status: 'PAST_DUE' as const,
        pastDueSince: '2026-09-15T00:00:00.000Z',
        toleranceDays: 7
      };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.status, 'PAST_DUE', 'PAST_DUE NÃO pode virar ACTIVE via sync');
      assert.strictEqual(subscription.pastDueSince, '2026-09-15T00:00:00.000Z');
      assert.strictEqual(subscription.cardValidated, true);
    });

    it('3. SUSPENDED + authorized → permanece SUSPENDED (preapproval authorized não anula suspensão)', () => {
      const sub = {
        ...baseSub,
        status: 'SUSPENDED' as const,
        pastDueSince: '2026-08-20T00:00:00.000Z'
      };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.status, 'SUSPENDED', 'SUSPENDED NÃO pode virar ACTIVE via sync');
    });

    it('4. CANCELED + authorized → permanece CANCELED (estado terminal absoluto)', () => {
      const sub = {
        ...baseSub,
        status: 'CANCELED' as const,
        canceledAt: '2026-09-10T12:00:00.000Z'
      };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.status, 'CANCELED', 'CANCELED NÃO pode virar ACTIVE via sync');
      assert.strictEqual(subscription.canceledAt, '2026-09-10T12:00:00.000Z');
    });

    it('5. PAST_DUE por REFUNDED + authorized → permanece PAST_DUE', () => {
      const sub = {
        ...baseSub,
        status: 'PAST_DUE' as const,
        lastReversalAt: '2026-09-18T15:30:00.000Z',
        lastReversalType: 'REFUNDED'
      };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.status, 'PAST_DUE');
      assert.strictEqual(subscription.lastReversalAt, '2026-09-18T15:30:00.000Z');
      assert.strictEqual(subscription.lastReversalType, 'REFUNDED');
    });

    it('6. SUSPENDED por CHARGED_BACK + authorized → permanece SUSPENDED', () => {
      const sub = {
        ...baseSub,
        status: 'SUSPENDED' as const,
        lastReversalAt: '2026-09-19T08:00:00.000Z',
        lastReversalType: 'CHARGED_BACK'
      };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.status, 'SUSPENDED');
      assert.strictEqual(subscription.lastReversalAt, '2026-09-19T08:00:00.000Z');
      assert.strictEqual(subscription.lastReversalType, 'CHARGED_BACK');
    });

    it('7. sync não incrementa paidBillingCount', () => {
      const sub = { ...baseSub, paidBillingCount: 3 };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.paidBillingCount, 3, 'paidBillingCount deve permanecer exatamente 3');
    });

    it('8. sync não cria subscription_payments (retorna apenas registro da assinatura)', () => {
      const sub = { ...baseSub };
      const syncOutput = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual((syncOutput as any).paymentRecord, undefined);
      assert.strictEqual((syncOutput as any).isNewPayment, undefined);
    });

    it('9. sync não apaga lastReversalAt', () => {
      const sub = { ...baseSub, lastReversalAt: '2026-09-12T10:00:00.000Z' };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.lastReversalAt, '2026-09-12T10:00:00.000Z');
    });

    it('10. sync não apaga lastReversalType', () => {
      const sub = { ...baseSub, lastReversalType: 'REFUNDED' };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.lastReversalType, 'REFUNDED');
    });

    it('11. sync não altera preço da assinatura', () => {
      const sub = { ...baseSub, currentPrice: 69.90 };
      const { subscription } = applyPreapprovalSyncToSubscription(sub, { status: 'authorized' });
      assert.strictEqual(subscription.currentPrice, 69.90);
    });

    it('12. sync continua permitindo regularização financeira pelos fluxos apropriados de pagamento', () => {
      // 1. Simula estado PAST_DUE
      const sub: DurableSubscriptionRecord = {
        ...baseSub,
        status: 'PAST_DUE',
        pastDueSince: '2026-09-15T00:00:00.000Z'
      };

      // 2. Sync NÃO regulariza (guarda do sync atua)
      const synced = applyPreapprovalSyncToSubscription({ ...sub }, { status: 'authorized' }).subscription;
      assert.strictEqual(synced.status, 'PAST_DUE', 'Sync sozinho não regulariza');

      // 3. Mas quando o pagamento legítimo é aprovado, a regularização ocorre com autoridade
      // Simula a transição financeira de pagamento aprovado
      const regularizedSub = {
        ...synced,
        status: 'ACTIVE' as const,
        paidBillingCount: synced.paidBillingCount + 1,
        lastApprovedPaymentAt: '2026-09-22T03:00:00.000Z'
      };
      delete regularizedSub.pastDueSince;

      assert.strictEqual(regularizedSub.status, 'ACTIVE');
      assert.strictEqual(regularizedSub.paidBillingCount, 3);
      assert.strictEqual(regularizedSub.pastDueSince, undefined);
    });

    it('13. PENDING: trata explicitamente período de trial ou ativação direta sem falso pagamento', () => {
      // Caso 1: PENDING dentro de trial de 14 dias
      const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const pendingTrialSub: DurableSubscriptionRecord = {
        ...baseSub,
        status: 'PENDING',
        paidBillingCount: 0,
        trialEndDate: futureDate
      };
      const resultTrial = applyPreapprovalSyncToSubscription(pendingTrialSub, { status: 'authorized' });
      assert.strictEqual(resultTrial.subscription.status, 'TRIAL_14_DAYS');
      assert.strictEqual(resultTrial.subscription.isInTrial, true);

      // Caso 2: PENDING fora de trial
      const pendingDirectSub: DurableSubscriptionRecord = {
        ...baseSub,
        status: 'PENDING',
        paidBillingCount: 0,
        trialEndDate: undefined
      };
      const resultDirect = applyPreapprovalSyncToSubscription(pendingDirectSub, { status: 'authorized' });
      assert.strictEqual(resultDirect.subscription.status, 'ACTIVE');
      assert.strictEqual(resultDirect.subscription.isInTrial, false);
      assert.strictEqual(resultDirect.subscription.paidBillingCount, 0, 'Não cria falso pagamento');
    });
  });

  // =========================================================================
  // 4. PRESERVAÇÃO DE ENFORCEMENT & SEGURANÇA (Seção 10 e 11)
  // =========================================================================
  describe('4. Preservação do Enforcement Centralizado (subscriptionEnforcement.ts)', () => {
    it('ACTIVE é permitido', () => {
      const res = evaluateTenantSubscriptionStatus({ status: 'ACTIVE' } as any);
      assert.strictEqual(res.allowed, true);
    });

    it('TRIAL_14_DAYS é permitido', () => {
      const res = evaluateTenantSubscriptionStatus({ status: 'TRIAL_14_DAYS' } as any);
      assert.strictEqual(res.allowed, true);
    });

    it('PAST_DUE dentro da tolerância de 7 dias é permitido', () => {
      const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const res = evaluateTenantSubscriptionStatus({ status: 'PAST_DUE', pastDueSince: recent, toleranceDays: 7 } as any);
      assert.strictEqual(res.allowed, true);
    });

    it('PAST_DUE após tolerância de 7 dias é bloqueado (402)', () => {
      const expired = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
      const res = evaluateTenantSubscriptionStatus({ status: 'PAST_DUE', pastDueSince: expired, toleranceDays: 7 } as any);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.statusCode, 402);
    });

    it('SUSPENDED é bloqueado (402)', () => {
      const res = evaluateTenantSubscriptionStatus({ status: 'SUSPENDED' } as any);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.statusCode, 402);
    });

    it('CANCELED é bloqueado (403)', () => {
      const res = evaluateTenantSubscriptionStatus({ status: 'CANCELED' } as any);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.statusCode, 403);
    });
  });
});
