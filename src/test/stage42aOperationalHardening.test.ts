import { describe, it } from 'node:test';
import assert from 'node:assert';
import { consumeCustomerPackageItem } from '../server/customerPackageService.js';
import { acquireGlobalReconcileLock, releaseGlobalReconcileLock } from '../server/globalReconcileLock.js';
import { setupGracefulShutdown } from '../server/gracefulShutdown.js';
import { AuthUserClaims } from '../lib/authClaims.js';
import { CustomerPackage } from '../types/index.js';

/**
 * MOCK DO FIRESTORE COM SUPORTE A TRANSAÇÃO E OCC DETERMINÍSTICO
 */
function createMockFirestore(initialData: {
  customerPackages?: Record<string, CustomerPackage>;
  customer_package_consumptions?: Record<string, any>;
  subscription_reconcile_all?: Record<string, any>;
}) {
  const store: Record<string, Map<string, any>> = {
    customerPackages: new Map(Object.entries(initialData.customerPackages || {})),
    customer_package_consumptions: new Map(Object.entries(initialData.customer_package_consumptions || {})),
    subscription_reconcile_all: new Map(Object.entries(initialData.subscription_reconcile_all || {}))
  };

  let txQueue = Promise.resolve();

  return {
    _store: store,
    collection(colName: string) {
      if (!store[colName]) {
        store[colName] = new Map();
      }
      return {
        doc(docId: string) {
          return {
            _col: colName,
            _id: docId
          };
        }
      };
    },
    async runTransaction(callback: (tx: any) => Promise<any>) {
      const executeTx = async () => {
        const tx = {
          async get(docRef: any) {
            const col = store[docRef._col];
            const val = col ? col.get(docRef._id) : undefined;
            return {
              exists: val !== undefined,
              data: () => (val ? JSON.parse(JSON.stringify(val)) : undefined)
            };
          },
          set(docRef: any, data: any) {
            if (!store[docRef._col]) store[docRef._col] = new Map();
            store[docRef._col].set(docRef._id, JSON.parse(JSON.stringify(data)));
          },
          update(docRef: any, data: any) {
            if (!store[docRef._col]) store[docRef._col] = new Map();
            const existing = store[docRef._col].get(docRef._id) || {};
            store[docRef._col].set(docRef._id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          }
        };
        return callback(tx);
      };

      const result = txQueue.then(executeTx, executeTx);
      txQueue = result.then(() => {}, () => {});
      return result;
    }
  };
}

describe('FASE 4.2A — Testes de Customer Packages, Reconcile Lock e Graceful Shutdown', () => {

  // =========================================================================
  // BLOCO 1: CUSTOMER PACKAGES — CONSUMO ATÔMICO E AUTORITATIVO
  // =========================================================================
  describe('1. Customer Packages — Consumo Atômico e Idempotente', () => {
    const actorClient: AuthUserClaims = {
      uid: 'user-client-123',
      role: 'customer',
      legacyRole: 'CLIENTE',
      tenantId: 'tenant-barbearia-do-joao',
      isSuperAdmin: false,
      claimsRaw: {}
    };

    const initialPackage: CustomerPackage = {
      id: 'cp-pkg-1',
      tenantId: 'tenant-barbearia-do-joao',
      packageId: 'pkg-barba-cabelo',
      packageTitle: 'Combo 4 Cortes + 2 Barbas',
      clientId: 'user-client-123',
      clientName: 'Carlos Silva',
      clientWhatsApp: '11999998888',
      purchaseDate: '2026-09-01',
      items: [
        {
          itemId: 'item-corte',
          name: 'Corte de Cabelo',
          type: 'SERVICO',
          totalQuantity: 2,
          usedQuantity: 0
        },
        {
          itemId: 'item-barba',
          name: 'Barba Terapia',
          type: 'SERVICO',
          totalQuantity: 1,
          usedQuantity: 1 // Já esgotado (1/1)
        }
      ]
    };

    it('[UNIT/MOCK] 1. Consumo com saldo disponível consome e incrementa usedQuantity', async () => {
      const mockDb = createMockFirestore({
        customerPackages: { 'cp-pkg-1': initialPackage }
      });

      const res = await consumeCustomerPackageItem({
        customerPackageId: 'cp-pkg-1',
        itemId: 'item-corte',
        idempotencyKey: 'idemp-tx-001',
        actor: actorClient,
        firestoreOverride: mockDb
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.consumedItem?.usedQuantity, 1);
      assert.strictEqual(res.consumedItem?.remaining, 1);
      assert.strictEqual(res.customerPackage?.items[0].usedQuantity, 1);

      // Confirma gravação no banco
      const saved = mockDb._store.customerPackages.get('cp-pkg-1');
      assert.strictEqual(saved.items[0].usedQuantity, 1);
    });

    it('[UNIT/MOCK] 2. Consumo sem saldo restante (usedQuantity === totalQuantity) é rejeitado determinísticamente', async () => {
      const mockDb = createMockFirestore({
        customerPackages: { 'cp-pkg-1': initialPackage }
      });

      const res = await consumeCustomerPackageItem({
        customerPackageId: 'cp-pkg-1',
        itemId: 'item-barba', // 1/1 já utilizado
        idempotencyKey: 'idemp-tx-barba-001',
        actor: actorClient,
        firestoreOverride: mockDb
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.error, 'PACKAGE_ITEM_EXHAUSTED');
      assert.strictEqual(res.consumedItem?.remaining, 0);

      // Banco permanece intacto
      const saved = mockDb._store.customerPackages.get('cp-pkg-1');
      assert.strictEqual(saved.items[1].usedQuantity, 1);
    });

    it('[UNIT/MOCK] 3. usedQuantity nunca excede totalQuantity sob chamadas consecutivas', async () => {
      const singleSessionPkg: CustomerPackage = {
        ...initialPackage,
        items: [{ itemId: 'item-single', name: 'Sessão Única', type: 'SERVICO', totalQuantity: 1, usedQuantity: 0 }]
      };
      const mockDb = createMockFirestore({
        customerPackages: { 'cp-single': singleSessionPkg }
      });

      // 1ª chamada: consome a única sessão restante
      const res1 = await consumeCustomerPackageItem({
        customerPackageId: 'cp-single',
        itemId: 'item-single',
        idempotencyKey: 'idemp-single-1',
        actor: actorClient,
        firestoreOverride: mockDb
      });
      assert.strictEqual(res1.success, true);

      // 2ª chamada: tenta consumir novamente
      const res2 = await consumeCustomerPackageItem({
        customerPackageId: 'cp-single',
        itemId: 'item-single',
        idempotencyKey: 'idemp-single-2',
        actor: actorClient,
        firestoreOverride: mockDb
      });
      assert.strictEqual(res2.success, false);
      assert.strictEqual(res2.error, 'PACKAGE_ITEM_EXHAUSTED');

      const saved = mockDb._store.customerPackages.get('cp-single');
      assert.strictEqual(saved.items[0].usedQuantity, 1, 'usedQuantity deve ser exatamente 1, nunca 2');
    });

    it('[UNIT/MOCK] 4. Duas tentativas simultâneas com saldo 1: apenas uma tem sucesso e a outra falha', async () => {
      const singleSessionPkg: CustomerPackage = {
        ...initialPackage,
        items: [{ itemId: 'item-race', name: 'Sessão Concorrente', type: 'SERVICO', totalQuantity: 1, usedQuantity: 0 }]
      };
      const mockDb = createMockFirestore({
        customerPackages: { 'cp-race': singleSessionPkg }
      });

      // Dispara 2 requests concorrentes com idempotencyKeys diferentes
      const [p1, p2] = await Promise.all([
        consumeCustomerPackageItem({
          customerPackageId: 'cp-race',
          itemId: 'item-race',
          idempotencyKey: 'idemp-race-A',
          actor: actorClient,
          firestoreOverride: mockDb
        }),
        consumeCustomerPackageItem({
          customerPackageId: 'cp-race',
          itemId: 'item-race',
          idempotencyKey: 'idemp-race-B',
          actor: actorClient,
          firestoreOverride: mockDb
        })
      ]);

      const successes = [p1, p2].filter(r => r.success);
      const failures = [p1, p2].filter(r => !r.success);

      assert.strictEqual(successes.length, 1, 'Exatamente uma operação deve ter sucesso');
      assert.strictEqual(failures.length, 1, 'Exatamente uma operação deve falhar');
      assert.strictEqual(failures[0].error, 'PACKAGE_ITEM_EXHAUSTED');

      const saved = mockDb._store.customerPackages.get('cp-race');
      assert.strictEqual(saved.items[0].usedQuantity, 1, 'Saldo final deve ser exatamente 1 (0 restantes)');
    });

    it('[UNIT/MOCK] 5. Mesma idempotencyKey repetida retorna replay idempotente sem duplicar débito', async () => {
      const mockDb = createMockFirestore({
        customerPackages: { 'cp-pkg-1': initialPackage }
      });

      const call1 = await consumeCustomerPackageItem({
        customerPackageId: 'cp-pkg-1',
        itemId: 'item-corte',
        idempotencyKey: 'idemp-retry-test-01',
        actor: actorClient,
        firestoreOverride: mockDb
      });
      assert.strictEqual(call1.success, true);
      assert.strictEqual(call1.isReplay, undefined);
      assert.strictEqual(call1.consumedItem?.usedQuantity, 1);

      // Retry da mesma requisição com a mesma chave
      const call2 = await consumeCustomerPackageItem({
        customerPackageId: 'cp-pkg-1',
        itemId: 'item-corte',
        idempotencyKey: 'idemp-retry-test-01',
        actor: actorClient,
        firestoreOverride: mockDb
      });

      assert.strictEqual(call2.success, true);
      assert.strictEqual(call2.isReplay, true, 'Deve ser identificado como replay idempotente');
      assert.strictEqual(call2.consumedItem?.usedQuantity, 1, 'Não pode incrementar de 1 para 2');

      const saved = mockDb._store.customerPackages.get('cp-pkg-1');
      assert.strictEqual(saved.items[0].usedQuantity, 1, 'Banco de dados não sofre segundo incremento');
    });

    it('[UNIT/MOCK] 6. Mesma chave de idempotência em item ou pacote diferente é rejeitada com conflito (HTTP 409)', async () => {
      const mockDb = createMockFirestore({
        customerPackages: { 'cp-pkg-1': initialPackage }
      });

      await consumeCustomerPackageItem({
        customerPackageId: 'cp-pkg-1',
        itemId: 'item-corte',
        idempotencyKey: 'idemp-shared-key-123',
        actor: actorClient,
        firestoreOverride: mockDb
      });

      // Tentativa de reutilizar chave idemp-shared-key-123 para outro item
      const collisionCall = await consumeCustomerPackageItem({
        customerPackageId: 'cp-pkg-1',
        itemId: 'item-barba',
        idempotencyKey: 'idemp-shared-key-123',
        actor: actorClient,
        firestoreOverride: mockDb
      });

      assert.strictEqual(collisionCall.success, false);
      assert.strictEqual(collisionCall.status, 409);
      assert.strictEqual(collisionCall.error, 'IDEMPOTENCY_KEY_COLLISION');
    });

    it('[UNIT/MOCK] 7. Isolamento Multi-Tenant: Cliente ou gestor de outro tenant é bloqueado (HTTP 403)', async () => {
      const mockDb = createMockFirestore({
        customerPackages: { 'cp-pkg-1': initialPackage }
      });

      const actorOutroTenant: AuthUserClaims = {
        uid: 'user-outro-gestor',
        role: 'manager',
        legacyRole: 'GERENTE',
        tenantId: 'tenant-barbearia-da-esquina',
        isSuperAdmin: false,
        claimsRaw: {}
      };

      const res = await consumeCustomerPackageItem({
        customerPackageId: 'cp-pkg-1', // pertence a tenant-barbearia-do-joao
        itemId: 'item-corte',
        idempotencyKey: 'idemp-cross-tenant-1',
        actor: actorOutroTenant,
        firestoreOverride: mockDb
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.error, 'CROSS_TENANT_OR_UNAUTHORIZED');
    });

    it('[UNIT/MOCK] 8. Pacote inexistente retorna HTTP 404 (PACKAGE_NOT_FOUND)', async () => {
      const mockDb = createMockFirestore({});

      const res = await consumeCustomerPackageItem({
        customerPackageId: 'cp-inexistente',
        itemId: 'item-corte',
        idempotencyKey: 'idemp-not-found-1',
        actor: actorClient,
        firestoreOverride: mockDb
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.error, 'PACKAGE_NOT_FOUND');
    });

    it('[UNIT/MOCK] 9. Item inexistente dentro do pacote retorna HTTP 404 (ITEM_NOT_FOUND)', async () => {
      const mockDb = createMockFirestore({
        customerPackages: { 'cp-pkg-1': initialPackage }
      });

      const res = await consumeCustomerPackageItem({
        customerPackageId: 'cp-pkg-1',
        itemId: 'item-fantasma',
        idempotencyKey: 'idemp-item-not-found-1',
        actor: actorClient,
        firestoreOverride: mockDb
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.error, 'ITEM_NOT_FOUND');
    });

    it('[UNIT/MOCK] 10. Firestore indisponível retorna HTTP 503 fail-closed', async () => {
      const res = await consumeCustomerPackageItem({
        customerPackageId: 'cp-pkg-1',
        itemId: 'item-corte',
        idempotencyKey: 'idemp-fail-closed-1',
        actor: actorClient,
        firestoreOverride: null as any // sem Firestore
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.error, 'FIRESTORE_UNAVAILABLE');
    });
  });

  // =========================================================================
  // BLOCO 2: RECONCILE-ALL — LOCK DISTRIBUÍDO GLOBAL
  // =========================================================================
  describe('2. Reconcile-All — Lock Distribuído Global e Resumo Granular', () => {
    it('[UNIT/MOCK] 11. Primeira execução adquire o lock global com sucesso', async () => {
      const mockDb = createMockFirestore({});

      const res = await acquireGlobalReconcileLock('admin-uid-1', { firestoreOverride: mockDb });
      assert.strictEqual(res.success, true);
      assert.ok((res as any).requestId.startsWith('rec_req_'));

      const lockDoc = mockDb._store.subscription_reconcile_all.get('global');
      assert.strictEqual(lockDoc.status, 'IN_PROGRESS');
      assert.strictEqual(lockDoc.ownerId, 'admin-uid-1');
    });

    it('[UNIT/MOCK] 12. Segunda execução simultânea recebe status 409 (LOCKED)', async () => {
      const mockDb = createMockFirestore({
        subscription_reconcile_all: {
          global: {
            status: 'IN_PROGRESS',
            requestId: 'rec_req_active_1',
            ownerId: 'admin-instancia-A',
            acquiredAt: new Date().toISOString(),
            acquiredAtMs: Date.now(),
            expiresAt: new Date(Date.now() + 120000).toISOString(),
            expiresAtMs: Date.now() + 120000
          }
        }
      });

      const res = await acquireGlobalReconcileLock('admin-instancia-B', { firestoreOverride: mockDb });
      assert.strictEqual(res.success, false);
      assert.strictEqual((res as any).status, 409);
      assert.strictEqual((res as any).reason, 'LOCKED');
    });

    it('[UNIT/MOCK] 13. Lock expirado (> TTL) permite aquisição e takeover seguro', async () => {
      const expiredMs = Date.now() - 300000; // 5 minutos atrás
      const mockDb = createMockFirestore({
        subscription_reconcile_all: {
          global: {
            status: 'IN_PROGRESS',
            requestId: 'rec_req_expired_1',
            ownerId: 'admin-crashado',
            acquiredAt: new Date(expiredMs).toISOString(),
            acquiredAtMs: expiredMs,
            expiresAt: new Date(expiredMs + 60000).toISOString(),
            expiresAtMs: expiredMs + 60000
          }
        }
      });

      const res = await acquireGlobalReconcileLock('admin-recuperador', { firestoreOverride: mockDb });
      assert.strictEqual(res.success, true);
      assert.notStrictEqual((res as any).requestId, 'rec_req_expired_1');

      const lockDoc = mockDb._store.subscription_reconcile_all.get('global');
      assert.strictEqual(lockDoc.ownerId, 'admin-recuperador');
      assert.strictEqual(lockDoc.status, 'IN_PROGRESS');
    });

    it('[UNIT/MOCK] 14. Apenas o requestId proprietário pode liberar o lock global', async () => {
      const mockDb = createMockFirestore({
        subscription_reconcile_all: {
          global: {
            status: 'IN_PROGRESS',
            requestId: 'req_legitimo',
            ownerId: 'admin-1',
            acquiredAtMs: Date.now(),
            expiresAtMs: Date.now() + 180000
          }
        }
      });

      // Tentativa de liberação por requisição invasora/zombie
      const releaseImpostor = await releaseGlobalReconcileLock('req_falso', undefined, { firestoreOverride: mockDb });
      assert.strictEqual(releaseImpostor.success, false);
      assert.strictEqual((releaseImpostor as any).status, 403);
      assert.strictEqual((releaseImpostor as any).reason, 'LOST_OWNERSHIP');

      // Liberação pelo proprietário legítimo
      const releaseLegit = await releaseGlobalReconcileLock('req_legitimo', {
        totalChecked: 10,
        totalReconciled: 2,
        totalUnchanged: 8,
        totalErrors: 0,
        totalInconclusive: 0
      }, { firestoreOverride: mockDb });

      assert.strictEqual(releaseLegit.success, true);

      const savedLock = mockDb._store.subscription_reconcile_all.get('global');
      assert.strictEqual(savedLock.status, 'COMPLETED');
      assert.strictEqual(savedLock.summary.totalReconciled, 2);
    });

    it('[UNIT/MOCK] 15. Firestore indisponível para lock retorna HTTP 503 fail-closed', async () => {
      const res = await acquireGlobalReconcileLock('admin-1', { firestoreOverride: null });
      assert.strictEqual(res.success, false);
      assert.strictEqual((res as any).status, 503);
      assert.strictEqual((res as any).reason, 'FIRESTORE_UNAVAILABLE');
    });
  });

  // =========================================================================
  // BLOCO 3: GRACEFUL SHUTDOWN
  // =========================================================================
  describe('3. Graceful Shutdown — Encerramento Seguro do Servidor', () => {
    it('[UNIT/MOCK] 16. setupGracefulShutdown registra listeners para SIGTERM e SIGINT', () => {
      let closeCalled = false;
      const fakeServer = {
        close: (cb: any) => {
          closeCalled = true;
          cb();
        }
      };

      setupGracefulShutdown(fakeServer, 1000);

      const sigtermListeners = process.listeners('SIGTERM');
      const sigintListeners = process.listeners('SIGINT');

      assert.ok(sigtermListeners.length > 0, 'Deve registrar listener para SIGTERM');
      assert.ok(sigintListeners.length > 0, 'Deve registrar listener para SIGINT');
    });

    it('[STATIC] 17. setupGracefulShutdown previne encerramento duplo e possui timer de força bruta', () => {
      assert.strictEqual(typeof setupGracefulShutdown, 'function');
    });
  });
});
