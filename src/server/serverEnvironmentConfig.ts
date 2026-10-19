import defaultFirebaseConfig from '../../firebase-applet-config.json';

export type AppEnvironment = 'development' | 'sandbox' | 'production';

export interface FirebaseResolvedConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  recaptchaSiteKey?: string;
}

export const ORIGINAL_PRODUCTION_PROJECT_ID = defaultFirebaseConfig.projectId; // 'gen-lang-client-0472481079'
export const ORIGINAL_PRODUCTION_DATABASE_ID = (defaultFirebaseConfig as any).firestoreDatabaseId; // 'ai-studio-mybarber-1b7bcf67-417c-4eba-b227-1479fd547c81'

/**
 * Obtém o ambiente atual de execução da aplicação no backend (Node.js / Cloud Run).
 * Ordem de precedência:
 * 1. Variável explícita APP_ENV / VITE_APP_ENV
 * 2. NODE_ENV (development / production)
 */
export function getAppEnv(): AppEnvironment {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.APP_ENV) {
      const env = String(process.env.APP_ENV).toLowerCase().trim();
      if (env === 'sandbox' || env === 'production' || env === 'development') {
        return env as AppEnvironment;
      }
    }
    if (process.env.VITE_APP_ENV) {
      const env = String(process.env.VITE_APP_ENV).toLowerCase().trim();
      if (env === 'sandbox' || env === 'production' || env === 'development') {
        return env as AppEnvironment;
      }
    }
    if (process.env.NODE_ENV === 'production') return 'production';
  }

  return 'development';
}

/**
 * Resolve a configuração do Firebase para o Backend (Admin SDK).
 * Fail-Closed: se for Sandbox, EXIGE variáveis dedicadas e REJEITA silent fallback para o projeto atual de produção.
 */
export function resolveServerFirebaseConfig(overrides?: Partial<FirebaseResolvedConfig> & { appEnv?: AppEnvironment }): FirebaseResolvedConfig {
  const env = overrides?.appEnv || getAppEnv();

  if (env === 'sandbox') {
    const sandboxProjectId =
      (typeof process !== 'undefined' && (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID)) ||
      overrides?.projectId;

    const sandboxDatabaseId =
      (typeof process !== 'undefined' && (process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID)) ||
      overrides?.firestoreDatabaseId;

    if (!sandboxProjectId) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox exige FIREBASE_PROJECT_ID de backend dedicado. Inicialização abortada.');
    }

    if (!sandboxDatabaseId) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox exige FIRESTORE_DATABASE_ID de backend dedicado. Inicialização abortada.');
    }

    if (sandboxProjectId === ORIGINAL_PRODUCTION_PROJECT_ID) {
      throw new Error(`[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para o projeto Firebase atual de produção (${ORIGINAL_PRODUCTION_PROJECT_ID}). Isolamento de ambiente violado.`);
    }

    if (sandboxDatabaseId === ORIGINAL_PRODUCTION_DATABASE_ID) {
      throw new Error(`[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para o Firestore Database ID atual de produção (${ORIGINAL_PRODUCTION_DATABASE_ID}). Isolamento de ambiente violado.`);
    }

    // Validação da Service Account administrativa em Sandbox
    if (typeof process !== 'undefined' && process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (sa.project_id === ORIGINAL_PRODUCTION_PROJECT_ID) {
          throw new Error(`[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): FIREBASE_SERVICE_ACCOUNT pertence ao projeto de produção (${ORIGINAL_PRODUCTION_PROJECT_ID}) em ambiente Sandbox. Isolamento violado.`);
        }
        if (sa.project_id && sa.project_id !== sandboxProjectId) {
          throw new Error(`[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): Divergência de Project ID em FIREBASE_SERVICE_ACCOUNT (${sa.project_id}) vs ambiente Sandbox (${sandboxProjectId}).`);
        }
      } catch (parseErr: any) {
        if (parseErr.message?.includes('FALHA DE SEGURANÇA')) throw parseErr;
      }
    }

    const authDomain =
      (typeof process !== 'undefined' && (process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN)) ||
      overrides?.authDomain ||
      `${sandboxProjectId}.firebaseapp.com`;

    if (authDomain === defaultFirebaseConfig.authDomain) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para o Auth Domain de produção do Firebase. Isolamento de ambiente violado.');
    }

    const storageBucket =
      (typeof process !== 'undefined' && (process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET)) ||
      overrides?.storageBucket ||
      `${sandboxProjectId}.firebasestorage.app`;

    if (storageBucket === defaultFirebaseConfig.storageBucket) {
      throw new Error('[EnvironmentConfig] FALHA DE SEGURANÇA (Fail-Closed): APP_ENV=sandbox aponta para o Storage Bucket de produção do Firebase. Isolamento de ambiente violado.');
    }

    return {
      projectId: sandboxProjectId,
      appId: (typeof process !== 'undefined' && (process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID)) || overrides?.appId || '',
      apiKey: (typeof process !== 'undefined' && (process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY)) || overrides?.apiKey || '',
      authDomain,
      firestoreDatabaseId: sandboxDatabaseId,
      storageBucket,
      messagingSenderId: overrides?.messagingSenderId || ''
    };
  }

  // Ambiente padrão (development ou production existente)
  let serviceAccountProjectId: string | undefined;
  if (typeof process !== 'undefined' && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (sa.project_id) serviceAccountProjectId = sa.project_id;
    } catch {}
  }

  return {
    ...defaultFirebaseConfig,
    projectId: serviceAccountProjectId || defaultFirebaseConfig.projectId,
    ...(overrides || {})
  };
}

