import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveTenantPlan,
  countActiveProfessionals,
  reserveProfessionalSeat,
  confirmProfessionalSeat,
  releaseProfessionalSeat,
  releaseProfessionalReservation,
  releaseActiveProfessionalSeat,
  encodeMemberKey
} from '../server/subscriptionEnforcement.js';
import { handleCreateProfessional, handleDeleteProfessional } from '../server/teamController.js';
import { setMockFirebaseAdmin } from '../server/firebaseAdmin.js';

// Helper de mock in-memory completo com suporte a runTransaction
function createInMemoryFirestore() {
  const collections = new Map<string, Map<string, any>>();

  function getCol(name: string) {
    if (!collections.has(name)) {
      collections.set(name, new Map<string, any>());
    }
    return collections.get(name)!;
  }

  function makeDocRef(colName: string, docId: string) {
    const col = getCol(colName);
    return {
      id: docId,
      get: async () => {
        const exists = col.has(docId);
        const data = exists ? JSON.parse(JSON.stringify(col.get(docId))) : undefined;
        return {
          id: docId,
          ref: makeDocRef(colName, docId),
          exists,
          data: () => data
        };
      },
      set: async (data: any, opts?: any) => {
        if (opts?.merge && col.has(docId)) {
          col.set(docId, { ...col.get(docId), ...JSON.parse(JSON.stringify(data)) });
        } else {
          col.set(docId, JSON.parse(JSON.stringify(data)));
        }
      },
      update: async (data: any) => {
        const existing = col.get(docId) || {};
        col.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      },
      delete: async () => {
        col.delete(docId);
      }
    };
  }

  let txQueue = Promise.resolve();

  return {
    runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
      // Simula a garantia de serialização/exclusão mútua do Firestore runTransaction
      const prev = txQueue;
      let resolver: () => void;
      txQueue = new Promise(res => { resolver = res; });
      await prev;
      try {
        const tx = {
          get: async (docRef: any) => docRef.get(),
          set: async (docRef: any, data: any, opts?: any) => docRef.set(data, opts),
          update: async (docRef: any, data: any) => docRef.update(data),
          delete: async (docRef: any) => docRef.delete()
        };
        return await updateFunction(tx);
      } finally {
        resolver!();
      }
    },
    collection: (colName: string) => {
      const col = getCol(colName);
      return {
        doc: (docId: string) => makeDocRef(colName, docId),
        where: (field: string, op: string, value: any) => {
          function filterDocs() {
            const matches: any[] = [];
            for (const [id, doc] of col.entries()) {
              if (op === '==' && doc[field] === value) {
                matches.push({
                  id,
                  ref: makeDocRef(colName, id),
                  data: () => JSON.parse(JSON.stringify(doc)),
                  exists: true
                });
              }
            }
            return matches;
          }
          return {
            limit: (_n: number) => ({
              get: async () => {
                const docs = filterDocs();
                return { empty: docs.length === 0, docs };
              }
            }),
            get: async () => {
              const docs = filterDocs();
              return { empty: docs.length === 0, docs };
            }
          };
        }
      };
    }
  };
}

function createInMemoryAuth() {
  const users = new Map<string, any>();
  const claims = new Map<string, any>();
  let nextUid = 3000;

  return {
    createUser: async (data: any) => {
      const uid = `auth-cap-${nextUid++}`;
      const record = { uid, email: data.email, displayName: data.displayName, disabled: false };
      users.set(uid, record);
      return record;
    },
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
    setCustomUserClaims: async (uid: string, customClaims: any) => {
      claims.set(uid, customClaims);
    },
    updateUser: async (uid: string, data: any) => {
      const u = users.get(uid) || { uid };
      users.set(uid, { ...u, ...data });
      return users.get(uid);
    },
    revokeRefreshTokens: async (uid: string) => {
      const u = users.get(uid) || { uid };
      u.tokensRevokedAt = Date.now();
    },
    deleteUser: async (uid: string) => {
      users.delete(uid);
      claims.delete(uid);
    }
  };
}

