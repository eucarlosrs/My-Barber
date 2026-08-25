import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Building2,
  Plus,
  Crown,
  CheckCircle2,
  DollarSign,
  Scissors,
  CreditCard,
  MapPin,
  Edit3,
  Trash2,
  Smartphone,
  Shield,
  Search,
  Check,
  X,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Power,
  Camera,
  Upload,
  SlidersHorizontal,
  Image as ImageIcon,
  Sparkles,
  Share2,
  Globe,
  Clock,
  Zap
} from 'lucide-react';
import { PlanId, MY_BARBER_PLANS, RegisterBarbershopInput, Barbershop, BarbershopStatus } from '../../types';
import { AppImage } from '../common/AppImage';
import { ImageEditModal } from '../common/ImageEditModal';
import { getBarbershopEffectiveStatus, getTrialStatusInfo } from '../../utils/formatters';

// Curated high quality presets for quick logo & banner selection
const LOGO_PRESETS = [
  { label: 'Navalha Gold', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400&auto=format&fit=crop&q=80' },
  { label: 'Vintage Barber', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80' },
  { label: 'Modern Classic', url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&auto=format&fit=crop&q=80' },
  { label: 'Gentleman Crest', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400&auto=format&fit=crop&q=80' },
  { label: 'Retro Scissors', url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&auto=format&fit=crop&q=80' }
];

const BANNER_PRESETS = [
  { label: 'Salão Industrial Loft', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Poltronas Vintage Couro', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Bancada Minimalista', url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Studio Iluminação Quente', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Bar & Grooming Lounge', url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=1200&auto=format&fit=crop&q=80' }
];

interface MasterAdminBarbershopsProps {
  onOpenCreateManagerModal: (shopId: string) => void;
  showRegisterModal: boolean;
  setShowRegisterModal: (show: boolean) => void;
}

export const MasterAdminBarbershops: React.FC<MasterAdminBarbershopsProps> = ({
  onOpenCreateManagerModal,
  showRegisterModal,
  setShowRegisterModal
}) => {
  const {
    barbershops,
    registerBarbershop,
    deleteBarbershop,
    updateBarbershop,
    toggleBarbershopStatus,
    setActiveTenantId,
    setViewMode,
    users,
    setCurrentUserId,
    getBarbershopDirectUrl,
    getBarbershopExclusiveDomain
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [editingShop, setEditingShop] = useState<Barbershop | null>(null);
  const [showLogoEditModal, setShowLogoEditModal] = useState(false);
  const [showBannerEditModal, setShowBannerEditModal] = useState(false);
  const [copiedDirectLinkShopId, setCopiedDirectLinkShopId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Form State for new Barbershop registration
  const [formState, setFormState] = useState<RegisterBarbershopInput>({
    name: '',
    slug: '',
    customDomain: '',
    logoUrl: LOGO_PRESETS[0].url,
    bannerUrl: BANNER_PRESETS[0].url,
    about: '',
    phone: '(11) 3333-4444',
    whatsapp: '(11) 98888-7777',
    street: 'Av. Paulista',
    number: '1000',
    complement: 'Sala 42',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01310-100',
    planId: 'PLANO_UNICO',
    commercialMode: 'PAGO',
    managerName: '',
    managerWhatsApp: '(11) 98888-7777',
    managerEmail: '',
    managerRole: 'PROPRIETARIO',
    managerAvatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
  });

  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    setFormState(prev => ({
      ...prev,
      name,
      slug,
      customDomain: slug ? `${slug}.mybarberbr.com.br` : '',
      about: name ? `${name} — Barbearia e cuidados masculinos de alto padrão.` : prev.about
    }));
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim()) {
      setErrorToast('Por favor, informe o nome da barbearia.');
      return;
    }
    if (!formState.managerName.trim()) {
      setErrorToast('Por favor, informe o nome do gerente ou proprietário responsável.');
      return;
    }

    const res = registerBarbershop(formState);
    if (res.success) {
      setSuccessToast(`Barbearia "${formState.name}" cadastrada com sucesso!`);
      setShowRegisterModal(false);
      setFormState({
        name: '',
        slug: '',
        customDomain: '',
        logoUrl: LOGO_PRESETS[0].url,
        bannerUrl: BANNER_PRESETS[0].url,
        about: '',
        phone: '(11) 3333-4444',
        whatsapp: '(11) 98888-7777',
        street: 'Rua das Flores',
        number: '123',
        complement: '',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001-000',
        planId: 'PLANO_UNICO',
        commercialMode: 'PAGO',
        managerName: '',
        managerWhatsApp: '(11) 98888-7777',
        managerEmail: '',
        managerRole: 'PROPRIETARIO',
        managerAvatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
      });
      setTimeout(() => setSuccessToast(null), 5000);
    } else {
      setErrorToast(res.error || 'Erro ao cadastrar barbearia.');
    }
  };

  const handleOpenBarbershopWebAdmin = (barbershopId: string) => {
    setActiveTenantId(barbershopId);
    const manager = users.find(u => u.tenantId === barbershopId && (u.role === 'PROPRIETARIO' || u.role === 'GERENTE'));
    if (manager) {
      setCurrentUserId(manager.id);
    }
    setViewMode('WEBADMIN');
  };

  const handleOpenBarbershopApp = (barbershopId: string) => {
    setActiveTenantId(barbershopId);
    setViewMode('CLIENT_APP');
  };

  const handleDeleteShop = (shop: Barbershop) => {
    if (window.confirm(`Tem certeza que deseja remover o cadastro da barbearia "${shop.name}"?`)) {
      const res = deleteBarbershop(shop.id);
      if (res.success) {
        setSuccessToast(`Barbearia "${shop.name}" removida com sucesso.`);
        setTimeout(() => setSuccessToast(null), 4000);
      } else {
        setErrorToast(res.error || 'Erro ao remover barbearia.');
      }
    }
  };

  const filteredShops = barbershops.filter(b =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.address.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.customDomain.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
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

      {/* Barbershops list header & search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-neutral-100 font-heading">
            Barbearias Parceiras Cadastradas ({barbershops.length})
          </h2>
          <p className="text-xs text-neutral-400">Controle de ativação, planos, identidade e responsáveis</p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, cidade ou domínio..."
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          <button
            onClick={() => setShowRegisterModal(true)}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-orange-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Cadastrar</span>
          </button>
        </div>
      </div>

      {/* Barbershop Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredShops.map(shop => {
          const plan = MY_BARBER_PLANS[shop.planId] || Object.values(MY_BARBER_PLANS)[0];
          const shopUsers = users.filter(u => u.tenantId === shop.id);
          const manager = shopUsers.find(u => u.role === 'PROPRIETARIO' || u.role === 'GERENTE') || shopUsers[0];
          const profsCount = shopUsers.filter(u => u.role === 'PROFISSIONAL').length;
          
          const effectiveStatus = getBarbershopEffectiveStatus(shop);
          const trialInfo = getTrialStatusInfo(shop);
          const isActive = effectiveStatus === 'ATIVA';
          const isTrial = effectiveStatus === 'TESTE';
          const isExpired = effectiveStatus === 'TESTE_EXPIRADO';
          const isInactive = effectiveStatus === 'INATIVA';

          return (
            <div
              key={shop.id}
              className={`bg-neutral-900 border rounded-3xl overflow-hidden shadow-xl transition-all flex flex-col justify-between ${
                isInactive 
                  ? 'border-red-900/50 opacity-80' 
                  : isExpired
                  ? 'border-rose-700/60 shadow-rose-950/20'
                  : isTrial
                  ? 'border-amber-500/50 shadow-amber-950/20'
                  : 'border-neutral-800 hover:border-neutral-700'
              }`}
            >
              {/* Banner with logo & status badge */}
              <div className="h-32 w-full relative bg-neutral-950 overflow-hidden">
                <AppImage
                  src={shop.bannerUrl || shop.salonImages[0] || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800'}
                  alt={`Banner de ${shop.name}`}
                  fallbackType="banner"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/30 to-transparent"></div>

                {/* Status & Plan Badges */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 flex-wrap justify-end">
                  {/* Status Badge */}
                  {isActive && (
                    <button
                      onClick={() => toggleBarbershopStatus(shop.id, false)}
                      className="bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-900 px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow-lg transition-all cursor-pointer"
                      title="Barbearia Ativa no Plano Pago. Clique para desativar."
                    >
                      <Power className="w-3 h-3" />
                      <span>ATIVA</span>
                    </button>
                  )}

                  {isTrial && (
                    <div 
                      className="bg-amber-950/90 text-amber-300 border border-amber-500/60 px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow-lg backdrop-blur-md"
                      title="Modalidade: Teste Grátis de 3 dias (72h) com acesso total"
                    >
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>TESTE ({trialInfo.remainingText})</span>
                    </div>
                  )}

                  {isExpired && (
                    <div 
                      className="bg-rose-950/90 text-rose-300 border border-rose-500/60 px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow-lg backdrop-blur-md"
                      title="O período de 3 dias de teste grátis expirou"
                    >
                      <AlertCircle className="w-3 h-3 text-rose-400" />
                      <span>TESTE EXPIRADO</span>
                    </div>
                  )}

                  {isInactive && (
                    <button
                      onClick={() => toggleBarbershopStatus(shop.id, true)}
                      className="bg-red-950/90 text-red-300 border border-red-500/50 hover:bg-red-900 px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow-lg transition-all cursor-pointer"
                      title="Clique para reativar barbearia"
                    >
                      <Power className="w-3 h-3" />
                      <span>DESATIVADA</span>
                    </button>
                  )}

                  <div className="bg-neutral-950/90 backdrop-blur-md border border-orange-500/50 text-orange-300 px-2.5 py-1 rounded-full text-[11px] font-black shadow-lg">
                    {isTrial || isExpired ? 'Teste 3 Dias' : plan.name} • {isTrial || isExpired ? 'Gratuito' : `R$ ${plan.priceMonthly.toFixed(2).replace('.', ',')}/mês`}
                  </div>
                </div>

                {/* Logo overlay on banner */}
                <div className="absolute bottom-2 left-4 flex items-end gap-3">
                  <AppImage
                    src={shop.logoUrl}
                    alt={`Logo de ${shop.name}`}
                    fallbackType="logo"
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-orange-500/80 bg-neutral-950 shadow-2xl"
                  />
                  <div className="mb-0.5">
                    <h3 className="text-base font-black text-neutral-100 font-heading line-clamp-1">
                      {shop.name}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] text-neutral-300">
                      <MapPin className="w-3 h-3 text-orange-400 shrink-0" />
                      <span>{shop.address.city}, {shop.address.state}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shop Details */}
              <div className="p-4 space-y-3 flex-1">
                {/* Trial Expiration / Conversion Alert Banner */}
                {(isTrial || isExpired) && (
                  <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                    isExpired 
                      ? 'bg-rose-950/50 border-rose-500/50 text-neutral-100' 
                      : 'bg-amber-950/40 border-amber-500/50 text-neutral-100'
                  }`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-black">
                        <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isExpired ? 'text-rose-400' : 'text-amber-400'}`} />
                        <span className={isExpired ? 'text-rose-300' : 'text-amber-300'}>
                          {isExpired ? 'Período de Teste Concluído' : 'Modalidade: Teste Grátis — 3 Dias'}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-300 mt-0.5">
                        {isExpired 
                          ? `${trialInfo.expiredText || 'Prazo de 72h encerrado.'} Clique ao lado para contratar mantendo todos os dados intactos!`
                          : `${trialInfo.remainingText}. Funcionalidades completas liberadas (Proprietário, Barbeiros, Clientes e Agenda).`
                        }
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        updateBarbershop({
                          status: 'ATIVA',
                          commercialMode: 'PAGO',
                          trialExpiresAt: undefined
                        }, shop.id);
                        setSuccessToast(`Barbearia "${shop.name}" ativada no Plano Pago com sucesso! 100% dos dados foram preservados.`);
                        setTimeout(() => setSuccessToast(null), 5000);
                      }}
                      className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 font-black rounded-xl text-xs flex items-center gap-1.5 shrink-0 shadow-lg cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                      title="Contratar plano e transformar status TESTE em ATIVA sem criar nova barbearia"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>TESTE → ATIVA</span>
                    </button>
                  </div>
                )}

                {/* Exclusive Subdomain & Link Card */}
                <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                        <Globe className="w-3 h-3 text-orange-400" />
                        <span>Endereço Exclusivo (My Barber)</span>
                      </div>
                      <span className="font-mono text-orange-400 font-bold text-xs truncate block mt-0.5">
                        {getBarbershopExclusiveDomain(shop)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = getBarbershopDirectUrl(shop);
                        navigator.clipboard.writeText(url);
                        setCopiedDirectLinkShopId(shop.id);
                        setTimeout(() => setCopiedDirectLinkShopId(null), 3000);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
                        copiedDirectLinkShopId === shop.id
                          ? 'bg-emerald-500 text-neutral-950 font-black'
                          : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700'
                      }`}
                      title="Copiar link exclusivo de divulgação desta barbearia"
                    >
                      {copiedDirectLinkShopId === shop.id ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3 h-3 text-orange-400" />
                          <span>Copiar Link</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-neutral-500 block">WhatsApp Oficial:</span>
                      <span className="font-mono text-emerald-400 text-[11px] truncate block">{shop.whatsapp}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-neutral-500 block">Identificador (Slug):</span>
                      <span className="font-mono text-neutral-300 text-[11px] truncate block">{shop.slug}</span>
                    </div>
                  </div>
                </div>

                {/* Manager Card */}
                <div className="bg-neutral-950/60 border border-neutral-800 rounded-2xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <AppImage
                      src={manager?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'}
                      alt={manager?.name || 'Gerente'}
                      fallbackType="avatar"
                      className="w-9 h-9 rounded-xl object-cover border border-neutral-700"
                    />
                    <div>
                      <div className="text-[10px] font-extrabold text-orange-400 uppercase">
                        {manager?.role || 'PROPRIETÁRIO'} RESPONSÁVEL
                      </div>
                      <div className="font-bold text-xs text-neutral-200">{manager?.name || 'Não definido'}</div>
                      <div className="text-[10px] text-neutral-500 font-mono">{manager?.whatsapp || 'Sem tel'}</div>
                    </div>
                  </div>

                  <div className="text-right text-[11px]">
                    <span className="text-neutral-500 block">Equipe:</span>
                    <span className="font-extrabold text-neutral-300">{profsCount} profissionais</span>
                  </div>
                </div>
              </div>

              {/* Card Actions Footer */}
              <div className="px-4 py-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingShop(shop)}
                    className="p-2 rounded-xl text-neutral-400 hover:text-orange-400 hover:bg-neutral-900 transition-colors"
                    title="Editar Informações da Barbearia"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {barbershops.length > 1 && (
                    <button
                      onClick={() => handleDeleteShop(shop)}
                      className="p-2 rounded-xl text-neutral-500 hover:text-red-400 hover:bg-neutral-900 transition-colors"
                      title="Remover Barbearia"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => onOpenCreateManagerModal(shop.id)}
                    className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-850 text-orange-400 border border-orange-500/30 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                    title="Criar novo login de Gerente ou Proprietário"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Gestor</span>
                  </button>

                  <button
                    onClick={() => handleOpenBarbershopApp(shop.id)}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                    title="Abrir como cliente no celular"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-orange-400" />
                    <span>Ver App</span>
                  </button>

                  <button
                    onClick={() => handleOpenBarbershopWebAdmin(shop.id)}
                    className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                    title="Acessar painel operacional da barbearia"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Gerenciar Salão</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Editar Barbearia */}
      {editingShop && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 text-neutral-100 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-neutral-800">
              <div>
                <h3 className="text-base font-black font-heading text-neutral-100">
                  Editar {editingShop.name}
                </h3>
                <p className="text-xs text-neutral-400">
                  Ajuste plano, status, logotipo e banner da barbearia parceira.
                </p>
              </div>
              <button
                onClick={() => setEditingShop(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Nome da Barbearia</label>
                <input
                  type="text"
                  value={editingShop.name}
                  onChange={e => {
                    const newName = e.target.value;
                    updateBarbershop({ name: newName }, editingShop.id);
                    setEditingShop(prev => prev ? { ...prev, name: newName } : null);
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">WhatsApp de Atendimento</label>
                  <input
                    type="text"
                    value={editingShop.whatsapp}
                    onChange={e => {
                      const newWa = e.target.value;
                      updateBarbershop({ whatsapp: newWa }, editingShop.id);
                      setEditingShop(prev => prev ? { ...prev, whatsapp: newWa } : null);
                    }}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Identificador Exclusivo (Slug)</label>
                  <input
                    type="text"
                    value={editingShop.slug}
                    onChange={e => {
                      const cleanSlug = e.target.value
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9-]+/g, '');
                      const newDomain = `${cleanSlug}.mybarberbr.com.br`;
                      updateBarbershop({ slug: cleanSlug, customDomain: newDomain }, editingShop.id);
                      setEditingShop(prev => prev ? { ...prev, slug: cleanSlug, customDomain: newDomain } : null);
                    }}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
              </div>

              {/* Endereço Exclusivo da Barbearia */}
              <div className="p-3 bg-neutral-950 rounded-2xl border border-orange-500/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-neutral-400">Endereço Exclusivo no My Barber:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `https://${editingShop.slug}.mybarberbr.com.br`;
                      navigator.clipboard.writeText(url);
                      setSuccessToast(`Endereço copiado: ${url}`);
                      setTimeout(() => setSuccessToast(null), 3000);
                    }}
                    className="text-[10px] text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>Copiar Link Exclusivo</span>
                  </button>
                </div>
                <div className="font-mono text-xs text-orange-400 font-bold bg-neutral-900 px-3 py-2 rounded-xl border border-neutral-800 break-all">
                  https://{editingShop.slug}.mybarberbr.com.br
                </div>
                <p className="text-[10px] text-neutral-500">
                  Ao abrir este link, o cliente é direcionado diretamente para a página exclusiva da sua barbearia.
                </p>
              </div>

              {/* Status e Modalidade Comercial */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Status Comercial da Barbearia</label>
                <select
                  value={editingShop.status === 'INACTIVE' ? 'INATIVA' : (editingShop.status || 'ATIVA')}
                  onChange={e => {
                    const newStatus = e.target.value as BarbershopStatus;
                    const isCommercialTrial = newStatus === 'TESTE';
                    const isPaid = newStatus === 'ATIVA';
                    const updatePayload: Partial<Barbershop> = {
                      status: newStatus,
                      commercialMode: isCommercialTrial ? 'TESTE_GRATIS' : (isPaid ? 'PAGO' : editingShop.commercialMode)
                    };
                    if (isCommercialTrial && !editingShop.trialExpiresAt) {
                      updatePayload.trialStartedAt = new Date().toISOString();
                      updatePayload.trialExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
                    }
                    if (isPaid) {
                      updatePayload.trialExpiresAt = undefined;
                    }
                    updateBarbershop(updatePayload, editingShop.id);
                    setEditingShop(prev => prev ? { ...prev, ...updatePayload } : null);
                    setSuccessToast(`Status de "${editingShop.name}" alterado para ${newStatus}.`);
                    setTimeout(() => setSuccessToast(null), 3000);
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="ATIVA">ATIVA (Plano Pago — Operação Normal Liberada)</option>
                  <option value="TESTE">TESTE (Período de Teste Grátis — 3 Dias)</option>
                  <option value="TESTE_EXPIRADO">TESTE EXPIRADO (Período de 3 dias finalizado)</option>
                  <option value="INATIVA">INATIVA / DESATIVADA (Acesso temporariamente bloqueado)</option>
                </select>
              </div>

              {/* Botão de conversão rápida TESTE -> ATIVA dentro do modal */}
              {(editingShop.status === 'TESTE' || editingShop.status === 'TESTE_EXPIRADO' || editingShop.commercialMode === 'TESTE_GRATIS') && (
                <div className="p-3 bg-gradient-to-r from-emerald-950/50 to-teal-950/50 border border-emerald-500/50 rounded-2xl flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Ativar Barbearia (TESTE → ATIVA)</span>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Contratar plano pago e ativar imediatamente preservando 100% de cadastros, serviços e equipe.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updatePayload: Partial<Barbershop> = {
                        status: 'ATIVA',
                        commercialMode: 'PAGO',
                        trialExpiresAt: undefined
                      };
                      updateBarbershop(updatePayload, editingShop.id);
                      setEditingShop(prev => prev ? { ...prev, ...updatePayload } : null);
                      setSuccessToast(`Barbearia "${editingShop.name}" ativada no Plano Pago com sucesso!`);
                      setTimeout(() => setSuccessToast(null), 4000);
                    }}
                    className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black rounded-xl text-xs flex items-center gap-1.5 shrink-0 shadow-lg cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>TESTE → ATIVA</span>
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Plano Oficial</label>
                <select
                  value={editingShop.planId}
                  onChange={e => {
                    const newPlan = e.target.value as PlanId;
                    updateBarbershop({ planId: newPlan }, editingShop.id);
                    setEditingShop(prev => prev ? { ...prev, planId: newPlan } : null);
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                >
                  {(Object.keys(MY_BARBER_PLANS) as PlanId[]).map(pk => (
                    <option key={pk} value={pk}>
                      {MY_BARBER_PLANS[pk].name} — R$ {MY_BARBER_PLANS[pk].priceMonthly.toFixed(2).replace('.', ',')}/mês
                    </option>
                  ))}
                </select>
              </div>

              {/* Logotipo com Editor Visual */}
              <div className="p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-orange-400" />
                    <span>Logotipo da Barbearia</span>
                  </label>
                  <span className="text-[10px] text-neutral-400">Ajuste de Zoom, Posição e Upload</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden border border-neutral-700 bg-neutral-900 shrink-0 flex items-center justify-center">
                    <AppImage
                      src={editingShop.logoUrl}
                      alt="Logo"
                      fallbackType="logo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setShowLogoEditModal(true)}
                      className="w-full py-2 px-3 bg-gradient-to-r from-orange-500/20 to-amber-500/20 hover:from-orange-500/30 hover:to-amber-500/30 border border-orange-500/40 hover:border-orange-500 text-orange-300 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400" />
                      <span>Abrir Editor Visual do Logo</span>
                    </button>
                    <input
                      type="url"
                      placeholder="Ou cole a URL direta da imagem..."
                      value={editingShop.logoUrl}
                      onChange={e => {
                        const newLogo = e.target.value;
                        updateBarbershop({ logoUrl: newLogo }, editingShop.id);
                        setEditingShop(prev => prev ? { ...prev, logoUrl: newLogo } : null);
                      }}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-2.5 py-1 text-[11px] text-neutral-300 focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Banner com Editor Visual */}
              <div className="p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-orange-400" />
                    <span>Banner / Capa Principal</span>
                  </label>
                  <span className="text-[10px] text-neutral-400">Ajuste Panorâmico</span>
                </div>

                <div className="space-y-2">
                  <div className="w-full h-20 rounded-xl overflow-hidden border border-neutral-700 bg-neutral-900">
                    <AppImage
                      src={editingShop.bannerUrl || editingShop.salonImages[0] || ''}
                      alt="Banner"
                      fallbackType="banner"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBannerEditModal(true)}
                      className="flex-1 py-2 px-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-neutral-600 text-neutral-200 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                      <span>Abrir Editor Visual do Banner</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-800 mt-4">
              <button
                onClick={() => {
                  setEditingShop(null);
                  setSuccessToast('Dados da barbearia atualizados com sucesso!');
                  setTimeout(() => setSuccessToast(null), 3000);
                }}
                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 font-black rounded-xl text-xs shadow-lg shadow-orange-500/20 cursor-pointer"
              >
                Concluir Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Image Studio Modal para LOGO */}
      {showLogoEditModal && editingShop && (
        <ImageEditModal
          isOpen={showLogoEditModal}
          onClose={() => setShowLogoEditModal(false)}
          title={`Editar Logotipo — ${editingShop.name}`}
          subtitle="Faça upload, ajuste o zoom, arraste para reposicionar ou selecione uma sugestão."
          currentImageUrl={editingShop.logoUrl}
          fallbackType="logo"
          presets={LOGO_PRESETS}
          onSave={(newUrl) => {
            updateBarbershop({ logoUrl: newUrl }, editingShop.id);
            setEditingShop(prev => prev ? { ...prev, logoUrl: newUrl } : null);
            setShowLogoEditModal(false);
            setSuccessToast('Logotipo atualizado e salvo!');
            setTimeout(() => setSuccessToast(null), 3000);
          }}
        />
      )}

      {/* Visual Image Studio Modal para BANNER */}
      {showBannerEditModal && editingShop && (
        <ImageEditModal
          isOpen={showBannerEditModal}
          onClose={() => setShowBannerEditModal(false)}
          title={`Editar Banner Principal — ${editingShop.name}`}
          subtitle="Faça upload do banner, controle o enquadramento, zoom e cores de fundo."
          currentImageUrl={editingShop.bannerUrl || editingShop.salonImages[0] || ''}
          fallbackType="banner"
          presets={BANNER_PRESETS}
          onSave={(newUrl) => {
            updateBarbershop({ bannerUrl: newUrl }, editingShop.id);
            setEditingShop(prev => prev ? { ...prev, bannerUrl: newUrl } : null);
            setShowBannerEditModal(false);
            setSuccessToast('Banner atualizado e salvo!');
            setTimeout(() => setSuccessToast(null), 3000);
          }}
        />
      )}

      {/* Modal: Cadastrar Nova Barbearia */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-3xl w-full p-6 text-neutral-100 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar my-8">
            <div className="flex items-start justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black font-heading text-neutral-100">
                    Cadastrar Nova Barbearia / Empresa Parceira
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Configure os dados cadastrais, plano contratado, identidade visual e o gerente responsável.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-neutral-400 hover:text-neutral-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-6 pt-4">
              <div className="space-y-3">
                <h4 className="text-xs font-black text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>1. Dados da Barbearia</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Nome da Barbearia *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Barbearia Razor Club"
                      value={formState.name}
                      onChange={e => handleNameChange(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                      Identificador / Subdomínio Exclusivo *
                    </label>
                    <div className="flex items-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs focus-within:border-orange-500">
                      <span className="text-neutral-500 font-mono text-[11px] mr-1">https://</span>
                      <input
                        type="text"
                        required
                        placeholder="barbeariadojoao"
                        value={formState.slug}
                        onChange={e => {
                          const cleanSlug = e.target.value
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-z0-9-]+/g, '');
                          setFormState(prev => ({
                            ...prev,
                            slug: cleanSlug,
                            customDomain: `${cleanSlug}.mybarberbr.com.br`
                          }));
                        }}
                        className="flex-1 bg-transparent text-orange-400 font-bold font-mono focus:outline-none"
                      />
                      <span className="text-neutral-400 font-mono text-[11px] font-bold">.mybarberbr.com.br</span>
                    </div>
                    <span className="text-[10px] text-neutral-500 mt-1 block">
                      Endereço exclusivo para os clientes acessarem diretamente esta barbearia.
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">WhatsApp Comercial da Barbearia *</label>
                    <input
                      type="text"
                      required
                      placeholder="(11) 98888-7777"
                      value={formState.whatsapp}
                      onChange={e => setFormState(prev => ({ ...prev, whatsapp: e.target.value }))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Endereço (Rua e Bairro)</label>
                    <input
                      type="text"
                      placeholder="Rua / Av. e Bairro"
                      value={`${formState.street}, ${formState.neighborhood}`}
                      onChange={e => setFormState(prev => ({ ...prev, street: e.target.value }))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Cidade / UF</label>
                    <input
                      type="text"
                      placeholder="São Paulo - SP"
                      value={`${formState.city} - ${formState.state}`}
                      onChange={e => setFormState(prev => ({ ...prev, city: e.target.value }))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              </div>

              {/* STEP B: MODALIDADE COMERCIAL / PLANO */}
              <div className="space-y-3 pt-3 border-t border-neutral-800">
                <h4 className="text-xs font-black text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>2. Modalidade de Contratação & Plano</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* OPÇÃO 1: PLANO PAGO */}
                  <div
                    onClick={() => setFormState(prev => ({ ...prev, commercialMode: 'PAGO', planId: 'PLANO_UNICO' }))}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all relative ${
                      formState.commercialMode !== 'TESTE_GRATIS'
                        ? 'bg-orange-500/15 border-orange-500 text-neutral-100 shadow-xl ring-1 ring-orange-500/50'
                        : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Crown className={`w-4 h-4 ${formState.commercialMode !== 'TESTE_GRATIS' ? 'text-orange-400' : 'text-neutral-500'}`} />
                        <span className="text-sm font-black tracking-wide">PLANO PAGO</span>
                      </div>
                      {formState.commercialMode !== 'TESTE_GRATIS' ? (
                        <div className="w-5 h-5 rounded-full bg-orange-500 text-neutral-950 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-neutral-700" />
                      )}
                    </div>

                    <div className="text-lg font-black text-neutral-100 font-mono">
                      R$ 49,90<span className="text-xs font-normal text-neutral-400">/mês</span>
                    </div>

                    <div className="mt-2.5 space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Status inicial: <strong className="text-emerald-300 font-black">ATIVA</strong></span>
                      </div>
                      <p className="text-neutral-400 text-[10px] leading-relaxed">
                        Ativação imediata e integral. Até 10 profissionais (proprietário, gerente e barbeiros) e agendamentos ilimitados.
                      </p>
                    </div>
                  </div>

                  {/* OPÇÃO 2: TESTE GRÁTIS — 3 DIAS */}
                  <div
                    onClick={() => setFormState(prev => ({ ...prev, commercialMode: 'TESTE_GRATIS', planId: 'PLANO_UNICO' }))}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all relative ${
                      formState.commercialMode === 'TESTE_GRATIS'
                        ? 'bg-amber-500/15 border-amber-500 text-neutral-100 shadow-xl ring-1 ring-amber-500/50'
                        : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Sparkles className={`w-4 h-4 ${formState.commercialMode === 'TESTE_GRATIS' ? 'text-amber-400' : 'text-neutral-500'}`} />
                        <span className="text-sm font-black tracking-wide text-amber-300">TESTE GRÁTIS — 3 DIAS</span>
                      </div>
                      {formState.commercialMode === 'TESTE_GRATIS' ? (
                        <div className="w-5 h-5 rounded-full bg-amber-400 text-neutral-950 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-neutral-700" />
                      )}
                    </div>

                    <div className="text-lg font-black text-amber-300 font-mono">
                      Gratuito <span className="text-xs font-normal text-amber-400/80">(Validade: 3 dias)</span>
                    </div>

                    <div className="mt-2.5 space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>Status inicial: <strong className="text-amber-200 font-black">TESTE</strong></span>
                      </div>
                      <p className="text-neutral-400 text-[10px] leading-relaxed">
                        Mesma estrutura real e completa: Proprietário, Barbeiros, Clientes, Agenda, Serviços, Imagens e Link Exclusivo.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP C: GESTOR RESPONSÁVEL */}
              <div className="space-y-3 pt-3 border-t border-neutral-800">
                <h4 className="text-xs font-black text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>3. Gestor Responsável da Barbearia</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Nome Completo do Gestor *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Carlos Eduardo Silveira"
                      value={formState.managerName}
                      onChange={e => setFormState(prev => ({ ...prev, managerName: e.target.value }))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Cargo</label>
                    <select
                      value={formState.managerRole}
                      onChange={e => setFormState(prev => ({ ...prev, managerRole: e.target.value as 'PROPRIETARIO' | 'GERENTE' }))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                    >
                      <option value="PROPRIETARIO">Proprietário (Dono)</option>
                      <option value="GERENTE">Gerente Geral</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 font-black rounded-xl text-xs shadow-lg shadow-orange-500/20"
                >
                  Confirmar Cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
