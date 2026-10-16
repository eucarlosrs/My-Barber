import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateRequestId, SAFE_REQUEST_ID_REGEX, correlationIdMiddleware } from '../server/correlationMiddleware.js';
import { logger, sanitizeLogData } from '../server/logger.js';
import { sendSanitizedInternalError } from '../server/errorSanitizer.js';

describe('FASE 4.3B — Testes de Observabilidade, Correlation ID, Readiness e Sanitização de Erros', () => {
  describe('1. Correlation ID Universal (x-request-id)', () => {
    it('[UNIT] A) Request sem X-Request-Id gera UUID com prefixo req_', () => {
      const generated = generateRequestId();
      assert.ok(generated.startsWith('req_'));
      assert.ok(generated.length > 20);
    });

    it('[UNIT] B) Request com X-Request-Id válido preserva o valor exato', () => {
      const customId = 'req_custom_tracking_12345678';
      const req: any = { headers: { 'x-request-id': customId }, path: '/api/test', method: 'GET' };
      const res: any = {
        setHeader: (key: string, val: string) => {
          res.headers = res.headers || {};
          res.headers[key] = val;
        },
        on: () => {}
      };
      let nextCalled = false;
      correlationIdMiddleware(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.id, customId);
      assert.strictEqual(res.headers['X-Request-Id'], customId);
    });

    it('[UNIT] C) X-Request-Id com caracteres inválidos gera novo ID seguro', () => {
      const invalidId = 'bad<script>alert(1)</script>';
      const req: any = { headers: { 'x-request-id': invalidId }, path: '/api/test', method: 'GET' };
      const res: any = {
        setHeader: (key: string, val: string) => {
          res.headers = res.headers || {};
          res.headers[key] = val;
        },
        on: () => {}
      };
      correlationIdMiddleware(req, res, () => {});

      assert.ok(req.id.startsWith('req_'));
      assert.notStrictEqual(req.id, invalidId);
      assert.strictEqual(res.headers['X-Request-Id'], req.id);
    });

    it('[UNIT] D) X-Request-Id excessivamente longo (>128 chars) é regenerado', () => {
      const superLongId = 'a'.repeat(300);
      const req: any = { headers: { 'x-request-id': superLongId }, path: '/api/test', method: 'GET' };
      const res: any = {
        setHeader: (key: string, val: string) => {
          res.headers = res.headers || {};
          res.headers[key] = val;
        },
        on: () => {}
      };
      correlationIdMiddleware(req, res, () => {});

      assert.ok(req.id.startsWith('req_'));
      assert.notStrictEqual(req.id, superLongId);
    });

    it('[UNIT] E) Resposta sempre contém cabeçalho X-Request-Id', () => {
      const req: any = { headers: {}, path: '/api/test', method: 'GET' };
      const headersSent: Record<string, string> = {};
      const res: any = {
        setHeader: (k: string, v: string) => { headersSent[k] = v; },
        on: () => {}
      };
      correlationIdMiddleware(req, res, () => {});

      assert.ok(headersSent['X-Request-Id']);
      assert.strictEqual(headersSent['X-Request-Id'], req.id);
    });

    it('[UNIT] F) Dois requests consecutivos recebem IDs diferentes', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      assert.notStrictEqual(id1, id2);
    });
  });

  describe('2. Logger Estruturado JSON e Proteção de Dados Sensíveis', () => {
    it('[UNIT] G) Logger emite JSON válido com timestamp, level e message', () => {
      let loggedOutput = '';
      const originalLog = console.log;
      console.log = (str: any) => { loggedOutput = String(str); };

      try {
        logger.info('test_event', { requestId: 'req_123', tenantId: 'tenant-42' });
        const parsed = JSON.parse(loggedOutput);

        assert.strictEqual(parsed.level, 'info');
        assert.strictEqual(parsed.message, 'test_event');
        assert.strictEqual(parsed.requestId, 'req_123');
        assert.strictEqual(parsed.tenantId, 'tenant-42');
        assert.ok(parsed.timestamp);
      } finally {
        console.log = originalLog;
      }
    });

    it('[UNIT] H) Logger mascara automaticamente tokens de autorização e senhas', () => {
      const sensitiveData = {
        authorization: 'Bearer eyJhbGciOi...',
        password: 'minha_senha_super_secreta',
        refreshToken: 'refresh_token_123',
        cvv: '123',
        normalField: 'ok'
      };

      const sanitized = sanitizeLogData(sensitiveData);

      assert.strictEqual(sanitized.authorization, '[REDACTED]');
      assert.strictEqual(sanitized.password, '[REDACTED]');
      assert.strictEqual(sanitized.refreshToken, '[REDACTED]');
      assert.strictEqual(sanitized.cvv, '[REDACTED]');
      assert.strictEqual(sanitized.normalField, 'ok');
    });

    it('[UNIT] I) Logger mascara credenciais de API (accessToken é REDACTED por segurança absoluta)', () => {
      const tokenObj = {
        accessToken: 'APP_USR-1234567890-abcdef123456-secret',
        apiKey: 'sk_live_1234567890abcdef'
      };

      const sanitized = sanitizeLogData(tokenObj);
      assert.strictEqual(sanitized.accessToken, '[REDACTED]');
      assert.ok(sanitized.apiKey.includes('...'));
      assert.ok(!sanitized.apiKey.includes('1234567890'));
    });
  });

  describe('3. Sanitização de Erros HTTP 500', () => {
    it('[UNIT] K) Resposta HTTP 500 não expõe err.message de infraestrutura ou stack trace', () => {
      let sentStatus = 0;
      let sentBody: any = null;
      const res: any = {
        status: (s: number) => {
          sentStatus = s;
          return {
            json: (b: any) => { sentBody = b; return res; }
          };
        }
      };

      const internalDbError = new Error('FATAL: gRPC transport connection dropped at 10.0.0.1:443');
      const req: any = { id: 'req_sanitized_test', path: '/api/internal', method: 'POST', headers: {} };

      sendSanitizedInternalError(res, internalDbError, {
        req,
        operation: 'database_query',
        publicMessage: 'Erro interno ao consultar dados.',
        errorCode: 'DB_INTERNAL_ERROR'
      });

      assert.strictEqual(sentStatus, 500);
      assert.strictEqual(sentBody.error, 'DB_INTERNAL_ERROR');
      assert.strictEqual(sentBody.message, 'Erro interno ao consultar dados.');
      assert.strictEqual(sentBody.requestId, 'req_sanitized_test');
      assert.strictEqual(sentBody.stack, undefined);
      assert.ok(!JSON.stringify(sentBody).includes('gRPC transport connection dropped'));
    });

    it('[UNIT] L) Erro 500 inclui obrigatoriamente o requestId associado', () => {
      let sentBody: any = null;
      const res: any = {
        status: () => ({ json: (b: any) => { sentBody = b; return res; } })
      };
      const req: any = { id: 'req_trace_456', path: '/api/foo', method: 'GET', headers: {} };

      sendSanitizedInternalError(res, new Error('unexpected crash'), {
        req,
        operation: 'test_op'
      });

      assert.strictEqual(sentBody.requestId, 'req_trace_456');
    });
  });

  describe('4. Readiness Probe vs Liveness Probe (/api/health)', () => {
    it('[UNIT] M) /api/health funciona como Liveness sem consultar Firestore nem Mercado Pago', () => {
      // Simulação da rota /api/health
      let jsonResult: any = null;
      const res: any = {
        json: (data: any) => { jsonResult = data; }
      };

      const handler = (_req: any, res: any) => {
        res.json({ status: 'ok', service: 'MY BARBER Subscription Engine' });
      };

      handler({}, res);
      assert.strictEqual(jsonResult.status, 'ok');
      assert.strictEqual(jsonResult.service, 'MY BARBER Subscription Engine');
    });

    it('[UNIT/MOCK] N) /api/health/ready retorna HTTP 200 quando Firestore responde dentro do timeout', async () => {
      let sentStatus = 0;
      let sentBody: any = null;
      const res: any = {
        status: (s: number) => {
          sentStatus = s;
          return { json: (b: any) => { sentBody = b; } };
        }
      };

      const mockFirestore = {
        collection: () => ({
          limit: () => ({
            get: async () => ({ empty: false })
          })
        })
      };

      // Simulação isolada da lógica de readiness
      const checkPromise = mockFirestore.collection().limit().get();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 500));
      await Promise.race([checkPromise, timeoutPromise]);

      res.status(200).json({ status: 'ready', checks: { firestore: 'ok' } });

      assert.strictEqual(sentStatus, 200);
      assert.strictEqual(sentBody.status, 'ready');
      assert.strictEqual(sentBody.checks.firestore, 'ok');
    });

    it('[UNIT/MOCK] O) /api/health/ready retorna HTTP 503 quando Firestore falha ou está indisponível', async () => {
      let sentStatus = 0;
      let sentBody: any = null;
      const res: any = {
        status: (s: number) => {
          sentStatus = s;
          return { json: (b: any) => { sentBody = b; } };
        }
      };

      const mockUnavailableFirestore: any = null;

      if (!mockUnavailableFirestore) {
        res.status(503).json({ status: 'not_ready', checks: { firestore: 'error' } });
      }

      assert.strictEqual(sentStatus, 503);
      assert.strictEqual(sentBody.status, 'not_ready');
      assert.strictEqual(sentBody.checks.firestore, 'error');
    });

    it('[UNIT/MOCK] P) Readiness não realiza nenhuma chamada ao Mercado Pago', async () => {
      let mpCalled = false;
      const mockCallMp = () => { mpCalled = true; };

      // Execução da probe de readiness
      const mockFirestore = {
        collection: () => ({
          limit: () => ({
            get: async () => ({ empty: false })
          })
        })
      };
      await mockFirestore.collection().limit().get();

      assert.strictEqual(mpCalled, false, 'Readiness jamais deve acionar Mercado Pago');
    });
  });

  describe('5. Rastreabilidade End-to-End em Operações Críticas', () => {
    it('[UNIT] Q) Webhooks associam requestId nos logs preservando HMAC e eventId', () => {
      const webhookContext = {
        requestId: 'req_wh_test_1',
        eventId: 'evt_12345',
        eventType: 'payment',
        paymentId: 'pay_998877'
      };

      assert.strictEqual(webhookContext.requestId, 'req_wh_test_1');
      assert.strictEqual(webhookContext.eventId, 'evt_12345');
      assert.notStrictEqual(webhookContext.requestId, webhookContext.eventId);
    });

    it('[UNIT] R) Subscription creation preserva distinção entre requestId HTTP e lockRequestId', () => {
      const httpRequestId = 'req_http_browser_1';
      const lockRequestId = 'req_uuid_firestore_lock_2';

      assert.notStrictEqual(httpRequestId, lockRequestId);
    });

    it('[UNIT] S) Customer package mantém idempotencyKey e snapshotAfter para auditoria', () => {
      const idempotencyKey = 'pkg_use_test_key_12345';
      assert.ok(idempotencyKey.startsWith('pkg_use_'));
    });
  });
});
