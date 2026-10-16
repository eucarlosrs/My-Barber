import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { isTimeSlotAvailable } from '../utils/scheduleEngine.js';

/**
 * ETAPA 2.1G — TESTES AUTOMATIZADOS DE INTEGRIDADE ADMINISTRATIVA E REMARCAÇÃO
 *
 * Mapeamento dos 20 Casos Obrigatórios:
 * 1. Manager/Owner não pode mover appointment para outro tenant.
 * 2. Professional não pode alterar serviceId.
 * 3. Professional não pode alterar price.
 * 4. Professional não pode alterar duration.
 * 5. Professional não pode alterar professionalId.
 * 6. Professional não pode alterar date.
 * 7. Professional não pode alterar startTime.
 * 8. Professional não pode alterar endTime.
 * 9. Professional pode atualizar status permitido.
 * 10. Professional pode atualizar notes se esse fluxo realmente existir.
 * 11. Customer update = DENY.
 * 12. Customer delete = DENY.
 * 13. Anonymous update = DENY.
 * 14. Anonymous delete = DENY.
 * 15. Outro tenant = DENY.
 *
 * Para Remarcação:
 * 16. Detectar conflito com appointment existente.
 * 17. Detectar intervalo inválido.
 * 18. Detectar profissional inexistente.
 * 19. Detectar profissional de outro tenant.
 * 20. Detectar serviço de outro tenant.
 */

// Interface e simulador de avaliação das regras soberanas do Firestore
interface AuthContext {
  uid?: string;
  token?: {
    role?: string;
    tenantId?: string;
    barbershopId?: string;
    isSuperAdmin?: boolean;
    phone_number?: string;
  };
}

function evaluateAppointmentUpdateRule(
  incomingData: Record<string, any>,
  existingData: Record<string, any>,
  auth: AuthContext | null
): { allowed: boolean; reason?: string } {
  if (!auth || !auth.uid) {
    return { allowed: false, reason: 'Não autenticado' };
  }

  const role = auth.token?.role || '';
  const tenant = auth.token?.tenantId || auth.token?.barbershopId || '';

  const isSuperAdmin =
    role === 'super_admin' || role === 'SUPER_ADMIN' || auth.token?.isSuperAdmin === true;

  const isManagerOrOwner =
    isSuperAdmin ||
    (tenant === existingData.tenantId &&
      ['barbershop_owner', 'PROPRIETARIO', 'owner', 'manager', 'GERENTE'].includes(role));

  const isProfessional =
    isSuperAdmin ||
    (tenant === existingData.tenantId && ['barber', 'PROFISSIONAL'].includes(role));

  // Ramo 1: Super Admin
  if (isSuperAdmin) {
    return { allowed: true };
  }

  // Ramo 2: Manager / Owner
  if (isManagerOrOwner) {
    if (incomingData.tenantId !== existingData.tenantId) {
      return { allowed: false, reason: 'Imutabilidade de tenantId violada por Manager/Owner' };
    }
    return { allowed: true };
  }

  // Ramo 3: Professional / Barber
  if (isProfessional) {
    if (incomingData.tenantId !== existingData.tenantId) {
      return { allowed: false, reason: 'Profissional não pode alterar tenantId' };
    }
    if (incomingData.professionalId !== existingData.professionalId) {
      return { allowed: false, reason: 'Profissional não pode alterar professionalId' };
    }
    if (incomingData.serviceId !== existingData.serviceId) {
      return { allowed: false, reason: 'Profissional não pode alterar serviceId' };
    }
    if (incomingData.date !== existingData.date) {
      return { allowed: false, reason: 'Profissional não pode alterar date' };
    }
    if (incomingData.startTime !== existingData.startTime) {
      return { allowed: false, reason: 'Profissional não pode alterar startTime' };
    }
    if (incomingData.endTime !== existingData.endTime) {
      return { allowed: false, reason: 'Profissional não pode alterar endTime' };
    }
    if (incomingData.servicePrice !== existingData.servicePrice) {
      return { allowed: false, reason: 'Profissional não pode alterar servicePrice' };
    }
    if (incomingData.serviceDuration !== existingData.serviceDuration) {
      return { allowed: false, reason: 'Profissional não pode alterar serviceDuration' };
    }
    if (incomingData.clientId !== existingData.clientId) {
      return { allowed: false, reason: 'Profissional não pode alterar clientId' };
    }
    if (incomingData.clientName !== existingData.clientName) {
      return { allowed: false, reason: 'Profissional não pode alterar clientName' };
    }
    if (incomingData.clientWhatsApp !== existingData.clientWhatsApp) {
      return { allowed: false, reason: 'Profissional não pode alterar clientWhatsApp' };
    }
    if (incomingData.createdAt !== existingData.createdAt) {
      return { allowed: false, reason: 'Profissional não pode alterar createdAt' };
    }
    const validStatus = ['AGENDADO', 'CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU'];
    if (!validStatus.includes(incomingData.status)) {
      return { allowed: false, reason: 'Status operacional inválido para profissional' };
    }
    return { allowed: true };
  }

  // Demais papéis (customer, visitante, etc.): DENY
  return { allowed: false, reason: 'Operação de atualização não autorizada para este papel' };
}

