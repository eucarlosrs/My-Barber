import { Appointment, ProfessionalScheduleConfig, TimeShift } from '../types';

/**
 * Retorna a data local atual no formato "YYYY-MM-DD"
 */
export function getTodayLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retorna os minutos decorridos desde a meia-noite do momento atual (0 - 1440)
 */
export function getCurrentTimeMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Converte string de horário "HH:MM" em minutos desde a meia-noite (0 - 1440)
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/**
 * Converte minutos (0 - 1440) em string formatada "HH:MM"
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Retorna o dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado) de forma segura contra fusos
 */
export function getDayOfWeekFromDate(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.getDay();
}

export interface CalendarDayItem {
  date: string; // "YYYY-MM-DD"
  dayName: string; // "Hoje", "Ter", "Qua", etc.
  dayNum: string; // "19"
  month: string; // "Ago"
  isToday: boolean;
  isTomorrow: boolean;
}

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

const WEEKDAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Gera dinamicamente a lista de dias a partir da data real de hoje
 */
export function generateUpcomingDays(daysCount = 14, baseDate: Date = new Date()): CalendarDayItem[] {
  const days: CalendarDayItem[] = [];

  for (let i = 0; i < daysCount; i++) {
    const current = new Date(baseDate);
    current.setDate(baseDate.getDate() + i);

    const dateStr = getTodayLocalDateString(current);
    const dayOfWeek = current.getDay();
    const dayNum = String(current.getDate());
    const month = MONTH_NAMES_SHORT[current.getMonth()];

    let dayName = WEEKDAY_NAMES_SHORT[dayOfWeek];
    const isToday = i === 0;
    const isTomorrow = i === 1;

    if (isToday) {
      dayName = 'Hoje';
    }

    days.push({
      date: dateStr,
      dayName,
      dayNum,
      month,
      isToday,
      isTomorrow
    });
  }

  return days;
}

/**
 * Obtém os turnos de trabalho ativos do profissional para a data especificada
 * considerando exceções/bloqueios (periodOverrides) e jornada semanal padrão (weeklySchedule)
 */
export function getProfessionalShiftsForDate(
  scheduleConfig: ProfessionalScheduleConfig | undefined,
  dateStr: string
): { enabled: boolean; shifts: TimeShift[]; reason?: string } {
  if (!scheduleConfig) {
    // Fallback padrão se não houver configuração específica: 09:00 às 19:00 (exceto Domingo)
    const dayOfWeek = getDayOfWeekFromDate(dateStr);
    if (dayOfWeek === 0) {
      return { enabled: false, shifts: [], reason: 'Profissional não atende aos domingos.' };
    }
    return {
      enabled: true,
      shifts: [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '19:00' }
      ]
    };
  }

  // 1. Verificar se existe uma exceção de período (ex: férias, folga especial, feriado)
  if (scheduleConfig.periodOverrides && scheduleConfig.periodOverrides.length > 0) {
    const override = scheduleConfig.periodOverrides.find(
      o => dateStr >= o.startDate && dateStr <= o.endDate
    );
    if (override) {
      if (override.shifts.length === 0) {
        return {
          enabled: false,
          shifts: [],
          reason: override.reason || 'Bloqueio de agenda / Ausência cadastrada para esta data.'
        };
      }
      return {
        enabled: true,
        shifts: override.shifts,
        reason: override.reason
      };
    }
  }

  // 2. Verificar a jornada semanal regular
  const dayOfWeek = getDayOfWeekFromDate(dateStr);
  const daySchedule = scheduleConfig.weeklySchedule?.find(w => w.dayOfWeek === dayOfWeek);

  if (!daySchedule || !daySchedule.enabled || !daySchedule.shifts || daySchedule.shifts.length === 0) {
    return {
      enabled: false,
      shifts: [],
      reason: `Profissional não atende neste dia da semana (${daySchedule?.dayName || 'Dia sem expediente'}).`
    };
  }

  return {
    enabled: true,
    shifts: daySchedule.shifts
  };
}

export interface SlotValidationParams {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMinutes: number;
  professionalId: string;
  scheduleConfig?: ProfessionalScheduleConfig;
  existingAppointments: Appointment[];
  excludeAppointmentId?: string; // Para validação de remarcação
  isEncaixe?: boolean;
  referenceDate?: Date; // Data/hora atual de referência
}

/**
 * REGRA FUNDAMENTAL: Valida se um horário está estritamente disponível
 * para um profissional, serviço, data e duração especificados.
 */
