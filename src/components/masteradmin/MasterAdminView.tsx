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
  AlertCircle,
  Layers,
  ArrowRight,
  Sparkles,
  Tag,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { MY_BARBER_PLANS, CustomPlan } from '../../types';
import { exportClientsData, exportBarbershopsData } from '../../utils/exportData';
import { MasterAdminBarbershops } from './MasterAdminBarbershops';
import { MasterAdminUsers } from './MasterAdminUsers';
import { MasterAdminServicesAppointments } from './MasterAdminServicesAppointments';
import { MasterAdminAuditLogs } from './MasterAdminAuditLogs';
import { MasterAdminImpersonate } from './MasterAdminImpersonate';
import { MasterAdminSubscriptions } from './MasterAdminSubscriptions';
import { MasterAdminPlansBuilder } from './MasterAdminPlansBuilder';
import { AdminBackButton } from '../common/AdminBackButton';

export type MasterAdminTab = 'overview' | 'plans' | 'subscriptions' | 'barbershops' | 'users' | 'services_appointments' | 'audit' | 'impersonate';

export const MasterAdminView: React.FC = () => {
  const {
    barbershops,
    users,
    allServices,
    allAppointments,
    auditLogs,
    customPlans,
    getBarbershopDirectUrl
  } = useApp();

  const [activeTab, setActiveTab] = useState<MasterAdminTab>('overview');
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleExportClients = () => {
    try {
      setIsExporting(true);
      exportClientsData({
        users,
        barbershops,
        allAppointments
      });
      setSuccessToast(`Planilha de clientes exportada com sucesso! (${users.filter(u => u.role === 'CLIENTE').length} clientes mapeados)`);
    } catch (err: any) {
      setErrorToast(`Falha ao exportar dados dos clientes: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportBarbershops = () => {
    try {
      setIsExporting(true);
      exportBarbershopsData({
        barbershops,
        users,
        allServices,
        allAppointments,
        customPlans,
        getBarbershopDirectUrl
      });
      setSuccessToast(`Planilha de barbearias exportada com sucesso! (${barbershops.length} barbearias mapeadas)`);
    } catch (err: any) {
      setErrorToast(`Falha ao exportar dados das barbearias: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Active custom plans or fallback
  const activeSaaSPlans = customPlans && customPlans.length > 0
    ? customPlans.filter(p => p.status === 'ACTIVE')
    : [];

  // Total MRR calculation using dynamic plans
  const totalMRR = barbershops.reduce((sum, b) => {
    const customPlan = customPlans?.find(p => p.id === b.planId);
    const planPrice = customPlan ? customPlan.priceMonthly : (MY_BARBER_PLANS[b.planId]?.priceMonthly || 49.90);
    return sum + planPrice;
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
            {/* Botão de Exportar Clientes */}
            <button
              onClick={handleExportClients}
              disabled={isExporting}
              title="Baixar planilha de todos os clientes cadastrados em todas as barbearias"
              className="px-4 py-3 bg-neutral-950 hover:bg-neutral-800 text-orange-400 hover:text-orange-300 font-black rounded-2xl text-xs sm:text-sm flex items-center gap-2 border border-orange-500/30 hover:border-orange-500/60 shadow-lg active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 text-orange-400" />
              <span>Baixar Dados dos Clientes</span>
            </button>

            {/* Botão de Exportar Barbearias */}
            <button
              onClick={handleExportBarbershops}
              disabled={isExporting}
              title="Baixar planilha com todas as barbearias parceiras e status de assinatura"
              className="px-4 py-3 bg-neutral-950 hover:bg-neutral-800 text-orange-400 hover:text-orange-300 font-black rounded-2xl text-xs sm:text-sm flex items-center gap-2 border border-orange-500/30 hover:border-orange-500/60 shadow-lg active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-orange-400" />
              <span>Baixar Dados das Barbearias</span>
            </button>

            {/* Cadastrar Nova Barbearia */}
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

      {/* Main Layout Grid: Sidebar vertical no Desktop (lg:) e Tabs horizontais no Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SIDEBAR LATERAL ESQUERDA NO DESKTOP / BARRA ROLÁVEL NO MOBILE */}
        <aside className="lg:col-span-3 xl:col-span-3 shrink-0">
          {/* Mobile/Tablet: Barra de rolagem horizontal compacta (oculta em lg:) */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-800 pb-2.5 mb-4">
              {activeTab !== 'overview' && (
                <div className="shrink-0">
                  <AdminBackButton
                    onClick={() => setActiveTab('overview')}
                    contextLabel="para Visão Geral"
                  />
                </div>
              )}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-1">
                {[
                  { id: 'overview', label: 'Visão Geral & Barbearias', icon: Building2 },
                  { id: 'plans', label: 'Planos & Ofertas SaaS', icon: Layers },
                  { id: 'subscriptions', label: 'Assinaturas & MRR', icon: CreditCard },
                  { id: 'barbershops', label: `Todas Barbearias (${barbershops.length})`, icon: Building2 },
                  { id: 'users', label: `Usuários & Permissões (${users.length})`, icon: Users },
                  { id: 'services_appointments', label: 'Serviços & Agendamentos', icon: Scissors },
                  { id: 'audit', label: `Auditoria (${auditLogs.length})`, icon: ShieldAlert },
                  { id: 'impersonate', label: 'Visualizar como Usuário', icon: Eye }
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-orange-500 text-neutral-950 shadow-md shadow-orange-500/20'
                          : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Desktop: Sidebar vertical fixa com efeito sticky */}
          <div className="hidden lg:flex flex-col bg-neutral-900/90 border border-neutral-800 rounded-3xl p-3.5 shadow-xl backdrop-blur-sm sticky top-6 space-y-1">
            <div className="px-3 py-2 mb-1 flex items-center justify-between border-b border-neutral-800/80 pb-3">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                Menu Master
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400">
                Super Admin
              </span>
            </div>

            {[
              { id: 'overview', label: 'Visão Geral & Barbearias', icon: Building2 },
              { id: 'plans', label: 'Planos & Ofertas SaaS', icon: Layers },
              { id: 'subscriptions', label: 'Assinaturas & MRR', icon: CreditCard },
              { id: 'barbershops', label: 'Todas Barbearias', count: barbershops.length, icon: Building2 },
              { id: 'users', label: 'Usuários & Permissões', count: users.length, icon: Users },
              { id: 'services_appointments', label: 'Serviços & Agendamentos', icon: Scissors },
              { id: 'audit', label: 'Auditoria Global', count: auditLogs.length, icon: ShieldAlert },
              { id: 'impersonate', label: 'Visualizar como Usuário', icon: Eye }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all group text-left cursor-pointer ${
                    isActive
                      ? 'bg-orange-500 text-neutral-950 font-black shadow-lg shadow-orange-500/20'
                      : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                        isActive ? 'text-neutral-950' : 'text-neutral-500 group-hover:text-neutral-300'
                      }`}
                    />
                    <span className="truncate">{tab.label}</span>
                  </div>

                  {tab.count !== undefined && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ml-2 shrink-0 ${
                        isActive
                          ? 'bg-neutral-950 text-orange-400 shadow-sm'
                          : 'bg-neutral-950 text-neutral-400 border border-neutral-800 group-hover:border-neutral-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Quick Export Hub Card in Desktop Sidebar */}
            <div className="mt-4 pt-3 border-t border-neutral-800/80 px-2 space-y-2">
              <span className="text-[10px] font-black text-neutral-500 uppercase tracking-wider block">
                Exportação de Dados
              </span>
              <button
                onClick={handleExportClients}
                disabled={isExporting}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-bold text-neutral-300 hover:text-orange-400 bg-neutral-950/70 hover:bg-neutral-800 border border-neutral-800 transition-all cursor-pointer disabled:opacity-50"
                title="Download da planilha de clientes de todas as barbearias"
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="truncate">Baixar Clientes</span>
                </div>
                <Download className="w-3 h-3 text-neutral-500 shrink-0" />
              </button>

              <button
                onClick={handleExportBarbershops}
                disabled={isExporting}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-bold text-neutral-300 hover:text-orange-400 bg-neutral-950/70 hover:bg-neutral-800 border border-neutral-800 transition-all cursor-pointer disabled:opacity-50"
                title="Download da planilha de barbearias cadastradas"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="truncate">Baixar Barbearias</span>
                </div>
                <Download className="w-3 h-3 text-neutral-500 shrink-0" />
              </button>
            </div>
          </div>
        </aside>

        {/* ÁREA PRINCIPAL DE CONTEÚDO (COLUNA DIREITA NO DESKTOP) */}
        <main className="lg:col-span-9 xl:col-span-9 min-w-0 space-y-6">

      {/* Tab Content Display */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Plans Table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-orange-400" />
                <h3 className="font-black text-neutral-100 text-base font-heading">
                  Tabela Oficial de Planos SaaS do MY BARBER
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-400 hidden sm:inline">Modelo de cobrança recorrente</span>
                <button
                  onClick={() => setActiveTab('plans')}
                  className="text-xs font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30"
                >
                  <span>Gerenciar Planos & Ofertas</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(activeSaaSPlans.length > 0 ? activeSaaSPlans : Object.values(MY_BARBER_PLANS)).map(plan => {
                const countInPlan = barbershops.filter(b => b.planId === plan.id).length;
                const isCustom = 'limits' in plan;
                const maxProfs = isCustom
                  ? ((plan as CustomPlan).limits.maxProfessionals === 'UNLIMITED' ? 'Ilimitados' : `Até ${(plan as CustomPlan).limits.maxProfessionals}`)
                  : `${(plan as any).minProfessionals} até ${(plan as any).maxProfessionals}`;
                const hasPromo = isCustom && (plan as CustomPlan).hasPromotion && (plan as CustomPlan).promotionalPrice !== undefined;
                const hasTrial = isCustom && (plan as CustomPlan).hasTrial;

                return (
                  <div
                    key={plan.id}
                    className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 flex flex-col justify-between transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="text-xs font-black text-orange-400 uppercase tracking-wider truncate" title={plan.name}>
                          {plan.name}
                        </span>
                        <span className="text-[10px] bg-neutral-900 border border-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full font-bold shrink-0">
                          {countInPlan} {countInPlan === 1 ? 'barbearia' : 'barbearias'}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-neutral-100 font-mono">
                          R$ {plan.priceMonthly.toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-xs font-normal text-neutral-500 font-sans">
                          /{isCustom && (plan as CustomPlan).billingCycle !== 'MONTHLY' ? 'ciclo' : 'mês'}
                        </span>
                        {hasPromo && (
                          <span className="text-xs text-neutral-400 line-through ml-1">
                            R$ {(plan as CustomPlan).priceAfterPromotion?.toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </div>

                      {/* Promo or Trial tags */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {hasPromo && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            Promoção: R$ {(plan as CustomPlan).promotionalPrice?.toFixed(2).replace('.', ',')} ({(plan as CustomPlan).promotionDuration} {(plan as CustomPlan).promotionUnit === 'MONTHS' ? 'meses' : 'ciclos'})
                          </span>
                        )}
                        {hasTrial && (
                          <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            {(plan as CustomPlan).trialDuration} {(plan as CustomPlan).trialUnit === 'DAYS' ? 'dias grátis' : 'meses grátis'}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-neutral-400 mt-2.5 line-clamp-2 leading-relaxed">{plan.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-neutral-800/80 text-xs text-neutral-400 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Capacidade: <strong className="text-neutral-200">{maxProfs}</strong> profissionais</span>
                      </div>
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

      {activeTab === 'plans' && (
        <MasterAdminPlansBuilder />
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
        </main>
      </div>
    </div>
  );
};
