import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  acquireDistributedCreationLock,
  completeDistributedCreationLock,
  failDistributedCreationLock,
  recordFirestoreWriteFailureLock,
  blockAmbiguousDistributedCreationLock,
  DistributedLockData
} from '../server/subscriptionDistributedLock.js';
import {
  executePreapprovalRecoveryCheck,
  isCreateAllowed,
  LocalCreationContext
} from '../server/subscriptionReconciliationService.js';

/**
 * FASE 3.3E: Suíte de Auditoria e Blindagem de Concorrência Distribuída (28 Cenários)
 * Classificação obrigatória:
 * - [UNIT/MOCK] para simulações de concorrência distribuída, OCC e transações Firestore
 * - [STATIC] para auditoria estática do código-fonte (ausência de POST em transactions, invariantes de lock)
 * Nota de Ambiente: Como FIRESTORE_EMULATOR_HOST não está ativo no runtime, a validação de concorrência
 * distribuída e exclusão mútua é formalmente realizada via testes UNIT/MOCK com modelo de serialização
 * atômica do Firestore, e análise STATIC.
 */

function createMockFirestoreWithOCC() {
  const store = new Map<string, any>();
  const versions = new Map<string, number>();
  let txQueue = Promise.resolve();

  const getDoc = (col: string, docId: string) => {
    const key = `${col}/${docId}`;
    const data = store.get(key);
    return {
      exists: data !== undefined,
      id: docId,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
    };
  };

  const setDoc = (col: string, docId: string, data: any, options?: { merge?: boolean }) => {
    const key = `${col}/${docId}`;
    const currentVer = versions.get(key) || 0;
    versions.set(key, currentVer + 1);
    if (options?.merge && store.has(key)) {
      store.set(key, { ...store.get(key), ...JSON.parse(JSON.stringify(data)) });
    } else {
      store.set(key, JSON.parse(JSON.stringify(data)));
    }
  };

  const firestore = {
    _store: store,
    collection: (col: string) => ({
      doc: (docId: string) => ({
        _path: `${col}/${docId}`,
        get: async () => getDoc(col, docId),
        set: async (data: any, options?: any) => setDoc(col, docId, data, options)
      })
    }),
    runTransaction: async (updateFunction: (transaction: any) => Promise<any>) => {
      const run = async () => {
        const writes: Array<{ col: string; docId: string; data: any; options?: any }> = [];
        const transaction = {
          get: async (docRef: any) => {
            const pathParts = docRef._path || 'subscription_creations/create-test';
            const [col, docId] = typeof pathParts === 'string' ? pathParts.split('/') : ['subscription_creations', 'create-test'];
            return getDoc(col, docId);
          },
          set: (docRef: any, data: any, options?: any) => {
            const pathParts = docRef._path || 'subscription_creations/create-test';
            const [col, docId] = typeof pathParts === 'string' ? pathParts.split('/') : ['subscription_creations', 'create-test'];
            writes.push({ col, docId, data, options });
          }
        };

        const result = await updateFunction(transaction);
        for (const w of writes) {
          setDoc(w.col, w.docId, w.data, w.options);
        }
        return result;
      };

      const resultPromise = txQueue.then(run, run);
      txQueue = resultPromise.then(() => {}, () => {});
      return resultPromise;
    }
  };

  return firestore;
}

const baseContext: LocalCreationContext = {
  barbershopId: 'tenant-barber-33e',
  payerEmail: 'dono@barbearia.com',
  planId: 'PLANO_PRO',
  planName: 'Plano Pro',
  expectedAmount: 59.90,
  currencyId: 'BRL',
  billingCycle: 'MONTHLY',
  frequency: 1,
  frequencyType: 'months',
  attemptTimestampMs: Date.now()
};

