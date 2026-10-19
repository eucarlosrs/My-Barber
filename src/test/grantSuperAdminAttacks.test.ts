import { describe, it } from 'node:test';
import assert from 'node:assert';
import { handleGrantSuperAdminRequest, grantSuperAdminExplicit, setMockFirebaseAdmin } from '../server/firebaseAdmin.js';
import { DecodedIdToken } from 'firebase-admin/auth';

function createInMemoryFirestore() {
  const collections = new Map<string, Map<string, any>>();
  const getCol = (name: string) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  };
  return {
    collection: (colName: string) => ({
      doc: (docId: string) => ({
        set: async (data: any, options?: any) => {
          const col = getCol(colName);
          const current = col.get(docId) || {};
          col.set(docId, options?.merge ? { ...current, ...data } : { ...data });
        },
        get: async () => {
          const col = getCol(colName);
          const data = col.get(docId);
          return { exists: !!data, data: () => data };
        }
      })
    })
  };
}

function createInMemoryAuth() {
  const users = new Map<string, any>();
  const claims = new Map<string, any>();
  return {
    getUser: async (uid: string) => {
      const u = users.get(uid);
      if (!u) {
        const err: any = new Error('User not found');
        err.code = 'auth/user-not-found';
        throw err;
      }
      return { ...u, customClaims: claims.get(uid) };
    },
    setCustomUserClaims: async (uid: string, customClaims: any) => {
      claims.set(uid, customClaims);
    }
  };
}

setMockFirebaseAdmin({
  app: { options: { projectId: 'gen-lang-client-0472481079' } } as any,
  auth: createInMemoryAuth() as any,
  firestore: createInMemoryFirestore() as any
});

