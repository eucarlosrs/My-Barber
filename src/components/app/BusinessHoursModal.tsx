import React from 'react';
import { Clock, X, CheckCircle2, Utensils, Sun, Moon, MapPin, Phone, Calendar } from 'lucide-react';
import { Barbershop, WeeklyBusinessHours, DayBusinessHours } from '../../types';
import { DEFAULT_WEEKLY_BUSINESS_HOURS } from '../../data/initialData';
import { getBarbershopRealOpenStatus, BarbershopOpenStatus } from '../../utils/scheduleEngine';
import { AppImage } from '../common/AppImage';

interface BusinessHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  barbershop: Barbershop;
  openStatus: BarbershopOpenStatus;
}

export const BusinessHoursModal: React.FC<BusinessHoursModalProps> = ({
  isOpen,
  onClose,
  barbershop,
  openStatus
}) => {
  if (!isOpen) return null;

  const currentDayOfWeek = new Date().getDay();
  const schedule: WeeklyBusinessHours = React.useMemo(() => {
    if (barbershop.businessHours && barbershop.businessHours.length > 0) {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const map = new Map<number, DayBusinessHours>();
      barbershop.businessHours.forEach(d => map.set(d.dayOfWeek, d));
      return order.map(dayOfWeek => {
        return map.get(dayOfWeek) || DEFAULT_WEEKLY_BUSINESS_HOURS.find(d => d.dayOfWeek === dayOfWeek)!;
      });
    }
    return DEFAULT_WEEKLY_BUSINESS_HOURS;
  }, [barbershop.businessHours]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl space-y-0"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with Cover / Gradient */}
        <div className="relative p-5 sm:p-6 bg-gradient-to-br from-neutral-850 via-neutral-900 to-neutral-950 border-b border-neutral-800">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded-full transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <AppImage
              src={barbershop.logoUrl}
              alt={barbershop.name}
              fallbackType="logo"
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-neutral-700 shadow-md shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wider text-orange-400">
                  Horário de Atendimento
                </span>
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                    openStatus.isOpen
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : openStatus.isLunchBreak
                      ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      openStatus.isOpen
                        ? 'bg-emerald-400 animate-ping'
                        : openStatus.isLunchBreak
                        ? 'bg-orange-400'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span>{openStatus.statusLabel}</span>
                  {openStatus.detailLabel && (
                    <span className="text-neutral-300 font-normal">({openStatus.detailLabel})</span>
                  )}
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-neutral-100 truncate font-heading">
                {barbershop.name}
              </h2>

              <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1 truncate">
                <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>
                  {barbershop.address.street}, {barbershop.address.number} - {barbershop.address.neighborhood}, {barbershop.address.city}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Schedule Table */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/60">
            <table className="min-w-full divide-y divide-neutral-800 text-left text-xs">
              <thead>
                <tr className="bg-neutral-900/90 text-neutral-300 font-bold uppercase tracking-wider text-[10px]">
                  <th scope="col" className="py-3 px-3.5">
                    Dia
                  </th>
                  <th scope="col" className="py-3 px-3">
                    <div className="flex items-center gap-1 text-amber-400">
                      <Sun className="w-3.5 h-3.5" />
                      <span>Antes do Almoço</span>
                    </div>
                  </th>
                  <th scope="col" className="py-3 px-3">
                    <div className="flex items-center gap-1 text-orange-400">
                      <Utensils className="w-3.5 h-3.5" />
                      <span>Pausa Almoço</span>
                    </div>
                  </th>
                  <th scope="col" className="py-3 px-3">
                    <div className="flex items-center gap-1 text-blue-400">
                      <Moon className="w-3.5 h-3.5" />
                      <span>Depois do Almoço</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-850">
                {schedule.map(day => {
                  const isToday = day.dayOfWeek === currentDayOfWeek;
                  return (
                    <tr
                      key={day.dayOfWeek}
                      className={`transition-colors ${
                        isToday
                          ? 'bg-orange-500/10 font-bold text-neutral-100'
                          : 'hover:bg-neutral-900/40 text-neutral-300'
                      } ${!day.isOpen ? 'opacity-50' : ''}`}
                    >
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{day.dayName}</span>
                          {isToday && (
                            <span className="text-[9px] bg-orange-500 text-neutral-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Hoje
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {day.isOpen ? (
                          <span className="font-mono text-amber-300 font-bold">
                            {day.morningStart} às {day.morningEnd}
                          </span>
                        ) : (
                          <span className="text-neutral-500 italic">Fechado</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {day.isOpen ? (
                          day.hasLunchBreak ? (
                            <span className="font-mono text-orange-400 font-bold">
                              {day.lunchStart} às {day.lunchEnd}
                            </span>
                          ) : (
                            <span className="text-[11px] text-neutral-400">Sem pausa (direto)</span>
                          )
                        ) : (
                          <span className="text-neutral-600">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {day.isOpen ? (
                          <span className="font-mono text-blue-300 font-bold">
                            {day.afternoonStart} às {day.afternoonEnd}
                          </span>
                        ) : (
                          <span className="text-neutral-600">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-400 shrink-0" />
              <span>Horários precisos para seu maior conforto e pontualidade.</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-md"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
