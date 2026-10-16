import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// SIMULADOR DO MOTOR DAS FIRESTORE SECURITY RULES (ETAPA 2.2M)
// ============================================================================

interface MockDatabase {
  barbershops: Record<string, any>;
  users: Record<string, any>;
  services: Record<string, any>;
  appointments: Record<string, any>;
}

interface RuleAuth {
  uid: string;
  token: {
    role?: string;
    isSuperAdmin?: boolean;
    tenantId?: string;
    barbershopId?: string;
    phone_number?: string;
  };
}

interface RequestContext {
  auth: RuleAuth | null;
  resource?: {
    data: Record<string, any>;
  };
}

/**
 * Avaliador fiel das expressões booleanas do match /appointments/{appointmentId}
 * tal como definidas em firestore.rules.
 */
function evaluateAppointmentRules(
  operation: 'create' | 'update' | 'delete' | 'read',
  incomingData: Record<string, any> | null,
  existingData: Record<string, any> | null,
  auth: RuleAuth | null,
  db: MockDatabase
): { allowed: boolean; reason?: string } {
  const isAuthenticated = auth !== null && auth.uid !== undefined && auth.uid !== '';

  const getAuthRole = (): string => {
    return isAuthenticated && auth?.token?.role ? auth.token.role : '';
  };

  const getAuthTenant = (): string => {
    if (!isAuthenticated || !auth) return '';
    if (auth.token.tenantId) return auth.token.tenantId;
    if (auth.token.barbershopId) return auth.token.barbershopId;
    return '';
  };

  const isSuperAdmin = (): boolean => {
    if (!isAuthenticated || !auth) return false;
    return (
      auth.token.role === 'super_admin' ||
      auth.token.role === 'SUPER_ADMIN' ||
      auth.token.isSuperAdmin === true
    );
  };

  const isMemberOfTenant = (tenantId: string): boolean => {
    if (!isAuthenticated || !auth) return false;
    if (isSuperAdmin()) return true;
    const memberRoles = [
      'barbershop_owner',
      'PROPRIETARIO',
      'owner',
      'manager',
      'GERENTE',
      'barber',
      'PROFISSIONAL'
    ];
    return getAuthTenant() === tenantId && memberRoles.includes(getAuthRole());
  };

  if (operation === 'create') {
    if (!incomingData) return { allowed: false, reason: 'Nenhum payload enviado' };

    const allowedKeys = [
      'id', 'tenantId', 'serviceId', 'serviceName', 'servicePrice', 'serviceDuration',
      'professionalId', 'professionalName', 'clientId', 'clientName', 'clientWhatsApp',
      'date', 'startTime', 'endTime', 'isEncaixe', 'status', 'notes', 'reminderSent',
      'reminderSentAt', 'createdAt'
    ];

    const incomingKeys = Object.keys(incomingData);
    const hasOnlyAllowedKeys = incomingKeys.every(k => allowedKeys.includes(k));
    if (!hasOnlyAllowedKeys) {
      return { allowed: false, reason: 'Campo não permitido detectado (hasOnly rejeitado)' };
    }

    if (typeof incomingData.tenantId !== 'string' || incomingData.tenantId.length === 0 || incomingData.tenantId.length > 64) {
      return { allowed: false, reason: 'tenantId inválido' };
    }
    if (typeof incomingData.date !== 'string') return { allowed: false, reason: 'date inválida' };
    if (typeof incomingData.startTime !== 'string') return { allowed: false, reason: 'startTime inválido' };
    if (typeof incomingData.endTime !== 'string') return { allowed: false, reason: 'endTime inválido' };
    if (typeof incomingData.professionalId !== 'string') return { allowed: false, reason: 'professionalId inválido' };
    if (typeof incomingData.serviceId !== 'string') return { allowed: false, reason: 'serviceId inválido' };

    if (incomingData.status !== 'AGENDADO') {
      return { allowed: false, reason: 'Status deve ser estritamente AGENDADO' };
    }

    // 1. Relational Check: Barbershop / Tenant deve existir no Firestore
    const tenantExists = !!db.barbershops[incomingData.tenantId];
    if (!tenantExists) {
      return { allowed: false, reason: 'Tenant não existe em /barbershops' };
    }

    // 2. Relational Check: Profissional deve existir, pertencer ao mesmo tenant e ter role profissional
    const profDoc = db.users[incomingData.professionalId];
    if (!profDoc) {
      return { allowed: false, reason: 'Profissional não existe em /users' };
    }
    if (profDoc.tenantId !== incomingData.tenantId) {
      return { allowed: false, reason: 'Profissional não pertence ao tenantId do agendamento' };
    }
    if (!['PROFISSIONAL', 'barber'].includes(profDoc.role)) {
      return { allowed: false, reason: 'Profissional não possui role adequada' };
    }

    // 3. Relational Check: Serviço deve existir e pertencer ao mesmo tenant
    const srvDoc = db.services[incomingData.serviceId];
    if (!srvDoc) {
      return { allowed: false, reason: 'Serviço não existe em /services' };
    }
    if (srvDoc.tenantId !== incomingData.tenantId) {
      return { allowed: false, reason: 'Serviço não pertence ao tenantId do agendamento' };
    }

    // 4. Se usuário autenticado possuir vínculo de tenant no ID token, bloqueia agendamento cruzado
    const isCrossTenantAuth =
      isAuthenticated &&
      !isSuperAdmin() &&
      getAuthTenant() !== '' &&
      getAuthTenant() !== incomingData.tenantId;

    if (isCrossTenantAuth) {
      return { allowed: false, reason: 'Usuário autenticado restrito a outro tenant' };
    }

    return { allowed: true };
  }

  if (operation === 'update') {
    if (!incomingData || !existingData) return { allowed: false, reason: 'Dados incompletos para update' };

    // TenantId é estritamente imutável
    if (incomingData.tenantId !== existingData.tenantId) {
      return { allowed: false, reason: 'Tentativa de alteração indevida de tenantId bloqueada' };
    }

    const isAuthorized =
      isSuperAdmin() ||
      isMemberOfTenant(existingData.tenantId) ||
      (isAuthenticated &&
        auth &&
        (auth.uid === existingData.clientId ||
          auth.uid === existingData.uid ||
          (auth.token.phone_number && existingData.clientWhatsApp === auth.token.phone_number)));

    if (!isAuthorized) {
      return { allowed: false, reason: 'Sem permissão para atualizar agendamento' };
    }

    return { allowed: true };
  }

  return { allowed: false, reason: 'Operação não implementada no mock' };
}

