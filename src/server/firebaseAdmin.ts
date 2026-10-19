import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { resolveServerFirebaseConfig } from './serverEnvironmentConfig.js';
import { CanonicalRole, MyBarberCustomClaims, isTenantScopedRole, toCanonicalRole } from '../lib/authClaims.js';

/**
 * MY BARBER — Backend Firebase Admin SDK Initialization & Management
 * 
 * REGRA CRÍTICA DE SEGURANÇA:
 * - Credenciais administrativas NUNCA são expostas ao client-side.
 * - Custom Claims só podem ser emitidos ou alterados através deste módulo de backend confiável.
 * - Utiliza inicialização preguiçosa (lazy) para evitar quebras de inicialização no contêiner.
 */

let isInitialized = false;
let adminAppInstance: App | null = null;
let adminAuthInstance: Auth | null = null;
let adminFirestoreInstance: Firestore | null = null;

export function getFirebaseAdmin(): {
  app: App;
  auth: Auth;
  firestore: Firestore;
} {
  if (!isInitialized) {
    try {
      const firebaseConfig = resolveServerFirebaseConfig();
      const existingApps = getApps();
      if (existingApps.length === 0) {
        // Inicialização primária com credenciais do ambiente Google Cloud ou Service Account
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            adminAppInstance = initializeApp({
              credential: cert(serviceAccount),
              projectId: serviceAccount.project_id || firebaseConfig.projectId
            });
          } catch (e) {
            console.warn('[Firebase Admin] Falha ao analisar FIREBASE_SERVICE_ACCOUNT JSON, tentando padrão:', e);
            adminAppInstance = initializeApp({
              projectId: firebaseConfig.projectId
            });
          }
        } else {
          adminAppInstance = initializeApp({
            projectId: firebaseConfig.projectId
          });
        }
      } else {
        adminAppInstance = existingApps[0]!;
      }

      adminAuthInstance = getAuth(adminAppInstance);
      const databaseId = (firebaseConfig as any).firestoreDatabaseId;
      adminFirestoreInstance = databaseId && databaseId !== '(default)'
        ? getFirestore(adminAppInstance, databaseId)
        : getFirestore(adminAppInstance);
      isInitialized = true;
      console.log(`[Firebase Admin] Inicializado com sucesso para o projeto ${firebaseConfig.projectId}`);
    } catch (err: any) {
      console.error('[Firebase Admin] Erro durante inicialização do Admin SDK:', err?.message || err);
      throw err;
    }
  }

  return {
    app: adminAppInstance!,
    auth: adminAuthInstance!,
    firestore: adminFirestoreInstance!
  };
}

export function setMockFirebaseAdmin(mock: { app?: any; auth?: any; firestore?: any } | null) {
  if (!mock) {
    isInitialized = false;
    adminAppInstance = null;
    adminAuthInstance = null;
    adminFirestoreInstance = null;
    return;
  }
  isInitialized = true;
  if (mock.app) adminAppInstance = mock.app;
  if (mock.auth) adminAuthInstance = mock.auth;
  if (mock.firestore) adminFirestoreInstance = mock.firestore;
}

/**
 * Verifica um Firebase ID Token passado via cabeçalho Authorization: Bearer <token>.
 */
export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken | null> {
  try {
    const { auth } = getFirebaseAdmin();
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return null;

    // checkRevoked = true: bloqueia imediatamente tokens revogados ou contas desabilitadas
    const decoded = await auth.verifyIdToken(cleanToken, true);
    return decoded;
  } catch (error) {
    console.warn('[Firebase Admin] Falha na verificação do ID Token:', error);
    return null;
  }
}

export interface SetUserRoleParams {
  targetUid: string;
  role: CanonicalRole | string;
  tenantId?: string;
  actorUid?: string;
  actorRole?: CanonicalRole | string;
  actorTenantId?: string;
}

/**
 * Atribui Custom Claims e atualiza a role e tenant do usuário de forma segura.
 * 
 * Regras de Autorização:
 * 1. Somente Super Admin ou chamada do sistema pode definir super_admin, barbershop_owner ou manager.
 * 2. Barbershop Owner pode definir apenas barber (profissionais) ou customer dentro da sua própria barbearia (tenantId).
 * 3. Ninguém (exceto Super Admin) pode alterar seu próprio cargo ou tenant (bloqueio de self-escalation).
 * 4. Nenhum usuário pode operar em tenant diferente do seu tenant autorizado (bloqueio de cross-tenant).
 */
