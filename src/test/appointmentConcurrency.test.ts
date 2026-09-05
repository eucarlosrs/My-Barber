import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isTimeSlotAvailable, timeToMinutes, minutesToTime } from '../utils/scheduleEngine.js';
import { Appointment, ProfessionalScheduleConfig, WeeklyBusinessHours } from '../types/index.js';

describe('MY BARBER - Regra Fundamental Anti-Duplo Agendamento (Concorrência)', () => {
  const dummyBusinessHours: WeeklyBusinessHours = [
    {
      dayOfWeek: 1, // Segunda-feira
      dayName: 'Segunda-feira',
      shortDayName: 'Seg',
      isOpen: true,
      morningStart: '08:00',
      morningEnd: '12:00',
      hasLunchBreak: true,
      lunchStart: '12:00',
      lunchEnd: '13:00',
      afternoonStart: '13:00',
      afternoonEnd: '19:00'
    }
  ];

  const dummyScheduleConfig: ProfessionalScheduleConfig = {
    professionalId: 'prof-eduardo',
    weeklySchedule: [
      {
        dayOfWeek: 1,
        dayName: 'Segunda-feira',
        enabled: true,
        shifts: [{ start: '09:00', end: '18:00' }]
      }
    ],
    periodOverrides: []
  };

  const existingAppointments: Appointment[] = [
    {
      id: 'apt-eduardo-1',
      tenantId: 'tenant-1',
      serviceId: 'srv-corte',
      serviceName: 'Corte Tradicional',
      servicePrice: 40,
      serviceDuration: 30,
      professionalId: 'prof-eduardo',
      professionalName: 'Eduardo',
      clientId: 'client-joao',
      clientName: 'João Silva',
      clientWhatsApp: '(11) 99999-1111',
      date: '2026-09-07', // Segunda-feira
      startTime: '10:30',
      endTime: '11:00',
      isEncaixe: false,
      status: 'AGENDADO',
      reminderSent: false,
      createdAt: '2026-09-05T10:00:00Z'
    }
  ];

  it('Deve BLOQUEAR estritamente um segundo agendamento com mesmo profissional, data e horário (10:30)', () => {
    const result = isTimeSlotAvailable({
      date: '2026-09-07',
      startTime: '10:30',
      durationMinutes: 30,
      professionalId: 'prof-eduardo',
      scheduleConfig: dummyScheduleConfig,
      businessHours: dummyBusinessHours,
      existingAppointments,
      isEncaixe: false
    });

    assert.strictEqual(result.available, false);
    assert.ok(result.reason?.includes('Horário indisponível'));
  });

  it('Deve BLOQUEAR sobreposição parcial que começa antes e termina durante o agendamento existente (10:15 às 10:45)', () => {
    const result = isTimeSlotAvailable({
      date: '2026-09-07',
      startTime: '10:15',
      durationMinutes: 30,
      professionalId: 'prof-eduardo',
      scheduleConfig: dummyScheduleConfig,
      businessHours: dummyBusinessHours,
      existingAppointments,
      isEncaixe: false
    });

    assert.strictEqual(result.available, false);
  });

  it('Deve BLOQUEAR sobreposição parcial que começa dentro do agendamento existente (10:45 às 11:15)', () => {
    const result = isTimeSlotAvailable({
      date: '2026-09-07',
      startTime: '10:45',
      durationMinutes: 30,
      professionalId: 'prof-eduardo',
      scheduleConfig: dummyScheduleConfig,
      businessHours: dummyBusinessHours,
      existingAppointments,
      isEncaixe: false
    });

    assert.strictEqual(result.available, false);
  });

  it('Deve PERMITIR agendamento imediatamente adjacente anterior (10:00 às 10:30)', () => {
    const result = isTimeSlotAvailable({
      date: '2026-09-07',
      startTime: '10:00',
      durationMinutes: 30,
      professionalId: 'prof-eduardo',
      scheduleConfig: dummyScheduleConfig,
      businessHours: dummyBusinessHours,
      existingAppointments,
      isEncaixe: false
    });

    assert.strictEqual(result.available, true);
  });

  it('Deve PERMITIR agendamento imediatamente adjacente posterior (11:00 às 11:30)', () => {
    const result = isTimeSlotAvailable({
      date: '2026-09-07',
      startTime: '11:00',
      durationMinutes: 30,
      professionalId: 'prof-eduardo',
      scheduleConfig: dummyScheduleConfig,
      businessHours: dummyBusinessHours,
      existingAppointments,
      isEncaixe: false
    });

    assert.strictEqual(result.available, true);
  });

  it('Deve LIBERAR o horário se o agendamento anterior estiver com status CANCELADO', () => {
    const cancelledAppointments: Appointment[] = [
      {
        ...existingAppointments[0],
        status: 'CANCELADO'
      }
    ];

    const result = isTimeSlotAvailable({
      date: '2026-09-07',
      startTime: '10:30',
      durationMinutes: 30,
      professionalId: 'prof-eduardo',
      scheduleConfig: dummyScheduleConfig,
      businessHours: dummyBusinessHours,
      existingAppointments: cancelledAppointments,
      isEncaixe: false
    });

    assert.strictEqual(result.available, true);
  });

  it('Deve PERMITIR o mesmo horário (10:30) para um profissional DIFERENTE na mesma barbearia', () => {
    const dummyProfCarlosConfig: ProfessionalScheduleConfig = {
      professionalId: 'prof-carlos',
      weeklySchedule: dummyScheduleConfig.weeklySchedule,
      periodOverrides: []
    };

    const result = isTimeSlotAvailable({
      date: '2026-09-07',
      startTime: '10:30',
      durationMinutes: 30,
      professionalId: 'prof-carlos',
      scheduleConfig: dummyProfCarlosConfig,
      businessHours: dummyBusinessHours,
      existingAppointments,
      isEncaixe: false
    });

    assert.strictEqual(result.available, true);
  });
});
