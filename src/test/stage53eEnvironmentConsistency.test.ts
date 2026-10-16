import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getAppEnv,
  resolveClientFirebaseConfig,
  resolveServerFirebaseConfig,
  validateEnvironmentIdentityConsistency,
  ORIGINAL_PRODUCTION_PROJECT_ID,
  ORIGINAL_PRODUCTION_DATABASE_ID
} from '../lib/environmentConfig.js';
import defaultFirebaseConfig from '../../firebase-applet-config.json';

describe('MY BARBER — FASE 5.3E: Verificação de Consistência Frontend/Backend para Sandbox', () => {

  // =========================================================================
  // 1. RESOLUÇÃO DE APP_ENV NO FRONTEND E NO BACKEND
  // =========================================================================
  describe('1. Resolução Canônica de APP_ENV', () => {
    it('1.1. VITE_APP_ENV=sandbox no frontend resolve ambiente sandbox', () => {
      const origVite = process.env.VITE_APP_ENV;
      const origApp = process.env.APP_ENV;
      try {
        delete process.env.APP_ENV;
        process.env.VITE_APP_ENV = 'sandbox';
        assert.strictEqual(getAppEnv(), 'sandbox');
      } finally {
        if (origVite !== undefined) process.env.VITE_APP_ENV = origVite; else delete process.env.VITE_APP_ENV;
        if (origApp !== undefined) process.env.APP_ENV = origApp; else delete process.env.APP_ENV;
      }
    });

    it('1.2. APP_ENV=sandbox no backend resolve ambiente sandbox', () => {
      const origApp = process.env.APP_ENV;
      try {
        process.env.APP_ENV = 'sandbox';
        assert.strictEqual(getAppEnv(), 'sandbox');
      } finally {
        if (origApp !== undefined) process.env.APP_ENV = origApp; else delete process.env.APP_ENV;
      }
    });

    it('1.3. NODE_ENV=production com APP_ENV=sandbox preserva modo sandbox (Cloud Run)', () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origAppEnv = process.env.APP_ENV;
      try {
        process.env.NODE_ENV = 'production';
        process.env.APP_ENV = 'sandbox';
        assert.strictEqual(getAppEnv(), 'sandbox', 'APP_ENV=sandbox deve ter precedência sobre NODE_ENV=production');
      } finally {
        if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv; else delete process.env.NODE_ENV;
        if (origAppEnv !== undefined) process.env.APP_ENV = origAppEnv; else delete process.env.APP_ENV;
      }
    });
  });

  // =========================================================================
  // 2. CONSISTÊNCIA DE IDENTIDADE ENTRE CLIENTE E SERVIDOR
  // =========================================================================
  describe('2. Consistência de Identidade Firebase (Client vs Server)', () => {
    it('2.1. Detecta e rejeita divergência de Project ID entre cliente e servidor', () => {
      const clientConfig = {
        projectId: 'sandbox-project-client-123',
        firestoreDatabaseId: 'sandbox-firestore-db',
        apiKey: 'AIzaSy_CLIENT_KEY',
        appId: '1:123:web:client',
        authDomain: 'sandbox-project-client-123.firebaseapp.com'
      };

      const serverConfig = {
        projectId: 'sandbox-project-server-999',
        firestoreDatabaseId: 'sandbox-firestore-db',
        apiKey: 'AIzaSy_SERVER_KEY',
        appId: '1:123:web:server',
        authDomain: 'sandbox-project-server-999.firebaseapp.com'
      };

      const result = validateEnvironmentIdentityConsistency(clientConfig, serverConfig);
      assert.strictEqual(result.consistent, false);
      assert.ok(result.error?.includes('Divergência de Firebase Project ID entre Frontend'));
    });

    it('2.2. Detecta e rejeita divergência de Firestore Database ID entre cliente e servidor', () => {
      const clientConfig = {
        projectId: 'sandbox-project-unified',
        firestoreDatabaseId: 'sandbox-db-a',
        apiKey: 'AIzaSy_CLIENT_KEY',
        appId: '1:123:web:client',
        authDomain: 'sandbox-project-unified.firebaseapp.com'
      };

      const serverConfig = {
        projectId: 'sandbox-project-unified',
        firestoreDatabaseId: 'sandbox-db-b',
        apiKey: 'AIzaSy_SERVER_KEY',
        appId: '1:123:web:server',
        authDomain: 'sandbox-project-unified.firebaseapp.com'
      };

      const result = validateEnvironmentIdentityConsistency(clientConfig, serverConfig);
      assert.strictEqual(result.consistent, false);
      assert.ok(result.error?.includes('Divergência de Firestore Database ID entre Frontend'));
    });

    it('2.3. Aprova com consistência total quando cliente e servidor compartilham mesma infraestrutura', () => {
      const clientConfig = {
        projectId: 'sandbox-project-unified',
        firestoreDatabaseId: 'sandbox-db-unified',
        apiKey: 'AIzaSy_CLIENT_KEY',
        appId: '1:123:web:client',
        authDomain: 'sandbox-project-unified.firebaseapp.com',
        storageBucket: 'sandbox-project-unified.firebasestorage.app'
      };

      const serverConfig = {
        projectId: 'sandbox-project-unified',
        firestoreDatabaseId: 'sandbox-db-unified',
        apiKey: 'AIzaSy_SERVER_KEY',
        appId: '1:123:web:server',
        authDomain: 'sandbox-project-unified.firebaseapp.com',
        storageBucket: 'sandbox-project-unified.firebasestorage.app'
      };

      const result = validateEnvironmentIdentityConsistency(clientConfig, serverConfig);
      assert.strictEqual(result.consistent, true);
      assert.strictEqual(result.projectId, 'sandbox-project-unified');
      assert.strictEqual(result.firestoreDatabaseId, 'sandbox-db-unified');
    });
  });

  // =========================================================================
  // 3. FAIL-CLOSED NO BUILD SANDBOX SEM VARIÁVEIS OBRIGATÓRIAS
  // =========================================================================
  describe('3. Fail-Closed no Build Sandbox sem Variáveis Obrigatórias', () => {
    it('3.1. Rejeita build Sandbox sem VITE_FIREBASE_API_KEY', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: 'sandbox-valid-project',
            firestoreDatabaseId: 'sandbox-valid-db',
            apiKey: '',
            appId: '1:1234:web:app'
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('APP_ENV=sandbox exige VITE_FIREBASE_API_KEY dedicada'));
          return true;
        }
      );
    });

    it('3.2. Rejeita build Sandbox sem VITE_FIREBASE_APP_ID', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: 'sandbox-valid-project',
            firestoreDatabaseId: 'sandbox-valid-db',
            apiKey: 'AIzaSy_SANDBOX_KEY',
            appId: ''
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('APP_ENV=sandbox exige VITE_FIREBASE_APP_ID dedicado'));
          return true;
        }
      );
    });

    it('3.3. Rejeita build Sandbox sem VITE_FIREBASE_PROJECT_ID', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: '',
            firestoreDatabaseId: 'sandbox-valid-db',
            apiKey: 'AIzaSy_SANDBOX_KEY',
            appId: '1:1234:web:app'
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('APP_ENV=sandbox exige VITE_FIREBASE_PROJECT_ID dedicado'));
          return true;
        }
      );
    });

    it('3.4. Rejeita build Sandbox sem VITE_FIREBASE_FIRESTORE_DATABASE_ID', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: 'sandbox-valid-project',
            firestoreDatabaseId: '',
            apiKey: 'AIzaSy_SANDBOX_KEY',
            appId: '1:1234:web:app'
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('APP_ENV=sandbox exige VITE_FIREBASE_FIRESTORE_DATABASE_ID dedicado'));
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 4. AUSÊNCIA ABSOLUTA DE FALLBACK PARA O PROJETO ATUAL
  // =========================================================================
  describe('4. Ausência de Fallback para o Projeto Atual em Sandbox', () => {
    it('4.1. Rejeita cliente Sandbox apontando para API Key de produção atual', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: 'sandbox-valid-project',
            firestoreDatabaseId: 'sandbox-valid-db',
            apiKey: defaultFirebaseConfig.apiKey, // chave de produção atual
            appId: '1:9999:web:sandbox'
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('aponta para a API Key de produção do Firebase'));
          return true;
        }
      );
    });

    it('4.2. Rejeita cliente Sandbox apontando para App ID de produção atual', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: 'sandbox-valid-project',
            firestoreDatabaseId: 'sandbox-valid-db',
            apiKey: 'AIzaSy_VALID_SANDBOX_KEY',
            appId: defaultFirebaseConfig.appId // app ID de produção atual
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('aponta para o App ID de produção do Firebase'));
          return true;
        }
      );
    });

    it('4.3. Rejeita cliente Sandbox apontando para Firestore Database ID de produção atual', () => {
      assert.throws(
        () => {
          resolveClientFirebaseConfig({
            appEnv: 'sandbox',
            projectId: 'sandbox-valid-project',
            firestoreDatabaseId: ORIGINAL_PRODUCTION_DATABASE_ID,
            apiKey: 'AIzaSy_VALID_SANDBOX_KEY',
            appId: '1:9999:web:sandbox'
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('aponta para o Firestore Database ID atual de produção'));
          return true;
        }
      );
    });

    it('4.4. Rejeita backend Sandbox apontando para Firestore Database ID de produção atual', () => {
      assert.throws(
        () => {
          resolveServerFirebaseConfig({
            appEnv: 'sandbox',
            projectId: 'sandbox-valid-project',
            firestoreDatabaseId: ORIGINAL_PRODUCTION_DATABASE_ID
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('aponta para o Firestore Database ID atual de produção'));
          return true;
        }
      );
    });

    it('4.5. Rejeita FIREBASE_SERVICE_ACCOUNT de produção em backend Sandbox', () => {
      const origSA = process.env.FIREBASE_SERVICE_ACCOUNT;
      try {
        process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
          project_id: ORIGINAL_PRODUCTION_PROJECT_ID,
          client_email: 'sa@prod.iam.gserviceaccount.com'
        });

        assert.throws(
          () => {
            resolveServerFirebaseConfig({
              appEnv: 'sandbox',
              projectId: 'sandbox-valid-project',
              firestoreDatabaseId: 'sandbox-db'
            });
          },
          (err: Error) => {
            assert.ok(err.message.includes('FIREBASE_SERVICE_ACCOUNT pertence ao projeto de produção'));
            return true;
          }
        );
      } finally {
        if (origSA !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = origSA; else delete process.env.FIREBASE_SERVICE_ACCOUNT;
      }
    });
  });
});
