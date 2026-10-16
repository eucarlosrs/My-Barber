import crypto from 'node:crypto';

/**
 * MY BARBER — DISTRIBUTED CREATION LOCK (FIRESTORE ATOMIC TRANSACTION)
 * FASE 3.3E: Resolução do P2 Residual (Concorrência Distribuída Multi-Instância)
 * 
 * Regras e Invariantes:
 * 1. Exclusão Mútua Soberana: Toda aquisição ocorre via `firestore.runTransaction()`.
 * 2. Identificação de Posse (Owner Token): Cada tentativa gera um `requestId` criptográfico único (UUID).
 * 3. TTL Explícito: O lock armazena `createdAtMs` e `expiresAtMs`.
 * 4. Lock Expirado: Processos secundários podem assumir lock expirado via OCC, mas preservam o contexto
 *    anterior (mpSubscriptionId) para forçar o RECOVERY CHECK antes de qualquer CREATE.
 * 5. POST /preapproval estritamente FORA da transação: Nenhuma chamada externa é executada dentro de runTransaction.
 * 6. Finalização Condicional: Apenas a requisição dona do `requestId` ativo pode transicionar o lock para
 *    COMPLETED, FAILED ou FIRESTORE_WRITE_FAILED.
 * 7. Fail-Closed: Falha de conexão ao Firestore rejeita a criação (nunca há fallback para memória local).
 */

export type DistributedLockStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'AMBIGUOUS_BLOCKED'
  | 'FIRESTORE_WRITE_FAILED';

export interface DistributedLockData {
  requestId: string;
  status: DistributedLockStatus;
  barbershopId: string;
  payerEmail: string;
  planId: string;
  createdAt: string;
  createdAtMs: number;
  expiresAt: string;
  expiresAtMs: number;
  completedAt?: string;
  failedAt?: string;
  blockedAt?: string;
  mpSubscriptionId?: string;
  candidatesCount?: number;
  error?: string;
  recovered?: boolean;
}

export interface AcquireLockOptions {
  ttlMs?: number; // Padrão: 90000 (90 segundos)
}

export type AcquireLockResult =
  | { success: true; requestId: string; previousLockData: DistributedLockData | null }
  | { success: false; reason: 'ALREADY_IN_PROGRESS'; currentLock: DistributedLockData }
  | { success: false; reason: 'ALREADY_ACTIVE_SUBSCRIPTION'; subscription: any }
  | { success: false; reason: 'FIRESTORE_UNAVAILABLE'; error: string };

export type TransitionLockResult =
  | { success: true }
  | { success: false; reason: 'LOST_OWNERSHIP' | 'LOCK_NOT_FOUND' | 'FIRESTORE_ERROR'; error?: string };

const DEFAULT_TTL_MS = 90000; // 90 segundos

/**
 * Adquire o lock distribuído para criação de assinatura usando transação atômica no Firestore.
 */
export async function acquireDistributedCreationLock(
  firestore: any,
  barbershopId: string,
  payerEmail: string,
  planId: string,
  options: AcquireLockOptions = {}
): Promise<AcquireLockResult> {
  if (!firestore || typeof firestore.runTransaction !== 'function' || typeof firestore.collection !== 'function') {
    return {
      success: false,
      reason: 'FIRESTORE_UNAVAILABLE',
      error: 'Instância do Firestore Admin SDK indisponível ou inválida'
    };
  }

  try {
    const subDocRef = firestore.collection('subscriptions').doc(`sub-${barbershopId}`);
    const lockDocRef = firestore.collection('subscription_creations').doc(`create-${barbershopId}`);
    const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    const requestId = 'req_' + crypto.randomUUID();

    const reservation = await firestore.runTransaction(async (transaction: any) => {
      // 1. Verificar se já existe assinatura ativa / pendente persistida
      const existingSubDoc = await transaction.get(subDocRef);
      if (existingSubDoc.exists) {
        const subData = existingSubDoc.data();
        if (subData && (subData.status === 'ACTIVE' || subData.status === 'PENDING' || subData.status === 'TRIAL_14_DAYS')) {
          return { status: 'ALREADY_ACTIVE' as const, subscription: subData };
        }
      }

      // 2. Verificar lock documental de criação
      const lockDoc = await transaction.get(lockDocRef);
      const nowMs = Date.now();
      let previousLockData: DistributedLockData | null = null;

      if (lockDoc.exists) {
        previousLockData = lockDoc.data() as DistributedLockData;
        const isStillValid = previousLockData?.status === 'IN_PROGRESS' &&
          ((previousLockData.expiresAtMs && nowMs < previousLockData.expiresAtMs) ||
           (previousLockData.createdAtMs && (nowMs - previousLockData.createdAtMs) < ttlMs));

        if (isStillValid) {
          return { status: 'LOCKED' as const, currentLock: previousLockData };
        }
      }

      // 3. Gravação atômica do novo lock com posse do requestId
      const newLockData: DistributedLockData = {
        requestId,
        status: 'IN_PROGRESS',
        barbershopId,
        payerEmail,
        planId,
        createdAt: new Date(nowMs).toISOString(),
        createdAtMs: nowMs,
        expiresAt: new Date(nowMs + ttlMs).toISOString(),
        expiresAtMs: nowMs + ttlMs,
        // Preserva o mpSubscriptionId da tentativa anterior para viabilizar recovery caso tenha havido crash/timeout
        mpSubscriptionId: previousLockData?.mpSubscriptionId
      };

      transaction.set(lockDocRef, newLockData);

      return { status: 'ACQUIRED' as const, requestId, previousLockData };
    });

    if (reservation.status === 'ALREADY_ACTIVE') {
      return {
        success: false,
        reason: 'ALREADY_ACTIVE_SUBSCRIPTION',
        subscription: reservation.subscription
      };
    }

    if (reservation.status === 'LOCKED') {
      return {
        success: false,
        reason: 'ALREADY_IN_PROGRESS',
        currentLock: reservation.currentLock
      };
    }

    return {
      success: true,
      requestId: reservation.requestId,
      previousLockData: reservation.previousLockData
    };
  } catch (err: any) {
    return {
      success: false,
      reason: 'FIRESTORE_UNAVAILABLE',
      error: err?.message || 'Falha ao executar runTransaction no Firestore'
    };
  }
}

