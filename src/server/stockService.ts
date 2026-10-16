import { getFirebaseAdmin } from './firebaseAdmin.js';
import { AuthUserClaims } from '../lib/authClaims.js';
import { logger } from './logger.js';

export interface AdjustStockParams {
  stockItemId: string;
  delta: number;
  idempotencyKey?: string;
  actor: AuthUserClaims;
  requestId?: string;
  firestoreOverride?: any;
}

export interface StockMovementRecord {
  id: string;
  tenantId: string;
  stockItemId: string;
  delta: number;
  previousQuantity: number;
  newQuantity: number;
  actorUid: string;
  actorRole: string;
  timestamp: string;
  idempotencyKey?: string;
  requestId?: string;
}

export interface AdjustStockResult {
  success: boolean;
  status: number;
  isReplay?: boolean;
  stockItem?: any;
  movement?: StockMovementRecord;
  error?: string;
  message: string;
}

/**
 * Ajuste autoritativo e atômico de estoque via Firestore runTransaction.
 * - Valida se o usuário tem permissão sobre o tenant (SuperAdmin, BarbershopOwner ou Manager).
 * - Impede quantidade final negativa (quantity + delta < 0).
 * - Registra atomicamente o movimento em `stock_movements`.
 * - Garante idempotência durável via `stock_adjustments/{idempotencyKey}`.
 */
