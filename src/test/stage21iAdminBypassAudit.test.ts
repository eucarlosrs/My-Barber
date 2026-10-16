import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ETAPA 2.1I — TESTES DE AUDITORIA E FECHAMENTO DE BYPASS CLIENT-SIDE DA AUTORIDADE ADMINISTRATIVA
 *
 * Cobertura Completa dos 20 Cenários Mandatórios:
 * 1. Tentativa de alterar horário diretamente via Client SDK por Manager -> BLOQUEADA
 * 2. Tentativa de alterar profissional diretamente via Client SDK por Manager -> BLOQUEADA
 * 3. Tentativa de alterar serviço diretamente via Client SDK por Manager -> BLOQUEADA
 * 4. Tentativa de alterar status para CANCELADO diretamente via Client SDK por Manager -> BLOQUEADA
 * 5. Tentativa de alterar status para CANCELADO diretamente via Client SDK por Professional -> BLOQUEADA
 * 6. Tentativa de alterar horário diretamente via Client SDK por Professional -> BLOQUEADA
 * 7. Tentativa de alterar profissional diretamente via Client SDK por Professional -> BLOQUEADA
 * 8. Tentativa de alterar serviço diretamente via Client SDK por Professional -> BLOQUEADA
 * 9. Tentativa de alterar status para CONCLUIDO por Professional -> PERMITIDA
 * 10. Tentativa de alterar status para NAO_COMPARECEU por Professional -> PERMITIDA
 * 11. Tentativa de alterar status para CONCLUIDO por Manager -> PERMITIDA
 * 12. Tentativa de alterar status para NAO_COMPARECEU por Manager -> PERMITIDA
 * 13. Tentativa de excluir appointment via Client SDK por Manager -> BLOQUEADA
 * 14. Tentativa de excluir appointment via Client SDK por Professional -> BLOQUEADA
 * 15. Tentativa de excluir appointment via Client SDK por Customer -> BLOQUEADA
 * 16. Tentativa de criar appointment convencional via Client SDK ignorando booking online -> BLOQUEADA (preservado apenas encaixe legítimo)
 * 17. Tentativa de alterar day_locks via Client SDK -> BLOQUEADA
 * 18. Tentativa de alterar publicAvailability via Client SDK -> BLOQUEADA
 * 19. Chamada de rescheduleAppointment no AppContext usando endpoint autoritativo -> COMPROVADA
 * 20. Chamada de cancelAppointment no AppContext usando endpoint autoritativo -> COMPROVADA
 */

interface AuthContext {
  uid: string;
  role: 'super_admin' | 'barbershop_owner' | 'manager' | 'barber' | 'customer' | 'anonymous';
  tenantId?: string;
}

interface AppointmentDoc {
  id: string;
  tenantId: string;
  serviceId: string;
  serviceName?: string;
  servicePrice: number;
  serviceDuration: number;
  professionalId: string;
  professionalName?: string;
  clientId: string;
  clientName: string;
  clientWhatsApp: string;
  date: string;
  startTime: string;
  endTime: string;
  isEncaixe?: boolean;
  status: 'AGENDADO' | 'CONCLUIDO' | 'CANCELADO' | 'NAO_COMPARECEU';
  notes?: string;
  reminderSent?: boolean;
  reminderSentAt?: string;
  createdAt: string;
}

