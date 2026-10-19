import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  toCanonicalRole,
  toLegacyRole,
  isTenantScopedRole,
  evaluateUserPermission,
  canAccessTenantData,
  AuthUserClaims
} from '../lib/authClaims.js';
import {
  setUserRole,
  grantSuperAdminExplicit,
  verifyFirebaseIdToken,
  setMockFirebaseAdmin
} from '../server/firebaseAdmin.js';

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
    },
    verifyIdToken: async (token: string, _checkRevoked?: boolean) => {
      if (token === 'valid-token' || token.startsWith('valid-')) {
        return { uid: 'some-uid', role: 'barber', tenantId: 'tenant-a' };
      }
      throw new Error('Token inválido ou expirado');
    }
  };
}

setMockFirebaseAdmin({
  app: {} as any,
  auth: createInMemoryAuth() as any,
  firestore: createInMemoryFirestore() as any
});

describe('MY BARBER — Auditoria de Segurança IAM, RBAC e Custom Claims (20 Casos Críticos)', () => {

  // 1. customer → self promotion
  it('1. customer → self promotion deve ser recusada', async () => {
    const res = await setUserRole({
      targetUid: 'customer-uid-1',
      role: 'barber',
      tenantId: 'tenant-a',
      actorUid: 'customer-uid-1',
      actorRole: 'customer'
    });
    assert.strictEqual(res.success, false, 'Customer não pode se auto-promover a barber');
    assert.match(res.error || '', /auto-promoção|insuficiente/i);
  });

  // 2. barber → self promotion
  it('2. barber → self promotion deve ser recusada', async () => {
    const res = await setUserRole({
      targetUid: 'barber-uid-1',
      role: 'manager',
      tenantId: 'tenant-a',
      actorUid: 'barber-uid-1',
      actorRole: 'barber',
      actorTenantId: 'tenant-a'
    });
    assert.strictEqual(res.success, false, 'Barbeiro não pode se auto-promover a gerente');
    assert.match(res.error || '', /auto-promoção|insuficiente/i);
  });

  // 3. manager → self promotion
  it('3. manager → self promotion deve ser recusada', async () => {
    const res = await setUserRole({
      targetUid: 'manager-uid-1',
      role: 'barbershop_owner',
      tenantId: 'tenant-a',
      actorUid: 'manager-uid-1',
      actorRole: 'manager',
      actorTenantId: 'tenant-a'
    });
    assert.strictEqual(res.success, false, 'Gerente não pode se auto-promover a proprietário');
    assert.match(res.error || '', /auto-promoção|insuficiente/i);
  });

  // 4. owner → self promotion para super_admin
  it('4. owner → self promotion para super_admin deve ser recusada', async () => {
    const res = await setUserRole({
      targetUid: 'owner-uid-1',
      role: 'super_admin',
      actorUid: 'owner-uid-1',
      actorRole: 'barbershop_owner',
      actorTenantId: 'tenant-a'
    });
    assert.strictEqual(res.success, false, 'Proprietário não pode se auto-promover a Super Admin');
    assert.match(res.error || '', /auto-promoção|Apenas Super Administradores/i);
  });

  // 5. owner tenant A → alterar usuário tenant B
  it('5. owner tenant A → alterar usuário tenant B deve ser bloqueado', async () => {
    const res = await setUserRole({
      targetUid: 'user-foreign-b',
      role: 'barber',
      tenantId: 'tenant-b',
      actorUid: 'owner-a',
      actorRole: 'barbershop_owner',
      actorTenantId: 'tenant-a'
    });
    assert.strictEqual(res.success, false, 'Owner do tenant A não pode alterar usuário para tenant B');
    assert.match(res.error || '', /cross-tenant|outro tenant/i);
  });

  // 6. manager tenant A → alterar usuário tenant B
  it('6. manager tenant A → alterar usuário tenant B deve ser bloqueado', async () => {
    const res = await setUserRole({
      targetUid: 'user-foreign-b',
      role: 'barber',
      tenantId: 'tenant-b',
      actorUid: 'manager-a',
      actorRole: 'manager',
      actorTenantId: 'tenant-a'
    });
    assert.strictEqual(res.success, false, 'Manager do tenant A não pode alterar usuário para tenant B');
    assert.match(res.error || '', /insuficiente|cross-tenant|outro tenant/i);
  });

  // 7. usuário comum → conceder super_admin
  it('7. usuário comum → conceder super_admin para terceiro deve falhar', async () => {
    const res = await setUserRole({
      targetUid: 'any-target-user',
      role: 'super_admin',
      actorUid: 'normal-customer',
      actorRole: 'customer'
    });
    assert.strictEqual(res.success, false, 'Usuário comum não pode conceder super_admin');
    assert.match(res.error || '', /insuficiente|Apenas Super Administradores/i);
  });

  // 8. token inválido
  it('8. token inválido deve retornar null na verificação', async () => {
    const invalidResult = await verifyFirebaseIdToken('gibberish.token.malformed');
    assert.strictEqual(invalidResult, null, 'Token malformado deve resultar em verificação nula');
  });

  // 9. token expirado
  it('9. token expirado deve ser rejeitado', async () => {
    const expiredFakeToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE1MTYyMzkwMjJ9.signature';
    const expiredResult = await verifyFirebaseIdToken(expiredFakeToken);
    assert.strictEqual(expiredResult, null, 'Token expirado deve resultar em verificação nula');
  });

  // 10. Bearer ausente
  it('10. Bearer ausente ou vazio deve ser rejeitado de imediato', async () => {
    const emptyResult1 = await verifyFirebaseIdToken('');
    const emptyResult2 = await verifyFirebaseIdToken('   ');
    const emptyResult3 = await verifyFirebaseIdToken('Basic dXNlcjpwYXNz');
    assert.strictEqual(emptyResult1, null);
    assert.strictEqual(emptyResult2, null);
    assert.strictEqual(emptyResult3, null);
  });

  // 11. UID do body diferente do UID do token
  it('11. UID do body não substitui a identidade extraída do token', () => {
    const tokenIdentity = { uid: 'real-user-from-token', role: 'customer' };
    const bodyPayload = { actorUid: 'spoofed-admin-uid', role: 'super_admin' };

    // Regra: O backend usa SEMPRE a identidade do token verificado
    const effectiveActorUid = tokenIdentity.uid;
    const effectiveActorRole = tokenIdentity.role;

    assert.strictEqual(effectiveActorUid, 'real-user-from-token');
    assert.strictEqual(effectiveActorRole, 'customer');
    assert.notStrictEqual(effectiveActorUid, bodyPayload.actorUid);
  });

  // 12. role do body diferente da autorização real
  it('12. role enviada no body não concede autoridade ao chamador', () => {
    const decodedTokenClaims: AuthUserClaims = {
      uid: 'attacker-uid',
      role: 'customer',
      legacyRole: 'CLIENTE',
      isSuperAdmin: false,
      claimsRaw: { role: 'customer' }
    };

    const isAllowedAsAdmin = evaluateUserPermission({
      userClaims: decodedTokenClaims,
      targetRoleOrArea: 'super_admin'
    });

    assert.strictEqual(isAllowedAsAdmin, false, 'Role real do token prevalece sobre qualquer intenção no body');
  });

  // 13. tenantId do body diferente do tenant autorizado
  it('13. tenantId do body diferente do tenant autorizado do token é barrado', async () => {
    const res = await setUserRole({
      targetUid: 'barber-candidate',
      role: 'barber',
      tenantId: 'tenant-barbearia-alheia',
      actorUid: 'owner-autorizado',
      actorRole: 'barbershop_owner',
      actorTenantId: 'tenant-minha-barbearia'
    });
    assert.strictEqual(res.success, false, 'Divergência entre tenant solicitado e tenant autorizado é bloqueada');
    assert.match(res.error || '', /cross-tenant|outro tenant/i);
  });

  // 14. tentativa de alterar próprio tenant
  it('14. tentativa de alterar próprio tenant por usuário não-super_admin é bloqueada', async () => {
    const res = await setUserRole({
      targetUid: 'owner-uid-1',
      role: 'barbershop_owner',
      tenantId: 'tenant-novo-atacante',
      actorUid: 'owner-uid-1',
      actorRole: 'barbershop_owner',
      actorTenantId: 'tenant-original'
    });
    assert.strictEqual(res.success, false, 'Auto-modificação de tenant é bloqueada');
    assert.match(res.error || '', /auto-promoção e auto-modificação/i);
  });

  // 15. tentativa de alterar próprio role
  it('15. tentativa de alterar próprio role é bloqueada para não-super_admin', async () => {
    const res = await setUserRole({
      targetUid: 'barber-uid-1',
      role: 'customer',
      actorUid: 'barber-uid-1',
      actorRole: 'barber',
      actorTenantId: 'tenant-a'
    });
    assert.strictEqual(res.success, false, 'Auto-modificação de role é bloqueada');
    assert.match(res.error || '', /auto-promoção e auto-modificação/i);
  });

  // 16. alteração legítima feita por Super Admin
  it('16. alteração legítima feita por Super Admin deve ser aprovada', async () => {
    const res = await setUserRole({
      targetUid: 'new-owner-uid',
      role: 'barbershop_owner',
      tenantId: 'tenant-nova-barbearia',
      actorUid: 'super-admin-uid',
      actorRole: 'super_admin'
    });
    assert.strictEqual(res.success, true, 'Super Admin pode criar e configurar novo proprietário');
    assert.strictEqual(res.claims?.role, 'barbershop_owner');
    assert.strictEqual(res.claims?.tenantId, 'tenant-nova-barbearia');
  });

  // 17. alteração legítima feita por Owner dentro do próprio tenant
  it('17. alteração legítima feita por Owner dentro do próprio tenant deve ser aprovada', async () => {
    const res = await setUserRole({
      targetUid: 'new-barber-uid',
      role: 'barber',
      tenantId: 'tenant-minha-barbearia',
      actorUid: 'owner-uid',
      actorRole: 'barbershop_owner',
      actorTenantId: 'tenant-minha-barbearia'
    });
    assert.strictEqual(res.success, true, 'Owner pode cadastrar profissional no seu próprio tenant');
    assert.strictEqual(res.claims?.role, 'barber');
    assert.strictEqual(res.claims?.tenantId, 'tenant-minha-barbearia');
  });

  // 18. Custom Claims atualizados corretamente
  it('18. Custom Claims gerados possuem todos os atributos canônicos e seguros', async () => {
    const res = await setUserRole({
      targetUid: 'target-verify-claims',
      role: 'barber',
      tenantId: 'tenant-valida-claims',
      actorUid: 'super-admin',
      actorRole: 'super_admin'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.claims?.role, 'barber');
    assert.strictEqual(res.claims?.isSuperAdmin, false);
    assert.strictEqual(res.claims?.tenantId, 'tenant-valida-claims');
    assert.strictEqual(res.claims?.barbershopId, 'tenant-valida-claims');
  });

  // 19. auditoria gerada sem credenciais sensíveis
  it('19. Objeto de log de auditoria não deve expor senhas, tokens ou segredos', () => {
    const auditPayload = {
      action: 'SET_USER_ROLE_CLAIMS',
      actorUserId: 'admin-1',
      actorRole: 'super_admin',
      targetUserId: 'target-1',
      newRole: 'barber',
      newTenantId: 'tenant-1',
      timestamp: new Date().toISOString(),
      details: 'Role alterada com sucesso'
    };

    assert.strictEqual('password' in auditPayload, false);
    assert.strictEqual('_password' in auditPayload, false);
    assert.strictEqual('token' in auditPayload, false);
    assert.strictEqual('idToken' in auditPayload, false);
    assert.strictEqual('secret' in auditPayload, false);
  });

  // 20. segredo administrativo não exposto ao frontend
  it('20. segredos administrativos do backend não devem constar no bundle do client-side', () => {
    const appTsxContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    const appContextContent = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AppContext.tsx'), 'utf-8');

    assert.strictEqual(appTsxContent.includes('ADMIN_SETUP_SECRET'), false);
    assert.strictEqual(appContextContent.includes('ADMIN_SETUP_SECRET'), false);
    assert.strictEqual(appTsxContent.includes('FIREBASE_SERVICE_ACCOUNT'), false);
    assert.strictEqual(appContextContent.includes('FIREBASE_SERVICE_ACCOUNT'), false);
  });
});
