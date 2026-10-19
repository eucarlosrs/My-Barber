import defaultFirebaseConfig from '../../firebase-applet-config.json';
import {
  type AppEnvironment,
  type FirebaseResolvedConfig,
  ORIGINAL_PRODUCTION_PROJECT_ID,
  ORIGINAL_PRODUCTION_DATABASE_ID,
  getAppEnv as getServerAppEnv,
  resolveServerFirebaseConfig,
  validateFinancialEnvironment,
  type FinancialValidationResult,
  type IdentityConsistencyResult,
  validateEnvironmentIdentityConsistency
} from '../server/serverEnvironmentConfig.js';

export type { AppEnvironment, FirebaseResolvedConfig, FinancialValidationResult, IdentityConsistencyResult };
export {
  ORIGINAL_PRODUCTION_PROJECT_ID,
  ORIGINAL_PRODUCTION_DATABASE_ID,
  resolveServerFirebaseConfig,
  validateFinancialEnvironment,
  validateEnvironmentIdentityConsistency
};

/**
 * Helper seguro para ler variáveis de ambiente do Vite no frontend
 * sem acionar alertas de [empty-import-meta] ao empacotar o backend via esbuild em CJS.
 */
function getClientMetaEnv(key: string): string | undefined {
  try {
    const meta = import.meta as any;
    return meta?.env?.[key];
  } catch {
    return undefined;
  }
}

/**
 * Obtém o ambiente atual de execução da aplicação.
 * Ordem de precedência:
 * 1. Variável explícita APP_ENV / VITE_APP_ENV
 * 2. NODE_ENV / import.meta.env.MODE (development / production)
 */
export function getAppEnv(): AppEnvironment {
  // Client (Vite / browser)
  const clientViteAppEnv = getClientMetaEnv('VITE_APP_ENV');
  if (clientViteAppEnv) {
    const env = String(clientViteAppEnv).toLowerCase().trim();
    if (env === 'sandbox' || env === 'production' || env === 'development') {
      return env as AppEnvironment;
    }
  }
  const clientMode = getClientMetaEnv('MODE');
  if (clientMode === 'production') return 'production';

  // Server (Node.js / Cloud Run)
  return getServerAppEnv();
}

/**
 * Resolve a configuração do Firebase para o lado cliente (React SPA).
 * Fail-Closed: se for Sandbox, EXIGE variáveis dedicadas e REJEITA silent fallback para o projeto atual de produção.
 */
export function resolveClientFirebaseConfig(overrides?: Partial<FirebaseResolvedConfig> & { appEnv?: AppEnvironment }): FirebaseResolvedConfig {
  const env = overrides?.appEnv || getAppEnv();

  if (env === 'sandbox') {
    const sandboxProjectId =
      getClientMetaEnv('VITE_FIREBASE_PROJECT_ID') ||
      (typeof process !== 'undefined' && (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID)) ||
      overrides?.projectId;

    const sandboxDatabaseId =
      getClientMetaEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID') ||
      (typeof process !== 'undefined' && (process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID)) ||
      overrides?.firestoreDatabaseId;

    if (!sandboxProjectId) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox exige VITE_FIREBASE_PROJECT_ID dedicado. Não é permitido executar sem Project ID isolado.');
    }

    if (!sandboxDatabaseId) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox exige VITE_FIREBASE_FIRESTORE_DATABASE_ID dedicado. Não é permitido executar sem Database ID isolado.');
    }

    if (sandboxProjectId === ORIGINAL_PRODUCTION_PROJECT_ID) {
      throw new Error(`[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para o projeto Firebase atual de produção (${ORIGINAL_PRODUCTION_PROJECT_ID}). Isolamento de ambiente violado.`);
    }

    if (sandboxDatabaseId === ORIGINAL_PRODUCTION_DATABASE_ID) {
      throw new Error(`[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para o Firestore Database ID atual de produção (${ORIGINAL_PRODUCTION_DATABASE_ID}). Isolamento de ambiente violado.`);
    }

    const sandboxApiKey =
      getClientMetaEnv('VITE_FIREBASE_API_KEY') ||
      (typeof process !== 'undefined' && (process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY)) ||
      overrides?.apiKey;

    const sandboxAppId =
      getClientMetaEnv('VITE_FIREBASE_APP_ID') ||
      (typeof process !== 'undefined' && (process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID)) ||
      overrides?.appId;

    if (!sandboxApiKey) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox exige VITE_FIREBASE_API_KEY dedicada. Build/inicialização abortada.');
    }

    if (!sandboxAppId) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox exige VITE_FIREBASE_APP_ID dedicado. Build/inicialização abortada.');
    }

    if (sandboxApiKey === defaultFirebaseConfig.apiKey) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para a API Key de produção do Firebase. Isolamento de ambiente violado.');
    }

    if (sandboxAppId === defaultFirebaseConfig.appId) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para o App ID de produção do Firebase. Isolamento de ambiente violado.');
    }

    const sandboxAuthDomain =
      getClientMetaEnv('VITE_FIREBASE_AUTH_DOMAIN') ||
      (typeof process !== 'undefined' && (process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN)) ||
      overrides?.authDomain ||
      `${sandboxProjectId}.firebaseapp.com`;

    if (sandboxAuthDomain === defaultFirebaseConfig.authDomain) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para o Auth Domain de produção do Firebase. Isolamento de ambiente violado.');
    }

    const sandboxStorageBucket =
      getClientMetaEnv('VITE_FIREBASE_STORAGE_BUCKET') ||
      (typeof process !== 'undefined' && (process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET)) ||
      overrides?.storageBucket ||
      `${sandboxProjectId}.firebasestorage.app`;

    if (sandboxStorageBucket === defaultFirebaseConfig.storageBucket) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para o Storage Bucket de produção do Firebase. Isolamento de ambiente violado.');
    }

    return {
      projectId: sandboxProjectId,
      appId: sandboxAppId,
      apiKey: sandboxApiKey,
      authDomain: sandboxAuthDomain,
      firestoreDatabaseId: sandboxDatabaseId,
      storageBucket: sandboxStorageBucket,
      messagingSenderId: getClientMetaEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || overrides?.messagingSenderId || '',
      recaptchaSiteKey: getClientMetaEnv('VITE_RECAPTCHA_SITE_KEY') || overrides?.recaptchaSiteKey || ''
    };
  }

  // Ambiente padrão (development ou production existente): preserva defaultFirebaseConfig 100% intacto
  return {
    ...defaultFirebaseConfig,
    ...(overrides || {})
  };
}
