import crypto from 'crypto';
import { getFirebaseAdmin } from './firebaseAdmin.js';
import { toCanonicalRole, isTenantScopedRole } from '../lib/authClaims.js';
import {
  timeToMinutes,
  minutesToTime,
  getProfessionalShiftsForDate
} from '../utils/scheduleEngine.js';
import { Appointment, Barbershop, ProfessionalScheduleConfig } from '../types/index.js';
import {
  SlotOccupiedError,
  DayLockCapacityError,
  DayLockSlot,
  getCurrentDateTimeInTimezone
} from './bookingService.js';
import { assertTenantSubscriptionActive } from './subscriptionEnforcement.js';

export interface RescheduleAppointmentPayload {
  appointmentId: string;
  newDate: string;
  newStartTime: string;
  idempotencyKey?: string;
}

export interface CancelAppointmentPayload {
  appointmentId: string;
  reason?: string;
  idempotencyKey?: string;
}

export interface AdminActorContext {
  uid: string;
  role: string;
  tenantId?: string;
  isSuperAdmin?: boolean;
}

export interface AdminAppointmentServiceResult {
  status: number;
  success?: boolean;
  isReplay?: boolean;
  error?: string;
  message?: string;
  appointment?: Appointment;
}

const IDENTIFIER_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;
const TIME_FORMAT_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Campos proibidos que o cliente administrativo jamais deve injetar
const FORBIDDEN_RESCHEDULE_KEYS = [
  'tenantId',
  'professionalId',
  'professionalName',
  'serviceId',
  'serviceName',
  'servicePrice',
  'serviceDuration',
  'endTime',
  'clientId',
  'clientName',
  'clientWhatsApp',
  'status',
  'isEncaixe',
  'createdAt'
];

/**
 * Validação rigorosa e sanitização do payload de remarcação.
 */
export function validateReschedulePayload(
  rawBody: any
): { valid: boolean; error?: string; message?: string; sanitized?: RescheduleAppointmentPayload } {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return {
      valid: false,
      error: 'INVALID_PAYLOAD',
      message: 'Payload inválido ou vazio.'
    };
  }

  // 1. Bloqueio de campos proibidos / injeção de estado
  for (const forbidden of FORBIDDEN_RESCHEDULE_KEYS) {
    if (forbidden in rawBody) {
      return {
        valid: false,
        error: 'FORBIDDEN_FIELD',
        message: `O campo '${forbidden}' não pode ser alterado através do endpoint de remarcação.`
      };
    }
  }

  const { appointmentId, newDate, newStartTime, idempotencyKey } = rawBody;

  // 2. Validação do ID do agendamento
  if (typeof appointmentId !== 'string' || !IDENTIFIER_REGEX.test(appointmentId.trim())) {
    return {
      valid: false,
      error: 'INVALID_APPOINTMENT_ID',
      message: 'Identificador de agendamento (appointmentId) inválido.'
    };
  }

  // 3. Validação da nova data (calendário gregoriano)
  if (typeof newDate !== 'string' || !DATE_FORMAT_REGEX.test(newDate.trim())) {
    return {
      valid: false,
      error: 'INVALID_DATE_FORMAT',
      message: 'Nova data em formato inválido (esperado YYYY-MM-DD).'
    };
  }
  const [y, m, d] = newDate.trim().split('-').map(Number);
  const testDate = new Date(y, m - 1, d);
  if (
    testDate.getFullYear() !== y ||
    testDate.getMonth() !== m - 1 ||
    testDate.getDate() !== d
  ) {
    return {
      valid: false,
      error: 'INVALID_DATE',
      message: 'Data inexistente no calendário gregoriano.'
    };
  }

  // 4. Validação do novo horário de início
  if (typeof newStartTime !== 'string' || !TIME_FORMAT_REGEX.test(newStartTime.trim())) {
    return {
      valid: false,
      error: 'INVALID_TIME_FORMAT',
      message: 'Novo horário de início em formato inválido (esperado HH:MM).'
    };
  }

  const cleanIdemp =
    idempotencyKey && typeof idempotencyKey === 'string'
      ? idempotencyKey.trim().slice(0, 64)
      : undefined;

  return {
    valid: true,
    sanitized: {
      appointmentId: appointmentId.trim(),
      newDate: newDate.trim(),
      newStartTime: newStartTime.trim(),
      idempotencyKey: cleanIdemp
    }
  };
}

