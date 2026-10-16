import crypto from 'crypto';
import { getFirebaseAdmin, verifyFirebaseIdToken } from './firebaseAdmin.js';
import { toCanonicalRole, isTenantScopedRole } from '../lib/authClaims.js';
import {
  timeToMinutes,
  minutesToTime,
  getProfessionalShiftsForDate
} from '../utils/scheduleEngine.js';
import { Appointment, Barbershop, ProfessionalScheduleConfig } from '../types/index.js';

export class SlotOccupiedError extends Error {
  constructor(message = 'Horário indisponível. Já existe um agendamento reservado.') {
    super(message);
    this.name = 'SlotOccupiedError';
  }
}

export class DayLockCapacityError extends Error {
  constructor(message = 'Capacidade máxima de 50 agendamentos diários atingida.') {
    super(message);
    this.name = 'DayLockCapacityError';
  }
}

export interface DayLockSlot {
  appointmentId: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  isEncaixe: boolean;
}

export interface BookAppointmentPayload {
  tenantId: string;
  professionalId: string;
  serviceId: string;
  date: string;
  startTime: string;
  idempotencyKey: string;
  clientName: string;
  clientWhatsApp: string;
  notes?: string;
}

export interface BookingServiceResult {
  status: number;
  isReplay?: boolean;
  error?: string;
  message?: string;
  appointment?: Appointment;
}

// Chaves permitidas no payload do agendamento
const ALLOWED_PAYLOAD_KEYS = new Set([
  'tenantId',
  'professionalId',
  'serviceId',
  'date',
  'startTime',
  'idempotencyKey',
  'clientName',
  'clientWhatsApp',
  'notes'
]);

// Campos proibidos que jamais devem ser enviados pelo cliente
const FORBIDDEN_PAYLOAD_KEYS = [
  'servicePrice',
  'serviceDuration',
  'endTime',
  'serviceName',
  'professionalName',
  'status',
  'isEncaixe',
  'clientId',
  'createdAt',
  'reminderSent',
  'reminderSentAt'
];

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;
const TIME_FORMAT_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validação rigorosa e sanitização do payload de agendamento online.
 */
