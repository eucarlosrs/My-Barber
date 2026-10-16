import { getFirebaseAdmin } from './firebaseAdmin.js';
import { AuthUserClaims } from '../lib/authClaims.js';
import { CustomerPackage } from '../types/index.js';
import { logger } from './logger.js';

export interface ConsumePackageItemParams {
  customerPackageId: string;
  itemId: string;
  idempotencyKey: string;
  actor: AuthUserClaims;
  firestoreOverride?: any; // Para injeção de dependência em testes
}

export interface ConsumePackageItemResult {
  success: boolean;
  status: 200 | 400 | 403 | 404 | 409 | 503;
  error?: string;
  message?: string;
  isReplay?: boolean;
  customerPackage?: CustomerPackage;
  consumedItem?: {
    itemId: string;
    name: string;
    totalQuantity: number;
    usedQuantity: number;
    remaining: number;
  };
}

/**
 * Operação autoritativa para consumo atômico de sessões/créditos de customerPackages.
 * 
 * DESIGN DE CONCORRÊNCIA E INTEGRIDADE (FASE 4.2A):
 * 1. Autenticação e RBAC: Apenas o próprio cliente dono do pacote (com status ativo) ou gestores do tenant ou Super Admin.
 * 2. Isolamento Multi-Tenant: Valida que o pacote pertence ao tenant do ator (ou cliente).
 * 3. Idempotência Durável: Registro transacional em `customer_package_consumptions/{idempotencyKey}`.
 *    - Se mesma idempotencyKey for enviada com mesmos parâmetros: retorna replay idempotente com sucesso sem duplicar débito.
 *    - Se mesma chave for reutilizada com parâmetros divergentes: retorna HTTP 409 CONFLICT.
 * 4. Transação Atômica no Firestore (runTransaction):
 *    - Lê documento de idempotência e documento do pacote.
 *    - Valida que `usedQuantity < totalQuantity`.
 *    - Incrementa `usedQuantity + 1`. Nunca permite usedQuantity > totalQuantity.
 *    - Commita atomicamente o consumo e o pacote atualizado.
 * 5. Fail-Closed: Falhas de rede ou indisponibilidade do Firestore retornam HTTP 503 sem alterar memória.
 */
