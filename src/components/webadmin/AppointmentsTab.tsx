import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Calendar,
  Clock,
  User,
  Scissors,
  CheckCircle2,
  XCircle,
  Phone,
  Send,
  Plus,
  Filter,
  DollarSign,
  CalendarCheck,
  RotateCcw,
  Sparkles,
  LayoutGrid,
  List,
  ChevronRight,
  UserCheck,
  Flame,
  Info,
  Layers
} from 'lucide-react';
import { Appointment, AppointmentStatus } from '../../types';
import { AppImage } from '../common/AppImage';
import { getTodayLocalDateString } from '../../utils/scheduleEngine';

export const AppointmentsTab: React.FC = () => {
  const {
    appointments,
    professionals,
    services,
    clients,
    addAppointment,
    cancelAppointment,
    updateAppointmentStatus,
    currentBarbershop
  } = useApp();

  const todayStr = getTodayLocalDateString();
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [isRangeMode, setIsRangeMode] = useState<boolean>(false);
  const [activeDatePreset, setActiveDatePreset] = useState<'TODAY' | 'TOMORROW' | 'WEEK' | 'CUSTOM'>('TODAY');
  const [viewMode, setViewMode] = useState<'AGENDA' | 'LIST'>('AGENDA');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAppointmentForDetails, setSelectedAppointmentForDetails] = useState<Appointment | null>(null);

  // New appointment form states
  const [newClientId, setNewClientId] = useState<string>('');
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientWhatsApp, setNewClientWhatsApp] = useState<string>('');
  const [newProfId, setNewProfId] = useState<string>(professionals[0]?.id || '');
  const [newServiceId, setNewServiceId] = useState<string>(services[0]?.id || '');
  const [newDate, setNewDate] = useState<string>(todayStr);
  const [newStartTime, setNewStartTime] = useState<string>('14:00');
  const [isEncaixe, setIsEncaixe] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Quick Date Selectors
  const selectToday = () => {
    const today = getTodayLocalDateString();
    setStartDate(today);
    setEndDate(today);
    setIsRangeMode(false);
    setActiveDatePreset('TODAY');
  };

  const selectTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tmrw = getTodayLocalDateString(d);
    setStartDate(tmrw);
    setEndDate(tmrw);
    setIsRangeMode(false);
    setActiveDatePreset('TOMORROW');
  };

  const selectCurrentWeek = () => {
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 = Dom, 1 = Seg, ..., 6 = Sab
    
    // Segunda-feira como início da semana (se domingo = 0, recua 6 dias)
    const distanceToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);

    // Domingo como fim da semana (6 dias após a segunda)
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    setStartDate(getTodayLocalDateString(monday));
    setEndDate(getTodayLocalDateString(sunday));
    setIsRangeMode(true);
    setActiveDatePreset('WEEK');
  };

  // Filter appointments
  const filteredAppointments = appointments
    .filter(apt => {
      if (selectedProfessionalId !== 'ALL' && apt.professionalId !== selectedProfessionalId) {
        return false;
      }
      if (selectedStatus !== 'ALL' && apt.status !== selectedStatus) {
        return false;
      }
      if (isRangeMode) {
        if (startDate && apt.date < startDate) return false;
        if (endDate && apt.date > endDate) return false;
      } else {
        if (startDate && apt.date !== startDate) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by date first, then by startTime
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });

  // Calculate metrics for selected range/day
  const dayAppointments = filteredAppointments;
  const totalDayRevenue = dayAppointments
    .filter(a => a.status === 'AGENDADO' || a.status === 'CONCLUIDO')
    .reduce((sum, a) => sum + a.servicePrice, 0);

  const completedCount = dayAppointments.filter(a => a.status === 'CONCLUIDO').length;
  const pendingCount = dayAppointments.filter(a => a.status === 'AGENDADO').length;

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const srv = services.find(s => s.id === newServiceId);
    const prof = professionals.find(p => p.id === newProfId);

    if (!srv || !prof) {
      setFormError('Selecione um serviço e um profissional válidos.');
      return;
    }

    const [h, m] = newStartTime.split(':').map(Number);
    const endTotal = h * 60 + m + srv.durationMinutes;
    const endH = String(Math.floor(endTotal / 60)).padStart(2, '0');
    const endM = String(endTotal % 60).padStart(2, '0');
    const endTime = `${endH}:${endM}`;

    const clientNameFinal = newClientName.trim() || 'Cliente Balcão';
    const clientPhoneFinal = newClientWhatsApp.trim() || '(11) 99999-0000';

    const res = addAppointment({
      tenantId: currentBarbershop.id,
      clientId: newClientId || `user-client-${Date.now()}`,
      clientName: clientNameFinal,
      clientWhatsApp: clientPhoneFinal,
      professionalId: prof.id,
      professionalName: prof.name,
      serviceId: srv.id,
      serviceName: srv.name,
      servicePrice: srv.price,
      serviceDuration: srv.durationMinutes,
      date: newDate,
      startTime: newStartTime,
      endTime: endTime,
      status: 'AGENDADO',
      isEncaixe
    });

    if (res.success) {
      setShowAddModal(false);
      setNewClientName('');
      setNewClientWhatsApp('');
    } else {
      setFormError(res.error || 'Erro ao agendar horário.');
    }
  };

  const getWhatsAppLink = (apt: Appointment) => {
    const text = encodeURIComponent(
      `Olá ${apt.clientName}! Confirmamos seu agendamento na ${currentBarbershop.name} para o dia ${apt.date.split('-').reverse().join('/')} às ${apt.startTime} com ${apt.professionalName} (${apt.serviceName}). Até breve!`
    );
    const cleanPhone = apt.clientWhatsApp.replace(/\D/g, '');
    return `https://wa.me/55${cleanPhone}?text=${text}`;
  };

  // Group appointments into Time Slots (Morning / Afternoon / Night) for visual schedule
  const morningSlots = filteredAppointments.filter(a => parseInt(a.startTime.split(':')[0], 10) < 12);
  const afternoonSlots = filteredAppointments.filter(a => {
    const hour = parseInt(a.startTime.split(':')[0], 10);
    return hour >= 12 && hour < 18;
  });
  const nightSlots = filteredAppointments.filter(a => parseInt(a.startTime.split(':')[0], 10) >= 18);

  const renderStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'AGENDADO':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Agendado
          </span>
        );
      case 'CONCLUIDO':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Concluído
          </span>
        );
      case 'CANCELADO':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-red-500/20 text-red-300 border border-red-500/40 inline-flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            Cancelado
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header with Visual Badges & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-neutral-100 text-lg font-heading">
              Agenda dos Barbeiros
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
              <span>{filteredAppointments.length} agendamentos na tela</span>
              <span>•</span>
              <span className="text-amber-400 font-medium">Visualização rápida</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View Mode Toggle */}
          <div className="bg-neutral-950 p-1 rounded-xl border border-neutral-800 flex items-center gap-1">
            <button
              onClick={() => setViewMode('AGENDA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'AGENDA'
                  ? 'bg-neutral-800 text-orange-400 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Modo Agenda Visual"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Agenda</span>
            </button>
            <button
              onClick={() => setViewMode('LIST')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'LIST'
                  ? 'bg-neutral-800 text-orange-400 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Modo Lista Compacta"
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>

          <button
            onClick={() => {
              setFormError(null);
              setShowAddModal(true);
            }}
            className="flex-1 sm:flex-none px-4 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Agendamento</span>
          </button>
        </div>
      </div>

      {/* Visual Filter Bar & Metrics */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 sm:p-4 space-y-3">
        {/* Row 1: Date Range / Single Day & Quick Preset Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={selectToday}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm ${
                activeDatePreset === 'TODAY'
                  ? 'bg-orange-500 text-neutral-950 font-black ring-2 ring-orange-500/40'
                  : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={selectTomorrow}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm ${
                activeDatePreset === 'TOMORROW'
                  ? 'bg-orange-500 text-neutral-950 font-black ring-2 ring-orange-500/40'
                  : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
              }`}
            >
              Amanhã
            </button>
            <button
              onClick={selectCurrentWeek}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm flex items-center gap-1.5 ${
                activeDatePreset === 'WEEK'
                  ? 'bg-orange-500 text-neutral-950 font-black ring-2 ring-orange-500/40'
                  : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Semanal Atual</span>
            </button>

            {/* Toggle Range Mode */}
            <button
              onClick={() => {
                setIsRangeMode(!isRangeMode);
                setActiveDatePreset('CUSTOM');
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                isRangeMode
                  ? 'bg-neutral-800 text-orange-400 border-orange-500/40'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
              title="Ativar seleção de múltiplos dias / período personalizado"
            >
              {isRangeMode ? '📅 Período Ativo' : '📅 Vários Dias'}
            </button>
          </div>

          {/* Date Picker Inputs (Single or Range) */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex items-center">
              <Calendar className="w-4 h-4 text-orange-400 absolute left-3 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  if (!isRangeMode) setEndDate(e.target.value);
                  setActiveDatePreset('CUSTOM');
                }}
                className="bg-neutral-950 border border-neutral-800 focus:border-orange-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-100 font-mono focus:outline-none transition-colors"
                style={{ colorScheme: 'dark' }}
              />
            </div>

            {isRangeMode && (
              <>
                <span className="text-neutral-500 text-xs font-bold">até</span>
                <div className="relative flex items-center">
                  <Calendar className="w-4 h-4 text-orange-400 absolute left-3 pointer-events-none" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => {
                      setEndDate(e.target.value);
                      setActiveDatePreset('CUSTOM');
                    }}
                    className="bg-neutral-950 border border-neutral-800 focus:border-orange-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-100 font-mono focus:outline-none transition-colors"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Selectors (Barber & Status) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-neutral-800/60">
          {/* Barbeiro Selector */}
          <div>
            <select
              value={selectedProfessionalId}
              onChange={e => setSelectedProfessionalId(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">👤 Todos os Barbeiros ({professionals.length})</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>
                  ✂️ {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Selector */}
          <div>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">⚡ Todos os Status</option>
              <option value="AGENDADO">⏳ Agendados</option>
              <option value="CONCLUIDO">✅ Concluídos</option>
              <option value="CANCELADO">❌ Cancelados</option>
            </select>
          </div>
        </div>

        {/* Compact Visual Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-neutral-800/80">
          <div className="bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800 flex items-center justify-between">
            <span className="text-neutral-400 text-[11px] font-bold">
              {isRangeMode ? 'Total no Período' : 'Total no Dia'}
            </span>
            <span className="text-xs font-extrabold text-neutral-100">{dayAppointments.length}</span>
          </div>
          <div className="bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800 flex items-center justify-between">
            <span className="text-amber-400 text-[11px] font-bold">Pendentes</span>
            <span className="text-xs font-extrabold text-amber-400">{pendingCount}</span>
          </div>
          <div className="bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800 flex items-center justify-between">
            <span className="text-emerald-400 text-[11px] font-bold">Concluídos</span>
            <span className="text-xs font-extrabold text-emerald-400">{completedCount}</span>
          </div>
          <div className="bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800 flex items-center justify-between">
            <span className="text-neutral-400 text-[11px] font-bold">Faturamento</span>
            <span className="text-xs font-extrabold text-emerald-400 font-mono">
              R$ {totalDayRevenue.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. VISUAL AGENDA MODE: HORÁRIO → CLIENTE → SERVIÇO → PROFISSIONAL → STATUS */}
      {/* ========================================================================= */}
      {viewMode === 'AGENDA' && (
        <div className="space-y-4">
          {filteredAppointments.length === 0 ? (
            <div className="text-center py-12 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-neutral-400">
              <Calendar className="w-10 h-10 mx-auto text-neutral-600 mb-2" />
              <p className="text-sm font-bold text-neutral-300">Nenhum agendamento neste dia ou filtro.</p>
              <p className="text-xs text-neutral-500 mt-0.5">Use o botão "Novo Agendamento" para cadastrar um horário.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAppointments.map(apt => {
                const prof = professionals.find(p => p.id === apt.professionalId);
                return (
                  <div
                    key={apt.id}
                    onClick={() => setSelectedAppointmentForDetails(apt)}
                    className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer shadow-md group relative overflow-hidden"
                  >
                    {/* Status side indicator line */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                        apt.status === 'CONCLUIDO'
                          ? 'bg-emerald-500'
                          : apt.status === 'CANCELADO'
                          ? 'bg-red-500'
                          : 'bg-amber-500'
                      }`}
                    />

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pl-2">
                      {/* 1. HORÁRIO */}
                      <div className="flex items-center gap-3 min-w-[130px]">
                        <div className="w-12 h-12 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-col items-center justify-center text-center">
                          <span className="text-xs font-black text-orange-400 font-mono">{apt.startTime}</span>
                          <span className="text-[10px] text-neutral-500 font-mono">{apt.endTime}</span>
                        </div>
                        <div>
                          <div className="text-[11px] text-neutral-500 font-mono">
                            {apt.date.split('-').reverse().join('/')}
                          </div>
                          {apt.isEncaixe && (
                            <span className="text-[9px] font-black bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                              ENCAIXE
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 2. CLIENTE */}
                      <div className="flex-1 min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-neutral-100 text-sm">{apt.clientName}</span>
                        </div>
                        <div className="text-[11px] text-neutral-400 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-emerald-500" />
                          <span>{apt.clientWhatsApp}</span>
                        </div>
                      </div>

                      {/* 3. SERVIÇO & VALOR */}
                      <div className="min-w-[160px]">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-200">
                          <Scissors className="w-3.5 h-3.5 text-orange-400" />
                          <span>{apt.serviceName}</span>
                        </div>
                        <div className="text-xs font-black text-emerald-400 font-mono mt-0.5">
                          R$ {apt.servicePrice.toFixed(2).replace('.', ',')}
                        </div>
                      </div>

                      {/* 4. PROFISSIONAL */}
                      <div className="flex items-center gap-2 min-w-[150px]">
                        <AppImage
                          src={prof?.avatarUrl}
                          alt={prof?.name || apt.professionalName}
                          fallbackType="avatar"
                          className="w-7 h-7 rounded-full object-cover border border-neutral-700"
                        />
                        <span className="text-xs font-semibold text-neutral-300 truncate">
                          {apt.professionalName}
                        </span>
                      </div>

                      {/* 5. STATUS & QUICK ACTIONS */}
                      <div
                        className="flex items-center justify-between md:justify-end gap-2 min-w-[180px]"
                        onClick={e => e.stopPropagation()}
                      >
                        {renderStatusBadge(apt.status)}

                        <div className="flex items-center gap-1">
                          {apt.status === 'AGENDADO' && (
                            <>
                              <button
                                onClick={() => updateAppointmentStatus(apt.id, 'CONCLUIDO')}
                                className="p-2 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-neutral-950 rounded-xl transition-all"
                                title="Concluir Atendimento"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => cancelAppointment(apt.id)}
                                className="p-2 bg-neutral-950 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 border border-neutral-800 rounded-xl transition-all"
                                title="Cancelar"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {apt.status !== 'AGENDADO' && (
                            <button
                              onClick={() => updateAppointmentStatus(apt.id, 'AGENDADO')}
                              className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs transition-all"
                              title="Reabrir Agendamento"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <a
                            href={getWhatsAppLink(apt)}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl transition-all"
                            title="Lembrete WhatsApp"
                          >
                            <Send className="w-4 h-4" />
                          </a>

                          <button
                            onClick={() => setSelectedAppointmentForDetails(apt)}
                            className="p-2 bg-neutral-950 hover:bg-neutral-800 text-neutral-400 rounded-xl border border-neutral-800"
                            title="Ver detalhes"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. COMPACT LIST MODE (TABLE) */}
      {/* ========================================================================= */}
      {viewMode === 'LIST' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-950 text-neutral-400 font-bold border-b border-neutral-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3.5">Horário</th>
                  <th className="p-3.5">Cliente</th>
                  <th className="p-3.5">Serviço</th>
                  <th className="p-3.5">Profissional</th>
                  <th className="p-3.5">Valor</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 text-neutral-200">
                {filteredAppointments.map(apt => {
                  const prof = professionals.find(p => p.id === apt.professionalId);
                  return (
                    <tr
                      key={apt.id}
                      onClick={() => setSelectedAppointmentForDetails(apt)}
                      className="hover:bg-neutral-850 transition-colors cursor-pointer"
                    >
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-extrabold text-neutral-100 text-xs font-mono">
                          {apt.startTime} - {apt.endTime}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {apt.date.split('-').reverse().join('/')}
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="font-bold text-neutral-100">{apt.clientName}</div>
                        <div className="text-neutral-400 font-mono text-[11px] flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-500" />
                          {apt.clientWhatsApp}
                        </div>
                      </td>

                      <td className="p-3.5 font-medium text-neutral-300">
                        {apt.serviceName}
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <AppImage
                            src={prof?.avatarUrl}
                            alt={prof?.name || apt.professionalName}
                            fallbackType="avatar"
                            className="w-6 h-6 rounded-full object-cover border border-neutral-700"
                          />
                          <span className="font-semibold text-neutral-200">{apt.professionalName}</span>
                        </div>
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        <strong className="text-emerald-400 font-mono text-xs">
                          R$ {apt.servicePrice.toFixed(2).replace('.', ',')}
                        </strong>
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        {renderStatusBadge(apt.status)}
                      </td>

                      <td className="p-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {apt.status === 'AGENDADO' && (
                            <>
                              <button
                                onClick={() => updateAppointmentStatus(apt.id, 'CONCLUIDO')}
                                className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-lg text-[11px] flex items-center gap-1 transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Concluir</span>
                              </button>
                              <button
                                onClick={() => cancelAppointment(apt.id)}
                                className="p-1.5 bg-neutral-950 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 border border-neutral-800 rounded-lg"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <a
                            href={getWhatsAppLink(apt)}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. APPOINTMENT DETAIL MODAL (DRAWER ON CLICK) */}
      {/* ========================================================================= */}
      {selectedAppointmentForDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-6 text-neutral-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-orange-400" />
                <h3 className="font-extrabold text-base font-heading">Detalhes do Agendamento</h3>
              </div>
              <button
                onClick={() => setSelectedAppointmentForDetails(null)}
                className="text-neutral-400 hover:text-neutral-100 text-xs font-bold p-1 bg-neutral-800 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Main Visual Header */}
            <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Horário Marcado</span>
                <div className="text-xl font-black text-orange-400 font-mono mt-0.5">
                  {selectedAppointmentForDetails.startTime} - {selectedAppointmentForDetails.endTime}
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {selectedAppointmentForDetails.date.split('-').reverse().join('/')}
                </div>
              </div>
              <div className="text-right">
                {renderStatusBadge(selectedAppointmentForDetails.status)}
                {selectedAppointmentForDetails.isEncaixe && (
                  <div className="mt-1">
                    <span className="text-[9px] font-black bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                      HORÁRIO DE ENCAIXE
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Key-Value Cards */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="text-neutral-400 text-[10px] uppercase font-bold block">Cliente</span>
                <strong className="text-neutral-100 font-bold text-sm block mt-0.5">
                  {selectedAppointmentForDetails.clientName}
                </strong>
                <a
                  href={getWhatsAppLink(selectedAppointmentForDetails)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline font-mono text-[11px] flex items-center gap-1 mt-1"
                >
                  <Phone className="w-3 h-3" />
                  {selectedAppointmentForDetails.clientWhatsApp}
                </a>
              </div>

              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="text-neutral-400 text-[10px] uppercase font-bold block">Barbeiro</span>
                <strong className="text-neutral-100 font-bold text-sm block mt-0.5">
                  {selectedAppointmentForDetails.professionalName}
                </strong>
                <span className="text-orange-400 text-[11px] block mt-1">
                  Atendimento Confirmado
                </span>
              </div>
            </div>

            <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-neutral-400 text-[10px] uppercase font-bold block">Serviço Solicitado</span>
                <strong className="text-neutral-100 text-sm font-bold mt-0.5 block">
                  {selectedAppointmentForDetails.serviceName}
                </strong>
              </div>
              <div className="text-right">
                <span className="text-neutral-400 text-[10px] uppercase font-bold block">Valor</span>
                <span className="text-emerald-400 font-black font-mono text-base">
                  R$ {selectedAppointmentForDetails.servicePrice.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-neutral-800 flex flex-col gap-2">
              <a
                href={getWhatsAppLink(selectedAppointmentForDetails)}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-md transition-colors"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Lembrete no WhatsApp</span>
              </a>

              <div className="flex items-center gap-2">
                {selectedAppointmentForDetails.status === 'AGENDADO' ? (
                  <>
                    <button
                      onClick={() => {
                        updateAppointmentStatus(selectedAppointmentForDetails.id, 'CONCLUIDO');
                        setSelectedAppointmentForDetails(null);
                      }}
                      className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Concluir Atendimento</span>
                    </button>
                    <button
                      onClick={() => {
                        cancelAppointment(selectedAppointmentForDetails.id);
                        setSelectedAppointmentForDetails(null);
                      }}
                      className="py-2 px-4 bg-neutral-800 hover:bg-red-500/20 text-neutral-300 hover:text-red-300 rounded-xl text-xs font-bold"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      updateAppointmentStatus(selectedAppointmentForDetails.id, 'AGENDADO');
                      setSelectedAppointmentForDetails(null);
                    }}
                    className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reabrir Agendamento</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. NEW APPOINTMENT MODAL */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 text-neutral-100 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-orange-400" />
                <h3 className="text-base font-black font-heading text-neutral-100">
                  Novo Agendamento / Encaixe
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-neutral-100 text-xs font-bold p-1 bg-neutral-800 rounded-lg"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-xl text-xs mb-4">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Nome do Cliente</label>
                  <input
                    type="text"
                    required
                    value={newClientName}
                    onChange={e => setNewClientName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">WhatsApp</label>
                  <input
                    type="text"
                    required
                    value={newClientWhatsApp}
                    onChange={e => setNewClientWhatsApp(e.target.value)}
                    placeholder="(11) 99123-4567"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Profissional</label>
                  <select
                    value={newProfId}
                    onChange={e => setNewProfId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  >
                    {professionals.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Serviço</label>
                  <select
                    value={newServiceId}
                    onChange={e => setNewServiceId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  >
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (R$ {s.price.toFixed(2).replace('.', ',')})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Horário de Início</label>
                  <input
                    type="time"
                    required
                    value={newStartTime}
                    onChange={e => setNewStartTime(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
              </div>

              {/* Encaixe checkbox */}
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEncaixe}
                    onChange={e => setIsEncaixe(e.target.checked)}
                    className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 bg-neutral-900 border-neutral-700"
                  />
                  <div>
                    <div className="text-xs font-bold text-neutral-200">Horário de Encaixe</div>
                    <div className="text-[11px] text-neutral-400">
                      Permite atendimento no mesmo horário com o barbeiro.
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black shadow-md"
                >
                  Confirmar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