export function validateBookingPayload(
  rawBody: any
): { valid: boolean; error?: string; message?: string; sanitized?: BookAppointmentPayload } {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Payload inválido ou vazio.'
    };
  }

  // 1. Checagem de campos proibidos explícitos
  for (const forbidden of FORBIDDEN_PAYLOAD_KEYS) {
    if (forbidden in rawBody) {
      return {
        valid: false,
        error: 'INVALID_BOOKING_PAYLOAD',
        message: `O campo proibido '${forbidden}' não pode ser definido pelo cliente.`
      };
    }
  }

  // 2. Checagem de campos arbitrários (não previstos no contrato estrito)
  for (const key of Object.keys(rawBody)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) {
      return {
        valid: false,
        error: 'INVALID_BOOKING_PAYLOAD',
        message: `Campo não permitido no agendamento: '${key}'.`
      };
    }
  }

  const {
    tenantId,
    professionalId,
    serviceId,
    date,
    startTime,
    idempotencyKey,
    clientName,
    clientWhatsApp,
    notes
  } = rawBody;

  // 3. Validação dos identificadores relacionais
  if (typeof tenantId !== 'string' || !IDENTIFIER_REGEX.test(tenantId.trim())) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Identificador do estabelecimento (tenantId) em formato inválido.'
    };
  }

  if (typeof professionalId !== 'string' || !IDENTIFIER_REGEX.test(professionalId.trim())) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Identificador do profissional (professionalId) em formato inválido.'
    };
  }

  if (typeof serviceId !== 'string' || !IDENTIFIER_REGEX.test(serviceId.trim())) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Identificador do serviço (serviceId) em formato inválido.'
    };
  }

  // 4. Validação estrita da data de calendário
  if (typeof date !== 'string' || !DATE_FORMAT_REGEX.test(date.trim())) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Data de agendamento em formato inválido (esperado YYYY-MM-DD).'
    };
  }
  const [y, m, d] = date.trim().split('-').map(Number);
  const testDate = new Date(y, m - 1, d);
  if (
    testDate.getFullYear() !== y ||
    testDate.getMonth() !== m - 1 ||
    testDate.getDate() !== d
  ) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Data inexistente no calendário gregoriano.'
    };
  }

  // 5. Validação do horário de início
  if (typeof startTime !== 'string' || !TIME_FORMAT_REGEX.test(startTime.trim())) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Horário de início em formato inválido (esperado HH:MM).'
    };
  }

  // 6. Validação da chave de idempotência (UUID v4)
  if (
    typeof idempotencyKey !== 'string' ||
    !UUID_V4_REGEX.test(idempotencyKey.trim())
  ) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Chave de idempotência ausente ou fora do padrão UUID v4.'
    };
  }

  // 7. Validação do nome do cliente (anti-XSS / anti-HTML)
  if (typeof clientName !== 'string') {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Nome do cliente deve ser um texto.'
    };
  }
  const cleanName = clientName.trim();
  if (cleanName.length < 2 || cleanName.length > 80) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Nome do cliente deve ter entre 2 e 80 caracteres.'
    };
  }
  if (/[<>]/.test(cleanName) || /javascript:/i.test(cleanName)) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'Nome do cliente contém caracteres ou código não permitidos.'
    };
  }

  // 8. Validação do WhatsApp do cliente
  if (typeof clientWhatsApp !== 'string') {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'WhatsApp do cliente deve ser informado.'
    };
  }
  const cleanDigits = clientWhatsApp.replace(/\D/g, '');
  if (cleanDigits.length < 10 || cleanDigits.length > 14) {
    return {
      valid: false,
      error: 'INVALID_BOOKING_PAYLOAD',
      message: 'WhatsApp do cliente deve conter um número de telefone válido (10 a 14 dígitos).'
    };
  }

  // 9. Validação de observações (opcional, máx 250 caracteres, anti-HTML)
  let cleanNotes = '';
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      return {
        valid: false,
        error: 'INVALID_BOOKING_PAYLOAD',
        message: 'Observações devem ser em formato de texto.'
      };
    }
    if (notes.length > 250) {
      return {
        valid: false,
        error: 'INVALID_BOOKING_PAYLOAD',
        message: 'Observações não podem exceder 250 caracteres.'
      };
    }
    if (/[<>]/.test(notes)) {
      return {
        valid: false,
        error: 'INVALID_BOOKING_PAYLOAD',
        message: 'Observações não podem conter tags HTML.'
      };
    }
    cleanNotes = notes.trim();
  }

  return {
    valid: true,
    sanitized: {
      tenantId: tenantId.trim(),
      professionalId: professionalId.trim(),
      serviceId: serviceId.trim(),
      date: date.trim(),
      startTime: startTime.trim(),
      idempotencyKey: idempotencyKey.trim().toLowerCase(),
      clientName: cleanName,
      clientWhatsApp: clientWhatsApp.trim(),
      notes: cleanNotes
    }
  };
}

/**
 * Calcula a data e os minutos atuais no fuso horário especificado.
 */