/**
 * Validação rigorosa e sanitização do payload de cancelamento.
 */
export function validateCancelPayload(
  rawBody: any
): { valid: boolean; error?: string; message?: string; sanitized?: CancelAppointmentPayload } {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return {
      valid: false,
      error: 'INVALID_PAYLOAD',
      message: 'Payload inválido ou vazio.'
    };
  }

  const { appointmentId, reason, idempotencyKey } = rawBody;

  if (typeof appointmentId !== 'string' || !IDENTIFIER_REGEX.test(appointmentId.trim())) {
    return {
      valid: false,
      error: 'INVALID_APPOINTMENT_ID',
      message: 'Identificador de agendamento (appointmentId) inválido.'
    };
  }

  let cleanReason = 'Cancelado pela administração';
  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string') {
      return {
        valid: false,
        error: 'INVALID_REASON',
        message: 'Motivo do cancelamento deve ser texto.'
      };
    }
    if (reason.length > 250) {
      return {
        valid: false,
        error: 'INVALID_REASON',
        message: 'Motivo do cancelamento não pode exceder 250 caracteres.'
      };
    }
    if (/[<>]/.test(reason)) {
      return {
        valid: false,
        error: 'INVALID_REASON',
        message: 'Motivo do cancelamento não pode conter tags HTML.'
      };
    }
    cleanReason = reason.trim();
  }

  const cleanIdemp =
    idempotencyKey && typeof idempotencyKey === 'string'
      ? idempotencyKey.trim().slice(0, 64)
      : undefined;

  return {
    valid: true,
    sanitized: {
      appointmentId: appointmentId.trim(),
      reason: cleanReason,
      idempotencyKey: cleanIdemp
    }
  };
}

/**
 * Executa a remarcação autoritativa administrativa com concorrência OCC e locks determinísticos.
 */
