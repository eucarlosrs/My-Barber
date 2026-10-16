import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getAuthoritativeSubscriptionStatus
} from '../server/subscriptionReconciliationService.js';
import { DurableSubscriptionRecord } from '../server/webhookService.js';

/**
 * FASE 3.5D — Testes de Autoridade Financeira Soberana no Status da Assinatura
 * 
 * Classificação dos Testes:
 * - Cenários A a G: UNIT & MOCK (Testes comportamentais em memória com injeção de dependência e simulação estrita de instâncias)
 * - Cenário H: STATIC (Auditoria estática de código-fonte no server.ts para eliminação de precedência de RAM)
 */
describe('FASE 3.5D — Resolução P1: Firestore como Autoridade Única do Status da Assinatura', () => {

  const tenantId = 'tenant-auth-test-01';

  const sampleActiveSub: DurableSubscriptionRecord = {
    id: `sub-${tenantId}`,
    barbershopId: tenantId,
    barbershopName: 'Barbearia Autoridade',
    payerEmail: 'owner@autoridade.com',
    mercadopagoSubscriptionId: 'mp-sub-auth-1',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    cardValidated: true,
    plan: 'Plano Pro',
    currentPrice: 79.90,
    paidBillingCount: 2,
    isInTrial: false,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z'
  };

  const samplePastDueSub: DurableSubscriptionRecord = {
    ...sampleActiveSub,
    status: 'PAST_DUE',
    pastDueSince: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z'
  };

  const sampleCanceledSub: DurableSubscriptionRecord = {
    ...sampleActiveSub,
    status: 'CANCELED',
    canceledAt: '2026-09-22T00:00:00Z',
    updatedAt: '2026-09-22T00:00:00Z'
  };

  // =========================================================================
  // CENÁRIO A: RAM = ACTIVE | FIRESTORE = PAST_DUE -> RETORNA PAST_DUE
  // =========================================================================
  it('Cenário A: subscriptionsDB possui ACTIVE e Firestore possui PAST_DUE -> retorna PAST_DUE', async () => {
    const memoryCache = new Map<string, any>([
      [tenantId, { ...sampleActiveSub }]
    ]);

    const result = await getAuthoritativeSubscriptionStatus({
      barbershopId: tenantId,
      memoryCache,
      nowMs: new Date('2026-09-22T00:00:00Z').getTime(), // 2 dias após pastDueSince (dentro da tolerância de 7 dias)
      paymentsGetter: async () => [],
      firestoreGetter: async () => ({
        exists: true,
        data: samplePastDueSub
      })
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.status, 'PAST_DUE', 'Deve refletir a autoridade do Firestore (PAST_DUE), ignorando o ACTIVE em cache');
    assert.strictEqual(memoryCache.get(tenantId).status, 'PAST_DUE', 'Cache em memória deve ser sincronizado com o Firestore');
  });

  // =========================================================================
  // CENÁRIO B: RAM = PAST_DUE | FIRESTORE = ACTIVE -> RETORNA ACTIVE
  // =========================================================================
  it('Cenário B: subscriptionsDB possui PAST_DUE e Firestore possui ACTIVE -> retorna ACTIVE', async () => {
    const memoryCache = new Map<string, any>([
      [tenantId, { ...samplePastDueSub }]
    ]);

    const result = await getAuthoritativeSubscriptionStatus({
      barbershopId: tenantId,
      memoryCache,
      paymentsGetter: async () => [],
      firestoreGetter: async () => ({
        exists: true,
        data: sampleActiveSub
      })
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.status, 'ACTIVE', 'Deve refletir a autoridade do Firestore (ACTIVE), ignorando o PAST_DUE obsoleto em cache');
    assert.strictEqual(memoryCache.get(tenantId).status, 'ACTIVE', 'Cache em memória deve ser atualizado para ACTIVE');
  });

  // =========================================================================
  // CENÁRIO C: RAM = ACTIVE | FIRESTORE = CANCELED -> RETORNA CANCELED
  // =========================================================================
  it('Cenário C: subscriptionsDB possui ACTIVE e Firestore possui CANCELED -> retorna CANCELED', async () => {
    const memoryCache = new Map<string, any>([
      [tenantId, { ...sampleActiveSub }]
    ]);

    const result = await getAuthoritativeSubscriptionStatus({
      barbershopId: tenantId,
      memoryCache,
      paymentsGetter: async () => [],
      firestoreGetter: async () => ({
        exists: true,
        data: sampleCanceledSub
      })
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.status, 'CANCELED', 'Deve refletir a autoridade terminal do Firestore (CANCELED)');
    assert.strictEqual(memoryCache.get(tenantId).status, 'CANCELED', 'Cache em memória deve ser atualizado para CANCELED');
  });

  // =========================================================================
  // CENÁRIO D: FIRESTORE INDISPONÍVEL -> FAIL-CLOSED (HTTP 503, SEM USAR CACHE)
  // =========================================================================
  it('Cenário D: subscriptionsDB possui estado antigo e Firestore está indisponível -> HTTP 503 fail-closed', async () => {
    const memoryCache = new Map<string, any>([
      [tenantId, { ...sampleActiveSub }]
    ]);

    const result = await getAuthoritativeSubscriptionStatus({
      barbershopId: tenantId,
      memoryCache,
      firestoreGetter: async () => {
        throw new Error('Unavailable: Firestore transport connection dropped');
      }
    });

    assert.strictEqual(result.statusCode, 503, 'Deve retornar HTTP 503 em falha de Firestore');
    assert.ok(result.error?.includes('Serviço de banco de dados temporariamente indisponível'));
    assert.strictEqual(result.subscription, undefined, 'PROIBIDO retornar assinatura antiga da RAM em indisponibilidade');
  });

  // =========================================================================
  // CENÁRIO E: RAM VAZIA | FIRESTORE POSSUI ASSINATURA -> RETORNA FIRESTORE
  // =========================================================================
  it('Cenário E: subscriptionsDB vazio e Firestore possui assinatura -> retorna dados do Firestore e popula cache', async () => {
    const memoryCache = new Map<string, any>();

    const result = await getAuthoritativeSubscriptionStatus({
      barbershopId: tenantId,
      memoryCache,
      paymentsGetter: async () => [],
      firestoreGetter: async () => ({
        exists: true,
        data: sampleActiveSub
      })
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.subscription.status, 'ACTIVE');
    assert.strictEqual(memoryCache.get(tenantId)?.status, 'ACTIVE', 'Deve ter populado o cache em RAM após consulta soberana');
  });

  // =========================================================================
  // CENÁRIO F: DUAS INSTÂNCIAS COM CACHES DIVERGENTES -> AMBAS RETORNAM ACTIVE
  // =========================================================================
  it('Cenário F: Instância A (PAST_DUE) e Instância B (ACTIVE) com Firestore (ACTIVE) -> ambas retornam ACTIVE', async () => {
    const instanceACache = new Map<string, any>([[tenantId, { ...samplePastDueSub }]]);
    const instanceBCache = new Map<string, any>([[tenantId, { ...sampleActiveSub }]]);

    const sharedFirestoreGetter = async () => ({
      exists: true,
      data: sampleActiveSub
    });

    const resA = await getAuthoritativeSubscriptionStatus({
      barbershopId: tenantId,
      memoryCache: instanceACache,
      paymentsGetter: async () => [],
      firestoreGetter: sharedFirestoreGetter
    });

    const resB = await getAuthoritativeSubscriptionStatus({
      barbershopId: tenantId,
      memoryCache: instanceBCache,
      paymentsGetter: async () => [],
      firestoreGetter: sharedFirestoreGetter
    });

    assert.strictEqual(resA.subscription.status, 'ACTIVE', 'Instância A deve responder ACTIVE consultando Firestore');
    assert.strictEqual(resB.subscription.status, 'ACTIVE', 'Instância B deve responder ACTIVE consultando Firestore');
    assert.strictEqual(instanceACache.get(tenantId).status, 'ACTIVE', 'Instância A teve seu cache defasado corrigido');
  });

  // =========================================================================
  // CENÁRIO G: MUTAÇÃO NO FIRESTORE ENTRE DUAS CHAMADAS (SEM RESTART)
  // =========================================================================
  it('Cenário G: mutação no Firestore entre chamadas reflete imediatamente sem requerer restart', async () => {
    const memoryCache = new Map<string, any>();
    let firestoreState: DurableSubscriptionRecord = { ...samplePastDueSub };

    const dynamicGetter = async () => ({
      exists: true,
      data: firestoreState
    });

    // 1ª Chamada: Firestore está PAST_DUE
    const firstCall = await getAuthoritativeSubscriptionStatus({
      barbershopId: tenantId,
      memoryCache,
      nowMs: new Date('2026-09-22T00:00:00Z').getTime(), // dentro da tolerância de 7 dias
      paymentsGetter: async () => [],
      firestoreGetter: dynamicGetter
    });
    assert.strictEqual(firstCall.subscription.status, 'PAST_DUE');

    // Mutação remota no Firestore (ex: webhook processado em outro container)
    firestoreState = { ...sampleActiveSub };

    // 2ª Chamada: mesmo processo, sem restart
    const secondCall = await getAuthoritativeSubscriptionStatus({
      barbershopId: tenantId,
      memoryCache,
      paymentsGetter: async () => [],
      firestoreGetter: dynamicGetter
    });
    assert.strictEqual(secondCall.subscription.status, 'ACTIVE', 'Segunda chamada deve refletir imediatamente a mutação do Firestore sem restart');
  });

  // =========================================================================
  // CENÁRIO H: AUDITORIA ESTÁTICA EM server.ts (ZERO PRECEDÊNCIA DE RAM)
  // =========================================================================
  it('Cenário H: server.ts não faz subscriptionsDB.get antes de consultar Firestore no endpoint de status', () => {
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

    // Localiza o bloco da rota GET /api/subscriptions/status/:barbershopId
    const routeIndex = serverCode.indexOf("app.get(\n  '/api/subscriptions/status/:barbershopId'");
    assert.ok(routeIndex !== -1, 'Rota GET /api/subscriptions/status/:barbershopId deve existir no server.ts');

    const nextRouteIndex = serverCode.indexOf("app.get('/api/subscriptions/all'", routeIndex);
    const routeBlock = serverCode.substring(routeIndex, nextRouteIndex !== -1 ? nextRouteIndex : routeIndex + 800);

    // Confirma que NÃO existe let subscription = subscriptionsDB.get(...)
    assert.strictEqual(
      routeBlock.includes('let subscription = subscriptionsDB.get'),
      false,
      'server.ts NÃO pode atribuir subscription a partir de subscriptionsDB.get antes do Firestore'
    );

    // Confirma que chama getAuthoritativeSubscriptionStatus
    assert.ok(
      routeBlock.includes('getAuthoritativeSubscriptionStatus'),
      'server.ts deve delegar para getAuthoritativeSubscriptionStatus'
    );
  });
});
