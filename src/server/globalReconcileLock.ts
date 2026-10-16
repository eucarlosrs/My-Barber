import { getFirebaseAdmin } from './firebaseAdmin.js';

export interface GlobalReconcileLockData {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  requestId: string;
  ownerId: string;
  acquiredAt: string;
  acquiredAtMs: number;
  expiresAt: string;
  expiresAtMs: number;
  completedAt?: string;
  summary?: {
    totalChecked: number;
    totalReconciled: number;
    totalUnchanged: number;
    totalErrors: number;
    totalInconclusive: number;
  };
}

export type AcquireGlobalLockResult =
  | { success: true; requestId: string; previousLockData: GlobalReconcileLockData | null }
  | { success: false; status: 409 | 503; reason: 'LOCKED' | 'FIRESTORE_UNAVAILABLE'; message: string; currentLock?: GlobalReconcileLockData };

export type ReleaseGlobalLockResult =
  | { success: true }
  | { success: false; status: 403 | 503; reason: 'LOST_OWNERSHIP' | 'FIRESTORE_UNAVAILABLE'; message: string };

const GLOBAL_LOCK_DOC_PATH = 'subscription_reconcile_all';
const GLOBAL_LOCK_DOC_ID = 'global';
const DEFAULT_GLOBAL_TTL_MS = 180000; // 3 minutos de TTL para lote completo

/**
 * Adquire lock distribuído exclusivo no Firestore para reconciliação global de assinaturas.
 * 
 * Regras:
 * - Executado em `firestore.runTransaction`.
 * - Se existir lock com status IN_PROGRESS e expiresAtMs > nowMs: retorna 409 LOCKED.
 * - Se lock estiver expirado: permite takeover seguro registrando novo requestId.
 * - Firestore indisponível: retorna HTTP 503 fail-closed (NUNCA usa RAM).
 */
export async function acquireGlobalReconcileLock(
  ownerId: string,
  options?: { ttlMs?: number; firestoreOverride?: any }
): Promise<AcquireGlobalLockResult> {
  const firestore = options?.firestoreOverride !== undefined ? options.firestoreOverride : getFirebaseAdmin().firestore;
  if (!firestore || typeof firestore.runTransaction !== 'function' || typeof firestore.collection !== 'function') {
    return {
      success: false,
      status: 503,
      reason: 'FIRESTORE_UNAVAILABLE',
      message: 'Banco de dados indisponível para aquisição de lock global.'
    };
  }

  const ttlMs = options?.ttlMs || DEFAULT_GLOBAL_TTL_MS;
  const requestId = 'rec_req_' + (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));
  const nowMs = Date.now();
  const lockDocRef = firestore.collection(GLOBAL_LOCK_DOC_PATH).doc(GLOBAL_LOCK_DOC_ID);

  try {
    const reservation = await firestore.runTransaction(async (transaction: any) => {
      const lockDoc = await transaction.get(lockDocRef);
      let previousLockData: GlobalReconcileLockData | null = null;

      if (lockDoc.exists) {
        previousLockData = lockDoc.data() as GlobalReconcileLockData;
        const isStillValid =
          previousLockData?.status === 'IN_PROGRESS' &&
          ((previousLockData.expiresAtMs && nowMs < previousLockData.expiresAtMs) ||
           (previousLockData.acquiredAtMs && (nowMs - previousLockData.acquiredAtMs) < ttlMs));

        if (isStillValid) {
          return { status: 'LOCKED' as const, currentLock: previousLockData };
        }
      }

      const newLockData: GlobalReconcileLockData = {
        status: 'IN_PROGRESS',
        requestId,
        ownerId: ownerId || 'super_admin',
        acquiredAt: new Date(nowMs).toISOString(),
        acquiredAtMs: nowMs,
        expiresAt: new Date(nowMs + ttlMs).toISOString(),
        expiresAtMs: nowMs + ttlMs
      };

      transaction.set(lockDocRef, newLockData);
      return { status: 'ACQUIRED' as const, requestId, previousLockData };
    });

    if (reservation.status === 'LOCKED') {
      return {
        success: false,
        status: 409,
        reason: 'LOCKED',
        message: 'Reconciliação global já está em andamento por outra chamada/instância.',
        currentLock: reservation.currentLock
      };
    }

    return {
      success: true,
      requestId: reservation.requestId,
      previousLockData: reservation.previousLockData
    };
  } catch (err: any) {
    console.error('[acquireGlobalReconcileLock] Erro ao adquirir lock no Firestore:', err);
    return {
      success: false,
      status: 503,
      reason: 'FIRESTORE_UNAVAILABLE',
      message: 'Falha temporária ao registrar lock de reconciliação global.'
    };
  }
}

/**
 * Libera o lock distribuído global exclusivamente se o requestId for o proprietário atual.
 */
export async function releaseGlobalReconcileLock(
  requestId: string,
  summary?: GlobalReconcileLockData['summary'],
  options?: { status?: 'COMPLETED' | 'FAILED'; firestoreOverride?: any }
): Promise<ReleaseGlobalLockResult> {
  const firestore = options?.firestoreOverride !== undefined ? options.firestoreOverride : getFirebaseAdmin().firestore;
  if (!firestore || typeof firestore.runTransaction !== 'function' || typeof firestore.collection !== 'function') {
    return {
      success: false,
      status: 503,
      reason: 'FIRESTORE_UNAVAILABLE',
      message: 'Banco de dados indisponível para liberação de lock global.'
    };
  }

  const lockDocRef = firestore.collection(GLOBAL_LOCK_DOC_PATH).doc(GLOBAL_LOCK_DOC_ID);
  const finalStatus = options?.status || 'COMPLETED';

  try {
    const res = await firestore.runTransaction(async (transaction: any) => {
      const lockDoc = await transaction.get(lockDocRef);
      if (!lockDoc.exists) {
        return { success: false, reason: 'LOST_OWNERSHIP' as const };
      }

      const data = lockDoc.data() as GlobalReconcileLockData;
      if (data.requestId !== requestId) {
        return { success: false, reason: 'LOST_OWNERSHIP' as const };
      }

      transaction.update(lockDocRef, {
        status: finalStatus,
        completedAt: new Date().toISOString(),
        summary: summary || null
      });

      return { success: true };
    });

    if (!res.success) {
      return {
        success: false,
        status: 403,
        reason: 'LOST_OWNERSHIP',
        message: 'Posse do lock expirou ou foi assumida por outra requisição antes do término.'
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[releaseGlobalReconcileLock] Erro ao liberar lock global:', err);
    return {
      success: false,
      status: 503,
      reason: 'FIRESTORE_UNAVAILABLE',
      message: 'Falha ao atualizar documento de lock global.'
    };
  }
}
