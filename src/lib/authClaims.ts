import { User as FirebaseUser } from 'firebase/auth';
import { User, UserRole } from '../types/index.js';

/**
 * MY BARBER — Camada Central de Autorização e Custom Claims (RBAC / Multi-tenant)
 * 
 * Modelo Canônico de Roles (conforme Seção 2 da especificação de segurança):
 * - SUPER_ADMIN     -> super_admin
 * - PROPRIETARIO    -> barbershop_owner
 * - GERENTE         -> manager
 * - PROFISSIONAL    -> barber
 * - CLIENTE         -> customer
 */

export type CanonicalRole = 'super_admin' | 'barbershop_owner' | 'manager' | 'barber' | 'customer';

export interface MyBarberCustomClaims {
  role?: CanonicalRole | string;
  tenantId?: string;
  barbershopId?: string;
  isSuperAdmin?: boolean;
  permissions?: string[];
  [key: string]: any;
}

export interface AuthUserClaims {
  uid: string;
  role: CanonicalRole;
  legacyRole: UserRole;
  tenantId?: string;
  isSuperAdmin: boolean;
  status?: string;
  claimsRaw: Record<string, any>;
  tokenIssuedAt?: number;
  tokenExpiresAt?: number;
}

/**
 * Normaliza qualquer role (legada em PT ou canônica em EN) para a CanonicalRole.
 */
export function toCanonicalRole(role?: string | null): CanonicalRole {
  if (!role) return 'customer';
  const clean = role.toLowerCase().trim();

  switch (clean) {
    case 'super_admin':
    case 'superadmin':
    case 'admin':
      return 'super_admin';
    case 'barbershop_owner':
    case 'owner':
    case 'proprietario':
      return 'barbershop_owner';
    case 'manager':
    case 'gerente':
      return 'manager';
    case 'barber':
    case 'professional':
    case 'profissional':
      return 'barber';
    case 'customer':
    case 'client':
    case 'cliente':
    default:
      return 'customer';
  }
}

/**
 * Mapeia a CanonicalRole de volta para a UserRole legada usada pelo frontend.
 */
export function toLegacyRole(canonical: CanonicalRole | string): UserRole {
  const norm = toCanonicalRole(canonical);
  switch (norm) {
    case 'super_admin':
      return 'SUPER_ADMIN';
    case 'barbershop_owner':
      return 'PROPRIETARIO';
    case 'manager':
      return 'GERENTE';
    case 'barber':
      return 'PROFISSIONAL';
    case 'customer':
    default:
      return 'CLIENTE';
  }
}

/**
 * Validação rigorosa: verifica se uma role requer vinculação estrita a um tenantId.
 */
export function isTenantScopedRole(role: CanonicalRole): boolean {
  return role === 'barbershop_owner' || role === 'manager' || role === 'barber';
}

/**
 * Interpreta os Custom Claims do token do Firebase Auth de forma segura.
 * Se o usuário não tiver claims configurados ainda (modo transição),
 * assume a role padrão 'customer' ou utiliza o perfil Firestore não-destrutivo.
 */
