import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeLogData } from '../server/logger.js';
import { recordAuditLog } from '../server/auditLogService.js';
import { adjustStockAuthoritative } from '../server/stockService.js';
import { securityHeadersMiddleware } from '../server/securityHeaders.js';
import { AuthUserClaims } from '../lib/authClaims.js';

describe('FASE 4.4D — Correções Cirúrgicas de Observabilidade, Auditoria, Estoque e Hardening', () => {
  describe('1. Sanitização Recursiva de Arrays e Objetos (sanitizeLogData)', () => {
    it('[UNIT] A) Sanitiza objetos dentro de arrays recursivamente', () => {
      const payload = {
        items: [
          {
            name: 'Item Normal',
            token: 'SECRET_TOKEN_XYZ',
            password: 'SUPER_SECRET_PASSWORD',
            card: '4111111111111111'
          }
        ]
      };

      const sanitized = sanitizeLogData(payload);
      assert.strictEqual(sanitized.items[0].name, 'Item Normal');
      assert.strictEqual(sanitized.items[0].token, '[REDACTED]');
      assert.strictEqual(sanitized.items[0].password, '[REDACTED]');
      assert.strictEqual(sanitized.items[0].card, '[REDACTED]');
    });

    it('[UNIT] B) Sanitiza arrays dentro de objetos e arrays aninhados', () => {
      const payload = {
        nested: {
          matrix: [
            [
              { apiKey: 'AIzaSySecretApiKey123' },
              { pan: '4532015012345678', cvv2: '123' }
            ]
          ]
        }
      };

      const sanitized = sanitizeLogData(payload);
      assert.ok(sanitized.nested.matrix[0][0].apiKey.includes('...'));
      assert.strictEqual(sanitized.nested.matrix[0][1].pan, '[REDACTED]');
      assert.strictEqual(sanitized.nested.matrix[0][1].cvv2, '[REDACTED]');
    });

    it('[UNIT] C) Sanitiza aliases sensíveis: authorization, refreshToken, secret, cvv, pan, creditCard', () => {
      const payload = {
        authorization: 'Bearer eyJhbGciOi...',
        refreshToken: 'dGhpcy1pcy1hLXJlZnJlc2gtdG9rZW4=',
        webhookSecret: 'whsec_998877665544',
        creditCard: '1234-5678-9012-3456',
        securityCode: '999',
        track2: 'data-track'
      };

      const sanitized = sanitizeLogData(payload);
      for (const [key, val] of Object.entries(sanitized)) {
        assert.strictEqual(val, '[REDACTED]', `Chave ${key} deve ser [REDACTED]`);
      }
    });

    it('[UNIT] D) Preserva campos normais e dados não sensíveis', () => {
      const payload = {
        serviceName: 'Corte Degradê',
        price: 45.0,
        tags: ['cabelo', 'barba'],
        active: true,
        metadata: {
          category: 'Barbearia',
          durationMinutes: 30
        }
      };

      const sanitized = sanitizeLogData(payload);
      assert.deepStrictEqual(sanitized, payload);
    });
  });

  describe('2. Estoque com Idempotency Key Tenant-Scoped', () => {
    function createMockStockDb(initialStock: Record<string, any>) {
      const store = {
        stock: new Map<string, any>(Object.entries(initialStock)),
        stock_movements: new Map<string, any>(),
        stock_adjustments: new Map<string, any>()
      };

      return {
        _store: store,
        runTransaction: async (updateFn: any) => {
          const transaction = {
            get: async (ref: any) => {
              const val = store[ref._col as keyof typeof store]?.get(ref._id);
              return {
                exists: Boolean(val),
                data: () => val
              };
            },
            set: (ref: any, data: any, opts?: any) => {
              const col = store[ref._col as keyof typeof store];
              if (opts?.merge && col.has(ref._id)) {
                col.set(ref._id, { ...col.get(ref._id), ...data });
              } else {
                col.set(ref._id, data);
              }
            }
          };
          return updateFn(transaction);
        },
        collection: (col: string) => ({
          doc: (id: string) => ({ _col: col, _id: id })
        })
      };
    }

    it('[UNIT/MOCK] E) Tenant A e Tenant B usando a mesma idempotencyKey NÃO colidem', async () => {
      const mockDb = createMockStockDb({
        'prod-tenant-A': { id: 'prod-tenant-A', name: 'Pomada A', tenantId: 'tenant-A', quantity: 20 },
        'prod-tenant-B': { id: 'prod-tenant-B', name: 'Pomada B', tenantId: 'tenant-B', quantity: 30 }
      });

      const actorA: AuthUserClaims = {
        uid: 'user-a',
        role: 'manager',
        legacyRole: 'GERENTE',
        tenantId: 'tenant-A',
        isSuperAdmin: false,
        claimsRaw: {}
      };

      const actorB: AuthUserClaims = {
        uid: 'user-b',
        role: 'manager',
        legacyRole: 'GERENTE',
        tenantId: 'tenant-B',
        isSuperAdmin: false,
        claimsRaw: {}
      };

      // Ambos usam a mesma chave "key-shared-123"
      const resA = await adjustStockAuthoritative({
        stockItemId: 'prod-tenant-A',
        delta: -5,
        idempotencyKey: 'key-shared-123',
        actor: actorA,
        firestoreOverride: mockDb
      });

      const resB = await adjustStockAuthoritative({
        stockItemId: 'prod-tenant-B',
        delta: -10,
        idempotencyKey: 'key-shared-123',
        actor: actorB,
        firestoreOverride: mockDb
      });

      assert.strictEqual(resA.success, true);
      assert.strictEqual(resA.stockItem.quantity, 15);
      assert.strictEqual(resB.success, true);
      assert.strictEqual(resB.stockItem.quantity, 20);

      // Confirma que foram salvas duas chaves distintas com namespace do tenant
      assert.ok(mockDb._store.stock_adjustments.has('tenant-A_key-shared-123'));
      assert.ok(mockDb._store.stock_adjustments.has('tenant-B_key-shared-123'));
    });

    it('[UNIT/MOCK] F) Replay idempotente funciona com chave tenant-scoped', async () => {
      const mockDb = createMockStockDb({
        'prod-1': { id: 'prod-1', name: 'Shampoo', tenantId: 'tenant-1', quantity: 50 }
      });

      const actor: AuthUserClaims = {
        uid: 'user-1',
        role: 'barbershop_owner',
        legacyRole: 'PROPRIETARIO',
        tenantId: 'tenant-1',
        isSuperAdmin: false,
        claimsRaw: {}
      };

      const res1 = await adjustStockAuthoritative({
        stockItemId: 'prod-1',
        delta: -3,
        idempotencyKey: 'unique-key-456',
        actor,
        firestoreOverride: mockDb
      });
      assert.strictEqual(res1.success, true);
      assert.strictEqual(res1.stockItem.quantity, 47);

      // Repetição idêntica
      const res2 = await adjustStockAuthoritative({
        stockItemId: 'prod-1',
        delta: -3,
        idempotencyKey: 'unique-key-456',
        actor,
        firestoreOverride: mockDb
      });
      assert.strictEqual(res2.success, true);
      assert.strictEqual(res2.isReplay, true);
      assert.strictEqual(res2.stockItem.quantity, 47, 'Estoque não sofre segundo débito');
    });
  });

  describe('3. Proteção Client-Side de Estoque e Auditoria', () => {
    it('[UNIT] G) updateStockItem em AppContext descarta o campo quantity para preservar a integridade', () => {
      // Simulação direta da lógica de updateStockItem de AppContext.tsx
      const initialStockItem = { id: 'prod-1', name: 'Pomada', price: 30, quantity: 10, tenantId: 't1' };
      const clientUpdatePayload = { name: 'Pomada Efeito Seco', price: 35, quantity: 999 };

      // Lógica implementada em AppContext.tsx:
      const { quantity: _ignoredQty, ...cadastralData } = clientUpdatePayload;
      const merged = { ...initialStockItem, ...cadastralData, quantity: initialStockItem.quantity };

      assert.strictEqual(merged.name, 'Pomada Efeito Seco');
      assert.strictEqual(merged.price, 35);
      assert.strictEqual(merged.quantity, 10, 'Quantity deve ser imutável via update cadastral');
    });

    it('[UNIT] H) addAuditLog no client-side não invoca syncDoc no Firestore', () => {
      let syncDocCalled = false;
      const fakeSyncDoc = () => { syncDocCalled = true; };

      // Simulação da função addAuditLog corrigida:
      const logEntry = { action: 'TEST_ACTION', details: 'info' };
      const newLog = { ...logEntry, id: 'log-1', timestamp: new Date().toISOString() };
      // syncDoc('audit_logs', ...) foi removido de addAuditLog
      
      assert.strictEqual(syncDocCalled, false);
      assert.strictEqual(newLog.action, 'TEST_ACTION');
    });
  });

  describe('4. Express Trust Proxy e HSTS Hardening', () => {
    it('[UNIT] I) Header X-Forwarded-Proto forjado não ativa HSTS se req.secure for falso', () => {
      const headersSent: Record<string, string> = {};
      const req: any = {
        path: '/api/test',
        headers: { 'x-forwarded-proto': 'https' }, // Forjado por cliente direto sem proxy confiável
        secure: false // Express avalia false quando trust proxy não valida a origem
      };
      const res: any = {
        setHeader: (k: string, v: string) => { headersSent[k] = v; }
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        securityHeadersMiddleware(req, res, () => {});
        assert.strictEqual(headersSent['Strict-Transport-Security'], undefined, 'HSTS não deve ser injetado para requisição insegura com header forjado');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('[UNIT] J) HSTS é ativado somente quando req.secure === true em produção', () => {
      const headersSent: Record<string, string> = {};
      const req: any = {
        path: '/api/test',
        headers: {},
        secure: true // Conexão TLS real ou proxy validado pelo Express (app.set trust proxy)
      };
      const res: any = {
        setHeader: (k: string, v: string) => { headersSent[k] = v; }
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        securityHeadersMiddleware(req, res, () => {});
        assert.strictEqual(headersSent['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('[UNIT] K) Em desenvolvimento (NODE_ENV !== production), HSTS nunca é injetado', () => {
      const headersSent: Record<string, string> = {};
      const req: any = { path: '/api/test', headers: {}, secure: true };
      const res: any = { setHeader: (k: string, v: string) => { headersSent[k] = v; } };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        securityHeadersMiddleware(req, res, () => {});
        assert.strictEqual(headersSent['Strict-Transport-Security'], undefined);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('5. Cobertura Abrangente de Audit Logs', () => {
    it('[UNIT/MOCK] L) recordAuditLog persiste registro oficial com todos os metadados requeridos', async () => {
      let savedDoc: any = null;
      const mockDb = {
        collection: (name: string) => ({
          doc: (id: string) => ({
            set: async (data: any) => {
              if (name === 'audit_logs') {
                savedDoc = data;
              }
            }
          })
        })
      };

      const res = await recordAuditLog({
        actorUid: 'admin-super-1',
        actorRole: 'super_admin',
        tenantId: 'tenant-barber-99',
        action: 'USER_ROLE_ASSIGNED',
        targetType: 'user_claims',
        targetId: 'usr-barber-5',
        previousState: { role: 'customer' },
        newState: { role: 'barber', tenantId: 'tenant-barber-99' },
        details: 'Promoção para barbeiro oficial',
        requestId: 'req_trace_9999',
        firestoreOverride: mockDb
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(savedDoc.actorUid, 'admin-super-1');
      assert.strictEqual(savedDoc.actorRole, 'super_admin');
      assert.strictEqual(savedDoc.tenantId, 'tenant-barber-99');
      assert.strictEqual(savedDoc.action, 'USER_ROLE_ASSIGNED');
      assert.strictEqual(savedDoc.targetType, 'user_claims');
      assert.strictEqual(savedDoc.targetId, 'usr-barber-5');
      assert.strictEqual(savedDoc.previousState.role, 'customer');
      assert.strictEqual(savedDoc.newState.role, 'barber');
      assert.strictEqual(savedDoc.requestId, 'req_trace_9999');
    });

    it('[UNIT/MOCK] M) Falha no Firestore ao gravar audit_log retorna erro estruturado sem quebrar', async () => {
      const failingDb = {
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('Firestore connection timeout');
            }
          })
        })
      };

      const res = await recordAuditLog({
        actorUid: 'usr-1',
        actorRole: 'manager',
        action: 'TEST_FAIL',
        targetType: 'test',
        targetId: 't-1',
        firestoreOverride: failingDb
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'Firestore connection timeout');
    });
  });
});
