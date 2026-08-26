import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Zap,
  Calendar,
  DollarSign,
  Receipt,
  Sparkles,
  Info
} from 'lucide-react';
import { SubscriptionStatus } from '../../types';

export const MySubscriptionView: React.FC = () => {
  const {
    currentBarbershop,
    currentSubscription,
    subscriptionPayments,
    simulateSubscriptionAction,
    syncSubscription,
    toleranceDaysRemaining
  } = useApp();

  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const shopPayments = subscriptionPayments.filter(p => p.barbershopId === currentBarbershop.id);

  const handleSimulate = async (action: 'CONFIRM_PAYMENT' | 'TRIGGER_PAST_DUE' | 'TRIGGER_SUSPEND' | 'REGULARIZE' | 'CANCEL') => {
    setIsLoading(true);
    setFeedbackMessage(null);
    try {
      const res = await simulateSubscriptionAction(currentBarbershop.id, action);
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: res.message || 'Ação simulada com sucesso!'
        });
      } else {
        setFeedbackMessage({
          type: 'error',
          text: res.error || 'Falha ao executar ação.'
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Erro inesperado.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    setFeedbackMessage(null);
    try {
      const res = await syncSubscription(currentBarbershop.id);
      if (res.success) {
        setFeedbackMessage({
          type: 'info',
          text: 'Status da assinatura sincronizado com o Mercado Pago!'
        });
      } else {
        setFeedbackMessage({
          type: 'error',
          text: res.error || 'Erro ao sincronizar.'
        });
      }
    } catch {
      setFeedbackMessage({
        type: 'error',
        text: 'Erro de conexão com o Mercado Pago.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status?: SubscriptionStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Assinatura Ativa
          </span>
        );
      case 'PAST_DUE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            Pagamento Pendente ({toleranceDaysRemaining} dias de tolerância)
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Acesso Suspenso
          </span>
        );
      case 'CANCELED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-600 border border-zinc-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Cancelada
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
            <Clock className="w-3.5 h-3.5" />
            Aguardando Autorização
          </span>
        );
    }
  };

  const billingCount = currentSubscription?.billingCount || 0;
  const currentPrice = currentSubscription?.currentPrice || 49.90;
  const isLaunchOffer = billingCount < 3;

  return (
    <div className="space-y-6" id="my-subscription-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900">Minha Assinatura</h1>
            {getStatusBadge(currentSubscription?.status)}
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Gerenciamento do plano mensal e cobranças recorrentes via Mercado Pago Oficial.
          </p>
        </div>

        <button
          onClick={handleSync}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors shadow-sm disabled:opacity-50"
          id="btn-sync-mp"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Sincronizar Mercado Pago
        </button>
      </div>

      {/* Feedback Alert */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : feedbackMessage.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
          id="subscription-feedback-alert"
        >
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium">{feedbackMessage.text}</div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-xs underline opacity-70 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Warning Banners for Past Due / Suspended */}
      {currentSubscription?.status === 'PAST_DUE' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 text-amber-900" id="past-due-warning-banner">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">Aviso de Pagamento Pendente</h3>
              <p className="text-sm text-amber-800 mt-1">
                Não conseguimos processar a última renovação mensal pelo Mercado Pago. Você possui{' '}
                <strong>{toleranceDaysRemaining} dias de tolerância</strong> para regularizar o cartão de crédito antes do bloqueio das operações da barbearia.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => handleSimulate('REGULARIZE')}
                  disabled={isLoading}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                  id="btn-regularize-past-due"
                >
                  Regularizar Pagamento Agora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentSubscription?.status === 'SUSPENDED' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-red-900" id="suspended-warning-banner">
          <div className="flex items-start gap-3">
            <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">Assinatura Suspensa por Inadimplência</h3>
              <p className="text-sm text-red-800 mt-1">
                O prazo de tolerância de 7 dias expirou sem confirmação do pagamento. O acesso aos agendamentos e cadastros está temporariamente bloqueado.
              </p>
              <div className="mt-3">
                <button
                  onClick={() => handleSimulate('REGULARIZE')}
                  disabled={isLoading}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                  id="btn-unblock-subscription"
                >
                  Pagar e Desbloquear Imediatamente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Subscription Details & Pricing Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Subscription Details Card */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Plano MY BARBER Oficial</h2>
                <p className="text-xs text-zinc-500">Recorrência mensal automática com transição programada</p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-extrabold text-zinc-900">
                R$ {currentPrice.toFixed(2).replace('.', ',')}
                <span className="text-xs font-normal text-zinc-500">/mês</span>
              </div>
              <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                {isLaunchOffer ? 'Tarifa Especial de Lançamento' : 'Tarifa Regular'}
              </span>
            </div>
          </div>

          {/* Pricing Milestones Progression */}
          <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
              <span>Evolução da Oferta de Lançamento</span>
              <span>Mensalidade #{billingCount || 1}</span>
            </div>

            {/* Stepper Visualizer */}
            <div className="grid grid-cols-4 gap-2">
              <div className={`p-2.5 rounded-lg border text-center transition-all ${billingCount >= 1 ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                <div className="text-[10px] uppercase font-bold tracking-wider">1º Mês</div>
                <div className="text-xs font-semibold mt-0.5">R$ 49,90</div>
                <div className="text-[10px] text-zinc-500 mt-1">{billingCount >= 1 ? '✓ Pago' : 'Atual'}</div>
              </div>

              <div className={`p-2.5 rounded-lg border text-center transition-all ${billingCount >= 2 ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium' : billingCount === 1 ? 'bg-amber-50 border-amber-300 text-amber-800 font-medium' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                <div className="text-[10px] uppercase font-bold tracking-wider">2º Mês</div>
                <div className="text-xs font-semibold mt-0.5">R$ 49,90</div>
                <div className="text-[10px] text-zinc-500 mt-1">{billingCount >= 2 ? '✓ Pago' : billingCount === 1 ? 'Próximo' : 'Pendente'}</div>
              </div>

              <div className={`p-2.5 rounded-lg border text-center transition-all ${billingCount >= 3 ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium' : billingCount === 2 ? 'bg-amber-50 border-amber-300 text-amber-800 font-medium' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                <div className="text-[10px] uppercase font-bold tracking-wider">3º Mês</div>
                <div className="text-xs font-semibold mt-0.5">R$ 49,90</div>
                <div className="text-[10px] text-zinc-500 mt-1">{billingCount >= 3 ? '✓ Pago' : billingCount === 2 ? 'Próximo' : 'Pendente'}</div>
              </div>

              <div className={`p-2.5 rounded-lg border text-center transition-all ${billingCount >= 4 ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium' : 'bg-zinc-100 border-zinc-300 text-zinc-700'}`}>
                <div className="text-[10px] uppercase font-bold tracking-wider text-amber-600">4º Mês+</div>
                <div className="text-xs font-semibold mt-0.5">R$ 69,90</div>
                <div className="text-[10px] text-zinc-500 mt-1">Automático</div>
              </div>
            </div>

            <p className="text-xs text-zinc-500 italic">
              * A mudança de R$ 49,90 para R$ 69,90 é executada <strong>automaticamente</strong> na mesma assinatura pelo Mercado Pago a partir da 4ª cobrança. Não é necessário recadastrar cartão.
            </p>
          </div>

          {/* Key Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200">
              <div className="text-xs text-zinc-500 flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                Próxima Renovação
              </div>
              <div className="text-sm font-semibold text-zinc-900">
                {currentSubscription?.nextBillingDate
                  ? new Date(currentSubscription.nextBillingDate + 'T12:00:00Z').toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })
                  : 'Calculada no checkout'}
              </div>
            </div>

            <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200">
              <div className="text-xs text-zinc-500 flex items-center gap-1.5 mb-1">
                <Receipt className="w-3.5 h-3.5 text-zinc-400" />
                Identificador Mercado Pago
              </div>
              <div className="text-xs font-mono font-medium text-zinc-800 truncate" title={currentSubscription?.mercadopagoSubscriptionId}>
                {currentSubscription?.mercadopagoSubscriptionId || 'Aguardando criação'}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {currentSubscription?.status === 'PENDING' && (
              <a
                href={currentSubscription.initPointUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
                id="btn-authorize-mercadopago"
              >
                <ExternalLink className="w-4 h-4" />
                Autorizar Assinatura no Mercado Pago
              </a>
            )}

            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Processamento seguro com tokenização de cartão criptografada.
            </div>
          </div>
        </div>

        {/* Right 1 Col: Sandbox Tester Simulator */}
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 text-white rounded-2xl p-6 shadow-md border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-sm text-zinc-100">Simulador de Ciclos (Sandbox)</h3>
            </div>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 font-semibold px-2 py-0.5 rounded">
              Ambiente de Testes
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Teste instantaneamente todos os comportamentos e regras de transição de preço e cobrança do Mercado Pago:
          </p>

          <div className="space-y-2">
            <button
              onClick={() => handleSimulate('CONFIRM_PAYMENT')}
              disabled={isLoading}
              className="w-full text-left px-3.5 py-2.5 bg-zinc-800/90 hover:bg-zinc-800 hover:border-emerald-500/50 border border-zinc-700 rounded-xl transition-all text-xs flex items-center justify-between group"
              id="btn-sim-confirm-payment"
            >
              <div>
                <div className="font-semibold text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Simular Cobrança Aprovada
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">Avança para cobrança #{billingCount + 1}</div>
              </div>
              <span className="text-zinc-500 font-mono text-[10px]">
                {billingCount < 3 ? 'R$ 49,90' : 'R$ 69,90'}
              </span>
            </button>

            <button
              onClick={() => handleSimulate('TRIGGER_PAST_DUE')}
              disabled={isLoading}
              className="w-full text-left px-3.5 py-2.5 bg-zinc-800/90 hover:bg-zinc-800 hover:border-amber-500/50 border border-zinc-700 rounded-xl transition-all text-xs flex items-center justify-between group"
              id="btn-sim-past-due"
            >
              <div>
                <div className="font-semibold text-amber-400 group-hover:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Simular Falha de Cartão
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">Ativa tolerância de 7 dias</div>
              </div>
            </button>

            <button
              onClick={() => handleSimulate('TRIGGER_SUSPEND')}
              disabled={isLoading}
              className="w-full text-left px-3.5 py-2.5 bg-zinc-800/90 hover:bg-zinc-800 hover:border-red-500/50 border border-zinc-700 rounded-xl transition-all text-xs flex items-center justify-between group"
              id="btn-sim-suspend"
            >
              <div>
                <div className="font-semibold text-red-400 group-hover:text-red-300 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  Simular Tolerância Esgotada
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">Bloqueia acesso à barbearia</div>
              </div>
            </button>

            <button
              onClick={() => handleSimulate('REGULARIZE')}
              disabled={isLoading}
              className="w-full text-left px-3.5 py-2.5 bg-zinc-800/90 hover:bg-zinc-800 hover:border-emerald-500/50 border border-zinc-700 rounded-xl transition-all text-xs flex items-center justify-between group"
              id="btn-sim-regularize"
            >
              <div>
                <div className="font-semibold text-teal-400 group-hover:text-teal-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Regularizar & Restaurar Acesso
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">Status ACTIVE imediato</div>
              </div>
            </button>

            <button
              onClick={() => handleSimulate('CANCEL')}
              disabled={isLoading}
              className="w-full text-left px-3.5 py-2.5 bg-zinc-800/90 hover:bg-zinc-800 hover:border-zinc-500 border border-zinc-700 rounded-xl transition-all text-xs flex items-center justify-between group opacity-80"
              id="btn-sim-cancel"
            >
              <div>
                <div className="font-semibold text-zinc-400 group-hover:text-zinc-300 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  Simular Cancelamento
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">Interrompe próximas cobranças</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Payment History Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-zinc-600" />
            <h3 className="font-bold text-zinc-900">Histórico de Cobranças da Assinatura</h3>
          </div>
          <span className="text-xs text-zinc-500 font-medium">
            Total de {shopPayments.length} pagamento(s) registrado(s)
          </span>
        </div>

        {shopPayments.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            Nenhum pagamento processado ainda para esta assinatura.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600 border-b border-zinc-200">
                <tr>
                  <th className="px-6 py-3">Ciclo / Mensalidade</th>
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3">Valor</th>
                  <th className="px-6 py-3">Forma de Pagamento</th>
                  <th className="px-6 py-3">ID Mercado Pago</th>
                  <th className="px-6 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {shopPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/70 transition-colors">
                    <td className="px-6 py-4 font-semibold text-zinc-900">
                      Mensalidade #{p.billingNumber}
                    </td>
                    <td className="px-6 py-4 text-zinc-600">
                      {new Date(p.paymentDate + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 font-bold text-zinc-900">
                      R$ {p.amount.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="px-6 py-4 text-zinc-600 text-xs">
                      {p.paymentMethod || 'Cartão de Crédito'}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-zinc-500">
                      {p.mercadopagoPaymentId}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
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