export async function executeAuthoritativeReschedule(params: {
  payload: RescheduleAppointmentPayload;
  actor: AdminActorContext;
}): Promise<AdminAppointmentServiceResult> {
  const { payload, actor } = params;
  const { firestore } = getFirebaseAdmin();

  // 1. RBAC Primário: apenas Super Admin, Owner ou Manager podem remarcar administrativamente
  const canonicalRole = toCanonicalRole(actor.role);
  const isSuperAdmin =
    canonicalRole === 'super_admin' || actor.isSuperAdmin === true;
  const isManagerOrOwner =
    isSuperAdmin ||
    canonicalRole === 'barbershop_owner' ||
    canonicalRole === 'manager';

  if (!isManagerOrOwner) {
    return {
      status: 403,
      error: 'FORBIDDEN_ROLE',
      message: 'Apenas proprietários, gerentes ou administradores globais podem remarcar agendamentos.'
    };
  }

  // 2. Busca o agendamento existente
  const aptDocRef = firestore.collection('appointments').doc(payload.appointmentId);
  const aptSnap = await aptDocRef.get();

  if (!aptSnap.exists) {
    return {
      status: 404,
      error: 'APPOINTMENT_NOT_FOUND',
      message: 'Agendamento não encontrado.'
    };
  }

  const aptData = aptSnap.data() as Appointment;

  // 3. Validação de Isolamento de Tenant
  if (!isSuperAdmin) {
    const actorTenant = actor.tenantId;
    if (!actorTenant || actorTenant !== aptData.tenantId) {
      return {
        status: 403,
        error: 'CROSS_TENANT_FORBIDDEN',
        message: 'Acesso negado: o agendamento pertence a outro estabelecimento.'
      };
    }
  }

  // 4. Agendamento já cancelado não pode ser remarcado
  if (aptData.status === 'CANCELADO') {
    return {
      status: 409,
      error: 'APPOINTMENT_CANCELLED',
      message: 'Agendamentos cancelados não podem ser remarcados. Crie um novo agendamento.'
    };
  }

  // 5. Validação da Barbearia (Tenant)
  const tenantDocRef = firestore.collection('barbershops').doc(aptData.tenantId);
  const tenantSnap = await tenantDocRef.get();

  if (!tenantSnap.exists) {
    return {
      status: 404,
      error: 'TENANT_NOT_FOUND',
      message: 'Estabelecimento vinculado ao agendamento não foi encontrado.'
    };
  }

  const barbershopData = tenantSnap.data() as Barbershop;
  const shopStatus = (barbershopData.status as string) || 'ATIVA';
  if (
    shopStatus === 'INATIVA' ||
    shopStatus === 'INACTIVE' ||
    shopStatus === 'TESTE_EXPIRADO' ||
    shopStatus === 'SUSPENSA'
  ) {
    return {
      status: 403,
      error: 'TENANT_INACTIVE',
      message: 'O estabelecimento encontra-se inativo ou com plano suspenso.'
    };
  }

  // 5.1 Enforcement de Assinatura Ativa (SUSPENDED ou CANCELED bloqueia remarcação)
  if (!isSuperAdmin) {
    const subCheck = await assertTenantSubscriptionActive(aptData.tenantId);
    if (!subCheck.allowed && (subCheck.status === 'SUSPENDED' || subCheck.status === 'CANCELED')) {
      return {
        status: 403,
        error: 'TENANT_SUBSCRIPTION_SUSPENDED',
        message: subCheck.reason || 'Remarcação indisponível: o estabelecimento encontra-se com assinatura suspensa ou cancelada.'
      };
    }
  }

  const timezone = (barbershopData as any).timezone || 'America/Sao_Paulo';
  const { todayStr, currentMins } = getCurrentDateTimeInTimezone(timezone);

  // 6. Validação Temporal Estrita
  if (payload.newDate < todayStr) {
    return {
      status: 400,
      error: 'INVALID_DATE_PAST',
      message: 'Não é possível remarcar para uma data passada.'
    };
  }

  const newStartMinutes = timeToMinutes(payload.newStartTime);

  if (payload.newDate === todayStr && newStartMinutes <= currentMins) {
    return {
      status: 400,
      error: 'INVALID_TIME_PAST',
      message: 'Horário já ultrapassado para o dia de hoje no fuso da barbearia.'
    };
  }

  if (newStartMinutes % 15 !== 0) {
    return {
      status: 400,
      error: 'INVALID_TIME_STEP',
      message: 'O horário de início deve estar alinhado a intervalos de 15 minutos.'
    };
  }

  // 7. Validação do Profissional
  const profDocRef = firestore.collection('users').doc(aptData.professionalId);
  const profSnap = await profDocRef.get();

  if (!profSnap.exists) {
    return {
      status: 404,
      error: 'PROFESSIONAL_NOT_FOUND',
      message: 'Profissional vinculado ao agendamento não foi encontrado.'
    };
  }

  const profData = profSnap.data()!;
  if (profData.tenantId !== aptData.tenantId) {
    return {
      status: 422,
      error: 'PROFESSIONAL_CROSS_TENANT',
      message: 'Profissional pertence a outro estabelecimento.'
    };
  }

  if (profData.status === 'inactive' || profData.status === 'INATIVO') {
    return {
      status: 400,
      error: 'PROFESSIONAL_INACTIVE',
      message: 'O profissional encontra-se inativo.'
    };
  }

  const profRole = toCanonicalRole(profData.role || profData.canonicalRole);
  if (profRole !== 'barber' && profData.role !== 'PROFISSIONAL') {
    return {
      status: 422,
      error: 'INVALID_PROFESSIONAL_ROLE',
      message: 'Usuário atribuído não possui o perfil de profissional/barbeiro.'
    };
  }

  // 8. Validação do Serviço (duração oficial derivada do backend)
  const serviceDocRef = firestore.collection('services').doc(aptData.serviceId);
  const serviceSnap = await serviceDocRef.get();

  if (!serviceSnap.exists) {
    return {
      status: 404,
      error: 'SERVICE_NOT_FOUND',
      message: 'Serviço vinculado ao agendamento não foi encontrado.'
    };
  }

  const serviceData = serviceSnap.data()!;
  if (serviceData.tenantId !== aptData.tenantId) {
    return {
      status: 422,
      error: 'SERVICE_CROSS_TENANT',
      message: 'Serviço pertence a outro estabelecimento.'
    };
  }

  if (serviceData.active === false) {
    return {
      status: 400,
      error: 'SERVICE_INACTIVE',
      message: 'O serviço encontra-se inativo no momento.'
    };
  }

  const officialDuration = Number(serviceData.durationMinutes) || Number(aptData.serviceDuration) || 30;
  if (isNaN(officialDuration) || officialDuration <= 0 || officialDuration > 480) {
    return {
      status: 500,
      error: 'INVALID_SERVICE_CONFIG',
      message: 'Duração oficial do serviço mal configurada no banco de dados.'
    };
  }

  const newEndMinutes = newStartMinutes + officialDuration;
  const computedEndTime = minutesToTime(newEndMinutes);

  // 9. Validação de Expediente e Turnos da Agenda
  let scheduleConfig: ProfessionalScheduleConfig | undefined = undefined;
  try {
    let schedSnap = await firestore.collection('schedules').doc(`sch_${aptData.professionalId}`).get();
    if (!schedSnap.exists) {
      schedSnap = await firestore.collection('schedules').doc(aptData.professionalId).get();
    }
    if (schedSnap.exists) {
      scheduleConfig = schedSnap.data() as ProfessionalScheduleConfig;
    }
  } catch (err) {
    console.warn('[AdminAppointmentService] Aviso ao carregar schedule do profissional:', err);
  }

  const shiftInfo = getProfessionalShiftsForDate(
    scheduleConfig,
    payload.newDate,
    barbershopData.businessHours
  );

  if (!shiftInfo.enabled || shiftInfo.shifts.length === 0) {
    return {
      status: 400,
      error: 'OUTSIDE_BUSINESS_HOURS',
      message: shiftInfo.reason || 'Barbearia ou profissional sem expediente nesta data.'
    };
  }

  const fitsInShift = shiftInfo.shifts.some(shift => {
    const sStart = timeToMinutes(shift.start);
    const sEnd = timeToMinutes(shift.end);
    return newStartMinutes >= sStart && newEndMinutes <= sEnd;
  });

  if (!fitsInShift) {
    return {
      status: 400,
      error: 'OUTSIDE_PROFESSIONAL_SHIFT',
      message: `O serviço (${officialDuration} min) ultrapassa a jornada de trabalho ou coincide com intervalo de atendimento.`
    };
  }

  // 10. Concorrência Determinística com Day Locks (Deadlock Prevention)
  const oldLockRef = firestore
    .collection('barbershops')
    .doc(aptData.tenantId)
    .collection('day_locks')
    .doc(`${aptData.professionalId}_${aptData.date}`);

  const newLockRef = firestore
    .collection('barbershops')
    .doc(aptData.tenantId)
    .collection('day_locks')
    .doc(`${aptData.professionalId}_${payload.newDate}`);

  const isSameLock = oldLockRef.path === newLockRef.path;

  // Ordenação lexicográfica estrita dos DocumentReference para prevenir deadlocks concorrentes
  const lockRefs = isSameLock
    ? [oldLockRef]
    : [oldLockRef, newLockRef].sort((a, b) => a.path.localeCompare(b.path));

  const pubDocRef = firestore.collection('publicAvailability').doc(payload.appointmentId);
  const nowIso = new Date().toISOString();

  let updatedAppointment: Appointment | null = null;
  let isReplay = false;

  try {
    await firestore.runTransaction(async (transaction) => {
      // LEITURA 1: Idempotency Key (se informada)
      if (payload.idempotencyKey) {
        const idempDocRef = firestore
          .collection('barbershops')
          .doc(aptData.tenantId)
          .collection('idempotency_keys')
          .doc(payload.idempotencyKey);
        const idempSnap = await transaction.get(idempDocRef);
        if (idempSnap.exists) {
          const idempData = idempSnap.data();
          if (idempData && idempData.status === 'COMPLETED' && idempData.responsePayload) {
            isReplay = true;
            updatedAppointment = idempData.responsePayload.appointment;
            return;
          }
        }
      }

      // LEITURA 2: Estado mais recente do appointment dentro da transação
      const currentAptSnap = await transaction.get(aptDocRef);
      if (!currentAptSnap.exists) {
        throw new Error('APPOINTMENT_NOT_FOUND');
      }
      const currentApt = currentAptSnap.data() as Appointment;

      // Se já foi remarcado para exatamente essa mesma data e horário (idempotência sem lock)
      if (
        currentApt.date === payload.newDate &&
        currentApt.startTime === payload.newStartTime &&
        currentApt.endTime === computedEndTime
      ) {
        isReplay = true;
        updatedAppointment = currentApt;
        return;
      }

      // LEITURA 3: Locks Diários na ordem determinística
      const lockSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const ref of lockRefs) {
        const snap = await transaction.get(ref);
        lockSnapshots.set(ref.path, snap);
      }

      const oldLockSnap = lockSnapshots.get(oldLockRef.path)!;
      const oldSlotsRaw: DayLockSlot[] = oldLockSnap.exists
        ? (oldLockSnap.data()?.slots || [])
        : [];

      // Filtra e libera o slot antigo do agendamento
      const oldSlotsFiltered = oldSlotsRaw.filter(
        s => s.appointmentId !== payload.appointmentId
      );

      // Determina os slots base para o novo dia
      let newSlotsBase: DayLockSlot[];
      if (isSameLock) {
        newSlotsBase = oldSlotsFiltered;
      } else {
        const newLockSnap = lockSnapshots.get(newLockRef.path)!;
        const newSlotsRaw: DayLockSlot[] = newLockSnap.exists
          ? (newLockSnap.data()?.slots || [])
          : [];
        newSlotsBase = newSlotsRaw.filter(
          s => s.appointmentId !== payload.appointmentId
        );
      }

      // Validação de capacidade máxima diária (50 agendamentos)
      if (newSlotsBase.length >= 50) {
        throw new DayLockCapacityError(
          'Capacidade máxima de 50 agendamentos diários atingida para este profissional nesta data.'
        );
      }

      // Validação de colisão de horários no novo lock (desconsidera se for encaixe administrativo intencional)
      if (!currentApt.isEncaixe) {
        for (const slot of newSlotsBase) {
          if (slot.isEncaixe) continue;
          if (newStartMinutes < slot.endMinutes && newEndMinutes > slot.startMinutes) {
            throw new SlotOccupiedError(
              `Horário indisponível para remarcação. Já existe um agendamento reservado (${slot.startTime} às ${slot.endTime}).`
            );
          }
        }
      }

      // Constrói o novo slot ocupado
      const newSlot: DayLockSlot = {
        appointmentId: payload.appointmentId,
        startTime: payload.newStartTime,
        endTime: computedEndTime,
        startMinutes: newStartMinutes,
        endMinutes: newEndMinutes,
        isEncaixe: currentApt.isEncaixe || false
      };

      const updatedNewSlots = [...newSlotsBase, newSlot].sort(
        (a, b) => a.startMinutes - b.startMinutes
      );

      // ESCRITAS:
      if (isSameLock) {
        transaction.set(
          newLockRef,
          {
            tenantId: aptData.tenantId,
            professionalId: aptData.professionalId,
            date: payload.newDate,
            slots: updatedNewSlots,
            updatedAt: nowIso,
            version: (oldLockSnap.data()?.version || 0) + 1
          },
          { merge: true }
        );
      } else {
        // Atualiza dia antigo (libera slot)
        transaction.set(
          oldLockRef,
          {
            tenantId: aptData.tenantId,
            professionalId: aptData.professionalId,
            date: currentApt.date,
            slots: oldSlotsFiltered,
            updatedAt: nowIso,
            version: (oldLockSnap.data()?.version || 0) + 1
          },
          { merge: true }
        );

        // Atualiza novo dia (reserva slot)
        const newLockSnap = lockSnapshots.get(newLockRef.path)!;
        transaction.set(
          newLockRef,
          {
            tenantId: aptData.tenantId,
            professionalId: aptData.professionalId,
            date: payload.newDate,
            slots: updatedNewSlots,
            updatedAt: nowIso,
            version: (newLockSnap.data()?.version || 0) + 1
          },
          { merge: true }
        );
      }

      // Atualiza o documento appointments/{appointmentId}
      const finalApt: Appointment = {
        ...currentApt,
        date: payload.newDate,
        startTime: payload.newStartTime,
        endTime: computedEndTime,
        serviceDuration: officialDuration,
        reminderSent: false,
        updatedAt: nowIso
      };

      transaction.set(aptDocRef, finalApt, { merge: true });
      updatedAppointment = finalApt;

      // Atualiza atomicamente a projeção pública (publicAvailability/{appointmentId})
      transaction.set(pubDocRef, {
        id: payload.appointmentId,
        tenantId: aptData.tenantId,
        professionalId: aptData.professionalId,
        date: payload.newDate,
        startTime: payload.newStartTime,
        endTime: computedEndTime,
        status: 'AGENDADO'
      });

      // Registra a chave de idempotência se informada
      if (payload.idempotencyKey) {
        const idempDocRef = firestore
          .collection('barbershops')
          .doc(aptData.tenantId)
          .collection('idempotency_keys')
          .doc(payload.idempotencyKey);
        transaction.set(idempDocRef, {
          key: payload.idempotencyKey,
          tenantId: aptData.tenantId,
          appointmentId: payload.appointmentId,
          status: 'COMPLETED',
          responsePayload: {
            success: true,
            appointment: finalApt
          },
          createdAt: nowIso
        });
      }
    });

    return {
      status: 200,
      success: true,
      isReplay,
      appointment: updatedAppointment!
    };
  } catch (txErr: any) {
    if (txErr instanceof SlotOccupiedError) {
      return {
        status: 409,
        error: 'SLOT_OCCUPIED',
        message: txErr.message
      };
    }
    if (txErr instanceof DayLockCapacityError) {
      return {
        status: 409,
        error: 'DAY_LOCK_CAPACITY_EXCEEDED',
        message: txErr.message
      };
    }
    if (txErr?.message === 'APPOINTMENT_NOT_FOUND') {
      return {
        status: 404,
        error: 'APPOINTMENT_NOT_FOUND',
        message: 'Agendamento não encontrado durante a transação.'
      };
    }
    console.error('[AdminAppointmentService] Erro na transação de remarcação:', txErr);
    return {
      status: 500,
      error: 'RESCHEDULE_TRANSACTION_FAILED',
      message: 'Falha interna ao processar remarcação atômica.'
    };
  }
}

