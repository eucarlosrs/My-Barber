import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { CustomPlan, PlanBillingScheduleStage, PlanBillingCycle, PlanLimits } from '../../types';
import {
  Layers,
  Plus,
  Edit,
  Copy,
  Power,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
  Gift,
  Tag,
  Users,
  ShieldCheck,
  Zap,
  TrendingUp,
  Search,
  Check,
  X,
  Sparkles,
  ArrowRight,
  Info,
  Clock,
  Building,
  Scissors
} from 'lucide-react';
import { SaveButton } from '../common/SaveButton';
import { UnsavedChangesModal } from '../common/UnsavedChangesModal';

export const MasterAdminPlansBuilder: React.FC = () => {
  const {
    customPlans,
    createCustomPlan,
    updateCustomPlan,
    togglePlanStatus,
    duplicateCustomPlan,
    subscriptions,
    barbershops
  } = useApp();

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [cycleFilter, setCycleFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CustomPlan | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [modalFeedback, setModalFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Subscribed Barbershops Modal
  const [selectedPlanForSubscribers, setSelectedPlanForSubscribers] = useState<CustomPlan | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    status: 'ACTIVE' | 'INACTIVE';
    priceMonthly: number;
    billingCycle: PlanBillingCycle;
    hasTrial: boolean;
    trialDuration: number;
    trialUnit: 'DAYS' | 'MONTHS';
    hasPromotion: boolean;
    promotionalPrice: number;
    promotionDuration: number;
    promotionUnit: 'MONTHS' | 'CYCLES';
    priceAfterPromotion: number;
    features: {
      agenda: boolean;
      clientes: boolean;
      profissionais: boolean;
      servicos: boolean;
      pacotes: boolean;
      comunicacoes: boolean;
      promocoes: boolean;
      sorteios: boolean;
      galeria: boolean;
      estoque: boolean;
      relatorios_financeiros: boolean;
    };
    limits: PlanLimits;
  }>({
    name: '',
    description: '',
    status: 'ACTIVE',
    priceMonthly: 49.90,
    billingCycle: 'MONTHLY',
    hasTrial: true,
    trialDuration: 14,
    trialUnit: 'DAYS',
    hasPromotion: false,
    promotionalPrice: 49.90,
    promotionDuration: 3,
    promotionUnit: 'MONTHS',
    priceAfterPromotion: 69.90,
    features: {
      agenda: true,
      clientes: true,
      profissionais: true,
      servicos: true,
      pacotes: true,
      comunicacoes: true,
      promocoes: true,
      sorteios: true,
      galeria: true,
      estoque: true,
      relatorios_financeiros: true
    },
    limits: {
      maxProfessionals: 10,
      maxUnits: 1,
      maxClients: 'UNLIMITED'
    }
  });

  const isDirty = useMemo(() => {
    if (!isModalOpen || !initialFormData) return false;
    return JSON.stringify(formData) !== JSON.stringify(initialFormData);
  }, [isModalOpen, formData, initialFormData]);

  // Calculate Real-time Schedule Stages for Preview
  const computedScheduleStages = useMemo<PlanBillingScheduleStage[]>(() => {
    const stages: PlanBillingScheduleStage[] = [];
    let order = 1;

    if (formData.hasTrial && formData.trialDuration > 0) {
      stages.push({
        id: `preview-trial-${order}`,
        order: order++,
        name: 'Período Gratuito de Degustação',
        duration: formData.trialDuration,
        unit: formData.trialUnit,
        price: 0.00
      });
    }

    if (formData.hasPromotion && formData.promotionDuration > 0 && formData.promotionalPrice !== undefined) {
      stages.push({
        id: `preview-promo-${order}`,
        order: order++,
        name: 'Promoção de Entrada / Lançamento',
        duration: formData.promotionDuration,
        unit: formData.promotionUnit === 'CYCLES' ? 'MONTHS' : formData.promotionUnit,
        price: Number(formData.promotionalPrice)
      });
    }

    stages.push({
      id: `preview-regular-${order}`,
      order: order++,
      name: 'Preço Normal Recorrente',
      duration: 0,
      unit: 'INDEFINITE',
      price: Number(formData.hasPromotion ? formData.priceAfterPromotion : formData.priceMonthly)
    });

    return stages;
  }, [formData]);

  // Open modal to create
  const handleOpenCreateModal = () => {
    setEditingPlan(null);
    const initialData = {
      name: '',
      description: 'Plano com gestão completa, agendamentos ilimitados e suporte.',
      status: 'ACTIVE' as const,
      priceMonthly: 49.90,
      billingCycle: 'MONTHLY' as const,
      hasTrial: true,
      trialDuration: 14,
      trialUnit: 'DAYS' as const,
      hasPromotion: false,
      promotionalPrice: 49.90,
      promotionDuration: 3,
      promotionUnit: 'MONTHS' as const,
      priceAfterPromotion: 69.90,
      features: {
        agenda: true,
        clientes: true,
        profissionais: true,
        servicos: true,
        pacotes: true,
        comunicacoes: true,
        promocoes: true,
        sorteios: true,
        galeria: true,
        estoque: true,
        relatorios_financeiros: true
      },
      limits: {
        maxProfessionals: 10,
        maxUnits: 1,
        maxClients: 'UNLIMITED' as const
      }
    };
    setFormData(initialData);
    setInitialFormData(initialData);
    setIsSaved(false);
    setModalFeedback(null);
    setIsModalOpen(true);
  };

  // Open modal to edit
  const handleOpenEditModal = (plan: CustomPlan) => {
    setEditingPlan(plan);
    const editData = {
      name: plan.name,
      description: plan.description || '',
      status: plan.status,
      priceMonthly: plan.priceMonthly,
      billingCycle: plan.billingCycle,
      hasTrial: plan.hasTrial,
      trialDuration: plan.trialDuration || 14,
      trialUnit: plan.trialUnit || 'DAYS',
      hasPromotion: plan.hasPromotion,
      promotionalPrice: plan.promotionalPrice ?? plan.priceMonthly,
      promotionDuration: plan.promotionDuration || 3,
      promotionUnit: plan.promotionUnit || 'MONTHS',
      priceAfterPromotion: plan.priceAfterPromotion ?? plan.priceMonthly,
      features: {
        agenda: plan.features?.agenda ?? true,
        clientes: plan.features?.clientes ?? true,
        profissionais: plan.features?.profissionais ?? true,
        servicos: plan.features?.servicos ?? true,
        pacotes: plan.features?.pacotes ?? true,
        comunicacoes: plan.features?.comunicacoes ?? true,
        promocoes: plan.features?.promocoes ?? true,
        sorteios: plan.features?.sorteios ?? true,
        galeria: plan.features?.galeria ?? true,
        estoque: plan.features?.estoque ?? true,
        relatorios_financeiros: plan.features?.relatorios_financeiros ?? true
      },
      limits: {
        maxProfessionals: plan.limits?.maxProfessionals ?? 10,
        maxUnits: plan.limits?.maxUnits ?? 1,
        maxClients: plan.limits?.maxClients ?? 'UNLIMITED'
      }
    };
    setFormData(editData);
    setInitialFormData(editData);
    setIsSaved(false);
    setModalFeedback(null);
    setIsModalOpen(true);
  };

  // Save Plan (Create or Update)
  const handleSavePlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) {
      setModalFeedback({ type: 'error', message: 'O nome do plano é obrigatório.' });
      return;
    }

    if (formData.priceMonthly <= 0) {
      setModalFeedback({ type: 'error', message: 'O preço do plano deve ser maior que zero.' });
      return;
    }

    setIsSubmitting(true);
    setModalFeedback(null);

    try {
      if (editingPlan) {
        const result = await updateCustomPlan(editingPlan.id, formData);
        if (result.success) {
          setIsSaved(true);
          setModalFeedback({ type: 'success', message: 'Plano atualizado com sucesso!' });
          setTimeout(() => {
            setIsModalOpen(false);
            setInitialFormData(null);
            setIsSaved(false);
          }, 800);
        } else {
          setModalFeedback({ type: 'error', message: result.error || 'Erro ao atualizar o plano.' });
        }
      } else {
        const result = await createCustomPlan(formData);
        if (result.success) {
          setIsSaved(true);
          setModalFeedback({ type: 'success', message: 'Novo plano criado com sucesso e pronto para contratação!' });
          setTimeout(() => {
            setIsModalOpen(false);
            setInitialFormData(null);
            setIsSaved(false);
          }, 800);
        } else {
          setModalFeedback({ type: 'error', message: result.error || 'Erro ao criar o plano.' });
        }
      }
    } catch (err: any) {
      setModalFeedback({ type: 'error', message: err.message || 'Erro inesperado ao salvar plano.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    if (isDirty) {
      setShowUnsavedModal(true);
    } else {
      setIsModalOpen(false);
      setInitialFormData(null);
    }
  };

  // Duplicate plan
  const handleDuplicate = async (planId: string) => {
    const result = await duplicateCustomPlan(planId);
    if (!result.success) {
      alert(result.error || 'Erro ao duplicar plano');
    }
  };

  // Toggle status
  const handleToggleStatus = async (planId: string) => {
    const result = await togglePlanStatus(planId);
    if (!result.success) {
      alert(result.error || 'Erro ao alternar status do plano');
    }
  };

  // Filtered Plans
  const filteredPlans = useMemo(() => {
    return customPlans.filter(p => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const matchCycle = cycleFilter === 'ALL' || p.billingCycle === cycleFilter;
      return matchSearch && matchStatus && matchCycle;
    });
  }, [customPlans, searchTerm, statusFilter, cycleFilter]);

  // Overall Metrics
  const metrics = useMemo(() => {
    const totalPlans = customPlans.length;
    const activePlans = customPlans.filter(p => p.status === 'ACTIVE').length;
    const totalSubscribers = subscriptions.filter(s => s.status !== 'CANCELED').length;
    
    // Estimate MRR (Monthly Recurring Revenue)
    let estimatedMrr = 0;
    subscriptions.forEach(sub => {
      if (sub.status !== 'CANCELED') {
        const subPrice = sub.currentPrice || (sub.planId === 'PLANO_UNICO' ? 49.90 : 49.90);
        estimatedMrr += subPrice;
      }
    });

    return {
      totalPlans,
      activePlans,
      inactivePlans: totalPlans - activePlans,
      totalSubscribers,
      estimatedMrr
    };
  }, [customPlans, subscriptions]);

  // Format currency
  const formatMoney = (val?: number) => {
    if (val === undefined || isNaN(val)) return 'R$ 0,00';
    return `R$ ${val.toFixed(2).replace('.', ',')}`;
  };

  // Translate cycle
  const getCycleLabel = (cycle: PlanBillingCycle) => {
    switch (cycle) {
      case 'MONTHLY': return 'Mensal';
      case 'QUARTERLY': return 'Trimestral';
      case 'SEMIANNUAL': return 'Semestral';
      case 'ANNUAL': return 'Anual';
      default: return cycle;
    }
  };

  return (
    <div id="master-plans-builder" className="space-y-6">
      {/* Header with Title & Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1e293b]/60 border border-slate-800 p-6 rounded-2xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Planos & Ofertas SaaS
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium">
                  {metrics.totalPlans} {metrics.totalPlans === 1 ? 'plano' : 'planos'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Crie, configure e precifique planos de assinatura recorrente com cronogramas e integração Mercado Pago.
              </p>
            </div>
          </div>
        </div>

        <button
          id="btn-create-new-plan"
          onClick={handleOpenCreateModal}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Criar Novo Plano</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1e293b]/40 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Planos Ativos</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{metrics.activePlans}</p>
          <p className="text-xs text-slate-500 mt-1">de {metrics.totalPlans} planos cadastrados</p>
        </div>

        <div className="bg-[#1e293b]/40 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Barbearias Assinantes</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{metrics.totalSubscribers}</p>
          <p className="text-xs text-slate-500 mt-1">em todos os planos ativos</p>
        </div>

        <div className="bg-[#1e293b]/40 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">MRR Estimado</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">{formatMoney(metrics.estimatedMrr)}</p>
          <p className="text-xs text-slate-500 mt-1">receita recorrente mensal</p>
        </div>

        <div className="bg-[#1e293b]/40 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Integração MP</span>
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <p className="text-sm font-semibold text-white">Preapproval Ativo</p>
          </div>
          <p className="text-xs text-slate-500 mt-1">Cobrança e agendamento automático</p>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#1e293b]/30 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="input-search-plans"
            type="text"
            placeholder="Buscar por nome do plano..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {/* Status Filter */}
          <div className="flex items-center bg-slate-900/80 rounded-lg p-1 border border-slate-700/80 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-md transition-colors ${statusFilter === 'ALL' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1 rounded-md transition-colors ${statusFilter === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              Ativos
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1 rounded-md transition-colors ${statusFilter === 'INACTIVE' ? 'bg-slate-700 text-slate-200 font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              Inativos
            </button>
          </div>

          {/* Cycle Filter */}
          <select
            value={cycleFilter}
            onChange={e => setCycleFilter(e.target.value)}
            aria-label="Filtrar por periodicidade do plano"
            className="bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500/60"
          >
            <option value="ALL">Todas Periodicidades</option>
            <option value="MONTHLY">Mensal</option>
            <option value="QUARTERLY">Trimestral</option>
            <option value="SEMIANNUAL">Semestral</option>
            <option value="ANNUAL">Anual</option>
          </select>
        </div>
      </div>

      {/* Plans List Grid */}
      {filteredPlans.length === 0 ? (
        <div className="bg-[#1e293b]/20 border border-slate-800/80 rounded-2xl p-12 text-center">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">Nenhum plano encontrado</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {searchTerm || statusFilter !== 'ALL' || cycleFilter !== 'ALL'
              ? 'Nenhum plano corresponde aos filtros aplicados. Tente ajustar sua busca.'
              : 'Clique em "Criar Novo Plano" para começar a cadastrar ofertas e planos para as barbearias.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredPlans.map(plan => {
            const isPlanActive = plan.status === 'ACTIVE';

            // Calculate linked subscribers
            let subscribersCount = 0;
            subscriptions.forEach(sub => {
              if (sub.status !== 'CANCELED') {
                if (sub.planId === plan.id || (plan.id === 'PLANO_UNICO' && (!sub.planId || sub.plan === 'Plano MY BARBER' || sub.plan === 'Plano Único & Fixo'))) {
                  subscribersCount++;
                }
              }
            });

            return (
              <div
                key={plan.id}
                id={`plan-card-${plan.id}`}
                className={`bg-[#1e293b]/50 border transition-all rounded-2xl p-6 flex flex-col justify-between ${
                  isPlanActive
                    ? 'border-slate-800 hover:border-amber-500/40 hover:shadow-xl hover:shadow-amber-500/5'
                    : 'border-slate-800/50 opacity-75'
                }`}
              >
                <div>
                  {/* Top Bar: Badges & Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                          isPlanActive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-700/50 text-slate-400 border border-slate-600/40'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isPlanActive ? 'bg-emerald-400' : 'bg-slate-400'}`}></span>
                        {isPlanActive ? 'Ativo' : 'Inativo / Pausado'}
                      </span>

                      <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                        {getCycleLabel(plan.billingCycle)}
                      </span>

                      {plan.hasTrial && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-medium flex items-center gap-1">
                          <Gift className="w-3 h-3" />
                          {plan.trialDuration} {plan.trialUnit === 'DAYS' ? 'dias grátis' : 'meses grátis'}
                        </span>
                      )}

                      {plan.hasPromotion && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          Promoção Inicial
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleToggleStatus(plan.id)}
                      title={isPlanActive ? 'Pausar/Inativar Plano' : 'Ativar Plano'}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        isPlanActive
                          ? 'border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/30'
                          : 'border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Plan Name & Description */}
                  <div className="mt-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      {plan.name}
                      {plan.id === 'PLANO_UNICO' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Padrão do Sistema
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {plan.description || 'Plano com gestão completa para barbearias.'}
                    </p>
                  </div>

                  {/* Pricing Overview */}
                  <div className="mt-5 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-white">
                        {plan.hasPromotion && plan.promotionalPrice !== undefined
                          ? formatMoney(plan.promotionalPrice)
                          : formatMoney(plan.priceMonthly)}
                      </span>
                      <span className="text-xs text-slate-400">
                        /{plan.billingCycle === 'MONTHLY' ? 'mês' : getCycleLabel(plan.billingCycle).toLowerCase()}
                      </span>

                      {plan.hasPromotion && (
                        <span className="text-xs text-slate-500 line-through ml-2">
                          {formatMoney(plan.priceAfterPromotion || plan.priceMonthly)}
                        </span>
                      )}
                    </div>

                    {/* Schedule Stages Visualizer */}
                    {plan.scheduleStages && plan.scheduleStages.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80">
                        <p className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-amber-400" />
                          Cronograma de Cobrança:
                        </p>
                        <div className="space-y-1.5">
                          {plan.scheduleStages.map((stg, idx) => (
                            <div key={stg.id || idx} className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                              <span className="text-slate-300 flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-300 text-[10px] flex items-center justify-center font-bold">
                                  {stg.order || idx + 1}
                                </span>
                                {stg.name}
                                {stg.duration > 0 && (
                                  <span className="text-[10px] text-slate-400">
                                    ({stg.duration} {stg.unit === 'DAYS' ? 'dias' : 'meses'})
                                  </span>
                                )}
                              </span>
                              <span className={`font-semibold ${stg.price === 0 ? 'text-emerald-400' : 'text-white'}`}>
                                {stg.price === 0 ? 'Grátis' : formatMoney(stg.price)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Limits and Capabilities summary */}
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/60">
                      <p className="text-[10px] text-slate-400">Profissionais</p>
                      <p className="font-semibold text-slate-200 mt-0.5">
                        {plan.limits?.maxProfessionals ? `Até ${plan.limits.maxProfessionals}` : 'Ilimitado'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/60">
                      <p className="text-[10px] text-slate-400">Unidades</p>
                      <p className="font-semibold text-slate-200 mt-0.5">
                        {plan.limits?.maxUnits ? `${plan.limits.maxUnits} Unid.` : '1 Unidade'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/60">
                      <p className="text-[10px] text-slate-400">Clientes</p>
                      <p className="font-semibold text-slate-200 mt-0.5">
                        {plan.limits?.maxClients === 'UNLIMITED' ? 'Ilimitados' : plan.limits?.maxClients || 'Ilimitados'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSelectedPlanForSubscribers(plan)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors py-1.5 px-2 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{subscribersCount} {subscribersCount === 1 ? 'assinante' : 'assinantes'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDuplicate(plan.id)}
                      title="Duplicar Plano"
                      className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Duplicar</span>
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(plan)}
                      title="Editar Plano"
                      className="p-2 text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Edit Plan */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl w-full max-w-3xl my-8 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingPlan ? `Editar Plano: ${editingPlan.name}` : 'Criar Novo Plano SaaS'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Defina periodicidade, períodos de degustação, preços promocionais e ferramentas liberadas.
                  </p>
                </div>
              </div>

              <button
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSavePlan} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Feedback Message */}
              {modalFeedback && (
                <div
                  className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs ${
                    modalFeedback.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {modalFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{modalFeedback.message}</span>
                </div>
              )}

              {/* Section 1: Basic Information */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  1. Informações Básicas
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Nome do Plano <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Plano Profissional Pro, Plano Prime..."
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Status do Plano
                    </label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                    >
                      <option value="ACTIVE">Ativo (Disponível)</option>
                      <option value="INACTIVE">Inativo (Oculto)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Descrição do Plano
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Descreva as vantagens principais e o público indicado para este plano..."
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              </div>

              {/* Section 2: Pricing & Billing Cycle */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  2. Preço Regular & Periodicidade
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Periodicidade de Cobrança
                    </label>
                    <select
                      value={formData.billingCycle}
                      onChange={e => setFormData({ ...formData, billingCycle: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                    >
                      <option value="MONTHLY">Mensal (Cobrado todo mês)</option>
                      <option value="QUARTERLY">Trimestral (A cada 3 meses)</option>
                      <option value="SEMIANNUAL">Semestral (A cada 6 meses)</option>
                      <option value="ANNUAL">Anual (A cada 12 meses)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Preço Regular Base (R$) <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={formData.priceMonthly}
                        onChange={e => setFormData({ ...formData, priceMonthly: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Free Trial Period */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5" />
                    3. Período Gratuito (Trial de Degustação)
                  </h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-slate-400">Oferecer teste grátis?</span>
                    <input
                      type="checkbox"
                      checked={formData.hasTrial}
                      onChange={e => setFormData({ ...formData, hasTrial: e.target.checked })}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-slate-900 border-slate-700"
                    />
                  </label>
                </div>

                {formData.hasTrial && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Duração do Teste Grátis
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.trialDuration}
                        onChange={e => setFormData({ ...formData, trialDuration: parseInt(e.target.value) || 14 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Unidade de Tempo
                      </label>
                      <select
                        value={formData.trialUnit}
                        onChange={e => setFormData({ ...formData, trialUnit: e.target.value as any })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                      >
                        <option value="DAYS">Dias Corridos (Recomendado: 14 dias)</option>
                        <option value="MONTHS">Meses</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Promotional Launch Period */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    4. Promoção de Entrada / Lançamento
                  </h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-slate-400">Ativar desconto inicial?</span>
                    <input
                      type="checkbox"
                      checked={formData.hasPromotion}
                      onChange={e => setFormData({ ...formData, hasPromotion: e.target.checked })}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-slate-900 border-slate-700"
                    />
                  </label>
                </div>

                {formData.hasPromotion && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Preço Promocional (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.promotionalPrice}
                          onChange={e => setFormData({ ...formData, promotionalPrice: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Duração da Promoção (Meses)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.promotionDuration}
                        onChange={e => setFormData({ ...formData, promotionDuration: parseInt(e.target.value) || 3 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Preço Após Promoção (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.priceAfterPromotion}
                          onChange={e => setFormData({ ...formData, priceAfterPromotion: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 5: Real-time Schedule Simulation */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  5. Linha do Tempo e Cronograma de Cobrança
                </h4>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                  {computedScheduleStages.map((stage, idx) => (
                    <div
                      key={stage.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">
                          {stage.order}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{stage.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {stage.duration > 0
                              ? `Válido por ${stage.duration} ${stage.unit === 'DAYS' ? 'dias' : 'meses'}`
                              : 'Válido por tempo indeterminado (Recorrente)'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className={`text-sm font-bold ${stage.price === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {stage.price === 0 ? 'R$ 0,00 (Grátis)' : formatMoney(stage.price)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {stage.price === 0 ? 'Período de avaliação' : `/${formData.billingCycle === 'MONTHLY' ? 'mês' : 'ciclo'}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 6: Features Included */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  6. Módulos & Recursos Liberados
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: 'agenda', label: 'Agenda & Agendamentos' },
                    { key: 'clientes', label: 'Gestão de Clientes' },
                    { key: 'profissionais', label: 'Profissionais & Comissões' },
                    { key: 'servicos', label: 'Catálogo de Serviços' },
                    { key: 'pacotes', label: 'Pacotes & Assinaturas' },
                    { key: 'comunicacoes', label: 'Central de Mensagens' },
                    { key: 'promocoes', label: 'Promoções & Cupons' },
                    { key: 'sorteios', label: 'Sorteios Automáticos' },
                    { key: 'galeria', label: 'Galeria de Trabalhos' },
                    { key: 'estoque', label: 'Controle de Estoque' },
                    { key: 'relatorios_financeiros', label: 'Relatórios Financeiros' }
                  ].map(feat => (
                    <label
                      key={feat.key}
                      className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 cursor-pointer text-xs transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={(formData.features as any)[feat.key] ?? true}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            features: {
                              ...formData.features,
                              [feat.key]: e.target.checked
                            }
                          })
                        }
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-slate-900 border-slate-700"
                      />
                      <span className="text-slate-200 font-medium">{feat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Section 7: Limits */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5" />
                  7. Limites Operacionais
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Máximo de Profissionais
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={typeof formData.limits.maxProfessionals === 'number' ? formData.limits.maxProfessionals : 10}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          limits: {
                            ...formData.limits,
                            maxProfessionals: parseInt(e.target.value) || 10
                          }
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Máximo de Unidades
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={typeof formData.limits.maxUnits === 'number' ? formData.limits.maxUnits : 1}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          limits: {
                            ...formData.limits,
                            maxUnits: parseInt(e.target.value) || 1
                          }
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-6 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <SaveButton
                  isDirty={isDirty}
                  isLoading={isSubmitting}
                  isSaved={isSaved}
                  onClick={() => handleSavePlan()}
                  label={editingPlan ? 'Salvar alterações' : 'Criar Plano'}
                  className="text-sm"
                />
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unsaved Changes Guard Modal */}
      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        onClose={() => setShowUnsavedModal(false)}
        onDiscard={() => {
          setShowUnsavedModal(false);
          setIsModalOpen(false);
          setInitialFormData(null);
        }}
        onSave={async () => {
          setShowUnsavedModal(false);
          await handleSavePlan();
        }}
      />

      {/* Modal: View Subscribed Barbershops */}
      {selectedPlanForSubscribers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl w-full max-w-xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Assinantes: {selectedPlanForSubscribers.name}
                  </h3>
                  <p className="text-xs text-slate-400">Barbearias contratantes ativas neste plano</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlanForSubscribers(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 max-h-80 overflow-y-auto">
              {subscriptions.filter(s => s.status !== 'CANCELED' && (s.planId === selectedPlanForSubscribers.id || (selectedPlanForSubscribers.id === 'PLANO_UNICO' && !s.planId))).length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Nenhuma barbearia cadastrada ou ativa neste plano no momento.
                </div>
              ) : (
                subscriptions
                  .filter(s => s.status !== 'CANCELED' && (s.planId === selectedPlanForSubscribers.id || (selectedPlanForSubscribers.id === 'PLANO_UNICO' && !s.planId)))
                  .map(sub => {
                    const shop = barbershops.find(b => b.id === sub.barbershopId);
                    return (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <Building className="w-4 h-4 text-amber-400 shrink-0" />
                          <div>
                            <p className="font-semibold text-white">{sub.barbershopName || shop?.name || sub.barbershopId}</p>
                            <p className="text-[11px] text-slate-400">{sub.payerEmail} • {sub.payerPhone || shop?.whatsapp || 'Sem tel'}</p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            sub.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}>
                            {sub.status}
                          </span>
                          <p className="text-[10px] text-slate-500 mt-1">
                            {formatMoney(sub.currentPrice)}
                          </p>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedPlanForSubscribers(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