describe('MY BARBER — Testes de Ataque contra o Endpoint /api/auth/grant-super-admin', () => {

  // Ataque 1: POST sem cabeçalho Authorization
  it('Ataque 1: POST sem cabeçalho Authorization deve ser rejeitado com 401', async () => {
    const response = await handleGrantSuperAdminRequest({
      headers: {},
      body: { targetUid: 'target-victim-1' }
    });

    assert.strictEqual(response.status, 401, 'Deve retornar HTTP 401');
    assert.match(response.body.error, /Bearer ausente ou inválido/i);
  });

  // Ataque 2: Enviar x-admin-setup-secret: qualquer_valor sem Firebase Token
  it('Ataque 2: Enviar x-admin-setup-secret: qualquer_valor sem token deve ser rejeitado com 401', async () => {
    const response = await handleGrantSuperAdminRequest({
      headers: {
        'x-admin-setup-secret': 'qualquer_valor_aleatorio_123'
      },
      body: { targetUid: 'target-victim-2' }
    });

    assert.strictEqual(response.status, 401, 'Segredo de header deve ser completamente desconsiderado');
    assert.match(response.body.error, /Bearer ausente ou inválido/i);
  });

  // Ataque 3: Enviar x-admin-setup-secret: valor_antigo sem Firebase Token
  it('Ataque 3: Enviar x-admin-setup-secret: valor_antigo sem token deve ser rejeitado com 401', async () => {
    const response = await handleGrantSuperAdminRequest({
      headers: {
        'x-admin-setup-secret': 'valor_antigo_de_setup'
      },
      body: { targetUid: 'target-victim-3' }
    });

    assert.strictEqual(response.status, 401, 'Header legado antigo não possui autoridade');
  });

  // Ataque 4: Enviar body com role="super_admin" e isSuperAdmin=true sem autorização administrativa
  it('Ataque 4: Body forjado com role=super_admin sem autorização deve ser rejeitado com 401', async () => {
    const response = await handleGrantSuperAdminRequest({
      headers: {},
      body: {
        targetUid: 'UID_ALVO',
        role: 'super_admin',
        isSuperAdmin: true
      }
    });

    assert.strictEqual(response.status, 401, 'Atributos no body são ignorados sem Bearer token');
  });

  // Ataque 5: Usuário customer autenticado tentando conceder super_admin
  it('Ataque 5: Usuário customer autenticado tentando conceder super_admin deve ser rejeitado com 403', async () => {
    const mockCustomerVerify = async (_token: string): Promise<DecodedIdToken | null> => ({
      uid: 'customer-uid-1',
      role: 'customer',
      aud: 'my-barber',
      auth_time: 1234567,
      exp: 1234567 + 3600,
      firebase: { identities: {}, sign_in_provider: 'password' },
      iat: 1234567,
      iss: 'firebase',
      sub: 'customer-uid-1'
    });

    const response = await handleGrantSuperAdminRequest(
      {
        headers: { authorization: 'Bearer valid-customer-token' },
        body: { targetUid: 'target-user-uid' }
      },
      mockCustomerVerify
    );

    assert.strictEqual(response.status, 403, 'Customer deve receber HTTP 403');
    assert.match(response.body.error, /Acesso negado|Apenas um Super Administrador/i);
  });

  // Ataque 6: Usuário barber autenticado tentando conceder super_admin
  it('Ataque 6: Usuário barber autenticado tentando conceder super_admin deve ser rejeitado com 403', async () => {
    const mockBarberVerify = async (_token: string): Promise<DecodedIdToken | null> => ({
      uid: 'barber-uid-1',
      role: 'barber',
      aud: 'my-barber',
      auth_time: 1234567,
      exp: 1234567 + 3600,
      firebase: { identities: {}, sign_in_provider: 'password' },
      iat: 1234567,
      iss: 'firebase',
      sub: 'barber-uid-1'
    });

    const response = await handleGrantSuperAdminRequest(
      {
        headers: { authorization: 'Bearer valid-barber-token' },
        body: { targetUid: 'target-user-uid' }
      },
      mockBarberVerify
    );

    assert.strictEqual(response.status, 403, 'Barbeiro deve receber HTTP 403');
    assert.match(response.body.error, /Acesso negado|Apenas um Super Administrador/i);
  });

  // Ataque 7: Usuário manager autenticado tentando conceder super_admin
  it('Ataque 7: Usuário manager autenticado tentando conceder super_admin deve ser rejeitado com 403', async () => {
    const mockManagerVerify = async (_token: string): Promise<DecodedIdToken | null> => ({
      uid: 'manager-uid-1',
      role: 'manager',
      aud: 'my-barber',
      auth_time: 1234567,
      exp: 1234567 + 3600,
      firebase: { identities: {}, sign_in_provider: 'password' },
      iat: 1234567,
      iss: 'firebase',
      sub: 'manager-uid-1'
    });

    const response = await handleGrantSuperAdminRequest(
      {
        headers: { authorization: 'Bearer valid-manager-token' },
        body: { targetUid: 'target-user-uid' }
      },
      mockManagerVerify
    );

    assert.strictEqual(response.status, 403, 'Gerente deve receber HTTP 403');
    assert.match(response.body.error, /Acesso negado|Apenas um Super Administrador/i);
  });

  // Ataque 8: Usuário owner autenticado tentando conceder super_admin
  it('Ataque 8: Usuário owner autenticado tentando conceder super_admin deve ser rejeitado com 403', async () => {
    const mockOwnerVerify = async (_token: string): Promise<DecodedIdToken | null> => ({
      uid: 'owner-uid-1',
      role: 'barbershop_owner',
      aud: 'my-barber',
      auth_time: 1234567,
      exp: 1234567 + 3600,
      firebase: { identities: {}, sign_in_provider: 'password' },
      iat: 1234567,
      iss: 'firebase',
      sub: 'owner-uid-1'
    });

    const response = await handleGrantSuperAdminRequest(
      {
        headers: { authorization: 'Bearer valid-owner-token' },
        body: { targetUid: 'target-user-uid' }
      },
      mockOwnerVerify
    );

    assert.strictEqual(response.status, 403, 'Proprietário de barbearia deve receber HTTP 403');
    assert.match(response.body.error, /Acesso negado|Apenas um Super Administrador/i);
  });

  // Ataque 9: Super Admin autenticado concedendo super_admin a um UID válido
  it('Ataque 9: Super Admin autenticado concedendo super_admin a um UID válido deve retornar 200 com sucesso', async () => {
    const mockSuperAdminVerify = async (_token: string): Promise<DecodedIdToken | null> => ({
      uid: 'super-admin-uid-real',
      role: 'super_admin',
      isSuperAdmin: true,
      aud: 'my-barber',
      auth_time: 1234567,
      exp: 1234567 + 3600,
      firebase: { identities: {}, sign_in_provider: 'password' },
      iat: 1234567,
      iss: 'firebase',
      sub: 'super-admin-uid-real'
    });

    const response = await handleGrantSuperAdminRequest(
      {
        headers: { authorization: 'Bearer valid-superadmin-token' },
        body: { targetUid: 'novo-super-admin-destinatario' }
      },
      mockSuperAdminVerify,
      grantSuperAdminExplicit
    );

    assert.strictEqual(response.status, 200, 'Super Admin deve ser aprovado com HTTP 200');
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.claims?.role, 'super_admin');
    assert.strictEqual(response.body.claims?.isSuperAdmin, true);
  });
});
