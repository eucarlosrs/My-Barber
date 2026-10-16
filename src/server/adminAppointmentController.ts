import { Request, Response } from 'express';
import { verifyFirebaseIdToken } from './firebaseAdmin.js';
import { verifyAppCheckHeader } from './appCheckVerifier.js';
import { extractBearerToken, decodedToUserClaims } from './authMiddleware.js';
import {
  validateReschedulePayload,
  validateCancelPayload,
  executeAuthoritativeReschedule,
  executeAuthoritativeCancel,
  AdminActorContext
} from './adminAppointmentService.js';
import { toCanonicalRole } from '../lib/authClaims.js';

const MAX_PAYLOAD_BYTES = 16 * 1024; // 16 KB

/**
 * Controller oficial para POST /api/appointments/reschedule
 */
export async function handleRescheduleAppointment(req: Request, res: Response): Promise<void> {
  // 1. Verificação de Tamanho de Payload
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    res.status(413).json({
      success: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'O corpo da requisição excede o limite permitido de 16KB.'
    });
    return;
  }

  // 2. Verificação de Integridade App Check (Fail-Closed em Produção)
  const appCheckHeader = req.headers['x-firebase-appcheck'];
  const appCheckResult = await verifyAppCheckHeader(appCheckHeader);
  if (!appCheckResult.valid) {
    res.status(401).json({
      success: false,
      error: appCheckResult.error || 'APPCHECK_FAILED',
      message: appCheckResult.message || 'Falha na verificação de integridade App Check.'
    });
    return;
  }

  // 3. Autenticação Obrigatória via Firebase ID Token
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHENTICATED',
      message: 'Autenticação necessária. Cabeçalho Authorization ausente ou inválido.'
    });
    return;
  }

  const decodedToken = await verifyFirebaseIdToken(token);
  if (!decodedToken) {
    res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Token de autenticação inválido ou expirado.'
    });
    return;
  }

  const userClaims = decodedToUserClaims(decodedToken);
  const canonicalRole = toCanonicalRole(userClaims.role);

  const actorContext: AdminActorContext = {
    uid: userClaims.uid,
    role: canonicalRole,
    tenantId: userClaims.tenantId,
    isSuperAdmin: userClaims.isSuperAdmin
  };

  // 4. Validação e Sanitização do Payload
  const validation = validateReschedulePayload(req.body);
  if (!validation.valid || !validation.sanitized) {
    res.status(400).json({
      success: false,
      error: validation.error || 'INVALID_PAYLOAD',
      message: validation.message || 'Parâmetros de remarcação inválidos.'
    });
    return;
  }

  // 5. Execução do Serviço Autoritativo
  try {
    const result = await executeAuthoritativeReschedule({
      payload: validation.sanitized,
      actor: actorContext
    });

    if (result.status === 200 && result.appointment) {
      res.status(200).json({
        success: true,
        isReplay: result.isReplay || false,
        appointment: result.appointment
      });
      return;
    }

    res.status(result.status).json({
      success: false,
      error: result.error || 'RESCHEDULE_FAILED',
      message: result.message || 'Falha ao processar remarcação.'
    });
  } catch (err: any) {
    console.error('[API /api/appointments/reschedule] Erro inesperado:', err);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Ocorreu um erro interno inesperado ao processar a remarcação.'
    });
  }
}

/**
 * Controller oficial para POST /api/appointments/cancel
 */
export async function handleCancelAppointment(req: Request, res: Response): Promise<void> {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    res.status(413).json({
      success: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'O corpo da requisição excede o limite permitido de 16KB.'
    });
    return;
  }

  const appCheckHeader = req.headers['x-firebase-appcheck'];
  const appCheckResult = await verifyAppCheckHeader(appCheckHeader);
  if (!appCheckResult.valid) {
    res.status(401).json({
      success: false,
      error: appCheckResult.error || 'APPCHECK_FAILED',
      message: appCheckResult.message || 'Falha na verificação de integridade App Check.'
    });
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHENTICATED',
      message: 'Autenticação necessária. Cabeçalho Authorization ausente ou inválido.'
    });
    return;
  }

  const decodedToken = await verifyFirebaseIdToken(token);
  if (!decodedToken) {
    res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Token de autenticação inválido ou expirado.'
    });
    return;
  }

  const userClaims = decodedToUserClaims(decodedToken);
  const canonicalRole = toCanonicalRole(userClaims.role);

  const actorContext: AdminActorContext = {
    uid: userClaims.uid,
    role: canonicalRole,
    tenantId: userClaims.tenantId,
    isSuperAdmin: userClaims.isSuperAdmin
  };

  const validation = validateCancelPayload(req.body);
  if (!validation.valid || !validation.sanitized) {
    res.status(400).json({
      success: false,
      error: validation.error || 'INVALID_PAYLOAD',
      message: validation.message || 'Parâmetros de cancelamento inválidos.'
    });
    return;
  }

  try {
    const result = await executeAuthoritativeCancel({
      payload: validation.sanitized,
      actor: actorContext
    });

    if (result.status === 200 && result.appointment) {
      res.status(200).json({
        success: true,
        isReplay: result.isReplay || false,
        appointment: result.appointment
      });
      return;
    }

    res.status(result.status).json({
      success: false,
      error: result.error || 'CANCEL_FAILED',
      message: result.message || 'Falha ao processar cancelamento.'
    });
  } catch (err: any) {
    console.error('[API /api/appointments/cancel] Erro inesperado:', err);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Ocorreu um erro interno inesperado ao processar o cancelamento.'
    });
  }
}