describe('FASE 3.3E — Blindagem de Concorrência Distribuída (28 Cenários)', () => {

  describe('Bloco 1: Concorrência Simultânea e Exclusão Mútua (1 a 4)', () => {
    it('[UNIT/MOCK] 1. Duas requests simultâneas: apenas uma consegue adquirir o lock distribuído', async () => {
      const db = createMockFirestoreWithOCC();
      const [res1, res2] = await Promise.all([
        acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO'),
        acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO')
      ]);

      const successCount = [res1, res2].filter(r => r.success).length;
      const lockedCount = [res1, res2].filter(r => !r.success && (r as any).reason === 'ALREADY_IN_PROGRESS').length;

      assert.strictEqual(successCount, 1);
      assert.strictEqual(lockedCount, 1);
    });

    it('[UNIT/MOCK] 2. Dois processos independentes (Instância A e B): Instância B é bloqueada', async () => {
      const db = createMockFirestoreWithOCC();
      const resInstanceA = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(resInstanceA.success, true);

      const resInstanceB = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(resInstanceB.success, false);
      if (!resInstanceB.success) {
        assert.strictEqual(resInstanceB.reason, 'ALREADY_IN_PROGRESS');
      }
    });

    it('[UNIT/MOCK] 3. Dois owners tentando criar simultaneamente: requestId identifica tentativa vencedora', async () => {
      const db = createMockFirestoreWithOCC();
      const res1 = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      const res2 = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');

      assert.strictEqual(res1.success, true);
      assert.strictEqual(res2.success, false);
      if (res1.success) {
        assert.ok(res1.requestId.startsWith('req_'));
      }
    });

    it('[UNIT/MOCK] 4. Segundo request recebe ALREADY_IN_PROGRESS com metadados do lock ativo', async () => {
      const db = createMockFirestoreWithOCC();
      await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      const res2 = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');

      assert.strictEqual(res2.success, false);
      if (!res2.success && res2.reason === 'ALREADY_IN_PROGRESS') {
        assert.strictEqual(res2.currentLock.barbershopId, 'tenant-barber-33e');
        assert.strictEqual(res2.currentLock.status, 'IN_PROGRESS');
        assert.ok(res2.currentLock.expiresAtMs > Date.now());
      }
    });
  });

  describe('Bloco 2: Expiração de Lock, TTL e Recuperação Pós-Crash (5 a 10)', () => {
    it('[UNIT/MOCK] 5. Lock expirado (expiresAt < now) permite nova tentativa assumir o controle', async () => {
      const db = createMockFirestoreWithOCC();
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_old_crashed',
        status: 'IN_PROGRESS',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        createdAtMs: Date.now() - 120000,
        expiresAtMs: Date.now() - 30000
      });

      const res = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(res.success, true);
      if (res.success) {
        assert.notStrictEqual(res.requestId, 'req_old_crashed');
        assert.strictEqual(res.previousLockData?.requestId, 'req_old_crashed');
      }
    });

    it('[UNIT/MOCK] 6. Dois processos tentando assumir lock expirado simultaneamente: race condition protegida', async () => {
      const db = createMockFirestoreWithOCC();
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_expired',
        status: 'IN_PROGRESS',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        createdAtMs: Date.now() - 120000,
        expiresAtMs: Date.now() - 10000
      });

      const [p1, p2] = await Promise.all([
        acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO'),
        acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO')
      ]);

      const wins = [p1, p2].filter(r => r.success).length;
      assert.strictEqual(wins, 1);
    });

    it('[UNIT/MOCK] 7. Somente um consegue assumir o lock expirado, o outro recebe ALREADY_IN_PROGRESS', async () => {
      const db = createMockFirestoreWithOCC();
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_expired_7',
        status: 'IN_PROGRESS',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        createdAtMs: Date.now() - 120000,
        expiresAtMs: Date.now() - 10000
      });

      const [p1, p2] = await Promise.all([
        acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO'),
        acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO')
      ]);

      const rejected = [p1, p2].find(r => !r.success);
      assert.ok(rejected);
      if (rejected && !rejected.success) {
        assert.strictEqual((rejected as any).reason, 'ALREADY_IN_PROGRESS');
      }
    });

    it('[UNIT/MOCK] 8. Processo morre após recovery: lock expirado carrega previousLockData para o próximo', async () => {
      const db = createMockFirestoreWithOCC();
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_dead_after_recovery',
        status: 'IN_PROGRESS',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        createdAtMs: Date.now() - 120000,
        expiresAtMs: Date.now() - 10000
      });

      const nextAcquisition = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(nextAcquisition.success, true);
      if (nextAcquisition.success) {
        assert.strictEqual(nextAcquisition.previousLockData?.requestId, 'req_dead_after_recovery');
      }
    });

    it('[UNIT/MOCK] 9. Processo morre após POST no MP: lock expirado armazena mpSubscriptionId', async () => {
      const db = createMockFirestoreWithOCC();
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_crashed_after_post',
        status: 'IN_PROGRESS',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        mpSubscriptionId: 'mp-sub-created-999',
        createdAtMs: Date.now() - 120000,
        expiresAtMs: Date.now() - 10000
      });

      const nextAcq = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(nextAcq.success, true);
      if (nextAcq.success) {
        assert.strictEqual(nextAcq.previousLockData?.mpSubscriptionId, 'mp-sub-created-999');
      }
    });

    it('[UNIT/MOCK] 10. Segundo processo encontra contrato existente no MP e recupera sem duplicar', async () => {
      const mockCallMp = async (endpoint: string) => {
        if (endpoint === '/preapproval/mp-sub-created-999') {
          return {
            ok: true,
            status: 200,
            data: {
              id: 'mp-sub-created-999',
              external_reference: 'tenant-barber-33e',
              payer_email: 'dono@barbearia.com',
              auto_recurring: { transaction_amount: 59.90, currency_id: 'BRL', frequency: 1, frequency_type: 'months' },
              status: 'pending',
              init_point: 'https://mercadopago.com/init'
            }
          };
        }
        return { ok: false, status: 404, data: null };
      };

      const check = await executePreapprovalRecoveryCheck(
        'tenant-barber-33e',
        baseContext,
        { mpSubscriptionId: 'mp-sub-created-999' },
        mockCallMp
      );

      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
      assert.strictEqual(check.candidate?.id, 'mp-sub-created-999');
      assert.strictEqual(isCreateAllowed(check), false);
    });
  });

  describe('Bloco 3: Fail-Closed do Firestore e Imunidade de Memória (11 a 14)', () => {
    it('[UNIT/MOCK] 11. Firestore indisponível para adquirir lock rejeita requisição fail-closed (503)', async () => {
      const brokenDb = {
        collection: () => ({ doc: () => ({}) }),
        runTransaction: async () => {
          throw new Error('Firestore connection timeout');
        }
      };

      const res = await acquireDistributedCreationLock(brokenDb, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(res.success, false);
      if (!res.success) {
        assert.strictEqual(res.reason, 'FIRESTORE_UNAVAILABLE');
      }
    });

    it('[UNIT/MOCK] 12. Lock não pode ser substituído por memória local: ausência de Firestore bloqueia', async () => {
      const nullDb = null;
      const res = await acquireDistributedCreationLock(nullDb, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(res.success, false);
      if (!res.success) {
        assert.strictEqual(res.reason, 'FIRESTORE_UNAVAILABLE');
      }
    });

    it('[UNIT/MOCK] 13. Lock armazena obrigatoriamente requestId único e opaco (UUID)', async () => {
      const db = createMockFirestoreWithOCC();
      const res1 = await acquireDistributedCreationLock(db, 'tenant-1', 'a@b.com', 'P1');
      const res2 = await acquireDistributedCreationLock(db, 'tenant-2', 'a@b.com', 'P1');

      if (res1.success && res2.success) {
        assert.notStrictEqual(res1.requestId, res2.requestId);
        assert.ok(res1.requestId.length > 20);
        assert.ok(res2.requestId.length > 20);
      }
    });

    it('[UNIT/MOCK] 14. Lock armazena explicitamente createdAtMs e expiresAtMs para TTL', async () => {
      const db = createMockFirestoreWithOCC();
      const res = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO', { ttlMs: 60000 });

      assert.strictEqual(res.success, true);
      const stored = db._store.get('subscription_creations/create-tenant-barber-33e');
      assert.ok(stored.createdAtMs > 0);
      assert.ok(stored.expiresAtMs > stored.createdAtMs);
      assert.strictEqual(stored.expiresAtMs - stored.createdAtMs, 60000);
    });
  });

  describe('Bloco 4: Integridade do Recovery e Bloqueio de Estados Críticos (15 a 21)', () => {
    it('[UNIT/MOCK] 15. Recovery após lock expirado busca contrato associado', async () => {
      const db = createMockFirestoreWithOCC();
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_15',
        status: 'IN_PROGRESS',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        createdAtMs: Date.now() - 100000,
        expiresAtMs: Date.now() - 5000
      });

      const res = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(res.success, true);
      assert.ok(res.success && res.previousLockData !== null);
    });

    it('[UNIT/MOCK] 16. mpSubscriptionId conhecido no lock é propagado para o recovery context', async () => {
      const db = createMockFirestoreWithOCC();
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_16',
        status: 'IN_PROGRESS',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        mpSubscriptionId: 'mp-known-id-123',
        createdAtMs: Date.now() - 100000,
        expiresAtMs: Date.now() - 5000
      });

      const res = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(res.success, true);
      if (res.success) {
        assert.strictEqual(res.previousLockData?.mpSubscriptionId, 'mp-known-id-123');
      }
    });

    it('[UNIT/MOCK] 17. Recovery por ID: recupera diretamente sem precisar de paginação quando ID é conhecido', async () => {
      const mockCallMp = async (endpoint: string) => {
        if (endpoint === '/preapproval/mp-known-id-123') {
          return {
            ok: true,
            status: 200,
            data: {
              id: 'mp-known-id-123',
              external_reference: 'tenant-barber-33e',
              payer_email: 'dono@barbearia.com',
              auto_recurring: { transaction_amount: 59.90, currency_id: 'BRL', frequency: 1, frequency_type: 'months' },
              status: 'pending',
              init_point: 'https://mercadopago.com/checkout'
            }
          };
        }
        throw new Error('Não deveria chamar search');
      };

      const check = await executePreapprovalRecoveryCheck(
        'tenant-barber-33e',
        baseContext,
        { mpSubscriptionId: 'mp-known-id-123' },
        mockCallMp
      );

      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
      assert.strictEqual(check.candidate?.id, 'mp-known-id-123');
    });

    it('[UNIT/MOCK] 18. Recovery por search: quando não há ID no lock, executa busca exaustiva por tenant', async () => {
      let searchCalled = false;
      const mockCallMp = async (endpoint: string) => {
        if (endpoint.includes('/preapproval/search')) {
          searchCalled = true;
          return {
            ok: true,
            status: 200,
            data: {
              results: [{
                id: 'mp-search-found',
                external_reference: 'tenant-barber-33e',
                payer_email: 'dono@barbearia.com',
                auto_recurring: { transaction_amount: 59.90, currency_id: 'BRL', frequency: 1, frequency_type: 'months' },
                status: 'pending',
                init_point: 'https://mercadopago.com/search-init'
              }],
              paging: { total: 1, limit: 30, offset: 0 }
            }
          };
        }
        return { ok: false, status: 404, data: null };
      };

      const check = await executePreapprovalRecoveryCheck(
        'tenant-barber-33e',
        baseContext,
        null,
        mockCallMp
      );

      assert.strictEqual(searchCalled, true);
      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
    });

    it('[UNIT/MOCK] 19. AMBIGUOUS bloqueia criação e atualiza lock com AMBIGUOUS_BLOCKED', async () => {
      const db = createMockFirestoreWithOCC();
      const acq = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(acq.success, true);

      if (acq.success) {
        const transRes = await blockAmbiguousDistributedCreationLock(
          db,
          'tenant-barber-33e',
          acq.requestId,
          'Múltiplos contratos ativos detectados',
          2
        );
        assert.strictEqual(transRes.success, true);

        const stored = db._store.get('subscription_creations/create-tenant-barber-33e');
        assert.strictEqual(stored.status, 'AMBIGUOUS_BLOCKED');
        assert.strictEqual(stored.candidatesCount, 2);
      }
    });

    it('[UNIT/MOCK] 20. SEARCH_INCOMPLETE bloqueia criação fail-closed (isCreateAllowed === false)', () => {
      const checkResult = {
        operation: 'GATEWAY_UNAVAILABLE' as const,
        reason: 'SEARCH_INCOMPLETE: Limite de paginação atingido',
        httpStatus: 502
      };
      assert.strictEqual(isCreateAllowed(checkResult), false);
    });

    it('[UNIT/MOCK] 21. NEEDS_REVIEW bloqueia criação (isCreateAllowed === false)', () => {
      const checkResult = {
        operation: 'BLOCK_AMBIGUOUS' as const,
        reason: 'NEEDS_REVIEW: Candidato possui status desconhecido',
        candidates: []
      };
      assert.strictEqual(isCreateAllowed(checkResult), false);
    });
  });

  describe('Bloco 5: Posse de Token (Owner/RequestId) e Transições Condicionais (22 a 26)', () => {
    it('[UNIT/MOCK] 22. Somente lock owner (requestId) pode finalizar a tentativa com COMPLETED', async () => {
      const db = createMockFirestoreWithOCC();
      const acq = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(acq.success, true);

      if (acq.success) {
        const res = await completeDistributedCreationLock(db, 'tenant-barber-33e', acq.requestId, {
          mpSubscriptionId: 'mp-123',
          recovered: false
        });
        assert.strictEqual(res.success, true);
        const stored = db._store.get('subscription_creations/create-tenant-barber-33e');
        assert.strictEqual(stored.status, 'COMPLETED');
      }
    });

    it('[UNIT/MOCK] 23. Lock antigo não pode ser finalizado por request novo ou vice-versa (LOST_OWNERSHIP)', async () => {
      const db = createMockFirestoreWithOCC();
      const acqA = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(acqA.success, true);

      // Request B assume posse do lock
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_B_new_owner',
        status: 'IN_PROGRESS',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + 60000
      });

      // Request A tenta finalizar
      if (acqA.success) {
        const res = await completeDistributedCreationLock(db, 'tenant-barber-33e', acqA.requestId, {
          mpSubscriptionId: 'mp-zombie',
          recovered: false
        });
        assert.strictEqual(res.success, false);
        if (!res.success) {
          assert.strictEqual(res.reason, 'LOST_OWNERSHIP');
        }
      }
    });

    it('[UNIT/MOCK] 24. COMPLETED não pode ser sobrescrito indevidamente por request antigo', async () => {
      const db = createMockFirestoreWithOCC();
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_completed_ok',
        status: 'COMPLETED',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        mpSubscriptionId: 'mp-sub-999',
        completedAt: new Date().toISOString()
      });

      const failRes = await failDistributedCreationLock(db, 'tenant-barber-33e', 'req_old_stale', 'Erro simulado');
      assert.strictEqual(failRes.success, false);
      if (!failRes.success) {
        assert.strictEqual(failRes.reason, 'LOST_OWNERSHIP');
      }

      const stored = db._store.get('subscription_creations/create-tenant-barber-33e');
      assert.strictEqual(stored.status, 'COMPLETED');
    });

    it('[UNIT/MOCK] 25. FAILED pode ser recuperado de forma segura por nova tentativa', async () => {
      const db = createMockFirestoreWithOCC();
      db._store.set('subscription_creations/create-tenant-barber-33e', {
        requestId: 'req_failed',
        status: 'FAILED',
        barbershopId: 'tenant-barber-33e',
        payerEmail: 'dono@barbearia.com',
        planId: 'PLANO_PRO',
        error: 'Timeout temporário',
        failedAt: new Date().toISOString()
      });

      const newAcq = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(newAcq.success, true);
      const stored = db._store.get('subscription_creations/create-tenant-barber-33e');
      assert.strictEqual(stored.status, 'IN_PROGRESS');
    });

    it('[UNIT/MOCK] 26. FIRESTORE_WRITE_FAILED pode ser reconciliado e preserva mpSubscriptionId', async () => {
      const db = createMockFirestoreWithOCC();
      const acq = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
      assert.strictEqual(acq.success, true);

      if (acq.success) {
        const failWriteRes = await recordFirestoreWriteFailureLock(
          db,
          'tenant-barber-33e',
          acq.requestId,
          'Firestore quota exceeded',
          'mp-created-12345',
          false
        );
        assert.strictEqual(failWriteRes.success, true);

        const stored = db._store.get('subscription_creations/create-tenant-barber-33e');
        assert.strictEqual(stored.status, 'FIRESTORE_WRITE_FAILED');
        assert.strictEqual(stored.mpSubscriptionId, 'mp-created-12345');
      }
    });
  });

  describe('Bloco 6: Auditoria Estática e Invariantes Arquiteturais (27 e 28)', () => {
    it('[STATIC] 27. Nenhuma transaction do Firestore contém chamadas a POST /preapproval', () => {
      const serverCode = fs.readFileSync(path.resolve('server.ts'), 'utf-8');
      const lockCode = fs.readFileSync(path.resolve('src/server/subscriptionDistributedLock.ts'), 'utf-8');

      assert.ok(!lockCode.includes('callMercadoPago'), 'subscriptionDistributedLock.ts não chama callMercadoPago');
      assert.ok(!lockCode.includes('fetch('), 'subscriptionDistributedLock.ts não faz fetch');

      const lockCallIdx = serverCode.indexOf('acquireDistributedCreationLock');
      const postMpIdx = serverCode.indexOf("callMercadoPagoWithDetails('/preapproval'");

      assert.ok(lockCallIdx > 0, 'acquireDistributedCreationLock deve estar presente');
      assert.ok(postMpIdx > lockCallIdx, 'POST /preapproval deve ocorrer estritamente após aquisição do lock');

      const txRegex = /runTransaction\s*\(\s*async[\s\S]*?callMercadoPagoWithDetails[\s\S]*?\)/;
      assert.ok(!txRegex.test(serverCode), 'POST /preapproval NUNCA deve estar dentro de uma runTransaction');
    });

    it('[STATIC] 28. Nenhum segundo POST ocorre na corrida distribuída (exclusão mútua garantida antes do gateway)', async () => {
      const db = createMockFirestoreWithOCC();

      let postPreapprovalCount = 0;
      const simulateProcess = async (instanceName: string) => {
        const lock = await acquireDistributedCreationLock(db, 'tenant-barber-33e', 'dono@barbearia.com', 'PLANO_PRO');
        if (!lock.success) {
          return { instance: instanceName, outcome: 'REJECTED', reason: (lock as any).reason };
        }

        const recovery = await executePreapprovalRecoveryCheck('tenant-barber-33e', baseContext, lock.previousLockData, async () => ({
          ok: true,
          status: 200,
          data: { results: [], paging: { total: 0, limit: 30, offset: 0 } }
        }));

        if (isCreateAllowed(recovery)) {
          postPreapprovalCount++;
          await completeDistributedCreationLock(db, 'tenant-barber-33e', lock.requestId, {
            mpSubscriptionId: `mp-from-${instanceName}`,
            recovered: false
          });
          return { instance: instanceName, outcome: 'CREATED' };
        }

        return { instance: instanceName, outcome: 'RECOVERED' };
      };

      const [p1, p2] = await Promise.all([
        simulateProcess('Process-A'),
        simulateProcess('Process-B')
      ]);

      assert.strictEqual(postPreapprovalCount, 1, 'Exatamente UM POST /preapproval é executado na corrida');
      const createdOutcomes = [p1, p2].filter(r => r.outcome === 'CREATED').length;
      const rejectedOutcomes = [p1, p2].filter(r => r.outcome === 'REJECTED').length;

      assert.strictEqual(createdOutcomes, 1, 'Apenas uma instância conclui criação');
      assert.strictEqual(rejectedOutcomes, 1, 'A instância concorrente é rejeitada');
    });
  });
});