export function getCurrentDateTimeInTimezone(
  timezoneStr: string
): { todayStr: string; currentMins: number } {
  try {
    const now = new Date();
    const formatterDate = new Intl.DateTimeFormat('fr-CA', {
      timeZone: timezoneStr,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const todayStr = formatterDate.format(now);

    const formatterTime = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezoneStr,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const [h, m] = formatterTime.format(now).split(':').map(Number);
    const currentMins = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);

    return { todayStr, currentMins };
  } catch {
    // Fallback garantido para UTC-3 (Horário Oficial de Brasília)
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const spDate = new Date(utcMs - 3 * 3600000);
    const y = spDate.getFullYear();
    const mo = String(spDate.getMonth() + 1).padStart(2, '0');
    const da = String(spDate.getDate()).padStart(2, '0');
    const todayStr = `${y}-${mo}-${da}`;
    const currentMins = spDate.getHours() * 60 + spDate.getMinutes();

    return { todayStr, currentMins };
  }
}

/**
 * Executa o fluxo autoritativo de agendamento de ponta a ponta.
 */
export async function executeAuthoritativeBooking(params: {
  payload: BookAppointmentPayload;
  authHeader?: string;
}): Promise<BookingServiceResult> {
  const { payload, authHeader } = params;
  const { firestore } = getFirebaseAdmin();

  // 1. Validação de Identidade (Cliente Autenticado ou Visitante Anônimo)
  let clientId: string;
  if (authHeader && authHeader.trim()) {
    const decoded = await verifyFirebaseIdToken(authHeader);
    if (!decoded) {
      return {
        status: 401,
        error: 'INVALID_CREDENTIALS',
        message: 'Token de autenticação inválido ou expirado.'
      };
    }
    clientId = decoded.uid;

    // Se o usuário autenticado for membro de equipe com tenant claim, ele só pode agendar no seu próprio tenant
    const actorRole = toCanonicalRole(decoded.role);
    if (
      isTenantScopedRole(actorRole) &&
      decoded.tenantId &&
      decoded.tenantId !== payload.tenantId
    ) {
      return {
        status: 403,
        error: 'CROSS_TENANT_FORBIDDEN',
        message: 'Profissionais e gestores não podem agendar em outros estabelecimentos.'
      };
    }
  } else {
    // Visitante público/anônimo sem login
    clientId = `anon_${crypto.randomUUID()}`;
  }

  // 2. Validação de Tenant (Barbearia)
  const tenantDocRef = firestore.collection('barbershops').doc(payload.tenantId);
  const tenantSnap = await tenantDocRef.get();

  if (!tenantSnap.exists) {
    return {
      status: 404,
      error: 'TENANT_NOT_FOUND',
      message: 'Estabelecimento informado não foi encontrado.'
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
      message: 'O estabelecimento encontra-se temporariamente inativo ou com plano suspenso.'
    };
  }

  const timezone = (barbershopData as any).timezone || 'America/Sao_Paulo';
  const { todayStr, currentMins } = getCurrentDateTimeInTimezone(timezone);

  // Validação Temporal estrita no fuso horário da barbearia
  if (payload.date < todayStr) {
    return {
      status: 400,
      error: 'INVALID_DATE_PAST',
      message: 'Não é possível agendar em datas passadas.'
    };
  }

  const startMinutes = timeToMinutes(payload.startTime);

  if (payload.date === todayStr && startMinutes <= currentMins) {
    return {
      status: 400,
      error: 'INVALID_TIME_PAST',
      message: 'Horário já ultrapassado para o dia de hoje no fuso da barbearia.'
    };
  }

  // Alinhamento ao step mínimo da grade (15 minutos)
  if (startMinutes % 15 !== 0) {
    return {
      status: 400,
      error: 'INVALID_TIME_STEP',
      message: 'O horário de início deve estar alinhado a intervalos de 15 minutos.'
    };
  }

  // 3. Validação do Profissional
  const profDocRef = firestore.collection('users').doc(payload.professionalId);
  const profSnap = await profDocRef.get();

  if (!profSnap.exists) {
    return {
      status: 404,
      error: 'PROFESSIONAL_NOT_FOUND',
      message: 'Profissional não encontrado no estabelecimento.'
    };
  }

  const profData = profSnap.data()!;
  if (profData.tenantId !== payload.tenantId) {
    return {
      status: 404,
      error: 'PROFESSIONAL_NOT_FOUND',
      message: 'Profissional não encontrado no estabelecimento.'
    };
  }

  if (profData.status === 'inactive' || profData.status === 'INATIVO') {
    return {
      status: 400,
      error: 'PROFESSIONAL_INACTIVE',
      message: 'O profissional selecionado encontra-se inativo no momento.'
    };
  }

  const officialProfName = profData.name || 'Profissional';

  // 4. Validação do Serviço (Preço e Duração Oficiais recalculados no servidor)
  const serviceDocRef = firestore.collection('services').doc(payload.serviceId);
  const serviceSnap = await serviceDocRef.get();

  if (!serviceSnap.exists) {
    return {
      status: 404,
      error: 'SERVICE_NOT_FOUND',
      message: 'Serviço não encontrado no estabelecimento.'
    };
  }

  const serviceData = serviceSnap.data()!;
  if (serviceData.tenantId !== payload.tenantId) {
    return {
      status: 404,
      error: 'SERVICE_NOT_FOUND',
      message: 'Serviço não encontrado no estabelecimento.'
    };
  }

  if (serviceData.active === false) {
    return {
      status: 400,
      error: 'SERVICE_INACTIVE',
      message: 'O serviço selecionado encontra-se inativo no momento.'
    };
  }

  const officialName = String(serviceData.name);
  const officialPrice = Number(serviceData.price);
  const officialDuration = Number(serviceData.durationMinutes);

  if (isNaN(officialPrice) || officialPrice < 0) {
    return {
      status: 500,
      error: 'INVALID_SERVICE_CONFIG',
      message: 'Preço oficial do serviço mal configurado no banco de dados.'
    };
  }

  if (isNaN(officialDuration) || officialDuration <= 0 || officialDuration > 480) {
    return {
      status: 500,
      error: 'INVALID_SERVICE_CONFIG',
      message: 'Duração oficial do serviço mal configurada no banco de dados.'
    };
  }

  const endMinutes = startMinutes + officialDuration;
  const computedEndTime = minutesToTime(endMinutes);

  // 5. Validação de Expediente da Barbearia e Jornada do Profissional
  let scheduleConfig: ProfessionalScheduleConfig | undefined = undefined;
  try {
    let schedSnap = await firestore.collection('schedules').doc(`sch_${payload.professionalId}`).get();
    if (!schedSnap.exists) {
      schedSnap = await firestore.collection('schedules').doc(payload.professionalId).get();
    }
    if (schedSnap.exists) {
      scheduleConfig = schedSnap.data() as ProfessionalScheduleConfig;
    }
  } catch (err) {
    console.warn('[BookingService] Aviso ao carregar schedule do profissional:', err);
  }

  const shiftInfo = getProfessionalShiftsForDate(
    scheduleConfig,
    payload.date,
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
    return startMinutes >= sStart && endMinutes <= sEnd;
  });

  if (!fitsInShift) {
    return {
      status: 400,
      error: 'OUTSIDE_PROFESSIONAL_SHIFT',
      message: `O serviço (${officialDuration} min) ultrapassa a jornada de trabalho ou coincide com o intervalo de atendimento.`
    };
  }

  // 6. Limite Diário de Agendamentos por WhatsApp no Tenant (Máximo 3 ativos/dia)
  try {
    const phoneQuery = await firestore
      .collection('appointments')
      .where('tenantId', '==', payload.tenantId)
      .where('clientWhatsApp', '==', payload.clientWhatsApp)
      .where('date', '==', payload.date)
      .where('status', '==', 'AGENDADO')
      .get();

    if (phoneQuery.size >= 3) {
      return {
        status: 429,
        error: 'PHONE_BOOKING_LIMIT_EXCEEDED',
        message: 'Limite de 3 agendamentos ativos por dia atingido para este número de WhatsApp nesta barbearia.'
      };
    }
  } catch (phoneErr) {
    console.warn('[BookingService] Aviso na checagem de limite por WhatsApp:', phoneErr);
  }

  // 7. Transação Atômica no Firestore (day_lock + idempotency + appointment + publicAvailability)
  const appointmentId = `apt_${payload.date.replace(/-/g, '')}_${payload.professionalId.slice(-4)}_${crypto.randomBytes(4).toString('hex')}`;
  const nowIso = new Date().toISOString();

  const idempDocRef = firestore
    .collection('barbershops')
    .doc(payload.tenantId)
    .collection('idempotency_keys')
    .doc(payload.idempotencyKey);

  const dayLockDocRef = firestore
    .collection('barbershops')
    .doc(payload.tenantId)
    .collection('day_locks')
    .doc(`${payload.professionalId}_${payload.date}`);

  const aptDocRef = firestore.collection('appointments').doc(appointmentId);
  const pubDocRef = firestore.collection('publicAvailability').doc(appointmentId);

  let isReplay = false;
  let finalAppointment: Appointment | null = null;

  try {
    await firestore.runTransaction(async (transaction) => {
      // LEITURA 1: Idempotency Key
      const idempSnap = await transaction.get(idempDocRef);
      if (idempSnap.exists) {
        const idempData = idempSnap.data();
        if (idempData && idempData.status === 'COMPLETED' && idempData.responsePayload) {
          isReplay = true;
          finalAppointment = idempData.responsePayload.appointment;
          return;
        }
      }

      // LEITURA 2: Day Lock
      const dayLockSnap = await transaction.get(dayLockDocRef);
      const existingSlots: DayLockSlot[] = dayLockSnap.exists
        ? (dayLockSnap.data()?.slots || [])
        : [];

      // Checagem de capacidade máxima no dia (máx 50 slots)
      if (existingSlots.length >= 50) {
        throw new DayLockCapacityError(
          'Capacidade máxima de 50 agendamentos diários atingida para este profissional.'
        );
      }

      // Checagem de sobreposição de horário: novoInicio < slotFim && novoFim > slotInicio
      for (const slot of existingSlots) {
        if (slot.isEncaixe) continue;
        if (startMinutes < slot.endMinutes && endMinutes > slot.startMinutes) {
          throw new SlotOccupiedError(
            `Horário indisponível. Já existe um agendamento reservado (${slot.startTime} às ${slot.endTime}).`
          );
        }
      }

      // ESCRITA 1: Atualização do Day Lock
      const newSlot: DayLockSlot = {
        appointmentId,
        startTime: payload.startTime,
        endTime: computedEndTime,
        startMinutes,
        endMinutes,
        isEncaixe: false
      };

      const updatedSlots = [...existingSlots, newSlot].sort(
        (a, b) => a.startMinutes - b.startMinutes
      );

      transaction.set(
        dayLockDocRef,
        {
          tenantId: payload.tenantId,
          professionalId: payload.professionalId,
          date: payload.date,
          slots: updatedSlots,
          updatedAt: nowIso,
          version: (dayLockSnap.data()?.version || 0) + 1
        },
        { merge: true }
      );

      // ESCRITA 2: Agendamento Oficial (appointments/{appointmentId})
      const createdAppointment: Appointment = {
        id: appointmentId,
        tenantId: payload.tenantId,
        serviceId: payload.serviceId,
        serviceName: officialName,
        servicePrice: officialPrice,
        serviceDuration: officialDuration,
        professionalId: payload.professionalId,
        professionalName: officialProfName,
        clientId,
        clientName: payload.clientName,
        clientWhatsApp: payload.clientWhatsApp,
        date: payload.date,
        startTime: payload.startTime,
        endTime: computedEndTime,
        isEncaixe: false,
        status: 'AGENDADO',
        notes: payload.notes || '',
        reminderSent: false,
        createdAt: nowIso
      };

      transaction.set(aptDocRef, createdAppointment);
      finalAppointment = createdAppointment;

      // ESCRITA 3: Projeção Pública de Disponibilidade (Zero PII!)
      transaction.set(pubDocRef, {
        id: appointmentId,
        tenantId: payload.tenantId,
        professionalId: payload.professionalId,
        date: payload.date,
        startTime: payload.startTime,
        endTime: computedEndTime,
        status: 'AGENDADO'
      });

      // ESCRITA 4: Registro da Chave de Idempotência
      transaction.set(idempDocRef, {
        key: payload.idempotencyKey,
        tenantId: payload.tenantId,
        appointmentId,
        status: 'COMPLETED',
        responsePayload: {
          success: true,
          appointment: createdAppointment
        },
        createdAt: nowIso
      });
    });

    return {
      status: 200,
      isReplay,
      appointment: finalAppointment!
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
    console.error('[BookingService] Erro na transação do Firestore:', txErr);
    return {
      status: 500,
      error: 'BOOKING_TRANSACTION_FAILED',
      message: 'Falha interna ao processar agendamento atômico no banco de dados.'
    };
  }
}
