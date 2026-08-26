import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Zap,
  Calendar,
  DollarSign,
  Receipt,
  Search,
  ShieldCheck,
  TrendingUp,
  Building2
} from 'lucide-react';
import { Subscription, SubscriptionStatus } from '../../types';

export const MasterAdminSubscriptions: React.FC = () => {
  const {
    barbershops,
    subscriptions,
    subscriptionPayments,
    simulateSubscriptionAction,
    syncSubscription
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [loadingShopId, setLoadingShopId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredSubscriptions = subscriptions.filter(sub => {
    const shop = barbershops.find(b => b.id === sub.barbershopId);
    const shopName = shop?.name || sub.barbershopName || '';
    const matchesSearch =
      shopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.payerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.mercadopagoSubscriptionId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || sub.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalMRR = subscriptions
    .filter(s => s.status === 'ACTIVE' || s.status === 'PAST_DUE')
    .reduce((sum, s) => sum + s.currentPrice, 0);

  const activeCount = subscriptions.filter(s => s.status === 'ACTIVE').length;
  const pastDueCount = subscriptions.filter(s => s.status === 'PAST_DUE').length;
  const suspendedCount = subscriptions.filter(s => s.status === 'SUSPENDED').length;
  const launchOfferCount = subscriptions.filter(s => s.billingCount < 3).length;
  const regularOfferCount = subscriptions.filter(s => s.billingCount >= 3).length;

  const handleSimulate = async (barbershopId: string, action: any) => {
    setLoadingShopId(barbershopId);
    setFeedback(null);
    try {
      const res = await simulateSubscriptionAction(barbershopId, action);
      if (res.success) {
        setFeedback(res.message || 'Ação simulada com sucesso no Mercado Pago!');
      } else {
        setFeedback(`Erro: ${res.error}`);
      }
    } finally {
      setLoadingShopId(null);
    }
  };

  const handleSync = async (barbershopId: string) => {
    setLoadingShopId(barbershopId);
    setFeedback(null);
    try {
      const res = await syncSubscription(barbershopId);
      if (res.success) {
        setFeedback('Assinatura sincronizada com a API do Mercado Pago!');
      } else {
        setFeedback(`Erro na sincronização: ${res.error}`);
      }
    } finally {
      setLoadingShopId(null);
    }
  };

  const getStatusBadge = (status: SubscriptionStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Ativa
          </span>
        );
      case 'PAST_DUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            Tolerância (7d)
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle className="w-3 h-3" />
            Suspensa
          </span>
        );
      case 'CANCELED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            <XCircle className="w-3 h-3" />
            Cancelada
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3" />
            Pendente
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" id="master-admin-subscriptions-view">
      {/* Top Notification Feedback */}
      {feedback && (
        <div className="bg-orange-500/10 border border-orange-500/30 text-orange-200 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="underline hover:text-white">
            Fechar
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
            <span>MRR Total (Mercado Pago)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            R$ {totalMRR.toFixed(2).replace('.', ',')}
          </div>
          <span className="text-[10px] text-neutral-400 mt-1 block">Receita mensal contratada</span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
            <span>Assinaturas Ativas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-neutral-100">{activeCount}</div>
          <span className="text-[10px] text-emerald-400 font-bold mt-1 block">
            {launchOfferCount} no Lançamento (R$ 49,90) • {regularOfferCount} Regular (R$ 69,90)
          </span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
            <span>Em Tolerância (Falha de Cartão)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">{pastDueCount}</div>
          <span className="text-[10px] text-neutral-400 mt-1 block">Prazo de 7 dias antes do bloqueio</span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
            <span>Contas Suspensas</span>
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-black text-red-400">{suspendedCount}</div>
          <span className="text-[10px] text-neutral-400 mt-1 block">Operação bloqueada por inadimplência</span>
        </div>
      </div>

      {/* Pricing Transition Rule Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-400" />
            <h3 className="font-bold text-neutral-100 text-sm">Regra Oficial de Assinatura Recorrente</h3>
          </div>
          <span className="text-[11px] bg-orange-500/10 text-orange-400 px-2.5 py-0.5 rounded-full font-bold border border-orange-500/20">
            Mercado Pago Preapproval
          </span>
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Cada barbearia possui uma <strong>única assinatura recorrente mensal</strong> vinculada obrigatoriamente ao seu <code className="text-orange-300 font-mono">barbershopId</code>.
          O valor nos 3 primeiros meses é <strong>R$ 49,90/mês</strong>. Ao atingir a 4ª cobrança, o sistema e a API do Mercado Pago atualizam o valor da recorrência de forma <strong>100% automática para R$ 69,90/mês</strong>, sem criação de novas assinaturas e sem interrupção do serviço.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por barbearia, e-mail ou ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-4 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {['ALL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'PENDING'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                filterStatus === st
                  ? 'bg-orange-500 text-neutral-950 shadow-sm'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {st === 'ALL' ? 'Todos' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-orange-400" />
            <h4 className="font-bold text-sm text-neutral-100">Assinaturas Contratadas</h4>
          </div>
          <span className="text-xs text-neutral-500 font-medium">
            {filteredSubscriptions.length} registro(s) encontrado(s)
          </span>
        </div>

        {filteredSubscriptions.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            Nenhuma assinatura encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800">
                <tr>
                  <th className="px-6 py-3.5">Barbearia & Contato</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Valor Atual</th>
                  <th className="px-6 py-3.5">Ciclo / Mensalidades</th>
                  <th className="px-6 py-3.5">Próxima Renovação</th>
                  <th className="px-6 py-3.5">ID Mercado Pago</th>
                  <th className="px-6 py-3.5 text-right">Ações Sandbox & Sincronização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredSubscriptions.map(sub => {
                  const shop = barbershops.find(b => b.id === sub.barbershopId);
                  const isBusy = loadingShopId === sub.barbershopId;
                  const isLaunch = sub.billingCount < 3;

                  return (
                    <tr key={sub.id} className="hover:bg-neutral-850/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-neutral-100 text-sm">
                          {shop?.name || sub.barbershopName || 'Barbearia'}
                        </div>
                        <div className="text-[11px] text-neutral-400">{sub.payerEmail}</div>
                        <div className="text-[10px] font-mono text-neutral-500">{sub.barbershopId}</div>
                      </td>

                      <td className="px-6 py-4">
                        {getStatusBadge(sub.status)}
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-bold text-neutral-100 font-mono text-sm">
                          R$ {sub.currentPrice.toFixed(2).replace('.', ',')}
                          <span className="text-[10px] text-neutral-500 font-sans">/mês</span>
                        </div>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          isLaunch ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {isLaunch ? 'Lançamento' : 'Regular'}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-neutral-200 font-semibold">
                          #{sub.billingCount} mensalidade(s)
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {sub.billingCount >= 3
                            ? 'Transição para R$ 69,90 aplicada'
                            : `Faltam ${3 - sub.billingCount} para virar R$ 69,90`}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-neutral-300 font-medium">
                        {sub.nextBillingDate
                          ? new Date(sub.nextBillingDate + 'T12:00:00Z').toLocaleDateString('pt-BR')
                          : 'A definir'}
                      </td>

                      <td className="px-6 py-4 font-mono text-[11px] text-neutral-400">
                        {sub.mercadopagoSubscriptionId}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleSimulate(sub.barbershopId, 'CONFIRM_PAYMENT')}
                            disabled={isBusy}
                            title="Simular pagamento aprovado e avançar ciclo"
                            className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50"
                          >
                            +1 Pagto
                          </button>

                          <button
                            onClick={() => handleSimulate(sub.barbershopId, 'TRIGGER_PAST_DUE')}
                            disabled={isBusy}
                            title="Simular falha de pagamento (Tolerância 7 dias)"
                            className="px-2 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50"
                          >
                            Falha
                          </button>

                          <button
                            onClick={() => handleSimulate(sub.barbershopId, 'TRIGGER_SUSPEND')}
                            disabled={isBusy}
                            title="Simular suspensão por tolerância esgotada"
                            className="px-2 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50"
                          >
                            Suspender
                          </button>

                          <button
                            onClick={() => handleSync(sub.barbershopId)}
                            disabled={isBusy}
                            title="Sincronizar com Mercado Pago"
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-all"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Global Payment Logs */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <h4 className="font-bold text-sm text-neutral-100">Transações e Cobranças Registradas (Mercado Pago)</h4>
          </div>
          <span className="text-xs text-neutral-500 font-medium">
            {subscriptionPayments.length} transação(ões)
          </span>
        </div>

        {subscriptionPayments.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            Nenhuma transação financeira registrada até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800">
                <tr>
                  <th className="px-6 py-3">Barbearia</th>
                  <th className="px-6 py-3">Mensalidade</th>
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3">Valor</th>
                  <th className="px-6 py-3">Método</th>
                  <th className="px-6 py-3">ID do Pagamento MP</th>
                  <th className="px-6 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {subscriptionPayments.map(p => (
                  <tr key={p.id} className="hover:bg-neutral-850/60 transition-colors">
                    <td className="px-6 py-3.5 font-bold text-neutral-200">
                      {p.barbershopName || p.barbershopId}
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-neutral-300">
                      Cobrança #{p.billingNumber}
                    </td>
                    <td className="px-6 py-3.5 text-neutral-400">
                      {new Date(p.paymentDate + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-3.5 font-bold text-emerald-400 font-mono">
                      R$ {p.amount.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="px-6 py-3.5 text-neutral-400">
                      {p.paymentMethod || 'Cartão de Crédito'}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[11px] text-neutral-500">
                      {p.mercadopagoPaymentId}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Aprovado
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
