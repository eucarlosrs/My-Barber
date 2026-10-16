import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { AuthenticatedRequest } from './authMiddleware.js';
import {
  setUserRole,
  provisionProfessionalAccount,
  compensateAuthUserCreation,
  revokeAndDisableAuthAccount,
  getFirebaseAdmin
} from './firebaseAdmin.js';
import {
  assertTenantSubscriptionActive,
  resolveTenantPlan,
  reserveProfessionalSeat,
  confirmProfessionalSeat,
  releaseProfessionalSeat,
  releaseProfessionalReservation,
  releaseActiveProfessionalSeat
} from './subscriptionEnforcement.js';
import { recordAuditLog } from './auditLogService.js';

/**
 * Controller autoritativo de Equipe / Profissionais (FASE 2.3C)
 * 
 * Centraliza a criação e exclusão de profissionais no backend via Admin SDK:
 * 1. Firebase Auth UID oficial
 * 2. Custom Claims soberanas (role: 'barber', tenantId)
 * 3. users/{uid} no Firestore com id === uid e uid === uid
 * 4. Compensação segura em caso de falha de persistência
 * 5. Ordem segura de revogação na exclusão
 */

export async function handleCreateProfessional(req: Request, res: Response) {
  const actor = (req as AuthenticatedRequest).user;
  if (!actor) {
    return res.status(401).json({ error: 'Autenticação obrigatória.' });
  }

  const isSuperAdmin = actor.isSuperAdmin === true || actor.role === 'super_admin';
  const isOwnerOrManager = actor.role === 'barbershop_owner' || actor.role === 'manager';

  if (!isSuperAdmin && !isOwnerOrManager) {
    return res.status(403).json({
      error: 'Acesso negado: apenas proprietários, gerentes ou Super Administradores podem cadastrar profissionais.'
    });
  }

  // Derivação soberana do tenantId
  let effectiveTenantId = actor.tenantId;
  if (isSuperAdmin) {
    effectiveTenantId = (req.body.tenantId || '').trim();
  } else if (req.body.tenantId && req.body.tenantId.trim() !== actor.tenantId) {
    return res.status(403).json({
      error: 'Acesso negado: violação de isolamento multi-tenant (cross-tenant negado).'
    });
  }

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'TenantId é obrigatório para cadastrar profissional.' });
  }

  // Enforcement de Assinatura Ativa (Bloqueia criação em tenants SUSPENDED ou CANCELED)
  if (!isSuperAdmin) {
    const subCheck = await assertTenantSubscriptionActive(effectiveTenantId);
    if (!subCheck.allowed && (subCheck.status === 'SUSPENDED' || subCheck.status === 'CANCELED')) {
      return res.status(subCheck.statusCode || 403).json({
        error: subCheck.reason || 'Operação bloqueada: o estabelecimento está com assinatura suspensa ou cancelada.',
        subscriptionStatus: subCheck.status
      });
    }
  }

  const { name, email, password, whatsapp, phone, commissionPercentage, canViewAllProfessionals, specialties, avatarUrl, username } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nome do profissional é obrigatório.' });
  }

  const cleanName = name.trim();
  const cleanEmail = (email && typeof email === 'string' && email.trim())
    ? email.trim().toLowerCase()
    : `${username ? username.trim().toLowerCase() : `prof-${Date.now()}`}@${effectiveTenantId}.mybarber.com.br`;

  const { firestore } = getFirebaseAdmin();

  // FASE 4.10B.2: 1. Resolução autoritativa e FAIL-CLOSED do plano do tenant ANTES de qualquer efeito colateral
  const planResolution = await resolveTenantPlan(effectiveTenantId, firestore);
  if (!planResolution.resolved) {
    return res.status(403).json({
      error: `Não foi possível validar o plano de assinatura do estabelecimento: ${planResolution.reason}`,
      code: planResolution.code || 'ENTITLEMENT_UNRESOLVED',
      planId: planResolution.planId
    });
  }

  // FASE 4.10B.4: 2. Reserva atômica de vaga no tenant com ownership transacional
  const reservationId = crypto.randomUUID();
  const capacityResult = await reserveProfessionalSeat(effectiveTenantId, {
    email: cleanEmail,
    reservationId,
    planResolution,
    firestoreOverride: firestore,
    requestId: (req as any).id
  });

  if (!capacityResult.allowed) {
    return res.status(capacityResult.statusCode || 409).json({
      error: capacityResult.error || 'Limite de profissionais do plano atingido.',
      code: capacityResult.code || 'PROFESSIONAL_LIMIT_REACHED',
      maxProfessionals: capacityResult.maxProfessionals,
      currentCount: capacityResult.currentCount
    });
  }

  const seatReserved = capacityResult.reserved === true;

  let createdAuthUid: string | null = null;
  let isNewUser = false;

  try {
    // 1. Provisiona identidade no Firebase Auth
    const authResult = await provisionProfessionalAccount({
      email: cleanEmail,
      displayName: cleanName,
      password: (typeof password === 'string' && password.trim().length >= 6) ? password.trim() : undefined,
      phoneNumber: (typeof whatsapp === 'string' && whatsapp.trim().startsWith('+')) ? whatsapp.trim() : undefined
    });

    createdAuthUid = authResult.uid;
    isNewUser = authResult.isNew;

    // Se o usuário Auth já existia previamente, verificar se não pertence a outro tenant ou se possui perfil administrativo
    if (!isNewUser) {
      try {
        const { auth } = getFirebaseAdmin();
        const existingRecord = await auth.getUser(createdAuthUid);
        const existingClaims = (existingRecord.customClaims || {}) as Record<string, any>;
        const existingDocSnap = await firestore.collection('users').doc(createdAuthUid).get();
        const existingDocData = existingDocSnap.exists ? existingDocSnap.data() : null;

        const existingTenantId = existingClaims.tenantId || existingDocData?.tenantId;
        if (existingTenantId && existingTenantId !== effectiveTenantId) {
          if (seatReserved) await releaseProfessionalReservation(effectiveTenantId, cleanEmail, reservationId, firestore);
          return res.status(409).json({
            error: 'Conflito de identidade: este e-mail já está cadastrado em outra barbearia ou tenant.'
          });
        }

        const existingRole = String(existingClaims.role || existingDocData?.role || existingDocData?.canonicalRole || '').toUpperCase();
        if (['SUPER_ADMIN', 'SUPER_ADMINISTRADOR', 'BARBERSHOP_OWNER', 'OWNER', 'PROPRIETARIO', 'DONO_DE_BARBEARIA', 'MANAGER', 'GERENTE'].includes(existingRole) || existingClaims.isSuperAdmin === true || existingDocData?.isSuperAdmin === true) {
          if (seatReserved) await releaseProfessionalReservation(effectiveTenantId, cleanEmail, reservationId, firestore);
          return res.status(409).json({
            error: 'Conflito de privilégio: contas administrativas (proprietários, gerentes ou super admins) não podem ser convertidas em profissional através deste endpoint.'
          });
        }
      } catch (checkErr: any) {
        if (checkErr?.code !== 'auth/user-not-found') {
          console.warn('[handleCreateProfessional] Aviso ao validar usuário existente:', checkErr);
        }
      }
    }

    // 2. Define Custom Claims soberanas no Firebase Authentication
    // O papel é estritamente fixado em 'barber', ignorando qualquer tentativa de manipulação via body
    const claimsResult = await setUserRole({
      targetUid: createdAuthUid,
      role: 'barber',
      tenantId: effectiveTenantId,
      actorUid: actor.uid,
      actorRole: actor.role,
      actorTenantId: actor.tenantId
    });

    if (!claimsResult.success) {
      if (isNewUser && createdAuthUid) {
        await compensateAuthUserCreation(createdAuthUid);
      }
      if (seatReserved) {
        await releaseProfessionalReservation(effectiveTenantId, cleanEmail, reservationId, firestore);
      }
      return res.status(500).json({
        error: claimsResult.error || 'Falha ao atribuir Custom Claims para o profissional.'
      });
    }

    // 3. Persiste o perfil canônico em users/{uid} com id === uid e uid === uid
    const nowIso = new Date().toISOString();

    const professionalDoc: Record<string, any> = {
      id: createdAuthUid,
      uid: createdAuthUid,
      tenantId: effectiveTenantId,
      role: 'PROFISSIONAL',
      canonicalRole: 'barber',
      status: 'active',
      name: cleanName,
      email: cleanEmail,
      whatsapp: typeof whatsapp === 'string' ? whatsapp.trim() : '',
      phone: typeof phone === 'string' ? phone.trim() : (typeof whatsapp === 'string' ? whatsapp.trim() : ''),
      avatarUrl: typeof avatarUrl === 'string' ? avatarUrl.trim() : undefined,
      commissionPercentage: typeof commissionPercentage === 'number' ? commissionPercentage : 50,
      canViewAllProfessionals: Boolean(canViewAllProfessionals),
      specialties: Array.isArray(specialties) ? specialties : ['Cortes em Geral'],
      username: typeof username === 'string' ? username.trim().toLowerCase() : undefined,
      authProvider: 'FIREBASE_AUTH',
      createdByUserId: actor.uid,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // Remover chaves undefined
    Object.keys(professionalDoc).forEach(k => professionalDoc[k] === undefined && delete professionalDoc[k]);

    // Tenta persistir no Firestore
    try {
      await firestore.collection('users').doc(createdAuthUid).set(professionalDoc, { merge: true });
    } catch (fsErr: any) {
      console.error(`[Compensação] Falha ao persistir Firestore para ${createdAuthUid}. Acionando compensação...`);
      if (isNewUser && createdAuthUid) {
        await compensateAuthUserCreation(createdAuthUid);
      }
      if (seatReserved) {
        await releaseProfessionalReservation(effectiveTenantId, cleanEmail, reservationId, firestore);
      }
      return res.status(500).json({
        error: 'Falha na persistência do perfil no Firestore. O provisionamento foi cancelado e compensado com segurança.'
      });
    }

    // Confirmação atômica do assento como ACTIVE no tenant_capacity validando ownership
    await confirmProfessionalSeat(effectiveTenantId, cleanEmail, reservationId, firestore);

    // Sincroniza projeção pública para novos agendamentos
    try {
      await firestore.collection('publicProfessionalProfiles').doc(createdAuthUid).set({
        id: createdAuthUid,
        name: cleanName,
        tenantId: effectiveTenantId,
        avatarUrl: professionalDoc.avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
        specialties: professionalDoc.specialties || ['Cortes em Geral']
      }, { merge: true });
    } catch (pubErr) {
      console.warn('[handleCreateProfessional] Aviso ao sincronizar perfil público:', pubErr);
    }

    // 4. Auditoria administrativa oficial (FASE 4.4D)
    await recordAuditLog({
      actorUid: actor.uid,
      actorRole: actor.role || 'user',
      tenantId: effectiveTenantId,
      action: 'PROFESSIONAL_CREATED',
      targetType: 'team_member',
      targetId: createdAuthUid,
      previousState: null,
      newState: { name: cleanName, email: cleanEmail, role: 'barber', tenantId: effectiveTenantId },
      details: `Profissional cadastrado com sucesso: ${cleanName}`,
      requestId: (req as any).id
    });

    // Retorna resposta segura sem expor senhas ou tokens
    return res.status(201).json({
      success: true,
      user: professionalDoc,
      claims: claimsResult.claims
    });
  } catch (err: any) {
    console.error('[handleCreateProfessional] Erro durante criação de profissional:', err?.message || err);
    if (seatReserved) {
      try {
        await releaseProfessionalReservation(effectiveTenantId, cleanEmail, reservationId, firestore);
      } catch (relErr) {
        console.warn('[handleCreateProfessional] Aviso ao compensar vaga de capacidade após erro:', relErr);
      }
    }
    if (isNewUser && createdAuthUid) {
      try {
        await compensateAuthUserCreation(createdAuthUid);
      } catch (compErr) {
        console.error('[Compensação Crítica] Falha adicional na compensação:', compErr);
      }
    }
    return res.status(500).json({ error: err.message || 'Erro interno ao criar profissional.' });
  }
}