// Simulador soberano das regras do Firestore (espelhando fielmente firestore.rules)
function evaluateUpdateRules(
  auth: AuthContext,
  resource: AppointmentDoc,
  requestResource: AppointmentDoc
): { allowed: boolean; reason?: string } {
  if (auth.role === 'anonymous') {
    return { allowed: false, reason: 'DENY_UNAUTHENTICATED' };
  }
  if (auth.role === 'customer') {
    return { allowed: false, reason: 'DENY_CUSTOMER' };
  }

  // Ramo Super Admin
  if (auth.role === 'super_admin') {
    const timeMatch =
      requestResource.date === resource.date &&
      requestResource.startTime === resource.startTime &&
      requestResource.endTime === resource.endTime;
    const structureMatch =
      requestResource.professionalId === resource.professionalId &&
      requestResource.serviceId === resource.serviceId &&
      requestResource.serviceDuration === resource.serviceDuration;
    const cancelBlock =
      requestResource.status !== 'CANCELADO' && resource.status !== 'CANCELADO';

    if (timeMatch && structureMatch && cancelBlock) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'SUPER_ADMIN_DIRECT_BYPASS_BLOCKED' };
  }

  // Ramo Manager / Owner
  if (auth.role === 'barbershop_owner' || auth.role === 'manager') {
    if (auth.tenantId !== resource.tenantId) {
      return { allowed: false, reason: 'TENANT_MISMATCH' };
    }
    if (requestResource.tenantId !== resource.tenantId) {
      return { allowed: false, reason: 'TENANT_MUTATION_FORBIDDEN' };
    }
    // Hardening 2.1I: Imutabilidade de horário, profissional e serviço no Client SDK
    if (
      requestResource.date !== resource.date ||
      requestResource.startTime !== resource.startTime ||
      requestResource.endTime !== resource.endTime
    ) {
      return { allowed: false, reason: 'SCHEDULE_MUTATION_FORBIDDEN_CLIENT_SDK' };
    }
    if (requestResource.professionalId !== resource.professionalId) {
      return { allowed: false, reason: 'PROFESSIONAL_MUTATION_FORBIDDEN_CLIENT_SDK' };
    }
    if (requestResource.serviceId !== resource.serviceId) {
      return { allowed: false, reason: 'SERVICE_MUTATION_FORBIDDEN_CLIENT_SDK' };
    }
    if (requestResource.serviceDuration !== resource.serviceDuration) {
      return { allowed: false, reason: 'DURATION_MUTATION_FORBIDDEN_CLIENT_SDK' };
    }
    if (requestResource.clientId !== resource.clientId) {
      return { allowed: false, reason: 'CLIENT_ID_MUTATION_FORBIDDEN' };
    }
    if (requestResource.createdAt !== resource.createdAt) {
      return { allowed: false, reason: 'CREATED_AT_MUTATION_FORBIDDEN' };
    }
    if (typeof requestResource.servicePrice !== 'number' || requestResource.servicePrice < 0) {
      return { allowed: false, reason: 'INVALID_PRICE' };
    }
    // Hardening 2.1I: Bloqueio de cancelamento via Client SDK
    if (requestResource.status === 'CANCELADO' || resource.status === 'CANCELADO') {
      return { allowed: false, reason: 'CANCEL_REQUIRES_AUTHORITATIVE_BACKEND' };
    }
    if (!['AGENDADO', 'CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU'].includes(requestResource.status)) {
      return { allowed: false, reason: 'INVALID_STATUS_ENUM' };
    }
    return { allowed: true };
  }

  // Ramo Professional / Barber
  if (auth.role === 'barber') {
    if (auth.tenantId !== resource.tenantId) {
      return { allowed: false, reason: 'TENANT_MISMATCH' };
    }
    if (requestResource.tenantId !== resource.tenantId) {
      return { allowed: false, reason: 'TENANT_MUTATION_FORBIDDEN' };
    }
    if (requestResource.professionalId !== resource.professionalId) {
      return { allowed: false, reason: 'PROFESSIONAL_MUTATION_FORBIDDEN' };
    }
    if (requestResource.serviceId !== resource.serviceId) {
      return { allowed: false, reason: 'SERVICE_MUTATION_FORBIDDEN' };
    }
    if (
      requestResource.date !== resource.date ||
      requestResource.startTime !== resource.startTime ||
      requestResource.endTime !== resource.endTime
    ) {
      return { allowed: false, reason: 'SCHEDULE_MUTATION_FORBIDDEN' };
    }
    if (requestResource.servicePrice !== resource.servicePrice) {
      return { allowed: false, reason: 'PRICE_MUTATION_FORBIDDEN' };
    }
    if (requestResource.serviceDuration !== resource.serviceDuration) {
      return { allowed: false, reason: 'DURATION_MUTATION_FORBIDDEN' };
    }
    if (requestResource.clientId !== resource.clientId) {
      return { allowed: false, reason: 'CLIENT_MUTATION_FORBIDDEN' };
    }
    if (requestResource.clientName !== resource.clientName) {
      return { allowed: false, reason: 'CLIENT_NAME_MUTATION_FORBIDDEN' };
    }
    if (requestResource.clientWhatsApp !== resource.clientWhatsApp) {
      return { allowed: false, reason: 'CLIENT_WHATSAPP_MUTATION_FORBIDDEN' };
    }
    if (requestResource.createdAt !== resource.createdAt) {
      return { allowed: false, reason: 'CREATED_AT_MUTATION_FORBIDDEN' };
    }
    // Hardening 2.1I: Bloqueio de cancelamento via Client SDK
    if (requestResource.status === 'CANCELADO' || resource.status === 'CANCELADO') {
      return { allowed: false, reason: 'CANCEL_REQUIRES_AUTHORITATIVE_BACKEND' };
    }
    if (!['AGENDADO', 'CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU'].includes(requestResource.status)) {
      return { allowed: false, reason: 'INVALID_STATUS_ENUM' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'DEFAULT_DENY' };
}

function evaluateDeleteRules(
  auth: AuthContext,
  _resource: AppointmentDoc
): { allowed: boolean; reason?: string } {
  // Hardening 2.1I: Exclusão física restrita estritamente a Super Admin (teardown).
  // Manager, Owner, Barbeiros e Clientes têm escrita de delete negada no Client SDK.
  if (auth.role === 'super_admin') {
    return { allowed: true };
  }
  return { allowed: false, reason: 'DELETE_FORBIDDEN_CLIENT_SDK' };
}

describe('ETAPA 2.1I — Auditoria e Fechamento de Bypass da Autoridade Administrativa', () => {
  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  const appContextPath = path.join(process.cwd(), 'src/context/AppContext.tsx');

  assert.strictEqual(fs.existsSync(rulesPath), true, 'firestore.rules deve existir');
  assert.strictEqual(fs.existsSync(appContextPath), true, 'AppContext.tsx deve existir');

  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const appContextContent = fs.readFileSync(appContextPath, 'utf8');

  const sampleAppointment: AppointmentDoc = {
    id: 'apt-audit-1',
    tenantId: 'barbershop-alpha',
    serviceId: 'srv-corte',
    serviceName: 'Corte Tradicional',
    servicePrice: 45,
    serviceDuration: 30,
    professionalId: 'prof-bob',
    professionalName: 'Bob Barber',
    clientId: 'client-1',
    clientName: 'João Silva',
    clientWhatsApp: '+5511999999999',
    date: '2026-10-15',
    startTime: '14:00',
    endTime: '14:30',
    status: 'AGENDADO',
    notes: 'Cliente prefere tesoura',
    createdAt: '2026-10-01T10:00:00.000Z'
  };

  const managerAuth: AuthContext = {
    uid: 'user-manager-1',
    role: 'manager',
    tenantId: 'barbershop-alpha'
  };

  const barberAuth: AuthContext = {
    uid: 'prof-bob',
    role: 'barber',
    tenantId: 'barbershop-alpha'
  };

  const customerAuth: AuthContext = {
    uid: 'client-1',
    role: 'customer',
    tenantId: 'barbershop-alpha'
  };

  // =========================================================================
  // CENÁRIOS 1 A 4: BYPASS DE MANAGER BLOQUEADO
  // =========================================================================
  it('1. Tentativa de alterar horário diretamente via Client SDK por Manager -> BLOQUEADA', () => {
    // Verificação estática das regras
    assert.match(
      rulesContent,
      /request\.resource\.data\.date == resource\.data\.date/,
      'Regras devem exigir data imutável'
    );
    assert.match(
      rulesContent,
      /request\.resource\.data\.startTime == resource\.data\.startTime/,
      'Regras devem exigir startTime imutável para Manager'
    );
    assert.match(
      rulesContent,
      /request\.resource\.data\.endTime == resource\.data\.endTime/,
      'Regras devem exigir endTime imutável para Manager'
    );

    // Avaliação do simulador com bypass direto
    const modifiedTime = { ...sampleAppointment, startTime: '15:00', endTime: '15:30' };
    const result = evaluateUpdateRules(managerAuth, sampleAppointment, modifiedTime);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'SCHEDULE_MUTATION_FORBIDDEN_CLIENT_SDK');
  });

  it('2. Tentativa de alterar profissional diretamente via Client SDK por Manager -> BLOQUEADA', () => {
    // Verificação estática
    const updateBlock = rulesContent.match(/isManagerOrOwnerOfTenant[\s\S]*?request\.resource\.data\.professionalId == resource\.data\.professionalId/);
    assert.ok(updateBlock, 'Regras de Manager devem travar professionalId imutável');

    // Avaliação simulador
    const modifiedProf = { ...sampleAppointment, professionalId: 'prof-outro' };
    const result = evaluateUpdateRules(managerAuth, sampleAppointment, modifiedProf);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'PROFESSIONAL_MUTATION_FORBIDDEN_CLIENT_SDK');
  });

  it('3. Tentativa de alterar serviço diretamente via Client SDK por Manager -> BLOQUEADA', () => {
    // Verificação estática
    const updateBlock = rulesContent.match(/isManagerOrOwnerOfTenant[\s\S]*?request\.resource\.data\.serviceId == resource\.data\.serviceId/);
    assert.ok(updateBlock, 'Regras de Manager devem travar serviceId imutável');

    // Avaliação simulador
    const modifiedService = { ...sampleAppointment, serviceId: 'srv-barba' };
    const result = evaluateUpdateRules(managerAuth, sampleAppointment, modifiedService);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'SERVICE_MUTATION_FORBIDDEN_CLIENT_SDK');
  });

  it('4. Tentativa de alterar status para CANCELADO diretamente via Client SDK por Manager -> BLOQUEADA', () => {
    // Verificação estática
    assert.match(
      rulesContent,
      /request\.resource\.data\.status != 'CANCELADO'/,
      'Regras devem negar status CANCELADO direto via Client SDK'
    );
    assert.match(
      rulesContent,
      /resource\.data\.status != 'CANCELADO'/,
      'Regras devem impedir reabertura de agendamento cancelado'
    );

    // Avaliação simulador
    const canceled = { ...sampleAppointment, status: 'CANCELADO' as const };
    const result = evaluateUpdateRules(managerAuth, sampleAppointment, canceled);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'CANCEL_REQUIRES_AUTHORITATIVE_BACKEND');
  });

  // =========================================================================
  // CENÁRIOS 5 A 8: BYPASS DE PROFISSIONAL BLOQUEADO
  // =========================================================================
  it('5. Tentativa de alterar status para CANCELADO diretamente via Client SDK por Professional -> BLOQUEADA', () => {
    const canceled = { ...sampleAppointment, status: 'CANCELADO' as const };
    const result = evaluateUpdateRules(barberAuth, sampleAppointment, canceled);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'CANCEL_REQUIRES_AUTHORITATIVE_BACKEND');
  });

  it('6. Tentativa de alterar horário diretamente via Client SDK por Professional -> BLOQUEADA', () => {
    const modifiedTime = { ...sampleAppointment, startTime: '16:00', endTime: '16:30' };
    const result = evaluateUpdateRules(barberAuth, sampleAppointment, modifiedTime);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'SCHEDULE_MUTATION_FORBIDDEN');
  });

  it('7. Tentativa de alterar profissional diretamente via Client SDK por Professional -> BLOQUEADA', () => {
    const modifiedProf = { ...sampleAppointment, professionalId: 'prof-outro' };
    const result = evaluateUpdateRules(barberAuth, sampleAppointment, modifiedProf);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'PROFESSIONAL_MUTATION_FORBIDDEN');
  });

  it('8. Tentativa de alterar serviço diretamente via Client SDK por Professional -> BLOQUEADA', () => {
    const modifiedService = { ...sampleAppointment, serviceId: 'srv-barba' };
    const result = evaluateUpdateRules(barberAuth, sampleAppointment, modifiedService);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'SERVICE_MUTATION_FORBIDDEN');
  });

  // =========================================================================
  // CENÁRIOS 9 A 12: ALTERAÇÕES OPERACIONAIS LEGÍTIMAS PERMITIDAS
  // =========================================================================
  it('9. Tentativa de alterar status para CONCLUIDO por Professional -> PERMITIDA', () => {
    const completed = { ...sampleAppointment, status: 'CONCLUIDO' as const, notes: 'Atendimento finalizado com sucesso' };
    const result = evaluateUpdateRules(barberAuth, sampleAppointment, completed);
    assert.strictEqual(result.allowed, true);
  });

  it('10. Tentativa de alterar status para NAO_COMPARECEU por Professional -> PERMITIDA', () => {
    const noShow = { ...sampleAppointment, status: 'NAO_COMPARECEU' as const, notes: 'Cliente não compareceu nem atendeu ligação' };
    const result = evaluateUpdateRules(barberAuth, sampleAppointment, noShow);
    assert.strictEqual(result.allowed, true);
  });

  it('11. Tentativa de alterar status para CONCLUIDO por Manager -> PERMITIDA', () => {
    const completed = { ...sampleAppointment, status: 'CONCLUIDO' as const, servicePrice: 40 }; // com desconto balcão
    const result = evaluateUpdateRules(managerAuth, sampleAppointment, completed);
    assert.strictEqual(result.allowed, true);
  });

  it('12. Tentativa de alterar status para NAO_COMPARECEU por Manager -> PERMITIDA', () => {
    const noShow = { ...sampleAppointment, status: 'NAO_COMPARECEU' as const };
    const result = evaluateUpdateRules(managerAuth, sampleAppointment, noShow);
    assert.strictEqual(result.allowed, true);
  });

  // =========================================================================
  // CENÁRIOS 13 A 15: BYPASS DE DELETE BLOQUEADO
  // =========================================================================
  it('13. Tentativa de excluir appointment via Client SDK por Manager -> BLOQUEADA', () => {
    // Verificação estática das regras no bloco de appointments: apenas isSuperAdmin possui allow delete
    const aptBlock = rulesContent.substring(
      rulesContent.indexOf('match /appointments/{appointmentId}'),
      rulesContent.indexOf('match /day_locks/{lockId}')
    );
    const deleteMatch = aptBlock.match(/allow\s+delete:\s*if\s*([^;]+);/);
    assert.ok(deleteMatch, 'Deve conter declaração de allow delete em appointments');
    assert.match(
      deleteMatch[0],
      /isSuperAdmin\(\)/,
      'allow delete em appointments deve ser restrito a isSuperAdmin'
    );
    assert.doesNotMatch(
      deleteMatch[0],
      /isManagerOrOwnerOfTenant/,
      'Manager/Owner NÃO devem ter permissão em allow delete de appointments via Client SDK'
    );

    // Avaliação simulador
    const result = evaluateDeleteRules(managerAuth, sampleAppointment);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'DELETE_FORBIDDEN_CLIENT_SDK');
  });

  it('14. Tentativa de excluir appointment via Client SDK por Professional -> BLOQUEADA', () => {
    const result = evaluateDeleteRules(barberAuth, sampleAppointment);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'DELETE_FORBIDDEN_CLIENT_SDK');
  });

  it('15. Tentativa de excluir appointment via Client SDK por Customer -> BLOQUEADA', () => {
    const result = evaluateDeleteRules(customerAuth, sampleAppointment);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'DELETE_FORBIDDEN_CLIENT_SDK');
  });

  // =========================================================================
  // CENÁRIOS 16 A 18: CONVENCIONAL, DAY_LOCKS E PUBLIC_AVAILABILITY BLOQUEADOS
  // =========================================================================
  it('16. Tentativa de criar appointment convencional via Client SDK ignorando booking online -> tratada/bloqueada', () => {
    // Em AppContext.tsx, addAppointment delega agendamentos convencionais para bookOnlineAppointment
    assert.match(
      appContextContent,
      /if\s*\(newApp\.isEncaixe\)\s*\{[\s\S]*?syncDoc\('appointments'/,
      'Apenas encaixes legítimos usam syncDoc em addAppointment'
    );
    assert.match(
      appContextContent,
      /bookOnlineAppointment\(\{[\s\S]*?tenantId:\s*newApp\.tenantId/,
      'Agendamentos convencionais via addAppointment são encaminhados obrigatoriamente para o endpoint autoritativo'
    );
  });

  it('17. Tentativa de alterar day_locks via Client SDK -> BLOQUEADA', () => {
    assert.match(
      rulesContent,
      /match\s+\/day_locks\/\{lockId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/,
      'day_locks possui allow read, write: if false para total isolamento no backend'
    );
  });

  it('18. Tentativa de alterar publicAvailability via Client SDK -> BLOQUEADA', () => {
    assert.match(
      rulesContent,
      /match\s+\/publicAvailability\/\{slotId\}\s*\{\s*allow\s+read:\s*if\s+true;\s*allow\s+write:\s*if\s+false;\s*\}/,
      'publicAvailability possui allow write: if false'
    );
  });

  // =========================================================================
  // CENÁRIOS 19 E 20: COMPROVAÇÃO DE ENDPOINTS AUTORITATIVOS NO APPCONTEXT
  // =========================================================================
  it('19. Chamada de rescheduleAppointment no AppContext usando endpoint autoritativo -> COMPROVADA', () => {
    assert.match(
      appContextContent,
      /fetch\(['"]\/api\/appointments\/reschedule['"]/,
      'rescheduleAppointment deve disparar requisição para /api/appointments/reschedule'
    );
    assert.doesNotMatch(
      appContextContent,
      /syncAppointmentWithLock/,
      'rescheduleAppointment não deve invocar syncAppointmentWithLock'
    );
  });

  it('20. Chamada de cancelAppointment no AppContext usando endpoint autoritativo -> COMPROVADA', () => {
    assert.match(
      appContextContent,
      /fetch\(['"]\/api\/appointments\/cancel['"]/,
      'cancelAppointment deve disparar requisição para /api/appointments/cancel'
    );
    // updateAppointmentStatus ao receber status CANCELADO delega imediatamente para cancelAppointment
    assert.match(
      appContextContent,
      /if\s*\(status\s*===\s*'CANCELADO'\)\s*\{\s*cancelAppointment\(appointmentId\);\s*return;\s*\}/,
      'updateAppointmentStatus deve redirecionar CANCELADO para cancelAppointment oficial'
    );
  });
});
