import React, { useState } from 'react';
import {
  Clock,
  Copy,
  CheckCircle2,
  AlertCircle,
  Utensils,
  Sun,
  Moon,
  Sparkles,
  Calendar,
  Check,
  Zap,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { WeeklyBusinessHours, DayBusinessHours } from '../../types';
import { DEFAULT_WEEKLY_BUSINESS_HOURS } from '../../data/initialData';

interface BusinessHoursTableProps {
  value: WeeklyBusinessHours;
  onChange: (hours: WeeklyBusinessHours) => void;
  disabled?: boolean;
}

export const BusinessHoursTable: React.FC<BusinessHoursTableProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast(null);
    }, 2800);
  };

  // Ensure we have a complete list of 7 days in proper order: Seg (1) to Dom (0)
  const schedule: WeeklyBusinessHours = React.useMemo(() => {
    if (!value || value.length === 0) return DEFAULT_WEEKLY_BUSINESS_HOURS;

    const order = [1, 2, 3, 4, 5, 6, 0];
    const map = new Map<number, DayBusinessHours>();
    value.forEach(d => map.set(d.dayOfWeek, d));

    return order.map(dayOfWeek => {
      const existing = map.get(dayOfWeek);
      if (existing) return existing;
      const defaultDay = DEFAULT_WEEKLY_BUSINESS_HOURS.find(d => d.dayOfWeek === dayOfWeek);
      return defaultDay || {
        dayOfWeek,
        dayName: dayOfWeek === 0 ? 'Domingo' : `Dia ${dayOfWeek}`,
        shortDayName: dayOfWeek === 0 ? 'Dom' : `D${dayOfWeek}`,
        isOpen: dayOfWeek !== 0,
        morningStart: '08:30',
        morningEnd: '12:00',
        hasLunchBreak: true,
        lunchStart: '12:00',
        lunchEnd: '13:30',
        afternoonStart: '13:30',
        afternoonEnd: '19:30'
      };
    });
  }, [value]);

  // Helper to update a day safely and ensure consistent morning/lunch/afternoon synchronization
  const updateDaySimplified = (
    dayOfWeek: number,
    changes: {
      isOpen?: boolean;
      openTime?: string;     // Horário geral de abertura
      closeTime?: string;    // Horário geral de fechamento
      hasLunch?: boolean;    // Se tem pausa para almoço
      lunchStart?: string;   // Início da pausa
      lunchEnd?: string;     // Fim da pausa
    }
  ) => {
    const updated = schedule.map(d => {
      if (d.dayOfWeek !== dayOfWeek) return d;

      const isOpen = changes.isOpen !== undefined ? changes.isOpen : d.isOpen;
      const openTime = changes.openTime || d.morningStart || '08:30';
      const closeTime = changes.closeTime || d.afternoonEnd || d.morningEnd || '19:30';
      const hasLunch = changes.hasLunch !== undefined ? changes.hasLunch : (d.hasLunchBreak ?? true);
      const lunchStart = changes.lunchStart || d.lunchStart || d.morningEnd || '12:00';
      const lunchEnd = changes.lunchEnd || d.lunchEnd || d.afternoonStart || '13:30';

      if (hasLunch) {
        return {
          ...d,
          isOpen,
          morningStart: openTime,
          morningEnd: lunchStart,
          hasLunchBreak: true,
          lunchStart,
          lunchEnd,
          afternoonStart: lunchEnd,
          afternoonEnd: closeTime
        };
      } else {
        return {
          ...d,
          isOpen,
          morningStart: openTime,
          morningEnd: closeTime,
          hasLunchBreak: false,
          lunchStart: '',
          lunchEnd: '',
          afternoonStart: openTime,
          afternoonEnd: closeTime
        };
      }
    });

    onChange(updated);
  };

  // Quick preset: Commercial standard (Seg-Sex 08:30-19:30 c/ almoço 12:00-13:30, Sáb 08:00-19:00, Dom Fechado)
  const applyCommercialDefault = () => {
    onChange(DEFAULT_WEEKLY_BUSINESS_HOURS);
    showToast('Horário Comercial Padrão aplicado para toda a semana!');
  };

  // Quick preset: Continuous (09:00 - 19:00 sem intervalo Seg-Sáb)
  const applyContinuousDefault = () => {
    const continuous: WeeklyBusinessHours = schedule.map(d => ({
      ...d,
      isOpen: d.dayOfWeek !== 0,
      morningStart: '09:00',
      morningEnd: '19:00',
      hasLunchBreak: false,
      lunchStart: '',
      lunchEnd: '',
      afternoonStart: '09:00',
      afternoonEnd: '19:00'
    }));
    onChange(continuous);
    showToast('Horário Direto (09:00 às 19:00 sem pausa) aplicado!');
  };

  // Copy one day to all weekdays (Segunda a Sexta)
  const copyDayToAllWeekdays = (sourceDayOfWeek: number) => {
    const source = schedule.find(d => d.dayOfWeek === sourceDayOfWeek);
    if (!source) return;

    const updated = schedule.map(d => {
      if (d.dayOfWeek >= 1 && d.dayOfWeek <= 5) {
        return {
          ...d,
          isOpen: source.isOpen,
          morningStart: source.morningStart,
          morningEnd: source.morningEnd,
          hasLunchBreak: source.hasLunchBreak,
          lunchStart: source.lunchStart,
          lunchEnd: source.lunchEnd,
          afternoonStart: source.afternoonStart,
          afternoonEnd: source.afternoonEnd
        };
      }
      return d;
    });
    onChange(updated);
    showToast(`Horário de ${source.dayName} copiado para Segunda a Sexta!`);
  };

  // Copy one day to all 7 days
  const copyDayToAllDays = (sourceDayOfWeek: number) => {
    const source = schedule.find(d => d.dayOfWeek === sourceDayOfWeek);
    if (!source) return;

    const updated = schedule.map(d => ({
      ...d,
      isOpen: source.isOpen,
      morningStart: source.morningStart,
      morningEnd: source.morningEnd,
      hasLunchBreak: source.hasLunchBreak,
      lunchStart: source.lunchStart,
      lunchEnd: source.lunchEnd,
      afternoonStart: source.afternoonStart,
      afternoonEnd: source.afternoonEnd
    }));
    onChange(updated);
    showToast(`Horário de ${source.dayName} replicado para todos os 7 dias!`);
  };

  // Helper to calculate total business hours
  const calculateDayDuration = (day: DayBusinessHours) => {
    if (!day.isOpen) return null;
    const [openH, openM] = (day.morningStart || '08:30').split(':').map(Number);
    const [closeH, closeM] = (day.afternoonEnd || day.morningEnd || '19:30').split(':').map(Number);
    
    let totalMinutes = (closeH * 60 + closeM) - (openH * 60 + openM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;

    if (day.hasLunchBreak && day.lunchStart && day.lunchEnd) {
      const [lStartH, lStartM] = day.lunchStart.split(':').map(Number);
      const [lEndH, lEndM] = day.lunchEnd.split(':').map(Number);
      let lunchMinutes = (lEndH * 60 + lEndM) - (lStartH * 60 + lStartM);
      if (lunchMinutes > 0) totalMinutes -= lunchMinutes;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h${minutes}min` : `${hours}h`;
  };

  return (
    <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl">
      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Header Info & Quick Presets */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-neutral-100 font-heading">
                Horário de Atendimento e Funcionamento
              </h3>
              <span className="text-[10px] bg-orange-500/15 text-orange-400 font-black px-2.5 py-0.5 rounded-full border border-orange-500/30">
                Oficial
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Preenchimento simplificado: defina abertura, fechamento e pausa de almoço.
            </p>
          </div>
        </div>

        {/* Quick Presets Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={applyCommercialDefault}
            className="text-xs font-bold text-neutral-200 hover:text-orange-400 bg-neutral-950 hover:bg-neutral-850 px-3 py-1.5 rounded-xl border border-neutral-700/80 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="Seg-Sex 08:30 às 19:30 com almoço 12:00-13:30 | Sáb 08:00 às 19:00"
          >
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
            <span>Padrão Comercial</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={applyContinuousDefault}
            className="text-xs font-bold text-neutral-300 hover:text-neutral-100 bg-neutral-950 hover:bg-neutral-850 px-3 py-1.5 rounded-xl border border-neutral-700/80 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="09:00 às 19:00 direto sem pausa de almoço"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Horário Contínuo</span>
          </button>
        </div>
      </div>

      {/* Days List / Cards */}
      <div className="space-y-3">
        {schedule.map(day => {
          const openTime = day.morningStart || '08:30';
          const closeTime = day.afternoonEnd || day.morningEnd || '19:30';
          const lunchStart = day.lunchStart || day.morningEnd || '12:00';
          const lunchEnd = day.lunchEnd || day.afternoonStart || '13:30';
          const hasLunch = day.hasLunchBreak ?? true;
          const duration = calculateDayDuration(day);

          return (
            <div
              key={day.dayOfWeek}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                day.isOpen
                  ? 'bg-neutral-950/90 border-neutral-800 hover:border-neutral-700 shadow-md'
                  : 'bg-neutral-950/40 border-neutral-850 opacity-70'
              }`}
            >
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 sm:gap-4">
                
                {/* 1. Dia e Interruptor Aberto/Fechado */}
                <div className="flex items-center justify-between xl:justify-start gap-3 min-w-[210px]">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => updateDaySimplified(day.dayOfWeek, { isOpen: !day.isOpen })}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                        day.isOpen
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700'
                      }`}
                      title={day.isOpen ? 'Clique para marcar como FECHADO' : 'Clique para marcar como ABERTO'}
                    >
                      {day.isOpen ? (
                        <Check className="w-5 h-5 stroke-[2.5]" />
                      ) : (
                        <span className="text-[10px] font-black text-neutral-400">OFF</span>
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-100 text-sm">
                          {day.dayName}
                        </span>
                        {day.dayOfWeek === 0 && (
                          <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-bold">
                            Dom
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {day.isOpen ? (
                          <>
                            <span className="text-[11px] font-semibold text-emerald-400">Aberto</span>
                            {duration && (
                              <span className="text-[10px] text-neutral-400 font-mono">
                                • {duration}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px] font-semibold text-neutral-500">Fechado</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* No Mobile/Tablet: Ações rápidas de replicação no topo */}
                  {day.isOpen && (
                    <div className="flex xl:hidden items-center gap-1">
                      {day.dayOfWeek >= 1 && day.dayOfWeek <= 5 && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => copyDayToAllWeekdays(day.dayOfWeek)}
                          className="px-2 py-1 bg-neutral-900 hover:bg-orange-500/20 text-neutral-300 hover:text-orange-400 rounded-lg border border-neutral-800 text-[10px] font-bold transition-all flex items-center gap-1"
                          title="Copiar para Seg-Sex"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Seg-Sex</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => copyDayToAllDays(day.dayOfWeek)}
                        className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded-lg border border-neutral-800 text-[10px] font-bold transition-all flex items-center gap-1"
                        title="Copiar para Todos"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Todos</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Configurações de Horário (Abertura, Fechamento e Almoço) */}
                {day.isOpen ? (
                  <div className="flex-1 flex flex-col md:flex-row flex-wrap xl:flex-nowrap items-stretch md:items-center gap-2 sm:gap-3 min-w-0">
                    {/* Abertura e Fechamento */}
                    <div className="flex items-center justify-between gap-1.5 sm:gap-2 bg-neutral-900/90 border border-neutral-800 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl min-w-0">
                      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                        <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-xs text-neutral-400 font-medium hidden sm:inline">Abertura:</span>
                        <input
                          type="time"
                          disabled={disabled}
                          value={openTime}
                          onChange={e => updateDaySimplified(day.dayOfWeek, { openTime: e.target.value })}
                          className="bg-neutral-950 border border-neutral-700 focus:border-orange-500 rounded-lg px-1.5 sm:px-2 py-1 text-xs font-mono font-black text-neutral-100 text-center w-[76px] sm:w-20 focus:outline-none shrink-0"
                        />
                      </div>

                      <span className="text-neutral-500 text-xs font-medium shrink-0 px-0.5">até</span>

                      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                        <Moon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-xs text-neutral-400 font-medium hidden sm:inline">Fechamento:</span>
                        <input
                          type="time"
                          disabled={disabled}
                          value={closeTime}
                          onChange={e => updateDaySimplified(day.dayOfWeek, { closeTime: e.target.value })}
                          className="bg-neutral-950 border border-neutral-700 focus:border-orange-500 rounded-lg px-1.5 sm:px-2 py-1 text-xs font-mono font-black text-neutral-100 text-center w-[76px] sm:w-20 focus:outline-none shrink-0"
                        />
                      </div>
                    </div>

                    {/* Pausa de Almoço */}
                    <div className="flex items-center justify-between gap-1.5 sm:gap-2 bg-neutral-900/90 border border-neutral-800 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl min-w-0">
                      <label className="inline-flex items-center gap-1 sm:gap-1.5 text-xs text-neutral-300 cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={hasLunch}
                          onChange={e => updateDaySimplified(day.dayOfWeek, { hasLunch: e.target.checked })}
                          className="rounded border-neutral-700 text-orange-500 focus:ring-0 w-3.5 h-3.5 bg-neutral-950 cursor-pointer"
                        />
                        <Utensils className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        <span className="font-medium text-xs">Almoço:</span>
                      </label>

                      {hasLunch ? (
                        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                          <input
                            type="time"
                            disabled={disabled}
                            value={lunchStart}
                            onChange={e => updateDaySimplified(day.dayOfWeek, { lunchStart: e.target.value })}
                            className="bg-neutral-950 border border-neutral-700 focus:border-orange-500 rounded-lg px-1.5 sm:px-2 py-1 text-xs font-mono font-bold text-orange-400 text-center w-[76px] sm:w-20 focus:outline-none shrink-0"
                          />
                          <span className="text-neutral-500 text-xs shrink-0 px-0.5">às</span>
                          <input
                            type="time"
                            disabled={disabled}
                            value={lunchEnd}
                            onChange={e => updateDaySimplified(day.dayOfWeek, { lunchEnd: e.target.value })}
                            className="bg-neutral-950 border border-neutral-700 focus:border-orange-500 rounded-lg px-1.5 sm:px-2 py-1 text-xs font-mono font-bold text-orange-400 text-center w-[76px] sm:w-20 focus:outline-none shrink-0"
                          />
                        </div>
                      ) : (
                        <span className="text-[11px] text-neutral-400 italic">
                          Direto (sem pausa)
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-between text-xs text-neutral-500 italic py-2">
                    <span>Nenhum agendamento será permitido neste dia.</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => updateDaySimplified(day.dayOfWeek, { isOpen: true })}
                      className="text-xs font-bold text-orange-400 hover:text-orange-300 px-3 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg transition-colors cursor-pointer"
                    >
                      Abrir este dia
                    </button>
                  </div>
                )}

                {/* 3. Ações Rápidas de Replicação no Desktop */}
                {day.isOpen && (
                  <div className="hidden xl:flex items-center justify-end gap-1.5 shrink-0">
                    {day.dayOfWeek >= 1 && day.dayOfWeek <= 5 && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => copyDayToAllWeekdays(day.dayOfWeek)}
                        className="px-2.5 py-1.5 bg-neutral-900 hover:bg-orange-500/20 text-neutral-300 hover:text-orange-400 rounded-xl border border-neutral-800 hover:border-orange-500/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                        title="Copiar estes horários para Segunda, Terça, Quarta, Quinta e Sexta"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Seg-Sex</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => copyDayToAllDays(day.dayOfWeek)}
                      className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded-xl border border-neutral-800 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                      title="Copiar estes horários para todos os 7 dias da semana"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Todos</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Observação e Legenda no Rodapé */}
      <div className="bg-neutral-950/80 rounded-2xl p-3.5 border border-neutral-800 text-xs text-neutral-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
          <span>
            Estes horários alimentam o status em tempo real (Aberto, Em Almoço, Fechado) no topo do app dos clientes.
          </span>
        </div>
        <span className="text-neutral-500 text-[11px]">
          Lembre-se de clicar em <strong>Salvar alterações</strong> abaixo para gravar as configurações.
        </span>
      </div>
    </div>
  );
};