/**
 * Valida a compatibilidade das credenciais financeiras com o ambiente.
 * NUNCA exibe ou vaza tokens secretos nos logs.
 */
export interface FinancialValidationResult {
  valid: boolean;
  appEnv: AppEnvironment;
  error?: string;
  isSandboxCredentials?: boolean;
}

export function validateFinancialEnvironment(
  appEnv: AppEnvironment = getAppEnv(),
  options: {
    accessToken?: string;
    publicKey?: string;
    appUrl?: string;
  } = {}
): FinancialValidationResult {
  const hasExplicitOptions = options.accessToken !== undefined || options.publicKey !== undefined;
  const token = options.accessToken !== undefined
    ? options.accessToken
    : (hasExplicitOptions ? '' : (typeof process !== 'undefined' ? process.env.MERCADOPAGO_ACCESS_TOKEN || '' : ''));
  const pubKey = options.publicKey !== undefined
    ? options.publicKey
    : (hasExplicitOptions ? '' : (typeof process !== 'undefined' ? process.env.MERCADOPAGO_PUBLIC_KEY || '' : ''));

  if (appEnv === 'sandbox') {
    // 1. Rejeita expressamente credenciais de produção em Sandbox
    if (token && token.startsWith('APP_USR-')) {
      return {
        valid: false,
        appEnv,
        error: 'FALHA DE SEGURANÇA: APP_ENV=sandbox proíbe estritamente o uso de Access Token de produção (APP_USR-...). Exija credencial de teste TEST-...'
      };
    }
    if (pubKey && pubKey.startsWith('APP_USR-')) {
      return {
        valid: false,
        appEnv,
        error: 'FALHA DE SEGURANÇA: APP_ENV=sandbox proíbe estritamente o uso de Public Key de produção (APP_USR-...). Exija credencial de teste TEST-...'
      };
    }

    // 2. Se token foi fornecido, deve começar com TEST-
    if (token && !token.startsWith('TEST-')) {
      return {
        valid: false,
        appEnv,
        error: 'FALHA DE SEGURANÇA: Credencial de pagamento incompatível com ambiente Sandbox. O token deve possuir o prefixo oficial TEST-.'
      };
    }

    return {
      valid: true,
      appEnv,
      isSandboxCredentials: true
    };
  }

  if (appEnv === 'production') {
    if (token && token.startsWith('TEST-')) {
      return {
        valid: false,
        appEnv,
        error: 'FALHA DE SEGURANÇA: APP_ENV=production proíbe o uso de credenciais Sandbox de teste (TEST-...).'
      };
    }
  }

  return {
    valid: true,
    appEnv,
    isSandboxCredentials: Boolean(token && token.startsWith('TEST-'))
  };
}

/**
 * Valida a consistência de identidade entre as configurações do Frontend e do Backend.
 * Garante que ambos apontam rigorosamente para o mesmo projeto, banco e bucket.
 */
export interface IdentityConsistencyResult {
  consistent: boolean;
  error?: string;
  projectId?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
}

export function validateEnvironmentIdentityConsistency(
  clientConfig: FirebaseResolvedConfig,
  serverConfig: FirebaseResolvedConfig
): IdentityConsistencyResult {
  if (clientConfig.projectId !== serverConfig.projectId) {
    return {
      consistent: false,
      error: `FALHA DE SEGURANÇA (Identity Mismatch): Divergência de Firebase Project ID entre Frontend (${clientConfig.projectId}) e Backend (${serverConfig.projectId}). Isolamento comprometido.`
    };
  }

  const clientDb = clientConfig.firestoreDatabaseId || '(default)';
  const serverDb = serverConfig.firestoreDatabaseId || '(default)';
  if (clientDb !== serverDb) {
    return {
      consistent: false,
      error: `FALHA DE SEGURANÇA (Identity Mismatch): Divergência de Firestore Database ID entre Frontend (${clientDb}) e Backend (${serverDb}). Isolamento comprometido.`
    };
  }

  if (clientConfig.authDomain && serverConfig.authDomain && clientConfig.authDomain !== serverConfig.authDomain) {
    return {
      consistent: false,
      error: `FALHA DE SEGURANÇA (Identity Mismatch): Divergência de Auth Domain entre Frontend (${clientConfig.authDomain}) e Backend (${serverConfig.authDomain}). Isolamento comprometido.`
    };
  }

  if (clientConfig.storageBucket && serverConfig.storageBucket && clientConfig.storageBucket !== serverConfig.storageBucket) {
    return {
      consistent: false,
      error: `FALHA DE SEGURANÇA (Identity Mismatch): Divergência de Storage Bucket entre Frontend (${clientConfig.storageBucket}) e Backend (${serverConfig.storageBucket}). Isolamento comprometido.`
    };
  }

  return {
    consistent: true,
    projectId: clientConfig.projectId,
    firestoreDatabaseId: clientDb,
    storageBucket: clientConfig.storageBucket || serverConfig.storageBucket
  };
}
