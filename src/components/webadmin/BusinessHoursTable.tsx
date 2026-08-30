import React from 'react';
import { Clock, Copy, CheckCircle2, AlertCircle, Utensils, Sun, Moon, Calendar, ToggleLeft, ToggleRight } from 'lucide-react';
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
  // Ensure we have a complete list of 7 days
  const schedule: WeeklyBusinessHours = React.useMemo(() => {
    if (!value || value.length === 0) return DEFAULT_WEEKLY_BUSINESS_HOURS;
    
    // Sort in standard order: Seg (1), Ter (2), Qua (3), Qui (4), Sex (5), Sáb (6), Dom (0)
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

  const updateDay = (dayOfWeek: number, patch: Partial<DayBusinessHours>) => {
    const updated = schedule.map(d => {
      if (d.dayOfWeek === dayOfWeek) {
        const next = { ...d, ...patch };
        // If morningEnd changes, auto sync lunchStart if hasLunchBreak
        if (patch.morningEnd && (!patch.lunchStart || patch.lunchStart === d.morningEnd)) {
          next.lunchStart = patch.morningEnd;
        }
        // If lunchEnd changes, auto sync afternoonStart if hasLunchBreak
        if (patch.lunchEnd && (!patch.afternoonStart || patch.afternoonStart === d.lunchEnd)) {
          next.afternoonStart = patch.lunchEnd;
        }
        return next;
      }
      return d;
    });
    onChange(updated);
  };

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
  };

  const copyDayToAllDays = (sourceDayOfWeek: number) => {
    const source = schedule.find(d => d.dayOfWeek === sourceDayOfWeek);
    if (!source) return;

    const updated = schedule.map(d => {
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
    });
    onChange(updated);
  };

  const applyCommercialDefault = () => {
    onChange(DEFAULT_WEEKLY_BUSINESS_HOURS);
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
              <span>Horário de Atendimento e Funcionamento</span>
              <span className="text-[10px] bg-orange-500/15 text-orange-400 font-extrabold px-2 py-0.5 rounded-full border border-orange-500/30">
                Tabela Oficial
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              Configure antes do almoço, pausa para almoço e depois do almoço. Exibido na parte superior do app do cliente.
            </p>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={disabled}
            onClick={applyCommercialDefault}
            className="text-[11px] font-bold text-neutral-300 hover:text-orange-400 bg-neutral-900 hover:bg-neutral-850 px-2.5 py-1.5 rounded-lg border border-neutral-700 transition-colors cursor-pointer flex items-center gap-1.5"
            title="Preencher com horários padrão da barbearia (Seg-Sex 08:30-12:00 / 13:30-19:30, Sáb 08:00-19:00)"
          >
            <Clock className="w-3 h-3 text-orange-400" />
            <span>Padrão Comercial</span>
          </button>
        </div>
      </div>

      {/* Interactive Table */}
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="inline-block min-w-full align-middle">
          <table className="min-w-full divide-y divide-neutral-800 text-left text-xs">
            <thead>
              <tr className="bg-neutral-900/80 text-neutral-300 font-bold uppercase tracking-wider text-[10px]">
                <th scope="col" className="py-3 px-3 rounded-l-xl w-36">
                  Dia da Semana
                </th>
                <th scope="col" className="py-3 px-3">
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <Sun className="w-3.5 h-3.5" />
                    <span>Antes do Almoço (Manhã)</span>
                  </div>
                </th>
                <th scope="col" className="py-3 px-3">
                  <div className="flex items-center gap-1.5 text-orange-400">
                    <Utensils className="w-3.5 h-3.5" />
                    <span>Pausa Almoço (Intervalo)</span>
                  </div>
                </th>
                <th scope="col" className="py-3 px-3">
                  <div className="flex items-center gap-1.5 text-blue-400">
                    <Moon className="w-3.5 h-3.5" />
                    <span>Depois do Almoço (Tarde)</span>
                  </div>
                </th>
                <th scope="col" className="py-3 px-3 text-right rounded-r-xl w-28">
                  Ações Rápidas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900 bg-neutral-950/60">
              {schedule.map(day => (
                <tr
                  key={day.dayOfWeek}
                  className={`transition-colors hover:bg-neutral-900/40 ${
                    !day.isOpen ? 'opacity-60 bg-neutral-950/40' : ''
                  }`}
                >
                  {/* Day column & open/closed toggle */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => updateDay(day.dayOfWeek, { isOpen: !day.isOpen })}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                          day.isOpen
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700'
                        }`}
                        title={day.isOpen ? 'Clique para marcar como Fechado' : 'Clique para marcar como Aberto'}
                      >
                        {day.isOpen ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <span className="text-[10px] font-black">OFF</span>
                        )}
                      </button>

                      <div>
                        <div className="font-bold text-neutral-200 text-xs flex items-center gap-1.5">
                          <span>{day.dayName}</span>
                          {day.dayOfWeek === 0 && (
                            <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.2 rounded">
                              Dom
                            </span>
                          )}
                        </div>
                        <div className="text-[10px]">
                          {day.isOpen ? (
                            <span className="text-emerald-400 font-semibold">Expediente Ativo</span>
                          ) : (
                            <span className="text-neutral-500 font-semibold">Fechado / Folga</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Morning Shift (Antes do Almoço) */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    {day.isOpen ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-neutral-400">Abertura</span>
                          <input
                            type="time"
                            disabled={disabled}
                            value={day.morningStart}
                            onChange={e => updateDay(day.dayOfWeek, { morningStart: e.target.value })}
                            className="bg-neutral-900 border border-neutral-700 focus:border-amber-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-300 text-center w-24 focus:outline-none"
                          />
                        </div>
                        <span className="text-neutral-500 text-xs mt-3">às</span>
                        <div className="flex flex-col">
                          <span className="text-[9px] text-neutral-400">Início Almoço</span>
                          <input
                            type="time"
                            disabled={disabled}
                            value={day.morningEnd}
                            onChange={e => updateDay(day.dayOfWeek, { morningEnd: e.target.value })}
                            className="bg-neutral-900 border border-neutral-700 focus:border-amber-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-300 text-center w-24 focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-600 italic">Sem atendimento</span>
                    )}
                  </td>

                  {/* Lunch Break (Pausa para o Almoço) */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    {day.isOpen ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-[10px] text-neutral-300 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={day.hasLunchBreak}
                              onChange={e => updateDay(day.dayOfWeek, { hasLunchBreak: e.target.checked })}
                              className="rounded border-neutral-700 text-orange-500 focus:ring-0 w-3 h-3 bg-neutral-900 cursor-pointer"
                            />
                            <span>Pausa p/ Almoço</span>
                          </label>
                        </div>

                        {day.hasLunchBreak ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-neutral-400">Início Pausa</span>
                              <input
                                type="time"
                                disabled={disabled}
                                value={day.lunchStart}
                                onChange={e => updateDay(day.dayOfWeek, { lunchStart: e.target.value })}
                                className="bg-neutral-900 border border-neutral-700 focus:border-orange-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-orange-400 text-center w-24 focus:outline-none"
                              />
                            </div>
                            <span className="text-neutral-500 text-xs mt-3">às</span>
                            <div className="flex flex-col">
                              <span className="text-[9px] text-neutral-400">Fim Pausa (Retorno)</span>
                              <input
                                type="time"
                                disabled={disabled}
                                value={day.lunchEnd}
                                onChange={e => updateDay(day.dayOfWeek, { lunchEnd: e.target.value })}
                                className="bg-neutral-900 border border-neutral-700 focus:border-orange-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-orange-400 text-center w-24 focus:outline-none"
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-neutral-500 bg-neutral-900 px-2 py-1 rounded-md inline-block border border-neutral-800">
                            Sem intervalo (direto)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-600 italic">-</span>
                    )}
                  </td>

                  {/* Afternoon Shift (Depois do Almoço) */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    {day.isOpen ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-neutral-400">Retorno Tarde</span>
                          <input
                            type="time"
                            disabled={disabled}
                            value={day.afternoonStart}
                            onChange={e => updateDay(day.dayOfWeek, { afternoonStart: e.target.value })}
                            className="bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-blue-300 text-center w-24 focus:outline-none"
                          />
                        </div>
                        <span className="text-neutral-500 text-xs mt-3">às</span>
                        <div className="flex flex-col">
                          <span className="text-[9px] text-neutral-400">Fechamento</span>
                          <input
                            type="time"
                            disabled={disabled}
                            value={day.afternoonEnd}
                            onChange={e => updateDay(day.dayOfWeek, { afternoonEnd: e.target.value })}
                            className="bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-blue-300 text-center w-24 focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-600 italic">-</span>
                    )}
                  </td>

                  {/* Quick copy buttons */}
                  <td className="py-3 px-3 whitespace-nowrap text-right">
                    {day.isOpen && (
                      <div className="flex items-center justify-end gap-1">
                        {day.dayOfWeek >= 1 && day.dayOfWeek <= 5 && (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => copyDayToAllWeekdays(day.dayOfWeek)}
                            className="p-1.5 bg-neutral-900 hover:bg-orange-500/20 text-neutral-300 hover:text-orange-400 rounded-lg border border-neutral-800 hover:border-orange-500/40 text-[10px] font-semibold transition-colors cursor-pointer"
                            title="Copiar estes horários para todos os dias úteis (Segunda a Sexta)"
                          >
                            <Copy className="w-3 h-3 inline mr-1" />
                            <span>Seg-Sex</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => copyDayToAllDays(day.dayOfWeek)}
                          className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded-lg border border-neutral-800 text-[10px] transition-colors cursor-pointer"
                          title="Copiar para todos os dias da semana"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend & Help notice */}
      <div className="bg-neutral-900/70 rounded-xl p-3 border border-neutral-800/80 text-[11px] text-neutral-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
          <span>
            Os horários definidos aqui controlam o status em tempo real (Aberto, Pausa de Almoço, Fechado) no topo do app dos clientes.
          </span>
        </div>
        <span className="text-neutral-500 text-[10px]">
          * Clique no botão verde ON/OFF para alternar dias fechados (como Domingo).
        </span>
      </div>
    </div>
  );
};