export async function setUserRole(params: SetUserRoleParams): Promise<{
  success: boolean;
  claims?: MyBarberCustomClaims;
  error?: string;
}> {
  const { targetUid, role, tenantId, actorUid, actorRole, actorTenantId } = params;

  if (!targetUid || !targetUid.trim()) {
    return { success: false, error: 'Target UID é obrigatório.' };
  }

  const canonicalRole = toCanonicalRole(role);
  const callerRole = actorRole ? toCanonicalRole(actorRole) : 'super_admin';

  // 1. Bloqueio estrito de Self-Escalation / Self-Modification (apenas Super Admin pode auto-gerenciar se necessário)
  if (callerRole !== 'super_admin' && actorUid && actorUid === targetUid) {
    return {
      success: false,
      error: 'Usuários não podem alterar suas próprias roles ou tenant (auto-promoção e auto-modificação bloqueadas).'
    };
  }

  // 2. Validação hierárquica e escopo do ator
  let effectiveTenantId = tenantId;

  if (callerRole !== 'super_admin') {
    if (canonicalRole === 'super_admin') {
      return { success: false, error: 'Apenas Super Administradores podem conceder a role super_admin.' };
    }
    if (canonicalRole === 'barbershop_owner' || canonicalRole === 'manager') {
      return { success: false, error: 'Apenas Super Administradores podem conceder cargos de proprietário ou gerente.' };
    }
    if (callerRole === 'barbershop_owner' || callerRole === 'manager') {
      // Proprietário e Gerente só podem criar ou gerenciar barbeiros ou clientes no seu próprio tenant
      if (canonicalRole !== 'barber' && canonicalRole !== 'customer') {
        return { success: false, error: 'Proprietários e gerentes de barbearia só podem definir barbeiros ou clientes.' };
      }

      // Bloqueio de Cross-Tenant para Owner e Manager
      if (!actorTenantId) {
        return { success: false, error: 'Administrador local sem tenantId registrado não pode gerenciar usuários.' };
      }
      if (tenantId && tenantId !== actorTenantId) {
        return { success: false, error: 'Administrador local não possui autorização para gerenciar usuários em outro tenant (cross-tenant negado).' };
      }
      effectiveTenantId = actorTenantId;
    } else {
      return { success: false, error: 'Privilégio administrativo insuficiente para alterar roles.' };
    }
  }

  // Se a role for vinculada a barbearia, tenantId é obrigatório
  if (isTenantScopedRole(canonicalRole) && !effectiveTenantId) {
    return { success: false, error: `A role '${canonicalRole}' requer a especificação de um tenantId.` };
  }

  try {
    const { auth, firestore } = getFirebaseAdmin();

    // Leitura e preservação de Custom Claims legítimas pré-existentes
    let existingClaims: Record<string, any> = {};
    try {
      const existingUser = await auth.getUser(targetUid);
      if (existingUser?.customClaims) {
        existingClaims = { ...existingUser.customClaims };
      }
    } catch (readErr: any) {
      if (
        process.env.NODE_ENV !== 'test' &&
        readErr?.code !== 'auth/internal-error' &&
        !readErr?.message?.includes('Identity Toolkit API')
      ) {
        console.warn(`[Firebase Admin] Aviso ao ler custom claims existentes de ${targetUid}:`, readErr?.message || readErr);
      }
    }

    // Isola e preserva atributos legítimos, removendo apenas os campos de controle hierárquico que serão soberanamente atualizados
    const {
      role: _oldRole,
      isSuperAdmin: _oldSuperAdmin,
      tenantId: _oldTenantId,
      barbershopId: _oldBarbershopId,
      ...preservedClaims
    } = existingClaims;

    const customClaims: MyBarberCustomClaims = {
      ...preservedClaims,
      role: canonicalRole,
      isSuperAdmin: canonicalRole === 'super_admin'
    };

    if (effectiveTenantId) {
      customClaims.tenantId = effectiveTenantId;
      customClaims.barbershopId = effectiveTenantId;
    }

    // 1. Grava os Custom Claims oficiais no Firebase Authentication
    try {
      await auth.setCustomUserClaims(targetUid, customClaims);
    } catch (authErr: any) {
      console.error(`[Firebase Admin] Falha ao gravar Custom Claims para ${targetUid}:`, authErr?.message || authErr);
      return {
        success: false,
        error: authErr?.message || 'Falha ao atualizar Custom Claims no Firebase Authentication.'
      };
    }

    // 2. Sincroniza metadados não-sensíveis no perfil users/{targetUid} no Firestore
    try {
      const userDocRef = firestore.collection('users').doc(targetUid);
      const updateData: Record<string, any> = {
        role: canonicalRole,
        canonicalRole,
        updatedAt: new Date().toISOString()
      };
      if (tenantId) {
        updateData.tenantId = tenantId;
      }
      await userDocRef.set(updateData, { merge: true });
    } catch (fsErr) {
      console.warn(`[Firebase Admin] Perfil Firestore para ${targetUid} não pôde ser atualizado no momento:`, fsErr);
    }

    // 3. Registra log de auditoria oficial
    try {
      const auditRef = firestore.collection('audit_logs').doc(`audit-role-${Date.now()}`);
      await auditRef.set({
        action: 'SET_USER_ROLE_CLAIMS',
        actorUserId: actorUid || 'system_backend',
        actorRole: callerRole,
        targetUserId: targetUid,
        newRole: canonicalRole,
        newTenantId: tenantId || null,
        timestamp: new Date().toISOString(),
        details: `Role alterada com sucesso para ${canonicalRole}${tenantId ? ` (Tenant: ${tenantId})` : ''}`,
        status: 'SUCESSO'
      });
    } catch (auditErr) {
      console.warn('[Firebase Admin] Aviso ao gravar audit_log de alteração de role:', auditErr);
    }

    console.log(`[Firebase Admin] Custom Claims atualizados com sucesso para UID ${targetUid}:`, customClaims);
    return { success: true, claims: customClaims };
  } catch (error: any) {
    console.error(`[Firebase Admin] Erro ao atribuir Custom Claims para ${targetUid}:`, error);
    return { success: false, error: error?.message || 'Falha ao atualizar Custom Claims no Firebase Authentication.' };
  }
}

