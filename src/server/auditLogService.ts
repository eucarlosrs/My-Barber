import { getFirebaseAdmin } from './firebaseAdmin.js';
import { logger, sanitizeLogData } from './logger.js';

export interface AuditLogEntry {
  actorUid: string;
  actorRole: string;
  tenantId?: string;
  action: string;
  targetType: string;
  targetId: string;
  previousState?: any;
  newState?: any;
  details?: string;
  timestamp?: string;
  requestId?: string;
  firestoreOverride?: any;
  [key: string]: any;
}

/**
 * Registra um log de auditoria oficial e imutável na coleção `audit_logs` do Firestore.
 * Execução exclusiva via Backend / Firebase Admin SDK (escrita client-side é negada por Rules).
 * Segredos, tokens e credenciais são filtrados compulsoriamente via sanitizeLogData.
 */
export async function recordAuditLog(entry: AuditLogEntry): Promise<{ success: boolean; logId?: string; error?: string }> {
  try {
    const firestore = entry.firestoreOverride !== undefined ? entry.firestoreOverride : getFirebaseAdmin().firestore;
    if (!firestore || typeof firestore.collection !== 'function') {
      logger.warn('[recordAuditLog] Firestore indisponível para gravação de auditoria');
      return { success: false, error: 'FIRESTORE_UNAVAILABLE' };
    }

    const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const auditRef = firestore.collection('audit_logs').doc(logId);

    const safePreviousState = entry.previousState ? sanitizeLogData(entry.previousState) : null;
    const safeNewState = entry.newState ? sanitizeLogData(entry.newState) : null;

    const auditDocument = {
      id: logId,
      actorUid: entry.actorUid || 'system',
      actorRole: entry.actorRole || 'system',
      tenantId: entry.tenantId || null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      previousState: safePreviousState,
      newState: safeNewState,
      details: entry.details || null,
      requestId: entry.requestId || null,
      timestamp: entry.timestamp || new Date().toISOString()
    };

    await auditRef.set(auditDocument);

    logger.info('[AuditLog] Ação administrativa auditada com sucesso', {
      requestId: entry.requestId,
      action: entry.action,
      actorUid: entry.actorUid,
      tenantId: entry.tenantId,
      targetId: entry.targetId
    });

    return { success: true, logId };
  } catch (err: any) {
    logger.error('[recordAuditLog] Falha ao persistir audit_log no Firestore', {
      requestId: entry.requestId,
      action: entry.action,
      error: err?.message || String(err)
    });
    return { success: false, error: err?.message || 'Erro ao persistir log de auditoria' };
  }
}
