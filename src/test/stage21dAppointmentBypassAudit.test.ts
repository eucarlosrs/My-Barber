import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// SIMULADOR DO MOTOR DAS FIRESTORE RULES — ETAPA 2.1D-R (AUDITORIA DE BYPASS)
// ============================================================================

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

interface MockDatabase {
  barbershops: Record<string, any>;
  users: Record<string, any>;
  services: Record<string, any>;
  appointments: Record<string, any>;
}

function evaluateAppointmentRules21D(
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

  const isOwnerOfTenant = (tenantId: string): boolean => {
    if (!isAuthenticated || !auth) return false;
    if (isSuperAdmin()) return true;
    return getAuthTenant() === tenantId && ['barbershop_owner', 'PROPRIETARIO', 'owner'].includes(getAuthRole());
  };

  const isManagerOrOwnerOfTenant = (tenantId: string): boolean => {
    if (!isAuthenticated || !auth) return false;
    if (isSuperAdmin()) return true;
    return getAuthTenant() === tenantId && ['barbershop_owner', 'PROPRIETARIO', 'owner', 'manager', 'GERENTE'].includes(getAuthRole());
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

  // 1. READ
  if (operation === 'read') {
    if (!existingData) return { allowed: false, reason: 'Documento inexistente' };
    const canRead =
      isSuperAdmin() ||
      isMemberOfTenant(existingData.tenantId) ||
      (isAuthenticated && auth && (
        auth.uid === existingData.clientId ||
        auth.uid === existingData.uid ||
        (auth.token.phone_number && existingData.clientWhatsApp === auth.token.phone_number)
      ));
    return { allowed: !!canRead, reason: canRead ? undefined : 'Leitura não autorizada' };
  }

  // 2. CREATE
  if (operation === 'create') {
    if (!incomingData) return { allowed: false, reason: 'Nenhum dado enviado' };

    // Soberania RBAC / Fechamento de Bypass 2.1D:
    // Apenas Super Admin ou Equipe Autenticada do Tenant (Owner, Manager, Professional)
    const hasAdminAuthority = isSuperAdmin() || isMemberOfTenant(incomingData.tenantId);
    if (!hasAdminAuthority) {
      return {
        allowed: false,
        reason: 'PERMISSÃO NEGADA: Clientes anônimos ou comuns não podem criar appointments diretamente no Firestore. Utilize POST /api/appointments/book.'
      };
    }

    const allowedKeys = [
      'id', 'tenantId', 'serviceId', 'serviceName', 'servicePrice', 'serviceDuration',
      'professionalId', 'professionalName', 'clientId', 'clientName', 'clientWhatsApp',
      'date', 'startTime', 'endTime', 'isEncaixe', 'status', 'notes', 'reminderSent',
      'reminderSentAt', 'createdAt'
    ];

    const incomingKeys = Object.keys(incomingData);
    if (!incomingKeys.every(k => allowedKeys.includes(k))) {
      return { allowed: false, reason: 'Campo invasor não permitido (keys().hasOnly falhou)' };
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
      return { allowed: false, reason: 'Status inicial deve ser AGENDADO' };
    }

    // Integridade relacional no Firestore
    if (!db.barbershops[incomingData.tenantId]) {
      return { allowed: false, reason: 'Barbearia / Tenant não existe no Firestore' };
    }
    const prof = db.users[incomingData.professionalId];
    if (!prof || prof.tenantId !== incomingData.tenantId || !['PROFISSIONAL', 'barber'].includes(prof.role)) {
      return { allowed: false, reason: 'Profissional inválido ou de outro tenant' };
    }
    const srv = db.services[incomingData.serviceId];
    if (!srv || srv.tenantId !== incomingData.tenantId) {
      return { allowed: false, reason: 'Serviço inválido ou de outro tenant' };
    }

    return { allowed: true };
  }

  // 3. UPDATE
  if (operation === 'update') {
    if (!incomingData || !existingData) return { allowed: false, reason: 'Dados insuficientes' };

    // TenantId imutável
    if (incomingData.tenantId !== existingData.tenantId) {
      return { allowed: false, reason: 'Mutação de tenantId é estritamente proibida' };
    }

    // Soberania RBAC / Fechamento de Bypass 2.1D:
    // Apenas Super Admin ou Equipe do Tenant pode atualizar agendamentos
    const hasAuthority = isSuperAdmin() || isMemberOfTenant(existingData.tenantId);
    if (!hasAuthority) {
      return {
        allowed: false,
        reason: 'PERMISSÃO NEGADA: Clientes anônimos ou comuns não podem atualizar appointments diretamente no Firestore.'
      };
    }

    return { allowed: true };
  }

  // 4. DELETE
  if (operation === 'delete') {
    if (!existingData) return { allowed: false, reason: 'Documento inexistente' };

    const canDelete = isSuperAdmin() || isManagerOrOwnerOfTenant(existingData.tenantId);
    if (!canDelete) {
      return {
        allowed: false,
        reason: 'PERMISSÃO NEGADA: Apenas Super Admin ou Gestão (Manager/Owner) do tenant pode excluir agendamentos.'
      };
    }

    return { allowed: true };
  }

  return { allowed: false };
}

describe('ETAPA 2.1D-R — Auditoria e Fechamento do Bypass de Appointments (15 Provas de Bloqueio + Fluxos Legítimos)', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  const mockDb: MockDatabase = {
    barbershops: {
      'tenant-A': { id: 'tenant-A', name: 'Barbearia Alpha', status: 'ATIVA' },
      'tenant-B': { id: 'tenant-B', name: 'Barbearia Beta', status: 'ATIVA' }
    },
    users: {
      'prof-A': { id: 'prof-A', name: 'Carlos Alpha', tenantId: 'tenant-A', role: 'PROFISSIONAL' },
      'prof-B': { id: 'prof-B', name: 'Marcos Beta', tenantId: 'tenant-B', role: 'PROFISSIONAL' },
      'cust-A': { id: 'cust-A', name: 'João Cliente', tenantId: 'tenant-A', role: 'customer' }
    },
    services: {
      'srv-A': { id: 'srv-A', name: 'Corte Alpha', tenantId: 'tenant-A', price: 50, durationMinutes: 30 },
      'srv-B': { id: 'srv-B', name: 'Corte Beta', tenantId: 'tenant-B', price: 60, durationMinutes: 40 }
    },
    appointments: {}
  };

  const validAppointmentData = {
    id: 'apt-test-101',
    tenantId: 'tenant-A',
    serviceId: 'srv-A',
    serviceName: 'Corte Alpha',
    servicePrice: 50,
    serviceDuration: 30,
    professionalId: 'prof-A',
    professionalName: 'Carlos Alpha',
    clientId: 'cust-A',
    clientName: 'João Cliente',
    clientWhatsApp: '(11) 97777-8888',
    date: '2026-10-10',
    startTime: '10:00',
    endTime: '10:30',
    isEncaixe: false,
    status: 'AGENDADO',
    reminderSent: false,
    createdAt: '2026-09-12T12:00:00Z'
  };

  const anonymousAuth = null;

  const customerAuth: RuleAuth = {
    uid: 'cust-A',
    token: {
      role: 'customer',
      tenantId: 'tenant-A'
    }
  };

  const barberAuth: RuleAuth = {
    uid: 'prof-A',
    token: {
      role: 'barber',
      tenantId: 'tenant-A'
    }
  };

  const managerAuth: RuleAuth = {
    uid: 'mgr-A',
    token: {
      role: 'manager',
      tenantId: 'tenant-A'
    }
  };

  const ownerAuth: RuleAuth = {
    uid: 'owner-A',
    token: {
      role: 'barbershop_owner',
      tenantId: 'tenant-A'
    }
  };

  const superAdminAuth: RuleAuth = {
    uid: 'admin-root',
    token: {
      role: 'super_admin'
    }
  };

  const foreignTenantAuth: RuleAuth = {
    uid: 'user-foreign',
    token: {
      role: 'manager',
      tenantId: 'tenant-B' // Pertence ao tenant B, tentando invadir tenant A
    }
  };

  // --------------------------------------------------------------------------
  // PARTE 1: VERIFICAÇÃO ESTÁTICA DO TEXTO DAS FIRESTORE RULES
  // --------------------------------------------------------------------------
  it('0. firestore.rules deve exigir explicitamente autoridade administrativa para create e update em appointments', () => {
    // Verifica que allow create exige isSuperAdmin() || isMemberOfTenant(...)
    assert.match(
      rulesContent,
      /allow\s+create:\s*if\s*\(isSuperAdmin\(\)\s*\|\|\s*isMemberOfTenant\(request\.resource\.data\.tenantId\)\)/,
      'allow create em appointments deve exigir isSuperAdmin ou isMemberOfTenant'
    );

    // Verifica que allow update exige autorização administrativa / equipe com restrições
    assert.match(
      rulesContent,
      /allow\s+update:\s*if\s*\([\s\S]*?(?:isSuperAdmin\(\)\s*\|\|\s*isMemberOfTenant|isSuperAdmin\(\)\s*\|\|\s*\(\s*isManagerOrOwnerOfTenant)/,
      'allow update em appointments deve exigir isSuperAdmin ou gestão do tenant'
    );

    // Verifica que allow delete exige isSuperAdmin() || isManagerOrOwnerOfTenant(...)
    assert.match(
      rulesContent,
      /allow\s+delete:\s*if\s*isSuperAdmin\(\)\s*\|\|\s*isManagerOrOwnerOfTenant\(resource\.data\.tenantId\)/,
      'allow delete em appointments deve exigir isSuperAdmin ou isManagerOrOwnerOfTenant'
    );

    // Verifica que day_locks possui bloqueio de escrita (e na 2.1E, fechamento total de leitura e escrita para client)
    assert.match(
      rulesContent,
      /match\s+\/day_locks\/\{lockId\}\s*\{\s*allow\s+(?:read,\s*write:\s*if\s+false|read:\s*if\s+true;\s*allow\s+write:\s*if\s+false);\s*\}/,
      'day_locks deve bloquear escrita/leitura de qualquer cliente'
    );

    // Verifica que idempotency_keys possui allow read, write: if false
    assert.match(
      rulesContent,
      /match\s+\/idempotency_keys\/\{keyId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/,
      'idempotency_keys deve bloquear leitura e escrita de qualquer cliente'
    );

    // Verifica que publicAvailability possui allow write: if false
    assert.match(
      rulesContent,
      /match\s+\/publicAvailability\/\{slotId\}\s*\{\s*allow\s+read:\s*if\s+true;\s*allow\s+write:\s*if\s+false;\s*\}/,
      'publicAvailability deve bloquear escrita de qualquer cliente'
    );
  });

  // --------------------------------------------------------------------------
  // PARTE 2: AS 15 PROVAS DE BLOQUEIO DO BYPASS
  // --------------------------------------------------------------------------

  // 1. anonymous -> create appointment = DENY
  it('1. anonymous → create appointment = DENY', () => {
    const res = evaluateAppointmentRules21D('create', validAppointmentData, null, anonymousAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 2. customer -> create appointment = DENY
  it('2. customer → create appointment = DENY', () => {
    const res = evaluateAppointmentRules21D('create', validAppointmentData, null, customerAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 3. customer -> alterar horário = DENY
  it('3. customer → alterar horário (startTime/endTime/date) = DENY', () => {
    const altered = { ...validAppointmentData, startTime: '11:00', endTime: '11:30' };
    const res = evaluateAppointmentRules21D('update', altered, validAppointmentData, customerAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 4. customer -> alterar profissional = DENY
  it('4. customer → alterar profissional = DENY', () => {
    const altered = { ...validAppointmentData, professionalId: 'prof-B' };
    const res = evaluateAppointmentRules21D('update', altered, validAppointmentData, customerAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 5. customer -> alterar serviço = DENY
  it('5. customer → alterar serviço = DENY', () => {
    const altered = { ...validAppointmentData, serviceId: 'srv-B' };
    const res = evaluateAppointmentRules21D('update', altered, validAppointmentData, customerAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 6. customer -> alterar preço = DENY
  it('6. customer → alterar preço = DENY', () => {
    const altered = { ...validAppointmentData, servicePrice: 10 }; // Tentativa de pagar menos
    const res = evaluateAppointmentRules21D('update', altered, validAppointmentData, customerAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 7. customer -> alterar duração = DENY
  it('7. customer → alterar duração = DENY', () => {
    const altered = { ...validAppointmentData, serviceDuration: 10 };
    const res = evaluateAppointmentRules21D('update', altered, validAppointmentData, customerAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 8. customer -> alterar status = DENY
  it('8. customer → alterar status (ex: CANCELADO / CONCLUIDO) = DENY', () => {
    const altered = { ...validAppointmentData, status: 'CONCLUIDO' };
    const res = evaluateAppointmentRules21D('update', altered, validAppointmentData, customerAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 9. customer -> delete appointment = DENY
  it('9. customer → delete appointment = DENY', () => {
    const res = evaluateAppointmentRules21D('delete', null, validAppointmentData, customerAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 10. usuário de outro tenant -> create = DENY
  it('10. usuário de outro tenant → create = DENY', () => {
    const res = evaluateAppointmentRules21D('create', validAppointmentData, null, foreignTenantAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 11. usuário de outro tenant -> update = DENY
  it('11. usuário de outro tenant → update = DENY', () => {
    const altered = { ...validAppointmentData, notes: 'Tentativa de alteração entre tenants' };
    const res = evaluateAppointmentRules21D('update', altered, validAppointmentData, foreignTenantAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 12. usuário de outro tenant -> delete = DENY
  it('12. usuário de outro tenant → delete = DENY', () => {
    const res = evaluateAppointmentRules21D('delete', null, validAppointmentData, foreignTenantAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /PERMISSÃO NEGADA/);
  });

  // 13. day_lock -> client write = DENY
  it('13. day_lock → client write = DENY (regra estrita allow write: if false ou allow read, write: if false)', () => {
    // Verificado no firestore.rules para qualquer papel de cliente
    const hasLockBlock = rulesContent.includes('match /day_locks/{lockId} {\n        allow read, write: if false;\n      }') ||
      rulesContent.includes('match /day_locks/{lockId} {\n      allow read, write: if false;\n    }') ||
      rulesContent.includes('match /day_locks/{lockId} {\n        allow read: if true;\n        allow write: if false;\n      }') ||
      rulesContent.includes('match /day_locks/{lockId} {\n      allow read: if true;\n      allow write: if false;\n    }');
    assert.strictEqual(hasLockBlock, true, 'day_locks deve proibir escrita no client-side');
  });

  // 14. idempotency_key -> client write = DENY
  it('14. idempotency_key → client write = DENY (regra estrita allow read, write: if false)', () => {
    const hasIdempBlock = rulesContent.includes('match /idempotency_keys/{keyId} {\n        allow read, write: if false;\n      }') ||
      rulesContent.includes('match /idempotency_keys/{keyId} {\n      allow read, write: if false;\n    }');
    assert.strictEqual(hasIdempBlock, true, 'idempotency_keys deve proibir leitura e escrita no client-side');
  });

  // 15. publicAvailability -> client write = DENY
  it('15. publicAvailability → client write = DENY (regra estrita allow write: if false)', () => {
    const hasPubBlock = rulesContent.includes('match /publicAvailability/{slotId} {\n      allow read: if true;\n      allow write: if false;\n    }');
    assert.strictEqual(hasPubBlock, true, 'publicAvailability deve proibir escrita no client-side');
  });

  // --------------------------------------------------------------------------
  // PARTE 3: FLUXOS ADMINISTRATIVOS LEGÍTIMOS PRESERVADOS
  // --------------------------------------------------------------------------

  it('16. [FLUXO ADMINISTRATIVO] super_admin → create appointment = ALLOW', () => {
    const res = evaluateAppointmentRules21D('create', validAppointmentData, null, superAdminAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('17. [FLUXO ADMINISTRATIVO] owner of tenant → create encaixe/agendamento = ALLOW', () => {
    const encaixeData = { ...validAppointmentData, isEncaixe: true, id: 'apt-encaixe-1' };
    const res = evaluateAppointmentRules21D('create', encaixeData, null, ownerAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('18. [FLUXO ADMINISTRATIVO] manager of tenant → create agendamento de balcão = ALLOW', () => {
    const deskData = { ...validAppointmentData, id: 'apt-balcao-1' };
    const res = evaluateAppointmentRules21D('create', deskData, null, managerAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('19. [FLUXO ADMINISTRATIVO] professional of tenant → create encaixe na própria agenda = ALLOW', () => {
    const profEncaixe = { ...validAppointmentData, isEncaixe: true, id: 'apt-prof-encaixe-1' };
    const res = evaluateAppointmentRules21D('create', profEncaixe, null, barberAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('20. [FLUXO ADMINISTRATIVO] owner of tenant → update status (CONCLUIDO) = ALLOW', () => {
    const updated = { ...validAppointmentData, status: 'CONCLUIDO' };
    const res = evaluateAppointmentRules21D('update', updated, validAppointmentData, ownerAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('21. [FLUXO ADMINISTRATIVO] manager of tenant → remarcação administrativa = ALLOW', () => {
    const rescheduled = { ...validAppointmentData, startTime: '15:00', endTime: '15:30' };
    const res = evaluateAppointmentRules21D('update', rescheduled, validAppointmentData, managerAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('22. [FLUXO ADMINISTRATIVO] professional of tenant → update status (CONCLUIDO) = ALLOW', () => {
    const completed = { ...validAppointmentData, status: 'CONCLUIDO' };
    const res = evaluateAppointmentRules21D('update', completed, validAppointmentData, barberAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('23. [FLUXO ADMINISTRATIVO] owner of tenant → delete appointment = ALLOW', () => {
    const res = evaluateAppointmentRules21D('delete', null, validAppointmentData, ownerAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('24. [FLUXO ADMINISTRATIVO] manager of tenant → delete appointment = ALLOW', () => {
    const res = evaluateAppointmentRules21D('delete', null, validAppointmentData, managerAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('25. [FLUXO ADMINISTRATIVO] super_admin → delete appointment = ALLOW', () => {
    const res = evaluateAppointmentRules21D('delete', null, validAppointmentData, superAdminAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('26. [FLUXO ADMINISTRATIVO] professional comum → delete appointment = DENY (apenas gestão pode excluir)', () => {
    const res = evaluateAppointmentRules21D('delete', null, validAppointmentData, barberAuth, mockDb);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /Apenas Super Admin ou Gestão/);
  });

  it('27. [FLUXO DE LEITURA PRIVADA] customer → ler seus próprios agendamentos = ALLOW', () => {
    const res = evaluateAppointmentRules21D('read', null, validAppointmentData, customerAuth, mockDb);
    assert.strictEqual(res.allowed, true);
  });

  it('28. [FLUXO DE LEITURA PRIVADA] customer → ler agendamento de outro cliente = DENY', () => {
    const otherCustomerAuth: RuleAuth = {
      uid: 'cust-OTHER',
      token: { role: 'customer', tenantId: 'tenant-A' }
    };
    const res = evaluateAppointmentRules21D('read', null, validAppointmentData, otherCustomerAuth, mockDb);
    assert.strictEqual(res.allowed, false);
  });

  it('29. [FLUXO DE LEITURA PRIVADA] anônimo → ler agendamento privado em /appointments = DENY', () => {
    const res = evaluateAppointmentRules21D('read', null, validAppointmentData, anonymousAuth, mockDb);
    assert.strictEqual(res.allowed, false);
  });
});