describe('ETAPA 2.2M — Isolamento Multi-Tenant no Agendamento Público (Firestore Rules)', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // Base de Dados Mock multi-tenant para os testes
  const mockDb: MockDatabase = {
    barbershops: {
      'tenant-A': { id: 'tenant-A', name: 'Barbearia Alpha' },
      'tenant-B': { id: 'tenant-B', name: 'Barbearia Beta' }
    },
    users: {
      'prof-A': { id: 'prof-A', tenantId: 'tenant-A', role: 'PROFISSIONAL', name: 'Barbeiro Alpha' },
      'prof-B': { id: 'prof-B', tenantId: 'tenant-B', role: 'PROFISSIONAL', name: 'Barbeiro Beta' },
      'client-user': { id: 'client-user', tenantId: 'tenant-A', role: 'CLIENTE', name: 'Cliente Comum' }
    },
    services: {
      'srv-A': { id: 'srv-A', tenantId: 'tenant-A', name: 'Corte Alpha', price: 50, durationMinutes: 30 },
      'srv-B': { id: 'srv-B', tenantId: 'tenant-B', name: 'Corte Beta', price: 60, durationMinutes: 40 }
    },
    appointments: {}
  };

  const baseValidAppointmentTenantA = {
    id: 'apt-001',
    tenantId: 'tenant-A',
    serviceId: 'srv-A',
    serviceName: 'Corte Alpha',
    servicePrice: 50,
    serviceDuration: 30,
    professionalId: 'prof-A',
    professionalName: 'Barbeiro Alpha',
    clientId: 'guest-client-123',
    clientName: 'Visitante da Silva',
    clientWhatsApp: '(11) 98888-7777',
    date: '2026-09-15',
    startTime: '14:00',
    endTime: '14:30',
    isEncaixe: false,
    status: 'AGENDADO',
    reminderSent: false,
    createdAt: '2026-09-12T12:00:00Z'
  };

  // --------------------------------------------------------------------------
  // TESTE 1: Auditoria Textual / AST das Regras no firestore.rules
  // --------------------------------------------------------------------------
  it('1. firestore.rules deve validar relacionalmente barbershop, professional e service com o tenant', () => {
    assert.match(
      rulesContent,
      /exists\(\/databases\/\$\(database\)\/documents\/barbershops\/\$\(request\.resource\.data\.tenantId\)\)/,
      'Deve validar existência do tenant em /barbershops'
    );
    assert.match(
      rulesContent,
      /get\(\/databases\/\$\(database\)\/documents\/users\/\$\(request\.resource\.data\.professionalId\)\)\.data\.tenantId\s*==\s*request\.resource\.data\.tenantId/,
      'Deve validar que o profissional pertence ao mesmo tenantId'
    );
    assert.match(
      rulesContent,
      /get\(\/databases\/\$\(database\)\/documents\/services\/\$\(request\.resource\.data\.serviceId\)\)\.data\.tenantId\s*==\s*request\.resource\.data\.tenantId/,
      'Deve validar que o serviço pertence ao mesmo tenantId'
    );
    assert.match(
      rulesContent,
      /request\.resource\.data\.status\s*==\s*'AGENDADO'/,
      'Status na criação deve ser estritamente AGENDADO'
    );
    assert.match(
      rulesContent,
      /request\.resource\.data\.keys\(\)\.hasOnly/,
      'Deve conter hasOnly para restringir os campos permitidos'
    );
  });

  // --------------------------------------------------------------------------
  // TESTE A: Tenant A + profissional A + serviço A -> criação permitida
  // --------------------------------------------------------------------------
  it('TESTE A: Tenant A + profissional A + serviço A → criação permitida', () => {
    const res = evaluateAppointmentRules(
      'create',
      baseValidAppointmentTenantA,
      null,
      null, // Usuário público / anônimo
      mockDb
    );
    assert.strictEqual(res.allowed, true, `Deveria permitir criação legítima: ${res.reason}`);
  });

  // --------------------------------------------------------------------------
  // TESTE B: Tenant A + profissional B -> criação bloqueada
  // --------------------------------------------------------------------------
  it('TESTE B: Tenant A + profissional B (de outro tenant) → criação bloqueada', () => {
    const crossProfAppointment = {
      ...baseValidAppointmentTenantA,
      professionalId: 'prof-B' // prof-B pertence ao tenant-B!
    };
    const res = evaluateAppointmentRules(
      'create',
      crossProfAppointment,
      null,
      null,
      mockDb
    );
    assert.strictEqual(res.allowed, false, 'Deve bloquear profissional de outro tenant');
    assert.match(res.reason || '', /não pertence ao tenantId/);
  });

  // --------------------------------------------------------------------------
  // TESTE C: Tenant A + serviço B -> criação bloqueada
  // --------------------------------------------------------------------------
  it('TESTE C: Tenant A + serviço B (de outro tenant) → criação bloqueada', () => {
    const crossSrvAppointment = {
      ...baseValidAppointmentTenantA,
      serviceId: 'srv-B' // srv-B pertence ao tenant-B!
    };
    const res = evaluateAppointmentRules(
      'create',
      crossSrvAppointment,
      null,
      null,
      mockDb
    );
    assert.strictEqual(res.allowed, false, 'Deve bloquear serviço de outro tenant');
    assert.match(res.reason || '', /Serviço não pertence ao tenantId/);
  });

  // --------------------------------------------------------------------------
  // TESTE D: Tenant B + profissional B + serviço B -> criação legítima permitida
  // --------------------------------------------------------------------------
  it('TESTE D: Tenant B + profissional B + serviço B → criação legítima permitida', () => {
    const validAppointmentTenantB = {
      ...baseValidAppointmentTenantA,
      id: 'apt-002',
      tenantId: 'tenant-B',
      serviceId: 'srv-B',
      serviceName: 'Corte Beta',
      servicePrice: 60,
      serviceDuration: 40,
      professionalId: 'prof-B',
      professionalName: 'Barbeiro Beta'
    };
    const res = evaluateAppointmentRules(
      'create',
      validAppointmentTenantB,
      null,
      null, // público anônimo
      mockDb
    );
    assert.strictEqual(res.allowed, true, `Deveria permitir criação legítima no Tenant B: ${res.reason}`);
  });

  // --------------------------------------------------------------------------
  // TESTE E: Tenant arbitrário inexistente -> bloqueado
  // --------------------------------------------------------------------------
  it('TESTE E: Tenant arbitrário inexistente → bloqueado', () => {
    const fakeTenantAppointment = {
      ...baseValidAppointmentTenantA,
      tenantId: 'tenant-fantasma-inexistente'
    };
    const res = evaluateAppointmentRules(
      'create',
      fakeTenantAppointment,
      null,
      null,
      mockDb
    );
    assert.strictEqual(res.allowed, false, 'Deve bloquear tenant arbitrário inexistente');
    assert.match(res.reason || '', /Tenant não existe/);
  });

  // --------------------------------------------------------------------------
  // TESTE F: Alteração do tenantId para outro tenant -> bloqueado
  // --------------------------------------------------------------------------
  it('TESTE F: Alteração do tenantId para outro tenant → bloqueado', () => {
    const existing = {
      ...baseValidAppointmentTenantA,
      tenantId: 'tenant-A'
    };
    const updatedWithDifferentTenant = {
      ...existing,
      tenantId: 'tenant-B' // Tentativa de sequestrar ou alterar o tenantId
    };
    const staffAuth: RuleAuth = {
      uid: 'user-manager-a',
      token: {
        role: 'manager',
        tenantId: 'tenant-A'
      }
    };
    const res = evaluateAppointmentRules(
      'update',
      updatedWithDifferentTenant,
      existing,
      staffAuth,
      mockDb
    );
    assert.strictEqual(res.allowed, false, 'Deve bloquear mutação de tenantId em update');
    assert.match(res.reason || '', /alteração indevida de tenantId/);
  });

  // --------------------------------------------------------------------------
  // TESTE G: Status diferente de AGENDADO -> bloqueado
  // --------------------------------------------------------------------------
  it('TESTE G: Status diferente de AGENDADO → bloqueado', () => {
    const invalidStatusAppointment = {
      ...baseValidAppointmentTenantA,
      status: 'CONCLUIDO' // Tentando criar como já concluído
    };
    const res = evaluateAppointmentRules(
      'create',
      invalidStatusAppointment,
      null,
      null,
      mockDb
    );
    assert.strictEqual(res.allowed, false, 'Deve bloquear criação com status diferente de AGENDADO');
    assert.match(res.reason || '', /estritamente AGENDADO/);
  });

  // --------------------------------------------------------------------------
  // TESTE H: Campos administrativos não permitidos -> bloqueados
  // --------------------------------------------------------------------------
  it('TESTE H: Campos administrativos não permitidos (ghost fields) → bloqueados via keys().hasOnly', () => {
    const appointmentWithAdminGhostField = {
      ...baseValidAppointmentTenantA,
      adminApproved: true, // Campo invasor
      financialSettled: true
    };
    const res = evaluateAppointmentRules(
      'create',
      appointmentWithAdminGhostField,
      null,
      null,
      mockDb
    );
    assert.strictEqual(res.allowed, false, 'Deve bloquear injeção de campos administrativos');
    assert.match(res.reason || '', /Campo não permitido/);
  });

  // --------------------------------------------------------------------------
  // TESTE I: Agendamento público sem autenticação continua funcionando para dados legítimos
  // --------------------------------------------------------------------------
  it('TESTE I: Agendamento público sem autenticação → continua funcionando para dados legítimos', () => {
    const res = evaluateAppointmentRules(
      'create',
      baseValidAppointmentTenantA,
      null,
      null, // Auth = null (Visitante / cliente anônimo sem login)
      mockDb
    );
    assert.strictEqual(res.allowed, true, 'Agendamento público anônimo deve ser permitido para dados legítimos');
  });

  // --------------------------------------------------------------------------
  // TESTE J: Cliente autenticado tentando utilizar tenant de terceiro -> bloqueado
  // --------------------------------------------------------------------------
  it('TESTE J: Cliente autenticado de outro tenant tentando utilizar tenant de terceiro → bloqueado', () => {
    const userFromTenantB: RuleAuth = {
      uid: 'user-barber-beta',
      token: {
        role: 'barber',
        tenantId: 'tenant-B'
      }
    };
    const res = evaluateAppointmentRules(
      'create',
      baseValidAppointmentTenantA, // Tentando criar no tenant-A
      null,
      userFromTenantB,
      mockDb
    );
    assert.strictEqual(res.allowed, false, 'Usuário com claims vinculados a outro tenant deve ser bloqueado');
    assert.match(res.reason || '', /outro tenant/);
  });
});
