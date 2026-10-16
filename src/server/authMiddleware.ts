import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { verifyFirebaseIdToken, getFirebaseAdmin } from './firebaseAdmin.js';
import {
  AuthUserClaims,
  CanonicalRole,
  toCanonicalRole,
  toLegacyRole
} from '../lib/authClaims.js';

/**
 * MY BARBER — Camada Central de Autenticação e Autorização HTTP (Middleware)
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. A autoridade decorre EXCLUSIVAMENTE do Firebase ID Token verificado via Admin SDK.
 * 2. NENHUM campo recebido no body, query, headers customizados, localStorage ou cookies
 *    define ou substitui o papel (role) ou o tenant (barbershopId) do usuário.
 * 3. Tentativas de acesso entre estabelecimentos diferentes (cross-tenant) são bloqueadas
 *    com HTTP 403 Forbidden para qualquer usuário que não seja Super Admin.
 * 4. Logs de auditoria nunca registram tokens, credenciais, segredos ou dados de cartão.
 */

export interface AuthenticatedRequest extends Request {
  user?: AuthUserClaims;
}

export type TokenVerifier = (token: string) => Promise<DecodedIdToken | null>;

/**
 * Registra eventos de segurança sem vazar dados sensíveis.
 */
export function logSecurityAudit(params: {
  endpoint: string;
  status: 401 | 403;
  reason: string;
  uid?: string;
  role?: string;
  tenant?: string;
}) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY AUDIT] ${timestamp} | Endpoint: ${params.endpoint} | Status: ${params.status} | Reason: ${params.reason} | UID: ${params.uid || 'anonymous'} | Role: ${params.role || 'none'} | Tenant: ${params.tenant || 'none'}`
  );
}

/**
 * Extrai o Firebase ID Token do cabeçalho Authorization: Bearer <token>.
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  if (!rawHeader || typeof rawHeader !== 'string') {
    return null;
  }

  const match = rawHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]?.trim()) {
    return null;
  }

  return match[1].trim();
}

/**
 * Converte um DecodedIdToken do Firebase Admin em AuthUserClaims canônico.
 */
export function decodedToUserClaims(decoded: DecodedIdToken): AuthUserClaims {
  const rawRole = (decoded as any).role || ((decoded as any).isSuperAdmin ? 'super_admin' : null);
  const canonicalRole = toCanonicalRole(rawRole);
  const legacyRole = toLegacyRole(canonicalRole);
  const tenantId = ((decoded as any).tenantId || (decoded as any).barbershopId || undefined) as string | undefined;
  const isSuperAdmin = canonicalRole === 'super_admin' || (decoded as any).isSuperAdmin === true;

  return {
    uid: decoded.uid,
    role: canonicalRole,
    legacyRole,
    tenantId,
    isSuperAdmin,
    claimsRaw: decoded as Record<string, any>,
    tokenIssuedAt: decoded.iat,
    tokenExpiresAt: decoded.exp
  };
}

/**
 * Fábrica de middleware de autenticação (permite injeção de verifier para testes).
 */
export function createRequireAuth(verifier: TokenVerifier = verifyFirebaseIdToken) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    if (!token) {
      logSecurityAudit({
        endpoint: req.originalUrl || req.url,
        status: 401,
        reason: 'Authorization header ausente ou malformatado'
      });
      return res.status(401).json({
        error: 'Autenticação obrigatória: cabeçalho Authorization Bearer ausente ou inválido.'
      });
    }

    const decoded = await verifier(token);
    if (!decoded) {
      logSecurityAudit({
        endpoint: req.originalUrl || req.url,
        status: 401,
        reason: 'Firebase ID Token inválido, expirado ou corrompido'
      });
      return res.status(401).json({
        error: 'Token de autenticação inválido ou expirado.'
      });
    }

    (req as AuthenticatedRequest).user = decodedToUserClaims(decoded);
    next();
  };
}

/**
 * Middleware padrão de autenticação.
 */
export const requireAuth = createRequireAuth();

/**
 * Fábrica de middleware exigindo estritamente a role Super Admin.
 */
export function createRequireSuperAdmin(verifier: TokenVerifier = verifyFirebaseIdToken) {
  const authMw = createRequireAuth(verifier);

  return async (req: Request, res: Response, next: NextFunction) => {
    await authMw(req, res, () => {
      const user = (req as AuthenticatedRequest).user;
      if (!user) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }

      if (!user.isSuperAdmin && user.role !== 'super_admin') {
        logSecurityAudit({
          endpoint: req.originalUrl || req.url,
          status: 403,
          reason: 'Acesso negado: role insuficiente para Super Admin',
          uid: user.uid,
          role: user.role,
          tenant: user.tenantId
        });
        return res.status(403).json({
          error: 'Acesso negado: operação restrita a Super Administradores da plataforma.'
        });
      }

      next();
    });
  };
}

/**
 * Middleware padrão para Super Admin.
 */
export const requireSuperAdmin = createRequireSuperAdmin();

/**
 * Opções para validação de escopo de tenant e role.
 */
export interface TenantRoleOptions {
  allowedRoles: CanonicalRole[];
  getTenantId: (req: Request) => string | undefined;
  allowSuperAdmin?: boolean;
  roleErrorMessage?: string;
  crossTenantErrorMessage?: string;
  missingTenantErrorMessage?: string;
}

/**
 * Fábrica de middleware de autorização por tenant e role.
 */
export function createRequireTenantRole(
  options: TenantRoleOptions,
  verifier: TokenVerifier = verifyFirebaseIdToken
) {
  const authMw = createRequireAuth(verifier);
  const allowSuperAdmin = options.allowSuperAdmin ?? true;

  return async (req: Request, res: Response, next: NextFunction) => {
    await authMw(req, res, () => {
      const user = (req as AuthenticatedRequest).user;
      if (!user) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }

      // 1. Super Admin possui soberania global em todos os tenants
      if (allowSuperAdmin && (user.isSuperAdmin || user.role === 'super_admin')) {
        return next();
      }

      // 2. Validação da role autorizada
      if (!options.allowedRoles.includes(user.role)) {
        logSecurityAudit({
          endpoint: req.originalUrl || req.url,
          status: 403,
          reason: `Role '${user.role}' não autorizada para este recurso`,
          uid: user.uid,
          role: user.role,
          tenant: user.tenantId
        });
        return res.status(403).json({
          error: options.roleErrorMessage || 'Acesso negado: privilégio insuficiente para esta operação.'
        });
      }

      // 3. Extração do tenant solicitado (recurso visado)
      const requestedTenantId = options.getTenantId(req);
      if (!requestedTenantId || !requestedTenantId.trim()) {
        return res.status(400).json({
          error: options.missingTenantErrorMessage || 'Identificador de barbearia (tenant) obrigatório não fornecido.'
        });
      }

      const cleanRequested = requestedTenantId.trim();

      // 4. Validação de isolamento de Tenant (anti-IDOR e anti-cross-tenant)
      if (!user.tenantId || user.tenantId !== cleanRequested) {
        logSecurityAudit({
          endpoint: req.originalUrl || req.url,
          status: 403,
          reason: `Violação cross-tenant: usuário do tenant '${user.tenantId || 'nenhum'}' tentou acessar '${cleanRequested}'`,
          uid: user.uid,
          role: user.role,
          tenant: user.tenantId
        });
        return res.status(403).json({
          error: options.crossTenantErrorMessage || 'Acesso negado: violação de isolamento multi-tenant (cross-tenant negado).'
        });
      }

      next();
    });
  };
}

/**
 * Permite apenas Super Admin OU Proprietário da respectiva barbearia.
 */
export function requireTenantOwner(
  getTenantId: (req: Request) => string | undefined,
  verifier: TokenVerifier = verifyFirebaseIdToken
) {
  return createRequireTenantRole(
    {
      allowedRoles: ['barbershop_owner'],
      getTenantId,
      roleErrorMessage: 'Acesso negado: operação restrita ao proprietário da barbearia ou Super Administrador.',
      crossTenantErrorMessage: 'Acesso negado: proprietário não possui autorização para operar em outro estabelecimento.'
    },
    verifier
  );
}

/**
 * Permite Super Admin, Proprietário OU Gerente da respectiva barbearia.
 */
export function requireTenantManagerOrOwner(
  getTenantId: (req: Request) => string | undefined,
  verifier: TokenVerifier = verifyFirebaseIdToken
) {
  return createRequireTenantRole(
    {
      allowedRoles: ['barbershop_owner', 'manager'],
      getTenantId,
      roleErrorMessage: 'Acesso negado: operação restrita à gerência ou proprietário da barbearia.',
      crossTenantErrorMessage: 'Acesso negado: gerência não possui autorização para operar em outro estabelecimento.'
    },
    verifier
  );
}

/**
 * Assinatura da função verificadora de propriedade de barbearia no Firestore.
 */
export type BarbershopOwnershipVerifier = (
  barbershopId: string,
  uid: string
) => Promise<{ exists: boolean; isOwner: boolean; ownerUid?: string }>;

/**
 * Verificação padrão de propriedade do estabelecimento contra o Firestore oficial.
 * Usado quando um usuário autenticado sem tenantId em Claims tenta contratar assinatura durante onboarding.
 */
export async function defaultVerifyBarbershopOwnership(
  barbershopId: string,
  uid: string
): Promise<{ exists: boolean; isOwner: boolean; ownerUid?: string }> {
  try {
    const admin = getFirebaseAdmin();
    if (!admin?.firestore) {
      console.warn('[defaultVerifyBarbershopOwnership] Firestore Admin não disponível.');
      return { exists: false, isOwner: false };
    }

    const shopDoc = await admin.firestore.collection('barbershops').doc(barbershopId).get();
    if (!shopDoc.exists) {
      return { exists: false, isOwner: false };
    }

    const data = shopDoc.data() || {};
    const directOwner = data.ownerUid || data.ownerId || data.createdByUserId;
    if (directOwner) {
      return { exists: true, isOwner: directOwner === uid, ownerUid: directOwner };
    }

    // Consulta perfil do usuário no Firestore
    const userDoc = await admin.firestore.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const uData = userDoc.data() || {};
      const canonical = toCanonicalRole(uData.role);
      if (uData.tenantId === barbershopId && (canonical === 'barbershop_owner' || uData.role === 'PROPRIETARIO')) {
        return { exists: true, isOwner: true, ownerUid: uid };
      }
    }

    // Consulta se outro proprietário já foi associado a esse tenant
    const ownersSnap = await admin.firestore
      .collection('users')
      .where('tenantId', '==', barbershopId)
      .where('role', 'in', ['PROPRIETARIO', 'barbershop_owner', 'owner'])
      .limit(1)
      .get();

    if (!ownersSnap.empty) {
      const existingOwnerDoc = ownersSnap.docs[0];
      return { exists: true, isOwner: existingOwnerDoc.id === uid, ownerUid: existingOwnerDoc.id };
    }

    return { exists: true, isOwner: false };
  } catch (err) {
    console.error('[defaultVerifyBarbershopOwnership] Erro ao consultar Firestore:', err);
    return { exists: false, isOwner: false };
  }
}

/**
 * Middleware para criação de assinatura (POST /api/subscriptions/create).
 * Permite Super Admin, Proprietário legítimo do tenant, ou usuário em onboarding
 * cujo estabelecimento exista e pertença comprovadamente a ele no Firestore.
 */
export function createRequireSubscriptionCreation(
  verifier: TokenVerifier = verifyFirebaseIdToken,
  ownershipVerifier: BarbershopOwnershipVerifier = defaultVerifyBarbershopOwnership
) {
  const authMw = createRequireAuth(verifier);

  return async (req: Request, res: Response, next: NextFunction) => {
    await authMw(req, res, async () => {
      const user = (req as AuthenticatedRequest).user;
      if (!user) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }

      // 1. Super Admin pode criar assinatura para qualquer estabelecimento
      if (user.isSuperAdmin || user.role === 'super_admin') {
        return next();
      }

      const requestedBarbershopId = req.body?.barbershopId;
      if (!requestedBarbershopId || typeof requestedBarbershopId !== 'string' || !requestedBarbershopId.trim()) {
        return res.status(400).json({ error: 'barbershopId é obrigatório no corpo da requisição.' });
      }

      const targetTenant = requestedBarbershopId.trim();

      // 2. Profissionais (barber) NUNCA podem contratar assinaturas
      if (user.role === 'barber') {
        logSecurityAudit({
          endpoint: '/api/subscriptions/create',
          status: 403,
          reason: 'Tentativa de contratação de assinatura por profissional (barber)',
          uid: user.uid,
          role: user.role,
          tenant: user.tenantId
        });
        return res.status(403).json({
          error: 'Acesso negado: profissionais não possuem autorização para contratar ou alterar assinaturas da barbearia.'
        });
      }

      // 3. Bloqueio estrito de cross-tenant quando o token já possui tenantId
      if (user.tenantId && user.tenantId !== targetTenant) {
        logSecurityAudit({
          endpoint: '/api/subscriptions/create',
          status: 403,
          reason: 'Tentativa cross-tenant de criação de assinatura',
          uid: user.uid,
          role: user.role,
          tenant: user.tenantId
        });
        return res.status(403).json({
          error: 'Acesso negado: proprietário ou usuário não possui autorização para criar assinaturas para outro estabelecimento.'
        });
      }

      // 4. Proprietário com tenantId coincidente no token
      if (user.role === 'barbershop_owner' && user.tenantId === targetTenant) {
        return next();
      }

      // 5. Usuário sem tenantId no token (ex: customer durante fluxo de onboarding inicial):
      // REGRA CRÍTICA DE SEGURANÇA: A ausência de tenantId no token NÃO concede passe-livre.
      // O estabelecimento precisa existir no Firestore e seu ownerUid deve corresponder
      // comprovadamente ao UID autenticado extraído com segurança do token.
      const check = await ownershipVerifier(targetTenant, user.uid);
      if (!check.exists) {
        logSecurityAudit({
          endpoint: '/api/subscriptions/create',
          status: 403,
          reason: 'Tentativa de criação de assinatura para estabelecimento inexistente ou não registrado',
          uid: user.uid,
          role: user.role
        });
        return res.status(403).json({
          error: 'Acesso negado: estabelecimento não encontrado. A barbearia deve ser previamente cadastrada pelo proprietário antes da assinatura.'
        });
      }

      if (!check.isOwner) {
        logSecurityAudit({
          endpoint: '/api/subscriptions/create',
          status: 403,
          reason: 'Tentativa de criação de assinatura para barbearia de terceiro (IDOR / Cross-Tenant)',
          uid: user.uid,
          role: user.role
        });
        return res.status(403).json({
          error: 'Acesso negado: este estabelecimento pertence a outro usuário.'
        });
      }

      // Pertence comprovadamente ao UID autenticado
      return next();
    });
  };
}

export const requireSubscriptionCreation = createRequireSubscriptionCreation();

export interface VerifyWebhookResult {
  valid: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Validação rigorosa de assinatura HMAC do Webhook Mercado Pago.
 * - Garante Fail Closed se secret não configurado (status 500)
 * - Exige cabeçalho x-signature no formato ts=...,v1=... (status 401)
 * - Valida se ts é numérico e recente (tolerância de até 5 minutos contra replay attacks) (status 401)
 * - Executa verificação em tempo constante (timingSafeEqual) com guarda de comprimento (status 401)
 */
export function verifyMercadoPagoWebhookSignature(params: {
  xSignature?: string;
  xRequestId?: string;
  eventId: string | number;
  secret?: string;
  toleranceMs?: number;
  nowMs?: number;
}): VerifyWebhookResult {
  const {
    xSignature,
    xRequestId = '',
    eventId,
    secret,
    toleranceMs = 5 * 60 * 1000,
    nowMs = Date.now()
  } = params;

  // 1. Fail Closed: Se o segredo do webhook não estiver configurado no servidor
  if (!secret || !secret.trim()) {
    return {
      valid: false,
      statusCode: 500,
      error: 'Configuração de webhook não inicializada com segurança no servidor (Fail Closed).'
    };
  }

  // 2. Presença do cabeçalho x-signature
  if (!xSignature || typeof xSignature !== 'string' || !xSignature.trim()) {
    return {
      valid: false,
      statusCode: 401,
      error: 'Cabeçalho x-signature obrigatório ausente.'
    };
  }

  // 3. Parsing das partes ts e v1
  const parts = xSignature.split(',');
  let ts = '';
  let v1 = '';
  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k === 'ts') ts = v;
    if (k === 'v1') v1 = v;
  }

  if (!ts || !v1) {
    return {
      valid: false,
      statusCode: 401,
      error: 'Assinatura do webhook malformatada (partes ts ou v1 ausentes).'
    };
  }

  // 4. Validação estrita do timestamp (numérico e finito)
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || tsNum <= 0) {
    return {
      valid: false,
      statusCode: 401,
      error: 'Timestamp do cabeçalho x-signature inválido ou não numérico.'
    };
  }

  // Tolerância de até 5 minutos contra replay attacks
  const tsInMs = tsNum > 1e11 ? tsNum : tsNum * 1000;
  if (Math.abs(nowMs - tsInMs) > toleranceMs) {
    return {
      valid: false,
      statusCode: 401,
      error: 'Timestamp do webhook expirado ou fora da janela de tolerância permitida (5 minutos).'
    };
  }

  // 5. Cálculo do HMAC SHA256 com manifest oficial do Mercado Pago
  const manifest = `id:${eventId};request-id:${xRequestId};ts:${ts};`;
  const computedHmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const computedBuf = Buffer.from(computedHmac, 'utf8');
  const v1Buf = Buffer.from(v1, 'utf8');

  // Guarda estrita de comprimento antes de timingSafeEqual para evitar exceção não tratada
  if (computedBuf.length !== v1Buf.length || !crypto.timingSafeEqual(computedBuf, v1Buf)) {
    return {
      valid: false,
      statusCode: 401,
      error: 'Assinatura HMAC do webhook inválida.'
    };
  }

  return { valid: true };
}
