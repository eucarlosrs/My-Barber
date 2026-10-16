import { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

/**
 * Interface estendida da Request do Express para comportar requestId e timing.
 */
export interface ObservableRequest extends Request {
  id?: string;
  startTime?: number;
}

// Regex segura para validar X-Request-Id: caracteres alfanuméricos, hifens e underscores (comprimento entre 8 e 128)
export const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{8,128}$/;

export function generateRequestId(): string {
  const uuid = (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  return `req_${uuid}`;
}

/**
 * Middleware universal de Correlation ID.
 * - Valida se X-Request-Id fornecido pelo cliente é seguro (tamanho e formato).
 * - Se ausente ou inválido, gera um novo UUIDv4 seguro com prefixo req_.
 * - Anexa em req.id e envia no cabeçalho X-Request-Id da resposta.
 * - Registra log estruturado HTTP request ao finalizar a resposta.
 */
export function correlationIdMiddleware(req: ObservableRequest, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];

  let validRequestId: string;
  if (typeof incomingId === 'string' && incomingId.trim() && SAFE_REQUEST_ID_REGEX.test(incomingId.trim())) {
    validRequestId = incomingId.trim();
  } else {
    validRequestId = generateRequestId();
  }

  req.id = validRequestId;
  req.startTime = Date.now();

  res.setHeader('X-Request-Id', validRequestId);

  res.on('finish', () => {
    const durationMs = req.startTime ? Date.now() - req.startTime : 0;
    const path = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;

    // Evita poluição de logs para polling de health se status for 200
    if ((path === '/api/health' || path === '/api/health/ready') && res.statusCode === 200) {
      return;
    }

    const tenantId = (req as any).user?.tenantId;
    const actorUid = (req as any).user?.uid;

    logger.info('http_request', {
      requestId: validRequestId,
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs,
      ...(tenantId ? { tenantId } : {}),
      ...(actorUid ? { actorUid } : {})
    });
  });

  next();
}
