import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { handleCreateProfessional } from '../server/teamController.js';
import { setUserRole, setMockFirebaseAdmin } from '../server/firebaseAdmin.js';

describe('MY BARBER — Correção de Segurança no Cadastro de Profissionais e Custom Claims Fail-Closed', () => {

  let users: Map<string, any>;
  let claims: Map<string, any>;
  let deletedUsers: string[];
  let customClaimsErrorToThrow: any = null;
  let firestoreData: Map<string, Map<string, any>>;

  function createMockFirestore() {
    firestoreData = new Map();
    const getCol = (name: string) => {
      if (!firestoreData.has(name)) firestoreData.set(name, new Map());
      return firestoreData.get(name)!;
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
          },
          delete: async () => {
            const col = getCol(colName);
            col.delete(docId);
          }
        }),
        where: () => ({
          get: async () => ({ docs: [], empty: true, size: 0 })
        })
      }),
      runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
        const fakeTx = {
          get: async (ref: any) => {
            return { exists: false, data: () => null };
          },
          set: (ref: any, data: any) => {},
          update: (ref: any, data: any) => {}
        };
        return updateFunction(fakeTx);
      }
    };
  }

  function createMockAuth() {
    users = new Map();
    claims = new Map();
    deletedUsers = [];
    let nextUid = 1000;

    return {
      createUser: async (data: any) => {
        const uid = `auth-prof-${nextUid++}`;
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
        if (customClaimsErrorToThrow) {
          throw customClaimsErrorToThrow;
        }
        claims.set(uid, customClaims);
      },
      deleteUser: async (uid: string) => {
        deletedUsers.push(uid);
        users.delete(uid);
        claims.delete(uid);
      },
      updateUser: async (uid: string, data: any) => {
        const u = users.get(uid) || { uid };
        users.set(uid, { ...u, ...data });
        return users.get(uid);
      },
      revokeRefreshTokens: async (uid: string) => {
        const u = users.get(uid) || { uid };
        u.tokensRevokedAt = Date.now();
      }
    };
  }

  function createMockHttp(options: {
    actor?: any;
    body?: Record<string, any>;
  }) {
    const req: any = {
      user: options.actor || { uid: 'owner-uid', role: 'barbershop_owner', tenantId: 'tenant-test' },
      body: options.body || {},
      params: {},
      headers: {}
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

  beforeEach(async () => {
    customClaimsErrorToThrow = null;
    const authMock = createMockAuth();
    const fsMock = createMockFirestore();
    await fsMock.collection('barbershops').doc('tenant-alfa').set({
      id: 'tenant-alfa',
      name: 'Barbearia Alfa',
      planId: 'plano-profissional'
    });
    await fsMock.collection('subscriptions').doc('sub-tenant-alfa').set({
      id: 'sub-tenant-alfa',
      tenantId: 'tenant-alfa',
      planId: 'plano-profissional',
      status: 'ACTIVE'
    });

    setMockFirebaseAdmin({
      app: { options: { projectId: 'gen-lang-client-0472481079' } } as any,
      auth: authMock as any,
      firestore: fsMock as any
    });
  });

  // =========================================================================
  // 1. Falha no setUserRole ao gravar Custom Claims (Fail-Closed)
  // =========================================================================
  describe('1. setUserRole() não simula sucesso e retorna fail-closed em caso de erro real', () => {

    it('1.1. Erro auth/internal-error em setCustomUserClaims retorna success: false', async () => {
      const internalErr: any = new Error('Internal Firebase Authentication error');
      internalErr.code = 'auth/internal-error';
      customClaimsErrorToThrow = internalErr;

      const result = await setUserRole({
        targetUid: 'user-uid-1',
        role: 'barber',
        tenantId: 'tenant-test',
        actorUid: 'owner-uid',
        actorRole: 'barbershop_owner',
        actorTenantId: 'tenant-test'
      });

      assert.strictEqual(result.success, false, 'Deve retornar success: false em caso de auth/internal-error');
      assert.ok(result.error?.includes('Internal Firebase Authentication error') || result.error?.includes('Falha ao atualizar Custom Claims'));
    });

    it('1.2. Erro de API Identity Toolkit desabilitada retorna success: false', async () => {
      const toolkitErr: any = new Error('Identity Toolkit API has not been used in project 58216801115 before or it is disabled.');
      toolkitErr.code = 403;
      customClaimsErrorToThrow = toolkitErr;

      const result = await setUserRole({
        targetUid: 'user-uid-2',
        role: 'barber',
        tenantId: 'tenant-test',
        actorUid: 'owner-uid',
        actorRole: 'barbershop_owner',
        actorTenantId: 'tenant-test'
      });

      assert.strictEqual(result.success, false, 'Deve retornar success: false quando a Identity Toolkit API falhar');
      assert.ok(result.error?.includes('Identity Toolkit API') || result.error?.includes('Falha ao atualizar Custom Claims'));
    });

    it('1.3. Erro de rede/timeout aleatório retorna success: false sem mascarar', async () => {
      const networkErr = new Error('ETIMEDOUT: Connection to Firebase Auth timed out');
      customClaimsErrorToThrow = networkErr;

      const result = await setUserRole({
        targetUid: 'user-uid-3',
        role: 'barber',
        tenantId: 'tenant-test',
        actorUid: 'super-admin-uid',
        actorRole: 'super_admin'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('ETIMEDOUT') || result.error?.includes('Falha ao atualizar Custom Claims'));
    });
  });

  // =========================================================================
  // 2. Comportamento de handleCreateProfessional em falhas de Custom Claims
  // =========================================================================
  describe('2. handleCreateProfessional() e compensações de segurança', () => {

    it('2.1. Retorna HTTP 500 (e NÃO HTTP 201) quando setCustomUserClaims lança auth/internal-error', async () => {
      const internalErr: any = new Error('Firebase Auth Service Unavailable');
      internalErr.code = 'auth/internal-error';
      customClaimsErrorToThrow = internalErr;

      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: 'tenant-alfa' },
        body: {
          name: 'Barbeiro Teste Falha',
          email: 'barbeiro.falha@teste.com'
        }
      });

      await handleCreateProfessional(req, res);

      assert.strictEqual(getStatus(), 500, 'Cadastro deve retornar HTTP 500 se as Claims não forem gravadas');
      assert.strictEqual(getBody()?.success, undefined);
      assert.ok(getBody()?.error?.includes('Firebase Auth Service Unavailable') || getBody()?.error?.includes('Falha ao atribuir Custom Claims'));
    });

    it('2.2. Retorna HTTP 500 quando a Identity Toolkit API estiver indisponível', async () => {
      const toolkitErr: any = new Error('Identity Toolkit API is disabled');
      toolkitErr.code = 403;
      customClaimsErrorToThrow = toolkitErr;

      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: 'tenant-alfa' },
        body: {
          name: 'Barbeiro Toolkit Falha',
          email: 'toolkit.falha@teste.com'
        }
      });

      await handleCreateProfessional(req, res);

      assert.strictEqual(getStatus(), 500);
      assert.strictEqual(getBody()?.success, undefined);
    });

    it('2.3. Executa compensação (deleteUser) quando o usuário foi criado novo no Auth', async () => {
      const internalErr: any = new Error('Claims write failure');
      internalErr.code = 'auth/internal-error';
      customClaimsErrorToThrow = internalErr;

      const { req, res, getStatus } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: 'tenant-alfa' },
        body: {
          name: 'Barbeiro Novo Órfão',
          email: 'novo.orfao@teste.com'
        }
      });

      await handleCreateProfessional(req, res);

      assert.strictEqual(getStatus(), 500);
      // Deve ter tentado remover o usuário órfão recém-criado
      assert.strictEqual(deletedUsers.length, 1, 'Deve compensar o usuário novo apagando do Auth');
      assert.ok(deletedUsers[0].startsWith('auth-prof-'));
    });

    it('2.4. NÃO apaga conta preexistente no Auth se a gravação de claims falhar', async () => {
      // Cria usuário preexistente (ex: cliente que já existia no Auth)
      const existingUid = 'auth-cliente-preexistente';
      users.set(existingUid, {
        uid: existingUid,
        email: 'cliente.antigo@teste.com',
        displayName: 'Cliente Antigo',
        disabled: false
      });

      const internalErr: any = new Error('Claims write failure for existing user');
      internalErr.code = 'auth/internal-error';
      customClaimsErrorToThrow = internalErr;

      const { req, res, getStatus } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: 'tenant-alfa' },
        body: {
          name: 'Cliente Antigo Virando Barbeiro',
          email: 'cliente.antigo@teste.com'
        }
      });

      await handleCreateProfessional(req, res);

      assert.strictEqual(getStatus(), 500);
      // Conta preexistente NÃO pode ser deletada!
      assert.strictEqual(deletedUsers.includes(existingUid), false, 'NÃO deve apagar a conta preexistente do Auth');
      assert.strictEqual(users.has(existingUid), true, 'Conta preexistente deve continuar no Auth');
    });

    it('2.5. Não persiste documento em users nem em publicProfessionalProfiles quando as claims falham', async () => {
      const internalErr: any = new Error('Claims failed');
      customClaimsErrorToThrow = internalErr;

      const { req, res, getStatus } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: 'tenant-alfa' },
        body: {
          name: 'Barbeiro Sem Documento',
          email: 'sem.doc@teste.com'
        }
      });

      await handleCreateProfessional(req, res);
      assert.strictEqual(getStatus(), 500);

      const usersCollection = firestoreData.get('users');
      const publicCollection = firestoreData.get('publicProfessionalProfiles');

      // Verifica se algum doc com esse email foi gravado
      let foundUser = false;
      if (usersCollection) {
        for (const val of usersCollection.values()) {
          if (val.email === 'sem.doc@teste.com') foundUser = true;
        }
      }
      assert.strictEqual(foundUser, false, 'Nenhum perfil de profissional deve ser persistido em users se claims falharem');

      let foundPublic = false;
      if (publicCollection) {
        for (const val of publicCollection.values()) {
          if (val.name === 'Barbeiro Sem Documento') foundPublic = true;
        }
      }
      assert.strictEqual(foundPublic, false, 'Nenhuma projeção pública deve ser gravada se claims falharem');
    });
  });

  // =========================================================================
  // 3. Sucesso no cadastro normal (HTTP 201)
  // =========================================================================
  describe('3. Cadastro normal de profissional com sucesso (HTTP 201)', () => {

    it('3.1. Retorna HTTP 201 e atribui claims corretas quando tudo ocorre normalmente', async () => {
      customClaimsErrorToThrow = null; // Sem erros

      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-1', role: 'barbershop_owner', tenantId: 'tenant-alfa' },
        body: {
          name: 'Barbeiro Sucesso Real',
          email: 'barbeiro.sucesso@teste.com',
          commissionPercentage: 50,
          specialties: ['Corte', 'Barba']
        }
      });

      await handleCreateProfessional(req, res);

      assert.strictEqual(getStatus(), 201, 'Cadastro normal deve retornar HTTP 201');
      const body = getBody();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.user.name, 'Barbeiro Sucesso Real');
      assert.strictEqual(body.user.canonicalRole, 'barber');
      assert.strictEqual(body.user.tenantId, 'tenant-alfa');
      assert.strictEqual(body.claims.role, 'barber');
      assert.strictEqual(body.claims.tenantId, 'tenant-alfa');
      assert.strictEqual(body.claims.isSuperAdmin, false);

      // Verifica se gravou perfil no users
      const usersCol = firestoreData.get('users');
      assert.ok(usersCol?.has(body.user.uid), 'Perfil em users/{uid} deve ser gravado');

      // Verifica se gravou perfil público
      const pubCol = firestoreData.get('publicProfessionalProfiles');
      assert.ok(pubCol?.has(body.user.uid), 'Perfil em publicProfessionalProfiles/{uid} deve ser gravado');
    });
  });

  // =========================================================================
  // 4. Preservação de Super Admin e Isolamento Multi-Tenant
  // =========================================================================
  describe('4. Preservação de privilégios de Super Admin e Isolamento Multi-Tenant', () => {

    it('4.1. Owner do tenant A não pode criar profissional no tenant B (Cross-Tenant bloqueado com HTTP 403)', async () => {
      const { req, res, getStatus, getBody } = createMockHttp({
        actor: { uid: 'owner-a', role: 'barbershop_owner', tenantId: 'tenant-a' },
        body: {
          name: 'Barbeiro Invasor',
          email: 'invasor@teste.com',
          tenantId: 'tenant-b' // Tentativa cross-tenant
        }
      });

      await handleCreateProfessional(req, res);

      assert.strictEqual(getStatus(), 403);
      assert.match(getBody()?.error || '', /cross-tenant|isolamento/i);
    });

    it('4.2. Usuário não-SuperAdmin não pode conceder role de super_admin via setUserRole', async () => {
      const result = await setUserRole({
        targetUid: 'target-user',
        role: 'super_admin',
        actorUid: 'owner-a',
        actorRole: 'barbershop_owner',
        actorTenantId: 'tenant-a'
      });

      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /Apenas Super Administradores/i);
    });

    it('4.3. Super Admin legítimo pode alterar roles com autoridade global', async () => {
      const result = await setUserRole({
        targetUid: 'new-owner-uid',
        role: 'barbershop_owner',
        tenantId: 'tenant-novo',
        actorUid: 'super-admin-root',
        actorRole: 'super_admin'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.claims?.role, 'barbershop_owner');
      assert.strictEqual(result.claims?.tenantId, 'tenant-novo');
    });
  });

});
