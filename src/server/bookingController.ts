import { Request, Response } from 'express';
import {
  validateBookingPayload,
  executeAuthoritativeBooking
} from './bookingService.js';
import { verifyAppCheckHeader } from './appCheckVerifier.js';
import { ipBookingRateLimiter } from './rateLimiter.js';
import { assertTenantSubscriptionActive } from './subscriptionEnforcement.js';

/**
 * Controller oficial para POST /api/appointments/book
 * 
 * Contrato:
 * - Limite de tamanho: 16KB
 * - App Check verificado server-side (Fail-Closed em produção)
 * - Rate limit por IP (15 requisições por 15 minutos)
 * - Recálculo autoritativo de preço e duração
 * - Validação de expediente e fuso da barbearia
 * - Transação atômica em day_locks + idempotency + appointments + publicAvailability
 */
export async function handleBookAppointment(req: Request, res: Response): Promise<Response> {
  try {
    // 1. Limite estrito de tamanho de payload (16KB)
    const rawBodyBuf = (req as any).rawBody as Buffer | undefined;
    const contentLength = req.headers['content-length']
      ? parseInt(req.headers['content-length'], 10)
      : rawBodyBuf?.length || 0;

    if (contentLength > 16 * 1024) {
      return res.status(413).json({
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Payload excede o limite máximo permitido de 16KB.'
      });
    }

    // 2. Validação e sanitização estrita do payload
    const validation = validateBookingPayload(req.body);
    if (!validation.valid || !validation.sanitized) {
      return res.status(400).json({
        error: validation.error || 'INVALID_BOOKING_PAYLOAD',
        message: validation.message || 'Dados de agendamento inválidos.'
      });
    }

    // 3. Verificação do Firebase App Check
    const appCheckHeader = req.headers['x-firebase-appcheck'];
    const appCheckResult = await verifyAppCheckHeader(appCheckHeader);
    if (!appCheckResult.valid) {
      return res.status(401).json({
        error: appCheckResult.error,
        message: appCheckResult.message
      });
    }

    // 4. Rate Limiting por IP (15 requests / 15 minutos)
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown-ip';

    const ipLimit = await ipBookingRateLimiter.checkLimit(
      `booking_ip_${clientIp}`,
      15,
      15 * 60 // 15 minutos em segundos
    );

    if (!ipLimit.allowed) {
      res.setHeader('Retry-After', String(ipLimit.retryAfterSeconds || 60));
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: ipLimit.reason || 'Limite de requisições por IP excedido. Tente novamente mais tarde.'
      });
    }

    // 5. Enforcement de Assinatura Ativa (Bloqueia novos agendamentos se SUSPENDED ou CANCELED)
    const subCheck = await assertTenantSubscriptionActive(validation.sanitized.tenantId);
    if (!subCheck.allowed && (subCheck.status === 'SUSPENDED' || subCheck.status === 'CANCELED')) {
      return res.status(403).json({
        error: 'TENANT_SUBSCRIPTION_SUSPENDED',
        message: subCheck.reason || 'Agendamentos temporariamente indisponíveis: estabelecimento com pendência financeira ou assinatura cancelada.'
      });
    }

    // 6. Execução do Booking Autoritativo
    const authHeader = req.headers['authorization'];
    const result = await executeAuthoritativeBooking({
      payload: validation.sanitized,
      authHeader
    });

    if (result.status === 200 && result.appointment) {
      if (result.isReplay) {
        res.setHeader('X-Cache-Lookup', 'IDEMPOTENT_REPLAY');
      }
      return res.status(200).json({
        success: true,
        appointment: result.appointment
      });
    }

    return res.status(result.status).json({
      error: result.error,
      message: result.message
    });
  } catch (err: any) {
    console.error('[API /api/appointments/book] Erro inesperado:', err);
    return res.status(500).json({
      error: 'INTERNAL_BOOKING_ERROR',
      message: 'Falha interna inesperada ao processar o agendamento.'
    });
  }
}
