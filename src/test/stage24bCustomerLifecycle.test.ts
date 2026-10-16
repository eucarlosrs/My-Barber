import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { handleDeactivateCustomer } from '../server/customerController.js';
import { setMockFirebaseAdmin } from '../server/firebaseAdmin.js';
import { AuthenticatedRequest } from '../server/authMiddleware.js';

function createInMemoryFirestore() {
  const store = new Map<string, Map<string, any>>();

  function getCol(colName: string) {
    if (!store.has(colName)) {
      store.set(colName, new Map<string, any>());
    }
    return store.get(colName)!;
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

  return {
    collection: (colName: string) => {
      const col = getCol(colName);
      return {
        doc: (docId: string) => makeDocRef(colName, docId),
        where: () => ({
          get: async () => ({
            empty: true,
            docs: []
          })
        })
      };
    },
    _getStore: () => store
  };
}

function createMockAuth() {
  const users = new Map<string, any>();
  const revokedTokens = new Set<string>();

  return {
    getUser: async (uid: string) => {
      if (!users.has(uid)) {
        throw new Error('User not found');
      }
      return users.get(uid);
    },
    updateUser: async (uid: string, data: any) => {
      const existing = users.get(uid) || { uid };
      users.set(uid, { ...existing, ...data });
      return users.get(uid);
    },
    revokeRefreshTokens: async (uid: string) => {
      revokedTokens.add(uid);
    },
    setCustomUserClaims: async (uid: string, claims: any) => {
      const existing = users.get(uid) || { uid };
      users.set(uid, { ...existing, customClaims: claims });
    },
    _users: users,
    _revokedTokens: revokedTokens
  };
}

function makeMockRes() {
  let statusCode = 200;
  let responseData: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData
  };
  return res;
}

