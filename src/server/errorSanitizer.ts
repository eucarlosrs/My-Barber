import { Request, Response } from 'express';
import { logger } from './logger.js';
import { ObservableRequest } from './correlationMiddleware.js';

export interface SafeErrorResponse {
  error: string;
  message: string;
  requestId: string;
}

/**
 * Envia uma resposta HTTP 500 sanitizada, evitando expor stack traces ou mensagens
 * de bibliotecas de baixo nível (gRPC, Firestore, Node) ao cliente.
 * Registra o erro técnico detalhado no logger estruturado associado ao requestId.
 */
export function sendSanitizedInternalError(
  res: Response,
  err: any,
  context: {
    req: Request | ObservableRequest;
    operation: string;
    publicMessage?: string;
    errorCode?: string;
    extra?: Record<string, any>;
  }
): Response {
  const requestId = (context.req as ObservableRequest).id || (context.req.headers['x-request-id'] as string) || 'req_unknown';
  const publicMessage = context.publicMessage || 'Ocorreu um erro interno ao processar a operação.';
  const errorCode = context.errorCode || 'INTERNAL_SERVER_ERROR';

  logger.error(`[${context.operation}] Erro interno`, {
    requestId,
    operation: context.operation,
    errorCode,
    error: err?.message || String(err),
    stack: err?.stack,
    path: context.req.path,
    method: context.req.method,
    ...(context.extra || {})
  });

  return res.status(500).json({
    error: errorCode,
    message: publicMessage,
    requestId
  });
}
