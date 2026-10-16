/**
 * MY BARBER — Rate Limiter Abstraction & In-Memory Implementation
 * 
 * DESIGN & CONCORRÊNCIA:
 * - Janela deslizante (sliding window) baseada em timestamps.
 * - Limpeza automática e periódica para evitar vazamento de memória.
 * - Suporte a múltiplos limiters (IP, WhatsApp/Telefone, Tenant).
 * 
 * NOTA ARQUITETURAL PARA PRODUÇÃO:
 * - A implementação InMemoryRateLimiter é voltada para instâncias locais/únicas.
 * - Para ambientes multi-instância (ex: Cloud Run, Kubernetes, Serverless com múltiplas instâncias),
 *   deve-se utilizar um adapter distribuído baseado em Redis ou Google Cloud Memorystore.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
  reason?: string;
}

export interface RateLimiter {
  checkLimit(key: string, maxRequests: number, windowSeconds: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
  destroy(): void;
}

export class InMemoryRateLimiter implements RateLimiter {
  private records: Map<string, number[]> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(cleanupIntervalMs: number = 60000) {
    // Timer com unref() para não impedir encerramento do processo em testes
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  public async checkLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    const timestamps = this.records.get(key) || [];
    const validTimestamps = timestamps.filter(ts => ts > windowStart);

    if (validTimestamps.length >= maxRequests) {
      const oldestValid = validTimestamps[0];
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestValid + windowSeconds * 1000 - now) / 1000)
      );

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        reason: `Limite de requisições atingido. Tente novamente em ${retryAfterSeconds} segundos.`
      };
    }

    validTimestamps.push(now);
    this.records.set(key, validTimestamps);

    return {
      allowed: true,
      remaining: maxRequests - validTimestamps.length
    };
  }

  public async reset(key: string): Promise<void> {
    this.records.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    // Remove registros cujo timestamp mais recente seja anterior a 1 hora
    for (const [key, timestamps] of this.records.entries()) {
      const latest = timestamps[timestamps.length - 1];
      if (!latest || now - latest > 3600 * 1000) {
        this.records.delete(key);
      }
    }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.records.clear();
  }
}

// Instâncias globais de Rate Limiting
export const ipBookingRateLimiter = new InMemoryRateLimiter();
export const phoneBookingRateLimiter = new InMemoryRateLimiter();
export const globalApiRateLimiter = new InMemoryRateLimiter();

export interface EndpointRateLimitOptions {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
  keyGenerator?: (req: any) => string;
}

/**
 * Cria um middleware Express de rate limiting para proteger endpoints sensíveis.
 * Chave padrão:
 * - Se autenticado: `prefix:${req.user.tenantId || 'no_tenant'}:${req.user.uid}`
 * - Se anônimo/público: `prefix:ip:${clientIp}`
 */
export function createRateLimitMiddleware(options: EndpointRateLimitOptions) {
  const { maxRequests, windowSeconds, keyPrefix, keyGenerator } = options;

  return async (req: any, res: any, next: any) => {
    try {
      let key: string;
      if (keyGenerator) {
        key = keyGenerator(req);
      } else {
        const clientIp =
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.socket?.remoteAddress ||
          'unknown_ip';

        if (req.user?.uid) {
          const tenant = req.user.tenantId || 'global';
          key = `${keyPrefix}:auth:${tenant}:${req.user.uid}`;
        } else {
          key = `${keyPrefix}:ip:${clientIp}`;
        }
      }

      const result = await globalApiRateLimiter.checkLimit(key, maxRequests, windowSeconds);

      if (!result.allowed) {
        if (result.retryAfterSeconds) {
          res.setHeader('Retry-After', String(result.retryAfterSeconds));
        }
        return res.status(429).json({
          error: 'TOO_MANY_REQUESTS',
          message: result.reason || 'Limite de requisições excedido. Tente novamente mais tarde.',
          retryAfterSeconds: result.retryAfterSeconds
        });
      }

      next();
    } catch (err) {
      console.warn(`[RateLimitMiddleware] Falha ao processar limite para ${keyPrefix}:`, err);
      // Fail-open para não travar tráfego legítimo em erro interno de rate limit
      next();
    }
  };
}