export function isTimeSlotAvailable(params: SlotValidationParams): {
  available: boolean;
  reason?: string;
  conflictAppointment?: Appointment;
} {
  const {
    date,
    startTime,
    durationMinutes,
    professionalId,
    scheduleConfig,
    existingAppointments,
    excludeAppointmentId,
    isEncaixe,
    referenceDate = new Date()
  } = params;

  // Encaixe manual administrativo: permitido pelo gestor com override explícito
  if (isEncaixe) {
    return { available: true };
  }

  const startMins = timeToMinutes(startTime);
  const endMins = startMins + durationMinutes;

  if (startMins < 0 || endMins > 1440 || durationMinutes <= 0) {
    return { available: false, reason: 'Horário ou duração de serviço inválidos.' };
  }

  // 0. REGRA TEMPORAL: Bloqueia horários que já passaram para o dia de hoje
  const todayStr = getTodayLocalDateString(referenceDate);
  const currentMins = getCurrentTimeMinutes(referenceDate);

  if (date < todayStr) {
    return {
      available: false,
      reason: 'Não é possível agendar em datas passadas.'
    };
  }

  if (date === todayStr && startMins <= currentMins) {
    return {
      available: false,
      reason: 'Horário já ultrapassado no dia de hoje.'
    };
  }

  // 1. Validar jornada de trabalho e turnos do profissional
  const shiftInfo = getProfessionalShiftsForDate(scheduleConfig, date);
  if (!shiftInfo.enabled || shiftInfo.shifts.length === 0) {
    return {
      available: false,
      reason: shiftInfo.reason || 'O profissional não possui expediente nesta data.'
    };
  }

  // O agendamento completo (início + duração) DEVE caber integralmente dentro de UM dos turnos contínuos
  const fitsInShift = shiftInfo.shifts.some(shift => {
    const shiftStart = timeToMinutes(shift.start);
    const shiftEnd = timeToMinutes(shift.end);
    return startMins >= shiftStart && endMins <= shiftEnd;
  });

  if (!fitsInShift) {
    return {
      available: false,
      reason: `O serviço (${durationMinutes} min) ultrapassa o turno de trabalho ou coincide com o intervalo do profissional.`
    };
  }

  // 2. Validar sobreposição estrita contra todos os agendamentos existentes no mesmo dia e profissional
  // Condição matemática de conflito de intervalo aberto: (novoInicio < aptFim) && (novoFim > aptInicio)
  const conflict = existingAppointments.find(apt => {
    if (apt.id === excludeAppointmentId) return false;
    if (apt.professionalId !== professionalId) return false;
    if (apt.date !== date) return false;
    if (apt.status !== 'AGENDADO') return false; // Agendamentos cancelados liberam o horário

    const aptStart = timeToMinutes(apt.startTime);
    const aptEnd = timeToMinutes(apt.endTime);

    return startMins < aptEnd && endMins > aptStart;
  });

  if (conflict) {
    return {
      available: false,
      reason: `Horário indisponível. Já existe um agendamento com ${conflict.clientName} (${conflict.startTime} às ${conflict.endTime}).`,
      conflictAppointment: conflict
    };
  }

  return { available: true };
}

export interface GeneratedSlot {
  time: string;
  period: 'MANHA' | 'TARDE' | 'NOITE';
  available: boolean;
  reason?: string;
}

/**
 * Gera a grade de horários disponíveis para exibição ao cliente e no painel administrativo
 */
export function generateAvailableSlots(params: {
  date: string;
  durationMinutes: number;
  professionalId: string;
  scheduleConfig?: ProfessionalScheduleConfig;
  existingAppointments: Appointment[];
  stepMinutes?: number;
  referenceDate?: Date;
}): {
  morningSlots: GeneratedSlot[];
  afternoonSlots: GeneratedSlot[];
  eveningSlots: GeneratedSlot[];
  allSlots: GeneratedSlot[];
} {
  const {
    date,
    durationMinutes,
    professionalId,
    scheduleConfig,
    existingAppointments,
    stepMinutes = 30,
    referenceDate = new Date()
  } = params;

  const shiftInfo = getProfessionalShiftsForDate(scheduleConfig, date);
  const allSlots: GeneratedSlot[] = [];

  if (!shiftInfo.enabled || shiftInfo.shifts.length === 0) {
    return {
      morningSlots: [],
      afternoonSlots: [],
      eveningSlots: [],
      allSlots: []
    };
  }

  // Identifica o início mais cedo e o fim mais tarde dentre os turnos do dia
  let earliestMin = 1440;
  let latestMin = 0;

  shiftInfo.shifts.forEach(shift => {
    const s = timeToMinutes(shift.start);
    const e = timeToMinutes(shift.end);
    if (s < earliestMin) earliestMin = s;
    if (e > latestMin) latestMin = e;
  });

  // Alinha aos intervalos de step (ex: 30 minutos)
  for (let m = earliestMin; m + durationMinutes <= latestMin; m += stepMinutes) {
    const timeStr = minutesToTime(m);
    const validation = isTimeSlotAvailable({
      date,
      startTime: timeStr,
      durationMinutes,
      professionalId,
      scheduleConfig,
      existingAppointments,
      referenceDate
    });

    let period: 'MANHA' | 'TARDE' | 'NOITE' = 'TARDE';
    const hour = Math.floor(m / 60);
    if (hour < 12) {
      period = 'MANHA';
    } else if (hour >= 18) {
      period = 'NOITE';
    }

    allSlots.push({
      time: timeStr,
      period,
      available: validation.available,
      reason: validation.reason
    });
  }

  return {
    morningSlots: allSlots.filter(s => s.period === 'MANHA'),
    afternoonSlots: allSlots.filter(s => s.period === 'TARDE'),
    eveningSlots: allSlots.filter(s => s.period === 'NOITE'),
    allSlots
  };
}

