import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { PhoneFrame } from './PhoneFrame';
import {
  Calendar,
  Clock,
  DollarSign,
  User,
  Scissors,
  CheckCircle2,
  AlertCircle,
  Eye,
  Percent,
  Plus,
  Phone,
  Sparkles,
  TrendingUp,
  Award,
  Wallet,
  Zap,
  Filter,
  LogOut
} from 'lucide-react';
import { Appointment } from '../../types';
import { AppImage } from '../common/AppImage';

export const ProfessionalAppView: React.FC = () => {
  const {
    currentBarbershop,
    professionals,
    currentUser,
    setCurrentUserId,
    appointments,
    addAppointment,
    services,
    isImpersonating,
    logout
  } = useApp();

  // Active viewing barber (defaults to logged in user if professional, or first professional)
  const isCurrentProf = currentUser.role === 'PROFISSIONAL';
  const activeProf = isCurrentProf ? currentUser : professionals[0] || currentUser;

  // Selected schedule view (for leader with canViewAllProfessionals)
  const canViewAll = activeProf.canViewAllProfessionals;
  const [filterBarberId, setFilterBarberId] = useState<string>(canViewAll ? 'ALL' : activeProf.id);

  // Encaixe Modal (Seção 14: Permitir criar encaixes fora da programação normal)
  const [showEncaixeModal, setShowEncaixeModal] = useState(false);
  const [encaixeClientName, setEncaixeClientName] = useState('');
  const [encaixeClientPhone, setEncaixeClientPhone] = useState('');
  const [encaixeServiceId, setEncaixeServiceId] = useState(services[0]?.id || '');
  const [encaixeTime, setEncaixeTime] = useState('12:15');
  const [encaixeDate, setEncaixeDate] = useState('2026-08-10');
  const [encaixeNotes, setEncaixeNotes] = useState('Encaixe de emergência');

  // Filtered appointments
  const displayedAppointments = appointments.filter(a => {
    if (canViewAll && filterBarberId === 'ALL') {
      return true;
    }
    const targetId = canViewAll && filterBarberId !== 'ALL' ? filterBarberId : activeProf.id;
    return a.professionalId === targetId;
  });

  // Commission calculations for active professional
  const myAppointments = appointments.filter(a => a.professionalId === activeProf.id);
  const myGross = myAppointments.reduce((sum, a) => sum + a.servicePrice, 0);
  const commissionRate = activeProf.commissionPercentage || 45;
  const myNetCommission = (myGross * commissionRate) / 100;

  const handleCreateEncaixe = (e: React.FormEvent) => {
    e.preventDefault();
    const srv = services.find(s => s.id === encaixeServiceId) || services[0];
    
    // Calculate end time
    const [h, m] = encaixeTime.split(':').map(Number);
    const totalMin = h * 60 + m + srv.durationMinutes;
    const endH = Math.floor(totalMin / 60).toString().padStart(2, '0');
    const endM = (totalMin % 60).toString().padStart(2, '0');
    const endTime = `${endH}:${endM}`;

    addAppointment({
      tenantId: currentBarbershop.id,
      serviceId: srv.id,
      serviceName: srv.name,
      servicePrice: srv.price,
      serviceDuration: srv.durationMinutes,
      professionalId: activeProf.id,
      professionalName: activeProf.name,
      clientId: `client-encaixe-${Date.now()}`,
      clientName: encaixeClientName,
      clientWhatsApp: encaixeClientPhone,
      date: encaixeDate,
      startTime: encaixeTime,
      endTime,
      isEncaixe: true, // SEÇÃO 14: Encaixe fora da grade normal
      notes: encaixeNotes,
      status: 'AGENDADO'
    });

    setShowEncaixeModal(false);
    setEncaixeClientName('');
    setEncaixeClientPhone('');
  };

  const profBody = (
    <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col bg-neutral-950 text-neutral-100 relative p-4 space-y-4 pb-20">
      {/* Top Navbar with Barbershop Name, Professional greeting and Logout */}
      {isCurrentProf && !isImpersonating && (
        <div className="bg-neutral-900/90 backdrop-blur-md border border-neutral-800 rounded-2xl px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs sm:text-sm font-bold text-neutral-200 truncate">{currentBarbershop.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-neutral-300">
              <Scissors className="w-3.5 h-3.5 text-orange-400" />
              <span className="font-semibold">{currentUser.name}</span>
            </div>
            <button
              onClick={logout}
              className="text-xs font-bold text-neutral-300 hover:text-red-400 flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded-xl border border-neutral-700 transition-colors cursor-pointer"
              title="Sair e voltar para a tela de login"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. PROFESSIONAL APP HEADER */}
      {/* ========================================================================= */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-4 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <AppImage
                  src={activeProf.avatarUrl}
                  alt={activeProf.name}
                  fallbackType="avatar"
                  className="w-13 h-13 rounded-2xl object-cover border-2 border-orange-500/50 shadow-md"
                />
                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-neutral-900 rounded-full"></span>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold bg-orange-500 text-neutral-950 px-2 py-0.5 rounded uppercase tracking-wide">
                    {canViewAll ? 'Líder • Vê Todos' : 'Profissional'}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-medium">Online</span>
                </div>
                <h2 className="text-base font-bold text-neutral-100 leading-tight mt-0.5">
                  {activeProf.name}
                </h2>
                <div className="text-xs text-neutral-400 font-mono">
                  {activeProf.whatsapp}
                </div>
              </div>
            </div>

            {/* Quick Encaixe Action Button */}
            <button
              onClick={() => setShowEncaixeModal(true)}
              className="bg-orange-500 hover:bg-orange-400 text-neutral-950 p-2.5 rounded-2xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all shrink-0 flex items-center gap-1 font-semibold text-xs"
              title="Criar Encaixe de Atendimento"
            >
              <Zap className="w-4 h-4 fill-neutral-950" />
              <span className="hidden sm:inline">Encaixe</span>
            </button>
          </div>

          {/* Barber Simulator Selector */}
          <div className="mt-3 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
            <span className="text-xs text-neutral-400">Simular Barbeiro:</span>
            <select
              value={activeProf.id}
              onChange={e => setCurrentUserId(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-1 text-xs text-neutral-200 focus:outline-none"
            >
              {professionals.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.canViewAllProfessionals ? '★ (Líder)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. COMMISSION & EARNINGS CARD */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-orange-950/40 border border-orange-500/30 rounded-3xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-semibold text-neutral-200 uppercase tracking-wide">
                Minha Carteira de Comissões
              </span>
            </div>
            <span className="text-[10px] font-semibold bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-md border border-orange-500/40">
              Taxa: {commissionRate}%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="bg-neutral-950/80 p-2.5 rounded-2xl border border-neutral-800/80">
              <span className="text-[10px] text-neutral-400 block">Atendimentos</span>
              <span className="text-base font-bold text-neutral-100">{myAppointments.length}</span>
            </div>

            <div className="bg-neutral-950/80 p-2.5 rounded-2xl border border-neutral-800/80">
              <span className="text-[10px] text-neutral-400 block">Faturamento</span>
              <span className="text-xs font-semibold text-neutral-300 font-mono mt-0.5 block">
                R$ {myGross.toFixed(2).replace('.', ',')}
              </span>
            </div>

            <div className="bg-neutral-950/80 p-2.5 rounded-2xl border border-orange-500/40">
              <span className="text-[10px] text-orange-400 font-semibold block">A Receber</span>
              <span className="text-xs font-bold text-emerald-400 font-mono mt-0.5 block">
                R$ {myNetCommission.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. AGENDA DE ATENDIMENTOS TIMELINE */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-neutral-100">
                Agenda de Clientes ({displayedAppointments.length})
              </h3>
            </div>

            {/* Filter if leader */}
            {canViewAll && (
              <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl px-2 py-1 text-[11px]">
                <Eye className="w-3 h-3 text-orange-400" />
                <select
                  value={filterBarberId}
                  onChange={e => setFilterBarberId(e.target.value)}
                  className="bg-transparent text-neutral-200 font-bold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-neutral-900">Todos os Barbeiros</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id} className="bg-neutral-900">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {displayedAppointments.length === 0 ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center text-xs text-neutral-400">
              Nenhum agendamento para esta seleção.
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedAppointments.map(apt => {
                const isMine = apt.professionalId === activeProf.id;
                const myCommValue = isMine ? (apt.servicePrice * commissionRate) / 100 : 0;

                return (
                  <div
                    key={apt.id}
                    className={`bg-neutral-900 border rounded-2xl p-3.5 space-y-2.5 transition-all shadow-md ${
                      apt.isEncaixe
                        ? 'border-purple-500/50 bg-gradient-to-r from-purple-950/20 via-neutral-900 to-neutral-900'
                        : 'border-neutral-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-orange-400 text-xs font-mono">
                            {apt.startTime} - {apt.endTime}
                          </span>
                          {apt.isEncaixe ? (
                            <span className="text-[9px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded">
                              ENCAIXE (SEÇÃO 14)
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">
                              {apt.status}
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-neutral-100 text-xs mt-1">{apt.serviceName}</h4>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-400 font-mono block">
                          R$ {apt.servicePrice.toFixed(2).replace('.', ',')}
                        </span>
                        {isMine && (
                          <span className="text-[10px] text-orange-400 font-bold font-mono">
                            Comissão: R$ {myCommValue.toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Client info and direct WhatsApp action */}
                    <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/80 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-neutral-200">{apt.clientName}</span>
                        <div className="text-[10px] text-neutral-500 font-mono">{apt.clientWhatsApp}</div>
                      </div>

                      <a
                        href={`https://wa.me/55${apt.clientWhatsApp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-lg text-[10px] font-bold active:scale-95 transition-all"
                      >
                        <Phone className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4. MODAL DE ENCAIXE (SEÇÃO 14) */}
        {/* ========================================================================= */}
        {showEncaixeModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-5 text-neutral-100 shadow-2xl animate-fade-in">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center mb-2">
                <Zap className="w-5 h-5" />
              </div>

              <h3 className="text-base font-black font-heading">Criar Encaixe de Atendimento</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5 mb-3">
                Atenda um cliente fora da grade normal de horários (Seção 14).
              </p>

              <form onSubmit={handleCreateEncaixe} className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Nome do Cliente</label>
                  <input
                    type="text"
                    required
                    value={encaixeClientName}
                    onChange={e => setEncaixeClientName(e.target.value)}
                    placeholder="Ex: Rafael Viana"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">WhatsApp do Cliente</label>
                  <input
                    type="text"
                    required
                    value={encaixeClientPhone}
                    onChange={e => setEncaixeClientPhone(e.target.value)}
                    placeholder="(11) 97777-6666"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Serviço</label>
                    <select
                      value={encaixeServiceId}
                      onChange={e => setEncaixeServiceId(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                    >
                      {services.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} - R$ {s.price.toFixed(2).replace('.', ',')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Horário Encaixe</label>
                    <input
                      type="time"
                      required
                      value={encaixeTime}
                      onChange={e => setEncaixeTime(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                    >
                    </input>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Motivo / Observação</label>
                  <input
                    type="text"
                    value={encaixeNotes}
                    onChange={e => setEncaixeNotes(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEncaixeModal(false)}
                    className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-xl text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-orange-500 text-neutral-950 rounded-xl text-xs font-black"
                  >
                    Confirmar Encaixe
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );

  if (isImpersonating) {
    return (
      <PhoneFrame
        title="App do Barbeiro Profissional"
        subtitle="Agenda & Comissões no Celular (Master Admin)"
        barbershopName={currentBarbershop.name}
      >
        {profBody}
      </PhoneFrame>
    );
  }

  return (
    <div className="w-full min-h-screen bg-neutral-950 text-neutral-100 p-3 sm:p-6 flex flex-col items-center">
      {profBody}
    </div>
  );
};
