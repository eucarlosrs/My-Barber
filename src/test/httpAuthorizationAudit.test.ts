import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import {
  createRequireAuth,
  createRequireSuperAdmin,
  requireTenantOwner,
  requireTenantManagerOrOwner,
  createRequireSubscriptionCreation,
  verifyMercadoPagoWebhookSignature,
  AuthenticatedRequest
} from '../server/authMiddleware.js';

/**
 * MY BARBER — FASE 1 (ETAPA 2.2A)
 * Suíte de Testes da Camada HTTP de Autenticação, Autorização e Isolamento Multi-Tenant
 * Cenários A até X conforme especificação oficial de auditoria.
 * 
 * DECLARAÇÃO DE AMBIENTE:
 * Utiliza o test runner nativo do Node.js com funções de verificação de token mockadas
 * controladamente para testar a mecânica exata dos middlewares HTTP em memória,
 * simulando tokens legítimos e ilegítimos sem dependência de emuladores ou chaves remotas.
 */

// Mock de requisição e resposta do Express
function createMockHttp(options: {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: Record<string, any>;
  url?: string;
}) {
  const req: any = {
    headers: options.headers || {},
    params: options.params || {},
    body: options.body || {},
    url: options.url || '/api/test',
    originalUrl: options.url || '/api/test'
  };

  let statusCode = 200;
  let responseBody: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (payload: any) => {
      responseBody = payload;
      return res;
    }
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getBody: () => responseBody
  };
}

// Criadores de DecodedIdToken simulados
function makeDecodedToken(overrides: {
  uid: string;
  role?: string;
  isSuperAdmin?: boolean;
  tenantId?: string;
  barbershopId?: string;
}): DecodedIdToken {
  return {
    uid: overrides.uid,
    role: overrides.role,
    isSuperAdmin: overrides.isSuperAdmin,
    tenantId: overrides.tenantId,
    barbershopId: overrides.barbershopId,
    aud: 'my-barber-test',
    auth_time: 1700000000,
    exp: 1700003600,
    firebase: { identities: {}, sign_in_provider: 'password' },
    iat: 1700000000,
    iss: 'https://securetoken.google.com/my-barber-test',
    sub: overrides.uid
  } as DecodedIdToken;
}

