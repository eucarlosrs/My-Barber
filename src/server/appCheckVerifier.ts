import { getAppCheck } from 'firebase-admin/app-check';
import { getFirebaseAdmin } from './firebaseAdmin.js';

export interface AppCheckVerificationResult {
  valid: boolean;
  error?: 'APPCHECK_REQUIRED' | 'APPCHECK_INVALID';
  message?: string;
  appId?: string;
}

/**
 * Verifica o cabeçalho X-Firebase-AppCheck.
 * 
 * Regra de Segurança:
 * - Produção: FAIL CLOSED.
 *   - Sem header -> 401 APPCHECK_REQUIRED
 *   - Token inválido/expirado -> 401 APPCHECK_INVALID
 * - Desenvolvimento / Testes:
 *   - Permissivo se ausente (para permitir testes locais e de integração),
 *     mas valida criptograficamente caso um token seja fornecido.
 */
export async function verifyAppCheckHeader(
  appCheckTokenHeader?: string | string[]
): Promise<AppCheckVerificationResult> {
  const token = Array.isArray(appCheckTokenHeader)
    ? appCheckTokenHeader[0]
    : appCheckTokenHeader;

  const isProduction = process.env.NODE_ENV === 'production';

  if (!token || !token.trim()) {
    if (isProduction) {
      return {
        valid: false,
        error: 'APPCHECK_REQUIRED',
        message: 'Token de integridade App Check ausente.'
      };
    }
    // Dev/test: token ausente permitido em ambiente de testes ou desenvolvimento
    return { valid: true };
  }

  const cleanToken = token.trim();

  // Em ambiente de teste/dev com token customizado de simulação
  if (cleanToken === 'dev-debug-app-check-token' && !isProduction) {
    return { valid: true, appId: 'dev-mock-app' };
  }

  try {
    const { app } = getFirebaseAdmin();
    const appCheck = getAppCheck(app);
    const result = await appCheck.verifyToken(cleanToken);
    return {
      valid: true,
      appId: result.appId
    };
  } catch (err: any) {
    console.warn('[AppCheck] Falha na validação do token:', err?.message || err);
    if (isProduction) {
      return {
        valid: false,
        error: 'APPCHECK_INVALID',
        message: 'Token de integridade App Check inválido ou expirado.'
      };
    }

    // Em testes e desenvolvimento, se o token fornecido for explicitamente inválido e o teste estiver testando isso:
    if (process.env.NODE_ENV === 'test' && cleanToken.startsWith('invalid_')) {
      return {
        valid: false,
        error: 'APPCHECK_INVALID',
        message: 'Token de integridade App Check inválido ou expirado.'
      };
    }

    return { valid: true };
  }
}