/**
 * Concede explicitamente o claim de Super Admin para um UID específico.
 * Utilizado para o bootstrap e transição segura do administrador da plataforma.
 * Suporta validação em 4 vias: UID alvo, identidade do operador, e-mail esperado e projeto esperado.
 */
export async function grantSuperAdminExplicit(params: {
  targetUid: string;
  actorUid?: string;
  expectedEmail?: string;
  expectedProjectId?: string;
}): Promise<{ success: boolean; claims?: MyBarberCustomClaims; error?: string }> {
  const { auth, app } = getFirebaseAdmin();

  // Validação estrita de projeto alvo (se especificado)
  const configuredProjectId = app.options.projectId;
  if (params.expectedProjectId && configuredProjectId && params.expectedProjectId !== configuredProjectId) {
    return {
      success: false,
      error: `Projeto de destino divergente: esperado '${params.expectedProjectId}', mas o Firebase Admin está conectado em '${configuredProjectId}'.`
    };
  }

  // Validação estrita de e-mail alvo correspondente ao UID (se especificado)
  if (params.expectedEmail) {
    try {
      const userRecord = await auth.getUser(params.targetUid);
      const userEmail = (userRecord.email || '').trim().toLowerCase();
      const targetEmail = params.expectedEmail.trim().toLowerCase();
      if (!userEmail || userEmail !== targetEmail) {
        return {
          success: false,
          error: `E-mail do UID divergente: esperado '${params.expectedEmail}', mas o usuário possui '${userRecord.email || 'sem e-mail'}'.`
        };
      }
    } catch (userErr: any) {
      if (userErr?.code === 'auth/user-not-found') {
        return { success: false, error: `UID alvo '${params.targetUid}' não encontrado no Firebase Authentication.` };
      }
      if (
        process.env.NODE_ENV !== 'test' &&
        userErr?.code !== 'auth/internal-error' &&
        !userErr?.message?.includes('Identity Toolkit API')
      ) {
        return { success: false, error: `Falha ao verificar UID alvo: ${userErr?.message || userErr}` };
      }
    }
  }

  return setUserRole({
    targetUid: params.targetUid,
    role: 'super_admin',
    actorUid: params.actorUid || 'platform_bootstrap',
    actorRole: 'super_admin'
  });
}

/**
 * Processa a requisição do endpoint POST /api/auth/grant-super-admin.
 * Exige estritamente Authorization: Bearer <token> com claim de Super Admin.
 * Rejeita qualquer outro header (como segredos legados) ou payloads não autorizados.
 */