export async function getAuthClaims(
  user: FirebaseUser | null,
  forceRefresh = false
): Promise<AuthUserClaims | null> {
  if (!user) return null;

  try {
    const idTokenResult = await user.getIdTokenResult(forceRefresh);
    const claims = (idTokenResult.claims || {}) as MyBarberCustomClaims;

    // Extração segura da role dos claims
    const rawRole = claims.role || (claims.isSuperAdmin ? 'super_admin' : null);
    const canonicalRole = toCanonicalRole(rawRole);
    const legacyRole = toLegacyRole(canonicalRole);

    // TenantId extraído do claim oficial
    const tenantId = claims.tenantId || claims.barbershopId || undefined;

    // A autoridade de super_admin decorre estritamente do Custom Claim
    const isSuperAdmin = canonicalRole === 'super_admin' || claims.isSuperAdmin === true;

    return {
      uid: user.uid,
      role: canonicalRole,
      legacyRole,
      tenantId,
      isSuperAdmin,
      status: (claims as any).status || undefined,
      claimsRaw: idTokenResult.claims,
      tokenIssuedAt: idTokenResult.issuedAtTime ? Math.floor(new Date(idTokenResult.issuedAtTime).getTime() / 1000) : undefined,
      tokenExpiresAt: idTokenResult.expirationTime ? Math.floor(new Date(idTokenResult.expirationTime).getTime() / 1000) : undefined
    };
  } catch (error) {
    console.warn('[IAM getAuthClaims] Erro ao extrair Custom Claims do ID Token:', error);
    return {
      uid: user.uid,
      role: 'customer',
      legacyRole: 'CLIENTE',
      isSuperAdmin: false,
      claimsRaw: {}
    };
  }
}

// Controle de taxa para evitar loops infinitos de getIdTokenResult(true)
let lastTokenRefreshTimestamp = 0;
const MIN_REFRESH_INTERVAL_MS = 3000; // Mínimo de 3 segundos entre chamadas forçadas

/**
 * Atualiza o ID Token no Firebase Auth com proteção contra loops.
 */
export async function refreshAuthClaimsSafely(
  user: FirebaseUser | null
): Promise<AuthUserClaims | null> {
  if (!user) return null;

  const now = Date.now();
  if (now - lastTokenRefreshTimestamp < MIN_REFRESH_INTERVAL_MS) {
    // Retorna os claims em cache sem forçar nova requisição à rede
    return getAuthClaims(user, false);
  }

  lastTokenRefreshTimestamp = now;
  return getAuthClaims(user, true);
}

/**
 * Avaliador de autorização (RBAC & Multi-tenant).
 * Utilizado para controle de interface e decisões locais, NUNCA substituindo
 * as Security Rules que executam no backend do Firebase.
 */
export function evaluateUserPermission(params: {
  userClaims?: AuthUserClaims | null;
  claims?: AuthUserClaims | null;
  targetRoleOrArea?: CanonicalRole | string;
  requiredRole?: CanonicalRole | string;
  targetTenantId?: string;
}): boolean {
  const claims = params.userClaims ?? params.claims ?? null;
  const rawRole = params.targetRoleOrArea || params.requiredRole;
  const targetTenantId = params.targetTenantId;

  if (!claims) return false;

  // Super Admin possui soberania total
  if (claims.isSuperAdmin || claims.role === 'super_admin') return true;

  if (rawRole) {
    const targetCanonical = toCanonicalRole(rawRole);
    if (targetCanonical === 'super_admin') {
      return false;
    }

    const hierarchy: Record<CanonicalRole, number> = {
      super_admin: 100,
      barbershop_owner: 80,
      manager: 60,
      barber: 40,
      customer: 10
    };

    const userLevel = hierarchy[claims.role] || 0;
    const requiredLevel = hierarchy[targetCanonical] || 0;

    if (userLevel < requiredLevel) return false;
  }

  // Se for restringido a tenant específico
  if (targetTenantId) {
    if (!claims.tenantId || claims.tenantId !== targetTenantId) return false;
  }

  return true;
}

/**
 * Valida se um usuário pode acessar dados de um determinado tenant.
 * - Super Admin acessa todos os tenants.
 * - Usuários de tenant só acessam seu próprio tenant.
 */
export function canAccessTenantData(params: {
  userClaims?: AuthUserClaims | null;
  claims?: AuthUserClaims | null;
  targetTenantId?: string;
}): boolean {
  const claims = params.userClaims ?? params.claims ?? null;
  if (!claims) return false;
  if (claims.isSuperAdmin || claims.role === 'super_admin') return true;
  if (!params.targetTenantId) return true;
  return claims.tenantId === params.targetTenantId;
}

