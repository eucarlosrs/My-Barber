import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('ETAPA 2.2I — Testes de Segurança das Firebase Storage Rules', () => {
  const storageRulesPath = path.resolve(process.cwd(), 'storage.rules');
  const rulesExist = fs.existsSync(storageRulesPath);
  const rulesContent = rulesExist ? fs.readFileSync(storageRulesPath, 'utf8') : '';

  // =========================================================================
  // PARTE 1: AUDITORIA ESTÁTICA DO ARQUIVO storage.rules
  // =========================================================================
  it('1. Arquivo storage.rules deve existir e declarar service firebase.storage com rules_version = 2', () => {
    assert.strictEqual(rulesExist, true, 'O arquivo /storage.rules deve existir na raiz do projeto');
    assert.match(rulesContent, /rules_version\s*=\s*['"]2['"]/, 'Deve declarar rules_version = "2"');
    assert.match(rulesContent, /service\s+firebase\.storage/, 'Deve declarar service firebase.storage');
    assert.match(rulesContent, /match\s+\/b\/\{bucket\}\/o/, 'Deve conter o ponto de entrada /b/{bucket}/o');
  });

  it('2. storage.rules deve conter regra de Default Deny global (match /{allPaths=**})', () => {
    assert.match(
      rulesContent,
      /match\s+\/\{allPaths=\*\*\}/,
      'Deve declarar match /{allPaths=**} para default deny'
    );
    assert.match(
      rulesContent,
      /allow\s+read,\s*write:\s*if\s+false;/,
      'Catch-all global deve negar read e write'
    );
  });

  it('3. storage.rules deve validar tamanho máximo de 5MB e MIME types permitidos server-side', () => {
    assert.match(rulesContent, /5\s*\*\s*1024\s*\*\s*1024/, 'Deve validar tamanho máximo de 5 * 1024 * 1024 bytes');
    assert.match(rulesContent, /'image\/jpeg'/, 'Deve incluir image/jpeg nos tipos permitidos');
    assert.match(rulesContent, /'image\/png'/, 'Deve incluir image/png nos tipos permitidos');
    assert.match(rulesContent, /'image\/webp'/, 'Deve incluir image/webp nos tipos permitidos');
  });

  it('4. storage.rules deve utilizar soberania dos Custom Claims sem fallbacks inseguros', () => {
    assert.match(rulesContent, /request\.auth\.token\.role/, 'Deve avaliar request.auth.token.role');
    assert.match(rulesContent, /request\.auth\.token\.tenantId/, 'Deve avaliar request.auth.token.tenantId');
    assert.doesNotMatch(
      rulesContent,
      /firestore\.get|get\(\/databases/,
      'Não deve conter lookups cross-database ou fallbacks inseguros'
    );
  });

  // =========================================================================
  // PARTE 2: SIMULADOR DO MOTOR DE REGRAS DE STORAGE (BASEADO RIGOROSAMENTE NO TEXTO)
  // =========================================================================

  interface StorageAuth {
    uid: string;
    token?: {
      role?: string;
      tenantId?: string;
      barbershopId?: string;
      isSuperAdmin?: boolean;
    };
  }

  interface StorageResource {
    size: number;
    contentType: string;
  }

  interface StorageSecurityContext {
    auth?: StorageAuth | null;
    resource?: StorageResource | null;
    requestResource?: StorageResource | null;
  }

  // Helpers exatos extraídos de storage.rules
  const isAuthenticated = (ctx: StorageSecurityContext) => !!ctx.auth && !!ctx.auth.uid;

  const getAuthRole = (ctx: StorageSecurityContext) => {
    return isAuthenticated(ctx) && ctx.auth?.token?.role != null ? ctx.auth.token.role : '';
  };

  const getAuthTenant = (ctx: StorageSecurityContext) => {
    if (!isAuthenticated(ctx)) return '';
    if (ctx.auth?.token?.tenantId != null) return ctx.auth.token.tenantId;
    if (ctx.auth?.token?.barbershopId != null) return ctx.auth.token.barbershopId;
    return '';
  };

  const isSuperAdmin = (ctx: StorageSecurityContext) => {
    return (
      isAuthenticated(ctx) &&
      (ctx.auth?.token?.role === 'super_admin' ||
        ctx.auth?.token?.role === 'SUPER_ADMIN' ||
        ctx.auth?.token?.isSuperAdmin === true)
    );
  };

  const isOwnerOfTenant = (ctx: StorageSecurityContext, tenantId: string) => {
    return (
      isAuthenticated(ctx) &&
      (isSuperAdmin(ctx) ||
        (getAuthTenant(ctx) === tenantId &&
          (getAuthRole(ctx) === 'barbershop_owner' ||
            getAuthRole(ctx) === 'PROPRIETARIO' ||
            getAuthRole(ctx) === 'owner')))
    );
  };

  const isManagerOrOwnerOfTenant = (ctx: StorageSecurityContext, tenantId: string) => {
    return (
      isAuthenticated(ctx) &&
      (isSuperAdmin(ctx) ||
        (getAuthTenant(ctx) === tenantId &&
          ['barbershop_owner', 'PROPRIETARIO', 'owner', 'manager', 'GERENTE'].includes(getAuthRole(ctx))))
    );
  };

  const isValidImageFile = (ctx: StorageSecurityContext) => {
    const req = ctx.requestResource;
    return (
      req != null &&
      req.size > 0 &&
      req.size <= 5 * 1024 * 1024 &&
      ['image/jpeg', 'image/png', 'image/webp'].includes(req.contentType)
    );
  };

  const isPublicMediaFolder = (folder: string) => {
    return [
      'barbershop_media',
      'professionals',
      'services',
      'logo',
      'banner',
      'gallery',
      'stories',
      'salon'
    ].includes(folder);
  };

  // Avaliador de autorização para o caminho: tenants/{tenantId}/{folder}/{fileName}
  const canAccessTenantStorage = (
    operation: 'read' | 'create' | 'update' | 'delete',
    tenantId: string,
    folder: string,
    ctx: StorageSecurityContext
  ): boolean => {
    if (operation === 'read') {
      return isPublicMediaFolder(folder) || isSuperAdmin(ctx) || isManagerOrOwnerOfTenant(ctx, tenantId);
    }
    if (operation === 'create' || operation === 'update') {
      return (isSuperAdmin(ctx) || isManagerOrOwnerOfTenant(ctx, tenantId)) && isValidImageFile(ctx);
    }
    if (operation === 'delete') {
      return isSuperAdmin(ctx) || isManagerOrOwnerOfTenant(ctx, tenantId);
    }
    return false;
  };

  // Avaliador de autorização para o caminho: raffles/{barbershopId}/{fileName}
  const canAccessRafflesStorage = (
    operation: 'read' | 'create' | 'update' | 'delete',
    barbershopId: string,
    ctx: StorageSecurityContext
  ): boolean => {
    if (operation === 'read') {
      return true;
    }
    if (operation === 'create' || operation === 'update') {
      return (isSuperAdmin(ctx) || isManagerOrOwnerOfTenant(ctx, barbershopId)) && isValidImageFile(ctx);
    }
    if (operation === 'delete') {
      return isSuperAdmin(ctx) || isManagerOrOwnerOfTenant(ctx, barbershopId);
    }
    return false;
  };

  const validImagePayload: StorageResource = {
    size: 1024 * 500, // 500 KB
    contentType: 'image/jpeg'
  };

  // =========================================================================
  // PARTE 3: CENÁRIOS MANDATÓRIOS (A até L) DE SEGURANÇA E ISOLAMENTO MULTI-TENANT
  // =========================================================================

  it('Cenário A: anonymous → upload tenant-A = DENY', () => {
    const anonymousCtx: StorageSecurityContext = {
      auth: null,
      requestResource: validImagePayload
    };
    const allowed = canAccessTenantStorage('create', 'tenant-A', 'gallery', anonymousCtx);
    assert.strictEqual(allowed, false, 'Usuário anônimo não pode fazer upload em tenant-A');
  });

  it('Cenário B: customer tenant-A → upload tenant-B = DENY', () => {
    const customerTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-client-a',
        token: { role: 'customer', tenantId: 'tenant-A' }
      },
      requestResource: validImagePayload
    };
    const allowed = canAccessTenantStorage('create', 'tenant-B', 'gallery', customerTenantACtx);
    assert.strictEqual(allowed, false, 'Cliente de tenant-A não pode fazer upload em tenant-B');
  });

  it('Cenário C: barber tenant-A → upload tenant-B = DENY', () => {
    const barberTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-barber-a',
        token: { role: 'barber', tenantId: 'tenant-A' }
      },
      requestResource: validImagePayload
    };
    const allowed = canAccessTenantStorage('create', 'tenant-B', 'gallery', barberTenantACtx);
    assert.strictEqual(allowed, false, 'Barbeiro de tenant-A não pode fazer upload em tenant-B');
  });

  it('Cenário D: manager tenant-A → upload tenant-B = DENY', () => {
    const managerTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-manager-a',
        token: { role: 'manager', tenantId: 'tenant-A' }
      },
      requestResource: validImagePayload
    };
    const allowed = canAccessTenantStorage('create', 'tenant-B', 'gallery', managerTenantACtx);
    assert.strictEqual(allowed, false, 'Gerente de tenant-A não pode fazer upload em tenant-B');
  });

  it('Cenário E: owner tenant-A → upload tenant-B = DENY', () => {
    const ownerTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-owner-a',
        token: { role: 'barbershop_owner', tenantId: 'tenant-A' }
      },
      requestResource: validImagePayload
    };
    const allowed = canAccessTenantStorage('create', 'tenant-B', 'gallery', ownerTenantACtx);
    assert.strictEqual(allowed, false, 'Proprietário de tenant-A não pode fazer upload em tenant-B');
  });

  it('Cenário F: owner tenant-A → próprio tenant = ALLOW (conforme permissão legítima)', () => {
    const ownerTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-owner-a',
        token: { role: 'barbershop_owner', tenantId: 'tenant-A' }
      },
      requestResource: validImagePayload
    };
    const allowed = canAccessTenantStorage('create', 'tenant-A', 'gallery', ownerTenantACtx);
    assert.strictEqual(allowed, true, 'Proprietário de tenant-A deve poder gerenciar mídia em seu próprio tenant');
  });

  it('Cenário G: super_admin → tenant-A = ALLOW (acesso administrativo legítimo)', () => {
    const superAdminCtx: StorageSecurityContext = {
      auth: {
        uid: 'user-super-admin',
        token: { role: 'super_admin', isSuperAdmin: true }
      },
      requestResource: validImagePayload
    };
    const allowed = canAccessTenantStorage('create', 'tenant-A', 'gallery', superAdminCtx);
    assert.strictEqual(allowed, true, 'Super Admin deve ter permissão para gerenciar mídia de qualquer tenant');
  });

  it('Cenário H: tenant-A → delete tenant-B = DENY', () => {
    const ownerTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-owner-a',
        token: { role: 'barbershop_owner', tenantId: 'tenant-A' }
      }
    };
    const allowed = canAccessTenantStorage('delete', 'tenant-B', 'gallery', ownerTenantACtx);
    assert.strictEqual(allowed, false, 'Usuário de tenant-A não pode deletar arquivos de tenant-B');
  });

  it('Cenário I: tenant-A → overwrite tenant-B = DENY', () => {
    const ownerTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-owner-a',
        token: { role: 'barbershop_owner', tenantId: 'tenant-A' }
      },
      requestResource: validImagePayload
    };
    const allowed = canAccessTenantStorage('update', 'tenant-B', 'gallery', ownerTenantACtx);
    assert.strictEqual(allowed, false, 'Usuário de tenant-A não pode sobrescrever arquivos de tenant-B');
  });

  it('Cenário J: arquivo > 5MB = DENY', () => {
    const ownerTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-owner-a',
        token: { role: 'barbershop_owner', tenantId: 'tenant-A' }
      },
      requestResource: {
        size: 5 * 1024 * 1024 + 1, // 5MB + 1 byte
        contentType: 'image/jpeg'
      }
    };
    const allowed = canAccessTenantStorage('create', 'tenant-A', 'gallery', ownerTenantACtx);
    assert.strictEqual(allowed, false, 'Upload de imagem com tamanho superior a 5MB deve ser rejeitado');
  });

  it('Cenário K: image/jpeg, image/png e image/webp válidos = ALLOW quando role/caminho permitidos', () => {
    const ownerTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-owner-a',
        token: { role: 'barbershop_owner', tenantId: 'tenant-A' }
      },
      requestResource: validImagePayload
    };

    // JPEG
    assert.strictEqual(canAccessTenantStorage('create', 'tenant-A', 'logo', ownerTenantACtx), true);

    // PNG
    ownerTenantACtx.requestResource = { size: 1024 * 200, contentType: 'image/png' };
    assert.strictEqual(canAccessTenantStorage('create', 'tenant-A', 'banner', ownerTenantACtx), true);

    // WEBP
    ownerTenantACtx.requestResource = { size: 1024 * 150, contentType: 'image/webp' };
    assert.strictEqual(canAccessTenantStorage('create', 'tenant-A', 'services', ownerTenantACtx), true);
  });

  it('Cenário L: MIME type não permitido = DENY (ex: application/pdf, text/html, video/mp4)', () => {
    const ownerTenantACtx: StorageSecurityContext = {
      auth: {
        uid: 'user-owner-a',
        token: { role: 'barbershop_owner', tenantId: 'tenant-A' }
      },
      requestResource: {
        size: 1024 * 50,
        contentType: 'application/pdf'
      }
    };

    assert.strictEqual(
      canAccessTenantStorage('create', 'tenant-A', 'gallery', ownerTenantACtx),
      false,
      'application/pdf deve ser rejeitado'
    );

    ownerTenantACtx.requestResource = { size: 1024 * 50, contentType: 'text/html' };
    assert.strictEqual(
      canAccessTenantStorage('create', 'tenant-A', 'gallery', ownerTenantACtx),
      false,
      'text/html deve ser rejeitado'
    );

    ownerTenantACtx.requestResource = { size: 1024 * 1000, contentType: 'video/mp4' };
    assert.strictEqual(
      canAccessTenantStorage('create', 'tenant-A', 'gallery', ownerTenantACtx),
      false,
      'video/mp4 deve ser rejeitado'
    );
  });

  // =========================================================================
  // PARTE 4: MÍDIA PÚBLICA VS PRIVADA E SORTEIOS (RAFFLES)
  // =========================================================================

  it('Leitura Pública vs Privada em tenants/{tenantId}/{folder}/', () => {
    const unauthenticatedCtx: StorageSecurityContext = { auth: null };
    const ownerTenantACtx: StorageSecurityContext = {
      auth: { uid: 'user-owner-a', token: { role: 'barbershop_owner', tenantId: 'tenant-A' } }
    };
    const strangerTenantBCtx: StorageSecurityContext = {
      auth: { uid: 'user-owner-b', token: { role: 'barbershop_owner', tenantId: 'tenant-B' } }
    };

    // Pastas de vitrine comercial: anônimo pode ler
    assert.strictEqual(canAccessTenantStorage('read', 'tenant-A', 'gallery', unauthenticatedCtx), true);
    assert.strictEqual(canAccessTenantStorage('read', 'tenant-A', 'professionals', unauthenticatedCtx), true);
    assert.strictEqual(canAccessTenantStorage('read', 'tenant-A', 'services', unauthenticatedCtx), true);

    // Pastas privadas / não-comerciais: anônimo recebe DENY
    assert.strictEqual(canAccessTenantStorage('read', 'tenant-A', 'private_docs', unauthenticatedCtx), false);
    // Estranho de tenant-B recebe DENY
    assert.strictEqual(canAccessTenantStorage('read', 'tenant-A', 'private_docs', strangerTenantBCtx), false);
    // Gestor de tenant-A recebe ALLOW
    assert.strictEqual(canAccessTenantStorage('read', 'tenant-A', 'private_docs', ownerTenantACtx), true);
  });

  it('Isolamento e Controle em raffles/{barbershopId}/', () => {
    const unauthenticatedCtx: StorageSecurityContext = { auth: null, requestResource: validImagePayload };
    const ownerTenantACtx: StorageSecurityContext = {
      auth: { uid: 'user-owner-a', token: { role: 'barbershop_owner', tenantId: 'tenant-A' } },
      requestResource: validImagePayload
    };
    const ownerTenantBCtx: StorageSecurityContext = {
      auth: { uid: 'user-owner-b', token: { role: 'barbershop_owner', tenantId: 'tenant-B' } },
      requestResource: validImagePayload
    };

    // Leitura: pública para visualização do prêmio pelos clientes
    assert.strictEqual(canAccessRafflesStorage('read', 'tenant-A', unauthenticatedCtx), true);

    // Upload anônimo: DENY
    assert.strictEqual(canAccessRafflesStorage('create', 'tenant-A', unauthenticatedCtx), false);

    // Upload por dono de tenant-B em sorteio de tenant-A: DENY
    assert.strictEqual(canAccessRafflesStorage('create', 'tenant-A', ownerTenantBCtx), false);

    // Upload por dono legítimo de tenant-A em seu sorteio: ALLOW
    assert.strictEqual(canAccessRafflesStorage('create', 'tenant-A', ownerTenantACtx), true);

    // Exclusão por dono de tenant-B em sorteio de tenant-A: DENY
    assert.strictEqual(canAccessRafflesStorage('delete', 'tenant-A', ownerTenantBCtx), false);

    // Exclusão por dono legítimo de tenant-A em seu sorteio: ALLOW
    assert.strictEqual(canAccessRafflesStorage('delete', 'tenant-A', ownerTenantACtx), true);
  });
});
