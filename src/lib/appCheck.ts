import { FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  CustomProvider,
  getToken,
  AppCheck
} from 'firebase/app-check';
import { resolveClientFirebaseConfig } from './environmentConfig.js';

export type AppCheckEnvironment = 'test' | 'development' | 'production';

let appCheckInstance: AppCheck | null = null;
let initializedEnvironment: AppCheckEnvironment | null = null;
let providerType: string = 'none';

/**
 * Determina o ambiente de execução estritamente por variáveis de ambiente e runtime.
 * SEGURANÇA: NUNCA utiliza localStorage, parâmetros de URL, cookies ou headers para determinar o ambiente.
 */
export function getAppCheckEnvironment(): AppCheckEnvironment {
  // 1. Ambiente de Testes (Node.js runner, Vitest, CI)
  if (
    typeof window === 'undefined' ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')
  ) {
    return 'test';
  }

  // 2. Ambiente de Desenvolvimento Local ou Sandbox
  const isViteDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
  const hostname = window.location?.hostname || '';
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local');
  const isDevCloud =
    hostname.includes('ais-dev-') ||
    hostname.includes('localhost') ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');

  if (isViteDev || isLocalhost || isDevCloud) {
    return 'development';
  }

  // 3. Ambiente de Produção
  return 'production';
}

/**
 * Inicializa o Firebase App Check de forma compatível e resiliente.
 * 
 * Regras de Segurança:
 * - Não substitui o Firebase Authentication.
 * - Não bloqueia nem altera fluxos legítimos de agendamento público sem login.
 * - Não aceita bypass por localStorage, query params ou body.
 * - Não utiliza flags inseguras em produção.
 */
export function initAppCheck(app?: FirebaseApp): AppCheck | null {
  if (appCheckInstance) {
    return appCheckInstance;
  }

  const env = getAppCheckEnvironment();
  initializedEnvironment = env;

  // -------------------------------------------------------------------------
  // A) AMBIENTE DE TESTES (Node / CI)
  // Evita carregar scripts do reCAPTCHA ou manipular DOM inexistente.
  // -------------------------------------------------------------------------
  if (env === 'test') {
    providerType = 'test_noop';
    return null;
  }

  if (!app) {
    return null;
  }

  // Chave pública do reCAPTCHA v3
  const clientConfig = resolveClientFirebaseConfig();
  const siteKey =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RECAPTCHA_SITE_KEY) ||
    clientConfig.recaptchaSiteKey ||
    '';

  // -------------------------------------------------------------------------
  // B) AMBIENTE DE DESENVOLVIMENTO
  // Suporta o Firebase Debug Token para desenvolvedores e testes locais.
  // -------------------------------------------------------------------------
  if (env === 'development') {
    try {
      // Configura o debug token se estiver disponível ou ativa o gerador de debug token
      const debugToken =
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APPCHECK_DEBUG_TOKEN) || true;
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;

      if (siteKey) {
        appCheckInstance = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(siteKey),
          isTokenAutoRefreshEnabled: true
        });
        providerType = 'recaptcha_v3_debug';
      } else {
        // Fallback resiliente para desenvolvimento sem chave de reCAPTCHA configurada
        appCheckInstance = initializeAppCheck(app, {
          provider: new CustomProvider({
            getToken: async () => ({
              token: 'dev-debug-app-check-token',
              expireTimeMillis: Date.now() + 3600 * 1000
            })
          }),
          isTokenAutoRefreshEnabled: true
        });
        providerType = 'custom_dev_provider';
      }

      return appCheckInstance;
    } catch (devError) {
      console.warn('[Firebase App Check] Aviso na inicialização em desenvolvimento:', devError);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // C) AMBIENTE DE PRODUÇÃO
  // Regras rígidas: Debug token estritamente desabilitado.
  // Utiliza ReCaptchaV3Provider com chave legítima.
  // -------------------------------------------------------------------------
  if (env === 'production') {
    // Garante que o debug token NUNCA seja ativado em produção
    if (typeof self !== 'undefined') {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN = false;
    }

    if (!siteKey) {
      // Alerta de configuração sem travar o aplicativo ou quebrar a experiência do usuário
      console.warn(
        '[Firebase App Check] PRODUÇÃO: Nenhuma chave reCAPTCHA configurada (VITE_RECAPTCHA_SITE_KEY). ' +
        'O App Check não foi inicializado para evitar interrupções de serviço até que a chave seja provisionada no Console do Firebase.'
      );
      providerType = 'unconfigured_production';
      return null;
    }

    try {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true
      });
      providerType = 'recaptcha_v3';
      return appCheckInstance;
    } catch (prodError) {
      console.error('[Firebase App Check] Erro na inicialização em produção:', prodError);
      providerType = 'error';
      return null;
    }
  }

  return null;
}

/**
 * Retorna a instância atual do App Check, caso inicializada.
 */
export function getAppCheckInstance(): AppCheck | null {
  return appCheckInstance;
}

/**
 * Retorna o status de auditoria do App Check para diagnóstico e observabilidade.
 */
export function getAppCheckStatus(): {
  initialized: boolean;
  environment: AppCheckEnvironment;
  providerType: string;
  isEnforced: boolean;
  publicBookingSupported: boolean;
} {
  return {
    initialized: appCheckInstance !== null,
    environment: initializedEnvironment || getAppCheckEnvironment(),
    providerType,
    isEnforced: false, // Enforcement destrutivo não é ativado automaticamente sem validação de métricas
    publicBookingSupported: true // Agendamento público continua 100% suportado
  };
}

/**
 * Obtém o token atual de integridade do App Check para envio seguro em requisições HTTP de backend.
 */
export async function getAppCheckToken(): Promise<string | null> {
  if (!appCheckInstance) {
    return null;
  }
  try {
    const result = await getToken(appCheckInstance, false);
    return result?.token || null;
  } catch (err) {
    console.warn('[AppCheck] Aviso ao obter token do App Check:', err);
    return null;
  }
}