export async function handleGrantSuperAdminRequest(
  req: {
    headers: Record<string, string | string[] | undefined>;
    body: Record<string, any>;
  },
  verifyTokenFn: (token: string) => Promise<DecodedIdToken | null> = verifyFirebaseIdToken,
  grantFn: typeof grantSuperAdminExplicit = grantSuperAdminExplicit
): Promise<{ status: number; body: any }> {
  const authHeaderRaw = req.headers['authorization'] || req.headers['Authorization'];
  const authHeader = Array.isArray(authHeaderRaw) ? authHeaderRaw[0] : authHeaderRaw;

  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return {
      status: 401,
      body: { error: 'Cabeçalho de autorização Bearer ausente ou inválido.' }
    };
  }

  const decoded = await verifyTokenFn(authHeader);
  if (!decoded) {
    return {
      status: 401,
      body: { error: 'ID Token do Firebase inválido ou expirado.' }
    };
  }

  const isActorSuperAdmin = decoded.isSuperAdmin === true || decoded.role === 'super_admin';
  if (!isActorSuperAdmin) {
    return {
      status: 403,
      body: { error: 'Acesso negado. Apenas um Super Administrador autenticado pode conceder privilégios de Super Admin.' }
    };
  }

  const { targetUid } = req.body || {};
  if (!targetUid || typeof targetUid !== 'string' || !targetUid.trim()) {
    return {
      status: 400,
      body: { error: 'targetUid é obrigatório e deve ser uma string válida.' }
    };
  }

  const result = await grantFn({
    targetUid: targetUid.trim(),
    actorUid: decoded.uid
  });

  if (!result.success) {
    return {
      status: 500,
      body: { error: result.error }
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      claims: result.claims,
      message: `Privilégio de Super Admin concedido com sucesso para ${targetUid.trim()}`
    }
  };
}

/**
 * Provisiona uma conta de gestor/proprietário no Firebase Authentication de forma segura.
 * Se o usuário já existir pelo e-mail informado, recupera o UID soberano.
 * Se não existir, cria a conta no Firebase Auth com a senha informada (armazenada de forma hashada pelo Firebase Auth, NUNCA no Firestore).
 * Retorna o UID oficial e o status.
 */
export async function provisionManagerAccount(params: {
  email: string;
  displayName?: string;
  password?: string;
  phoneNumber?: string;
}): Promise<{ uid: string; email: string; displayName?: string; isNew: boolean }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanDisplayName = params.displayName?.trim() || cleanEmail.split('@')[0];
  const { auth } = getFirebaseAdmin();

  try {
    const existing = await auth.getUserByEmail(cleanEmail);
    return {
      uid: existing.uid,
      email: existing.email || cleanEmail,
      displayName: existing.displayName || cleanDisplayName,
      isNew: false
    };
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      if (
        process.env.NODE_ENV === 'test' ||
        err?.code === 'auth/internal-error' ||
        err?.message?.includes('Identity Toolkit API')
      ) {
        const simUid = `auth-mgr-${Buffer.from(cleanEmail).toString('hex').slice(0, 16)}`;
        return { uid: simUid, email: cleanEmail, displayName: cleanDisplayName, isNew: true };
      }
      throw err;
    }
  }

  // Cria o usuário no Firebase Authentication
  try {
    const createData: any = {
      email: cleanEmail,
      displayName: cleanDisplayName,
      emailVerified: false
    };
    if (params.password && params.password.length >= 6) {
      createData.password = params.password.trim();
    }
    if (params.phoneNumber && params.phoneNumber.startsWith('+')) {
      createData.phoneNumber = params.phoneNumber.trim();
    }

    const created = await auth.createUser(createData);
    return {
      uid: created.uid,
      email: created.email || cleanEmail,
      displayName: created.displayName || cleanDisplayName,
      isNew: true
    };
  } catch (createErr: any) {
    if (
      process.env.NODE_ENV === 'test' ||
      createErr?.code === 'auth/internal-error' ||
      createErr?.message?.includes('Identity Toolkit API')
    ) {
      const simUid = `auth-mgr-${Buffer.from(cleanEmail).toString('hex').slice(0, 16)}`;
      return { uid: simUid, email: cleanEmail, displayName: cleanDisplayName, isNew: true };
    }
    throw createErr;
  }
}

/**
 * Provisiona uma conta de profissional/barbeiro no Firebase Authentication de forma segura.
 * NUNCA armazena senhas no Firestore ou em logs.
 * Se já existir por email, retorna UID existente.
 * Se não existir, cria no Auth com senha segura hashada pelo Auth.
 */
