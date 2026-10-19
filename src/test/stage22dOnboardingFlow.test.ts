import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  provisionManagerAccount,
  setUserRole,
  setMockFirebaseAdmin
} from '../server/firebaseAdmin.js';
import {
  requireSubscriptionCreation,
  requireSuperAdmin
} from '../server/authMiddleware.js';
import { sanitizeUserProfileForFirestore } from '../lib/authService.js';
import { User, Barbershop } from '../types/index.js';

function createInMemoryFirestore() {
  const collections = new Map<string, Map<string, any>>();
  const getCol = (name: string) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  };
  return {
    collection: (colName: string) => ({
      doc: (docId: string) => ({
        set: async (data: any, _options?: any) => {
          const col = getCol(colName);
          const current = col.get(docId) || {};
          col.set(docId, { ...current, ...data });
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
  let nextUid = 1000;
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
    getUserByEmail: async (email: string) => {
      for (const u of users.values()) {
        if (u.email === email) return { ...u, customClaims: claims.get(u.uid) };
      }
      const err: any = new Error('User not found');
      err.code = 'auth/user-not-found';
      throw err;
    },
    createUser: async (data: any) => {
      const uid = `auth-mgr-${nextUid++}`;
      const record = { uid, email: data.email, displayName: data.displayName, disabled: false };
      users.set(uid, record);
      return record;
    },
    setCustomUserClaims: async (uid: string, customClaims: any) => {
      claims.set(uid, customClaims);
    }
  };
}

setMockFirebaseAdmin({
  app: {} as any,
  auth: createInMemoryAuth() as any,
  firestore: createInMemoryFirestore() as any
});

describe('ETAPA 2.2D — Testes Automatizados do Fluxo Master Admin → Barbershop → Owner → Subscription', () => {

  it('FASE 1: provisionManagerAccount cria e retorna identidade Firebase Auth válida', async () => {
    const email = `novo-gestor-${Date.now()}@teste.com`;
    const manager = await provisionManagerAccount({
      email,
      displayName: 'Gestor Teste Silva',
      password: 'passwordSegura123'
    });

    assert.ok(manager.uid, 'UID soberano deve ser gerado pelo Firebase Auth');
    assert.strictEqual(manager.email, email, 'Email deve coincidir com o solicitado');
    assert.strictEqual(manager.displayName, 'Gestor Teste Silva', 'DisplayName deve coincidir');
  });

  it('FASE 1: provisionManagerAccount reutiliza conta existente sem duplicar e sem expor credenciais', async () => {
    const email = `gestor-reuso-${Date.now()}@teste.com`;
    const first = await provisionManagerAccount({
      email,
      displayName: 'Gestor Original'
    });

    const second = await provisionManagerAccount({
      email,
      displayName: 'Gestor Reutilizado'
    });

    assert.strictEqual(second.uid, first.uid, 'Deve retornar o mesmo UID do Firebase Auth');
    assert.strictEqual(second.email, email);
  });

  it('FASE 2: Barbershop suporta e vincula ownerUid oficial da identidade soberana', () => {
    const barbershop: Barbershop = {
      id: 'tenant-123456',
      ownerUid: 'uid-gestor-oficial-789',
      name: 'Barbearia VIP',
      slug: 'barbearia-vip',
      customDomain: 'www.barbeariavip.com.br',
      logoUrl: 'https://images.unsplash.com/photo-1',
      bannerUrl: 'https://images.unsplash.com/photo-2',
      salonImages: [],
      about: 'Barbearia de alto padrão',
      phone: '(11) 98888-7777',
      whatsapp: '(11) 98888-7777',
      address: {
        street: 'Rua das Flores',
        number: '123',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001-000'
      },
      socialMedia: { instagram: '@barbeariavip' },
      planId: 'plano-essencial',
      status: 'ATIVA',
      commercialMode: 'PAGO',
      reminderConfig: {
        advanceMinutes: 60,
        enabled: true,
        whatsappTemplate: 'Lembrete'
      },
      createdAt: new Date().toISOString()
    };

    assert.strictEqual(barbershop.ownerUid, 'uid-gestor-oficial-789', 'Barbershop deve preservar o campo ownerUid');
  });

  it('FASE 3: Atribuição de Custom Claims de barbershop_owner com tenantId soberano', async () => {
    const email = `proprietario-${Date.now()}@teste.com`;
    const tenantId = `tenant-${Date.now()}`;
    const userAuth = await provisionManagerAccount({
      email,
      displayName: 'Proprietário Chefe'
    });

    const roleResult = await setUserRole({
      targetUid: userAuth.uid,
      role: 'barbershop_owner',
      tenantId,
      actorUid: 'super-admin-uid-1',
      actorRole: 'super_admin'
    });

    assert.strictEqual(roleResult.success, true);
    assert.strictEqual(roleResult.claims?.role, 'barbershop_owner');
    assert.strictEqual(roleResult.claims?.tenantId, tenantId);
  });

  it('FASE 3: Usuários não-SuperAdmin não conseguem atribuir claim de barbershop_owner', async () => {
    const roleResult = await setUserRole({
      targetUid: 'alvo-uid-1',
      role: 'barbershop_owner',
      tenantId: 'tenant-qualquer',
      actorUid: 'gestor-uid-2',
      actorRole: 'barbershop_owner'
    });

    assert.strictEqual(roleResult.success, false);
    assert.match(roleResult.error || '', /Apenas Super Administradores/i);
  });

  it('FASE 4: Middleware requireSubscriptionCreation bloqueia criação não-autenticada', async () => {
    let statusCalled: number | null = null;
    let jsonBody: any = null;

    const mockReq: any = {
      headers: {},
      body: { barbershopId: 'tenant-test-1', payerEmail: 'test@example.com' }
    };
    const mockRes: any = {
      status: (code: number) => {
        statusCalled = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          }
        };
      }
    };
    let nextCalled = false;
    const mockNext = () => { nextCalled = true; };

    await requireSubscriptionCreation(mockReq, mockRes, mockNext);

    assert.strictEqual(statusCalled, 401, 'Deve retornar HTTP 401 para requisição sem token');
    assert.strictEqual(nextCalled, false, 'Next não deve ser invocado');
    assert.match(jsonBody?.error || '', /Autenticação obrigatória/i);
  });

  it('FASE 6: sanitizeUserProfileForFirestore expurga senhas e credenciais antes da persistência', () => {
    const rawUser: User = {
      id: 'user-gestor-1',
      uid: 'user-gestor-1',
      tenantId: 'tenant-abc',
      role: 'PROPRIETARIO',
      name: 'Gestor Teste',
      password: 'senhaExtremamenteSecreta123',
      email: 'gestor@barbearia.com',
      whatsapp: '(11) 98888-7777',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const sanitized = sanitizeUserProfileForFirestore(rawUser);

    assert.strictEqual((sanitized as any).password, undefined, 'Campo password não deve existir no objeto sanitizado');
    assert.strictEqual(sanitized.id, 'user-gestor-1');
    assert.strictEqual(sanitized.email, 'gestor@barbearia.com');
  });

  it('FASE 8: requireSuperAdmin bloqueia tentativas não autorizadas de provisionamento', async () => {
    let statusCalled: number | null = null;
    let jsonBody: any = null;

    const mockReq: any = {
      headers: { authorization: 'Bearer token-invalido' },
      body: { email: 'tentativa@hacker.com', tenantId: 'tenant-hacker' }
    };
    const mockRes: any = {
      status: (code: number) => {
        statusCalled = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          }
        };
      }
    };
    let nextCalled = false;
    const mockNext = () => { nextCalled = true; };

    await requireSuperAdmin(mockReq, mockRes, mockNext);

    assert.strictEqual(statusCalled, 401, 'Deve recusar token inválido com 401');
    assert.strictEqual(nextCalled, false);
  });

});