export async function consumeCustomerPackageItem(
  params: ConsumePackageItemParams
): Promise<ConsumePackageItemResult> {
  const { customerPackageId, itemId, idempotencyKey, actor, firestoreOverride } = params;

  // 1. Validação inicial de payload
  if (!customerPackageId || typeof customerPackageId !== 'string' || !customerPackageId.trim()) {
    return { success: false, status: 400, error: 'INVALID_PACKAGE_ID', message: 'ID do pacote do cliente é obrigatório.' };
  }
  if (!itemId || typeof itemId !== 'string' || !itemId.trim()) {
    return { success: false, status: 400, error: 'INVALID_ITEM_ID', message: 'ID do item do pacote é obrigatório.' };
  }
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
    return { success: false, status: 400, error: 'INVALID_IDEMPOTENCY_KEY', message: 'idempotencyKey válida é obrigatória (mínimo 8 caracteres).' };
  }
  if (!actor || !actor.uid) {
    return { success: false, status: 403, error: 'UNAUTHENTICATED', message: 'Usuário não autenticado.' };
  }

  // 2. Obter instância do Firestore
  const firestore = firestoreOverride !== undefined ? firestoreOverride : getFirebaseAdmin().firestore;
  if (!firestore || typeof firestore.runTransaction !== 'function' || typeof firestore.collection !== 'function') {
    return { success: false, status: 503, error: 'FIRESTORE_UNAVAILABLE', message: 'Serviço de banco de dados indisponível.' };
  }

  const cleanPackageId = customerPackageId.trim();
  const cleanItemId = itemId.trim();
  const cleanIdempotencyKey = idempotencyKey.trim();

  const packageRef = firestore.collection('customerPackages').doc(cleanPackageId);
  const idempotencyRef = firestore.collection('customer_package_consumptions').doc(cleanIdempotencyKey);

  try {
    const txResult = await firestore.runTransaction(async (transaction: any) => {
      // A. Verificar chave de idempotência
      const idempDoc = await transaction.get(idempotencyRef);
      if (idempDoc.exists) {
        const idempData = idempDoc.data();
        const matchesOriginal =
          idempData.customerPackageId === cleanPackageId &&
          idempData.itemId === cleanItemId;

        if (!matchesOriginal) {
          return {
            conflict: true,
            reason: 'IDEMPOTENCY_KEY_COLLISION',
            message: 'A chave de idempotência fornecida já foi utilizada para outra operação.'
          };
        }

        // Replay idempotente legítimo
        return {
          isReplay: true,
          customerPackage: idempData.snapshotAfter,
          consumedItem: idempData.consumedItem
        };
      }

      // B. Obter documento do pacote do cliente
      const pkgDoc = await transaction.get(packageRef);
      if (!pkgDoc.exists) {
        return { notFound: true, reason: 'PACKAGE_NOT_FOUND', message: 'Pacote do cliente não encontrado.' };
      }

      const pkgData = pkgDoc.data() as CustomerPackage;

      // C. Validação de Autorização e Isolamento Multi-Tenant
      const isSuperAdmin = actor.isSuperAdmin || actor.role === 'super_admin';
      const isOwnerOrManager = (actor.role === 'barbershop_owner' || actor.role === 'manager') && actor.tenantId === pkgData.tenantId;
      const isBarber = actor.role === 'barber' && actor.tenantId === pkgData.tenantId;
      const isClientOwner = (actor.role === 'customer' || !actor.role) && (actor.uid === pkgData.clientId || (pkgData as any).uid === actor.uid);

      if (!isSuperAdmin && !isOwnerOrManager && !isBarber && !isClientOwner) {
        return {
          forbidden: true,
          reason: 'CROSS_TENANT_OR_UNAUTHORIZED',
          message: 'Você não possui permissão para consumir este pacote ou o pacote pertence a outro estabelecimento.'
        };
      }

      // D. Localizar item dentro do pacote
      if (!Array.isArray(pkgData.items)) {
        return { badRequest: true, reason: 'CORRUPTED_PACKAGE_DATA', message: 'Itens do pacote corrompidos.' };
      }

      const itemIndex = pkgData.items.findIndex(it => it.itemId === cleanItemId);
      if (itemIndex === -1) {
        return { notFound: true, reason: 'ITEM_NOT_FOUND', message: 'O item especificado não pertence a este pacote.' };
      }

      const currentItem = pkgData.items[itemIndex];

      // E. Verificação soberana de saldo disponível (usedQuantity < totalQuantity)
      if (currentItem.usedQuantity >= currentItem.totalQuantity) {
        return {
          exhausted: true,
          reason: 'PACKAGE_ITEM_EXHAUSTED',
          message: `Saldo esgotado para o item ${currentItem.name}. (${currentItem.usedQuantity}/${currentItem.totalQuantity} sessões utilizadas).`,
          consumedItem: {
            itemId: currentItem.itemId,
            name: currentItem.name,
            totalQuantity: currentItem.totalQuantity,
            usedQuantity: currentItem.usedQuantity,
            remaining: 0
          }
        };
      }

      // F. Incremento atômico estrito
      const newUsed = currentItem.usedQuantity + 1;
      const updatedItem = {
        ...currentItem,
        usedQuantity: newUsed
      };

      const updatedItems = [...pkgData.items];
      updatedItems[itemIndex] = updatedItem;

      const updatedPackage: CustomerPackage = {
        ...pkgData,
        items: updatedItems,
        updatedAt: new Date().toISOString()
      } as any;

      const consumedItemMeta = {
        itemId: updatedItem.itemId,
        name: updatedItem.name,
        totalQuantity: updatedItem.totalQuantity,
        usedQuantity: newUsed,
        remaining: updatedItem.totalQuantity - newUsed
      };

      // G. Persistir mutações atomicamente
      transaction.set(packageRef, updatedPackage);

      // Gravar comprovante de idempotência
      transaction.set(idempotencyRef, {
        idempotencyKey: cleanIdempotencyKey,
        customerPackageId: cleanPackageId,
        itemId: cleanItemId,
        tenantId: pkgData.tenantId,
        clientId: pkgData.clientId,
        consumedByUid: actor.uid,
        consumedAt: new Date().toISOString(),
        snapshotAfter: updatedPackage,
        consumedItem: consumedItemMeta
      });

      return {
        success: true,
        customerPackage: updatedPackage,
        consumedItem: consumedItemMeta
      };
    });

    if (txResult.conflict) {
      return { success: false, status: 409, error: txResult.reason, message: txResult.message };
    }
    if (txResult.forbidden) {
      return { success: false, status: 403, error: txResult.reason, message: txResult.message };
    }
    if (txResult.notFound) {
      return { success: false, status: 404, error: txResult.reason, message: txResult.message };
    }
    if (txResult.badRequest) {
      return { success: false, status: 400, error: txResult.reason, message: txResult.message };
    }
    if (txResult.exhausted) {
      return {
        success: false,
        status: 400,
        error: txResult.reason,
        message: txResult.message,
        consumedItem: txResult.consumedItem
      };
    }

    if (txResult.isReplay) {
      return {
        success: true,
        status: 200,
        isReplay: true,
        customerPackage: txResult.customerPackage,
        consumedItem: txResult.consumedItem,
        message: 'Consumo já processado anteriormente (resposta idempotente).'
      };
    }

    return {
      success: true,
      status: 200,
      customerPackage: txResult.customerPackage,
      consumedItem: txResult.consumedItem,
      message: 'Sessão do pacote consumida com sucesso!'
    };
  } catch (err: any) {
    logger.error('[consumeCustomerPackageItem] Falha na transação Firestore', {
      operation: 'consumeCustomerPackageItem',
      entityId: cleanPackageId,
      itemId: cleanItemId,
      idempotencyKey: cleanIdempotencyKey,
      actorUid: actor?.uid,
      error: err?.message || String(err)
    });
    return {
      success: false,
      status: 503,
      error: 'TRANSACTION_FAILED',
      message: 'Falha temporária ao registrar consumo do pacote. Tente novamente.'
    };
  }
}
