import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveClientFirebaseConfig,
  resolveServerFirebaseConfig,
  validateFinancialEnvironment,
  ORIGINAL_PRODUCTION_PROJECT_ID,
  ORIGINAL_PRODUCTION_DATABASE_ID
} from '../lib/environmentConfig.js';

describe('MY BARBER — FASE 5.3D: Isolamento Multitest & Sandbox Fail-Closed', () => {

  // =========================================================================
  // 1. CONFIGURAÇÃO PADRÃO DO AMBIENTE ATUAL (PRESERVAÇÃO INTACTA)
  // =========================================================================
  describe('1. Preservação do Ambiente Atual (Zero Impacto)', () => {
    it('1.1. resolveClientFirebaseConfig retorna exatamente as credenciais atuais quando não está em sandbox', () => {
      const config = resolveClientFirebaseConfig({ appEnv: 'development' });
      assert.strictEqual(config.projectId, ORIGINAL_PRODUCTION_PROJECT_ID);
      assert.strictEqual(config.firestoreDatabaseId, ORIGINAL_PRODUCTION_DATABASE_ID);
      assert.ok(config.appId, 'appId deve existir na configuração original');
      assert.ok(config.apiKey, 'apiKey deve existir na configuração original');
    });

    it('1.2. resolveServerFirebaseConfig retorna exatamente o projeto e banco atuais quando não está em sandbox', () => {
      const config = resolveServerFirebaseConfig({ appEnv: 'development' });
      assert.strictEqual(config.projectId, ORIGINAL_PRODUCTION_PROJECT_ID);
      assert.strictEqual(config.firestoreDatabaseId, ORIGINAL_PRODUCTION_DATABASE_ID);
    });
  });

  // =========================================================================
  // 2. CONFIGURAÇÃO COMPLETA DO FIREBASE SANDBOX
  // =========================================================================
  describe('2. Configuração Completa do Firebase Sandbox', () => {
    it('2.1. resolveClientFirebaseConfig aceita e aplica configurações dedicadas para Sandbox', () => {
      const config = resolveClientFirebaseConfig({
        appEnv: 'sandbox',
        projectId: 'mybarber-sandbox-cloud-proj',
        firestoreDatabaseId: 'mybarber-sandbox-firestore-db',
        apiKey: 'AIzaSy_SANDBOX_KEY',
        appId: '1:123456:web:sandboxAppId',
        authDomain: 'mybarber-sandbox-cloud-proj.firebaseapp.com'
      });

      assert.strictEqual(config.projectId, 'mybarber-sandbox-cloud-proj');
      assert.strictEqual(config.firestoreDatabaseId, 'mybarber-sandbox-firestore-db');
      assert.strictEqual(config.authDomain, 'mybarber-sandbox-cloud-proj.firebaseapp.com');
      assert.strictEqual(config.apiKey, 'AIzaSy_SANDBOX_KEY');
    });

    it('2.2. resolveServerFirebaseConfig aceita e aplica configurações dedicadas para backend Sandbox', () => {
      const config = resolveServerFirebaseConfig({
        appEnv: 'sandbox',
        projectId: 'mybarber-sandbox-cloud-proj',
        firestoreDatabaseId: 'mybarber-sandbox-firestore-db'
      });

      assert.strictEqual(config.projectId, 'mybarber-sandbox-cloud-proj');
      assert.strictEqual(config.firestoreDatabaseId, 'mybarber-sandbox-firestore-db');
    });
  });

  // =========================================================================
  // 3. FALHA SEGURA (FAIL-CLOSED) EM CONFIGURAÇÕES INCOMPLETAS DE SANDBOX
  // =========================================================================
  describe('3. Falhas Seguras Fail-Closed para Sandbox', () => {
    it('3.1. Falha segura se Sandbox não possui Firebase Project ID', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: '',
            firestoreDatabaseId: 'sandbox-db'
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('APP_ENV=sandbox exige VITE_FIREBASE_PROJECT_ID dedicado'));
          return true;
        }
      );
    });

    it('3.2. Falha segura se Sandbox não possui Firestore Database ID', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: 'sandbox-valid-project',
            firestoreDatabaseId: ''
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('APP_ENV=sandbox exige VITE_FIREBASE_FIRESTORE_DATABASE_ID dedicado'));
          return true;
        }
      );
    });

    it('3.3. Falha segura se Sandbox aponta acidentalmente para o projeto Firebase atual de produção', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: ORIGINAL_PRODUCTION_PROJECT_ID, // gen-lang-client-0472481079
            firestoreDatabaseId: 'sandbox-db'
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('aponta para o projeto Firebase atual de produção'));
          assert.ok(err.message.includes('Isolamento de ambiente violado'));
          return true;
        }
      );
    });

    it('3.4. Server SDK também rejeita fail-closed projeto de produção em Sandbox', () => {
      assert.throws(
        () => {
          resolveServerFirebaseConfig({
            appEnv: 'sandbox',
            projectId: ORIGINAL_PRODUCTION_PROJECT_ID,
            firestoreDatabaseId: 'sandbox-db'
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('Isolamento de ambiente violado'));
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 4. PROTEÇÃO DAS CREDENCIAIS FINANCEIRAS
  // =========================================================================
  describe('4. Proteção de Credenciais Financeiras por Ambiente', () => {
    it('4.1. Falha segura se Sandbox utiliza credencial de produção (APP_USR-...)', () => {
      const res = validateFinancialEnvironment('sandbox', {
        accessToken: 'APP_USR-789456123000-091011-fakeProdTokenSecretValue'
      });

      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes('proíbe estritamente o uso de Access Token de produção (APP_USR-...)'));
    });

    it('4.2. Falha segura se Sandbox utiliza token sem o prefixo oficial TEST-...', () => {
      const res = validateFinancialEnvironment('sandbox', {
        accessToken: 'random_invalid_token_without_prefix'
      });

      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes('O token deve possuir o prefixo oficial TEST-'));
    });

    it('4.3. Aprova com sucesso quando Sandbox utiliza credencial de teste válida (TEST-...)', () => {
      const res = validateFinancialEnvironment('sandbox', {
        accessToken: 'TEST-789456123000-091011-validSandboxToken',
        publicKey: 'TEST-pubkey-12345'
      });

      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.isSandboxCredentials, true);
    });

    it('4.4. Falha segura se Produção tenta utilizar token de teste (TEST-...)', () => {
      const res = validateFinancialEnvironment('production', {
        accessToken: 'TEST-789456123000-091011-validSandboxToken'
      });

      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes('APP_ENV=production proíbe o uso de credenciais Sandbox de teste (TEST-...)'));
    });

    it('4.5. Ausência absoluta de vazamento de secrets em logs ou mensagens de erro', () => {
      const secretSecretPayload = 'APP_USR-REAL_SECRET_THAT_MUST_NEVER_LEAK_INTO_OUTPUT';
      const res = validateFinancialEnvironment('sandbox', {
        accessToken: secretSecretPayload
      });

      assert.strictEqual(res.valid, false);
      assert.ok(!res.error?.includes('REAL_SECRET_THAT_MUST_NEVER_LEAK_INTO_OUTPUT'), 'O valor secreto NUNCA deve aparecer na mensagem de erro');
      assert.ok(res.error?.includes('APP_USR-'), 'Apenas o prefixo público de diagnóstico deve ser mencionado');
    });
  });
});
