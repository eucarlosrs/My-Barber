import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  authoritativeCancelSubscription,
  reconcileSubscriptionWithMercadoPago
} from '../server/subscriptionReconciliationService.js';
import { applyPreapprovalSyncToSubscription, DurableSubscriptionRecord } from '../server/webhookService.js';

/**
 * FASE 3.5F — Testes de Eliminação de Fallback em RAM e Soberania do Firestore em Cancel / Sync / Reconcile
 * 
 * Classificação dos Testes:
 * - Testes 1 a 15 e Teste de Preservação: UNIT & MOCK (Harness com injeção de dependência e repositório simulado)
 * - Teste 16: STATIC (Inspeção estática do código-fonte em server.ts para banimento de fallbacks de RAM)
 */
describe('FASE 3.5F — Soberania do Firestore e Eliminação de Fallbacks em RAM (Cancel / Sync / Reconcile)', () => {
  const tenantId = 'tenant-sovereign-01';

  const baseSub: DurableSubscriptionRecord = {
    id: `sub-${tenantId}`,
    barbershopId: tenantId,
    barbershopName: 'Barbearia Soberana',
    payerEmail: 'owner@soberana.com',
    mercadopagoSubscriptionId: 'mp-sub-sov-1',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    cardValidated: true,
    plan: 'Plano Pro',
    currentPrice: 79.90,
    paidBillingCount: 2,
    isInTrial: false,
    lastApprovedPaymentAt: '2026-08-15T12:00:00Z',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-08-15T12:00:00Z'
  };

  // =========================================================================
  // TESTE 1: RAM ACTIVE + Firestore PAST_DUE -> POST cancel usa PAST_DUE
  // =========================================================================
  it('TESTE 1: RAM ACTIVE + Firestore PAST_DUE -> POST cancel usa PAST_DUE do Firestore', async () => {
    const memoryCache = new Map<string, any>([[tenantId, { ...baseSub, status: 'ACTIVE' }]]);
    const firestoreSub = { ...baseSub, status: 'PAST_DUE' as const, pastDueSince: '2026-09-01T00:00:00Z' };

    let capturedInTx: any = null;
    const result = await authoritativeCancelSubscription({
      barbershopId: tenantId,
      memoryCache,
      firestoreGetter: async () => ({ exists: true, data: firestoreSub }),
      firestoreTransactionRunner: async (updateFn) => {
        capturedInTx = updateFn(firestoreSub);
        return capturedInTx;
      }
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.status, 'CANCELED');
    assert.strictEqual(capturedInTx.pastDueSince, '2026-09-01T00:00:00Z', 'Deve preservar os metadados de PAST_DUE lidos do Firestore');
    assert.strictEqual(memoryCache.get(tenantId).status, 'CANCELED', 'Cache de RAM deve ser atualizado como espelho');
  });

  // =========================================================================
  // TESTE 2: RAM PAST_DUE + Firestore ACTIVE -> POST cancel usa ACTIVE
  // =========================================================================
  it('TESTE 2: RAM PAST_DUE + Firestore ACTIVE -> POST cancel usa ACTIVE do Firestore', async () => {
    const memoryCache = new Map<string, any>([[tenantId, { ...baseSub, status: 'PAST_DUE' }]]);
    const firestoreSub = { ...baseSub, status: 'ACTIVE' as const };

    let capturedInTx: any = null;
    const result = await authoritativeCancelSubscription({
      barbershopId: tenantId,
      memoryCache,
      firestoreGetter: async () => ({ exists: true, data: firestoreSub }),
      firestoreTransactionRunner: async (updateFn) => {
        capturedInTx = updateFn(firestoreSub);
        return capturedInTx;
      }
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.status, 'CANCELED');
    assert.strictEqual(capturedInTx.status, 'CANCELED');
    assert.strictEqual(memoryCache.get(tenantId).status, 'CANCELED');
  });

  // =========================================================================
  // TESTE 3: RAM ACTIVE + Firestore CANCELED -> POST cancel respeita CANCELED
  // =========================================================================
  it('TESTE 3: RAM ACTIVE + Firestore CANCELED -> POST cancel respeita CANCELED terminal', async () => {
    const memoryCache = new Map<string, any>([[tenantId, { ...baseSub, status: 'ACTIVE' }]]);
    const firestoreSub = { ...baseSub, status: 'CANCELED' as const, canceledAt: '2026-09-10T00:00:00Z' };

    let gwCalled = false;
    const result = await authoritativeCancelSubscription({
      barbershopId: tenantId,
      memoryCache,
      firestoreGetter: async () => ({ exists: true, data: firestoreSub }),
      gatewayCanceler: async () => { gwCalled = true; }
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.status, 'CANCELED');
    assert.strictEqual(result.message, 'Assinatura já se encontra cancelada.');
    assert.strictEqual(gwCalled, false, 'Não deve chamar gateway desnecessariamente se já cancelado');
    assert.strictEqual(memoryCache.get(tenantId).status, 'CANCELED');
  });

  // =========================================================================
  // TESTE 4: RAM CANCELED + Firestore ACTIVE -> POST cancel usa ACTIVE do Firestore
  // =========================================================================
  it('TESTE 4: RAM CANCELED + Firestore ACTIVE -> POST cancel usa ACTIVE do Firestore e cancela gateway', async () => {
    const memoryCache = new Map<string, any>([[tenantId, { ...baseSub, status: 'CANCELED' }]]);
    const firestoreSub = { ...baseSub, status: 'ACTIVE' as const };

    let gwCalledWith: string | null = null;
    const result = await authoritativeCancelSubscription({
      barbershopId: tenantId,
      memoryCache,
      firestoreGetter: async () => ({ exists: true, data: firestoreSub }),
      gatewayCanceler: async (id) => { gwCalledWith = id; },
      firestoreTransactionRunner: async (updateFn) => updateFn(firestoreSub)
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(gwCalledWith, 'mp-sub-sov-1', 'Deve ter cancelado no gateway com o contrato ativo do Firestore');
    assert.strictEqual(result.subscription.status, 'CANCELED');
  });

  // =========================================================================
  // TESTE 5: Firestore indisponível + RAM ACTIVE -> HTTP 503 (sem fallback)
  // =========================================================================
  it('TESTE 5: Firestore indisponível + RAM ACTIVE -> retorna HTTP 503 e NÃO usa RAM', async () => {
    const memoryCache = new Map<string, any>([[tenantId, { ...baseSub, status: 'ACTIVE' }]]);

    let gwCalled = false;
    const result = await authoritativeCancelSubscription({
      barbershopId: tenantId,
      memoryCache,
      firestoreGetter: async () => {
        throw new Error('Firestore connection timeout');
      },
      gatewayCanceler: async () => { gwCalled = true; }
    });

    assert.strictEqual(result.statusCode, 503, 'Deve retornar HTTP 503 fail-closed');
    assert.strictEqual(result.success, false);
    assert.strictEqual(gwCalled, false, 'PROIBIDO chamar gateway baseado em fallback de RAM');
    assert.ok(result.error?.includes('Serviço de banco de dados temporariamente indisponível'));
  });

  // =========================================================================
  // TESTE 6: Firestore indisponível + RAM PAST_DUE -> HTTP 503
  // =========================================================================
  it('TESTE 6: Firestore indisponível + RAM PAST_DUE -> retorna HTTP 503 e cancelamento é abortado', async () => {
    const memoryCache = new Map<string, any>([[tenantId, { ...baseSub, status: 'PAST_DUE' }]]);

    const result = await authoritativeCancelSubscription({
      barbershopId: tenantId,
      memoryCache,
      firestoreGetter: async () => {
        throw new Error('gRPC transport error');
      }
    });

    assert.strictEqual(result.statusCode, 503);
    assert.strictEqual(result.success, false);
  });

  // =========================================================================
  // TESTE 7: Webhook atualiza Firestore com paidBillingCount=2, RAM tem 1 -> cancel NÃO sobrescreve
  // =========================================================================
  it('TESTE 7: Webhook atualiza Firestore com paidBillingCount=2, RAM tem 1 -> cancel NÃO sobrescreve 2 com 1', async () => {
    const memoryCache = new Map<string, any>([[tenantId, { ...baseSub, paidBillingCount: 1 }]]);
    const firestoreSub = { ...baseSub, paidBillingCount: 2 };

    const result = await authoritativeCancelSubscription({
      barbershopId: tenantId,
      memoryCache,
      firestoreGetter: async () => ({ exists: true, data: firestoreSub }),
      firestoreTransactionRunner: async (updateFn) => updateFn(firestoreSub)
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.paidBillingCount, 2, 'paidBillingCount deve permanecer 2');
    assert.strictEqual(memoryCache.get(tenantId).paidBillingCount, 2, 'Cache em RAM deve ser atualizado para 2');
  });

  // =========================================================================
  // TESTE 8: lastApprovedPaymentAt novo no Firestore, RAM tem antigo -> cancel preserva novo
  // =========================================================================
  it('TESTE 8: lastApprovedPaymentAt novo no Firestore -> cancel preserva timestamp novo', async () => {
    const memoryCache = new Map<string, any>([[tenantId, { ...baseSub, lastApprovedPaymentAt: '2026-07-01T00:00:00Z' }]]);
    const firestoreSub = { ...baseSub, lastApprovedPaymentAt: '2026-09-25T14:30:00Z' };

    const result = await authoritativeCancelSubscription({
      barbershopId: tenantId,
      memoryCache,
      firestoreGetter: async () => ({ exists: true, data: firestoreSub }),
      firestoreTransactionRunner: async (updateFn) => updateFn(firestoreSub)
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.lastApprovedPaymentAt, '2026-09-25T14:30:00Z');
  });

  // =========================================================================
  // TESTE 9: SYNC com Firestore indisponível -> HTTP 503 (inspeção do código e lógica)
  // =========================================================================
  it('TESTE 9: SYNC com Firestore indisponível -> aborta como 503 sem usar RAM', () => {
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    const syncRouteIdx = serverCode.indexOf("app.post(\n  '/api/subscriptions/sync/:barbershopId'");
    assert.ok(syncRouteIdx !== -1, 'Rota de sync deve existir');
    const nextRouteIdx = serverCode.indexOf("app.post(\n  '/api/subscriptions/reconcile/:barbershopId'", syncRouteIdx);
    const syncBlock = serverCode.substring(syncRouteIdx, nextRouteIdx);

    // Confirma que catch de Firestore retorna 503 e não subscriptionsDB.get
    assert.strictEqual(
      syncBlock.includes('subscription = subscriptionsDB.get'),
      false,
      'Rota de sync NÃO pode conter fallback subscription = subscriptionsDB.get'
    );
    assert.ok(syncBlock.includes('status(503)'), 'Rota de sync deve retornar 503 em erro de Firestore');
  });

  // =========================================================================
  // TESTE 10: SYNC: Firestore PAST_DUE + preapproval authorized -> continua PAST_DUE
  // =========================================================================
  it('TESTE 10: SYNC: Firestore PAST_DUE + preapproval authorized -> continua PAST_DUE', () => {
    const pastDueSub: DurableSubscriptionRecord = {
      ...baseSub,
      status: 'PAST_DUE',
      pastDueSince: '2026-09-10T00:00:00Z'
    };
    const mpData = {
      id: 'mp-sub-sov-1',
      status: 'authorized',
      reason: 'Plano Pro'
    };

    const syncResult = applyPreapprovalSyncToSubscription(pastDueSub, mpData, '2026-09-26T00:00:00Z');
    assert.strictEqual(syncResult.subscription.status, 'PAST_DUE', 'Preapproval authorized NÃO reativa PAST_DUE');
  });

  // =========================================================================
  // TESTE 11: SYNC: Firestore SUSPENDED + preapproval authorized -> continua SUSPENDED
  // =========================================================================
  it('TESTE 11: SYNC: Firestore SUSPENDED + preapproval authorized -> continua SUSPENDED', () => {
    const suspendedSub: DurableSubscriptionRecord = {
      ...baseSub,
      status: 'SUSPENDED',
      pastDueSince: '2026-08-10T00:00:00Z'
    };
    const mpData = {
      id: 'mp-sub-sov-1',
      status: 'authorized',
      reason: 'Plano Pro'
    };

    const syncResult = applyPreapprovalSyncToSubscription(suspendedSub, mpData, '2026-09-26T00:00:00Z');
    assert.strictEqual(syncResult.subscription.status, 'SUSPENDED', 'Preapproval authorized NÃO reativa SUSPENDED');
  });

  // =========================================================================
  // TESTE 12: SYNC: Firestore CANCELED + preapproval authorized -> continua CANCELED
  // =========================================================================
  it('TESTE 12: SYNC: Firestore CANCELED + preapproval authorized -> continua CANCELED', () => {
    const canceledSub: DurableSubscriptionRecord = {
      ...baseSub,
      status: 'CANCELED',
      canceledAt: '2026-09-01T00:00:00Z'
    };
    const mpData = {
      id: 'mp-sub-sov-1',
      status: 'authorized',
      reason: 'Plano Pro'
    };

    const syncResult = applyPreapprovalSyncToSubscription(canceledSub, mpData, '2026-09-26T00:00:00Z');
    assert.strictEqual(syncResult.subscription.status, 'CANCELED', 'Preapproval authorized NÃO reativa CANCELED');
  });

  // =========================================================================
  // TESTE 13: RECONCILE: Firestore indisponível -> HTTP 503 (inspeção do código e lógica)
  // =========================================================================
  it('TESTE 13: RECONCILE com Firestore indisponível -> aborta como 503 sem usar RAM', () => {
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    const reconRouteIdx = serverCode.indexOf("app.post(\n  '/api/subscriptions/reconcile/:barbershopId'");
    assert.ok(reconRouteIdx !== -1, 'Rota de reconcile deve existir');
    const nextRouteIdx = serverCode.indexOf("app.post('/api/subscriptions/reconcile-payments/:barbershopId'", reconRouteIdx);
    const reconBlock = serverCode.substring(reconRouteIdx, nextRouteIdx);

    // Confirma que não existe fallback para subscriptionsDB.get
    assert.strictEqual(
      reconBlock.includes('subscription = subscriptionsDB.get'),
      false,
      'Rota de reconcile NÃO pode conter fallback subscription = subscriptionsDB.get'
    );
    assert.ok(reconBlock.includes('status(503)'), 'Rota de reconcile deve retornar 503 em erro de Firestore');
  });

  // =========================================================================
  // TESTE 14: RECONCILE: Firestore PAST_DUE -> não reativa somente por preapproval authorized
  // =========================================================================
  it('TESTE 14: RECONCILE: Firestore PAST_DUE -> reconcileSubscriptionWithMercadoPago não reativa PAST_DUE', () => {
    const pastDueSub: any = {
      ...baseSub,
      status: 'PAST_DUE',
      pastDueSince: '2026-09-05T00:00:00Z'
    };
    const mpData = {
      id: 'mp-sub-sov-1',
      status: 'authorized',
      auto_recurring: { transaction_amount: 79.90, currency_id: 'BRL' }
    };

    const res = reconcileSubscriptionWithMercadoPago(pastDueSub, mpData);
    assert.strictEqual(res.reconciledSubscription.status, 'PAST_DUE', 'Contrato preapproval authorized não reativa PAST_DUE');
  });

  // =========================================================================
  // TESTE 15: RECONCILE: Firestore CANCELED -> não reativa
  // =========================================================================
  it('TESTE 15: RECONCILE: Firestore CANCELED -> reconcileSubscriptionWithMercadoPago não reativa CANCELED', () => {
    const canceledSub: any = {
      ...baseSub,
      status: 'CANCELED',
      canceledAt: '2026-09-01T00:00:00Z'
    };
    const mpData = {
      id: 'mp-sub-sov-1',
      status: 'authorized',
      auto_recurring: { transaction_amount: 79.90, currency_id: 'BRL' }
    };

    const res = reconcileSubscriptionWithMercadoPago(canceledSub, mpData);
    assert.strictEqual(res.reconciledSubscription.status, 'CANCELED', 'Contrato preapproval authorized não reativa CANCELED');
  });

  // =========================================================================
  // TESTE 16: Nenhum caminho financeiro de cancel/sync/reconcile utiliza subscriptionsDB como autoridade
  // =========================================================================
  it('TESTE 16: server.ts não utiliza subscriptionsDB como autoridade em cancel, sync e reconcile', () => {
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

    // POST /cancel
    const cancelIdx = serverCode.indexOf("app.post(\n  '/api/subscriptions/cancel'");
    const nextAfterCancel = serverCode.indexOf("app.post(\n  '/api/subscriptions/sync/:barbershopId'", cancelIdx);
    const cancelBlock = serverCode.substring(cancelIdx, nextAfterCancel);
    assert.strictEqual(cancelBlock.includes('let subscription = subscriptionsDB.get'), false, 'cancel NÃO pode ler RAM como autoridade');
    assert.ok(cancelBlock.includes('authoritativeCancelSubscription'), 'cancel deve delegar para authoritativeCancelSubscription');

    // POST /sync
    const syncIdx = serverCode.indexOf("app.post(\n  '/api/subscriptions/sync/:barbershopId'");
    const nextAfterSync = serverCode.indexOf("app.post(\n  '/api/subscriptions/reconcile/:barbershopId'", syncIdx);
    const syncBlock = serverCode.substring(syncIdx, nextAfterSync);
    assert.strictEqual(syncBlock.includes('subscriptionsDB.get'), false, 'sync NÃO pode ter fallback para subscriptionsDB.get');

    // POST /reconcile
    const reconIdx = serverCode.indexOf("app.post(\n  '/api/subscriptions/reconcile/:barbershopId'");
    const nextAfterRecon = serverCode.indexOf("app.post('/api/subscriptions/reconcile-payments/:barbershopId'", reconIdx);
    const reconBlock = serverCode.substring(reconIdx, nextAfterRecon);
    assert.strictEqual(reconBlock.includes('subscriptionsDB.get'), false, 'reconcile NÃO pode ter fallback para subscriptionsDB.get');
  });

  // =========================================================================
  // TESTE DE PRESERVAÇÃO FINANCEIRA (REQUISITO 10)
  // =========================================================================
  it('TESTE DE PRESERVAÇÃO FINANCEIRA: Cancel com Firestore atualizado e RAM antiga não corrompe dados financeiros', async () => {
    // Firestore antes do cancel:
    // status = ACTIVE, paidBillingCount = 5, lastApprovedPaymentAt = "2026-09-01T10:00:00Z", currentPrice = 79.90
    const firestoreSub: DurableSubscriptionRecord = {
      ...baseSub,
      status: 'ACTIVE',
      paidBillingCount: 5,
      lastApprovedPaymentAt: '2026-09-01T10:00:00Z',
      currentPrice: 79.90
    };

    // RAM defasada (Instância A com cópia antiga de 1 mês atrás):
    // status = ACTIVE, paidBillingCount = 4, lastApprovedPaymentAt = "2026-08-01T10:00:00Z", currentPrice = 49.90
    const staleMemoryCache = new Map<string, any>([
      [
        tenantId,
        {
          ...baseSub,
          status: 'ACTIVE',
          paidBillingCount: 4,
          lastApprovedPaymentAt: '2026-08-01T10:00:00Z',
          currentPrice: 49.90
        }
      ]
    ]);

    let persistedRecord: any = null;
    const result = await authoritativeCancelSubscription({
      barbershopId: tenantId,
      reason: 'Mudança de endereço',
      memoryCache: staleMemoryCache,
      firestoreGetter: async () => ({ exists: true, data: firestoreSub }),
      firestoreTransactionRunner: async (updateFn) => {
        persistedRecord = updateFn(firestoreSub);
        return persistedRecord;
      }
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.status, 'CANCELED');
    assert.strictEqual(result.subscription.paidBillingCount, 5, 'paidBillingCount deve ser 5 (do Firestore), NUNCA 4 da RAM');
    assert.strictEqual(result.subscription.lastApprovedPaymentAt, '2026-09-01T10:00:00Z', 'lastApprovedPaymentAt deve ser 2026-09-01, NUNCA 2026-08-01 da RAM');
    assert.strictEqual(result.subscription.currentPrice, 79.90, 'currentPrice deve ser 79.90, NUNCA 49.90 da RAM');
    assert.strictEqual(result.subscription.cancellationReason, 'Mudança de endereço');

    // Valida também o cache espelhado
    const cacheAfter = staleMemoryCache.get(tenantId);
    assert.strictEqual(cacheAfter.status, 'CANCELED');
    assert.strictEqual(cacheAfter.paidBillingCount, 5);
    assert.strictEqual(cacheAfter.lastApprovedPaymentAt, '2026-09-01T10:00:00Z');
    assert.strictEqual(cacheAfter.currentPrice, 79.90);
  });
});
