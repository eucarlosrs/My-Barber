import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getAppEnv,
  resolveServerFirebaseConfig,
  validateFinancialEnvironment,
  ORIGINAL_PRODUCTION_PROJECT_ID,
  ORIGINAL_PRODUCTION_DATABASE_ID
} from '../server/serverEnvironmentConfig.js';
import {
  resolveClientFirebaseConfig,
  getAppEnv as getClientAppEnv
} from '../lib/environmentConfig.js';

describe('MY BARBER — FASE 5.4B: Hardening Backend CJS (import.meta) e Erro de Assinaturas', () => {

  // =========================================================================
  // PENDÊNCIA 1: AUSÊNCIA DE import.meta NO BACKEND & COMPATIBILIDADE CJS
  // =========================================================================
  describe('1. Pendência 1: Isolamento de import.meta no Backend e Compatibilidade CJS', () => {
    it('1.1 serverEnvironmentConfig.ts NÃO contém a sintaxe literal import.meta', () => {
      const serverEnvPath = path.resolve(process.cwd(), 'src/server/serverEnvironmentConfig.ts');
      assert.ok(fs.existsSync(serverEnvPath), 'src/server/serverEnvironmentConfig.ts deve existir');

      const content = fs.readFileSync(serverEnvPath, 'utf8');
      assert.strictEqual(
        content.includes('import.meta'),
        false,
        'src/server/serverEnvironmentConfig.ts NUNCA deve conter import.meta para evitar advertências no formato CJS'
      );
    });

    it('1.2 server.ts importa configurações de ambiente de serverEnvironmentConfig.js', () => {
      const serverPath = path.resolve(process.cwd(), 'server.ts');
      const content = fs.readFileSync(serverPath, 'utf8');

      assert.ok(
        content.includes("from './src/server/serverEnvironmentConfig.js'"),
        "server.ts deve importar exclusivamente de './src/server/serverEnvironmentConfig.js'"
      );
      assert.strictEqual(
        content.includes("from './src/lib/environmentConfig.js'"),
        false,
        "server.ts NÃO deve importar de './src/lib/environmentConfig.js'"
      );
    });

    it('1.3 firebaseAdmin.ts importa configurações de ambiente de serverEnvironmentConfig.js', () => {
      const fbAdminPath = path.resolve(process.cwd(), 'src/server/firebaseAdmin.ts');
      const content = fs.readFileSync(fbAdminPath, 'utf8');

      assert.ok(
        content.includes("from './serverEnvironmentConfig.js'"),
        "firebaseAdmin.ts deve importar de './serverEnvironmentConfig.js'"
      );
      assert.strictEqual(
        content.includes("from '../lib/environmentConfig.js'"),
        false,
        "firebaseAdmin.ts NÃO deve importar de '../lib/environmentConfig.js'"
      );
    });

    it('1.4 resolveServerFirebaseConfig opera fail-closed com constantes oficiais de produção', () => {
      const config = resolveServerFirebaseConfig({ appEnv: 'development' });
      assert.strictEqual(config.projectId, ORIGINAL_PRODUCTION_PROJECT_ID);
      assert.strictEqual(config.projectId, 'gen-lang-client-0472481079');
      assert.strictEqual(config.firestoreDatabaseId, ORIGINAL_PRODUCTION_DATABASE_ID);
      assert.strictEqual(config.firestoreDatabaseId, 'ai-studio-mybarber-1b7bcf67-417c-4eba-b227-1479fd547c81');
    });

    it('1.5 resolveServerFirebaseConfig em Sandbox rejeita apontamento para projeto ou banco de produção', () => {
      assert.throws(
        () => {
          resolveServerFirebaseConfig({
            appEnv: 'sandbox',
            projectId: ORIGINAL_PRODUCTION_PROJECT_ID,
            firestoreDatabaseId: 'valid-sandbox-db'
          });
        },
        /FALHA DE SEGURANÇA/
      );

      assert.throws(
        () => {
          resolveServerFirebaseConfig({
            appEnv: 'sandbox',
            projectId: 'valid-sandbox-proj',
            firestoreDatabaseId: ORIGINAL_PRODUCTION_DATABASE_ID
          });
        },
        /FALHA DE SEGURANÇA/
      );
    });

    it('1.6 validateFinancialEnvironment rejeita credencial de teste em produção fail-closed', () => {
      const result = validateFinancialEnvironment('production', { accessToken: 'TEST-1234567890-test' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('rejeitado em ambiente de PRODUÇÃO') || result.error?.includes('FALHA DE SEGURANÇA'));
    });
  });

  // =========================================================================
  // PENDÊNCIA 2: DIFERENCIAÇÃO ENTRE CONSULTA VAZIA E ERRO DE LEITURA
  // =========================================================================
  describe('2. Pendência 2: Diferenciação entre Consulta Vazia e Erro de Leitura', () => {
    it('2.1 firestoreSync.ts não chama onUpdate([]) ao ocorrer erro na coleção subscriptions', () => {
      const syncPath = path.resolve(process.cwd(), 'src/lib/firestoreSync.ts');
      const content = fs.readFileSync(syncPath, 'utf8');

      // Verifica se a assinatura do helper contém onError
      assert.ok(
        content.includes('onError?: (error: Error | null) => void'),
        'subscribeCollection deve aceitar onError callback'
      );

      // Localiza o bloco de tratamento de erro para subscriptions
      const subsErrorBlock = content.slice(
        content.indexOf("if (collectionName === 'subscriptions')"),
        content.indexOf("if (collectionName === 'subscriptions')") + 600
      );

      // O bloco de erro de subscriptions NÃO deve invocar onUpdate([])
      assert.strictEqual(
        subsErrorBlock.includes('onUpdate([])'),
        false,
        'O bloco de erro de subscriptions NÃO pode chamar onUpdate([]) para não mascarar falhas'
      );

      // O bloco deve notificar onError
      assert.ok(
        subsErrorBlock.includes('onError('),
        'O bloco de erro de subscriptions deve invocar o callback onError'
      );
    });

    it('2.2 AppContext define subscriptionsLoading e subscriptionsError para governança de estado', () => {
      const contextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
      const content = fs.readFileSync(contextPath, 'utf8');

      assert.ok(
        content.includes('subscriptionsLoading: boolean;'),
        'AppContextType deve incluir subscriptionsLoading'
      );
      assert.ok(
        content.includes('subscriptionsError: string | null;'),
        'AppContextType deve incluir subscriptionsError'
      );

      // Verifica presença de setSubscriptionsError no callback
      assert.ok(
        content.includes('setSubscriptionsError('),
        'AppContext deve gerenciar setSubscriptionsError nos listeners'
      );
    });

    it('2.3 MasterAdminView exibe alerta de erro explícito e NÃO confirma R$ 0,00 quando há erro', () => {
      const viewPath = path.resolve(process.cwd(), 'src/components/masteradmin/MasterAdminView.tsx');
      const content = fs.readFileSync(viewPath, 'utf8');

      assert.ok(
        content.includes('subscriptionsError'),
        'MasterAdminView deve consumir subscriptionsError'
      );
      assert.ok(
        content.includes('Erro de Leitura') || content.includes('Falha ao carregar'),
        'MasterAdminView deve exibir mensagem explícita de erro na leitura'
      );
      assert.ok(
        content.includes('Valor não confirmado') || content.includes('Falha na Consulta'),
        'MasterAdminView não deve confirmar R$ 0,00 quando a consulta de subscriptions falha'
      );
    });

    it('2.4 MasterAdminSubscriptions exibe estado de falha na tabela e nos cards se subscriptionsError estiver ativo', () => {
      const subMgrPath = path.resolve(process.cwd(), 'src/components/masteradmin/MasterAdminSubscriptions.tsx');
      const content = fs.readFileSync(subMgrPath, 'utf8');

      assert.ok(
        content.includes('subscriptionsError'),
        'MasterAdminSubscriptions deve consumir subscriptionsError'
      );
      assert.ok(
        content.includes('Não foi possível confirmar') || content.includes('Erro na Consulta'),
        'MasterAdminSubscriptions deve alertar que o valor não foi confirmado'
      );
      assert.ok(
        content.includes("Falha ao consultar coleção 'subscriptions' no Firestore"),
        'A tabela de assinaturas deve apresentar aviso explícito de falha no Firestore'
      );
    });

    it('2.5 MasterAdminPlansBuilder reflete status de indisponibilidade no MRR se houver erro', () => {
      const builderPath = path.resolve(process.cwd(), 'src/components/masteradmin/MasterAdminPlansBuilder.tsx');
      const content = fs.readFileSync(builderPath, 'utf8');

      assert.ok(
        content.includes('subscriptionsError'),
        'MasterAdminPlansBuilder deve consumir subscriptionsError'
      );
      assert.ok(
        content.includes('Indisponível (Erro)') || content.includes('Falha ao consultar Firestore'),
        'MasterAdminPlansBuilder deve indicar Indisponível em caso de erro de consulta'
      );
    });
  });

  // =========================================================================
  // 3. PRESERVAÇÃO INTEGRAL DOS 4 PLANOS E NENHUM DADO FICTÍCIO EM PRODUÇÃO
  // =========================================================================
  describe('3. Preservação dos Planos Oficiais e Ausência de Dados Fictícios', () => {
    it('3.1 INITIAL_SUBSCRIPTIONS e INITIAL_SUBSCRIPTION_PAYMENTS permanecem arrays vazios ([])', () => {
      const initPath = path.resolve(process.cwd(), 'src/data/initialData.ts');
      const content = fs.readFileSync(initPath, 'utf8');

      assert.ok(
        content.includes("export const INITIAL_SUBSCRIPTIONS: import('../types').Subscription[] = [];"),
        'INITIAL_SUBSCRIPTIONS deve permanecer canonicamente vazio ([])'
      );
      assert.ok(
        content.includes("export const INITIAL_SUBSCRIPTION_PAYMENTS: import('../types').SubscriptionPaymentRecord[] = [];"),
        'INITIAL_SUBSCRIPTION_PAYMENTS deve permanecer canonicamente vazio ([])'
      );
    });

    it('3.2 Catálogo de 4 planos em initialData.ts preserva Vitalício R$ 799 pagamento único', () => {
      const initPath = path.resolve(process.cwd(), 'src/data/initialData.ts');
      const content = fs.readFileSync(initPath, 'utf8');

      assert.ok(content.includes("id: 'plano-essencial'"));
      assert.ok(content.includes("id: 'plano-profissional'"));
      assert.ok(content.includes("id: 'plano-premium'"));
      assert.ok(content.includes("id: 'plano-vitalicio'"));

      assert.ok(content.includes("oneTimePrice: 799.00"));
      assert.ok(content.includes("isLifetime: true"));
      assert.ok(content.includes("billingCycle: 'ONE_TIME'"));
    });
  });
});
