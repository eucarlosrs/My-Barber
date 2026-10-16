import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Lock,
  Crown,
  Sparkles,
  ShieldCheck,
  Check,
  X,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { PlanId } from '../types';

interface RegisterBarbershopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RegisterBarbershopModal: React.FC<RegisterBarbershopModalProps> = ({
  isOpen,
  onClose
}) => {
  const { registerBarbershop, customPlans } = useApp();

  const [formState, setFormState] = useState({
    name: '',
    slug: '',
    phone: '',
    address: '',
    managerName: '',
    managerEmail: '',
    managerPassword: '',
    managerWhatsApp: '',
    planId: 'plano-profissional' as PlanId
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    barbershopName: string;
    initPointUrl?: string;
    isLifetime: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const handleSlugify = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormState(prev => ({
      ...prev,
      name,
      slug: prev.slug === '' || prev.slug === handleSlugify(prev.name) ? handleSlugify(name) : prev.slug
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formState.name.trim()) {
      setErrorMsg('Informe o nome da barbearia.');
      return;
    }
    if (!formState.managerEmail.trim()) {
      setErrorMsg('Informe o e-mail do proprietário.');
      return;
    }
    if (!formState.managerPassword.trim() || formState.managerPassword.length < 6) {
      setErrorMsg('A senha do proprietário deve conter no mínimo 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await registerBarbershop({
        name: formState.name,
        slug: formState.slug || handleSlugify(formState.name),
        customDomain: '',
        logoUrl: '',
        bannerUrl: '',
        about: 'Barbearia cadastrada no My Barber',
        phone: formState.phone,
        whatsapp: formState.managerWhatsApp || formState.phone,
        street: formState.address || 'Rua Principal',
        number: '100',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01000-000',
        planId: formState.planId,
        commercialMode: formState.planId === 'plano-vitalicio' ? 'PAGO' : 'TESTE_GRATIS',
        managerName: formState.managerName || 'Proprietário',
        managerWhatsApp: formState.managerWhatsApp || formState.phone,
        managerEmail: formState.managerEmail,
        managerRole: 'PROPRIETARIO',
        managerPassword: formState.managerPassword
      });

      setIsLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'Falha ao cadastrar barbearia.');
        return;
      }

      setSuccessInfo({
        barbershopName: formState.name,
        initPointUrl: res.initPointUrl,
        isLifetime: formState.planId === 'plano-vitalicio'
      });
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err?.message || 'Erro inesperado ao cadastrar barbearia.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 text-neutral-100 relative">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {successInfo ? (
          <div className="space-y-6 text-center py-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-neutral-100">
                Barbearia Cadastrada com Sucesso!
              </h2>
              <p className="text-sm text-neutral-400">
                {successInfo.isLifetime
                  ? 'A Compra Definitiva (R$ 799,00) foi registrada. Conclua o pagamento único no Mercado Pago para liberação permanente.'
                  : 'Sua barbearia foi registrada com 14 Dias Grátis. Valide seu cartão no Mercado Pago para ativar seu acesso.'}
              </p>
            </div>

            {successInfo.initPointUrl && (
              <div className="pt-2">
                <a
                  href={successInfo.initPointUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-neutral-950 font-bold rounded-2xl shadow-xl transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ir para Checkout no Mercado Pago
                </a>
              </div>
            )}

            <div className="pt-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold transition-colors"
              >
                Concluir e Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="w-6 h-6 text-orange-500" />
                <h2 className="text-xl sm:text-2xl font-bold text-neutral-100">
                  Cadastrar Minha Barbearia
                </h2>
              </div>
              <p className="text-xs text-neutral-400">
                Crie seu estabelecimento e escolha seu plano ou a Compra Definitiva.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Dados do Estabelecimento */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                1. Informações da Barbearia
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Nome da Barbearia *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={handleNameChange}
                    placeholder="Ex: Barbearia Dom Corleone"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Link Exclusivo (Slug)
                  </label>
                  <input
                    type="text"
                    value={formState.slug}
                    onChange={e => setFormState(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="dom-corleone"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Telefone / WhatsApp Comercial
                  </label>
                  <input
                    type="tel"
                    value={formState.phone}
                    onChange={e => setFormState(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="(11) 98765-4321"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Endereço
                  </label>
                  <input
                    type="text"
                    value={formState.address}
                    onChange={e => setFormState(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Rua das Palmeiras, 120"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* Dados do Proprietário */}
            <div className="space-y-4 pt-2 border-t border-neutral-800">
              <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                2. Conta do Proprietário (Acesso Master)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.managerName}
                    onChange={e => setFormState(prev => ({ ...prev, managerName: e.target.value }))}
                    placeholder="Carlos Alberto"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    E-mail de Acesso *
                  </label>
                  <input
                    type="email"
                    required
                    value={formState.managerEmail}
                    onChange={e => setFormState(prev => ({ ...prev, managerEmail: e.target.value }))}
                    placeholder="carlos@barbearia.com.br"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    WhatsApp do Proprietário
                  </label>
                  <input
                    type="tel"
                    value={formState.managerWhatsApp}
                    onChange={e => setFormState(prev => ({ ...prev, managerWhatsApp: e.target.value }))}
                    placeholder="(11) 99999-8888"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Senha de Acesso * (mínimo 6 caracteres)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={formState.managerPassword}
                    onChange={e => setFormState(prev => ({ ...prev, managerPassword: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* Seleção do Plano Comercial */}
            <div className="space-y-3 pt-2 border-t border-neutral-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                  3. Escolha o Plano ou Compra Definitiva
                </h3>
                <span className="text-[11px] text-amber-400 font-semibold">
                  14 Dias Grátis nos Planos Mensais
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Essencial */}
                <div
                  onClick={() => setFormState(prev => ({ ...prev, planId: 'plano-essencial' }))}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    formState.planId === 'plano-essencial'
                      ? 'bg-orange-500/15 border-orange-500 text-neutral-100 ring-1 ring-orange-500/50'
                      : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-neutral-200">Plano Essencial</span>
                    <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-full font-bold">14 Dias Grátis</span>
                  </div>
                  <div className="text-base font-black text-neutral-100 font-mono">
                    R$ 39,90 <span className="text-xs font-normal text-neutral-400">/mês após trial</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Até 1 profissional • 1 unidade • Agenda & Clientes
                  </div>
                </div>

                {/* 2. Profissional */}
                <div
                  onClick={() => setFormState(prev => ({ ...prev, planId: 'plano-profissional' }))}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    formState.planId === 'plano-profissional'
                      ? 'bg-orange-500/15 border-orange-500 text-neutral-100 ring-1 ring-orange-500/50'
                      : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-orange-300">Plano Profissional</span>
                    <span className="text-[10px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full font-bold">Mais Popular</span>
                  </div>
                  <div className="text-base font-black text-neutral-100 font-mono">
                    R$ 49,90 <span className="text-xs font-normal text-neutral-400">/mês (3 meses)</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Depois R$ 69,90/mês • Até 5 profissionais • 1 unidade
                  </div>
                </div>

                {/* 3. Premium */}
                <div
                  onClick={() => setFormState(prev => ({ ...prev, planId: 'plano-premium' }))}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    formState.planId === 'plano-premium'
                      ? 'bg-orange-500/15 border-orange-500 text-neutral-100 ring-1 ring-orange-500/50'
                      : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-neutral-200">Plano Premium</span>
                    <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full font-bold">Multiunidade</span>
                  </div>
                  <div className="text-base font-black text-neutral-100 font-mono">
                    R$ 79,90 <span className="text-xs font-normal text-neutral-400">/mês (3 meses)</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Depois R$ 99,90/mês • Até 10 profissionais • 2 unidades
                  </div>
                </div>

                {/* 4. Compra Definitiva */}
                <div
                  onClick={() => setFormState(prev => ({ ...prev, planId: 'plano-vitalicio' }))}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    formState.planId === 'plano-vitalicio'
                      ? 'bg-amber-500/20 border-amber-500 text-neutral-100 ring-1 ring-amber-500/60 shadow-lg'
                      : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-amber-300 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      Compra Definitiva
                    </span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">Sem Mensalidade</span>
                  </div>
                  <div className="text-base font-black text-amber-300 font-mono">
                    R$ 799,00 <span className="text-xs font-normal text-amber-400/80">(Pagamento Único)</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Licença permanente • Até 5 profissionais • 1 unidade • Sem recorrência
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-neutral-950 text-xs font-bold shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>Criando Estabelecimento...</>
                ) : formState.planId === 'plano-vitalicio' ? (
                  <>Comprar Licença Definitiva (R$ 799,00)</>
                ) : (
                  <>Cadastrar Barbearia & Iniciar 14 Dias Grátis</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