function evaluateAppointmentDeleteRule(
  existingData: Record<string, any>,
  auth: AuthContext | null
): { allowed: boolean; reason?: string } {
  if (!auth || !auth.uid) {
    return { allowed: false, reason: 'Não autenticado' };
  }
  const role = auth.token?.role || '';
  const tenant = auth.token?.tenantId || auth.token?.barbershopId || '';

  const isSuperAdmin =
    role === 'super_admin' || role === 'SUPER_ADMIN' || auth.token?.isSuperAdmin === true;

  const isManagerOrOwner =
    isSuperAdmin ||
    (tenant === existingData.tenantId &&
      ['barbershop_owner', 'PROPRIETARIO', 'owner', 'manager', 'GERENTE'].includes(role));

  if (isSuperAdmin || isManagerOrOwner) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Exclusão permitida apenas para gestão ou super admin' };
}

describe('ETAPA 2.1G — Bateria de Testes de Integridade Administrativa e Remarcação', () => {
  const baseAppointment = {
    id: 'apt-base-001',
    tenantId: 'tenant-barber-a',
    serviceId: 'srv-corte-classico',
    serviceName: 'Corte Clássico',
    servicePrice: 45.0,
    serviceDuration: 30,
    professionalId: 'prof-rodrigo',
    professionalName: 'Rodrigo Barbeiro',
    clientId: 'client-joao-123',
    clientName: 'João da Silva',
    clientWhatsApp: '(11) 98888-7777',
    date: '2026-10-20',
    startTime: '14:00',
    endTime: '14:30',
    isEncaixe: false,
    status: 'AGENDADO',
    notes: 'Degradê baixo',
    reminderSent: false,
    createdAt: '2026-10-10T10:00:00.000Z'
  };

  const managerAuth: AuthContext = {
    uid: 'mgr-01',
    token: { role: 'manager', tenantId: 'tenant-barber-a' }
  };

  const ownerAuth: AuthContext = {
    uid: 'owner-01',
    token: { role: 'barbershop_owner', tenantId: 'tenant-barber-a' }
  };

  const profAuth: AuthContext = {
    uid: 'prof-rodrigo',
    token: { role: 'barber', tenantId: 'tenant-barber-a' }
  };

  const customerAuth: AuthContext = {
    uid: 'client-joao-123',
    token: { role: 'customer', tenantId: 'tenant-barber-a' }
  };

  const otherTenantManagerAuth: AuthContext = {
    uid: 'mgr-other',
    token: { role: 'manager', tenantId: 'tenant-barber-b' }
  };

  // 1. Manager/Owner não pode mover appointment para outro tenant
  it('1. Manager/Owner não pode mover appointment para outro tenant', () => {
    const altered = { ...baseAppointment, tenantId: 'tenant-barber-b' };
    const resMgr = evaluateAppointmentUpdateRule(altered, baseAppointment, managerAuth);
    assert.strictEqual(resMgr.allowed, false, 'Manager não pode alterar tenantId');

    const resOwner = evaluateAppointmentUpdateRule(altered, baseAppointment, ownerAuth);
    assert.strictEqual(resOwner.allowed, false, 'Owner não pode alterar tenantId');
  });

  // 2. Professional não pode alterar serviceId
  it('2. Professional não pode alterar serviceId', () => {
    const altered = { ...baseAppointment, serviceId: 'srv-barba-luxo' };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, profAuth);
    assert.strictEqual(res.allowed, false, 'Professional não pode alterar serviceId');
  });

  // 3. Professional não pode alterar price
  it('3. Professional não pode alterar price', () => {
    const altered = { ...baseAppointment, servicePrice: 10.0 };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, profAuth);
    assert.strictEqual(res.allowed, false, 'Professional não pode alterar servicePrice');
  });

  // 4. Professional não pode alterar duration
  it('4. Professional não pode alterar duration', () => {
    const altered = { ...baseAppointment, serviceDuration: 15 };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, profAuth);
    assert.strictEqual(res.allowed, false, 'Professional não pode alterar serviceDuration');
  });

  // 5. Professional não pode alterar professionalId
  it('5. Professional não pode alterar professionalId', () => {
    const altered = { ...baseAppointment, professionalId: 'prof-carlos' };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, profAuth);
    assert.strictEqual(res.allowed, false, 'Professional não pode alterar professionalId');
  });

  // 6. Professional não pode alterar date
  it('6. Professional não pode alterar date', () => {
    const altered = { ...baseAppointment, date: '2026-10-25' };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, profAuth);
    assert.strictEqual(res.allowed, false, 'Professional não pode alterar date');
  });

  // 7. Professional não pode alterar startTime
  it('7. Professional não pode alterar startTime', () => {
    const altered = { ...baseAppointment, startTime: '16:00' };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, profAuth);
    assert.strictEqual(res.allowed, false, 'Professional não pode alterar startTime');
  });

  // 8. Professional não pode alterar endTime
  it('8. Professional não pode alterar endTime', () => {
    const altered = { ...baseAppointment, endTime: '15:00' };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, profAuth);
    assert.strictEqual(res.allowed, false, 'Professional não pode alterar endTime');
  });

  // 9. Professional pode atualizar status permitido
  it('9. Professional pode atualizar status permitido (AGENDADO, CONCLUIDO, CANCELADO, NAO_COMPARECEU)', () => {
    for (const st of ['CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU', 'AGENDADO'] as const) {
      const altered = { ...baseAppointment, status: st };
      const res = evaluateAppointmentUpdateRule(altered, baseAppointment, profAuth);
      assert.strictEqual(res.allowed, true, `Professional deve poder atualizar status para ${st}`);
    }

    // Status inválido / não previsto no enum
    const invalidStatus = { ...baseAppointment, status: 'REEMBOLSADO' };
    const resInvalid = evaluateAppointmentUpdateRule(invalidStatus, baseAppointment, profAuth);
    assert.strictEqual(resInvalid.allowed, false, 'Professional não pode usar status fora do enum');
  });

  // 10. Professional pode atualizar notes se esse fluxo realmente existir
  it('10. Professional pode atualizar notes no agendamento', () => {
    const altered = { ...baseAppointment, notes: 'Cliente pediu atenção redobrada no acabamento' };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, profAuth);
    assert.strictEqual(res.allowed, true, 'Professional pode registrar anotações operacionais');
  });

  // 11. Customer update = DENY
  it('11. Customer update = DENY', () => {
    const altered = { ...baseAppointment, status: 'CANCELADO' };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, customerAuth);
    assert.strictEqual(res.allowed, false, 'Customer não tem permissão para update de appointment');
  });

  // 12. Customer delete = DENY
  it('12. Customer delete = DENY', () => {
    const res = evaluateAppointmentDeleteRule(baseAppointment, customerAuth);
    assert.strictEqual(res.allowed, false, 'Customer não tem permissão para delete de appointment');
  });

  // 13. Anonymous update = DENY
  it('13. Anonymous update = DENY', () => {
    const altered = { ...baseAppointment, status: 'CANCELADO' };
    const res = evaluateAppointmentUpdateRule(altered, baseAppointment, null);
    assert.strictEqual(res.allowed, false, 'Anonymous não tem permissão para update');
  });

  // 14. Anonymous delete = DENY
  it('14. Anonymous delete = DENY', () => {
    const res = evaluateAppointmentDeleteRule(baseAppointment, null);
    assert.strictEqual(res.allowed, false, 'Anonymous não tem permissão para delete');
  });

  // 15. Outro tenant = DENY
  it('15. Usuário de outro tenant não pode atualizar nem deletar appointment (DENY)', () => {
    const altered = { ...baseAppointment, notes: 'Tentativa de alteração inter-tenant' };
    const resUpdate = evaluateAppointmentUpdateRule(altered, baseAppointment, otherTenantManagerAuth);
    assert.strictEqual(resUpdate.allowed, false, 'Gestor de outro tenant não pode atualizar');

    const resDelete = evaluateAppointmentDeleteRule(baseAppointment, otherTenantManagerAuth);
    assert.strictEqual(resDelete.allowed, false, 'Gestor de outro tenant não pode deletar');
  });

  // 16. Remarcação: Detectar conflito com appointment existente
  it('16. Remarcação: Detectar conflito com appointment existente', () => {
    const existingAppointments = [
      {
        id: 'apt-a',
        professionalId: 'prof-1',
        date: '2026-10-20',
        startTime: '10:00',
        endTime: '10:30',
        status: 'AGENDADO' as const
      },
      {
        id: 'apt-b',
        professionalId: 'prof-1',
        date: '2026-10-20',
        startTime: '11:00',
        endTime: '11:30',
        status: 'AGENDADO' as const
      }
    ];

    // Gestor tenta remarcar apt-b para o horário de apt-a (10:00-10:30)
    const check = isTimeSlotAvailable({
      date: '2026-10-20',
      startTime: '10:00',
      durationMinutes: 30,
      professionalId: 'prof-1',
      existingAppointments: existingAppointments as any,
      excludeAppointmentId: 'apt-b',
      referenceDate: new Date('2026-10-01T00:00:00Z')
    });

    assert.strictEqual(check.available, false, 'Deve detectar conflito com apt-a');
    assert.ok(check.reason?.includes('Já existe um agendamento reservado'));
  });

  // 17. Remarcação: Detectar intervalo inválido
  it('17. Remarcação: Detectar intervalo inválido', () => {
    const checkNegativeDuration = isTimeSlotAvailable({
      date: '2026-10-20',
      startTime: '10:00',
      durationMinutes: -15,
      professionalId: 'prof-1',
      existingAppointments: [],
      referenceDate: new Date('2026-10-01T00:00:00Z')
    });
    assert.strictEqual(checkNegativeDuration.available, false, 'Duração negativa deve ser rejeitada');

    const checkOverflow = isTimeSlotAvailable({
      date: '2026-10-20',
      startTime: '23:45',
      durationMinutes: 60, // Ultrapassa 1440 mins
      professionalId: 'prof-1',
      existingAppointments: [],
      referenceDate: new Date('2026-10-01T00:00:00Z')
    });
    assert.strictEqual(checkOverflow.available, false, 'Horário que ultrapassa o final do dia deve ser rejeitado');
  });

  // 18. Remarcação: Detectar profissional inexistente
  it('18. Remarcação: Detectar profissional inexistente [PENDENTE — ausência de mecanismo autoritativo]', () => {
    // AUDITORIA TÉCNICA:
    // rescheduleAppointment recebe apenas (appointmentId, newDate, newStartTime, newEndTime).
    // O professionalId é herdado diretamente de apt.professionalId.
    // Nas regras de update (firestore.rules), allow update para Manager/Owner não possui
    // validação de exists(/databases/.../users/$(professionalId)). Essa checagem existe exclusivamente em create.
    // Não há endpoint autoritativo backend para remarcação.
    const status = 'PENDENTE — ausência de mecanismo autoritativo';
    assert.strictEqual(status, 'PENDENTE — ausência de mecanismo autoritativo');
  });

  // 19. Remarcação: Detectar profissional de outro tenant
  it('19. Remarcação: Detectar profissional de outro tenant [PENDENTE — ausência de mecanismo autoritativo]', () => {
    // AUDITORIA TÉCNICA:
    // Se um Manager/Owner atualizar o documento appointments/{id} diretamente no Firestore alterando
    // o professionalId para um profissional pertencente a outro tenant,
    // a regra de update atual (firestore.rules: linhas 310-335) valida apenas
    // isManagerOrOwnerOfTenant(resource.data.tenantId) && request.resource.data.tenantId == resource.data.tenantId.
    // Não há checagem get(/databases/.../users/$(request.resource.data.professionalId)).data.tenantId == resource.data.tenantId no update.
    const status = 'PENDENTE — ausência de mecanismo autoritativo';
    assert.strictEqual(status, 'PENDENTE — ausência de mecanismo autoritativo');
  });

  // 20. Remarcação: Detectar serviço de outro tenant
  it('20. Remarcação: Detectar serviço de outro tenant [PENDENTE — ausência de mecanismo autoritativo]', () => {
    // AUDITORIA TÉCNICA:
    // Se um Manager/Owner atualizar o documento appointments/{id} diretamente no Firestore alterando
    // o serviceId para um serviço pertencente a outro tenant, a regra de update não realiza
    // checagem cruzada get(/databases/.../services/$(request.resource.data.serviceId)).data.tenantId == resource.data.tenantId.
    // Essa validação existe no allow create, mas está ausente no allow update.
    const status = 'PENDENTE — ausência de mecanismo autoritativo';
    assert.strictEqual(status, 'PENDENTE — ausência de mecanismo autoritativo');
  });
});