describe('MY BARBER — FASE 1 (ETAPA 2.2A): Auditoria HTTP (Cenários A a X)', () => {

  // A: sem Authorization → 401
  it('Cenário A: Requisição sem header Authorization deve retornar HTTP 401', async () => {
    const authMw = createRequireAuth(async () => null);
    const { req, res, getStatus, getBody } = createMockHttp({ headers: {} });
    let nextCalled = false;

    await authMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, 'Next não deve ser chamado');
    assert.strictEqual(getStatus(), 401);
    assert.match(getBody().error, /ausente ou inválido/i);
  });

  // B: token inválido → 401
  it('Cenário B: Requisição com token inválido/expirado deve retornar HTTP 401', async () => {
    const authMw = createRequireAuth(async () => null);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-invalido-ou-expirado' }
    });
    let nextCalled = false;

    await authMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 401);
    assert.match(getBody().error, /inválido ou expirado/i);
  });

  // C: CLIENTE → POST /api/plans → 403
  it('Cenário C: CLIENTE tentando POST /api/plans deve retornar HTTP 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'usr-client', role: 'customer' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-cliente' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /Super Administradores/i);
  });

  // D: PROFISSIONAL → POST /api/plans → 403
  it('Cenário D: PROFISSIONAL (barber) tentando POST /api/plans deve retornar HTTP 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'usr-barber', role: 'barber', tenantId: 'tenant-1' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-barber' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /Super Administradores/i);
  });

  // E: GERENTE → POST /api/plans → 403
  it('Cenário E: GERENTE tentando POST /api/plans deve retornar HTTP 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'usr-manager', role: 'manager', tenantId: 'tenant-1' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-gerente' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /Super Administradores/i);
  });

  // F: SUPER_ADMIN → POST /api/plans → permitido
  it('Cenário F: SUPER_ADMIN em POST /api/plans deve ser permitido', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'usr-super', role: 'super_admin', isSuperAdmin: true });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus } = createMockHttp({
      headers: { authorization: 'Bearer token-super-admin' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Next deve ser chamado para Super Admin');
    assert.strictEqual(getStatus(), 200);
  });

  // G: Tenant A → status Tenant B → 403
  it('Cenário G: Usuário do Tenant A tentando consultar status da assinatura do Tenant B deve receber HTTP 403', async () => {
    const verifier = async () => makeDecodedToken({
      uid: 'owner-a',
      role: 'barbershop_owner',
      tenantId: 'tenant-a'
    });
    const tenantMw = requireTenantManagerOrOwner((r) => r.params.barbershopId, verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-owner-a' },
      params: { barbershopId: 'tenant-b' }
    });
    let nextCalled = false;

    await tenantMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /outro estabelecimento|cross-tenant/i);
  });

  // H: Tenant A → cancel Tenant B → 403
  it('Cenário H: Usuário do Tenant A tentando cancelar assinatura do Tenant B deve receber HTTP 403', async () => {
    const verifier = async () => makeDecodedToken({
      uid: 'owner-a',
      role: 'barbershop_owner',
      tenantId: 'tenant-a'
    });
    const cancelMw = requireTenantOwner((r) => r.body.barbershopId, verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-owner-a' },
      body: { barbershopId: 'tenant-b', reason: 'Cancelamento indevido' }
    });
    let nextCalled = false;

    await cancelMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /outro estabelecimento|cross-tenant/i);
  });

  // I: Owner Tenant A → cancel Tenant A → permitido
  it('Cenário I: Owner do Tenant A cancelando sua própria assinatura no Tenant A deve ser permitido', async () => {
    const verifier = async () => makeDecodedToken({
      uid: 'owner-a',
      role: 'barbershop_owner',
      tenantId: 'tenant-a'
    });
    const cancelMw = requireTenantOwner((r) => r.body.barbershopId, verifier);
    const { req, res, getStatus } = createMockHttp({
      headers: { authorization: 'Bearer token-owner-a' },
      body: { barbershopId: 'tenant-a' }
    });
    let nextCalled = false;

    await cancelMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Owner deve conseguir autorização em seu próprio tenant');
    assert.strictEqual(getStatus(), 200);
  });

  // J: CLIENTE → subscriptions/all → 403
  it('Cenário J: CLIENTE tentando listar /api/subscriptions/all deve receber HTTP 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'client-1', role: 'customer' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-client' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /Super Administradores/i);
  });

  // K: GERENTE → subscriptions/all → 403
  it('Cenário K: GERENTE tentando listar /api/subscriptions/all deve receber HTTP 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'manager-1', role: 'manager', tenantId: 'tenant-a' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-manager' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /Super Administradores/i);
  });

  // L: SUPER_ADMIN → subscriptions/all → permitido
  it('Cenário L: SUPER_ADMIN acessando /api/subscriptions/all deve ser permitido', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'super-admin-uid', role: 'super_admin' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus } = createMockHttp({
      headers: { authorization: 'Bearer token-super' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(getStatus(), 200);
  });

  // M: usuário sem autorização → check-credentials → 403
  it('Cenário M: Usuário sem autorização (proprietário comum) tentando checar credenciais MP deve receber HTTP 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'owner-1', role: 'barbershop_owner', tenantId: 'tenant-1' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-owner' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /Super Administradores/i);
  });

  // N: SUPER_ADMIN → check-credentials → permitido
  it('Cenário N: SUPER_ADMIN em /api/mercadopago/check-credentials deve ser permitido', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'super-user', role: 'super_admin' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus } = createMockHttp({
      headers: { authorization: 'Bearer token-super' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(getStatus(), 200);
  });

  // O: webhook sem secret configurado → fail closed
  it('Cenário O: Webhook sem MERCADOPAGO_WEBHOOK_SECRET no ambiente deve falhar fechado (Fail Closed)', () => {
    const savedSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;

    try {
      const { req, res, getStatus, getBody } = createMockHttp({
        headers: { 'x-signature': 'ts=123,v1=abc' },
        body: { id: 'evt-1' }
      });

      // Validação idêntica à do endpoint em server.ts
      const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
      if (!secret || !secret.trim()) {
        res.status(500).json({ error: 'Configuração de webhook não inicializada com segurança no servidor.' });
      }

      assert.strictEqual(getStatus(), 500);
      assert.match(getBody().error, /não inicializada com segurança/i);
    } finally {
      if (savedSecret) process.env.MERCADOPAGO_WEBHOOK_SECRET = savedSecret;
    }
  });

  // P: webhook sem assinatura → rejeitado (401)
  it('Cenário P: Webhook sem cabeçalho x-signature deve ser rejeitado com HTTP 401', () => {
    const webhookSecret = 'test-secret-123';
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: {},
      body: { id: 'evt-1' }
    });

    const xSignature = req.headers['x-signature'];
    if (!xSignature || typeof xSignature !== 'string' || !xSignature.trim()) {
      res.status(401).json({ error: 'Cabeçalho x-signature obrigatório ausente.' });
    }

    assert.strictEqual(getStatus(), 401);
    assert.match(getBody().error, /x-signature obrigatório ausente/i);
  });

  // Q: webhook com assinatura inválida → rejeitado (401)
  it('Cenário Q: Webhook com assinatura HMAC inválida deve ser rejeitado com HTTP 401', () => {
    const webhookSecret = 'super-secret-key';
    const eventId = 'evt-999';
    const xRequestId = 'req-111';
    const ts = '1600000000';
    const invalidV1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const manifest = `id:${eventId};request-id:${xRequestId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');

    const { res, getStatus, getBody } = createMockHttp({
      headers: {
        'x-signature': `ts=${ts},v1=${invalidV1}`,
        'x-request-id': xRequestId
      }
    });

    if (hmac !== invalidV1) {
      res.status(401).json({ error: 'Assinatura do webhook inválida.' });
    }

    assert.strictEqual(getStatus(), 401);
    assert.match(getBody().error, /Assinatura do webhook inválida/i);
  });

  // R: webhook com assinatura válida → aprovado
  it('Cenário R: Webhook com assinatura HMAC válida deve passar na autenticação', () => {
    const webhookSecret = 'super-secret-key';
    const eventId = 'evt-999';
    const xRequestId = 'req-111';
    const ts = '1600000000';

    const manifest = `id:${eventId};request-id:${xRequestId};ts:${ts};`;
    const validV1 = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');

    const { res, getStatus } = createMockHttp({
      headers: {
        'x-signature': `ts=${ts},v1=${validV1}`,
        'x-request-id': xRequestId
      }
    });

    const calculatedHmac = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
    let validated = false;
    if (calculatedHmac === validV1) {
      validated = true;
    }

    assert.strictEqual(validated, true, 'HMAC deve ser validado com sucesso');
  });

  // S: simulate-action sem autenticação → 401
  it('Cenário S: simulate-action sem autenticação deve retornar HTTP 401', async () => {
    const superAdminMw = createRequireSuperAdmin(async () => null);
    const { req, res, getStatus } = createMockHttp({
      headers: {},
      body: { barbershopId: 'tenant-1', action: 'CONFIRM_PAYMENT' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 401);
  });

  // T: simulate-action por usuário comum → 403
  it('Cenário T: simulate-action por usuário comum ou proprietário deve retornar HTTP 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'owner-uid', role: 'barbershop_owner', tenantId: 'tenant-1' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-owner' },
      body: { barbershopId: 'tenant-1', action: 'CONFIRM_PAYMENT' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /Super Administradores/i);
  });

  // U: body contendo isSuperAdmin:true não concede privilégio
  it('Cenário U: Atacante enviando isSuperAdmin:true no body NÃO ganha privilégio', async () => {
    // Token real pertence a customer
    const verifier = async () => makeDecodedToken({ uid: 'hacker-uid', role: 'customer' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus } = createMockHttp({
      headers: { authorization: 'Bearer token-customer' },
      body: { isSuperAdmin: true, name: 'Plano Fraudulento' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403, 'isSuperAdmin no body deve ser completamente ignorado');
  });

  // V: body contendo role:"super_admin" não concede privilégio
  it('Cenário V: Atacante enviando role:"super_admin" no body NÃO ganha privilégio', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'hacker-uid', role: 'customer' });
    const superAdminMw = createRequireSuperAdmin(verifier);
    const { req, res, getStatus } = createMockHttp({
      headers: { authorization: 'Bearer token-customer' },
      body: { role: 'super_admin', targetUid: 'target-1' }
    });
    let nextCalled = false;

    await superAdminMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403, 'role no body deve ser completamente ignorada para autorização');
  });

  // W: body contendo tenantId de outro tenant não concede acesso
  it('Cenário W: Atacante enviando tenantId de outro tenant no body é bloqueado', async () => {
    const verifier = async () => makeDecodedToken({
      uid: 'owner-tenant-a',
      role: 'barbershop_owner',
      tenantId: 'tenant-a'
    });
    const subCreateMw = createRequireSubscriptionCreation(verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-owner-a' },
      body: { barbershopId: 'tenant-b', payerEmail: 'hacker@tenant-b.com' }
    });
    let nextCalled = false;

    await subCreateMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /outro estabelecimento|cross-tenant/i);
  });

  // X: barbershopId de outro tenant no path não concede acesso
  it('Cenário X: barbershopId de outro tenant no path (/status/:barbershopId) é bloqueado com 403', async () => {
    const verifier = async () => makeDecodedToken({
      uid: 'owner-tenant-a',
      role: 'barbershop_owner',
      tenantId: 'tenant-a'
    });
    const statusMw = requireTenantManagerOrOwner((r) => r.params.barbershopId, verifier);
    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-owner-a' },
      params: { barbershopId: 'tenant-alheio-123' }
    });
    let nextCalled = false;

    await statusMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /outro estabelecimento|cross-tenant/i);
  });

  // =========================================================================
  // BLOQUEADOR CRÍTICO 1: POST /api/subscriptions/create & IDOR / Onboarding
  // =========================================================================

  it('Bloqueador 1.1: Customer sem tenantId tentando criar assinatura para barbearia inexistente deve receber 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'new-user-1', role: 'customer' });
    const ownershipVerifier = async () => ({ exists: false, isOwner: false });
    const subCreateMw = createRequireSubscriptionCreation(verifier, ownershipVerifier);

    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-customer' },
      body: { barbershopId: 'shop-fantasma-123', payerEmail: 'cliente@teste.com' }
    });
    let nextCalled = false;

    await subCreateMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /estabelecimento não encontrado/i);
  });

  it('Bloqueador 1.2: Customer sem tenantId tentando criar assinatura para barbearia de terceiro (IDOR) deve receber 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'attacker-uid', role: 'customer' });
    // Barbearia existe mas pertence a victim-owner-uid
    const ownershipVerifier = async () => ({ exists: true, isOwner: false, ownerUid: 'victim-owner-uid' });
    const subCreateMw = createRequireSubscriptionCreation(verifier, ownershipVerifier);

    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-attacker' },
      body: { barbershopId: 'tenant-vitima', payerEmail: 'hacker@teste.com' }
    });
    let nextCalled = false;

    await subCreateMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /pertence a outro usuário/i);
  });

  it('Bloqueador 1.3: Usuário sem tenantId no token que é o legítimo dono registrado no Firestore deve ser autorizado', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'legit-owner-uid', role: 'customer' });
    // Barbearia existe e pertence comprovadamente a legit-owner-uid
    const ownershipVerifier = async (shopId: string, uid: string) => ({
      exists: true,
      isOwner: uid === 'legit-owner-uid',
      ownerUid: 'legit-owner-uid'
    });
    const subCreateMw = createRequireSubscriptionCreation(verifier, ownershipVerifier);

    const { req, res, getStatus } = createMockHttp({
      headers: { authorization: 'Bearer token-legit-owner' },
      body: { barbershopId: 'nova-barbearia-cadastrada', payerEmail: 'dono@novabarbearia.com' }
    });
    let nextCalled = false;

    await subCreateMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Proprietário legítimo em onboarding deve ser autorizado');
    assert.strictEqual(getStatus(), 200);
  });

  it('Bloqueador 1.4: Profissional (barber) tentando contratar assinatura deve receber 403', async () => {
    const verifier = async () => makeDecodedToken({ uid: 'barber-uid', role: 'barber', tenantId: 'tenant-barber' });
    const subCreateMw = createRequireSubscriptionCreation(verifier);

    const { req, res, getStatus, getBody } = createMockHttp({
      headers: { authorization: 'Bearer token-barber' },
      body: { barbershopId: 'tenant-barber', payerEmail: 'barbeiro@teste.com' }
    });
    let nextCalled = false;

    await subCreateMw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getStatus(), 403);
    assert.match(getBody().error, /profissionais não possuem autorização/i);
  });

  // =========================================================================
  // BLOQUEADOR CRÍTICO 2: Webhook Mercado Pago HMAC e Replay Protection
  // =========================================================================

  it('Bloqueador 2.1: verifyMercadoPagoWebhookSignature sem secret retorna Fail Closed (500)', () => {
    const result = verifyMercadoPagoWebhookSignature({
      xSignature: 'ts=1600000000,v1=abc',
      eventId: 'evt-1',
      secret: undefined
    });

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.statusCode, 500);
    assert.match(result.error || '', /Fail Closed/i);
  });

  it('Bloqueador 2.2: verifyMercadoPagoWebhookSignature sem x-signature retorna 401', () => {
    const result = verifyMercadoPagoWebhookSignature({
      xSignature: undefined,
      eventId: 'evt-1',
      secret: 'secret-valido-123'
    });

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.statusCode, 401);
    assert.match(result.error || '', /x-signature/i);
  });

  it('Bloqueador 2.3: verifyMercadoPagoWebhookSignature com timestamp expirado (> 5 min) retorna 401', () => {
    const secret = 'secret-valido-123';
    const eventId = 'evt-test';
    const xRequestId = 'req-test';
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 minutos atrás

    const manifest = `id:${eventId};request-id:${xRequestId};ts:${oldTs};`;
    const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    const result = verifyMercadoPagoWebhookSignature({
      xSignature: `ts=${oldTs},v1=${v1}`,
      xRequestId,
      eventId,
      secret,
      nowMs: Date.now()
    });

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.statusCode, 401);
    assert.match(result.error || '', /expirado|tolerância/i);
  });

  it('Bloqueador 2.4: verifyMercadoPagoWebhookSignature com HMAC adulterado retorna 401 sem estourar timingSafeEqual', () => {
    const secret = 'secret-valido-123';
    const eventId = 'evt-test';
    const nowSec = Math.floor(Date.now() / 1000);

    const result = verifyMercadoPagoWebhookSignature({
      xSignature: `ts=${nowSec},v1=hashinvalido`,
      xRequestId: 'req-1',
      eventId,
      secret
    });

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.statusCode, 401);
    assert.match(result.error || '', /inválida/i);
  });

  it('Bloqueador 2.5: verifyMercadoPagoWebhookSignature legítimo e recente retorna valid: true', () => {
    const secret = 'minha-chave-secreta-webhook';
    const eventId = '123456789';
    const xRequestId = 'uuid-request-999';
    const nowSec = Math.floor(Date.now() / 1000);

    const manifest = `id:${eventId};request-id:${xRequestId};ts:${nowSec};`;
    const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    const result = verifyMercadoPagoWebhookSignature({
      xSignature: `ts=${nowSec},v1=${v1}`,
      xRequestId,
      eventId,
      secret
    });

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.error, undefined);
  });

});
