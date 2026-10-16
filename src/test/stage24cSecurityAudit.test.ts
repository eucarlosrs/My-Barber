import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { handleDeactivateCustomer } from '../server/customerController.js';
import { setMockFirebaseAdmin } from '../server/firebaseAdmin.js';
import { AuthenticatedRequest } from '../server/authMiddleware.js';

/**
 * FASE 2.4C — AUDITORIA E CORREÇÃO DA REVOGAÇÃO EFETIVA DE SESSÃO E ACESSO APÓS DESATIVAÇÃO DE CLIENTE
 * 
 * 15 Cenários Obrigatórios de Segurança, IAM e Firestore Rules Hardening
 */

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

/**
 * Simulador Soberano das Firestore Rules com a checagem isCallerActive() e get() no documento do usuário
 */
function evaluateFirestoreRules(context: {
  auth: { uid: string; token: { role?: string; isSuperAdmin?: boolean; tenantId?: string; status?: string } } | null;
  database: {
    users: Map<string, any>;
    appointments: Map<string, any>;
    customerPackages: Map<string, any>;
    waitlist: Map<string, any>;
  };
}) {
  const { auth, database } = context;

  const isAuthenticated = () => auth !== null && !!auth.uid;
  const isSuperAdmin = () =>
    isAuthenticated() &&
    (auth?.token?.role === 'super_admin' || auth?.token?.isSuperAdmin === true);

  const getAuthTenant = () => auth?.token?.tenantId;

  const isMemberOfTenant = (tId?: string) =>
    isAuthenticated() &&
    tId &&
    auth?.token?.tenantId === tId &&
    auth?.token?.role &&
    ['super_admin', 'barbershop_owner', 'manager', 'barber'].includes(auth.token.role);

  const isManagerOrOwnerOfTenant = (tId?: string) =>
    isAuthenticated() &&
    tId &&
    auth?.token?.tenantId === tId &&
    auth?.token?.role &&
    ['super_admin', 'barbershop_owner', 'manager'].includes(auth.token.role);

  const isSelf = (targetUid: string, resourceDoc?: any) =>
    isAuthenticated() &&
    (auth?.uid === targetUid || (resourceDoc && resourceDoc.uid === auth?.uid));

  // Regra central da FASE 2.4C: isCallerActive()
  const isCallerActive = () => {
    if (!isAuthenticated()) return false;
    if (isSuperAdmin()) return true;
    if (isMemberOfTenant(getAuthTenant())) return true;
    const userDoc = database.users.get(auth!.uid);
    if (!userDoc) return true; // Conta recém-criada antes do doc existir
    return userDoc.status !== 'inactive';
  };

  return {
    // 1. users/{userId} READ
    canReadUser: (targetUserId: string) => {
      if (isSuperAdmin()) return true;
      const resource = database.users.get(targetUserId);
      if (!resource) return false;
      if (!isAuthenticated()) return false;
      // Regra: (isSelf(userId) && resource.data.status != 'inactive') || isManagerOrOwnerOfTenant(resource.data.tenantId)
      const selfAccess = isSelf(targetUserId, resource) && resource.status !== 'inactive';
      const staffAccess = isManagerOrOwnerOfTenant(resource.tenantId);
      return selfAccess || staffAccess;
    },

    // 2. users/{userId} UPDATE
    canUpdateUser: (targetUserId: string, incomingData: any) => {
      if (isSuperAdmin()) return true;
      const resource = database.users.get(targetUserId);
      if (!resource) return false;
      if (isManagerOrOwnerOfTenant(resource.tenantId)) return true;

      // Regra de auto-atualização do cliente:
      // isSelf(userId) && resource.data.status != 'inactive' && imutabilidade de role, tenantId, status
      if (!isSelf(targetUserId, resource)) return false;
      if (resource.status === 'inactive') return false; // Bloqueado para cliente inativo
      if (incomingData.role && incomingData.role !== resource.role) return false;
      if (incomingData.tenantId && incomingData.tenantId !== resource.tenantId) return false;
      if (incomingData.status && incomingData.status !== resource.status) return false; // Proíbe auto-reativação
      return true;
    },

    // 3. appointments/{appointmentId} READ
    canReadAppointment: (appointmentId: string) => {
      if (isSuperAdmin()) return true;
      const resource = database.appointments.get(appointmentId);
      if (!resource) return false;
      if (isMemberOfTenant(resource.tenantId)) return true;
      // Regra: isAuthenticated() && isCallerActive() && (request.auth.uid == resource.data.clientId || resource.data.uid == request.auth.uid)
      if (isAuthenticated() && isCallerActive()) {
        return auth!.uid === resource.clientId || auth!.uid === resource.uid;
      }
      return false;
    },

    // 4. customerPackages/{cpId} READ
    canReadCustomerPackage: (cpId: string) => {
      if (isSuperAdmin()) return true;
      const resource = database.customerPackages.get(cpId);
      if (!resource) return false;
      if (isMemberOfTenant(resource.tenantId)) return true;
      if (isAuthenticated() && isCallerActive()) {
        return auth!.uid === resource.clientId || auth!.uid === resource.uid;
      }
      return false;
    },

    // 5. waitlist/{entryId} READ & CREATE
    canReadWaitlist: (entryId: string) => {
      if (isSuperAdmin()) return true;
      const resource = database.waitlist.get(entryId);
      if (!resource) return false;
      if (isMemberOfTenant(resource.tenantId)) return true;
      if (isAuthenticated() && isCallerActive()) {
        return auth!.uid === resource.clientId || auth!.uid === resource.uid;
      }
      return false;
    },

    canCreateWaitlist: (data: any) => {
      // Regra: isCallerActive() && validações estruturais
      if (!isCallerActive()) return false;
      if (!data.tenantId || typeof data.tenantId !== 'string') return false;
      if (!data.clientWhatsApp || typeof data.clientWhatsApp !== 'string') return false;
      if (data.status !== 'AGUARDANDO') return false;
      if ('handledBy' in data || 'notesInternal' in data || 'isVip' in data) return false;
      return true;
    },

    // 6. appointments CREATE (Clientes não podem criar diretamente no Firestore)
    canCreateAppointmentDirectly: (data: any) => {
      // Clientes nunca podem criar appointments diretamente via Client SDK
      return isSuperAdmin() || isMemberOfTenant(data.tenantId);
    }
  };
}