/**
 * Conclui o lock distribuído para COMPLETED de forma condicional:
 * Apenas o requestId proprietário pode finalizar o lock.
 */
export async function completeDistributedCreationLock(
  firestore: any,
  barbershopId: string,
  requestId: string,
  completionData: {
    mpSubscriptionId: string;
    recovered: boolean;
  }
): Promise<TransitionLockResult> {
  if (!firestore || typeof firestore.runTransaction !== 'function') {
    return { success: false, reason: 'FIRESTORE_ERROR', error: 'Firestore indisponível' };
  }

  const lockDocRef = firestore.collection('subscription_creations').doc(`create-${barbershopId}`);

  try {
    return await firestore.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(lockDocRef);
      if (!doc.exists) {
        return { success: false, reason: 'LOCK_NOT_FOUND' as const };
      }
      const data = doc.data() as DistributedLockData;
      if (data.requestId !== requestId) {
        return { success: false, reason: 'LOST_OWNERSHIP' as const };
      }

      transaction.set(lockDocRef, {
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        mpSubscriptionId: completionData.mpSubscriptionId,
        recovered: completionData.recovered
      }, { merge: true });

      return { success: true as const };
    });
  } catch (err: any) {
    return { success: false, reason: 'FIRESTORE_ERROR', error: err?.message };
  }
}

/**
 * Transiciona o lock distribuído para FAILED de forma condicional.
 */
export async function failDistributedCreationLock(
  firestore: any,
  barbershopId: string,
  requestId: string,
  errorReason: string,
  mpSubscriptionId?: string
): Promise<TransitionLockResult> {
  if (!firestore || typeof firestore.runTransaction !== 'function') {
    return { success: false, reason: 'FIRESTORE_ERROR', error: 'Firestore indisponível' };
  }

  const lockDocRef = firestore.collection('subscription_creations').doc(`create-${barbershopId}`);

  try {
    return await firestore.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(lockDocRef);
      if (!doc.exists) return { success: false, reason: 'LOCK_NOT_FOUND' as const };
      const data = doc.data() as DistributedLockData;
      if (data.requestId !== requestId) return { success: false, reason: 'LOST_OWNERSHIP' as const };

      transaction.set(lockDocRef, {
        status: 'FAILED',
        error: errorReason,
        failedAt: new Date().toISOString(),
        ...(mpSubscriptionId ? { mpSubscriptionId } : {})
      }, { merge: true });

      return { success: true as const };
    });
  } catch (err: any) {
    return { success: false, reason: 'FIRESTORE_ERROR', error: err?.message };
  }
}

/**
 * Registra falha de escrita no Firestore pós-criação no Mercado Pago.
 * Preserva o mpSubscriptionId para permitir que a próxima tentativa ou reconciliação recupere o contrato.
 */
export async function recordFirestoreWriteFailureLock(
  firestore: any,
  barbershopId: string,
  requestId: string,
  errorReason: string,
  mpSubscriptionId: string,
  recovered: boolean
): Promise<TransitionLockResult> {
  if (!firestore || typeof firestore.runTransaction !== 'function') {
    return { success: false, reason: 'FIRESTORE_ERROR', error: 'Firestore indisponível' };
  }

  const lockDocRef = firestore.collection('subscription_creations').doc(`create-${barbershopId}`);

  try {
    return await firestore.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(lockDocRef);
      if (!doc.exists) return { success: false, reason: 'LOCK_NOT_FOUND' as const };
      const data = doc.data() as DistributedLockData;
      if (data.requestId !== requestId) return { success: false, reason: 'LOST_OWNERSHIP' as const };

      transaction.set(lockDocRef, {
        status: 'FIRESTORE_WRITE_FAILED',
        error: errorReason,
        mpSubscriptionId,
        recovered,
        failedAt: new Date().toISOString()
      }, { merge: true });

      return { success: true as const };
    });
  } catch (err: any) {
    return { success: false, reason: 'FIRESTORE_ERROR', error: err?.message };
  }
}

/**
 * Registra bloqueio por ambiguidade no lock.
 */
export async function blockAmbiguousDistributedCreationLock(
  firestore: any,
  barbershopId: string,
  requestId: string,
  reason: string,
  candidatesCount: number
): Promise<TransitionLockResult> {
  if (!firestore || typeof firestore.runTransaction !== 'function') {
    return { success: false, reason: 'FIRESTORE_ERROR', error: 'Firestore indisponível' };
  }

  const lockDocRef = firestore.collection('subscription_creations').doc(`create-${barbershopId}`);

  try {
    return await firestore.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(lockDocRef);
      if (!doc.exists) return { success: false, reason: 'LOCK_NOT_FOUND' as const };
      const data = doc.data() as DistributedLockData;
      if (data.requestId !== requestId) return { success: false, reason: 'LOST_OWNERSHIP' as const };

      transaction.set(lockDocRef, {
        status: 'AMBIGUOUS_BLOCKED',
        error: reason,
        candidatesCount,
        blockedAt: new Date().toISOString()
      }, { merge: true });

      return { success: true as const };
    });
  } catch (err: any) {
    return { success: false, reason: 'FIRESTORE_ERROR', error: err?.message };
  }
}
