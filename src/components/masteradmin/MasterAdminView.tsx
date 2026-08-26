import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Crown,
  Building2,
  Users,
  Scissors,
  Calendar,
  ShieldAlert,
  Eye,
  Plus,
  Shield,
  CreditCard,
  DollarSign,
  Check,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { MY_BARBER_PLANS } from '../../types';
import { MasterAdminBarbershops } from './MasterAdminBarbershops';
import { MasterAdminUsers } from './MasterAdminUsers';
import { MasterAdminServicesAppointments } from './MasterAdminServicesAppointments';
import { MasterAdminAuditLogs } from './MasterAdminAuditLogs';
import { MasterAdminImpersonate } from './MasterAdminImpersonate';
import { MasterAdminSubscriptions } from './MasterAdminSubscriptions';

export type MasterAdminTab = 'overview' | 'subscriptions' | 'barbershops' | 'users' | 'services_appointments' | 'audit' | 'impersonate';

export const MasterAdminView: React.FC = () => {
  const {
    barbershops,
    users,
    allServices,
    allAppointments,
    auditLogs
  } = useApp();

  const [activeTab, setActiveTab] = useState<MasterAdminTab>('overview');
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Total MRR calculation
  const totalMRR = barbershops.reduce((sum, b) => {
    const plan = MY_BARBER_PLANS[b.planId] || Object.values(MY_BARBER_PLANS)[0];
    return sum + (plan ? plan.priceMonthly : 49.90);
  }, 0);

  const totalProfessionalsCount = users.filter(u => u.role === 'PROFISSIONAL' || u.role === 'PROPRIETARIO').length;
  const totalClientsCount = users.filter(u => u.role === 'CLIENTE').length;
  const activeShopsCount = barbershops.filter(b => b.status !== 'INACTIVE').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notifications */}
      {successToast && (
        <div className="fixed top-16 right-4 z-50 bg-emerald-950 border border-emerald-500 text-emerald-200 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs font-bold">{successToast}</div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-400 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorToast && (
        <div className="fixed top-16 right-4 z-50 bg-red-950 border border-red-500 text-red-200 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="text-xs font-bold">{errorToast}</div>
          <button onClick={() => setErrorToast(null)} className="text-red-400 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-orange-950/40 border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-extrabold mb-3">
              <Crown className="w-3.5 h-3.5" />
              <span>PAINEL CARLOS SILVA (PROPRIETÁRIO DA PLATAFORMA)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-100 font-heading leading-tight">
              Gestão Global do Ecossistema My Barber
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-2xl mt-1.5 leading-relaxed">
              Você está no Painel Carlos Silva do My Barber com visão e controle integral sobre todas as barbearias parceiras, planos, usuários, serviços, agendamentos e trilhas de auditoria.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={() => setShowRegisterModal(true)}
              className="px-5 py-3 bg-orange-500 hover:bg-orange-400 text-neutral-950 font-black rounded-2xl text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
              <span>Cadastrar Nova Barbearia</span>
            </button>
          </div>
        </div>

        {/* Global Key Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-neutral-800/80">
          <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
              <span>Barbearias Parceiras</span>
              <Building2 className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-2xl font-black text-neutral-100">
              {barbershops.length}
              <span className="text-xs text-neutral-500 font-normal ml-1">({activeShopsCount} ativas)</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold mt-1 block">Todas integradas em nuvem</span>
          </div>

          <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
              <span>Receita Recorrente (MRR)</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              R$ {totalMRR.toFixed(2).replace('.', ',')}
            </div>
            <span className="text-[10px] text-neutral-400 mt-1 block">Assinaturas mensais</span>
          </div>

          <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
              <span>Profissionais Atendidos</span>
              <Scissors className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-neutral-100">{totalProfessionalsCount}</div>
            <span className="text-[10px] text-neutral-400 mt-1 block">Barbeiros e líderes</span>
          </div>

          <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
              <span>Agendamentos Globais</span>
              <Calendar className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-neutral-100">{allAppointments.length}</div>
            <span className="text-[10px] text-neutral-400 mt-1 block">Histórico consolidado</span>
          </div>
        </div>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-neutral-800">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-orange-500 text-neutral-950 shadow-md shadow-orange-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Visão Geral & Barbearias</span>
        </button>

        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'subscriptions'
              ? 'bg-orange-500 text-neutral-950 shadow-md shadow-orange-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Assinaturas & MRR</span>
        </button>

        <button
          onClick={() => setActiveTab('barbershops')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'barbershops'
              ? 'bg-orange-500 text-neutral-950 shadow-md shadow-orange-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Todas Barbearias ({barbershops.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'users'
              ? 'bg-orange-500 text-neutral-950 shadow-md shadow-orange-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Usuários & Permissões ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('services_appointments')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'services_appointments'
              ? 'bg-orange-500 text-neutral-950 shadow-md shadow-orange-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>Serviços & Agendamentos</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-orange-500 text-neutral-950 shadow-md shadow-orange-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Auditoria ({auditLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('impersonate')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'impersonate'
              ? 'bg-orange-500 text-neutral-950 shadow-md shadow-orange-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Visualizar como Usuário</span>
        </button>
      </div>

      {/* Tab Content Display */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Plans Table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-orange-400" />
                <h3 className="font-black text-neutral-100 text-base font-heading">
                  Tabela Oficial de Planos SaaS do MY BARBER
                </h3>
              </div>
              <span className="text-xs text-neutral-400">Modelo de cobrança recorrente</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.values(MY_BARBER_PLANS).map(plan => {
                const countInPlan = barbershops.filter(b => b.planId === plan.id).length;
                return (
                  <div
                    key={plan.id}
                    className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-orange-400 uppercase tracking-wider">{plan.name}</span>
                        <span className="text-[10px] bg-neutral-900 border border-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full font-bold">
                          {countInPlan} {countInPlan === 1 ? 'barbearia' : 'barbearias'}
                        </span>
                      </div>
                      <div className="text-2xl font-black text-neutral-100 font-mono">
                        R$ {plan.priceMonthly.toFixed(2).replace('.', ',')}
                        <span className="text-xs font-normal text-neutral-500 font-sans"> / mês</span>
                      </div>
                      <p className="text-xs text-neutral-400 mt-2">{plan.description}</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-neutral-800/80 text-xs text-neutral-400 flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Capacidade: {plan.minProfessionals} até {plan.maxProfessionals} profissionais</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Impersonation shortcut teaser */}
          <MasterAdminImpersonate />

          {/* Barbershops list */}
          <MasterAdminBarbershops
            showRegisterModal={showRegisterModal}
            setShowRegisterModal={setShowRegisterModal}
          />
        </div>
      )}

      {activeTab === 'subscriptions' && (
        <MasterAdminSubscriptions />
      )}

      {activeTab === 'barbershops' && (
        <MasterAdminBarbershops
          showRegisterModal={showRegisterModal}
          setShowRegisterModal={setShowRegisterModal}
        />
      )}

      {activeTab === 'users' && (
        <MasterAdminUsers />
      )}

      {activeTab === 'services_appointments' && (
        <MasterAdminServicesAppointments />
      )}

      {activeTab === 'audit' && (
        <MasterAdminAuditLogs />
      )}

      {activeTab === 'impersonate' && (
        <MasterAdminImpersonate />
      )}
    </div>
  );
};