export async function adjustStockAuthoritative(params: AdjustStockParams): Promise<AdjustStockResult> {
  const { stockItemId, delta, idempotencyKey, actor, requestId, firestoreOverride } = params;

  if (!stockItemId || typeof stockItemId !== 'string') {
    return { success: false, status: 400, error: 'INVALID_STOCK_ID', message: 'ID do item de estoque é obrigatório.' };
  }

  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
    return { success: false, status: 400, error: 'INVALID_DELTA', message: 'O valor de delta deve ser um número inteiro diferente de zero.' };
  }

  const firestore = firestoreOverride !== undefined ? firestoreOverride : getFirebaseAdmin().firestore;
  if (!firestore || typeof firestore.runTransaction !== 'function') {
    logger.warn('[adjustStockAuthoritative] Firestore indisponível');
    return { success: false, status: 503, error: 'FIRESTORE_UNAVAILABLE', message: 'Serviço de estoque temporariamente indisponível.' };
  }

  const cleanItemId = stockItemId.trim();
  const cleanIdempKey = idempotencyKey ? idempotencyKey.trim() : null;

  try {
    const result = await firestore.runTransaction(async (transaction) => {
      // 1. Leitura do item de estoque real no Firestore para obter autoridade de tenant
      const stockRef = firestore.collection('stock').doc(cleanItemId);
      const stockDoc = await transaction.get(stockRef);

      if (!stockDoc.exists) {
        return {
          notFound: true,
          status: 404,
          error: 'STOCK_ITEM_NOT_FOUND',
          message: 'Item de estoque não encontrado.'
        };
      }

      const currentStock = stockDoc.data() as any;
      const tenantId = currentStock.tenantId;

      // 2. Validação de isolamento Multi-Tenant com base no documento oficial
      const isSuperAdmin = actor.isSuperAdmin || actor.role === 'super_admin';
      const isTenantManager = (actor.role === 'barbershop_owner' || actor.role === 'manager') && actor.tenantId === tenantId;

      if (!isSuperAdmin && !isTenantManager) {
        return {
          forbidden: true,
          status: 403,
          error: 'CROSS_TENANT_OR_UNAUTHORIZED',
          message: 'Você não tem permissão para ajustar o estoque desta barbearia.'
        };
      }

      // 3. Verificação de idempotência isolada por tenant (FASE 4.4D)
      let idempRef: any = null;
      let effectiveIdempKey: string | null = null;

      if (cleanIdempKey) {
        effectiveIdempKey = `${tenantId}_${cleanIdempKey}`;
        idempRef = firestore.collection('stock_adjustments').doc(effectiveIdempKey);
        let idempDoc = await transaction.get(idempRef);

        // Compatibilidade reversa: se não encontrar com prefixo de tenant, verifica chave legada
        if (!idempDoc.exists) {
          const legacyRef = firestore.collection('stock_adjustments').doc(cleanIdempKey);
          const legacyDoc = await transaction.get(legacyRef);
          if (legacyDoc.exists && legacyDoc.data()?.tenantId === tenantId) {
            idempDoc = legacyDoc;
          }
        }

        if (idempDoc.exists) {
          const idempData = idempDoc.data();
          const matches = idempData?.stockItemId === cleanItemId && idempData?.delta === delta;
          if (!matches) {
            return {
              isCollision: true,
              status: 409,
              error: 'IDEMPOTENCY_KEY_COLLISION',
              message: 'Chave de idempotência já utilizada com parâmetros diferentes.'
            };
          }
          return {
            isReplay: true,
            status: 200,
            stockItem: idempData.snapshotAfter,
            movement: idempData.movement
          };
        }
      }

      // 4. Validação de saldo (impede estoque negativo)
      const currentQty = typeof currentStock.quantity === 'number' ? currentStock.quantity : 0;
      const newQty = currentQty + delta;

      if (newQty < 0) {
        return {
          insufficientStock: true,
          status: 400,
          error: 'INSUFFICIENT_STOCK',
          message: `Saldo insuficiente em estoque. Disponível: ${currentQty}, solicitado: ${Math.abs(delta)}.`
        };
      }

      // 5. Prepara documento de movimentação
      const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const movementRef = firestore.collection('stock_movements').doc(movementId);

      const movementData: StockMovementRecord = {
        id: movementId,
        tenantId,
        stockItemId: cleanItemId,
        delta,
        previousQuantity: currentQty,
        newQuantity: newQty,
        actorUid: actor.uid,
        actorRole: actor.role || 'user',
        timestamp: new Date().toISOString(),
        ...(cleanIdempKey ? { idempotencyKey: cleanIdempKey } : {}),
        ...(requestId ? { requestId } : {})
      };

      const updatedStock = {
        ...currentStock,
        quantity: newQty,
        updatedAt: new Date().toISOString()
      };

      // 6. Mutações atômicas
      transaction.set(stockRef, updatedStock, { merge: true });
      transaction.set(movementRef, movementData);

      if (idempRef && effectiveIdempKey) {
        transaction.set(idempRef, {
          idempotencyKey: cleanIdempKey,
          tenantScopedKey: effectiveIdempKey,
          stockItemId: cleanItemId,
          delta,
          tenantId,
          actorUid: actor.uid,
          movement: movementData,
          snapshotAfter: updatedStock,
          createdAt: new Date().toISOString()
        });
      }

      return {
        success: true,
        status: 200,
        stockItem: updatedStock,
        movement: movementData
      };
    });

    if ((result as any).isCollision) {
      return { success: false, status: 409, error: (result as any).error, message: (result as any).message };
    }
    if ((result as any).notFound) {
      return { success: false, status: 404, error: (result as any).error, message: (result as any).message };
    }
    if ((result as any).forbidden) {
      return { success: false, status: 403, error: (result as any).error, message: (result as any).message };
    }
    if ((result as any).insufficientStock) {
      return { success: false, status: 400, error: (result as any).error, message: (result as any).message };
    }

    if ((result as any).isReplay) {
      return {
        success: true,
        status: 200,
        isReplay: true,
        stockItem: (result as any).stockItem,
        movement: (result as any).movement,
        message: 'Ajuste de estoque já processado anteriormente (resposta idempotente).'
      };
    }

    logger.info('[adjustStockAuthoritative] Estoque ajustado com sucesso', {
      requestId,
      stockItemId: cleanItemId,
      delta,
      actorUid: actor.uid,
      tenantId: (result as any).stockItem?.tenantId
    });

    return {
      success: true,
      status: 200,
      stockItem: (result as any).stockItem,
      movement: (result as any).movement,
      message: 'Estoque atualizado com sucesso!'
    };
  } catch (err: any) {
    logger.error('[adjustStockAuthoritative] Falha na transação do Firestore', {
      requestId,
      stockItemId: cleanItemId,
      delta,
      actorUid: actor?.uid,
      error: err?.message || String(err)
    });
    return {
      success: false,
      status: 503,
      error: 'TRANSACTION_FAILED',
      message: 'Falha temporária ao registrar ajuste de estoque. Tente novamente.'
    };
  }
}
