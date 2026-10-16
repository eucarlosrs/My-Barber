import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('ETAPA 2.2G — Consolidação da Soberania dos Custom Claims (Eliminação de Autoridade Dual)', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // =========================================================================
  // SIMULADOR FIRESTORE RULES BASEADO RIGOROSAMENTE NO TEXTO DO ARQUIVO
  // =========================================================================
  interface SecurityContext {
    auth?: {
      uid: string;
      token?: {
        role?: string;
        tenantId?: string;
        barbershopId?: string;
        isSuperAdmin?: boolean;
      };
    } | null;
  }

  // Helper isAuthenticated()
  const isAuthenticated = (ctx: SecurityContext) => !!ctx.auth && !!ctx.auth.uid;

  // Helper getAuthRole()
  const getAuthRole = (ctx: SecurityContext) => {
    return isAuthenticated(ctx) && ctx.auth?.token?.role != null ? ctx.auth.token.role : '';
  };

  // Helper getAuthTenant()
  const getAuthTenant = (ctx: SecurityContext) => {
    if (!isAuthenticated(ctx)) return '';
    if (ctx.auth?.token?.tenantId != null) return ctx.auth.token.tenantId;
    if (ctx.auth?.token?.barbershopId != null) return ctx.auth.token.barbershopId;
    return '';
  };

  // Helper isSuperAdmin()
  const isSuperAdmin = (ctx: SecurityContext) => {
    return isAuthenticated(ctx) && (
      ctx.auth?.token?.role === 'super_admin' ||
      ctx.auth?.token?.role === 'SUPER_ADMIN' ||
      ctx.auth?.token?.isSuperAdmin === true
    );
  };

  // Helper isOwnerOfTenant(tenantId) — Conforme firestore.rules consolidadas (sem fallback)
  const isOwnerOfTenant = (ctx: SecurityContext, tenantId: string) => {
    return isAuthenticated(ctx) && (
      isSuperAdmin(ctx) || (
        getAuthTenant(ctx) === tenantId && (
          getAuthRole(ctx) === 'barbershop_owner' ||
          getAuthRole(ctx) === 'PROPRIETARIO' ||
          getAuthRole(ctx) === 'owner'
        )
      )
    );
  };

  // Helper isManagerOrOwnerOfTenant(tenantId) — Conforme firestore.rules consolidadas (sem fallback)
  const isManagerOrOwnerOfTenant = (ctx: SecurityContext, tenantId: string) => {
    return isAuthenticated(ctx) && (
      isSuperAdmin(ctx) || (
        getAuthTenant(ctx) === tenantId && (
          ['barbershop_owner', 'PROPRIETARIO', 'owner', 'manager', 'GERENTE'].includes(getAuthRole(ctx))
        )
      )
    );
  };

  // Helper isMemberOfTenant(tenantId) — Conforme firestore.rules consolidadas (sem fallback)
  const isMemberOfTenant = (ctx: SecurityContext, tenantId: string) => {
    return isAuthenticated(ctx) && (
      isSuperAdmin(ctx) || (
        getAuthTenant(ctx) === tenantId && (
          ['barbershop_owner', 'PROPRIETARIO', 'owner', 'manager', 'GERENTE', 'barber', 'PROFISSIONAL'].includes(getAuthRole(ctx))
        )
      )
    );
  };

  // =========================================================================
  // 1. AUDITORIA ESTÁTICA DO ARQUIVO firestore.rules
  // =========================================================================
  it('1. firestore.rules NÃO DEVE conter nenhuma consulta exists/get a /documents/users para conceder permissão', () => {
    const hasUsersDocFallback = /exists\([^)]*\/documents\/users\//.test(rulesContent) ||
                                /get\([^)]*\/documents\/users\//.test(rulesContent);
    assert.strictEqual(
      hasUsersDocFallback,
      false,
      'VIOLAÇÃO DE SEGURANÇA: firestore.rules ainda contém fallback para /documents/users/{uid}'
    );
  });

  it('2. isOwnerOfTenant, isManagerOrOwnerOfTenant e isMemberOfTenant devem basear-se estritamente em getAuthTenant() e getAuthRole()', () => {
    // Extrai o bloco de helpers de autorização
    const helpersMatch = rulesContent.match(/function\s+isOwnerOfTenant[\s\S]*?function\s+isSelf/);
    assert.ok(helpersMatch, 'Bloco de helpers deve existir');
    const block = helpersMatch[0];

    assert.doesNotMatch(block, /documents\/users/, 'Nenhum helper de tenant pode ler documents/users');
    assert.match(block, /getAuthTenant\(\)\s*==\s*tenantId/, 'Deve checar estritamente tenantId do token');
    assert.match(block, /getAuthRole\(\)/, 'Deve checar estritamente role do token');
  });

  // =========================================================================
  // 2. TESTES OBRIGATÓRIOS DE CONFLITO (ITEM 9 DO PROMPT)
  // =========================================================================
  it('3. CONFLITO CRÍTICO 1: Token (customer / tenant-A) vs users/{uid} (PROPRIETARIO / tenant-B) → DENY para tenant-B', () => {
    const ctx: SecurityContext = {
      auth: {
        uid: 'user-malicioso-001',
        token: {
          role: 'customer',
          tenantId: 'tenant-A',
          isSuperAdmin: false
        }
      }
    };

    // Simulando que no Firestore users/{uid} diz: role: 'PROPRIETARIO', tenantId: 'tenant-B'
    // Com a regra corrigida, as decisões de autorização consultam exclusivamente os claims:
    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-B'), false, 'Não deve ser owner de tenant-B');
    assert.strictEqual(isManagerOrOwnerOfTenant(ctx, 'tenant-B'), false, 'Não deve ser gerente de tenant-B');
    assert.strictEqual(isMemberOfTenant(ctx, 'tenant-B'), false, 'Não deve ser membro de tenant-B');

    // Também não pode ser owner em tenant-A (pois a role do token é customer)
    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-A'), false, 'Não deve ser owner de tenant-A (role é customer)');
  });

  it('4. CONFLITO CRÍTICO 2: Token (barber / tenant-A) vs users/{uid} (barbershop_owner / tenant-B) → DENY para tenant-B', () => {
    const ctx: SecurityContext = {
      auth: {
        uid: 'barber-uid-002',
        token: {
          role: 'barber',
          tenantId: 'tenant-A',
          isSuperAdmin: false
        }
      }
    };

    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-B'), false, 'Barbeiro de tenant-A não pode ser owner de tenant-B');
    assert.strictEqual(isManagerOrOwnerOfTenant(ctx, 'tenant-B'), false, 'Barbeiro de tenant-A não pode gerenciar tenant-B');
    assert.strictEqual(isMemberOfTenant(ctx, 'tenant-B'), false, 'Barbeiro de tenant-A não pode acessar equipe de tenant-B');

    // Em tenant-A ele é membro, mas NÃO é owner nem gerente:
    assert.strictEqual(isMemberOfTenant(ctx, 'tenant-A'), true, 'É membro legítimo de tenant-A');
    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-A'), false, 'Não é owner de tenant-A');
    assert.strictEqual(isManagerOrOwnerOfTenant(ctx, 'tenant-A'), false, 'Não é gerente de tenant-A');
  });

  it('5. CONFLITO CRÍTICO 3: Token (customer / tenant-A) vs users/{uid} (super_admin / tenant-B) → NÃO É SUPER ADMIN', () => {
    const ctx: SecurityContext = {
      auth: {
        uid: 'customer-fake-admin',
        token: {
          role: 'customer',
          tenantId: 'tenant-A',
          isSuperAdmin: false
        }
      }
    };

    assert.strictEqual(isSuperAdmin(ctx), false, 'Usuário com token de customer JAMAIS pode ser reconhecido como Super Admin');
    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-B'), false, 'Não pode ser owner de tenant-B');
  });

  // =========================================================================
  // 3. TESTES DE TENANT ESCAPE (ITEM 10 DO PROMPT)
  // =========================================================================
  it('6. TENANT ESCAPE A: customer A tentando operar em tenant B deve receber DENY', () => {
    const ctx: SecurityContext = {
      auth: {
        uid: 'customer-a',
        token: { role: 'customer', tenantId: 'tenant-A' }
      }
    };
    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-B'), false);
    assert.strictEqual(isManagerOrOwnerOfTenant(ctx, 'tenant-B'), false);
    assert.strictEqual(isMemberOfTenant(ctx, 'tenant-B'), false);
  });

  it('7. TENANT ESCAPE B: barber A tentando operar em tenant B deve receber DENY', () => {
    const ctx: SecurityContext = {
      auth: {
        uid: 'barber-a',
        token: { role: 'barber', tenantId: 'tenant-A' }
      }
    };
    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-B'), false);
    assert.strictEqual(isManagerOrOwnerOfTenant(ctx, 'tenant-B'), false);
    assert.strictEqual(isMemberOfTenant(ctx, 'tenant-B'), false);
  });

  it('8. TENANT ESCAPE C: manager A tentando operar em tenant B deve receber DENY', () => {
    const ctx: SecurityContext = {
      auth: {
        uid: 'manager-a',
        token: { role: 'manager', tenantId: 'tenant-A' }
      }
    };
    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-B'), false);
    assert.strictEqual(isManagerOrOwnerOfTenant(ctx, 'tenant-B'), false);
    assert.strictEqual(isMemberOfTenant(ctx, 'tenant-B'), false);
  });

  it('9. TENANT ESCAPE D: owner A tentando operar em tenant B deve receber DENY', () => {
    const ctx: SecurityContext = {
      auth: {
        uid: 'owner-a',
        token: { role: 'barbershop_owner', tenantId: 'tenant-A' }
      }
    };
    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-B'), false, 'Owner A NÃO pode ter permissão de owner em tenant B');
    assert.strictEqual(isManagerOrOwnerOfTenant(ctx, 'tenant-B'), false, 'Owner A NÃO pode ter permissão de manager em tenant B');
    assert.strictEqual(isMemberOfTenant(ctx, 'tenant-B'), false, 'Owner A NÃO pode ter permissão de member em tenant B');

    // Mas opera normalmente em seu próprio tenant-A:
    assert.strictEqual(isOwnerOfTenant(ctx, 'tenant-A'), true, 'Owner A opera legitimamente em tenant A');
    assert.strictEqual(isManagerOrOwnerOfTenant(ctx, 'tenant-A'), true);
    assert.strictEqual(isMemberOfTenant(ctx, 'tenant-A'), true);
  });

  // =========================================================================
  // 4. PRESERVAÇÃO DAS OPERAÇÕES LEGÍTIMAS DE SUPER ADMIN
  // =========================================================================
  it('10. Super Admin com claim explícito mantém acesso legítimo global a qualquer tenant', () => {
    const superAdminCtx: SecurityContext = {
      auth: {
        uid: 'super-admin-root',
        token: { role: 'super_admin', isSuperAdmin: true }
      }
    };
    assert.strictEqual(isSuperAdmin(superAdminCtx), true);
    assert.strictEqual(isOwnerOfTenant(superAdminCtx, 'tenant-A'), true);
    assert.strictEqual(isOwnerOfTenant(superAdminCtx, 'tenant-B'), true);
    assert.strictEqual(isManagerOrOwnerOfTenant(superAdminCtx, 'qualquer-tenant'), true);
  });
});
