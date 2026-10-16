import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PlanService, DEFAULT_PLANS, computePlanCreateFingerprint, computePlanDuplicateFingerprint, getPlanIdempotencyDocId } from '../server/planService.js';
import { setMockFirebaseAdmin } from '../server/firebaseAdmin.js';

function createInMemoryFirestore() {
  const store = new Map<string, Map<string, any>>();
  const writeCounts = new Map<string, number>();

  function getCol(colName: string): Map<string, any> {
    if (!store.has(colName)) store.set(colName, new Map());
    return store.get(colName)!;
  }

  function makeDocRef(colName: string, docId: string) {
    const col = getCol(colName);
    const key = `${colName}/${docId}`;
    const docRefObj: any = {
      id: docId,
      get: async () => {
        const exists = col.has(docId);
        const data = exists ? JSON.parse(JSON.stringify(col.get(docId))) : undefined;
        return {
          id: docId,
          ref: docRefObj,
          exists,
          data: () => data
        };
      },
      set: async (data: any, opts?: any) => {
        writeCounts.set(key, (writeCounts.get(key) || 0) + 1);
        if (opts?.merge && col.has(docId)) {
          col.set(docId, { ...col.get(docId), ...JSON.parse(JSON.stringify(data)) });
        } else {
          col.set(docId, JSON.parse(JSON.stringify(data)));
        }
      },
      update: async (data: any) => {
        writeCounts.set(key, (writeCounts.get(key) || 0) + 1);
        const existing = col.get(docId) || {};
        col.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      },
      delete: async () => {
        col.delete(docId);
      }
    };
    docRefObj.ref = docRefObj;
    return docRefObj;
  }

  let txQueue = Promise.resolve();

  return {
    getStore: () => store,
    getWriteCount: (colName: string, docId: string) => writeCounts.get(`${colName}/${docId}`) || 0,
    resetWriteCounts: () => writeCounts.clear(),
    runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
      const prev = txQueue;
      let resolver: () => void;
      txQueue = new Promise(res => { resolver = res; });
      await prev;
      try {
        const tx = {
          get: async (docRef: any) => docRef.get(),
          set: async (docRef: any, data: any, opts?: any) => docRef.set(data, opts),
          update: async (docRef: any, data: any) => docRef.update(data),
          delete: async (docRef: any) => docRef.delete()
        };
        return await updateFunction(tx);
      } finally {
        resolver!();
      }
    },
    collection: (colName: string) => ({
      doc: (docId: string) => makeDocRef(colName, docId),
      get: async () => {
        const col = getCol(colName);
        const docs = Array.from(col.entries()).map(([id, data]) => ({
          id,
          data: () => JSON.parse(JSON.stringify(data))
        }));
        return {
          empty: docs.length === 0,
          docs
        };
      }
    }),
    batch: () => {
      const ops: Array<() => Promise<void>> = [];
      return {
        set: (docRef: any, data: any, opts?: any) => {
          ops.push(async () => docRef.set(data, opts));
        },
        commit: async () => {
          for (const op of ops) await op();
        }
      };
    }
  };
}