function createMockHttp(options: {
  actor?: any;
  params?: Record<string, string>;
  body?: Record<string, any>;
}) {
  let statusCode = 200;
  let responseBody: any = null;

  const req: any = {
    user: options.actor || { uid: 'actor-owner', role: 'barbershop_owner', tenantId: 'tenant-test' },
    params: options.params || {},
    body: options.body || {},
    id: `req-${Date.now()}`
  };

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (body: any) => {
      responseBody = body;
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

describe('FASE 4.10B — Enforcement Server-Side de maxProfessionals, Concorrência e Rules', () => {
  let mockFirestore: any;
  let mockAuth: any;

  beforeEach(() => {
    mockFirestore = createInMemoryFirestore();
    mockAuth = createInMemoryAuth();
    setMockFirebaseAdmin({
      app: {} as any,
      auth: mockAuth as any,
      firestore: mockFirestore as any
    });
  });

  // ==========================================
  // BLOCO 1: Entitlement & Contagem Canônica
  // ==========================================
  describe('1. Resolução Canônica de Entitlement e Contagem (Fail-Closed)', () => {
    it('1.1. Resolve plano a partir de subscriptions/sub-{tenantId}', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-1').set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      const entitlement = await resolveTenantPlan('tenant-1', mockFirestore);
      assert.strictEqual(entitlement.resolved, true);
      assert.strictEqual(entitlement.planId, 'plano-profissional');
      assert.strictEqual(entitlement.maxProfessionals, 5);
    });

    it('1.2. Fallback para barbershops/{tenantId} quando não há subscription', async () => {
      await mockFirestore.collection('barbershops').doc('tenant-2').set({
        id: 'tenant-2',
        name: 'Barbearia Sem Sub',
        planId: 'plano-premium'
      });

      const entitlement = await resolveTenantPlan('tenant-2', mockFirestore);
      assert.strictEqual(entitlement.resolved, true);
      assert.strictEqual(entitlement.planId, 'plano-premium');
      assert.strictEqual(entitlement.maxProfessionals, 10);
    });

    it('1.3. Preserva UNLIMITED literalmente quando configurado no plano customizado', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-unlimited').set({
        planId: 'plano-enterprise',
        customPlan: {
          limits: { maxProfessionals: 'UNLIMITED' }
        },
        status: 'ACTIVE'
      });

      const entitlement = await resolveTenantPlan('tenant-unlimited', mockFirestore);
      assert.strictEqual(entitlement.resolved, true);
      assert.strictEqual(entitlement.maxProfessionals, 'UNLIMITED');
    });

    it('1.4. Fail-closed: tenant inexistente retorna resolved: false com TENANT_NOT_FOUND', async () => {
      const entitlement = await resolveTenantPlan('tenant-nao-existe', mockFirestore);
      assert.strictEqual(entitlement.resolved, false);
      assert.strictEqual(entitlement.code, 'TENANT_NOT_FOUND');
    });

    it('1.5. Fail-closed: tenant sem planId configurado retorna PLAN_NOT_CONFIGURED', async () => {
      await mockFirestore.collection('barbershops').doc('tenant-sem-plano').set({
        id: 'tenant-sem-plano',
        name: 'Barbearia Sem Plano'
      });

      const entitlement = await resolveTenantPlan('tenant-sem-plano', mockFirestore);
      assert.strictEqual(entitlement.resolved, false);
      assert.strictEqual(entitlement.code, 'PLAN_NOT_CONFIGURED');
    });

    it('1.6. Fail-closed: planId desconhecido no catálogo e sem alias retorna PLAN_NOT_FOUND', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-desconhecido').set({
        planId: 'plano-inexistente-xyz',
        status: 'ACTIVE'
      });

      const entitlement = await resolveTenantPlan('tenant-desconhecido', mockFirestore);
      assert.strictEqual(entitlement.resolved, false);
      assert.strictEqual(entitlement.code, 'PLAN_NOT_FOUND');
    });

    it('1.7. Fail-closed: customPlan com maxProfessionals negativo retorna INVALID_CAPACITY_LIMIT', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-negativo').set({
        planId: 'plano-custom',
        customPlan: { limits: { maxProfessionals: -2 } },
        status: 'ACTIVE'
      });

      const entitlement = await resolveTenantPlan('tenant-negativo', mockFirestore);
      assert.strictEqual(entitlement.resolved, false);
      assert.strictEqual(entitlement.code, 'INVALID_CAPACITY_LIMIT');
    });

    it('1.8. Fail-closed: customPlan com Infinity retorna INVALID_CAPACITY_LIMIT', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-inf').set({
        planId: 'plano-custom',
        customPlan: { limits: { maxProfessionals: Infinity } },
        status: 'ACTIVE'
      });

      const entitlement = await resolveTenantPlan('tenant-inf', mockFirestore);
      assert.strictEqual(entitlement.resolved, false);
      assert.strictEqual(entitlement.code, 'INVALID_CAPACITY_LIMIT');
    });

    it('1.9. Fail-closed: customPlan com valor não numérico/NaN retorna INVALID_CAPACITY_LIMIT', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-nan').set({
        planId: 'plano-custom',
        customPlan: { limits: { maxProfessionals: 'INVALID_STRING' } },
        status: 'ACTIVE'
      });

      const entitlement = await resolveTenantPlan('tenant-nan', mockFirestore);
      assert.strictEqual(entitlement.resolved, false);
      assert.strictEqual(entitlement.code, 'INVALID_CAPACITY_LIMIT');
    });

    it('1.10. customPlan com limite zero é aceito como válido com 0 vagas', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-zero').set({
        planId: 'plano-custom',
        customPlan: { limits: { maxProfessionals: 0 } },
        status: 'ACTIVE'
      });

      const entitlement = await resolveTenantPlan('tenant-zero', mockFirestore);
      assert.strictEqual(entitlement.resolved, true);
      assert.strictEqual(entitlement.maxProfessionals, 0);
    });

    it('1.11. Contagem considera apenas profissionais ativos (exclui inactive, owner, manager, cliente)', async () => {
      const tenant = 'tenant-count-test';
      // 2 profissionais ativos
      await mockFirestore.collection('users').doc('p1').set({ tenantId: tenant, role: 'PROFISSIONAL', status: 'active' });
      await mockFirestore.collection('users').doc('p2').set({ tenantId: tenant, canonicalRole: 'barber', status: 'active' });
      // 1 profissional inativo (não deve contar)
      await mockFirestore.collection('users').doc('p3').set({ tenantId: tenant, role: 'PROFISSIONAL', status: 'inactive' });
      // 1 proprietário (não deve contar)
      await mockFirestore.collection('users').doc('owner').set({ tenantId: tenant, role: 'PROPRIETARIO', status: 'active' });
      // 1 gerente (não deve contar)
      await mockFirestore.collection('users').doc('mgr').set({ tenantId: tenant, role: 'GERENTE', status: 'active' });
      // 1 cliente (não deve contar)
      await mockFirestore.collection('users').doc('cli').set({ tenantId: tenant, role: 'CLIENTE', status: 'active' });

      const count = await countActiveProfessionals(tenant, mockFirestore);
      assert.strictEqual(count, 2, 'Apenas os 2 profissionais ativos devem ser contados');
    });
  });

  // ==========================================
  // BLOCO 2: Capacidade, Criação e Idempotência
  // ==========================================
  describe('2. Criação, Limite e Idempotência no teamController', () => {
    it('2.1. Criação permitida abaixo do limite do plano (plano-essencial, limite 1)', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-alpha').set({
        planId: 'plano-essencial',
        status: 'ACTIVE'
      });

      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: 'tenant-alpha' },
        body: { name: 'Barbeiro 1', email: 'b1@alpha.com' }
      });

      await handleCreateProfessional(req, res);
      assert.strictEqual(getStatus(), 201);
      assert.strictEqual(getBody().success, true);
    });

    it('2.2. Criação rejeitada com 409 quando limite atingido (plano-essencial já possui 1 ativo)', async () => {
      const tenant = 'tenant-limited';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-essencial',
        status: 'ACTIVE'
      });
      // Popula 1 profissional ativo pré-existente
      await mockFirestore.collection('users').doc('prof-existing').set({
        id: 'prof-existing',
        tenantId: tenant,
        role: 'PROFISSIONAL',
        status: 'active',
        name: 'Barbeiro Anterior'
      });

      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Barbeiro Excedente', email: 'excedente@limited.com' }
      });

      await handleCreateProfessional(req, res);
      assert.strictEqual(getStatus(), 409);
      assert.strictEqual(getBody().code, 'PROFESSIONAL_LIMIT_REACHED');
      assert.match(getBody().error, /limite de profissionais do plano atingido/i);
    });

    it('2.3. Fail-closed: Criação rejeitada com 403 se tenant inexistente (sem Auth/Firestore criado)', async () => {
      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-ghost', role: 'barbershop_owner', tenantId: 'tenant-fantasma-inexistente' },
        body: { name: 'Barbeiro Fantasma', email: 'ghost@test.com' }
      });

      await handleCreateProfessional(req, res);
      assert.strictEqual(getStatus(), 403);
      assert.strictEqual(getBody().code, 'TENANT_NOT_FOUND');
    });

    it('2.4. Fail-closed: Criação rejeitada com 403 se plano desconhecido no catálogo', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-plano-invalido').set({
        planId: 'plano-inexistente-total',
        status: 'ACTIVE'
      });

      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: 'tenant-plano-invalido' },
        body: { name: 'Barbeiro Inv', email: 'inv@test.com' }
      });

      await handleCreateProfessional(req, res);
      assert.strictEqual(getStatus(), 403);
      assert.strictEqual(getBody().code, 'PLAN_NOT_FOUND');
    });

    it('2.5. Criação permitida para plano UNLIMITED sem restrição de teto', async () => {
      const tenant = 'tenant-unl';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-custom',
        customPlan: { limits: { maxProfessionals: 'UNLIMITED' } },
        status: 'ACTIVE'
      });

      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Barbeiro Ilimitado', email: 'unl@test.com' }
      });

      await handleCreateProfessional(req, res);
      assert.strictEqual(getStatus(), 201);
      assert.strictEqual(getBody().success, true);
    });

    it('2.6. Retry idempotente de usuário já ACTIVE no mesmo tenant não consome nova vaga', async () => {
      const tenant = 'tenant-retry';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-essencial',
        status: 'ACTIVE'
      });

      // Cria a 1ª vez (atinge 1/1)
      const http1 = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Barbeiro Retry', email: 'retry@test.com' }
      });
      await handleCreateProfessional(http1.req, http1.res);
      assert.strictEqual(http1.getStatus(), 201);

      // Retry da mesma criação (mesmo e-mail) não deve ser barrado por 409
      const http2 = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Barbeiro Retry', email: 'retry@test.com' }
      });
      await handleCreateProfessional(http2.req, http2.res);
      assert.strictEqual(http2.getStatus(), 201, 'Retry deve retornar 201 idempotente');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1, 'activeCount não pode duplicar em retry');
    });
  });

  // ==========================================
  // BLOCO 3: Reativação, Desativação e Compensação
  // ==========================================
  describe('3. Reativação, Desativação e Compensação de Vagas', () => {
    it('3.1. Desativação (handleDeleteProfessional) libera vaga no contador', async () => {
      const tenant = 'tenant-delete-test';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-essencial',
        status: 'ACTIVE'
      });

      // Cria 1 profissional (ocupa 1/1)
      const createHttp = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Para Deletar', email: 'del@test.com' }
      });
      await handleCreateProfessional(createHttp.req, createHttp.res);
      assert.strictEqual(createHttp.getStatus(), 201);
      const createdId = createHttp.getBody().user.id;

      // Inativação (soft delete)
      const deleteHttp = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        params: { id: createdId }
      });
      await handleDeleteProfessional(deleteHttp.req, deleteHttp.res);
      assert.strictEqual(deleteHttp.getStatus(), 200);

      // Agora nova criação DEVE ser permitida, pois a vaga foi liberada
      const newCreateHttp = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Novo Barbeiro Substituto', email: 'substituto@test.com' }
      });
      await handleCreateProfessional(newCreateHttp.req, newCreateHttp.res);
      assert.strictEqual(newCreateHttp.getStatus(), 201, 'Vaga liberada deve permitir novo cadastro');
    });

    it('3.2. Reativação de profissional inactive consome vaga e é barrada se no limite', async () => {
      const tenant = 'tenant-reactivate';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-essencial',
        status: 'ACTIVE'
      });

      // Cadastra profissional 1 e inativa-o
      const c1 = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Prof 1', email: 'prof1@test.com' }
      });
      await handleCreateProfessional(c1.req, c1.res);
      const p1Id = c1.getBody().user.id;
      const d1 = createMockHttp({ actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant }, params: { id: p1Id } });
      await handleDeleteProfessional(d1.req, d1.res);

      // Cadastra profissional 2 (agora o tenant tem 1 ativo e 1 inativo; limite 1 atingido)
      const c2 = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Prof 2', email: 'prof2@test.com' }
      });
      await handleCreateProfessional(c2.req, c2.res);
      assert.strictEqual(c2.getStatus(), 201);

      // Tentativa de reativar o Prof 1 (submetendo o mesmo e-mail) deve ser REJEITADA por limite
      const reactivateHttp = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Prof 1 Reativo', email: 'prof1@test.com' }
      });
      await handleCreateProfessional(reactivateHttp.req, reactivateHttp.res);
      assert.strictEqual(reactivateHttp.getStatus(), 409, 'Reativação no limite deve ser rejeitada com 409');
    });

    it('3.3. Dupla exclusão (inactive -> inactive) não decrementa duas vezes', async () => {
      const tenant = 'tenant-double-del';
      await mockFirestore.collection('tenant_capacity').doc(tenant).set({
        activeCount: 0,
        maxProfessionals: 1
      });
      await mockFirestore.collection('users').doc('already-inactive').set({
        id: 'already-inactive',
        tenantId: tenant,
        role: 'PROFISSIONAL',
        status: 'inactive',
        email: 'already@test.com'
      });

      const delHttp = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        params: { id: 'already-inactive' }
      });
      await handleDeleteProfessional(delHttp.req, delHttp.res);
      assert.strictEqual(delHttp.getStatus(), 200);

      const capSnap = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capSnap.data().activeCount, 0, 'activeCount não pode ficar negativo');
    });

    it('3.4. Falha no provisionamento após reserva compensa e libera a vaga', async () => {
      const tenant = 'tenant-fail-comp';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-essencial',
        status: 'ACTIVE'
      });

      // Simula falha forçada no Auth durante provisionamento
      const originalCreateUser = mockAuth.createUser;
      mockAuth.createUser = async () => {
        throw new Error('Falha simulada de comunicação com Firebase Auth');
      };

      const failHttp = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Prof Falha', email: 'fail@test.com' }
      });
      await handleCreateProfessional(failHttp.req, failHttp.res);
      assert.strictEqual(failHttp.getStatus(), 500);

      // Restaura método
      mockAuth.createUser = originalCreateUser;

      // Confirma que a vaga foi liberada e não ficou consumida
      const capSnap = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capSnap.data()?.activeCount || 0, 0, 'Vaga reservada deve ser compensada e zerada após falha');
    });

    it('3.5. Reativação de Auth preexistente com falha posterior NUNCA deleta a conta Auth', async () => {
      const tenant = 'tenant-auth-protect';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      // Cria conta Auth pré-existente
      const preExistingAuth = await mockAuth.createUser({ email: 'protect@test.com', displayName: 'Preexistente' });
      await mockFirestore.collection('users').doc(preExistingAuth.uid).set({
        id: preExistingAuth.uid,
        uid: preExistingAuth.uid,
        tenantId: tenant,
        role: 'PROFISSIONAL',
        status: 'inactive',
        email: 'protect@test.com'
      });

      // Simula falha ao gravar claims
      const originalSetClaims = mockAuth.setCustomUserClaims;
      mockAuth.setCustomUserClaims = async () => {
        throw new Error('Falha ao definir claims');
      };

      const reactivateFailHttp = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Preexistente Reativar', email: 'protect@test.com' }
      });
      await handleCreateProfessional(reactivateFailHttp.req, reactivateFailHttp.res);
      assert.strictEqual(reactivateFailHttp.getStatus(), 500);

      mockAuth.setCustomUserClaims = originalSetClaims;

      // Confirma que a conta Auth NÃO foi deletada
      const authUserAfter = await mockAuth.getUser(preExistingAuth.uid);
      assert.ok(authUserAfter, 'Conta Auth pré-existente JAMAIS deve ser deletada por compensação');
    });
  });

  // ==========================================
  // BLOCO 4: Concorrência e Deduplicação por Identidade
  // ==========================================
  describe('4. Concorrência e Deduplicação por Identidade Profissional', () => {
    it('4.1. Duas requisições simultâneas para o MESMO e-mail: activeCount aumenta exatamente 1', async () => {
      const tenant = 'tenant-same-email-race';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional', // Limite: 5
        status: 'ACTIVE'
      });

      const httpA = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Barbeiro Concorrente', email: 'same@test.com' }
      });
      const httpB = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Barbeiro Concorrente', email: 'same@test.com' }
      });

      // Dispara as duas requisições simultaneamente
      await Promise.all([
        handleCreateProfessional(httpA.req, httpA.res),
        handleCreateProfessional(httpB.req, httpB.res)
      ]);

      const statuses = [httpA.getStatus(), httpB.getStatus()].sort();
      assert.deepStrictEqual(statuses, [201, 409], 'Uma request conclui com 201 e a concorrente recebe 409 PROFESSIONAL_CREATION_IN_PROGRESS');

      const failedBody = httpA.getStatus() === 409 ? httpA.getBody() : httpB.getBody();
      assert.strictEqual(failedBody.code, 'PROFESSIONAL_CREATION_IN_PROGRESS');

      // Invariante essencial: activeCount deve ser exatamente 1 (no máximo 1 vaga consumida)
      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1, 'activeCount final deve ser exatamente 1');

      // Apenas um documento de usuário no Firestore com esse email
      const userSnaps = await mockFirestore.collection('users').where('tenantId', '==', tenant).get();
      const profsWithEmail = userSnaps.docs.filter((d: any) => d.data().email === 'same@test.com');
      assert.strictEqual(profsWithEmail.length, 1, 'Deve existir exatamente 1 usuário físico persistido');
    });

    it('4.2. Duas reativações simultâneas para o MESMO e-mail inativo: activeCount aumenta no máximo 1', async () => {
      const tenant = 'tenant-reactivate-race';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional', // Limite: 5
        status: 'ACTIVE'
      });

      // Cadastra e inativa o profissional inicialmente
      const setupHttp = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Prof Para Reativar', email: 'react-race@test.com' }
      });
      await handleCreateProfessional(setupHttp.req, setupHttp.res);
      const profId = setupHttp.getBody().user.id;

      const delHttp = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        params: { id: profId }
      });
      await handleDeleteProfessional(delHttp.req, delHttp.res);

      const capAfterDel = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capAfterDel.data().activeCount, 0, 'activeCount zerado após exclusão');

      // Duas requisições de reativação simultâneas
      const r1 = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Prof Reativado', email: 'react-race@test.com' }
      });
      const r2 = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Prof Reativado', email: 'react-race@test.com' }
      });

      await Promise.all([
        handleCreateProfessional(r1.req, r1.res),
        handleCreateProfessional(r2.req, r2.res)
      ]);

      const reStatuses = [r1.getStatus(), r2.getStatus()].sort();
      assert.deepStrictEqual(reStatuses, [201, 409], 'Uma reativação conclui com 201 e a concorrente recebe 409');

      const capFinal = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capFinal.data().activeCount, 1, 'Reativação concorrente deve resultar em activeCount = 1');
    });

    it('4.3. Duas requisições simultâneas para e-mails DIFERENTES disputando última vaga: exatamente UMA reserva e uma falha', async () => {
      const tenant = 'tenant-diff-email-race';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-essencial', // Limite: 1
        status: 'ACTIVE'
      });

      const httpFoo = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Barbeiro Foo', email: 'foo@test.com' }
      });
      const httpBar = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Barbeiro Bar', email: 'bar@test.com' }
      });

      // Dispara 2 criações com e-mails diferentes simultaneamente
      await Promise.all([
        handleCreateProfessional(httpFoo.req, httpFoo.res),
        handleCreateProfessional(httpBar.req, httpBar.res)
      ]);

      const statuses = [httpFoo.getStatus(), httpBar.getStatus()].sort();
      assert.deepStrictEqual(statuses, [201, 409], 'Exatamente um 201 Created e um 409 Conflict');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1, 'activeCount final deve ser exatamente 1');
    });
  });

  // ==========================================
  // BLOCO 5: Governança, Super Admin e Tenant Isolation
  // ==========================================
  describe('5. Governança e Regras de Negócio', () => {
    it('5.1. Super Admin também respeita o limite do plano para o tenant alvo', async () => {
      const tenant = 'tenant-super-admin-target';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-essencial', // Limite: 1
        status: 'ACTIVE'
      });
      await mockFirestore.collection('users').doc('p-exists').set({
        id: 'p-exists',
        tenantId: tenant,
        role: 'PROFISSIONAL',
        status: 'active'
      });

      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'superadmin-1', role: 'super_admin', isSuperAdmin: true },
        body: {
          tenantId: tenant,
          name: 'Prof Cadastrado pelo Super Admin',
          email: 'sa-prof@test.com'
        }
      });

      await handleCreateProfessional(req, res);
      assert.strictEqual(getStatus(), 409, 'Super Admin deve respeitar limite contratado do tenant');
      assert.strictEqual(getBody().code, 'PROFESSIONAL_LIMIT_REACHED');
    });

    it('5.2. Assinatura SUSPENDED ou CANCELED continua bloqueada', async () => {
      const tenant = 'tenant-suspended';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'SUSPENDED'
      });

      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: tenant },
        body: { name: 'Barbeiro Bloqueado', email: 'bloq@test.com' }
      });

      await handleCreateProfessional(req, res);
      assert.strictEqual(getStatus(), 402);
      assert.strictEqual(getBody().subscriptionStatus, 'SUSPENDED');
    });

    it('5.3. Isolamento Multi-Tenant: tenant A atingir limite não impede criação no tenant B', async () => {
      const tenantA = 'tenant-isolation-a';
      const tenantB = 'tenant-isolation-b';

      await mockFirestore.collection('subscriptions').doc(`sub-${tenantA}`).set({
        planId: 'plano-essencial', // Limite: 1
        status: 'ACTIVE'
      });
      await mockFirestore.collection('subscriptions').doc(`sub-${tenantB}`).set({
        planId: 'plano-essencial', // Limite: 1
        status: 'ACTIVE'
      });

      // Tenant A atinge limite (1/1)
      const httpA = createMockHttp({
        actor: { uid: 'owner-a', role: 'barbershop_owner', tenantId: tenantA },
        body: { name: 'Prof A', email: 'profa@test.com' }
      });
      await handleCreateProfessional(httpA.req, httpA.res);
      assert.strictEqual(httpA.getStatus(), 201);

      // Tenant B cria seu profissional com sucesso
      const httpB = createMockHttp({
        actor: { uid: 'owner-b', role: 'barbershop_owner', tenantId: tenantB },
        body: { name: 'Prof B', email: 'profb@test.com' }
      });
      await handleCreateProfessional(httpB.req, httpB.res);
      assert.strictEqual(httpB.getStatus(), 201, 'Tenant B deve criar com sucesso independente de Tenant A');
    });
  });

  // ==========================================
  // BLOCO 6: Firestore Rules Evaluator Estático & Lógico
  // ==========================================
  describe('6. Validação das Firestore Rules (users & tenant_capacity)', () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    it('6.1. CREATE direto em /users não permite mais isManagerOrOwnerOfTenant para profissional', () => {
      const usersMatch = rulesContent.match(/match\s+\/users\/\{userId\}\s*\{([\s\S]*?)\n\s{4}\}/);
      assert.ok(usersMatch, 'Bloco match /users/{userId} deve existir');
      const usersBlock = usersMatch[1];

      // Extrai bloco allow create
      const createMatch = usersBlock.match(/allow\s+create\s*:\s*if\s*([\s\S]*?);/);
      assert.ok(createMatch, 'allow create deve existir em /users');
      const createRule = createMatch[1];

      assert.strictEqual(
        createRule.includes('isManagerOrOwnerOfTenant'),
        false,
        'isManagerOrOwnerOfTenant NÃO deve estar no allow create de /users'
      );
      assert.ok(createRule.includes('isSuperAdmin()'), 'Super Admin deve ser permitido no allow create');
    });

    it('6.2. UPDATE em /users impede gestor de reativar profissional (inactive -> active)', () => {
      const usersMatch = rulesContent.match(/match\s+\/users\/\{userId\}\s*\{([\s\S]*?)\n\s{4}\}/);
      assert.ok(usersMatch);
      const usersBlock = usersMatch[1];

      const updateMatch = usersBlock.match(/allow\s+update\s*:\s*if\s*([\s\S]*?);/);
      assert.ok(updateMatch);
      const updateRule = updateMatch[1];

      assert.match(
        updateRule,
        /!\(resource\.data\.status\s*==\s*'inactive'\s*&&\s*request\.resource\.data\.status\s*==\s*'active'\)/,
        'Rule deve bloquear reativação direta de inactive -> active por gestores'
      );
      assert.match(updateRule, /request\.resource\.data\.tenantId\s*==\s*resource\.data\.tenantId/, 'tenantId deve ser imutável no update');
      assert.match(updateRule, /request\.resource\.data\.role\s*==\s*resource\.data\.role/, 'role deve ser imutável no update');
    });

    it('6.3. Coleção tenant_capacity é estritamente fechada para Client SDK', () => {
      const capMatch = rulesContent.match(/match\s+\/tenant_capacity\/\{tenantId\}\s*\{\s*allow\s+read,\s*write\s*:\s*if\s*false\s*;\s*\}/);
      assert.ok(capMatch, 'tenant_capacity deve estar fechada com allow read, write: if false');
    });
  });

  // ==========================================
  // BLOCO 7: Ownership Transacional, Máquina de Estados e Interleavings A/C (FASE 4.10B.4)
  // ==========================================
  describe('7. Ownership Transacional, Máquina de Estados e Interleavings A/C', () => {
    it('7.1. Owner A reserva assento (status RESERVED, activeCount +1)', async () => {
      const tenant = 'tenant-owner-a';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      const resA = await reserveProfessionalSeat(tenant, {
        email: 'prof-a@test.com',
        reservationId: 'res-uuid-a',
        firestoreOverride: mockFirestore
      });

      assert.strictEqual(resA.allowed, true);
      assert.strictEqual(resA.reserved, true);
      assert.strictEqual(resA.currentCount, 1);
      assert.strictEqual(resA.reservationId, 'res-uuid-a');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1);
    });

    it('7.2. Owner B não pode assumir RESERVED de A (retorna 409 PROFESSIONAL_CREATION_IN_PROGRESS)', async () => {
      const tenant = 'tenant-owner-b-block';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      // A reserva com seu token
      await reserveProfessionalSeat(tenant, {
        email: 'prof-b@test.com',
        reservationId: 'token-a',
        firestoreOverride: mockFirestore
      });

      // B tenta a mesma identidade com token diferente
      const resB = await reserveProfessionalSeat(tenant, {
        email: 'prof-b@test.com',
        reservationId: 'token-b',
        firestoreOverride: mockFirestore
      });

      assert.strictEqual(resB.allowed, false);
      assert.strictEqual(resB.statusCode, 409);
      assert.strictEqual(resB.code, 'PROFESSIONAL_CREATION_IN_PROGRESS');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1, 'activeCount não deve alterar');
    });

    it('7.3. Owner B não pode confirmar reserva de A (confirm retorna RESERVATION_OWNER_MISMATCH)', async () => {
      const tenant = 'tenant-confirm-mismatch';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      await reserveProfessionalSeat(tenant, {
        email: 'prof-c@test.com',
        reservationId: 'token-a',
        firestoreOverride: mockFirestore
      });

      const confirmResult = await confirmProfessionalSeat(tenant, 'prof-c@test.com', 'token-b', mockFirestore);
      assert.strictEqual(confirmResult.confirmed, false);
      assert.strictEqual(confirmResult.reason, 'RESERVATION_OWNER_MISMATCH');
    });

    it('7.4. Owner B não pode liberar reserva de A (release retorna RESERVATION_OWNER_MISMATCH)', async () => {
      const tenant = 'tenant-release-mismatch';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      await reserveProfessionalSeat(tenant, {
        email: 'prof-d@test.com',
        reservationId: 'token-a',
        firestoreOverride: mockFirestore
      });

      const releaseResult = await releaseProfessionalReservation(tenant, 'prof-d@test.com', 'token-b', mockFirestore);
      assert.strictEqual(releaseResult.released, false);
      assert.strictEqual(releaseResult.reason, 'RESERVATION_OWNER_MISMATCH');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1, 'activeCount não deve ser liberado por terceiro');
    });

    it('7.5. Owner A confirma ACTIVE com sucesso (status ACTIVE, activeCount inalterado)', async () => {
      const tenant = 'tenant-confirm-success';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      await reserveProfessionalSeat(tenant, {
        email: 'prof-e@test.com',
        reservationId: 'token-a',
        firestoreOverride: mockFirestore
      });

      const confirmResult = await confirmProfessionalSeat(tenant, 'prof-e@test.com', 'token-a', mockFirestore);
      assert.strictEqual(confirmResult.confirmed, true);

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1);
    });

    it('7.6. Release tardio de A após ACTIVE não decrementa nem inativa (retorna ALREADY_ACTIVE)', async () => {
      const tenant = 'tenant-interleaving-a-protect';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      // A reserva
      await reserveProfessionalSeat(tenant, {
        email: 'prof-f@test.com',
        reservationId: 'token-a',
        firestoreOverride: mockFirestore
      });

      // Confirmação para ACTIVE
      await confirmProfessionalSeat(tenant, 'prof-f@test.com', 'token-a', mockFirestore);

      // Release tardio simulando rollback de transação que falhou tardiamente
      const releaseResult = await releaseProfessionalReservation(tenant, 'prof-f@test.com', 'token-a', mockFirestore);
      assert.strictEqual(releaseResult.released, false);
      assert.strictEqual(releaseResult.reason, 'ALREADY_ACTIVE');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1, 'activeCount JAMAIS pode cair para 0 após membro já ativo');
    });

    it('7.7. Owner A libera RESERVED próprio corretamente (status INACTIVE, activeCount decrementa)', async () => {
      const tenant = 'tenant-release-own';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      await reserveProfessionalSeat(tenant, {
        email: 'prof-g@test.com',
        reservationId: 'token-a',
        firestoreOverride: mockFirestore
      });

      const releaseResult = await releaseProfessionalReservation(tenant, 'prof-g@test.com', 'token-a', mockFirestore);
      assert.strictEqual(releaseResult.released, true);

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 0);
    });

    it('7.8. Confirm em INACTIVE sem reserva válida é rejeitado/no-op seguro (MEMBER_INACTIVE)', async () => {
      const tenant = 'tenant-confirm-inactive';
      await mockFirestore.collection('tenant_capacity').doc(tenant).set({
        activeCount: 0,
        maxProfessionals: 5,
        members: {
          [encodeMemberKey('inactive@test.com')]: { email: 'inactive@test.com', status: 'INACTIVE', updatedAt: new Date().toISOString() }
        }
      });

      const result = await confirmProfessionalSeat(tenant, 'inactive@test.com', 'some-token', mockFirestore);
      assert.strictEqual(result.confirmed, false);
      assert.strictEqual(result.reason, 'MEMBER_INACTIVE');
    });

    it('7.9. Confirm em member inexistente não cria ACTIVE fantasma (MEMBER_NOT_FOUND)', async () => {
      const tenant = 'tenant-confirm-not-found';
      await mockFirestore.collection('tenant_capacity').doc(tenant).set({
        activeCount: 0,
        maxProfessionals: 5,
        members: {}
      });

      const result = await confirmProfessionalSeat(tenant, 'ghost@test.com', 'some-token', mockFirestore);
      assert.strictEqual(result.confirmed, false);
      assert.strictEqual(result.reason, 'MEMBER_NOT_FOUND');
    });

    it('7.10. Soft-delete de profissional ACTIVE decrementa exatamente uma vez (releaseActiveProfessionalSeat)', async () => {
      const tenant = 'tenant-soft-del';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      // Cria profissional ativo
      await reserveProfessionalSeat(tenant, { email: 'active@test.com', reservationId: 'tok-1', firestoreOverride: mockFirestore });
      await confirmProfessionalSeat(tenant, 'active@test.com', 'tok-1', mockFirestore);

      const capBefore = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capBefore.data().activeCount, 1);

      // Soft delete
      const delResult = await releaseActiveProfessionalSeat(tenant, 'active@test.com', mockFirestore);
      assert.strictEqual(delResult.released, true);

      const capAfter = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capAfter.data().activeCount, 0);
    });

    it('7.11. Soft-delete repetido (já INACTIVE) decrementa zero (proteção contra duplo decremento)', async () => {
      const tenant = 'tenant-repeat-soft-del';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      await reserveProfessionalSeat(tenant, { email: 'repeat@test.com', reservationId: 'tok-1', firestoreOverride: mockFirestore });
      await confirmProfessionalSeat(tenant, 'repeat@test.com', 'tok-1', mockFirestore);

      // 1ª exclusão
      await releaseActiveProfessionalSeat(tenant, 'repeat@test.com', mockFirestore);
      // 2ª exclusão repetida
      const secondDel = await releaseActiveProfessionalSeat(tenant, 'repeat@test.com', mockFirestore);
      assert.strictEqual(secondDel.released, false, 'Não deve decrementar novamente se já inativo');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 0, 'activeCount não pode ficar negativo');
    });

    it('7.12. Reativação adquire nova reserva quando abaixo do limite', async () => {
      const tenant = 'tenant-react-new-res';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      // Cria e inativa
      await reserveProfessionalSeat(tenant, { email: 'react@test.com', reservationId: 'tok-old', firestoreOverride: mockFirestore });
      await confirmProfessionalSeat(tenant, 'react@test.com', 'tok-old', mockFirestore);
      await releaseActiveProfessionalSeat(tenant, 'react@test.com', mockFirestore);

      // Nova reserva de reativação com novo reservationId
      const newRes = await reserveProfessionalSeat(tenant, { email: 'react@test.com', reservationId: 'tok-new', firestoreOverride: mockFirestore });
      assert.strictEqual(newRes.allowed, true);
      assert.strictEqual(newRes.reserved, true);
      assert.strictEqual(newRes.reservationId, 'tok-new');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1);
    });

    it('7.13. Duas reativações concorrentes não geram drift (segunda recebe 409 e activeCount = 1)', async () => {
      const tenant = 'tenant-react-conc';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-profissional',
        status: 'ACTIVE'
      });

      await reserveProfessionalSeat(tenant, { email: 'race@test.com', reservationId: 'tok-setup', firestoreOverride: mockFirestore });
      await confirmProfessionalSeat(tenant, 'race@test.com', 'tok-setup', mockFirestore);
      await releaseActiveProfessionalSeat(tenant, 'race@test.com', mockFirestore);

      // 2 requisições concorrentes disputando a reativação
      const r1 = await reserveProfessionalSeat(tenant, { email: 'race@test.com', reservationId: 'tok-r1', firestoreOverride: mockFirestore });
      const r2 = await reserveProfessionalSeat(tenant, { email: 'race@test.com', reservationId: 'tok-r2', firestoreOverride: mockFirestore });

      assert.strictEqual(r1.allowed, true);
      assert.strictEqual(r1.reserved, true);

      assert.strictEqual(r2.allowed, false);
      assert.strictEqual(r2.code, 'PROFESSIONAL_CREATION_IN_PROGRESS');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1, 'activeCount deve ser exatamente 1');
    });

    it('7.14. Dois e-mails diferentes disputando última vaga (exatamente 1 vence e 1 é barrado por limite)', async () => {
      const tenant = 'tenant-diff-email-last-seat';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-essencial', // 1 vaga
        status: 'ACTIVE'
      });

      const rFoo = await reserveProfessionalSeat(tenant, { email: 'foo@test.com', reservationId: 'tok-foo', firestoreOverride: mockFirestore });
      const rBar = await reserveProfessionalSeat(tenant, { email: 'bar@test.com', reservationId: 'tok-bar', firestoreOverride: mockFirestore });

      assert.strictEqual(rFoo.allowed, true);
      assert.strictEqual(rFoo.reserved, true);

      assert.strictEqual(rBar.allowed, false);
      assert.strictEqual(rBar.code, 'PROFESSIONAL_LIMIT_REACHED');

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1);
    });

    it('7.15. Retry da mesma operação com mesmo reservationId permite continuidade sem duplicar contagem', async () => {
      const tenant = 'tenant-same-op-retry';
      await mockFirestore.collection('subscriptions').doc(`sub-${tenant}`).set({
        planId: 'plano-essencial', // 1 vaga
        status: 'ACTIVE'
      });

      const r1 = await reserveProfessionalSeat(tenant, { email: 'retry-op@test.com', reservationId: 'same-op-token', firestoreOverride: mockFirestore });
      assert.strictEqual(r1.allowed, true);
      assert.strictEqual(r1.reserved, true);

      // Retry da MESMA operação com o mesmo reservationId
      const r2 = await reserveProfessionalSeat(tenant, { email: 'retry-op@test.com', reservationId: 'same-op-token', firestoreOverride: mockFirestore });
      assert.strictEqual(r2.allowed, true);
      assert.strictEqual(r2.reserved, false);
      assert.strictEqual(r2.sameReservation, true);

      const capDoc = await mockFirestore.collection('tenant_capacity').doc(tenant).get();
      assert.strictEqual(capDoc.data().activeCount, 1, 'activeCount não deve duplicar em retry da mesma operação');
    });
  });
});