describe('FASE 2.4B — Unificação e Segurança do Lifecycle de Clientes', () => {

  describe('1. Backend Autoritativo: POST /api/customers/deactivate', () => {
    it('1. Owner do tenant pode inativar cliente do seu tenant com soft delete e revogação de sessão', async () => {
      const firestore = createInMemoryFirestore();
      const auth = createMockAuth();
      setMockFirebaseAdmin({ firestore: firestore as any, auth: auth as any });

      auth._users.set('customer-uid-1', { uid: 'customer-uid-1', email: 'cliente@teste.com', disabled: false });
      const usersCol = firestore._getStore().get('users') || new Map();
      usersCol.set('customer-uid-1', {
        id: 'customer-uid-1',
        uid: 'customer-uid-1',
        name: 'Cliente Teste',
        email: 'cliente@teste.com',
        role: 'CLIENTE',
        status: 'active',
        tenantId: 'barbershop-alpha'
      });
      firestore._getStore().set('users', usersCol);

      const req = {
        user: {
          uid: 'owner-uid-1',
          role: 'barbershop_owner',
          barbershopId: 'barbershop-alpha',
          isSuperAdmin: false
        },
        body: {
          targetUid: 'customer-uid-1'
        }
      } as unknown as AuthenticatedRequest;

      const res = makeMockRes();
      await handleDeactivateCustomer(req, res);

      assert.strictEqual(res.getStatusCode(), 200);
      assert.strictEqual(res.getData().success, true);

      // Verify Firestore status is inactive (soft delete) and document is preserved
      const updatedUser = firestore._getStore().get('users')?.get('customer-uid-1');
      assert.ok(updatedUser, 'Documento users/{uid} deve ser preservado para histórico');
      assert.strictEqual(updatedUser.status, 'inactive');
      assert.ok(updatedUser.deactivatedAt, 'deactivatedAt deve ser registrado');

      // Verify Auth account is disabled and refresh tokens revoked
      assert.strictEqual(auth._users.get('customer-uid-1').disabled, true);
      assert.ok(auth._revokedTokens.has('customer-uid-1'), 'Tokens de sessão devem ser revogados');
    });

    it('2. Gestor de tenant diferente (cross-tenant) é bloqueado com 403', async () => {
      const firestore = createInMemoryFirestore();
      const auth = createMockAuth();
      setMockFirebaseAdmin({ firestore: firestore as any, auth: auth as any });

      const usersCol = new Map();
      usersCol.set('customer-uid-2', {
        id: 'customer-uid-2',
        uid: 'customer-uid-2',
        role: 'CLIENTE',
        tenantId: 'barbershop-beta'
      });
      firestore._getStore().set('users', usersCol);

      const req = {
        user: {
          uid: 'manager-uid-1',
          role: 'manager',
          barbershopId: 'barbershop-alpha',
          isSuperAdmin: false
        },
        body: { targetUid: 'customer-uid-2' }
      } as unknown as AuthenticatedRequest;

      const res = makeMockRes();
      await handleDeactivateCustomer(req, res);

      assert.strictEqual(res.getStatusCode(), 403);
      assert.match(res.getData().error, /outro tenant/);
    });

    it('3. Autoexclusão pelo endpoint administrativo é rejeitada com 400', async () => {
      const req = {
        user: {
          uid: 'user-self',
          role: 'barbershop_owner',
          barbershopId: 'barbershop-alpha'
        },
        body: { targetUid: 'user-self' }
      } as unknown as AuthenticatedRequest;

      const res = makeMockRes();
      await handleDeactivateCustomer(req, res);

      assert.strictEqual(res.getStatusCode(), 400);
      assert.match(res.getData().error, /própria conta/);
    });

    it('4. Rejeita inativação de Super Admin, Owner ou Manager via endpoint de cliente', async () => {
      const firestore = createInMemoryFirestore();
      const auth = createMockAuth();
      setMockFirebaseAdmin({ firestore: firestore as any, auth: auth as any });

      const usersCol = new Map();
      usersCol.set('owner-uid-target', {
        id: 'owner-uid-target',
        uid: 'owner-uid-target',
        role: 'PROPRIETARIO',
        tenantId: 'barbershop-alpha'
      });
      firestore._getStore().set('users', usersCol);

      const req = {
        user: {
          uid: 'super-admin-uid',
          role: 'super_admin',
          isSuperAdmin: true
        },
        body: { targetUid: 'owner-uid-target' }
      } as unknown as AuthenticatedRequest;

      const res = makeMockRes();
      await handleDeactivateCustomer(req, res);

      assert.strictEqual(res.getStatusCode(), 400);
      assert.match(res.getData().error, /CLIENTE/);
    });
  });

  describe('2. Auditoria das Regras de Segurança (firestore.rules)', () => {
    const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

    it('5. firestore.rules bloqueia delete no client SDK para role CLIENTE / customer', () => {
      const usersMatch = rulesContent.slice(rulesContent.indexOf('match /users/{userId}'));
      const deleteRule = usersMatch.slice(usersMatch.indexOf('allow delete:'), usersMatch.indexOf('}', usersMatch.indexOf('allow delete:')));
      assert.ok(!deleteRule.includes('CLIENTE'), 'Regra delete em users não deve conter CLIENTE');
      assert.ok(!deleteRule.includes('customer'), 'Regra delete em users não deve conter customer');
      assert.ok(deleteRule.includes('isOwnerOfTenant'), 'Apenas gestão pode deletar');
    });

    it('6. firestore.rules para appointments removeu bypass de token.phone_number', () => {
      const appointmentsMatch = rulesContent.slice(rulesContent.indexOf('match /appointments/{appointmentId}'));
      const readRule = appointmentsMatch.slice(appointmentsMatch.indexOf('allow read:'), appointmentsMatch.indexOf('allow create:'));
      assert.ok(!readRule.includes('phone_number'), 'Appointments read rule não deve conter bypass por phone_number');
    });

    it('7. customerPackages possui escrita e exclusão estritamente restritas a Super Admin ou Gestores', () => {
      const cpMatch = rulesContent.slice(rulesContent.indexOf('match /customerPackages/{cpId}'));
      const createUpdateRule = cpMatch.slice(cpMatch.indexOf('allow create, update:'), cpMatch.indexOf('allow delete:'));
      assert.ok(createUpdateRule.includes('isManagerOrOwnerOfTenant'), 'Escrita de customerPackages restrita a gestores');
      assert.ok(!createUpdateRule.includes('request.auth.uid == resource.data.clientId'), 'Clientes não podem mutar pacotes');
    });
  });

  describe('3. Varredura de Código: Eliminação de Identidades Simuladas e PII', () => {
    const clientAppContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/app/ClientAppView.tsx'), 'utf-8');
    const authLoginContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/auth/AuthLoginView.tsx'), 'utf-8');
    const appContextContent = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AppContext.tsx'), 'utf-8');

    it('8. ClientAppView não possui handleCustomGoogleSubmit nem gerador g-custom-*', () => {
      assert.ok(!clientAppContent.includes('handleCustomGoogleSubmit'), 'handleCustomGoogleSubmit deve ser inexistente');
      assert.ok(!clientAppContent.includes('g-custom-'), 'g-custom-* deve ser inexistente');
      assert.ok(!clientAppContent.includes('customGoogleEmail'), 'customGoogleEmail deve ser inexistente');
    });

    it('9. ClientAppView expurga mybarber_saved_google_accounts do localStorage e não armazena PII', () => {
      assert.ok(clientAppContent.includes("localStorage.removeItem('mybarber_saved_google_accounts')"), 'Deve expurgar localStorage de contas salvas');
      assert.ok(!clientAppContent.includes("localStorage.setItem('mybarber_saved_google_accounts'"), 'Não deve salvar contas no localStorage');
    });

    it('10. ClientAppView filtra appointments do cliente por UID/clientId e não por telefone desprotegido', () => {
      const clientApptsBlock = clientAppContent.slice(clientAppContent.indexOf('const clientAppointments = useMemo('));
      const filteredBlock = clientApptsBlock.slice(0, clientApptsBlock.indexOf('}, [appointments'));
      assert.ok(!filteredBlock.includes('a.clientWhatsApp.replace'), 'clientAppointments não deve filtrar por WhatsApp');
    });

    it('11. AuthLoginView não possui login simulado de demonstração para cliente', () => {
      assert.ok(!authLoginContent.includes('handleQuickGoogleClient'), 'handleQuickGoogleClient deve ser inexistente');
      assert.ok(!authLoginContent.includes('Entrar com conta Google de demonstração'), 'Botão de demonstração deve ser inexistente');
    });

    it('12. AppContext login não possui auto-registro desprotegido por WhatsApp sem senha', () => {
      const loginFn = appContextContent.slice(appContextContent.indexOf('const login = (identifier: string'));
      const loginFnBody = loginFn.slice(0, loginFn.indexOf('const logout ='));
      assert.ok(!loginFnBody.includes('user-client-'), 'Auto-registro bypass com user-client- não deve existir no login');
    });

    it('13. AppContext loginWithGoogle exige googleId e não reconcilia por telefone solto', () => {
      const loginWithGoogleFn = appContextContent.slice(appContextContent.indexOf('const loginWithGoogle ='));
      const loginWithGoogleBody = loginWithGoogleFn.slice(0, loginWithGoogleFn.indexOf('const loginWithWhatsApp ='));
      assert.ok(loginWithGoogleBody.includes('!data.googleId'), 'loginWithGoogle deve exigir googleId');
      assert.ok(!loginWithGoogleBody.includes('cleanPhone.replace'), 'loginWithGoogle não deve reconciliar contas por cleanPhone');
      assert.ok(!loginWithGoogleBody.includes('user-client-google-'), 'loginWithGoogle não deve gerar IDs sintéticos user-client-google-');
    });
  });

});
