import crypto from 'node:crypto';
import { getFirebaseAdmin } from './firebaseAdmin.js';
import { planService } from './planService.js';

export interface SubscriptionEnforcementResult {
  allowed: boolean;
  status?: string;
  reason?: string;
  statusCode?: number;
}

export interface TenantPlanResolution {
  resolved: boolean;
  planId: string | null;
  maxProfessionals?: number | 'UNLIMITED';
  source?: 'subscription' | 'custom_plan' | 'barbershop_legacy' | 'catalog';
  reason?: string;
  code?:
    | 'TENANT_REQUIRED'
    | 'TENANT_NOT_FOUND'
    | 'PLAN_NOT_CONFIGURED'
    | 'PLAN_NOT_FOUND'
    | 'INVALID_CAPACITY_LIMIT';
}

export interface ProfessionalCapacityResult {
  allowed: boolean;
  statusCode?: number;
  error?: string;
  code?: string;
  currentCount?: number;
  maxProfessionals?: number | 'UNLIMITED';
  reserved?: boolean;
  alreadyActive?: boolean;
  alreadyReserved?: boolean;
  sameReservation?: boolean;
  reservationId?: string;
}

export function encodeMemberKey(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export class SubscriptionEnforcementError extends Error {
  statusCode: number;
  reason?: string;
  constructor(message: string, statusCode = 403, reason?: string) {
    super(message);
    this.name = 'SubscriptionEnforcementError';
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

/**
 * Avaliação pura e determinística do status da assinatura.
 */
export function evaluateTenantSubscriptionStatus(sub: any): SubscriptionEnforcementResult {
  if (!sub) {
    return { allowed: false, statusCode: 402, reason: 'NO_SUBSCRIPTION' };
  }

  const status = sub?.status;

  if (status === 'ACTIVE' || status === 'TRIAL_14_DAYS' || status === 'LIFETIME_LICENSE') {
    return { allowed: true, status };
  }

  if (status === 'PAST_DUE') {
    const pastDueSince = sub?.pastDueSince ? new Date(sub.pastDueSince).getTime() : 0;
    const toleranceDays = typeof sub?.toleranceDays === 'number' ? sub.toleranceDays : 7;
    const diffDays = pastDueSince > 0 ? (Date.now() - pastDueSince) / (1000 * 60 * 60 * 24) : 0;

    if (diffDays <= toleranceDays) {
      return { allowed: true, status: 'PAST_DUE', reason: 'Em período de tolerância de pagamento' };
    } else {
      return {
        allowed: false,
        status: 'SUSPENDED',
        statusCode: 402,
        reason: 'PAST_DUE_EXPIRED'
      };
    }
  }

  if (status === 'SUSPENDED') {
    return {
      allowed: false,
      status: 'SUSPENDED',
      statusCode: 402,
      reason: 'SUSPENDED'
    };
  }

  if (status === 'CANCELED') {
    return {
      allowed: false,
      status: 'CANCELED',
      statusCode: 403,
      reason: 'CANCELED'
    };
  }

  return { allowed: true, status: status || 'PENDING' };
}

/**
 * Validação autoritativa do status financeiro de uma barbearia no Firestore.
 */
export async function assertTenantSubscriptionActive(barbershopId: string): Promise<SubscriptionEnforcementResult> {
  if (!barbershopId || typeof barbershopId !== 'string' || !barbershopId.trim()) {
    return { allowed: false, statusCode: 400, reason: 'barbershopId é obrigatório.' };
  }

  const cleanTenantId = barbershopId.trim();

  try {
    const { firestore } = getFirebaseAdmin();
    const subDoc = await firestore.collection('subscriptions').doc(`sub-${cleanTenantId}`).get();

    if (!subDoc.exists) {
      // Estabelecimento sem registro explícito de assinatura no Firestore (ex: onboarding ou legado)
      return { allowed: true, status: 'NOT_FOUND' };
    }

    const evaluation = evaluateTenantSubscriptionStatus(subDoc.data());
    if (!evaluation.allowed) {
      return {
        allowed: false,
        status: evaluation.status,
        statusCode: evaluation.statusCode || 403,
        reason: evaluation.reason === 'CANCELED'
          ? 'Operação bloqueada: a assinatura deste estabelecimento foi cancelada. Reative sua assinatura para continuar utilizando o sistema.'
          : 'Operação bloqueada: o acesso deste estabelecimento está suspenso por pendência financeira. Regularize o pagamento na aba Minha Assinatura.'
      };
    }

    return evaluation;
  } catch (err: any) {
    console.warn(`[subscriptionEnforcement] Aviso ao verificar assinatura no Firestore para ${cleanTenantId}:`, err);
    // Em caso de indisponibilidade transitória do Firestore, não causa negação de serviço silenciosa
    return { allowed: true, status: 'UNVERIFIED' };
  }
}

/**
 * FASE 4.10B.2: Resolução autoritativa e FAIL-CLOSED do entitlement de limite de profissionais do tenant.
 * Precedência canônica:
 * 1. subscriptions/sub-{tenantId}.customPlan (se limits.maxProfessionals definido)
 * 2. subscriptions/sub-{tenantId}.planId (plano contratado e ativo no gateway/reconciliação)
 * 3. barbershops/{tenantId}.planId (fallback canônico para estabelecimentos legados sem doc de subscription)
 * 
 * Regra de Segurança Absoluta (Fail-Closed):
 * - Jamais assume UNLIMITED para tenants inexistentes ou não configurados.
 * - Jamais inventa plano Essencial para planId desconhecido no catálogo.
 * - Valida estritamente limits.maxProfessionals (rejeita NaN, Infinity, negativos ou não numéricos).
 */
export async function resolveTenantPlan(
  tenantId: string,
  firestoreOverride?: any
): Promise<TenantPlanResolution> {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    return {
      resolved: false,
      planId: null,
      reason: 'tenantId é obrigatório para resolver plano de assinatura.',
      code: 'TENANT_REQUIRED'
    };
  }
  const cleanTenantId = tenantId.trim();
  const firestore = firestoreOverride || getFirebaseAdmin().firestore;

  let subDoc: any = null;
  let subExists = false;
  let subData: any = null;

  try {
    subDoc = await firestore.collection('subscriptions').doc(`sub-${cleanTenantId}`).get();
    subExists = subDoc && subDoc.exists;
    if (subExists) {
      subData = typeof subDoc.data === 'function' ? subDoc.data() : subDoc;
    }
  } catch (err) {
    console.warn(`[subscriptionEnforcement] Aviso ao consultar subscription de ${cleanTenantId}:`, err);
  }

  // 1. Prioridade: Plano customizado explicitamente registrado na assinatura
  if (subExists && subData?.customPlan?.limits?.maxProfessionals !== undefined) {
    const customMax = subData.customPlan.limits.maxProfessionals;
    if (customMax === 'UNLIMITED') {
      return {
        resolved: true,
        planId: subData.planId || 'custom',
        maxProfessionals: 'UNLIMITED',
        source: 'custom_plan'
      };
    }
    if (typeof customMax === 'number' && Number.isFinite(customMax) && !Number.isNaN(customMax)) {
      if (customMax >= 0) {
        return {
          resolved: true,
          planId: subData.planId || 'custom',
          maxProfessionals: customMax,
          source: 'custom_plan'
        };
      }
      return {
        resolved: false,
        planId: subData.planId || null,
        reason: `Limite maxProfessionals do customPlan é negativo (${customMax}).`,
        code: 'INVALID_CAPACITY_LIMIT'
      };
    }
    return {
      resolved: false,
      planId: subData.planId || null,
      reason: `Limite maxProfessionals do customPlan é inválido (${customMax}).`,
      code: 'INVALID_CAPACITY_LIMIT'
    };
  }

  // 2. Resolução do planId através de subscription ou fallback barbershops
  let resolvedPlanId: string | null = (subExists && subData?.planId && typeof subData.planId === 'string' && subData.planId.trim())
    ? subData.planId.trim()
    : null;

  let shopExists = false;
  if (!resolvedPlanId) {
    try {
      const shopDoc = await firestore.collection('barbershops').doc(cleanTenantId).get();
      shopExists = shopDoc && shopDoc.exists;
      if (shopExists) {
        const shopData = typeof shopDoc.data === 'function' ? shopDoc.data() : shopDoc;
        if (shopData?.planId && typeof shopData.planId === 'string' && shopData.planId.trim()) {
          resolvedPlanId = shopData.planId.trim();
        }
      }
    } catch (err) {
      console.warn(`[subscriptionEnforcement] Aviso ao consultar barbershops de ${cleanTenantId}:`, err);
    }
  }

  // FAIL-CLOSED: Se nenhum documento existir no Firestore para esse tenant
  if (!resolvedPlanId) {
    if (!subExists && !shopExists) {
      return {
        resolved: false,
        planId: null,
        reason: `Estabelecimento '${cleanTenantId}' não foi localizado no sistema.`,
        code: 'TENANT_NOT_FOUND'
      };
    }
    return {
      resolved: false,
      planId: null,
      reason: `Estabelecimento '${cleanTenantId}' não possui plano de assinatura configurado.`,
      code: 'PLAN_NOT_CONFIGURED'
    };
  }

  // 3. Resolução no catálogo oficial de planos (PlanService)
  let catalogPlan: any = null;
  try {
    catalogPlan = await planService.getPlanById(resolvedPlanId);
  } catch (err) {
    console.warn(`[subscriptionEnforcement] Aviso ao consultar planService para ${resolvedPlanId}:`, err);
  }

  if (catalogPlan) {
    const rawMax = catalogPlan.limits?.maxProfessionals;
    if (rawMax === 'UNLIMITED') {
      return {
        resolved: true,
        planId: resolvedPlanId,
        maxProfessionals: 'UNLIMITED',
        source: 'catalog'
      };
    }
    if (typeof rawMax === 'number' && Number.isFinite(rawMax) && !Number.isNaN(rawMax)) {
      if (rawMax >= 0) {
        return {
          resolved: true,
          planId: resolvedPlanId,
          maxProfessionals: rawMax,
          source: 'catalog'
        };
      }
      return {
        resolved: false,
        planId: resolvedPlanId,
        reason: `Limite maxProfessionals do plano '${resolvedPlanId}' é negativo (${rawMax}).`,
        code: 'INVALID_CAPACITY_LIMIT'
      };
    }
    if (rawMax === undefined || rawMax === null) {
      return {
        resolved: false,
        planId: resolvedPlanId,
        reason: `Plano '${resolvedPlanId}' no catálogo não define limits.maxProfessionals.`,
        code: 'INVALID_CAPACITY_LIMIT'
      };
    }
    return {
      resolved: false,
      planId: resolvedPlanId,
      reason: `Limite maxProfessionals do plano '${resolvedPlanId}' é inválido (${rawMax}).`,
      code: 'INVALID_CAPACITY_LIMIT'
    };
  }

  // Aliases estáticos legados comprovados no projeto
  if (resolvedPlanId === 'plano-essencial' || resolvedPlanId === 'PLANO_UNICO') {
    return { resolved: true, planId: resolvedPlanId, maxProfessionals: 1, source: 'catalog' };
  }
  if (resolvedPlanId === 'plano-profissional' || resolvedPlanId === 'plano-vitalicio') {
    return { resolved: true, planId: resolvedPlanId, maxProfessionals: 5, source: 'catalog' };
  }
  if (resolvedPlanId === 'plano-premium') {
    return { resolved: true, planId: resolvedPlanId, maxProfessionals: 10, source: 'catalog' };
  }

  // FAIL-CLOSED: Plano desconhecido não pode receber fallback permissivo silencioso
  return {
    resolved: false,
    planId: resolvedPlanId,
    reason: `Plano '${resolvedPlanId}' não encontrado no catálogo do SaaS.`,
    code: 'PLAN_NOT_FOUND'
  };
}

/**
 * FASE 4.10B.2: Detalhes dos profissionais ativos do tenant para contagem e bootstrap do mapa de membros.
 */
export async function getActiveProfessionalsDetails(
  tenantId: string,
  firestoreOverride?: any
): Promise<{ count: number; activeMembers: Record<string, { email: string; status: 'ACTIVE'; updatedAt: string }> }> {
  const cleanTenantId = tenantId.trim();
  const firestore = firestoreOverride || getFirebaseAdmin().firestore;

  try {
    const snapshot = await firestore
      .collection('users')
      .where('tenantId', '==', cleanTenantId)
      .get();

    let count = 0;
    const activeMembers: Record<string, { email: string; status: 'ACTIVE'; updatedAt: string }> = {};
    if (snapshot && !snapshot.empty && Array.isArray(snapshot.docs)) {
      const nowIso = new Date().toISOString();
      snapshot.docs.forEach((doc: any) => {
        const data = typeof doc.data === 'function' ? doc.data() : doc;
        const isProf = data.role === 'PROFISSIONAL' || data.canonicalRole === 'barber';
        const isActive = data.status !== 'inactive';
        if (isProf && isActive) {
          count++;
          if (data.email && typeof data.email === 'string' && data.email.trim()) {
            const k = encodeMemberKey(data.email);
            activeMembers[k] = { email: data.email.trim().toLowerCase(), status: 'ACTIVE', updatedAt: nowIso };
          }
        }
      });
    }
    return { count, activeMembers };
  } catch (err) {
    console.warn(`[subscriptionEnforcement] Aviso ao contar profissionais ativos para ${cleanTenantId}:`, err);
    return { count: 0, activeMembers: {} };
  }
}

/**
 * FASE 4.10B: Regra canônica de contagem de profissionais ativos que consomem vaga.
 */
export async function countActiveProfessionals(
  tenantId: string,
  firestoreOverride?: any
): Promise<number> {
  const details = await getActiveProfessionalsDetails(tenantId, firestoreOverride);
  return details.count;
}

export interface ReserveSeatOptions {
  email?: string;
  reservationId?: string;
  requestId?: string;
  planResolution?: TenantPlanResolution;
  firestoreOverride?: any;
}

/**
 * FASE 4.10B.4: Reserva atômica de vaga de profissional por tenant com ownership transacional.
 * Previne race condition e deduplica concorrência com bloqueio semântico caso outra operação
 * esteja em andamento para o mesmo e-mail (PROFESSIONAL_CREATION_IN_PROGRESS).
 */
export async function reserveProfessionalSeat(
  tenantId: string,
  options?: ReserveSeatOptions | any
): Promise<ProfessionalCapacityResult> {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    return { allowed: false, statusCode: 400, error: 'tenantId é obrigatório para reservar vaga.' };
  }

  const cleanTenantId = tenantId.trim();
  const opts: ReserveSeatOptions = (options && typeof options === 'object' && !options.collection) ? options : {};
  const firestore = opts.firestoreOverride || (options?.collection ? options : getFirebaseAdmin().firestore);

  // 1. Resolução fail-closed do plano do tenant
  const planRes: TenantPlanResolution = opts.planResolution || await resolveTenantPlan(cleanTenantId, firestore);

  if (!planRes.resolved) {
    return {
      allowed: false,
      statusCode: 403,
      code: planRes.code,
      error: `Não foi possível validar o plano de assinatura do estabelecimento: ${planRes.reason}`
    };
  }

  // UNLIMITED: preserva semântica sem cap numérico
  if (planRes.maxProfessionals === 'UNLIMITED') {
    return { allowed: true, maxProfessionals: 'UNLIMITED', reserved: false };
  }

  const limitNumber = typeof planRes.maxProfessionals === 'number' ? planRes.maxProfessionals : 1;
  const capacityRef = firestore.collection('tenant_capacity').doc(cleanTenantId);
  const cleanEmail = opts.email && typeof opts.email === 'string' && opts.email.trim()
    ? opts.email.trim().toLowerCase()
    : undefined;
  const memberKey = cleanEmail ? encodeMemberKey(cleanEmail) : undefined;
  const effectiveReservationId = opts.reservationId || crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const executeReservation = async (tx?: any) => {
    let currentCount = 0;
    let capDocExists = false;
    let members: Record<string, any> = {};

    const capDoc = (tx && typeof tx.get === 'function') ? await tx.get(capacityRef) : await capacityRef.get();
    capDocExists = capDoc.exists;
    if (capDocExists) {
      const data = typeof capDoc.data === 'function' ? capDoc.data() : capDoc;
      currentCount = typeof data?.activeCount === 'number' ? data.activeCount : 0;
      members = (data?.members && typeof data.members === 'object') ? { ...data.members } : {};
    } else {
      // Bootstrap seguro: deriva ocupação real e mapa de membros existentes
      const countRes = await getActiveProfessionalsDetails(cleanTenantId, firestore);
      currentCount = countRes.count;
      members = countRes.activeMembers;
    }

    // Deduplicação concorrente com validação de ownership:
    if (memberKey) {
      const existingMember = members[memberKey];
      if (existingMember && existingMember.status === 'ACTIVE') {
        // Profissional já se encontra ativo no tenant: idempotência (+0)
        return {
          allowed: true as const,
          currentCount,
          maxProfessionals: limitNumber,
          reserved: false,
          alreadyActive: true
        };
      }
      if (existingMember && existingMember.status === 'RESERVED') {
        // Se pertencer à MESMA operação (mesmo reservationId): permite continuidade idempotente (+0)
        if (opts.reservationId && existingMember.reservationId === opts.reservationId) {
          return {
            allowed: true as const,
            currentCount,
            maxProfessionals: limitNumber,
            reserved: false,
            sameReservation: true,
            reservationId: existingMember.reservationId
          };
        }
        // Se pertencer a OUTRA operação concorrente em andamento:
        // NÃO permite que a segunda requisição concorra ou assuma a vaga!
        return {
          allowed: false as const,
          statusCode: 409,
          code: 'PROFESSIONAL_CREATION_IN_PROGRESS',
          error: 'Já existe um cadastro ou reativação em andamento para este profissional. Aguarde a conclusão da operação ou tente novamente em instantes.',
          currentCount,
          maxProfessionals: limitNumber,
          reserved: false,
          reservationId: existingMember.reservationId
        };
      }
    }

    if (currentCount >= limitNumber) {
      return {
        allowed: false as const,
        statusCode: 409,
        code: 'PROFESSIONAL_LIMIT_REACHED',
        error: `Limite de profissionais do plano atingido (capacidade máxima: ${limitNumber} ${limitNumber === 1 ? 'profissional' : 'profissionais'}). Faça upgrade do seu plano para cadastrar ou reativar membros na equipe.`,
        currentCount,
        maxProfessionals: limitNumber,
        reserved: false
      };
    }

    const nextCount = currentCount + 1;
    if (memberKey && cleanEmail) {
      members[memberKey] = {
        email: cleanEmail,
        status: 'RESERVED',
        reservationId: effectiveReservationId,
        updatedAt: nowIso,
        requestId: opts.requestId
      };
    }

    const payload: Record<string, any> = {
      tenantId: cleanTenantId,
      activeCount: nextCount,
      maxProfessionals: limitNumber,
      members,
      updatedAt: nowIso
    };

    if (tx && typeof tx.set === 'function') {
      await tx.set(capacityRef, payload, { merge: true });
    } else {
      await capacityRef.set(payload, { merge: true });
    }

    return {
      allowed: true as const,
      currentCount: nextCount,
      maxProfessionals: limitNumber,
      reserved: true,
      reservationId: effectiveReservationId
    };
  };

  try {
    if (typeof firestore.runTransaction === 'function') {
      return await firestore.runTransaction(executeReservation);
    } else {
      return await executeReservation();
    }
  } catch (err: any) {
    console.error(`[subscriptionEnforcement] Erro transacional ao reservar vaga para ${cleanTenantId}:`, err);
    return {
      allowed: false,
      statusCode: 500,
      code: 'CAPACITY_RESERVATION_FAILED',
      error: 'Erro interno ao validar capacidade de equipe do estabelecimento.'
    };
  }
}

/**
 * FASE 4.10B.4: Confirmação transacional de assento com verificação estrita de ownership da reserva.
 * Transiciona RESERVED -> ACTIVE para o reservationId proprietário.
 */
export async function confirmProfessionalSeat(
  tenantId: string,
  email: string,
  reservationId?: string,
  firestoreOverride?: any
): Promise<{ confirmed: boolean; reason?: string }> {
  if (!tenantId || !email) return { confirmed: false, reason: 'INVALID_ARGUMENTS' };
  const cleanTenantId = tenantId.trim();
  const cleanEmail = email.trim().toLowerCase();
  const firestore = firestoreOverride || getFirebaseAdmin().firestore;
  const capacityRef = firestore.collection('tenant_capacity').doc(cleanTenantId);
  const memberKey = encodeMemberKey(cleanEmail);
  const nowIso = new Date().toISOString();

  const executeConfirm = async (tx?: any): Promise<{ confirmed: boolean; reason?: string }> => {
    const capDoc = (tx && typeof tx.get === 'function') ? await tx.get(capacityRef) : await capacityRef.get();
    if (!capDoc || !capDoc.exists) {
      return { confirmed: false, reason: 'TENANT_CAPACITY_NOT_FOUND' };
    }
    const data = typeof capDoc.data === 'function' ? capDoc.data() : capDoc;
    const members = (data?.members && typeof data.members === 'object') ? { ...data.members } : {};
    const existing = members[memberKey];

    if (!existing) {
      // Sem reserva prévia contabilizada: proibido criar ACTIVE fantasma
      return { confirmed: false, reason: 'MEMBER_NOT_FOUND' };
    }

    if (existing.status === 'ACTIVE') {
      // Idempotência para retry já confirmado
      return { confirmed: true };
    }

    if (existing.status === 'INACTIVE') {
      // Proibido pular de INACTIVE direto para ACTIVE sem reserva contabilizada
      return { confirmed: false, reason: 'MEMBER_INACTIVE' };
    }

    if (existing.status === 'RESERVED') {
      if (reservationId && existing.reservationId && existing.reservationId !== reservationId) {
        // Bloqueado: a reserva pertence a outra requisição/operação
        return { confirmed: false, reason: 'RESERVATION_OWNER_MISMATCH' };
      }
      members[memberKey] = {
        email: cleanEmail,
        status: 'ACTIVE',
        updatedAt: nowIso
      };
      const payload = { members, updatedAt: nowIso };
      if (tx && typeof tx.set === 'function') {
        await tx.set(capacityRef, payload, { merge: true });
      } else {
        await capacityRef.set(payload, { merge: true });
      }
      return { confirmed: true };
    }

    return { confirmed: false, reason: 'UNKNOWN_MEMBER_STATUS' };
  };

  try {
    if (typeof firestore.runTransaction === 'function') {
      return await firestore.runTransaction(executeConfirm);
    } else {
      return await executeConfirm();
    }
  } catch (err) {
    console.warn(`[subscriptionEnforcement] Aviso ao confirmar status ativo para ${cleanEmail} em ${cleanTenantId}:`, err);
    return { confirmed: false, reason: 'TRANSACTION_ERROR' };
  }
}

/**
 * FASE 4.10B.4: Compensação estrita e segura de RESERVA que falhou antes da persistência de users.
 * Valida ownership: apenas o proprietário do reservationId pode cancelar a reserva.
 * JAMAIS inativa membro já ACTIVE e JAMAIS decrementa activeCount se o membro já for ACTIVE.
 */
export async function releaseProfessionalReservation(
  tenantId: string,
  email: string,
  reservationId: string,
  firestoreOverride?: any
): Promise<{ released: boolean; reason?: string }> {
  if (!tenantId || !email || !reservationId) return { released: false, reason: 'INVALID_ARGUMENTS' };
  const cleanTenantId = tenantId.trim();
  const cleanEmail = email.trim().toLowerCase();
  const firestore = firestoreOverride || getFirebaseAdmin().firestore;
  const capacityRef = firestore.collection('tenant_capacity').doc(cleanTenantId);
  const memberKey = encodeMemberKey(cleanEmail);
  const nowIso = new Date().toISOString();

  const executeRelease = async (tx?: any): Promise<{ released: boolean; reason?: string }> => {
    const capDoc = (tx && typeof tx.get === 'function') ? await tx.get(capacityRef) : await capacityRef.get();
    if (!capDoc || !capDoc.exists) {
      return { released: false, reason: 'TENANT_CAPACITY_NOT_FOUND' };
    }
    const data = typeof capDoc.data === 'function' ? capDoc.data() : capDoc;
    const current = typeof data?.activeCount === 'number' ? data.activeCount : 0;
    const members = (data?.members && typeof data.members === 'object') ? { ...data.members } : {};
    const existing = members[memberKey];

    if (!existing) {
      return { released: false, reason: 'MEMBER_NOT_FOUND' };
    }

    // Se o membro já está ACTIVE, um release de reserva com falha NÃO pode inativar nem decrementar
    if (existing.status === 'ACTIVE') {
      return { released: false, reason: 'ALREADY_ACTIVE' };
    }

    if (existing.status === 'INACTIVE') {
      return { released: false, reason: 'ALREADY_INACTIVE' };
    }

    if (existing.status === 'RESERVED') {
      // Validação estrita de ownership:
      if (existing.reservationId && existing.reservationId !== reservationId) {
        return { released: false, reason: 'RESERVATION_OWNER_MISMATCH' };
      }

      members[memberKey] = {
        email: cleanEmail,
        status: 'INACTIVE',
        updatedAt: nowIso
      };
      const next = Math.max(0, current - 1);
      const payload = {
        tenantId: cleanTenantId,
        activeCount: next,
        members,
        updatedAt: nowIso
      };

      if (tx && typeof tx.set === 'function') {
        await tx.set(capacityRef, payload, { merge: true });
      } else {
        await capacityRef.set(payload, { merge: true });
      }
      return { released: true };
    }

    return { released: false, reason: 'UNKNOWN_MEMBER_STATUS' };
  };

  try {
    if (typeof firestore.runTransaction === 'function') {
      return await firestore.runTransaction(executeRelease);
    } else {
      return await executeRelease();
    }
  } catch (err) {
    console.warn(`[subscriptionEnforcement] Aviso ao compensar reserva para ${cleanTenantId}:`, err);
    return { released: false, reason: 'TRANSACTION_ERROR' };
  }
}

export interface ReleaseSeatOptions {
  email?: string;
  wasActive?: boolean;
  seatReserved?: boolean;
  firestoreOverride?: any;
}

/**
 * FASE 4.10B.4: Liberação de assento por desativação de profissional real (handleDeleteProfessional).
 * Decrementa activeCount e marca status = 'INACTIVE'.
 * Protegido contra duplo decremento (se já for INACTIVE, não decrementa).
 */
export async function releaseActiveProfessionalSeat(
  tenantId: string,
  email?: string,
  firestoreOverride?: any
): Promise<{ released: boolean; reason?: string }> {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    return { released: false, reason: 'TENANT_REQUIRED' };
  }
  const cleanTenantId = tenantId.trim();
  const firestore = firestoreOverride || getFirebaseAdmin().firestore;
  const capacityRef = firestore.collection('tenant_capacity').doc(cleanTenantId);

  const cleanEmail = email && typeof email === 'string' && email.trim()
    ? email.trim().toLowerCase()
    : undefined;
  const memberKey = cleanEmail ? encodeMemberKey(cleanEmail) : undefined;
  const nowIso = new Date().toISOString();

  const executeRelease = async (tx?: any): Promise<{ released: boolean; reason?: string }> => {
    let current = 0;
    let capDocExists = false;
    let members: Record<string, any> = {};

    const capDoc = (tx && typeof tx.get === 'function') ? await tx.get(capacityRef) : await capacityRef.get();
    capDocExists = capDoc.exists;
    if (capDocExists) {
      const data = typeof capDoc.data === 'function' ? capDoc.data() : capDoc;
      current = typeof data?.activeCount === 'number' ? data.activeCount : 0;
      members = (data?.members && typeof data.members === 'object') ? { ...data.members } : {};
    } else {
      const countRes = await getActiveProfessionalsDetails(cleanTenantId, firestore);
      current = countRes.count;
      members = countRes.activeMembers;
    }

    let shouldDecrement = true;
    if (memberKey && members[memberKey]) {
      const currentMemberStatus = members[memberKey].status;
      if (currentMemberStatus === 'INACTIVE') {
        shouldDecrement = false; // Já estava inativo, proteção contra duplo decremento
      }
      members[memberKey] = {
        email: cleanEmail!,
        status: 'INACTIVE',
        updatedAt: nowIso
      };
    } else if (memberKey) {
      members[memberKey] = {
        email: cleanEmail!,
        status: 'INACTIVE',
        updatedAt: nowIso
      };
    }

    const next = shouldDecrement ? Math.max(0, current - 1) : current;
    const payload = {
      tenantId: cleanTenantId,
      activeCount: next,
      members,
      updatedAt: nowIso
    };

    if (tx && typeof tx.set === 'function') {
      await tx.set(capacityRef, payload, { merge: true });
    } else {
      await capacityRef.set(payload, { merge: true });
    }
    return { released: shouldDecrement };
  };

  try {
    if (typeof firestore.runTransaction === 'function') {
      return await firestore.runTransaction(executeRelease);
    } else {
      return await executeRelease();
    }
  } catch (err) {
    console.warn(`[subscriptionEnforcement] Aviso ao liberar assento ativo para ${cleanTenantId}:`, err);
    return { released: false, reason: 'TRANSACTION_ERROR' };
  }
}

/**
 * FASE 4.10B: Liberação segura de vaga (mantido com retrocompatibilidade).
 */
export async function releaseProfessionalSeat(
  tenantId: string,
  options?: ReleaseSeatOptions | any
): Promise<void> {
  const opts: ReleaseSeatOptions = (options && typeof options === 'object' && !options.collection) ? options : {};
  const firestore = opts.firestoreOverride || (options?.collection ? options : getFirebaseAdmin().firestore);
  await releaseActiveProfessionalSeat(tenantId, opts.email, firestore);
}



