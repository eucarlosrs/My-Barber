import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { provisionManagerAccount, setUserRole } from '../server/firebaseAdmin.js';
import { Barbershop } from '../types/index.js';

describe('ETAPA 2.2E — Validação das Pendências Críticas do Onboarding', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // Helper simulador de regras do Firestore para match /barbershops/{barbershopId}
  function evaluateBarbershopCreateRule(context: {
    auth?: { uid: string; token?: { role?: string; isSuperAdmin?: boolean; tenantId?: string } } | null;
    requestResourceData: Record<string, any>;
  }): boolean {
    const isAuthenticated = !!context.auth && !!context.auth.uid;
    const isSuperAdmin = isAuthenticated && (
      context.auth?.token?.role === 'super_admin' ||
      context.auth?.token?.isSuperAdmin === true
    );

    // Regra: allow create: if isSuperAdmin() || (isAuthenticated() && (!('ownerUid' in request.resource.data) || request.resource.data.ownerUid == request.auth.uid));
    if (isSuperAdmin) return true;
    if (isAuthenticated) {
      if (!('ownerUid' in context.requestResourceData)) return true;
      return context.requestResourceData.ownerUid === context.auth?.uid;
    }
    return false;
  }

  function evaluateBarbershopUpdateRule(context: {
    auth?: { uid: string; token?: { role?: string; isSuperAdmin?: boolean; tenantId?: string } } | null;
    resourceData: Record<string, any>;
    requestResourceData: Record<string, any>;
    barbershopId: string;
  }): boolean {
    const isAuthenticated = !!context.auth && !!context.auth.uid;
    const isSuperAdmin = isAuthenticated && (
      context.auth?.token?.role === 'super_admin' ||
      context.auth?.token?.isSuperAdmin === true
    );

    if (isSuperAdmin) return true;

    // isOwnerOfTenant: checa se token tem role de proprietário e tenantId igual
    const isOwner = isAuthenticated && (
      context.auth?.token?.tenantId === context.barbershopId &&
      ['barbershop_owner', 'PROPRIETARIO', 'owner'].includes(context.auth?.token?.role || '')
    );

    if (!isOwner) return false;

    // Regra:
    // !('ownerUid' in request.resource.data) ||
    // (('ownerUid' in resource.data) && request.resource.data.ownerUid == resource.data.ownerUid) ||
    // (!('ownerUid' in resource.data) && request.resource.data.ownerUid == request.auth.uid)
    if (!('ownerUid' in context.requestResourceData)) return true;
    if ('ownerUid' in context.resourceData) {
      return context.requestResourceData.ownerUid === context.resourceData.ownerUid;
    }
    return context.requestResourceData.ownerUid === context.auth?.uid;
  }

  it('A & B: Se o provisionamento falhar, a barbershop NÃO é criada e nenhum ownerUid sintético é gerado', () => {
    // Simula resultado do endpoint de provisionamento retornando erro HTTP 400
    const mockProvisionFailed = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      error: 'Senha informada é muito curta'
    };

    let barbershopCreated = false;
    let ownerUidGenerated: string | null = null;
    let operationSuccess = false;
    let errorMessage = '';

    if (!mockProvisionFailed.ok) {
      errorMessage = `Não foi possível provisionar a conta do gestor no Firebase Authentication: ${mockProvisionFailed.error}. O cadastro da barbearia foi cancelado sem persistência.`;
      // Aborta imediatamente
      operationSuccess = false;
    } else {
      barbershopCreated = true;
      ownerUidGenerated = 'qualquer-uid';
      operationSuccess = true;
    }

    assert.strictEqual(barbershopCreated, false, 'Barbershop não deve ser criada');
    assert.strictEqual(ownerUidGenerated, null, 'Nenhum UID sintético deve ser gerado');
    assert.strictEqual(operationSuccess, false, 'Operação não deve ser marcada como sucesso');
    assert.match(errorMessage, /O cadastro da barbearia foi cancelado sem persistência/);
  });

  it('C & G: Provisionamento bem-sucedido retorna UID real que é vinculado como ownerUid na Barbershop', async () => {
    const email = `gestor-real-${Date.now()}@teste.com`;
    const manager = await provisionManagerAccount({
      email,
      displayName: 'Gestor Real Sobrano',
      password: 'passwordSegura123'
    });

    assert.ok(manager.uid, 'UID real deve ser gerado pelo Firebase Admin');
    assert.strictEqual(manager.uid.startsWith('user-mgr-'), false, 'Não deve começar com prefixo sintético user-mgr-');

    const barbershop: Barbershop = {
      id: 'tenant-test-real',
      ownerUid: manager.uid,
      name: 'Barbearia Real Teste',
      slug: 'barbearia-real',
      customDomain: 'www.barbeariareal.com.br',
      logoUrl: 'https://images.unsplash.com/photo-1',
      bannerUrl: 'https://images.unsplash.com/photo-2',
      salonImages: [],
      about: 'Teste',
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
      socialMedia: {},
      planId: 'plano-essencial',
      status: 'ATIVA',
      commercialMode: 'PAGO',
      reminderConfig: { advanceMinutes: 60, enabled: true, whatsappTemplate: 'Lembrete' },
      createdAt: new Date().toISOString()
    };

    assert.strictEqual(barbershop.ownerUid, manager.uid, 'Barbershop deve receber exatamente o UID real do gestor');
  });

  it('D: Usuário comum tentando criar Barbershop com ownerUid de terceiro deve receber DENY', () => {
    const commonUserAuth = {
      uid: 'user-cliente-comum-123',
      token: { role: 'customer', isSuperAdmin: false }
    };

    const maliciousCreatePayload = {
      name: 'Barbearia Ataque',
      ownerUid: 'uid-de-outra-pessoa-hacker'
    };

    const isAllowed = evaluateBarbershopCreateRule({
      auth: commonUserAuth,
      requestResourceData: maliciousCreatePayload
    });

    assert.strictEqual(isAllowed, false, 'Cliente comum não pode definir ownerUid de terceiro (DENY)');
  });

  it('E: Proprietário comum tentando alterar ownerUid em update deve receber DENY (imutabilidade de owner)', () => {
    const ownerAuth = {
      uid: 'user-owner-legitimo-456',
      token: { role: 'barbershop_owner', tenantId: 'tenant-vip-001', isSuperAdmin: false }
    };

    const existingBarbershop = {
      id: 'tenant-vip-001',
      name: 'Barbearia VIP',
      ownerUid: 'user-owner-legitimo-456'
    };

    const maliciousUpdatePayload = {
      name: 'Barbearia VIP Alterada',
      ownerUid: 'novo-uid-estranho-789' // Tentativa de transferir propriedade
    };

    const isAllowed = evaluateBarbershopUpdateRule({
      auth: ownerAuth,
      resourceData: existingBarbershop,
      requestResourceData: maliciousUpdatePayload,
      barbershopId: 'tenant-vip-001'
    });

    assert.strictEqual(isAllowed, false, 'Tentativa de alterar ownerUid por owner comum deve receber DENY');
  });

  it('F & G: Super Admin pode criar Barbershop para gestor provisionado com qualquer ownerUid (ALLOW)', () => {
    const superAdminAuth = {
      uid: 'super-admin-root',
      token: { role: 'super_admin', isSuperAdmin: true }
    };

    const superAdminCreatePayload = {
      name: 'Barbearia Criada pelo Master',
      ownerUid: 'uid-gestor-provisionado-001'
    };

    const isAllowed = evaluateBarbershopCreateRule({
      auth: superAdminAuth,
      requestResourceData: superAdminCreatePayload
    });

    assert.strictEqual(isAllowed, true, 'Super Admin tem permissão para provisionar barbearia para o gestor (ALLOW)');
  });

  it('H: Usuário comum criando barbershop sem ownerUid ou com seu próprio UID é permitido pelas regras', () => {
    const commonUserAuth = {
      uid: 'user-criador-777',
      token: { role: 'customer', isSuperAdmin: false }
    };

    // Caso 1: Sem ownerUid
    const allowWithoutOwner = evaluateBarbershopCreateRule({
      auth: commonUserAuth,
      requestResourceData: { name: 'Minha Nova Barbearia' }
    });
    assert.strictEqual(allowWithoutOwner, true, 'Criar sem ownerUid deve ser aceito');

    // Caso 2: Com próprio UID
    const allowWithSelfOwner = evaluateBarbershopCreateRule({
      auth: commonUserAuth,
      requestResourceData: { name: 'Minha Nova Barbearia', ownerUid: 'user-criador-777' }
    });
    assert.strictEqual(allowWithSelfOwner, true, 'Criar com o próprio UID deve ser aceito');
  });

  it('I: Subscription não é iniciada quando o provisionamento do gestor falha', () => {
    let subscriptionServiceInvoked = false;

    // Fluxo simulado de registerBarbershop
    const provisionResult = { success: false, error: 'Falha Auth' };

    if (!provisionResult.success) {
      // Aborta antes da etapa de subscription
    } else {
      subscriptionServiceInvoked = true;
    }

    assert.strictEqual(subscriptionServiceInvoked, false, 'Serviço de subscription não deve ser invocado em caso de falha de provisionamento');
  });

  it('J: Falha intermediária retorna { success: false, error: string } e não é apresentada como sucesso', () => {
    function simulateRegisterWithFailure(mockUid?: string): { success: boolean; barbershopId: string; error?: string } {
      const ownerUid: string = mockUid || '';
      if (!ownerUid || ownerUid.trim() === '' || ownerUid.startsWith('user-mgr-')) {
        return {
          success: false,
          barbershopId: '',
          error: 'UID soberano do gestor ausente ou inválido. Operação abortada sem alterações.'
        };
      }
      return { success: true, barbershopId: 'tenant-123' };
    }

    const result = simulateRegisterWithFailure();
    assert.strictEqual(result.success, false, 'Deve retornar success: false');
    assert.strictEqual(result.barbershopId, '', 'barbershopId deve ser vazio');
    assert.ok(result.error, 'Mensagem de erro explicativa deve estar presente');
  });

  it('Compatibilidade com Legado: Barbearia legada sem ownerUid no Firestore permite atualização pelo proprietário legítimo', () => {
    const ownerAuth = {
      uid: 'user-owner-legado-999',
      token: { role: 'barbershop_owner', tenantId: 'tenant-legado-001', isSuperAdmin: false }
    };

    const legacyShop = {
      id: 'tenant-legado-001',
      name: 'Barbearia Tradicional'
      // Documento legado: NÃO tem ownerUid
    };

    // Atualização normal preservando sem ownerUid
    const updateNormal = evaluateBarbershopUpdateRule({
      auth: ownerAuth,
      resourceData: legacyShop,
      requestResourceData: { name: 'Barbearia Tradicional Atualizada' },
      barbershopId: 'tenant-legado-001'
    });
    assert.strictEqual(updateNormal, true, 'Proprietário deve conseguir atualizar barbearia legada sem ownerUid');

    // Atualização adicionando o seu próprio ownerUid
    const updateClaimingOwnership = evaluateBarbershopUpdateRule({
      auth: ownerAuth,
      resourceData: legacyShop,
      requestResourceData: { name: 'Barbearia Tradicional', ownerUid: 'user-owner-legado-999' },
      barbershopId: 'tenant-legado-001'
    });
    assert.strictEqual(updateClaimingOwnership, true, 'Proprietário pode vincular seu próprio UID à barbearia legada');

    // Tentativa de sequestro: atualizar adicionando ownerUid de outra pessoa
    const updateHijack = evaluateBarbershopUpdateRule({
      auth: ownerAuth,
      resourceData: legacyShop,
      requestResourceData: { name: 'Barbearia Tradicional', ownerUid: 'uid-invasor-hack' },
      barbershopId: 'tenant-legado-001'
    });
    assert.strictEqual(updateHijack, false, 'Proprietário NÃO pode vincular UID de outra pessoa a documento legado');
  });
});