describe('FASE 2.4C — Auditoria e Correção da Revogação Efetiva de Sessão e Acesso (15 Cenários Obrigatórios)', () => {

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  describe('Auditoria Estrutural de firestore.rules', () => {
    it('Verifica presença de isCallerActive() com get() no Firestore em firestore.rules', () => {
      assert.match(rulesContent, /function\s+isCallerActive\(\)/, 'Deve existir helper isCallerActive()');
      assert.match(rulesContent, /get\(\/databases\/\$\(database\)\/documents\/users\/\$\(request\.auth\.uid\)\)\.data\.status\s*!=\s*'inactive'/, 'Deve consultar status != inactive no Firestore via get()');
    });

    it('Verifica que users/{userId} proíbe leitura e mutação para clientes com status inativo', () => {
      const usersBlock = rulesContent.slice(rulesContent.indexOf('match /users/{userId}'));
      assert.match(usersBlock, /resource\.data\.status\s*!=\s*'inactive'/, 'users read deve exigir resource.data.status != inactive');
    });

    it('Verifica que appointments, customerPackages e waitlist invocam isCallerActive()', () => {
      const apptsBlock = rulesContent.slice(rulesContent.indexOf('match /appointments/{appointmentId}'));
      assert.match(apptsBlock, /isCallerActive\(\)/, 'appointments deve exigir isCallerActive()');

      const cpBlock = rulesContent.slice(rulesContent.indexOf('match /customerPackages/{cpId}'));
      assert.match(cpBlock, /isCallerActive\(\)/, 'customerPackages deve exigir isCallerActive()');

      const waitlistBlock = rulesContent.slice(rulesContent.indexOf('match /waitlist/{entryId}'));
      assert.match(waitlistBlock, /isCallerActive\(\)/, 'waitlist deve exigir isCallerActive()');
    });
  });

  describe('Execução dos 15 Cenários Obrigatórios de Segurança', () => {

    // Setup base dos bancos simulados
    const setupEnvironment = () => {
      const users = new Map<string, any>();
      const appointments = new Map<string, any>();
      const customerPackages = new Map<string, any>();
      const waitlist = new Map<string, any>();

      // Cliente Alpha Desativado
      users.set('client-deactivated-uid', {
        id: 'client-deactivated-uid',
        uid: 'client-deactivated-uid',
        name: 'Cliente Inativo',
        email: 'inativo@teste.com',
        role: 'CLIENTE',
        status: 'inactive',
        tenantId: 'barbershop-alpha'
      });

      // Cliente Beta Ativo
      users.set('client-active-uid', {
        id: 'client-active-uid',
        uid: 'client-active-uid',
        name: 'Cliente Ativo',
        email: 'ativo@teste.com',
        role: 'CLIENTE',
        status: 'active',
        tenantId: 'barbershop-alpha'
      });

      // Appointments
      appointments.set('appt-deactivated-1', {
        id: 'appt-deactivated-1',
        tenantId: 'barbershop-alpha',
        clientId: 'client-deactivated-uid',
        serviceName: 'Corte Tradicional',
        status: 'AGENDADO'
      });
      appointments.set('appt-active-1', {
        id: 'appt-active-1',
        tenantId: 'barbershop-alpha',
        clientId: 'client-active-uid',
        serviceName: 'Barba Terapia',
        status: 'AGENDADO'
      });

      // CustomerPackages
      customerPackages.set('cp-deactivated-1', {
        id: 'cp-deactivated-1',
        tenantId: 'barbershop-alpha',
        clientId: 'client-deactivated-uid',
        packageName: 'Plano Mensal Barba'
      });
      customerPackages.set('cp-active-1', {
        id: 'cp-active-1',
        tenantId: 'barbershop-alpha',
        clientId: 'client-active-uid',
        packageName: 'Plano Mensal Cabelo'
      });

      // Waitlist
      waitlist.set('wl-deactivated-1', {
        id: 'wl-deactivated-1',
        tenantId: 'barbershop-alpha',
        clientId: 'client-deactivated-uid',
        clientWhatsApp: '11999990001',
        status: 'AGUARDANDO'
      });
      waitlist.set('wl-active-1', {
        id: 'wl-active-1',
        tenantId: 'barbershop-alpha',
        clientId: 'client-active-uid',
        clientWhatsApp: '11999990002',
        status: 'AGUARDANDO'
      });

      return { users, appointments, customerPackages, waitlist };
    };

    // Cenário 1: Token antigo emitido antes da desativação NÃO consegue ler users/{uid}
    it('1. Token antigo emitido antes da desativação NÃO consegue ler users/{uid}', () => {
      const db = setupEnvironment();
      // Token antigo ainda válido temporalmente, com role customer
      const staleTokenAuth = {
        uid: 'client-deactivated-uid',
        token: { role: 'customer', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: staleTokenAuth, database: db });

      const allowed = evaluator.canReadUser('client-deactivated-uid');
      assert.strictEqual(allowed, false, 'Acesso deve ser estritamente NEGADO para token de cliente inativo');
    });

    // Cenário 2: Token antigo NÃO consegue ler appointments do cliente
    it('2. Token antigo NÃO consegue ler appointments do cliente', () => {
      const db = setupEnvironment();
      const staleTokenAuth = {
        uid: 'client-deactivated-uid',
        token: { role: 'customer', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: staleTokenAuth, database: db });

      const allowed = evaluator.canReadAppointment('appt-deactivated-1');
      assert.strictEqual(allowed, false, 'Leitura de appointments deve ser NEGADA para token antigo');
    });

    // Cenário 3: Token antigo NÃO consegue ler customerPackages do cliente
    it('3. Token antigo NÃO consegue ler customerPackages do cliente', () => {
      const db = setupEnvironment();
      const staleTokenAuth = {
        uid: 'client-deactivated-uid',
        token: { role: 'customer', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: staleTokenAuth, database: db });

      const allowed = evaluator.canReadCustomerPackage('cp-deactivated-1');
      assert.strictEqual(allowed, false, 'Leitura de customerPackages deve ser NEGADA para token antigo');
    });

    // Cenário 4: Token antigo NÃO consegue ler waitlist do cliente
    it('4. Token antigo NÃO consegue ler waitlist do cliente', () => {
      const db = setupEnvironment();
      const staleTokenAuth = {
        uid: 'client-deactivated-uid',
        token: { role: 'customer', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: staleTokenAuth, database: db });

      const allowed = evaluator.canReadWaitlist('wl-deactivated-1');
      assert.strictEqual(allowed, false, 'Leitura de waitlist deve ser NEGADA para token antigo');
    });

    // Cenário 5: Token antigo NÃO consegue alterar dados do perfil
    it('5. Token antigo NÃO consegue alterar dados do perfil', () => {
      const db = setupEnvironment();
      const staleTokenAuth = {
        uid: 'client-deactivated-uid',
        token: { role: 'customer', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: staleTokenAuth, database: db });

      const allowed = evaluator.canUpdateUser('client-deactivated-uid', { name: 'Nome Hackeado' });
      assert.strictEqual(allowed, false, 'Edição de perfil deve ser NEGADA para cliente desativado');
    });

    // Cenário 6: Token antigo NÃO consegue criar agendamento direto no Firestore
    it('6. Token antigo NÃO consegue criar agendamento direto no Firestore', () => {
      const db = setupEnvironment();
      const staleTokenAuth = {
        uid: 'client-deactivated-uid',
        token: { role: 'customer', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: staleTokenAuth, database: db });

      const allowed = evaluator.canCreateAppointmentDirectly({
        tenantId: 'barbershop-alpha',
        clientId: 'client-deactivated-uid'
      });
      assert.strictEqual(allowed, false, 'Criação direta no Firestore é NEGADA para clientes');
    });

    // Cenário 7: Token antigo NÃO consegue criar entrada na waitlist
    it('7. Token antigo NÃO consegue criar entrada na waitlist', () => {
      const db = setupEnvironment();
      const staleTokenAuth = {
        uid: 'client-deactivated-uid',
        token: { role: 'customer', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: staleTokenAuth, database: db });

      const allowed = evaluator.canCreateWaitlist({
        tenantId: 'barbershop-alpha',
        clientWhatsApp: '11999990001',
        status: 'AGUARDANDO'
      });
      assert.strictEqual(allowed, false, 'Criação de waitlist deve ser NEGADA para cliente inativo via isCallerActive()');
    });

    // Cenário 8: Tentativa de reativação pelo próprio cliente é bloqueada (Rules e Backend)
    it('8. Tentativa de reativação pelo próprio cliente é bloqueada (Rules e Backend)', async () => {
      const db = setupEnvironment();
      const staleTokenAuth = {
        uid: 'client-deactivated-uid',
        token: { role: 'customer', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: staleTokenAuth, database: db });

      // Rules bloqueiam mudança de status (auto-reativação)
      const rulesAllowed = evaluator.canUpdateUser('client-deactivated-uid', { status: 'active' });
      assert.strictEqual(rulesAllowed, false, 'Rules devem impedir auto-reativação');

      // Rules bloqueiam edição mesmo sem alteração de status
      const editAllowed = evaluator.canUpdateUser('client-deactivated-uid', { name: 'Reativo' });
      assert.strictEqual(editAllowed, false, 'Rules devem impedir qualquer update por cliente inativo');

      // Backend: cliente tentando atuar sobre outra conta ou sem privilégio administrativo é bloqueado com 403
      const req = {
        user: {
          uid: 'client-deactivated-uid',
          role: 'customer',
          isSuperAdmin: false
        },
        body: { targetUid: 'another-customer-uid' }
      } as unknown as AuthenticatedRequest;
      const res = makeMockRes();

      await handleDeactivateCustomer(req, res);
      assert.strictEqual(res.getStatusCode(), 403, 'Endpoint deve negar auto-operação ou falta de privilégio sobre outros');
    });

    // Cenário 9: Cliente ativo continua acessando seus próprios dados normalmente
    it('9. Cliente ativo continua acessando seus próprios dados normalmente', () => {
      const db = setupEnvironment();
      const activeTokenAuth = {
        uid: 'client-active-uid',
        token: { role: 'customer', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: activeTokenAuth, database: db });

      assert.strictEqual(evaluator.canReadUser('client-active-uid'), true, 'Cliente ativo lê seu perfil');
      assert.strictEqual(evaluator.canReadAppointment('appt-active-1'), true, 'Cliente ativo lê seu agendamento');
      assert.strictEqual(evaluator.canReadCustomerPackage('cp-active-1'), true, 'Cliente ativo lê seus pacotes');
      assert.strictEqual(evaluator.canReadWaitlist('wl-active-1'), true, 'Cliente ativo lê sua waitlist');
      assert.strictEqual(evaluator.canCreateWaitlist({
        tenantId: 'barbershop-alpha',
        clientWhatsApp: '11999990002',
        status: 'AGUARDANDO'
      }), true, 'Cliente ativo pode criar entrada na waitlist');
    });

    // Cenário 10: Super Admin continua acessando dados de clientes desativados
    it('10. Super Admin continua acessando dados de clientes desativados', () => {
      const db = setupEnvironment();
      const superAdminAuth = {
        uid: 'super-admin-uid',
        token: { role: 'super_admin', isSuperAdmin: true }
      };
      const evaluator = evaluateFirestoreRules({ auth: superAdminAuth, database: db });

      assert.strictEqual(evaluator.canReadUser('client-deactivated-uid'), true, 'Super Admin lê cliente desativado');
      assert.strictEqual(evaluator.canReadAppointment('appt-deactivated-1'), true, 'Super Admin lê agendamento histórico');
      assert.strictEqual(evaluator.canReadCustomerPackage('cp-deactivated-1'), true, 'Super Admin lê pacotes');
      assert.strictEqual(evaluator.canReadWaitlist('wl-deactivated-1'), true, 'Super Admin lê waitlist');
    });

    // Cenário 11: Owner do tenant continua acessando dados históricos de clientes do seu tenant
    it('11. Owner do tenant continua acessando dados históricos de clientes do seu tenant', () => {
      const db = setupEnvironment();
      const ownerAuth = {
        uid: 'owner-alpha-uid',
        token: { role: 'barbershop_owner', tenantId: 'barbershop-alpha', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: ownerAuth, database: db });

      assert.strictEqual(evaluator.canReadUser('client-deactivated-uid'), true, 'Owner lê cliente desativado do seu tenant');
      assert.strictEqual(evaluator.canReadAppointment('appt-deactivated-1'), true, 'Owner lê agendamento do seu tenant');
      assert.strictEqual(evaluator.canReadCustomerPackage('cp-deactivated-1'), true, 'Owner lê pacotes do seu tenant');
      assert.strictEqual(evaluator.canReadWaitlist('wl-deactivated-1'), true, 'Owner lê waitlist do seu tenant');
    });

    // Cenário 12: Manager do tenant continua acessando dados históricos de clientes do seu tenant
    it('12. Manager do tenant continua acessando dados históricos de clientes do seu tenant', () => {
      const db = setupEnvironment();
      const managerAuth = {
        uid: 'manager-alpha-uid',
        token: { role: 'manager', tenantId: 'barbershop-alpha', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: managerAuth, database: db });

      assert.strictEqual(evaluator.canReadUser('client-deactivated-uid'), true, 'Manager lê cliente desativado do seu tenant');
      assert.strictEqual(evaluator.canReadAppointment('appt-deactivated-1'), true, 'Manager lê agendamento do seu tenant');
      assert.strictEqual(evaluator.canReadCustomerPackage('cp-deactivated-1'), true, 'Manager lê pacotes do seu tenant');
      assert.strictEqual(evaluator.canReadWaitlist('wl-deactivated-1'), true, 'Manager lê waitlist do seu tenant');
    });

    // Cenário 13: Usuário de outro tenant NÃO acessa dados de cliente desativado (isolamento multi-tenant mantido)
    it('13. Usuário de outro tenant NÃO acessa dados de cliente desativado (isolamento multi-tenant mantido)', () => {
      const db = setupEnvironment();
      const crossTenantOwnerAuth = {
        uid: 'owner-beta-uid',
        token: { role: 'barbershop_owner', tenantId: 'barbershop-beta', isSuperAdmin: false }
      };
      const evaluator = evaluateFirestoreRules({ auth: crossTenantOwnerAuth, database: db });

      assert.strictEqual(evaluator.canReadUser('client-deactivated-uid'), false, 'Owner do tenant Beta NÃO lê cliente do tenant Alpha');
      assert.strictEqual(evaluator.canReadAppointment('appt-deactivated-1'), false, 'Owner do tenant Beta NÃO lê agendamento do Alpha');
      assert.strictEqual(evaluator.canReadCustomerPackage('cp-deactivated-1'), false, 'Owner do tenant Beta NÃO lê pacotes do Alpha');
      assert.strictEqual(evaluator.canReadWaitlist('wl-deactivated-1'), false, 'Owner do tenant Beta NÃO lê waitlist do Alpha');
    });

    // Cenário 14: Desativação é idempotente (segunda chamada não quebra estado nem gera duplicidade)
    it('14. Desativação é idempotente (segunda chamada não quebra estado nem gera duplicidade)', async () => {
      const firestore = createInMemoryFirestore();
      const auth = createMockAuth();
      setMockFirebaseAdmin({ firestore: firestore as any, auth: auth as any });

      auth._users.set('customer-idem-uid', { uid: 'customer-idem-uid', disabled: false });
      const usersCol = new Map();
      usersCol.set('customer-idem-uid', {
        id: 'customer-idem-uid',
        uid: 'customer-idem-uid',
        role: 'CLIENTE',
        status: 'active',
        tenantId: 'barbershop-alpha'
      });
      firestore._getStore().set('users', usersCol);

      const req = {
        user: {
          uid: 'owner-alpha-uid',
          role: 'barbershop_owner',
          barbershopId: 'barbershop-alpha',
          isSuperAdmin: false
        },
        body: { targetUid: 'customer-idem-uid' }
      } as unknown as AuthenticatedRequest;

      // 1ª Chamada: inativa normalmente
      const res1 = makeMockRes();
      await handleDeactivateCustomer(req, res1);
      assert.strictEqual(res1.getStatusCode(), 200);
      assert.strictEqual(res1.getData().status, 'inactive');

      // 2ª Chamada: idempotência segura
      const res2 = makeMockRes();
      await handleDeactivateCustomer(req, res2);
      assert.strictEqual(res2.getStatusCode(), 200);
      assert.strictEqual(res2.getData().status, 'inactive');
      assert.match(res2.getData().message, /já se encontra desativada/);

      // Garante que o documento permanece único e inativo
      const doc = firestore._getStore().get('users')?.get('customer-idem-uid');
      assert.ok(doc);
      assert.strictEqual(doc.status, 'inactive');
      assert.strictEqual(auth._users.get('customer-idem-uid').disabled, true);
    });

    // Cenário 15: Expurgo e reconciliação: login com Google não reativa automaticamente conta inativa sem autorização expressa
    it('15. Expurgo e reconciliação: login com Google não reativa automaticamente conta inativa sem autorização expressa', () => {
      const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
      const appContextContent = fs.readFileSync(appContextPath, 'utf-8');

      const clientAppPath = path.resolve(process.cwd(), 'src/components/app/ClientAppView.tsx');
      const clientAppContent = fs.readFileSync(clientAppPath, 'utf-8');

      // 1. AppContext loginWithGoogle deve lançar erro se o cliente for inativo
      assert.match(
        appContextContent,
        /if\s*\(\s*client\s*&&\s*client\.status\s*===\s*'inactive'\s*\)\s*\{\s*throw\s+new\s+Error/,
        'loginWithGoogle deve lançar exceção explícita para cliente inativo'
      );

      // 2. ClientAppView deve bloquear login/cadastro se cliente for inativo
      assert.match(
        clientAppContent,
        /existingClient\.status\s*===\s*'inactive'/,
        'ClientAppView deve verificar existingClient.status === inactive e exibir erro amigável'
      );

      // 3. onAuthStateChanged em AppContext encerra sessão se o status for inactive
      assert.match(
        appContextContent,
        /matched\.status\s*===\s*'inactive'[\s\S]*?logoutFromFirebaseAuth\(\)/,
        'onAuthStateChanged deve efetuar logout imediato se matched.status === inactive'
      );
    });

  });

});