describe('FASE 4.9D — Idempotência Durável + IDs Seguros em CREATE/DUPLICATE de Planos', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = createInMemoryFirestore();
    setMockFirebaseAdmin({
      firestore: mockDb,
      auth: {
        verifyIdToken: async (token: string) => {
          if (token === 'admin-token') {
            return { uid: 'super_admin_1', role: 'super_admin', email: 'super@barber.com' };
          }
          throw new Error('Invalid token');
        }
      }
    } as any);
  });

  afterEach(() => {
    setMockFirebaseAdmin(null as any);
  });

  // 1. CREATE usa ID seguro, sem slice(-4)
  it('1. CREATE gera IDs criptograficamente seguros com UUID (sem slice(-4))', async () => {
    const service = new PlanService();
    const idempKey = 'key-create-001-uuid';
    const result = await service.createPlanIdempotently({
      planData: {
        name: 'Plano Diamante',
        description: 'Plano com gestão completa',
        status: 'ACTIVE',
        priceMonthly: 129.90,
        billingCycle: 'MONTHLY',
        hasTrial: false,
        trialDuration: 0,
        trialUnit: 'DAYS',
        hasPromotion: false,
        promotionDuration: 0,
        promotionUnit: 'MONTHS',
        priceAfterPromotion: 129.90,
        scheduleStages: [],
        features: {} as any,
        limits: {} as any
      },
      idempotencyKey: idempKey,
      actorUid: 'admin-123'
    });

    assert.ok(result.success, 'Criação deve suceder');
    assert.ok(result.plan, 'Plano deve existir');
    assert.strictEqual(result.isReplay, false);

    // Valida formato: plan-slug-UUID (36 caracteres de UUIDv4)
    assert.ok(result.plan.id.startsWith('plan-plano-diamante-'), 'Deve conter prefixo e slug sanitizado');
    const uuidPart = result.plan.id.replace('plan-plano-diamante-', '');
    assert.match(
      uuidPart,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'Identificador deve conter UUIDv4 completo (sem slice(-4) frágil)'
    );
  });

  // 2. DUPLICATE usa ID seguro, sem slice(-4)
  it('2. DUPLICATE gera IDs seguros com UUID (sem slice(-4))', async () => {
    const service = new PlanService();
    // Seed original
    await mockDb.collection('plans').doc('plano-essencial').set({
      id: 'plano-essencial',
      name: 'Plano Essencial',
      priceMonthly: 49.90,
      status: 'ACTIVE'
    });

    const idempKey = 'key-dup-001-uuid';
    const result = await service.duplicatePlanIdempotently({
      sourcePlanId: 'plano-essencial',
      idempotencyKey: idempKey,
      actorUid: 'admin-123'
    });

    assert.ok(result.success);
    assert.ok(result.plan);
    assert.ok(result.plan.id.startsWith('plan-plano-essencial-copia-'));
    const uuidPart = result.plan.id.replace('plan-plano-essencial-copia-', '');
    assert.match(
      uuidPart,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'Identificador duplicado deve usar UUIDv4 seguro'
    );
  });

  // 3. CREATE mesma key/same payload -> replay mesmo planId
  it('3. CREATE mesma key com mesmo payload retorna replay do mesmo planId', async () => {
    const service = new PlanService();
    const idempKey = 'key-idemp-replay-001';
    const planPayload = {
      name: 'Plano Bronze',
      description: 'Plano inicial',
      status: 'ACTIVE' as const,
      priceMonthly: 29.90,
      billingCycle: 'MONTHLY' as const,
      hasTrial: true,
      trialDuration: 7,
      trialUnit: 'DAYS' as const,
      hasPromotion: false,
      promotionDuration: 0,
      promotionUnit: 'MONTHS' as const,
      priceAfterPromotion: 29.90,
      scheduleStages: [],
      features: {} as any,
      limits: {} as any
    };

    // Primeira tentativa
    const firstCall = await service.createPlanIdempotently({
      planData: planPayload,
      idempotencyKey: idempKey,
      actorUid: 'admin-1'
    });
    assert.ok(firstCall.success);
    assert.strictEqual(firstCall.isReplay, false);
    const originalId = firstCall.plan?.id;

    // Retry com a mesma key e mesmo payload
    const retryCall = await service.createPlanIdempotently({
      planData: planPayload,
      idempotencyKey: idempKey,
      actorUid: 'admin-1'
    });

    assert.ok(retryCall.success);
    assert.strictEqual(retryCall.isReplay, true, 'Deve ser identificado como replay');
    assert.strictEqual(retryCall.plan?.id, originalId, 'Deve retornar o mesmo ID original');
    assert.strictEqual(retryCall.plan?.name, 'Plano Bronze');
  });

  // 4. CREATE mesma key/payload diferente -> 409
  it('4. CREATE mesma key com payload diferente é rejeitado com colisão (409)', async () => {
    const service = new PlanService();
    const idempKey = 'key-collision-test-01';

    // Primeira intenção: R$ 49.90
    await service.createPlanIdempotently({
      planData: {
        name: 'Plano Prata',
        description: 'Desc',
        status: 'ACTIVE',
        priceMonthly: 49.90,
        billingCycle: 'MONTHLY',
        hasTrial: false,
        trialDuration: 0,
        trialUnit: 'DAYS',
        hasPromotion: false,
        promotionDuration: 0,
        promotionUnit: 'MONTHS',
        priceAfterPromotion: 49.90,
        scheduleStages: [],
        features: {} as any,
        limits: {} as any
      },
      idempotencyKey: idempKey,
      actorUid: 'admin-1'
    });

    // Segunda chamada: mesma key mas preço diferente (R$ 89.90)
    const secondCall = await service.createPlanIdempotently({
      planData: {
        name: 'Plano Prata',
        description: 'Desc',
        status: 'ACTIVE',
        priceMonthly: 89.90, // Payload diferente!
        billingCycle: 'MONTHLY',
        hasTrial: false,
        trialDuration: 0,
        trialUnit: 'DAYS',
        hasPromotion: false,
        promotionDuration: 0,
        promotionUnit: 'MONTHS',
        priceAfterPromotion: 89.90,
        scheduleStages: [],
        features: {} as any,
        limits: {} as any
      },
      idempotencyKey: idempKey,
      actorUid: 'admin-1'
    });

    assert.strictEqual(secondCall.success, false);
    assert.strictEqual(secondCall.collision, true, 'Deve indicar colisão de chave');
    assert.match(secondCall.error || '', /parâmetros diferentes/i);
  });

  // 5. CREATE concorrente mesma key -> exatamente um plano
  it('5. CREATE concorrente com mesma key e payload converge para exatamente um plano', async () => {
    const service = new PlanService();
    const idempKey = 'key-concurrent-create-01';
    const planPayload = {
      name: 'Plano Safira',
      description: 'Plano concorrente',
      status: 'ACTIVE' as const,
      priceMonthly: 99.90,
      billingCycle: 'MONTHLY' as const,
      hasTrial: false,
      trialDuration: 0,
      trialUnit: 'DAYS' as const,
      hasPromotion: false,
      promotionDuration: 0,
      promotionUnit: 'MONTHS' as const,
      priceAfterPromotion: 99.90,
      scheduleStages: [],
      features: {} as any,
      limits: {} as any
    };

    // Dispara duas chamadas exatamente simultâneas
    const [resA, resB] = await Promise.all([
      service.createPlanIdempotently({ planData: planPayload, idempotencyKey: idempKey, actorUid: 'admin-1' }),
      service.createPlanIdempotently({ planData: planPayload, idempotencyKey: idempKey, actorUid: 'admin-1' })
    ]);

    assert.ok(resA.success && resB.success, 'Ambas devem responder com sucesso');
    assert.strictEqual(resA.plan?.id, resB.plan?.id, 'Ambas devem retornar exatamente o mesmo planId');

    const replays = [resA.isReplay, resB.isReplay].filter(Boolean);
    const originals = [resA.isReplay, resB.isReplay].filter(r => !r);
    assert.strictEqual(originals.length, 1, 'Exatamente uma chamada deve ser a criadora original');
    assert.strictEqual(replays.length, 1, 'Exatamente uma chamada deve ser o replay idempotente');

    // Verifica que existe apenas 1 documento gravado na coleção 'plans' correspondente
    const allPlans = await mockDb.collection('plans').get();
    const safiraPlans = allPlans.docs.filter((d: any) => d.id.includes('plano-safira'));
    assert.strictEqual(safiraPlans.length, 1, 'Deve haver apenas 1 documento no Firestore');
  });

  // 6. CREATE keys diferentes -> operações independentes
  it('6. CREATE com keys diferentes cria planos independentes com IDs distintos', async () => {
    const service = new PlanService();
    const planPayload = {
      name: 'Plano Custom',
      description: 'Desc',
      status: 'ACTIVE' as const,
      priceMonthly: 59.90,
      billingCycle: 'MONTHLY' as const,
      hasTrial: false,
      trialDuration: 0,
      trialUnit: 'DAYS' as const,
      hasPromotion: false,
      promotionDuration: 0,
      promotionUnit: 'MONTHS' as const,
      priceAfterPromotion: 59.90,
      scheduleStages: [],
      features: {} as any,
      limits: {} as any
    };

    const res1 = await service.createPlanIdempotently({
      planData: planPayload,
      idempotencyKey: 'key-independent-A',
      actorUid: 'admin-1'
    });
    const res2 = await service.createPlanIdempotently({
      planData: planPayload,
      idempotencyKey: 'key-independent-B',
      actorUid: 'admin-1'
    });

    assert.ok(res1.success && res2.success);
    assert.notStrictEqual(res1.plan?.id, res2.plan?.id, 'Devem ter IDs distintos');
    assert.strictEqual(res1.isReplay, false);
    assert.strictEqual(res2.isReplay, false);
  });

  // 7. CREATE response-loss/retry -> um plano
  it('7. CREATE em simulação de response-loss com retries múltiplos retorna sempre o mesmo plano', async () => {
    const service = new PlanService();
    const idempKey = 'key-response-loss-create';
    const planPayload = {
      name: 'Plano Resiliente',
      description: 'Desc',
      status: 'ACTIVE' as const,
      priceMonthly: 79.90,
      billingCycle: 'MONTHLY' as const,
      hasTrial: false,
      trialDuration: 0,
      trialUnit: 'DAYS' as const,
      hasPromotion: false,
      promotionDuration: 0,
      promotionUnit: 'MONTHS' as const,
      priceAfterPromotion: 79.90,
      scheduleStages: [],
      features: {} as any,
      limits: {} as any
    };

    const initial = await service.createPlanIdempotently({
      planData: planPayload,
      idempotencyKey: idempKey,
      actorUid: 'admin-1'
    });
    assert.ok(initial.success);

    // Simula 3 retries por timeout
    for (let i = 0; i < 3; i++) {
      const retry = await service.createPlanIdempotently({
        planData: planPayload,
        idempotencyKey: idempKey,
        actorUid: 'admin-1'
      });
      assert.strictEqual(retry.plan?.id, initial.plan?.id);
      assert.strictEqual(retry.isReplay, true);
    }
  });

  // 8. DUPLICATE mesma key/source -> replay mesma cópia
  it('8. DUPLICATE com mesma key e mesmo source retorna replay da cópia original', async () => {
    const service = new PlanService();
    await mockDb.collection('plans').doc('plano-origem').set({
      id: 'plano-origem',
      name: 'Plano Origem',
      priceMonthly: 39.90,
      status: 'ACTIVE'
    });

    const key = 'dup-replay-key-01';
    const first = await service.duplicatePlanIdempotently({
      sourcePlanId: 'plano-origem',
      idempotencyKey: key,
      actorUid: 'admin-1'
    });
    assert.ok(first.success);
    assert.strictEqual(first.isReplay, false);

    const second = await service.duplicatePlanIdempotently({
      sourcePlanId: 'plano-origem',
      idempotencyKey: key,
      actorUid: 'admin-1'
    });
    assert.ok(second.success);
    assert.strictEqual(second.isReplay, true);
    assert.strictEqual(second.plan?.id, first.plan?.id);
  });

  // 9. DUPLICATE mesma key/source diferente -> 409
  it('9. DUPLICATE com mesma key mas sourcePlanId diferente é rejeitado com colisão (409)', async () => {
    const service = new PlanService();
    await mockDb.collection('plans').doc('plano-A').set({ id: 'plano-A', name: 'Plano A', priceMonthly: 10 });
    await mockDb.collection('plans').doc('plano-B').set({ id: 'plano-B', name: 'Plano B', priceMonthly: 20 });

    const key = 'shared-dup-key-conflict';
    await service.duplicatePlanIdempotently({
      sourcePlanId: 'plano-A',
      idempotencyKey: key,
      actorUid: 'admin-1'
    });

    const conflict = await service.duplicatePlanIdempotently({
      sourcePlanId: 'plano-B',
      idempotencyKey: key,
      actorUid: 'admin-1'
    });
    assert.strictEqual(conflict.success, false);
    assert.strictEqual(conflict.collision, true);
  });

  // 10. DUPLICATE concorrente mesma key -> uma cópia
  it('10. DUPLICATE concorrente com mesma key converge para uma única cópia', async () => {
    const service = new PlanService();
    await mockDb.collection('plans').doc('plano-concorrente').set({
      id: 'plano-concorrente',
      name: 'Plano Base',
      priceMonthly: 50
    });

    const key = 'dup-race-key';
    const [resA, resB] = await Promise.all([
      service.duplicatePlanIdempotently({ sourcePlanId: 'plano-concorrente', idempotencyKey: key, actorUid: 'admin-1' }),
      service.duplicatePlanIdempotently({ sourcePlanId: 'plano-concorrente', idempotencyKey: key, actorUid: 'admin-1' })
    ]);

    assert.ok(resA.success && resB.success);
    assert.strictEqual(resA.plan?.id, resB.plan?.id);
    const replays = [resA.isReplay, resB.isReplay].filter(Boolean);
    assert.strictEqual(replays.length, 1);
  });

  // 11. DUPLICATE keys diferentes -> cópias independentes
  it('11. DUPLICATE com keys diferentes gera duas cópias legítimas separadas', async () => {
    const service = new PlanService();
    await mockDb.collection('plans').doc('plano-multi-dup').set({
      id: 'plano-multi-dup',
      name: 'Plano Multi',
      priceMonthly: 60
    });

    const res1 = await service.duplicatePlanIdempotently({
      sourcePlanId: 'plano-multi-dup',
      idempotencyKey: 'dup-key-1',
      actorUid: 'admin-1'
    });
    const res2 = await service.duplicatePlanIdempotently({
      sourcePlanId: 'plano-multi-dup',
      idempotencyKey: 'dup-key-2',
      actorUid: 'admin-1'
    });

    assert.ok(res1.success && res2.success);
    assert.notStrictEqual(res1.plan?.id, res2.plan?.id);
  });

  // 12. DUPLICATE response-loss/retry -> uma cópia
  it('12. DUPLICATE em response-loss com múltiplos retries preserva a mesma cópia', async () => {
    const service = new PlanService();
    await mockDb.collection('plans').doc('plano-dup-loss').set({
      id: 'plano-dup-loss',
      name: 'Plano Perda',
      priceMonthly: 45
    });

    const key = 'dup-loss-key';
    const first = await service.duplicatePlanIdempotently({
      sourcePlanId: 'plano-dup-loss',
      idempotencyKey: key,
      actorUid: 'admin-1'
    });

    for (let i = 0; i < 4; i++) {
      const retry = await service.duplicatePlanIdempotently({
        sourcePlanId: 'plano-dup-loss',
        idempotencyKey: key,
        actorUid: 'admin-1'
      });
      assert.strictEqual(retry.plan?.id, first.plan?.id);
      assert.strictEqual(retry.isReplay, true);
    }
  });

  // 13. Firestore transaction error -> fail-closed
  it('13. Erro na transação Firestore resulta em Fail-Closed estrito (sem plano em memória nem replay)', async () => {
    const brokenDb = {
      runTransaction: async () => {
        throw new Error('FIRESTORE_TX_ABORTED_UNAVAILABLE');
      },
      collection: () => ({ doc: () => ({}) })
    };
    setMockFirebaseAdmin({ firestore: brokenDb } as any);

    const service = new PlanService();
    await assert.rejects(
      async () => {
        await service.createPlanIdempotently({
          planData: { name: 'Fail Test', priceMonthly: 10 } as any,
          idempotencyKey: 'fail-key-01',
          actorUid: 'admin-1'
        });
      },
      /FIRESTORE_TX_ABORTED_UNAVAILABLE/
    );

    // Cache local não pode conter plano criado
    const plans = await service.getPlans();
    assert.ok(!plans.some(p => p.name === 'Fail Test'), 'Nenhum plano sintético deve existir no cache');
  });

  // 14. Replay não cria novo audit quando audit original já existe
  it('14. Rotas em server.ts não disparam novo audit log em replay idempotente', () => {
    const serverPath = path.resolve('server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    // Valida que em POST /api/plans o audit só é chamado se !result.isReplay
    const createRouteMatch = serverContent.match(/app\.post\('\/api\/plans',[\s\S]*?app\.put/);
    assert.ok(createRouteMatch, 'Rota POST /api/plans deve existir');
    assert.ok(
      createRouteMatch[0].includes('if (!result.isReplay) {') &&
      createRouteMatch[0].includes("action: 'PLAN_CREATED'"),
      'Auditoria de criação só deve ser registrada se NÃO for replay'
    );

    // Valida que em POST /api/plans/:id/duplicate o audit só é chamado se !result.isReplay
    const duplicateRouteMatch = serverContent.match(/app\.post\('\/api\/plans\/:id\/duplicate',[\s\S]*?app\.get\('\/api\/health'/);
    assert.ok(duplicateRouteMatch, 'Rota POST /api/plans/:id/duplicate deve existir');
    assert.ok(
      duplicateRouteMatch[0].includes('if (!result.isReplay) {') &&
      duplicateRouteMatch[0].includes("action: 'PLAN_DUPLICATED'"),
      'Auditoria de duplicação só deve ser registrada se NÃO for replay'
    );
  });

  // 15. requireSuperAdmin permanece obrigatório
  it('15. requireSuperAdmin permanece obrigatório nas rotas de criação e duplicação', () => {
    const serverContent = fs.readFileSync('server.ts', 'utf-8');
    assert.ok(
      serverContent.includes("app.post('/api/plans', requireSuperAdmin"),
      'POST /api/plans deve exigir requireSuperAdmin'
    );
    assert.ok(
      serverContent.includes("app.post('/api/plans/:id/duplicate', requireSuperAdmin"),
      'POST /api/plans/:id/duplicate deve exigir requireSuperAdmin'
    );
  });

  // 16. Idempotency-Key inválida/ausente segue contrato definido
  it('16. Validação estrita de Idempotency-Key (400 para ausente ou fora do regex seguro)', () => {
    const serverContent = fs.readFileSync('server.ts', 'utf-8');
    assert.ok(
      serverContent.includes('IDEMPOTENCY_KEY_REQUIRED'),
      'server.ts deve declarar código de erro IDEMPOTENCY_KEY_REQUIRED'
    );
    assert.ok(
      serverContent.includes('INVALID_IDEMPOTENCY_KEY'),
      'server.ts deve declarar código de erro INVALID_IDEMPOTENCY_KEY'
    );
    assert.ok(
      serverContent.includes('/^[a-zA-Z0-9_-]{8,128}$/'),
      'server.ts deve validar o formato seguro da chave via regex'
    );
  });

  // 17. Zero syncDoc('plans') mantido
  it('17. Zero escrita client-side direta via syncDoc("plans")', () => {
    const appContextContent = fs.readFileSync('src/context/AppContext.tsx', 'utf-8');
    const syncDocMatches = (appContextContent.match(/syncDoc\(['"]plans['"]/g) || []).length;
    assert.strictEqual(syncDocMatches, 0, 'Nenhum syncDoc("plans") deve existir');
  });

  // 18. toggle-status 4.9B permanece intacto
  it('18. Endpoint POST /api/plans/:id/toggle-status da FASE 4.9B permanece inalterado', () => {
    const serverContent = fs.readFileSync('server.ts', 'utf-8');
    assert.ok(
      serverContent.includes("app.post('/api/plans/:id/toggle-status', requireSuperAdmin"),
      'Rota toggle-status deve existir'
    );
    assert.ok(
      serverContent.includes('planService.setPlanStatus(id, targetStatus)'),
      'toggle-status deve invocar setPlanStatus com semântica absoluta e autoritativa'
    );
  });
});
