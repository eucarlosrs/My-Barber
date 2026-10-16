/**
 * Utilitário de Logging Estruturado em JSON para o MY BARBER (FASE 4.3B).
 * Emite logs estruturados em JSON para stdout/stderr sem dependências externas.
 * Blindado contra vazamento acidental de tokens, senhas, chaves privadas ou dados de cartão.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface StructuredLogPayload {
  timestamp?: string;
  level?: LogLevel;
  message: string;
  requestId?: string;
  tenantId?: string;
  actorUid?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  operation?: string;
  entityId?: string;
  errorCode?: string;
  error?: string;
  [key: string]: any;
}

// Chaves proibidas que JAMAIS devem ser serializadas nos logs
const SENSITIVE_KEYS = new Set([
  'authorization',
  'token',
  'refreshtoken',
  'idtoken',
  'password',
  'senha',
  'secret',
  'webhooksecret',
  'accesstoken',
  'client_secret',
  'card',
  'cardnumber',
  'pan',
  'cvv',
  'cvv2',
  'securitycode',
  'track2',
  'creditcard'
]);

function sanitizeLogValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeLogValue(item));
  }
  if (typeof value === 'object') {
    return sanitizeLogData(value);
  }
  return value;
}

export function sanitizeLogData(data: Record<string, any>): Record<string, any> {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (Array.isArray(value)) {
      sanitized[key] = value.map(item => sanitizeLogValue(item));
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeLogData(value);
    } else if (typeof value === 'string' && (lowerKey.includes('token') || lowerKey.includes('secret') || lowerKey.includes('key'))) {
      if (value.length > 16) {
        sanitized[key] = `${value.slice(0, 6)}...${value.slice(-4)}`;
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

class JsonLogger {
  private formatLog(level: LogLevel, message: string, payload?: Partial<StructuredLogPayload>): string {
    const rawPayload: StructuredLogPayload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(payload ? sanitizeLogData(payload) : {})
    };
    return JSON.stringify(rawPayload);
  }

  public info(message: string, payload?: Partial<StructuredLogPayload>): void {
    console.log(this.formatLog('info', message, payload));
  }

  public warn(message: string, payload?: Partial<StructuredLogPayload>): void {
    console.warn(this.formatLog('warn', message, payload));
  }

  public error(message: string, payload?: Partial<StructuredLogPayload>): void {
    console.error(this.formatLog('error', message, payload));
  }

  public debug(message: string, payload?: Partial<StructuredLogPayload>): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(this.formatLog('debug', message, payload));
    }
  }
}

export const logger = new JsonLogger();
