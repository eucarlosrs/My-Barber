import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import {
  parseReconcileArgs,
  runPlansReconciliation,
  EXPECTED_PROJECT_ID,
  EXPECTED_DATABASE_ID
} from '../../scripts/reconcile-firestore-plans.js';
import { setMockFirebaseAdmin } from '../server/firebaseAdmin.js';

describe('MY BARBER — Testes de Segurança e Hardening de Reconciliação dos Planos (Fail-Closed)', () => {
  const createdBackupFiles: string[] = [];

  function createMockFirestore(databaseId = EXPECTED_DATABASE_ID, initialPlans: any[] = []) {
    let batchCommitCalled = false;
    let readPlansCalled = false;
    let readSubscriptionsCalled = false;

    const plansList = [...initialPlans];

    return {
      _databaseId: { database: databaseId },
      didCommitBatch: () => batchCommitCalled,
      didReadPlans: () => readPlansCalled,
      didReadSubscriptions: () => readSubscriptionsCalled,
      collection: (colName: string) => {
        if (colName === 'plans') readPlansCalled = true;
        if (colName === 'subscriptions') readSubscriptionsCalled = true;

        return {
          get: async () => {
            const list = colName === 'plans' ? plansList : [];
            return {
              size: list.length,
              docs: list.map(item => ({
                id: item.id,
                data: () => item
              }))
            };
          },
          doc: (docId: string) => ({
            id: docId
          })
        };
      },
      batch: () => ({
        set: () => {},
        commit: async () => {
          batchCommitCalled = true;
        }
      })
    };
  }

  beforeEach(() => {
    setMockFirebaseAdmin(null);
  });

  afterEach(() => {
    setMockFirebaseAdmin(null);
    for (const file of createdBackupFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch {}
    }
    createdBackupFiles.length = 0;
  });

  // 1. Parser de argumentos CLI e fail-safe defaults
  describe('1. Validações do CLI e Modo Padrão Fail-Safe', () => {
    it('1.1 parseReconcileArgs: sem argumentos deve ativar modo DRY-RUN por padrão', () => {
      const parsed = parseReconcileArgs([]);
      assert.strictEqual(parsed.dryRun, true, 'Deve ativar dryRun quando nenhum argumento for passado');
      assert.strictEqual(parsed.apply, false, 'apply deve ser false');
      assert.strictEqual(parsed.confirm, false, 'confirm deve ser false');
    });

    it('1.2 parseReconcileArgs: flag --dry-run explícita garante modo de simulação', () => {
      const parsed = parseReconcileArgs(['--dry-run']);
      assert.strictEqual(parsed.dryRun, true);
    });

    it('1.3 parseReconcileArgs: extrai corretamente --operator e --project', () => {
      const parsed = parseReconcileArgs([
        '--project', EXPECTED_PROJECT_ID,
        '--operator', 'devops@mybarber.test'
      ]);
      assert.strictEqual(parsed.projectId, EXPECTED_PROJECT_ID);
      assert.strictEqual(parsed.operator, 'devops@mybarber.test');
      assert.strictEqual(parsed.dryRun, true);
    });

    it('1.4 parseReconcileArgs: suporta formato --flag=valor', () => {
      const parsed = parseReconcileArgs([
        `--project=${EXPECTED_PROJECT_ID}`,
        '--operator=admin@mybarber.test'
      ]);
      assert.strictEqual(parsed.projectId, EXPECTED_PROJECT_ID);
      assert.strictEqual(parsed.operator, 'admin@mybarber.test');
    });
  });

  // 2. Validação Fail-Closed do Projeto Firebase (connectedProject)
  describe('2. Validação Fail-Closed do Projeto Firebase', () => {
    it('2.1 Aborta imediatamente se connectedProject for de outro projeto (ex: cs-music-502319)', async () => {
      const mockFirestore = createMockFirestore(EXPECTED_DATABASE_ID);
      setMockFirebaseAdmin({
        app: { options: { projectId: 'cs-music-502319' } } as any,
        firestore: mockFirestore as any
      });

      await assert.rejects(
        async () => {
          await runPlansReconciliation({ dryRun: true, apply: false, confirm: false });
        },
        (err: Error) => {
          assert.match(err.message, /projeto Firebase conectado incorreto \('cs-music-502319'\)/i);
          assert.match(err.message, new RegExp(EXPECTED_PROJECT_ID));
          return true;
        }
      );

      // Garante que NENHUMA leitura ou escrita ocorreu antes do bloqueio
      assert.strictEqual(mockFirestore.didReadPlans(), false, 'Não deve ler planos se o projeto estiver errado');
      assert.strictEqual(mockFirestore.didCommitBatch(), false, 'Não deve gravar nada no Firestore');
    });

    it('2.2 Aborta se connectedProject for indefinido ou vazio', async () => {
      const mockFirestore = createMockFirestore(EXPECTED_DATABASE_ID);
      setMockFirebaseAdmin({
        app: { options: {} } as any,
        firestore: mockFirestore as any
      });

      await assert.rejects(
        async () => {
          await runPlansReconciliation({ dryRun: true, apply: false, confirm: false });
        },
        (err: Error) => {
          assert.match(err.message, /projeto Firebase conectado incorreto \('nenhum'\)/i);
          return true;
        }
      );

      assert.strictEqual(mockFirestore.didReadPlans(), false);
      assert.strictEqual(mockFirestore.didCommitBatch(), false);
    });

    it('2.3 Aborta se o argumento --project informado divergir do projeto oficial', async () => {
      const mockFirestore = createMockFirestore(EXPECTED_DATABASE_ID);
      setMockFirebaseAdmin({
        app: { options: { projectId: EXPECTED_PROJECT_ID } } as any,
        firestore: mockFirestore as any
      });

      await assert.rejects(
        async () => {
          await runPlansReconciliation({
            dryRun: true,
            apply: false,
            confirm: false,
            projectId: 'outro-projeto-qualquer'
          });
        },
        (err: Error) => {
          assert.match(err.message, /argumento --project informado \('outro-projeto-qualquer'\) diverge/i);
          return true;
        }
      );

      assert.strictEqual(mockFirestore.didReadPlans(), false);
      assert.strictEqual(mockFirestore.didCommitBatch(), false);
    });
  });

  // 3. Validação Fail-Closed do Banco Firestore Nomeado (connectedDb)
  describe('3. Validação Fail-Closed do Banco Firestore Nomeado', () => {
    it('3.1 Aborta imediatamente se conectado ao banco padrão (default) em vez do banco nomeado', async () => {
      const mockFirestore = createMockFirestore('(default)');
      setMockFirebaseAdmin({
        app: { options: { projectId: EXPECTED_PROJECT_ID } } as any,
        firestore: mockFirestore as any
      });

      await assert.rejects(
        async () => {
          await runPlansReconciliation({ dryRun: true, apply: false, confirm: false });
        },
        (err: Error) => {
          assert.match(err.message, /banco de dados Firestore incorreto \('\(default\)'\)/i);
          assert.match(err.message, new RegExp(EXPECTED_DATABASE_ID));
          return true;
        }
      );

      assert.strictEqual(mockFirestore.didReadPlans(), false, 'Não deve ler do banco padrão (default)');
      assert.strictEqual(mockFirestore.didCommitBatch(), false);
    });

    it('3.2 Aborta se conectado a outro banco nomeado desconhecido', async () => {
      const mockFirestore = createMockFirestore('outro-banco-nomeado');
      setMockFirebaseAdmin({
        app: { options: { projectId: EXPECTED_PROJECT_ID } } as any,
        firestore: mockFirestore as any
      });

      await assert.rejects(
        async () => {
          await runPlansReconciliation({ dryRun: true, apply: false, confirm: false });
        },
        (err: Error) => {
          assert.match(err.message, /banco de dados Firestore incorreto \('outro-banco-nomeado'\)/i);
          return true;
        }
      );

      assert.strictEqual(mockFirestore.didReadPlans(), false);
      assert.strictEqual(mockFirestore.didCommitBatch(), false);
    });
  });

  // 4. Execução em Modo DRY-RUN (Somente Leitura e Mapeamento)
  describe('4. Execução em Modo DRY-RUN (Simulação Sem Efeitos Colaterais)', () => {
    it('4.1 Em modo dry-run, lê planos mas NUNCA grava ou comita dados no Firestore', async () => {
      // Simula catálogo com apenas os 3 planos antigos e preços desatualizados no Premium
      const initialPlans = [
        { id: 'plano-essencial', name: 'Plano Essencial', priceMonthly: 39.90, promotionalPrice: 39.90, priceAfterPromotion: 39.90, billingCycle: 'MONTHLY' },
        { id: 'plano-profissional', name: 'Plano Profissional', priceMonthly: 69.90, promotionalPrice: 49.90, priceAfterPromotion: 69.90, billingCycle: 'MONTHLY' },
        { id: 'plano-premium', name: 'Plano Premium Multiunidades', priceMonthly: 89.90, promotionalPrice: 69.90, priceAfterPromotion: 89.90, billingCycle: 'MONTHLY' }
        // plano-vitalicio ausente no banco
      ];

      const mockFirestore = createMockFirestore(EXPECTED_DATABASE_ID, initialPlans);
      setMockFirebaseAdmin({
        app: { options: { projectId: EXPECTED_PROJECT_ID } } as any,
        firestore: mockFirestore as any
      });

      const result = await runPlansReconciliation({
        dryRun: true,
        apply: false,
        confirm: false,
        operator: 'auditor@mybarber.test'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.dryRun, true);
      assert.ok(result.backupPath, 'Deve gerar arquivo de snapshot de backup para auditoria local');
      createdBackupFiles.push(result.backupPath);

      // Verificação das ações mapeadas
      assert.ok(result.actions && result.actions.length > 0);

      // 1. Deve mapear criação do plano Vitalício (plano-vitalicio) ausente
      const lifetimeAction = result.actions.find(a => a.planId === 'plano-vitalicio');
      assert.ok(lifetimeAction, 'Deve identificar o plano Vitalício ausente');
      assert.strictEqual(lifetimeAction.type, 'CREATE');
      assert.strictEqual(lifetimeAction.payload.oneTimePrice, 799.00);
      assert.strictEqual(lifetimeAction.payload.billingCycle, 'ONE_TIME');

      // 2. Deve mapear atualização do plano Premium (plano-premium) com novos preços R$ 79,90 e R$ 99,90
      const premiumAction = result.actions.find(a => a.planId === 'plano-premium');
      assert.ok(premiumAction, 'Deve identificar a necessidade de atualização do Premium');
      assert.strictEqual(premiumAction.type, 'UPDATE');
      assert.strictEqual(premiumAction.payload.promotionalPrice, 79.90);
      assert.strictEqual(premiumAction.payload.priceMonthly, 99.90);

      // 3. Deve mapear preservação do plano Essencial e Profissional
      const basicAction = result.actions.find(a => a.planId === 'plano-essencial');
      assert.ok(basicAction);
      assert.strictEqual(basicAction.type, 'PRESERVE');

      // 4. CRÍTICO: batch.commit() NUNCA deve ser invocado em modo dry-run
      assert.strictEqual(mockFirestore.didCommitBatch(), false, 'Nenhuma gravação pode ocorrer no Firestore em dry-run');
    });

    it('4.2 Rejeita tentativa de escrita se faltar confirmação explícita (--confirm-reconciliation)', async () => {
      const mockFirestore = createMockFirestore(EXPECTED_DATABASE_ID, []);
      setMockFirebaseAdmin({
        app: { options: { projectId: EXPECTED_PROJECT_ID } } as any,
        firestore: mockFirestore as any
      });

      // apply: true, mas confirm: false -> deve cair em simulação
      const result = await runPlansReconciliation({
        dryRun: false,
        apply: true,
        confirm: false,
        operator: 'auditor@mybarber.test'
      });

      assert.strictEqual(result.dryRun, true, 'Sem a flag de confirmação, deve recuar para simulação');
      assert.strictEqual(mockFirestore.didCommitBatch(), false, 'Não deve gravar sem confirmação');
      if (result.backupPath) createdBackupFiles.push(result.backupPath);
    });
  });
});
