import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { PlanService, DEFAULT_PLANS } from '../server/planService.js';
import { setMockFirebaseAdmin } from '../server/firebaseAdmin.js';

function createInMemoryFirestore() {
  const collections = new Map<string, Map<string, any>>();
  const writeCounts = new Map<string, number>();

  function getCol(name: string) {
    if (!collections.has(name)) {
      collections.set(name, new Map<string, any>());
    }
    return collections.get(name)!;
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
    collection: (colName: string) => {
      const col = getCol(colName);
      return {
        doc: (docId: string) => makeDocRef(colName, docId),
        get: async () => {
          const docs = Array.from(col.entries()).map(([id, data]) => ({
            id,
            data: () => JSON.parse(JSON.stringify(data))
          }));
          return {
            empty: docs.length === 0,
            docs
          };
        }
      };
    },
    batch: () => {
      const ops: Array<() => Promise<void>> = [];
      return {
        set: (docRef: any, data: any, opts?: any) => {
          ops.push(async () => { await docRef.set(data, opts); });
        },
        commit: async () => {
          for (const op of ops) await op();
        }
      };
    }
  };
}

describe('FASE 4.9B — Status Absoluto de Planos + Proteção contra Duplo Submit', () => {
  const rootDir = process.cwd();
  const appContextPath = path.join(rootDir, 'src', 'context', 'AppContext.tsx');
  const serverPath = path.join(rootDir, 'server.ts');
  const planServicePath = path.join(rootDir, 'src', 'server', 'planService.ts');
  const builderPath = path.join(rootDir, 'src', 'components', 'masteradmin', 'MasterAdminPlansBuilder.tsx');

  const appContextContent = fs.readFileSync(appContextPath, 'utf8');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  const planServiceContent = fs.readFileSync(planServicePath, 'utf8');
  const builderContent = fs.readFileSync(builderPath, 'utf8');

  let service: PlanService;
  let mockDb: ReturnType<typeof createInMemoryFirestore>;

  beforeEach(async () => {
    mockDb = createInMemoryFirestore();
    for (const p of DEFAULT_PLANS) {
      await mockDb.collection('plans').doc(p.id).set({ ...p });
    }
    setMockFirebaseAdmin({ firestore: mockDb });
    service = new PlanService();
  });

  afterEach(() => {
    setMockFirebaseAdmin(null);
  });

  describe('1. PlanService: Semântica Absoluta e Idempotência (P1)', () => {
    it('1.1. PlanService implementa setPlanStatus com semântica absoluta', async () => {
      assert.ok(
        typeof (service as any).setPlanStatus === 'function',
        'setPlanStatus deve ser uma função pública do PlanService'
      );
    });

    it('1.2. Transição de ACTIVE para INACTIVE com setPlanStatus', async () => {
      const plan = await service.getPlanById('plano-essencial');
      assert.ok(plan, 'Plano essencial deve existir');
      assert.strictEqual(plan.status, 'ACTIVE', 'Estado inicial deve ser ACTIVE');

      const updated = await service.setPlanStatus('plano-essencial', 'INACTIVE');
      assert.ok(updated, 'Plano atualizado deve ser retornado');
      assert.strictEqual(updated.status, 'INACTIVE', 'Status deve ter mudado para INACTIVE');
    });

    it('1.3. Idempotência estrita: Repetir targetStatus=INACTIVE NUNCA inverte para ACTIVE', async () => {
      // Primeira chamada: ACTIVE -> INACTIVE
      const firstRun = await service.setPlanStatus('plano-essencial', 'INACTIVE');
      assert.strictEqual(firstRun?.status, 'INACTIVE');

      // Segunda chamada com a mesma intenção: DEVE PERMANECER INACTIVE
      const secondRun = await service.setPlanStatus('plano-essencial', 'INACTIVE');
      assert.strictEqual(secondRun?.status, 'INACTIVE', 'Repetir a chamada deve manter INACTIVE, jamais inverter');

      // Terceira chamada: DEVE PERMANECER INACTIVE
      const thirdRun = await service.setPlanStatus('plano-essencial', 'INACTIVE');
      assert.strictEqual(thirdRun?.status, 'INACTIVE', 'Múltiplas chamadas devem ser estritamente idempotentes');
    });

    it('1.4. Transição de INACTIVE para ACTIVE e idempotência em ACTIVE', async () => {
      await service.setPlanStatus('plano-essencial', 'INACTIVE');

      // Transição para ACTIVE
      const activated = await service.setPlanStatus('plano-essencial', 'ACTIVE');
      assert.strictEqual(activated?.status, 'ACTIVE');

      // Repetição com ACTIVE deve manter ACTIVE
      const reactivated = await service.setPlanStatus('plano-essencial', 'ACTIVE');
      assert.strictEqual(reactivated?.status, 'ACTIVE', 'Repetir targetStatus=ACTIVE deve manter ACTIVE');
    });

    it('1.5. Retorna null para plano inexistente', async () => {
      const result = await service.setPlanStatus('plano-inexistente-xyz', 'INACTIVE');
      assert.strictEqual(result, null);
    });

    it('1.6. PlanService não possui mais o método togglePlanStatus relativo (zero callers)', () => {
      assert.strictEqual(
        typeof (service as any).togglePlanStatus,
        'undefined',
        'Método morto togglePlanStatus deve ser completamente removido de PlanService'
      );
      assert.ok(
        !planServiceContent.includes('togglePlanStatus'),
        'Não deve haver menção a togglePlanStatus em planService.ts'
      );
    });
  });

  describe('2. Contrato da Rota POST /api/plans/:id/toggle-status (server.ts)', () => {
    it('2.1. Rota está protegida por requireSuperAdmin', () => {
      const routeRegex = /app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status['"]\s*,\s*requireSuperAdmin/;
      assert.ok(routeRegex.test(serverContent), 'Rota deve estar protegida por requireSuperAdmin');
    });

    it('2.2. Exige body JSON com targetStatus ACTIVE ou INACTIVE (HTTP 400 se ausente/inválido)', () => {
      const routeBlock = serverContent.match(/app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status[\s\S]*?app\.post\(\s*['"]\/api\/plans\/:id\/duplicate/)?.[0];
      assert.ok(routeBlock, 'Bloco da rota toggle-status deve ser encontrado');

      assert.ok(
        routeBlock.includes('const { targetStatus } = req.body || {}') || routeBlock.includes('req.body'),
        'Rota deve extrair targetStatus do corpo da requisição'
      );
      assert.ok(
        routeBlock.includes('400') && (routeBlock.includes('ACTIVE') || routeBlock.includes('INACTIVE')),
        'Rota deve responder HTTP 400 se targetStatus for inválido ou ausente'
      );
    });

    it('2.3. Executa setPlanStatus com targetStatus absoluto e retorna HTTP 200', () => {
      const routeBlock = serverContent.match(/app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status[\s\S]*?app\.post\(\s*['"]\/api\/plans\/:id\/duplicate/)?.[0];
      assert.ok(routeBlock, 'Bloco da rota toggle-status deve ser encontrado');

      assert.ok(
        routeBlock.includes('setPlanStatus(id, targetStatus)'),
        'Rota deve invocar setPlanStatus com o targetStatus recebido'
      );
      assert.ok(
        routeBlock.includes('res.json(') && routeBlock.includes('success: true'),
        'Rota deve responder com success: true'
      );
    });
  });

  describe('3. AppContext: togglePlanStatus com targetStatus obrigatório e Fail-Closed', () => {
    it('3.1. togglePlanStatus exige targetStatus obrigatório e não possui fallback relativo', () => {
      const fnBlock = appContextContent.match(/const togglePlanStatus = async[\s\S]*?const duplicateCustomPlan/)?.[0];
      assert.ok(fnBlock, 'togglePlanStatus deve ser encontrado');

      // Assinatura com targetStatus estritamente obrigatório
      assert.ok(
        appContextContent.includes("togglePlanStatus: (planId: string, targetStatus: 'ACTIVE' | 'INACTIVE') => Promise") ||
        fnBlock.includes("targetStatus: 'ACTIVE' | 'INACTIVE'"),
        'Assinatura deve exigir targetStatus obrigatório'
      );
      assert.ok(
        !fnBlock.includes('targetStatus?:'),
        'Assinatura não deve permitir targetStatus opcional'
      );
      assert.ok(
        !fnBlock.includes('existing.status ===') && !fnBlock.includes('targetStatus ||'),
        'Não deve haver cálculo de fallback relativo no AppContext'
      );
      assert.ok(
        fnBlock.includes("'Content-Type': 'application/json'"),
        'Deve definir cabeçalho Content-Type application/json'
      );
      assert.ok(
        fnBlock.includes('body: JSON.stringify({ targetStatus })'),
        'Deve enviar body JSON estritamente com targetStatus'
      );
    });

    it('3.2. Preserva autorização estrita via Bearer token e Fail-Closed (FASE 4.8B)', () => {
      const fnBlock = appContextContent.match(/const togglePlanStatus = async[\s\S]*?const duplicateCustomPlan/)?.[0];
      assert.ok(fnBlock, 'togglePlanStatus deve ser encontrado');

      assert.ok(
        fnBlock.includes('await getIdTokenFromCurrentUser()'),
        'Deve obter o token Firebase Auth atual'
      );
      assert.ok(
        fnBlock.includes("'Authorization': `Bearer ${token}`"),
        'Deve enviar o cabeçalho Authorization: Bearer <token>'
      );
      assert.ok(
        fnBlock.includes('if (!token)') && fnBlock.includes('success: false'),
        'Deve falhar fechado se o token não existir'
      );
      assert.ok(
        fnBlock.includes('if (!res.ok)') && fnBlock.includes('success: false'),
        'Deve falhar fechado para HTTP não-2xx'
      );
      assert.ok(
        !fnBlock.includes("syncDoc('plans'") && !fnBlock.includes('syncDoc("plans"'),
        'Não deve haver escrita client-side direta via syncDoc'
      );
    });
  });

  describe('4. MasterAdminPlansBuilder: Proteção contra Duplo Submit (In-Flight Guards)', () => {
    it('4.1. Mantém estado de rastreamento de operações em voo', () => {
      assert.ok(
        builderContent.includes('togglingPlanIds') && builderContent.includes('setTogglingPlanIds'),
        'Componente deve rastrear IDs de planos com toggle em voo'
      );
      assert.ok(
        builderContent.includes('duplicatingPlanIds') && builderContent.includes('setDuplicatingPlanIds'),
        'Componente deve rastrear IDs de planos com duplicação em voo'
      );
    });

    it('4.2. handleToggleStatus bloqueia múltiplos cliques e envia targetStatus explícito', () => {
      const handlerBlock = builderContent.match(/const handleToggleStatus = async[\s\S]*?const filteredPlans/)?.[0];
      assert.ok(handlerBlock, 'handleToggleStatus deve ser encontrado');

      assert.ok(
        handlerBlock.includes('if (togglingPlanIds[planId]) return;'),
        'Deve ignorar chamadas adicionais se já houver operação em andamento para o plano'
      );
      assert.ok(
        handlerBlock.includes('finally'),
        'Deve liberar o bloqueio no bloco finally'
      );
      assert.ok(
        handlerBlock.includes('togglePlanStatus(planId, desiredStatus)'),
        'Deve chamar togglePlanStatus com desiredStatus explícito'
      );
    });

    it('4.3. handleDuplicate bloqueia múltiplos cliques concorrentes', () => {
      const handlerBlock = builderContent.match(/const handleDuplicate = async[\s\S]*?const handleToggleStatus/)?.[0];
      assert.ok(handlerBlock, 'handleDuplicate deve ser encontrado');

      assert.ok(
        handlerBlock.includes('if (duplicatingPlanIds[planId]) return;'),
        'Deve ignorar cliques adicionais se a duplicação já estiver em andamento'
      );
      assert.ok(
        handlerBlock.includes('finally'),
        'Deve liberar o bloqueio no bloco finally'
      );
    });

    it('4.4. Botões no JSX são desabilitados durante a operação em voo', () => {
      assert.ok(
        builderContent.includes('id={`btn-toggle-plan-${plan.id}`}') && builderContent.includes('disabled={isToggling}'),
        'Botão de toggle deve ter disabled={isToggling}'
      );
      assert.ok(
        builderContent.includes('id={`btn-duplicate-plan-${plan.id}`}') && builderContent.includes('disabled={isDuplicating}'),
        'Botão de duplicar deve ter disabled={isDuplicating}'
      );
    });
  });

  describe('5. FASE 4.9B.4 — Resiliência a Cache Stale Multi-Instância e Autoridade Transacional Firestore', () => {
    it('5.1. cache B ACTIVE / Firestore INACTIVE / target ACTIVE -> não pode executar falso no-op', async () => {
      // 1. Firestore autoritativo está INACTIVE (ex: instância A inativou)
      await mockDb.collection('plans').doc('plano-essencial').set({ status: 'INACTIVE' }, { merge: true });

      // 2. Instância B possui cache local stale ACTIVE
      const instanceB = new PlanService();
      instanceB.setLocalCacheStatusForTesting('plano-essencial', 'ACTIVE');

      // 3. Operador envia targetStatus ACTIVE para a Instância B
      const result = await instanceB.setPlanStatus('plano-essencial', 'ACTIVE');

      assert.ok(result, 'Resultado não deve ser nulo');
      assert.strictEqual(result.status, 'ACTIVE', 'Status retornado deve ser ACTIVE');
      assert.strictEqual(result.changed, true, 'changed deve ser true pois o Firestore estava INACTIVE');
      assert.strictEqual(result.previousStatus, 'INACTIVE', 'previousStatus autoritativo deve ser INACTIVE');

      // 4. Verifica que o Firestore autoritativo foi efetivamente atualizado para ACTIVE
      const docSnap = await mockDb.collection('plans').doc('plano-essencial').get();
      assert.strictEqual(docSnap.data()?.status, 'ACTIVE', 'Firestore autoritativo deve estar ACTIVE (sem falso no-op)');

      // 5. Cache local da instância B agora reflete ACTIVE
      const cached = await instanceB.getPlanById('plano-essencial');
      assert.strictEqual(cached?.status, 'ACTIVE');
    });

    it('5.2. cache B INACTIVE / Firestore ACTIVE / target INACTIVE -> não pode executar falso no-op', async () => {
      // 1. Firestore autoritativo está ACTIVE
      await mockDb.collection('plans').doc('plano-essencial').set({ status: 'ACTIVE' }, { merge: true });

      // 2. Instância B possui cache local stale INACTIVE
      const instanceB = new PlanService();
      instanceB.setLocalCacheStatusForTesting('plano-essencial', 'INACTIVE');

      // 3. Operador envia targetStatus INACTIVE para a Instância B
      const result = await instanceB.setPlanStatus('plano-essencial', 'INACTIVE');

      assert.ok(result, 'Resultado não deve ser nulo');
      assert.strictEqual(result.status, 'INACTIVE', 'Status retornado deve ser INACTIVE');
      assert.strictEqual(result.changed, true, 'changed deve ser true pois o Firestore estava ACTIVE');
      assert.strictEqual(result.previousStatus, 'ACTIVE', 'previousStatus autoritativo deve ser ACTIVE');

      // 4. Firestore autoritativo deve estar INACTIVE
      const docSnap = await mockDb.collection('plans').doc('plano-essencial').get();
      assert.strictEqual(docSnap.data()?.status, 'INACTIVE', 'Firestore autoritativo deve estar INACTIVE (sem falso no-op)');
    });

    it('5.3. Firestore já ACTIVE / target ACTIVE -> verdadeiro no-op autoritativo', async () => {
      // 1. Firestore já está ACTIVE
      await mockDb.collection('plans').doc('plano-essencial').set({ status: 'ACTIVE' }, { merge: true });
      mockDb.resetWriteCounts();

      const instance = new PlanService();
      const result = await instance.setPlanStatus('plano-essencial', 'ACTIVE');

      assert.ok(result);
      assert.strictEqual(result.status, 'ACTIVE');
      assert.strictEqual(result.changed, false, 'changed deve ser false para verdadeiro no-op');
      assert.strictEqual(result.previousStatus, 'ACTIVE');

      // 2. Nenhum write deve ter sido disparado no Firestore para o plano
      assert.strictEqual(
        mockDb.getWriteCount('plans', 'plano-essencial'),
        0,
        'Nenhum write deve ser executado no Firestore para no-op autoritativo'
      );
    });

    it('5.4. Firestore já INACTIVE / target INACTIVE -> verdadeiro no-op autoritativo', async () => {
      // 1. Firestore já está INACTIVE
      await mockDb.collection('plans').doc('plano-essencial').set({ status: 'INACTIVE' }, { merge: true });
      mockDb.resetWriteCounts();

      const instance = new PlanService();
      const result = await instance.setPlanStatus('plano-essencial', 'INACTIVE');

      assert.ok(result);
      assert.strictEqual(result.status, 'INACTIVE');
      assert.strictEqual(result.changed, false, 'changed deve ser false para verdadeiro no-op');
      assert.strictEqual(result.previousStatus, 'INACTIVE');

      // 2. Nenhum write no Firestore
      assert.strictEqual(
        mockDb.getWriteCount('plans', 'plano-essencial'),
        0,
        'Nenhum write deve ser executado no Firestore para no-op autoritativo'
      );
    });

    it('5.5. cache stale não decide audit suppression (server.ts usa changed autoritativo)', () => {
      // Auditoria na rota server.ts
      const routeBlock = serverContent.match(/app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status[\s\S]*?app\.post\(\s*['"]\/api\/plans\/:id\/duplicate/)?.[0];
      assert.ok(routeBlock, 'Bloco da rota toggle-status deve existir');

      // Não pode calcular isAlreadyInStatus via getPlanById()
      assert.ok(
        !routeBlock.includes('const isAlreadyInStatus = existingPlan.status === targetStatus'),
        'Rota não deve calcular isAlreadyInStatus usando existingPlan de getPlanById'
      );

      // Deve condicionar auditoria ao metadado changed retornado por setPlanStatus
      assert.ok(
        routeBlock.includes('if (updatedPlan.changed)') || routeBlock.includes('updatedPlan.changed'),
        'Rota deve usar updatedPlan.changed autoritativo para decidir gravação de auditoria'
      );
    });

    it('5.6. mutation atualiza cache local após persistência', async () => {
      const instance = new PlanService();
      await instance.setPlanStatus('plano-essencial', 'INACTIVE');

      // Imediatamente após a mutação, getPlanById local deve retornar o status atualizado
      const localPlan = await instance.getPlanById('plano-essencial');
      assert.strictEqual(localPlan?.status, 'INACTIVE', 'Cache local da instância deve ser atualizado imediatamente');
    });

    it('5.7. plano inexistente não é criado', async () => {
      const instance = new PlanService();
      const result = await instance.setPlanStatus('plano-fantasma-totalmente-inexistente', 'ACTIVE');

      assert.strictEqual(result, null, 'setPlanStatus deve retornar null para plano inexistente');

      // Verifica que o documento não foi criado no Firestore
      const docSnap = await mockDb.collection('plans').doc('plano-fantasma-totalmente-inexistente').get();
      assert.strictEqual(docSnap.exists, false, 'Documento de plano inexistente NUNCA deve ser criado');
    });

    it('5.8. target inválido continua 400 na rota (server.ts)', () => {
      const routeBlock = serverContent.match(/app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status[\s\S]*?app\.post\(\s*['"]\/api\/plans\/:id\/duplicate/)?.[0];
      assert.ok(routeBlock, 'Bloco da rota toggle-status deve existir');

      assert.ok(
        routeBlock.includes('400') && routeBlock.includes('targetStatus !== \'ACTIVE\' && targetStatus !== \'INACTIVE\''),
        'Rota deve rejeitar targetStatus diferente de ACTIVE e INACTIVE com HTTP 400'
      );
    });

    it('5.9. requireSuperAdmin permanece obrigatório', () => {
      const routeRegex = /app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status['"]\s*,\s*requireSuperAdmin/;
      assert.ok(routeRegex.test(serverContent), 'Rota toggle-status deve continuar protegida por requireSuperAdmin');
    });

    it('5.10. regressão do contrato da FASE 4.8B: nenhuma escrita Client SDK/syncDoc(\'plans\')', () => {
      assert.ok(
        !appContextContent.includes("syncDoc('plans'") && !appContextContent.includes('syncDoc("plans"'),
        'AppContext não pode conter escrita direta via syncDoc para a coleção plans'
      );
      assert.ok(
        appContextContent.includes('togglePlanStatus'),
        'AppContext deve manter togglePlanStatus centralizado via API'
      );
    });
  });

  describe('6. FASE 4.9B.6 — Fail-Closed da Mutation quando Firestore Falha', () => {
    it('6.1. runTransaction lança antes do commit: setPlanStatus rejeita/lança erro (não inventa sucesso)', async () => {
      mockDb.runTransaction = async () => {
        throw new Error('Firestore connection timeout');
      };

      await assert.rejects(
        async () => {
          await service.setPlanStatus('plano-essencial', 'INACTIVE');
        },
        /Firestore connection timeout/,
        'setPlanStatus deve propagar erro sem engolir ou aplicar fallback'
      );
    });

    it('6.2. erro Firestore: cache local plansCache não muda (permanece no status anterior)', async () => {
      // Estado inicial em cache: ACTIVE
      const initial = await service.getPlanById('plano-essencial');
      assert.strictEqual(initial?.status, 'ACTIVE');

      mockDb.runTransaction = async () => {
        throw new Error('Firestore write failure');
      };

      try {
        await service.setPlanStatus('plano-essencial', 'INACTIVE');
      } catch {}

      // Cache local NÃO deve ter sido mutado para INACTIVE
      const afterFail = await service.getPlanById('plano-essencial');
      assert.strictEqual(
        afterFail?.status,
        'ACTIVE',
        'Cache local DEVE permanecer ACTIVE se o Firestore falhou'
      );
    });

    it('6.3. erro Firestore: changed=true NÃO é produzido', async () => {
      mockDb.runTransaction = async () => {
        throw new Error('Firestore partition error');
      };

      let resultEmitted: any = null;
      try {
        resultEmitted = await service.setPlanStatus('plano-essencial', 'INACTIVE');
      } catch {}

      assert.strictEqual(resultEmitted, null, 'Nenhum resultado com changed=true pode ser emitido');
    });

    it('6.4. erro Firestore: nenhum audit PLAN_STATUS_TOGGLED é disparado na rota', () => {
      const routeBlock = serverContent.match(/app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status[\s\S]*?app\.post\(\s*['"]\/api\/plans\/:id\/duplicate/)?.[0];
      assert.ok(routeBlock, 'Bloco da rota toggle-status deve existir');

      assert.ok(
        routeBlock.includes('try {') && routeBlock.includes('} catch (err: any) {'),
        'Rota deve possuir bloco try/catch para garantir fail-closed'
      );

      const tryIndex = routeBlock.indexOf('try {');
      const auditIndex = routeBlock.indexOf('recordAuditLog');
      const catchIndex = routeBlock.indexOf('} catch (err');
      assert.ok(auditIndex > tryIndex && auditIndex < catchIndex, 'recordAuditLog deve estar estritamente protegido antes do catch');
    });

    it('6.5. erro Firestore na rota: responde HTTP não-2xx (HTTP 500)', () => {
      const routeBlock = serverContent.match(/app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status[\s\S]*?app\.post\(\s*['"]\/api\/plans\/:id\/duplicate/)?.[0];
      assert.ok(
        routeBlock.includes('res.status(500).json('),
        'Catch block deve responder HTTP 500'
      );
    });

    it('6.6. resposta de erro: success não é true (success: false)', () => {
      const routeBlock = serverContent.match(/app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status[\s\S]*?app\.post\(\s*['"]\/api\/plans\/:id\/duplicate/)?.[0];
      assert.ok(routeBlock, 'Bloco da rota deve existir');
      assert.ok(
        routeBlock.includes('res.status(500).json(') && routeBlock.includes('success: false'),
        'Resposta de erro deve conter success: false'
      );
    });

    it('6.7. resposta de erro: não contém mensagem de sucesso', () => {
      const routeBlock = serverContent.match(/app\.post\(\s*['"]\/api\/plans\/:id\/toggle-status[\s\S]*?app\.post\(\s*['"]\/api\/plans\/:id\/duplicate/)?.[0];
      assert.ok(routeBlock, 'Bloco da rota deve existir');
      const catchIndex = routeBlock.indexOf('} catch (err: any) {');
      assert.ok(catchIndex > 0, 'Catch block deve existir');
      const catchSnippet = routeBlock.slice(catchIndex);
      assert.ok(
        !catchSnippet.includes('com sucesso') && !catchSnippet.includes('Plano ativado') && !catchSnippet.includes('Plano inativado'),
        'Mensagem de erro não pode conter texto de sucesso'
      );
    });

    it('6.8. retry após erro: nova tentativa autoritativa aplica target normalmente', async () => {
      let failFirstAttempt = true;
      const originalTx = mockDb.runTransaction;
      mockDb.runTransaction = async (fn: any) => {
        if (failFirstAttempt) {
          failFirstAttempt = false;
          throw new Error('Transient error on first attempt');
        }
        return originalTx(fn);
      };

      // Tentativa 1: falha
      await assert.rejects(async () => {
        await service.setPlanStatus('plano-essencial', 'INACTIVE');
      }, /Transient error/);

      // Tentativa 2 (retry): sucede e persiste no Firestore
      const retryResult = await service.setPlanStatus('plano-essencial', 'INACTIVE');
      assert.ok(retryResult);
      assert.strictEqual(retryResult.status, 'INACTIVE');
      assert.strictEqual(retryResult.changed, true);

      const docSnap = await mockDb.collection('plans').doc('plano-essencial').get();
      assert.strictEqual(docSnap.data()?.status, 'INACTIVE', 'Firestore autoritativo deve refletir status após retry');
    });

    it('6.9. cenário de commit já refletido: retry observa target e executa verdadeiro no-op', async () => {
      // Simula que a escrita anterior de fato comitou no Firestore
      await mockDb.collection('plans').doc('plano-essencial').set({ status: 'INACTIVE' }, { merge: true });
      mockDb.resetWriteCounts();

      // Retry do operador com a mesma intenção INACTIVE
      const result = await service.setPlanStatus('plano-essencial', 'INACTIVE');
      assert.ok(result);
      assert.strictEqual(result.status, 'INACTIVE');
      assert.strictEqual(result.changed, false, 'Deve identificar estado já atingido e retornar changed=false');
      assert.strictEqual(mockDb.getWriteCount('plans', 'plano-essencial'), 0, 'Zero writes no Firestore para verdadeiro no-op no retry');
    });

    it('6.10. stale-cache tests da FASE 4.9B.4 continuam verdes', async () => {
      // Firestore INACTIVE, cache local forçado para ACTIVE, target ACTIVE
      await mockDb.collection('plans').doc('plano-essencial').set({ status: 'INACTIVE' }, { merge: true });
      service.setLocalCacheStatusForTesting('plano-essencial', 'ACTIVE');

      const result = await service.setPlanStatus('plano-essencial', 'ACTIVE');
      assert.ok(result);
      assert.strictEqual(result.status, 'ACTIVE');
      assert.strictEqual(result.changed, true);

      const docSnap = await mockDb.collection('plans').doc('plano-essencial').get();
      assert.strictEqual(docSnap.data()?.status, 'ACTIVE');
    });
  });
});