export async function handleDeleteProfessional(req: Request, res: Response) {
  try {
    const actor = (req as AuthenticatedRequest).user;
    if (!actor) {
      return res.status(401).json({ error: 'Autenticação obrigatória.' });
    }

    const isSuperAdmin = actor.isSuperAdmin === true || actor.role === 'super_admin';
    const isOwnerOrManager = actor.role === 'barbershop_owner' || actor.role === 'manager';

    if (!isSuperAdmin && !isOwnerOrManager) {
      return res.status(403).json({
        error: 'Acesso negado: privilégio insuficiente para excluir profissional.'
      });
    }

    const profId = req.params.id;
    if (!profId || !profId.trim()) {
      return res.status(400).json({ error: 'Identificador do profissional é obrigatório.' });
    }

    const { firestore } = getFirebaseAdmin();

    // Localiza o documento em users (pelo docId ou buscando por uid)
    let docRef = firestore.collection('users').doc(profId);
    let docSnap = await docRef.get();

    let targetData: any = docSnap.exists ? docSnap.data() : null;

    if (!targetData) {
      // Tenta localizar por campo uid caso profId seja um legacyId ou vice-versa
      const snapByUid = await firestore.collection('users').where('uid', '==', profId).limit(1).get();
      if (!snapByUid.empty) {
        docRef = snapByUid.docs[0].ref;
        targetData = snapByUid.docs[0].data();
      }
    }

    if (!targetData) {
      return res.status(404).json({ error: 'Profissional não encontrado no sistema.' });
    }

    // 1. Bloqueio de autoexclusão (o ator não pode excluir a própria conta neste endpoint)
    if (targetData.uid === actor.uid || profId === actor.uid || docRef.id === actor.uid) {
      return res.status(400).json({
        error: 'Você não pode excluir ou inativar sua própria conta através deste endpoint.'
      });
    }

    // 2. Bloqueio de alvos administrativos (super_admin, owner, manager, etc.)
    const targetRole = String(targetData.role || targetData.canonicalRole || '').toUpperCase();
    const administrativeRoles = [
      'SUPER_ADMIN',
      'SUPER_ADMINISTRADOR',
      'BARBERSHOP_OWNER',
      'OWNER',
      'PROPRIETARIO',
      'DONO_DE_BARBEARIA',
      'MANAGER',
      'GERENTE'
    ];
    if (administrativeRoles.includes(targetRole) || targetData.isSuperAdmin === true) {
      return res.status(403).json({
        error: 'Acesso negado: contas administrativas (proprietários, gerentes ou super admins) não podem ser removidas pelo endpoint de equipe.'
      });
    }

    // 3. Validação de Tenant (Anti-Cross-Tenant)
    if (!isSuperAdmin) {
      if (!actor.tenantId || targetData.tenantId !== actor.tenantId) {
        return res.status(403).json({
          error: 'Acesso negado: você não possui autorização para gerenciar profissionais de outra barbearia.'
        });
      }

      const subCheck = await assertTenantSubscriptionActive(targetData.tenantId);
      if (!subCheck.allowed && (subCheck.status === 'SUSPENDED' || subCheck.status === 'CANCELED')) {
        return res.status(subCheck.statusCode || 403).json({
          error: subCheck.reason || 'Operação bloqueada: o estabelecimento está com assinatura suspensa ou cancelada.',
          subscriptionStatus: subCheck.status
        });
      }
    }

    // 4. Validação estrita de tipo de alvo: permite apenas papel de profissional
    const isProfessionalRole = targetRole === 'PROFISSIONAL' || targetRole === 'BARBER' || targetData.canonicalRole === 'barber';
    if (!isProfessionalRole) {
      return res.status(400).json({
        error: 'Identificador não corresponde a um profissional válido.'
      });
    }

    // Resolução do Firebase Auth UID oficial
    const realAuthUid = targetData.uid || (profId.startsWith('auth-') || !profId.startsWith('user-') ? profId : null);
    const wasActive = targetData.status !== 'inactive';

    // 5. Revoga e desabilita credenciais no Firebase Auth (se existir conta Auth vinculada)
    if (realAuthUid) {
      await revokeAndDisableAuthAccount(realAuthUid);
    }

    // 6. Soft Delete no Firestore: preserva users/{uid} para fins de histórico e auditoria,
    // atualizando status para 'inactive' sem apagar registros ou comissões passadas.
    const nowIso = new Date().toISOString();
    await docRef.set({
      status: 'inactive',
      updatedAt: nowIso,
      inactivatedAt: nowIso,
      inactivatedByUserId: actor.uid
    }, { merge: true });

    // FASE 4.10B.4: Libera vaga de capacidade ativa caso o profissional não estivesse previamente inativo (evita duplo decremento)
    if (wasActive) {
      try {
        await releaseActiveProfessionalSeat(targetData.tenantId, targetData.email, firestore);
      } catch (relErr) {
        console.warn('[handleDeleteProfessional] Aviso ao liberar vaga de capacidade:', relErr);
      }
    }

    // 7. Remove projeção pública para que o profissional não apareça mais para novos agendamentos públicos
    try {
      await firestore.collection('publicProfessionalProfiles').doc(docRef.id).delete().catch(() => {});
      if (targetData.uid && targetData.uid !== docRef.id) {
        await firestore.collection('publicProfessionalProfiles').doc(targetData.uid).delete().catch(() => {});
      }
    } catch (pubErr) {
      console.warn('[handleDeleteProfessional] Aviso ao remover perfil público:', pubErr);
    }

    // 8. Auditoria administrativa oficial (FASE 4.4D)
    await recordAuditLog({
      actorUid: actor.uid,
      actorRole: actor.role || 'user',
      tenantId: targetData.tenantId,
      action: 'PROFESSIONAL_DEACTIVATED',
      targetType: 'team_member',
      targetId: docRef.id,
      previousState: { status: targetData.status || 'active' },
      newState: { status: 'inactive' },
      details: `Profissional inativado e credenciais revogadas: ${targetData.name || profId}`,
      requestId: (req as any).id
    });

    return res.status(200).json({
      success: true,
      status: 'inactive',
      targetId: docRef.id,
      message: `Profissional ${targetData.name || profId} inativado com sucesso e credenciais revogadas.`
    });
  } catch (err: any) {
    console.error('[handleDeleteProfessional] Erro:', err);
    return res.status(500).json({ error: err.message || 'Erro interno ao remover profissional.' });
  }
}
