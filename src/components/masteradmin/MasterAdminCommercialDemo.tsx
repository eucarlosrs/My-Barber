import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Sparkles,
  Smartphone,
  Building2,
  Scissors,
  Users,
  Image as ImageIcon,
  MapPin,
  Palette,
  Check,
  Plus,
  Trash2,
  Edit3,
  RotateCcw,
  ArrowRight,
  ExternalLink,
  Crown,
  CheckCircle2,
  AlertCircle,
  Eye,
  Camera,
  Layers,
  Clock,
  DollarSign,
  Phone,
  Instagram,
  Star,
  Info
} from 'lucide-react';
import { Barbershop, User, Service } from '../../types';
import {
  DEMO_COMMERCIAL_PRESETS,
  DEMO_LOGO_PRESETS,
  DEMO_BANNER_PRESETS,
  DEMO_SALON_GALLERY_PRESETS,
  DEMO_AVATAR_PRESETS,
  CommercialDemoPreset
} from '../../data/demoPresets';
import { AppImage } from '../common/AppImage';

export const MasterAdminCommercialDemo: React.FC = () => {
  const {
    barbershops,
    updateBarbershop,
    users,
    services,
    addService,
    updateService,
    addProfessional,
    updateProfessional,
    setActiveTenantId,
    setViewMode
  } = useApp();

  // Find the demo barbershop
  const demoShop = barbershops.find(
    b => b.isCommercialDemo || b.id === 'barbershop-commercial-demo'
  ) || DEMO_COMMERCIAL_PRESETS[0].barbershop as Barbershop;

  // Find demo professionals & services
  const demoProfessionals = users.filter(
    u => u.tenantId === 'barbershop-commercial-demo'
  );
  const demoServices = services.filter(
    s => s.tenantId === 'barbershop-commercial-demo'
  );

  // Sub-tabs inside Commercial Demo
  const [activeSubTab, setActiveSubTab] = useState<'IDENTITY' | 'SERVICES' | 'PROFESSIONALS' | 'LOCATION_INFO' | 'STYLE'>('IDENTITY');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form State for editing the Demo Barbershop
  const [shopName, setShopName] = useState(demoShop.name);
  const [shopSlug, setShopSlug] = useState(demoShop.slug);
  const [logoUrl, setLogoUrl] = useState(demoShop.logoUrl);
  const [bannerUrl, setBannerUrl] = useState(demoShop.bannerUrl || DEMO_BANNER_PRESETS[0].url);
  const [aboutText, setAboutText] = useState(demoShop.about);
  const [phoneText, setPhoneText] = useState(demoShop.phone);
  const [whatsappText, setWhatsappText] = useState(demoShop.whatsapp);
  const [instagramText, setInstagramText] = useState(demoShop.socialMedia?.instagram || '@barbearia.exemplo');
  const [streetText, setStreetText] = useState(demoShop.address?.street || 'Rua Principal');
  const [numberText, setNumberText] = useState(demoShop.address?.number || '100');
  const [neighborhoodText, setNeighborhoodText] = useState(demoShop.address?.neighborhood || 'Centro');
  const [cityText, setCityText] = useState(demoShop.address?.city || 'São Paulo');
  const [stateText, setStateText] = useState(demoShop.address?.state || 'SP');
  const [zipText, setZipText] = useState(demoShop.address?.zipCode || '01001-000');
  const [primaryColor, setPrimaryColor] = useState(demoShop.primaryColor || '#FF6B00');
  const [salonImages, setSalonImages] = useState<string[]>(
    demoShop.salonImages && demoShop.salonImages.length > 0
      ? demoShop.salonImages
      : DEMO_SALON_GALLERY_PRESETS.slice(0, 3)
  );

  // Modals for adding/editing Service & Professional in Demo
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceName, setServiceName] = useState('');
  const [serviceDesc, setServiceDesc] = useState('');
  const [serviceCategory, setServiceCategory] = useState('Cabelo');
  const [servicePrice, setServicePrice] = useState('50.00');
  const [serviceDuration, setServiceDuration] = useState('35');
  const [serviceImage, setServiceImage] = useState(DEMO_BANNER_PRESETS[0].url);

  const [showAddProfModal, setShowAddProfModal] = useState(false);
  const [editingProf, setEditingProf] = useState<User | null>(null);
  const [profName, setProfName] = useState('');
  const [profSpecialties, setProfSpecialties] = useState('Corte Degradê, Barba');
  const [profWhatsapp, setProfWhatsapp] = useState('(11) 98888-7777');
  const [profAvatar, setProfAvatar] = useState(DEMO_AVATAR_PRESETS[0]);

  // Apply Quick Preset (e.g. Barbearia do João, Don Corleone, etc.)
  const handleApplyPreset = (preset: CommercialDemoPreset) => {
    const shop = preset.barbershop;
    setShopName(shop.name || 'Barbearia');
    setShopSlug(shop.slug || 'barbearia');
    setLogoUrl(shop.logoUrl || DEMO_LOGO_PRESETS[0].url);
    setBannerUrl(shop.bannerUrl || DEMO_BANNER_PRESETS[0].url);
    setAboutText(shop.about || '');
    setPhoneText(shop.phone || '(11) 3333-4444');
    setWhatsappText(shop.whatsapp || '(11) 99999-8888');
    setInstagramText(shop.socialMedia?.instagram || '@barbearia');
    setStreetText(shop.address?.street || 'Rua Principal');
    setNumberText(shop.address?.number || '100');
    setNeighborhoodText(shop.address?.neighborhood || 'Centro');
    setCityText(shop.address?.city || 'São Paulo');
    setStateText(shop.address?.state || 'SP');
    setZipText(shop.address?.zipCode || '01001-000');
    setPrimaryColor(preset.themeColor || '#FF6B00');
    setSalonImages(shop.salonImages || DEMO_SALON_GALLERY_PRESETS.slice(0, 3));

    // Save changes into active demo barbershop
    updateBarbershop(
      {
        name: shop.name || 'Barbearia Demo',
        slug: shop.slug || 'barbearia-demo',
        customDomain: shop.customDomain || 'demo.mybarberbr.com.br',
        logoUrl: shop.logoUrl || DEMO_LOGO_PRESETS[0].url,
        bannerUrl: shop.bannerUrl || DEMO_BANNER_PRESETS[0].url,
        about: shop.about || '',
        phone: shop.phone || '(11) 3333-4444',
        whatsapp: shop.whatsapp || '(11) 99999-8888',
        address: shop.address || {
          street: 'Rua Principal',
          number: '100',
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01001-000'
        },
        socialMedia: shop.socialMedia || { instagram: '@barbearia' },
        salonImages: shop.salonImages || DEMO_SALON_GALLERY_PRESETS.slice(0, 3),
        primaryColor: preset.themeColor || '#FF6B00',
        isCommercialDemo: true,
        status: 'ATIVA'
      },
      'barbershop-commercial-demo'
    );

    setSuccessToast(`Modelo "${preset.name}" carregado com sucesso para a apresentação!`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Save current identity form
  const handleSaveIdentity = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    updateBarbershop(
      {
        name: shopName.trim(),
        slug: shopSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        customDomain: `app.${shopSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')}.com.br`,
        logoUrl,
        bannerUrl,
        about: aboutText,
        phone: phoneText,
        whatsapp: whatsappText,
        address: {
          street: streetText,
          number: numberText,
          neighborhood: neighborhoodText,
          city: cityText,
          state: stateText,
          zipCode: zipText
        },
        socialMedia: {
          instagram: instagramText
        },
        salonImages,
        primaryColor,
        isCommercialDemo: true,
        status: 'ATIVA'
      },
      'barbershop-commercial-demo'
    );

    setSuccessToast('Identidade visual da barbearia de demonstração atualizada!');
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Launch the real Client App pointing to the commercial demo tenant
  const handleOpenClientApp = () => {
    handleSaveIdentity();
    setActiveTenantId('barbershop-commercial-demo');
    setViewMode('CLIENT_APP');
  };

  // Add / Edit Demo Service
  const handleSaveService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim()) return;

    if (editingService) {
      updateService(editingService.id, {
        name: serviceName.trim(),
        description: serviceDesc.trim(),
        category: serviceCategory,
        price: parseFloat(servicePrice) || 50,
        durationMinutes: parseInt(serviceDuration, 10) || 30,
        imageUrl: serviceImage
      });
      setSuccessToast(`Serviço "${serviceName}" atualizado!`);
    } else {
      addService({
        tenantId: 'barbershop-commercial-demo',
        name: serviceName.trim(),
        description: serviceDesc.trim(),
        category: serviceCategory,
        price: parseFloat(servicePrice) || 50,
        durationMinutes: parseInt(serviceDuration, 10) || 30,
        imageUrl: serviceImage,
        returnReminderDays: 20,
        active: true
      });
      setSuccessToast(`Serviço "${serviceName}" adicionado à demonstração!`);
    }

    setShowAddServiceModal(false);
    setEditingService(null);
    setServiceName('');
    setServiceDesc('');
    setServicePrice('50.00');
    setServiceDuration('35');
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Add / Edit Demo Professional
  const handleSaveProfessional = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profName.trim()) return;

    const specsArray = profSpecialties.split(',').map(s => s.trim()).filter(Boolean);

    if (editingProf) {
      updateProfessional(editingProf.id, {
        name: profName.trim(),
        whatsapp: profWhatsapp.trim(),
        avatarUrl: profAvatar,
        specialties: specsArray
      });
      setSuccessToast(`Profissional "${profName}" atualizado!`);
    } else {
      addProfessional({
        tenantId: 'barbershop-commercial-demo',
        role: 'PROFISSIONAL',
        name: profName.trim(),
        email: `${profName.toLowerCase().replace(/[^a-z0-9]/g, '')}@barbearia.com`,
        whatsapp: profWhatsapp.trim(),
        avatarUrl: profAvatar,
        specialties: specsArray,
        canViewAllProfessionals: false,
        commissionPercentage: 50,
        birthDate: '1990-01-01'
      });
      setSuccessToast(`Barbeiro "${profName}" adicionado à demonstração!`);
    }

    setShowAddProfModal(false);
    setEditingProf(null);
    setProfName('');
    setProfSpecialties('Corte Degradê, Barba');
    setTimeout(() => setSuccessToast(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {successToast && (
        <div className="fixed top-16 right-4 z-50 bg-emerald-950 border border-emerald-500 text-emerald-200 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs font-bold">{successToast}</div>
        </div>
      )}

      {/* Main Pitch Banner */}
      <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-amber-950/40 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-400 text-xs font-black">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>MODO APRESENTAÇÃO & VENDA COMERCIAL</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-neutral-100 font-heading leading-tight">
              Demonstração Comercial da Barbearia
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 max-w-3xl leading-relaxed">
              Personalize instantaneamente a marca, fotos, barbeiros e serviços para impressionar o seu cliente em potencial. 
              Ao clicar em <strong>VISUALIZAR COMO CLIENTE</strong>, você abre exatamente o mesmo aplicativo de produção que o cliente final usará, com dados fictícios 100% isolados.
            </p>
          </div>

          {/* Primary Action Button */}
          <div className="shrink-0 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={handleOpenClientApp}
              className="px-6 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:via-orange-400 hover:to-amber-500 text-neutral-950 font-black rounded-2xl text-sm sm:text-base flex items-center justify-center gap-3 shadow-xl shadow-orange-500/25 active:scale-95 transition-all cursor-pointer border border-amber-300/40"
            >
              <Smartphone className="w-5 h-5 text-neutral-950 stroke-[2.5]" />
              <span>VISUALIZAR COMO CLIENTE</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Preview Card strip */}
        <div className="mt-6 pt-6 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-neutral-950 border border-amber-500/30 shrink-0">
              <AppImage src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="font-black text-neutral-100 text-sm flex items-center gap-2">
                <span>{shopName}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  Pronto para Apresentação
                </span>
              </div>
              <span className="text-neutral-400 text-xs">
                {cityText}/{stateText} • {demoProfessionals.length} Barbeiros • {demoServices.length} Serviços
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-neutral-400">Ambiente de Teste:</span>
            <span className="font-mono text-amber-400 font-bold bg-neutral-950 px-2.5 py-1 rounded-lg border border-neutral-800">
              tenant: barbershop-commercial-demo (Isolado)
            </span>
          </div>
        </div>
      </div>

      {/* Quick 1-Click Pitch Presets */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <h3 className="font-black text-neutral-100 text-sm sm:text-base font-heading">
              Modelos Prontos de Apresentação (Carregar em 1 Clique)
            </h3>
          </div>
          <span className="text-xs text-neutral-400">Escolha o nicho do seu cliente em potencial</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DEMO_COMMERCIAL_PRESETS.map(preset => {
            const isCurrent = shopName === preset.barbershop.name;
            return (
              <div
                key={preset.id}
                className={`bg-neutral-950 border rounded-2xl p-5 flex flex-col justify-between transition-all relative overflow-hidden group ${
                  isCurrent ? 'border-amber-500 ring-1 ring-amber-500/50 shadow-lg shadow-amber-500/10' : 'border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {preset.badge}
                    </span>
                    <span className="text-xs font-bold text-neutral-400">{preset.subtitle}</span>
                  </div>

                  <h4 className="text-base font-black text-neutral-100">{preset.name}</h4>
                  <p className="text-xs text-neutral-400 leading-relaxed">{preset.description}</p>
                </div>

                <div className="mt-5 pt-4 border-t border-neutral-900 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-500 font-semibold">
                    {preset.professionals.length} Barbeiros • {preset.services.length} Serviços
                  </span>

                  <button
                    onClick={() => handleApplyPreset(preset)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-emerald-500 text-neutral-950 font-black'
                        : 'bg-neutral-900 hover:bg-neutral-800 text-amber-400 hover:text-white border border-neutral-800'
                    }`}
                  >
                    {isCurrent ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    <span>{isCurrent ? 'Modelo Ativo' : 'Carregar Modelo'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Editor Tabs */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="flex items-center gap-2 p-3 bg-neutral-950/80 border-b border-neutral-800 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('IDENTITY')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'IDENTITY'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Nome, Logo & Capa</span>
          </button>

          <button
            onClick={() => setActiveSubTab('SERVICES')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'SERVICES'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <Scissors className="w-4 h-4" />
            <span>Serviços & Valores ({demoServices.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('PROFESSIONALS')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'PROFESSIONALS'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Barbeiros / Profissionais ({demoProfessionals.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('LOCATION_INFO')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'LOCATION_INFO'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Endereço, Contato & Redes</span>
          </button>

          <button
            onClick={() => setActiveSubTab('STYLE')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'STYLE'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Cores & Estilo Visual</span>
          </button>
        </div>

        {/* Tab 1: Identity & Visuals */}
        {activeSubTab === 'IDENTITY' && (
          <div className="p-6 space-y-6">
            <form onSubmit={handleSaveIdentity} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: General Info */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1">
                      Nome da Barbearia do Cliente
                    </label>
                    <input
                      type="text"
                      required
                      value={shopName}
                      onChange={e => setShopName(e.target.value)}
                      placeholder="Ex: Barbearia do João"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 focus:outline-none focus:border-amber-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1">
                      Identificador / Subdomínio (Slug)
                    </label>
                    <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs">
                      <span className="text-neutral-500">app.</span>
                      <input
                        type="text"
                        value={shopSlug}
                        onChange={e => setShopSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                        className="bg-transparent text-amber-400 font-bold focus:outline-none flex-1 px-1"
                      />
                      <span className="text-neutral-500">.com.br</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1">
                      Sobre a Barbearia (Apresentação & Slogan)
                    </label>
                    <textarea
                      rows={3}
                      value={aboutText}
                      onChange={e => setAboutText(e.target.value)}
                      placeholder="Descreva a história, diferenciais (toalha quente, chopp, ar condicionado)..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 leading-relaxed"
                    />
                  </div>

                  {/* Logo Selector */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-2">
                      Logo da Barbearia
                    </label>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-neutral-950 border border-neutral-700 shrink-0">
                        <AppImage src={logoUrl} alt="Logo Preview" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <input
                          type="url"
                          value={logoUrl}
                          onChange={e => setLogoUrl(e.target.value)}
                          placeholder="Cole a URL do logo do cliente..."
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 font-mono"
                        />
                        <span className="text-[11px] text-neutral-400">Ou escolha um logotipo moderno abaixo:</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-6 gap-2">
                      {DEMO_LOGO_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setLogoUrl(preset.url)}
                          className={`aspect-square rounded-xl overflow-hidden border-2 transition-all p-0.5 bg-neutral-950 cursor-pointer ${
                            logoUrl === preset.url ? 'border-amber-500 scale-105 shadow-md' : 'border-neutral-800 hover:border-neutral-600'
                          }`}
                        >
                          <AppImage src={preset.url} alt={preset.label} className="w-full h-full object-cover rounded-lg" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: Banner and Salon Photos */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-2">
                      Imagem Principal (Capa / Banner da Barbearia)
                    </label>
                    <div className="h-32 rounded-2xl overflow-hidden bg-neutral-950 border border-neutral-800 relative mb-3">
                      <AppImage src={bannerUrl} alt="Banner Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent flex items-end p-3">
                        <span className="text-[11px] text-neutral-200 font-bold bg-neutral-950/80 px-2 py-0.5 rounded">
                          Capa de Destaque no App
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {DEMO_BANNER_PRESETS.map(banner => (
                        <button
                          key={banner.id}
                          type="button"
                          onClick={() => setBannerUrl(banner.url)}
                          className={`h-16 rounded-xl overflow-hidden border-2 transition-all p-0.5 bg-neutral-950 cursor-pointer relative ${
                            bannerUrl === banner.url ? 'border-amber-500 scale-105 shadow-md' : 'border-neutral-800 hover:border-neutral-600'
                          }`}
                        >
                          <AppImage src={banner.url} alt={banner.label} className="w-full h-full object-cover rounded-lg" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Photos of the salon */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-neutral-300">
                        Fotos do Ambiente do Salão
                      </label>
                      <span className="text-[11px] text-neutral-400">Aparecem na aba "Sobre" e Galeria</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {salonImages.map((imgUrl, idx) => (
                        <div key={idx} className="h-20 rounded-xl overflow-hidden border border-neutral-800 relative group bg-neutral-950">
                          <AppImage src={imgUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setSalonImages(salonImages.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 p-1 bg-red-600/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remover foto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}

                      {salonImages.length < 6 && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextImage = DEMO_SALON_GALLERY_PRESETS[salonImages.length % DEMO_SALON_GALLERY_PRESETS.length];
                            setSalonImages([...salonImages, nextImage]);
                          }}
                          className="h-20 rounded-xl border border-dashed border-neutral-700 hover:border-amber-500 flex flex-col items-center justify-center text-neutral-400 hover:text-amber-400 gap-1 text-xs transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>+ Adicionar</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
                <span className="text-xs text-neutral-400">
                  Todas as alterações ficam isoladas no tenant de demonstração.
                </span>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-100 font-bold rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer border border-neutral-700"
                  >
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Salvar Dados</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenClientApp}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Salvar & Visualizar no App</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Services & Pricing */}
        {activeSubTab === 'SERVICES' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-black text-neutral-100">Grade de Serviços da Demonstração</h4>
                <p className="text-xs text-neutral-400">Configure os serviços reais da barbearia do cliente para a apresentação</p>
              </div>

              <button
                onClick={() => {
                  setEditingService(null);
                  setServiceName('');
                  setServiceDesc('');
                  setServicePrice('50.00');
                  setServiceDuration('35');
                  setShowAddServiceModal(true);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>+ Novo Serviço</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {demoServices.map(srv => (
                <div
                  key={srv.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-900 text-amber-400 border border-neutral-800">
                        {srv.category}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-neutral-400 font-mono">
                        <Clock className="w-3.5 h-3.5 text-neutral-500" />
                        <span>{srv.durationMinutes} min</span>
                      </div>
                    </div>

                    <h5 className="font-black text-neutral-100 text-sm">{srv.name}</h5>
                    <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">{srv.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between">
                    <div className="text-base font-black text-emerald-400 font-mono">
                      R$ {srv.price.toFixed(2).replace('.', ',')}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingService(srv);
                          setServiceName(srv.name);
                          setServiceDesc(srv.description);
                          setServiceCategory(srv.category);
                          setServicePrice(srv.price.toString());
                          setServiceDuration(srv.durationMinutes.toString());
                          setServiceImage(srv.imageUrl);
                          setShowAddServiceModal(true);
                        }}
                        className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-lg text-xs"
                        title="Editar serviço"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Professionals / Barbers */}
        {activeSubTab === 'PROFESSIONALS' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-black text-neutral-100">Equipe de Barbeiros da Demonstração</h4>
                <p className="text-xs text-neutral-400">Adicione os barbeiros reais da barbearia do cliente ou use os profissionais modelo</p>
              </div>

              <button
                onClick={() => {
                  setEditingProf(null);
                  setProfName('');
                  setProfSpecialties('Degradê Navalhado, Barba Terapia');
                  setProfWhatsapp('(11) 98888-7777');
                  setShowAddProfModal(true);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>+ Novo Barbeiro</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {demoProfessionals.map(prof => (
                <div
                  key={prof.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 flex items-center gap-4 hover:border-neutral-700 transition-all"
                >
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-700 shrink-0">
                    <AppImage src={prof.avatarUrl} alt={prof.name} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {prof.role === 'PROPRIETARIO' ? 'Dono / Master' : 'Barbeiro'}
                      </span>

                      <button
                        onClick={() => {
                          setEditingProf(prof);
                          setProfName(prof.name);
                          setProfSpecialties(prof.specialties?.join(', ') || 'Corte, Barba');
                          setProfWhatsapp(prof.whatsapp);
                          setProfAvatar(prof.avatarUrl || DEMO_AVATAR_PRESETS[0]);
                          setShowAddProfModal(true);
                        }}
                        className="p-1 text-neutral-400 hover:text-white"
                        title="Editar profissional"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h5 className="font-black text-neutral-100 text-sm truncate">{prof.name}</h5>
                    <p className="text-[11px] text-neutral-400 truncate">
                      {prof.specialties?.join(' • ') || 'Especialista em Cortes & Barba'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Location, Contact & Social */}
        {activeSubTab === 'LOCATION_INFO' && (
          <div className="p-6 space-y-6">
            <form onSubmit={handleSaveIdentity} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contact Information */}
                <div className="space-y-4 bg-neutral-950 border border-neutral-800 rounded-2xl p-5">
                  <h5 className="font-black text-neutral-100 text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4 text-amber-400" />
                    <span>Canais de Contato</span>
                  </h5>

                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1">Telefone Fixo / Recepção</label>
                    <input
                      type="text"
                      value={phoneText}
                      onChange={e => setPhoneText(e.target.value)}
                      placeholder="(11) 3456-7890"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1">WhatsApp de Contato</label>
                    <input
                      type="text"
                      value={whatsappText}
                      onChange={e => setWhatsappText(e.target.value)}
                      placeholder="(11) 99999-8888"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1">Instagram da Barbearia</label>
                    <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs">
                      <Instagram className="w-3.5 h-3.5 text-pink-400 mr-1.5" />
                      <input
                        type="text"
                        value={instagramText}
                        onChange={e => setInstagramText(e.target.value)}
                        placeholder="@barbeariadojoao"
                        className="bg-transparent text-neutral-100 focus:outline-none flex-1 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Location Information */}
                <div className="space-y-4 bg-neutral-950 border border-neutral-800 rounded-2xl p-5">
                  <h5 className="font-black text-neutral-100 text-sm flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    <span>Endereço Completo</span>
                  </h5>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-neutral-300 mb-1">Logradouro / Rua</label>
                      <input
                        type="text"
                        value={streetText}
                        onChange={e => setStreetText(e.target.value)}
                        placeholder="Av. Paulista"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 mb-1">Número</label>
                      <input
                        type="text"
                        value={numberText}
                        onChange={e => setNumberText(e.target.value)}
                        placeholder="1200"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 mb-1">Bairro</label>
                      <input
                        type="text"
                        value={neighborhoodText}
                        onChange={e => setNeighborhoodText(e.target.value)}
                        placeholder="Bela Vista"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 mb-1">Cidade</label>
                      <input
                        type="text"
                        value={cityText}
                        onChange={e => setCityText(e.target.value)}
                        placeholder="São Paulo"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 mb-1">Estado</label>
                      <input
                        type="text"
                        value={stateText}
                        onChange={e => setStateText(e.target.value)}
                        placeholder="SP"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500 uppercase"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Endereço & Contatos</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 5: Visual Style & Brand Theme */}
        {activeSubTab === 'STYLE' && (
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <h4 className="text-base font-black text-neutral-100">Cor de Destaque da Barbearia</h4>
              <p className="text-xs text-neutral-400">
                Escolha a paleta de cores para os botões, crachás e detalhes no aplicativo do cliente
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { name: 'Laranja Clássico My Barber', color: '#FF6B00' },
                  { name: 'Âmbar Dourado Premium', color: '#F59E0B' },
                  { name: 'Dourado Whisky Don Corleone', color: '#D97706' },
                  { name: 'Verde Esmeralda Vintage', color: '#10B981' },
                  { name: 'Azul Ciano Studio Fade', color: '#06B6D4' },
                  { name: 'Vermelho Navalhete Intenso', color: '#EF4444' },
                  { name: 'Prata Platinum Elegance', color: '#94A3B8' },
                  { name: 'Roxo Royal Club', color: '#8B5CF6' }
                ].map(theme => (
                  <button
                    key={theme.color}
                    type="button"
                    onClick={() => {
                      setPrimaryColor(theme.color);
                      updateBarbershop({ primaryColor: theme.color }, 'barbershop-commercial-demo');
                      setSuccessToast(`Cor "${theme.name}" selecionada!`);
                      setTimeout(() => setSuccessToast(null), 3000);
                    }}
                    className={`p-4 rounded-2xl border bg-neutral-950 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                      primaryColor === theme.color
                        ? 'border-white ring-2 ring-white/50 scale-105'
                        : 'border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-neutral-950 font-black text-xs"
                      style={{ backgroundColor: theme.color }}
                    >
                      {primaryColor === theme.color && <Check className="w-5 h-5" />}
                    </div>
                    <span className="text-xs font-bold text-neutral-200 text-center">{theme.name}</span>
                    <span className="text-[10px] text-neutral-500 font-mono">{theme.color}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Add / Edit Service */}
      {showAddServiceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h4 className="font-black text-neutral-100 text-base">
              {editingService ? 'Editar Serviço' : 'Novo Serviço para Demonstração'}
            </h4>

            <form onSubmit={handleSaveService} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Nome do Serviço</label>
                <input
                  type="text"
                  required
                  value={serviceName}
                  onChange={e => setServiceName(e.target.value)}
                  placeholder="Ex: Corte Degradê Navalhado"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Categoria</label>
                  <select
                    value={serviceCategory}
                    onChange={e => setServiceCategory(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Cabelo">Cabelo</option>
                    <option value="Barba">Barba</option>
                    <option value="Combos">Combos</option>
                    <option value="Estética">Estética</option>
                    <option value="Química">Química</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Duração (Minutos)</label>
                  <input
                    type="number"
                    required
                    min="5"
                    max="300"
                    value={serviceDuration}
                    onChange={e => setServiceDuration(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Preço (R$)</label>
                <input
                  type="number"
                  step="0.50"
                  required
                  value={servicePrice}
                  onChange={e => setServicePrice(e.target.value)}
                  placeholder="50.00"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={serviceDesc}
                  onChange={e => setServiceDesc(e.target.value)}
                  placeholder="Detalhes do serviço..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowAddServiceModal(false)}
                  className="px-3.5 py-2 bg-neutral-800 text-neutral-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl text-xs shadow-lg flex items-center gap-1.5 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Serviço</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add / Edit Professional */}
      {showAddProfModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h4 className="font-black text-neutral-100 text-base">
              {editingProf ? 'Editar Barbeiro' : 'Novo Barbeiro para Demonstração'}
            </h4>

            <form onSubmit={handleSaveProfessional} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Nome do Barbeiro</label>
                <input
                  type="text"
                  required
                  value={profName}
                  onChange={e => setProfName(e.target.value)}
                  placeholder="Ex: Carlos Navalha"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Especialidades (separadas por vírgula)</label>
                <input
                  type="text"
                  value={profSpecialties}
                  onChange={e => setProfSpecialties(e.target.value)}
                  placeholder="Degradê, Barboterapia, Visagismo"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">WhatsApp Fictício / Contato</label>
                <input
                  type="text"
                  value={profWhatsapp}
                  onChange={e => setProfWhatsapp(e.target.value)}
                  placeholder="(11) 98888-7777"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-2">Foto / Avatar do Barbeiro</label>
                <div className="grid grid-cols-6 gap-2">
                  {DEMO_AVATAR_PRESETS.map((avatar, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setProfAvatar(avatar)}
                      className={`aspect-square rounded-xl overflow-hidden border-2 transition-all p-0.5 bg-neutral-950 cursor-pointer ${
                        profAvatar === avatar ? 'border-amber-500 scale-105' : 'border-neutral-800 hover:border-neutral-600'
                      }`}
                    >
                      <AppImage src={avatar} alt="Avatar" className="w-full h-full object-cover rounded-lg" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowAddProfModal(false)}
                  className="px-3.5 py-2 bg-neutral-800 text-neutral-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl text-xs shadow-lg flex items-center gap-1.5 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Barbeiro</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