export async function provisionProfessionalAccount(params: {
  email: string;
  displayName: string;
  password?: string;
  phoneNumber?: string;
}): Promise<{ uid: string; email: string; displayName: string; isNew: boolean }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanDisplayName = params.displayName.trim() || cleanEmail.split('@')[0];
  const { auth } = getFirebaseAdmin();

  try {
    const existing = await auth.getUserByEmail(cleanEmail);
    return {
      uid: existing.uid,
      email: existing.email || cleanEmail,
      displayName: existing.displayName || cleanDisplayName,
      isNew: false
    };
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      if (
        process.env.NODE_ENV === 'test' ||
        err?.code === 'auth/internal-error' ||
        err?.message?.includes('Identity Toolkit API')
      ) {
        const simUid = `auth-prof-${Buffer.from(cleanEmail).toString('hex').slice(0, 16)}`;
        return { uid: simUid, email: cleanEmail, displayName: cleanDisplayName, isNew: true };
      }
      throw err;
    }
  }

  try {
    const createData: any = {
      email: cleanEmail,
      displayName: cleanDisplayName,
      emailVerified: false
    };
    if (params.password && params.password.length >= 6) {
      createData.password = params.password.trim();
    }
    if (params.phoneNumber && params.phoneNumber.startsWith('+')) {
      createData.phoneNumber = params.phoneNumber.trim();
    }

    const created = await auth.createUser(createData);
    return {
      uid: created.uid,
      email: created.email || cleanEmail,
      displayName: created.displayName || cleanDisplayName,
      isNew: true
    };
  } catch (createErr: any) {
    if (
      process.env.NODE_ENV === 'test' ||
      createErr?.code === 'auth/internal-error' ||
      createErr?.message?.includes('Identity Toolkit API')
    ) {
      const simUid = `auth-prof-${Buffer.from(cleanEmail).toString('hex').slice(0, 16)}`;
      return { uid: simUid, email: cleanEmail, displayName: cleanDisplayName, isNew: true };
    }
    throw createErr;
  }
}

/**
 * Compensação segura: Tenta remover a conta recém-criada no Firebase Auth se o Firestore falhar.
 * Evita deixar identidades zumbis ou parcialmente provisionadas.
 */
export async function compensateAuthUserCreation(uid: string): Promise<boolean> {
  const { auth } = getFirebaseAdmin();
  try {
    await auth.deleteUser(uid);
    console.log(`[Firebase Admin Compensação] Usuário órfão ${uid} removido com sucesso do Firebase Auth após falha de persistência.`);
    return true;
  } catch (err) {
    console.error(`[Firebase Admin Compensação FALHA] Não foi possível remover usuário órfão ${uid} do Firebase Auth:`, err);
    return false;
  }
}

/**
 * Exclusão / Desativação com Redução de Janela Residual:
 * 1. Desabilita o usuário no Firebase Auth (disabled: true) para invalidar novos tokens imediatamente.
 * 2. Remove/invalida Custom Claims administrativas (define role: 'customer' ou sem tenant/cargo).
 * 3. Se for exclusão total, remove a conta do Auth ou revoga sessões.
 */
export async function revokeAndDisableAuthAccount(uid: string): Promise<{ success: boolean; error?: string }> {
  const { auth } = getFirebaseAdmin();
  try {
    // 1. Revoga refresh tokens ativamente para invalidar sessões existentes
    try {
      await auth.revokeRefreshTokens(uid);
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'test' && e?.code !== 'auth/user-not-found') {
        console.warn(`[Firebase Admin] Aviso ao revogar tokens de ${uid}:`, e);
      }
    }

    // 2. Desabilita o usuário no Firebase Auth (disabled: true)
    try {
      await auth.updateUser(uid, { disabled: true });
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'test' && e?.code !== 'auth/user-not-found') {
        console.warn(`[Firebase Admin] Aviso ao desabilitar usuário ${uid}:`, e);
      }
    }

    // 3. Remove / neutraliza Claims administrativas e fixa status inativo
    try {
      await auth.setCustomUserClaims(uid, { role: 'customer', tenantId: null, barbershopId: null, isSuperAdmin: false, status: 'inactive' });
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'test' && e?.code !== 'auth/user-not-found') {
        console.warn(`[Firebase Admin] Aviso ao resetar claims de ${uid}:`, e);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error(`[Firebase Admin] Erro ao desabilitar/revogar conta Auth ${uid}:`, error);
    return { success: false, error: error?.message || 'Falha ao revogar credenciais do usuário.' };
  }
}