export interface BarbershopOpenStatus {
  isOpen: boolean;
  statusLabel: string;
  detailLabel: string;
  nextShiftStart?: string;
  nextShiftEnd?: string;
}

/**
 * Calcula em tempo real e de forma verídica se a barbearia está ABERTA ou FECHADA agora,
 * baseando-se na escala real dos profissionais da barbearia para o dia e horário correntes.
 */
export function getBarbershopRealOpenStatus(params: {
  schedules: ProfessionalScheduleConfig[];
  professionalIds: string[];
  referenceDate?: Date;
}): BarbershopOpenStatus {
  const { schedules, professionalIds, referenceDate = new Date() } = params;

  const todayStr = getTodayLocalDateString(referenceDate);
  const currentMinutes = getCurrentTimeMinutes(referenceDate);

  // Coleta todos os turnos de trabalho ativos de todos os profissionais da barbearia no dia de hoje
  const relevantSchedules = schedules.filter(s =>
    professionalIds.length === 0 || professionalIds.includes(s.professionalId)
  );

  const todayActiveShifts: TimeShift[] = [];

  if (relevantSchedules.length > 0) {
    relevantSchedules.forEach(sched => {
      const shiftInfo = getProfessionalShiftsForDate(sched, todayStr);
      if (shiftInfo.enabled && shiftInfo.shifts.length > 0) {
        todayActiveShifts.push(...shiftInfo.shifts);
      }
    });
  } else {
    // Fallback padrão se não houver profissionais cadastrados: Seg-Sáb 09:00 - 19:00
    const dayOfWeek = getDayOfWeekFromDate(todayStr);
    if (dayOfWeek !== 0) {
      todayActiveShifts.push({ start: '09:00', end: '19:00' });
    }
  }

  if (todayActiveShifts.length === 0) {
    return {
      isOpen: false,
      statusLabel: 'FECHADO HOJE',
      detailLabel: 'Sem expediente neste dia'
    };
  }

  // Verifica se o minuto atual está dentro de qualquer um dos turnos ativos
  let currentlyOpenShift: TimeShift | null = null;
  for (const shift of todayActiveShifts) {
    const sMin = timeToMinutes(shift.start);
    const eMin = timeToMinutes(shift.end);
    if (currentMinutes >= sMin && currentMinutes < eMin) {
      currentlyOpenShift = shift;
      break;
    }
  }

  if (currentlyOpenShift) {
    // Encontra o horário máximo de encerramento de hoje entre todos os turnos que continuam ativos
    const closingMinutes = Math.max(
      ...todayActiveShifts
        .filter(s => currentMinutes < timeToMinutes(s.end))
        .map(s => timeToMinutes(s.end))
    );
    const closingTime = minutesToTime(closingMinutes);

    return {
      isOpen: true,
      statusLabel: 'ABERTO AGORA',
      detailLabel: `Fecha às ${closingTime}`,
      nextShiftEnd: closingTime
    };
  }

  // Se não está aberto agora, verifica se ainda abrirá hoje mais tarde
  const upcomingTodayShifts = todayActiveShifts
    .filter(s => timeToMinutes(s.start) > currentMinutes)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  if (upcomingTodayShifts.length > 0) {
    const nextStart = upcomingTodayShifts[0].start;
    return {
      isOpen: false,
      statusLabel: 'FECHADO NO MOMENTO',
      detailLabel: `Abre hoje às ${nextStart}`,
      nextShiftStart: nextStart
    };
  }

  // Se já encerrou os expedientes de hoje
  return {
    isOpen: false,
    statusLabel: 'FECHADO AGORA',
    detailLabel: 'Expediente de hoje encerrado'
  };
}
