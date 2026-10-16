import { Request, Response } from 'express';
import { AuthenticatedRequest } from './authMiddleware.js';
import { getFirebaseAdmin, revokeAndDisableAuthAccount } from './firebaseAdmin.js';
import { recordAuditLog } from './auditLogService.js';

/**
 * MY BARBER — Customer Lifecycle Controller
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. A autoridade de identidade advém EXCLUSIVAMENTE do Firebase ID Token (UID do token).
 * 2. Um cliente comum só pode desativar o SEU PRÓPRIO perfil (targetUid === actor.uid).
 * 3. Proprietários e Gerentes só podem desativar clientes associados ao seu próprio tenant.
 * 4. Super Admin possui escopo global para gestão de clientes.
 * 5. NUNCA aceita tenantId do body cegamente para autorização.
 * 6. Soft delete: marca status='inactive', preservando histórico de agendamentos e transações financeiras.
 * 7. Sincroniza estado com Firebase Auth revogando sessões ativas e desabilitando o usuário.
 * 8. Não assume atomicidade inexistente entre Auth e Firestore (fluxo compensatório / idempotente).
 */

export async function handleDeactivateCustomer(req: Request, res: Response) {
  try {
    const actor = (req as AuthenticatedRequest).user;
    if (!actor || !actor.uid) {
      return res.status(401).json({ error: 'Autenticação obrigatória.' });
    }

    const isSuperAdmin = actor.isSuperAdmin === true || actor.role === 'super_admin';
    const isOwnerOrManager = actor.role === 'barbershop_owner' || actor.role === 'manager';
    const isCustomer = actor.role === 'customer' || (!isSuperAdmin && !isOwnerOrManager);

    // Identificação do alvo
    const requestedTargetId = (req.body?.customerId || req.body?.targetUid || req.body?.id || '').trim();
    const targetId = requestedTargetId || actor.uid;

    // 1. Cliente comum só pode atuar sobre sua própria identidade
    if (isCustomer && requestedTargetId && requestedTargetId !== actor.uid) {
      return res.status(403).json({
        error: 'Acesso negado: clientes só podem desativar a própria conta de usuário.'
      });
    }

    // Gestor tentando desativar a própria conta neste endpoint
    if (!isCustomer && targetId === actor.uid) {
      return res.status(400).json({
        error: 'Operação inválida: gestores e administradores não podem desativar a própria conta através deste endpoint.'
      });
    }

    const { firestore } = getFirebaseAdmin();

    // 2. Localização do documento de perfil do cliente
    let docRef = firestore.collection('users').doc(targetId);
    let docSnap = await docRef.get();
    let targetData: any = docSnap.exists ? docSnap.data() : null;

    if (!targetData) {
      // Busca alternativa por campo uid (para documentos com docId legado)
      const querySnap = firestore.collection('users').where('uid', '==', targetId);
      const snapByUid = typeof querySnap.limit === 'function' ? await querySnap.limit(1).get() : await querySnap.get();
      if (!snapByUid.empty) {
        docRef = snapByUid.docs[0].ref;
        targetData = snapByUid.docs[0].data();
      }
    }

    // Se o cliente autenticado está desativando a própria conta e ainda não tem doc no Firestore
    // (ex: recém-criado via Google Popup sem agendamento prévio)
    if (!targetData && isCustomer && targetId === actor.uid) {
      // Desativa diretamente no Firebase Auth
      await revokeAndDisableAuthAccount(actor.uid);
      return res.status(200).json({
        success: true,
        status: 'inactive',
        customerId: actor.uid,
        message: 'Conta de cliente desativada e credenciais revogadas com sucesso.'
      });
    }

    if (!targetData) {
      return res.status(404).json({ error: 'Cliente não encontrado no sistema.' });
    }

    // 3. Bloqueio estrito de contas administrativas ou equipe
    const targetRole = String(targetData.role || targetData.canonicalRole || '').toUpperCase();
    const nonCustomerRoles = [
      'SUPER_ADMIN',
      'SUPER_ADMINISTRADOR',
      'BARBERSHOP_OWNER',
      'OWNER',
      'PROPRIETARIO',
      'DONO_DE_BARBEARIA',
      'MANAGER',
      'GERENTE',
      'PROFISSIONAL',
      'BARBER'
    ];
    if (nonCustomerRoles.includes(targetRole) || targetData.isSuperAdmin === true) {
      return res.status(400).json({
        error: 'Acesso negado: este endpoint é exclusivo para desativação de perfil CLIENTE. Contas administrativas ou de profissionais devem utilizar seus respectivos fluxos autoritativos.'
      });
    }

    // 4. Validação de Tenant para Owner e Gerente (Anti-Cross-Tenant)
    if (isOwnerOrManager && !isSuperAdmin) {
      const actorTenantId = actor.tenantId || (actor as any).barbershopId;
      if (!actorTenantId) {
        return res.status(403).json({
          error: 'Acesso negado: administrador local sem barbearia definida.'
        });
      }
      if (!targetData.tenantId || targetData.tenantId !== actorTenantId) {
        return res.status(403).json({
          error: 'Acesso negado: você não possui permissão para gerenciar clientes de outro tenant (outra barbearia).'
        });
      }
    }

    // 5. Se já estiver inativo (idempotência)
    if (targetData.status === 'inactive') {
      const realUid = targetData.uid || (targetId.startsWith('auth-') || !targetId.startsWith('user-') ? targetId : null);
      if (realUid) {
        await revokeAndDisableAuthAccount(realUid);
      }
      return res.status(200).json({
        success: true,
        status: 'inactive',
        customerId: docRef.id,
        message: 'Conta de cliente já se encontra desativada.'
      });
    }

    // 6. Sincronização segura com Firebase Auth (revoga tokens e desabilita)
    const realAuthUid = targetData.uid || (targetId.startsWith('auth-') || !targetId.startsWith('user-') ? targetId : null);
    if (realAuthUid) {
      const authRes = await revokeAndDisableAuthAccount(realAuthUid);
      if (!authRes.success) {
        console.warn(`[handleDeactivateCustomer] Aviso ao revogar credenciais Auth de ${realAuthUid}: ${authRes.error}`);
      }
    }

    // 7. Soft delete / desativação no Firestore com preservação histórica
    // Mantém: id, uid, tenantId, appointments vinculados e histórico financeiro/auditoria
    const nowIso = new Date().toISOString();
    await docRef.set({
      status: 'inactive',
      updatedAt: nowIso,
      deactivatedAt: nowIso,
      deactivatedByUserId: actor.uid
    }, { merge: true });

    // 8. Auditoria administrativa oficial (FASE 4.4D)
    await recordAuditLog({
      actorUid: actor.uid,
      actorRole: actor.role || 'user',
      tenantId: targetData.tenantId,
      action: 'CUSTOMER_DEACTIVATED',
      targetType: 'customer',
      targetId: docRef.id,
      previousState: { status: targetData.status || 'active' },
      newState: { status: 'inactive' },
      details: `Cliente desativado e credenciais revogadas: ${targetData.name || docRef.id}`,
      requestId: (req as any).id
    });

    return res.status(200).json({
      success: true,
      status: 'inactive',
      customerId: docRef.id,
      message: `Cliente ${targetData.name || docRef.id} desativado com sucesso e credenciais revogadas.`
    });
  } catch (err: any) {
    console.error('[handleDeactivateCustomer] Erro durante desativação de cliente:', err?.message || err);
    return res.status(500).json({
      error: err?.message || 'Erro interno ao desativar conta de cliente.'
    });
  }
}