/**
 * Executa o cancelamento autoritativo administrativo liberando day_lock e publicAvailability.
 */
export async function executeAuthoritativeCancel(params: {
  payload: CancelAppointmentPayload;
  actor: AdminActorContext;
}): Promise<AdminAppointmentServiceResult> {
  const { payload, actor } = params;
  const { firestore } = getFirebaseAdmin();

  const canonicalRole = toCanonicalRole(actor.role);
  const isSuperAdmin =
    canonicalRole === 'super_admin' || actor.isSuperAdmin === true;
  const isManagerOrOwner =
    isSuperAdmin ||
    canonicalRole === 'barbershop_owner' ||
    canonicalRole === 'manager';

  if (!isManagerOrOwner) {
    return {
      status: 403,
      error: 'FORBIDDEN_ROLE',
      message: 'Apenas proprietários, gerentes ou administradores globais podem cancelar agendamentos.'
    };
  }

  const aptDocRef = firestore.collection('appointments').doc(payload.appointmentId);
  const aptSnap = await aptDocRef.get();

  if (!aptSnap.exists) {
    return {
      status: 404,
      error: 'APPOINTMENT_NOT_FOUND',
      message: 'Agendamento não encontrado.'
    };
  }

  const aptData = aptSnap.data() as Appointment;

  // Isolamento de Tenant
  if (!isSuperAdmin) {
    const actorTenant = actor.tenantId;
    if (!actorTenant || actorTenant !== aptData.tenantId) {
      return {
        status: 403,
        error: 'CROSS_TENANT_FORBIDDEN',
        message: 'Acesso negado: o agendamento pertence a outro estabelecimento.'
      };
    }
  }

  // Se já estiver cancelado, responde 200 de forma idempotente e segura
  if (aptData.status === 'CANCELADO') {
    return {
      status: 200,
      success: true,
      isReplay: true,
      appointment: aptData
    };
  }

  // Enforcement de Assinatura Ativa (SUSPENDED ou CANCELED bloqueia cancelamento administrativo novo)
  if (!isSuperAdmin) {
    const subCheck = await assertTenantSubscriptionActive(aptData.tenantId);
    if (!subCheck.allowed && (subCheck.status === 'SUSPENDED' || subCheck.status === 'CANCELED')) {
      return {
        status: 403,
        error: 'TENANT_SUBSCRIPTION_SUSPENDED',
        message: subCheck.reason || 'Cancelamento indisponível: o estabelecimento encontra-se com assinatura suspensa ou cancelada.'
      };
    }
  }

  const dayLockDocRef = firestore
    .collection('barbershops')
    .doc(aptData.tenantId)
    .collection('day_locks')
    .doc(`${aptData.professionalId}_${aptData.date}`);

  const pubDocRef = firestore.collection('publicAvailability').doc(payload.appointmentId);
  const nowIso = new Date().toISOString();

  let cancelledAppointment: Appointment | null = null;

  try {
    await firestore.runTransaction(async (transaction) => {
      // 1. Lê e atualiza o day_lock removendo o slot
      const lockSnap = await transaction.get(dayLockDocRef);
      if (lockSnap.exists) {
        const slots: DayLockSlot[] = lockSnap.data()?.slots || [];
        const filteredSlots = slots.filter(
          s => s.appointmentId !== payload.appointmentId
        );
        transaction.set(
          dayLockDocRef,
          {
            tenantId: aptData.tenantId,
            professionalId: aptData.professionalId,
            date: aptData.date,
            slots: filteredSlots,
            updatedAt: nowIso,
            version: (lockSnap.data()?.version || 0) + 1
          },
          { merge: true }
        );
      }

      // 2. Atualiza o agendamento para CANCELADO
      const updated: Appointment = {
        ...aptData,
        status: 'CANCELADO',
        cancelledAt: nowIso,
        cancellationReason: payload.reason || 'Cancelado pela administração',
        updatedAt: nowIso
      };

      transaction.set(aptDocRef, updated, { merge: true });
      cancelledAppointment = updated;

      // 3. Remove imediatamente da disponibilidade pública (publicAvailability)
      transaction.delete(pubDocRef);
    });

    return {
      status: 200,
      success: true,
      appointment: cancelledAppointment!
    };
  } catch (txErr: any) {
    console.error('[AdminAppointmentService] Erro no cancelamento atômico:', txErr);
    return {
      status: 500,
      error: 'CANCEL_TRANSACTION_FAILED',
      message: 'Falha interna ao processar cancelamento no banco de dados.'
    };
  }
}
