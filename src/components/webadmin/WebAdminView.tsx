import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Building2,
  Users,
  Scissors,
  Calendar,
  Package,
  DollarSign,
  Settings,
  Plus,
  Clock,
  Cake,
  AlertTriangle,
  CheckCircle2,
  Send,
  Globe,
  Share2,
  Phone,
  Eye,
  EyeOff,
  Percent,
  FileText,
  Boxes,
  CalendarCheck,
  Gift,
  Tag,
  Camera,
  Upload,
  Pencil,
  Image as ImageIcon,
  CreditCard,
  ArrowUp,
  MapPin
} from 'lucide-react';
import { MY_BARBER_PLANS, UserRole, Service, WeeklyBusinessHours, BarbershopAddress } from '../../types';
import { DEFAULT_WEEKLY_BUSINESS_HOURS } from '../../data/initialData';
import { ProfessionalsTab } from './ProfessionalsTab';
import { AppointmentsTab } from './AppointmentsTab';
import { RafflesTab } from './RafflesTab';
import { PromotionsTab } from './PromotionsTab';
import { GalleryTab } from './GalleryTab';
import { BusinessHoursTable } from './BusinessHoursTable';
import { MySubscriptionView } from '../subscription/MySubscriptionView';
import { AppImage } from '../common/AppImage';
import { ImageEditModal, ImagePreset } from '../common/ImageEditModal';
import { ThemeSelectorCard } from './ThemeSelectorCard';
import { getThemeCssVariables } from '../../utils/theme';
import { ThemeModeToggle } from '../common/ThemeModeToggle';
import { SaveButton } from '../common/SaveButton';
import { UnsavedChangesModal } from '../common/UnsavedChangesModal';
import { InstagramIcon, FacebookIcon, TikTokIcon } from '../common/SocialMediaIcons';

export const WebAdminView: React.FC = () => {
  const {
    currentBarbershop,
    updateBarbershop,
    tenantUsers,
    professionals,
    clients,
    services,
    appointments,
    raffles,
    promotions,
    communications,
    returnMessages,
    addService,
    updateService,
    sendReturnMessage,
    createCommunication,
    currentUser,
    galleryWorks,
    uploadMedia,
    getBarbershopDirectUrl,
    setViewMode,
    isPastDue,
    isSuspended,
    toleranceDaysRemaining
  } = useApp();

  const [activeTab, setActiveTab] = useState<
    'DASHBOARD' | 'APPOINTMENTS' | 'GALLERY' | 'PROFESSIONALS' | 'RAFFLES' | 'PROMOTIONS' | 'SERVICES' | 'CLIENTS' | 'FINANCIAL' | 'SUBSCRIPTION' | 'SETTINGS'
  >('DASHBOARD');

  const [copiedLink, setCopiedLink] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Monitor scroll to show subtle floating button when page is scrolled
  useEffect(() => {
    const checkScroll = () => {
      if (window.scrollY > 280) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener('scroll', checkScroll, { passive: true });
    return () => window.removeEventListener('scroll', checkScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Quick Image Edit Modal States
  const [showLogoEditModal, setShowLogoEditModal] = useState(false);
  const [showBannerEditModal, setShowBannerEditModal] = useState(false);
  const [editingSalonImageIdx, setEditingSalonImageIdx] = useState<number | null>(null);
  const [isAddingSalonImage, setIsAddingSalonImage] = useState(false);
  const [editingServiceForImage, setEditingServiceForImage] = useState<Service | null>(null);

  // Barbershop Settings Form state (Buffered for explicit saving)
  const [settingsName, setSettingsName] = useState(currentBarbershop.name || '');
  const [settingsAbout, setSettingsAbout] = useState(currentBarbershop.about || '');
  const [settingsWhatsapp, setSettingsWhatsapp] = useState(currentBarbershop.whatsapp || '');
  const [settingsInstagram, setSettingsInstagram] = useState(currentBarbershop.socialMedia?.instagram || '');
  const [settingsFacebook, setSettingsFacebook] = useState(currentBarbershop.socialMedia?.facebook || '');
  const [settingsTiktok, setSettingsTiktok] = useState(currentBarbershop.socialMedia?.tiktok || '');
  const [settingsReminderMinutes, setSettingsReminderMinutes] = useState(currentBarbershop.reminderConfig?.advanceMinutes || 60);
  const [settingsLogoUrl, setSettingsLogoUrl] = useState(currentBarbershop.logoUrl || '');
  const [settingsBannerUrl, setSettingsBannerUrl] = useState(currentBarbershop.bannerUrl || '');
  const [settingsSalonImages, setSettingsSalonImages] = useState<string[]>(currentBarbershop.salonImages || []);
  const [settingsAddress, setSettingsAddress] = useState<BarbershopAddress>(
    currentBarbershop.address || {
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: 'SP',
      zipCode: ''
    }
  );
  const [settingsBusinessHours, setSettingsBusinessHours] = useState<WeeklyBusinessHours>(
    currentBarbershop.businessHours || DEFAULT_WEEKLY_BUSINESS_HOURS
  );

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSettingsSaved, setIsSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Guard when leaving settings tab with unsaved changes
  const [pendingTabChange, setPendingTabChange] = useState<typeof activeTab | null>(null);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);

  // Sync settings when currentBarbershop ID or instance changes externally
  useEffect(() => {
    setSettingsName(currentBarbershop.name || '');
    setSettingsAbout(currentBarbershop.about || '');
    setSettingsWhatsapp(currentBarbershop.whatsapp || '');
    setSettingsInstagram(currentBarbershop.socialMedia?.instagram || '');
    setSettingsFacebook(currentBarbershop.socialMedia?.facebook || '');
    setSettingsTiktok(currentBarbershop.socialMedia?.tiktok || '');
    setSettingsReminderMinutes(currentBarbershop.reminderConfig?.advanceMinutes || 60);
    setSettingsLogoUrl(currentBarbershop.logoUrl || '');
    setSettingsBannerUrl(currentBarbershop.bannerUrl || '');
    setSettingsSalonImages(currentBarbershop.salonImages || []);
    setSettingsAddress(
      currentBarbershop.address || {
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: 'SP',
        zipCode: ''
      }
    );
    setSettingsBusinessHours(currentBarbershop.businessHours || DEFAULT_WEEKLY_BUSINESS_HOURS);
  }, [currentBarbershop.id, currentBarbershop.businessHours, currentBarbershop.address, currentBarbershop.socialMedia]);

  const isSettingsDirty = useMemo(() => {
    const currentAddr = currentBarbershop.address || {
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: 'SP',
      zipCode: ''
    };

    return (
      settingsName.trim() !== (currentBarbershop.name || '').trim() ||
      settingsAbout.trim() !== (currentBarbershop.about || '').trim() ||
      settingsWhatsapp.trim() !== (currentBarbershop.whatsapp || '').trim() ||
      settingsInstagram.trim() !== (currentBarbershop.socialMedia?.instagram || '').trim() ||
      settingsFacebook.trim() !== (currentBarbershop.socialMedia?.facebook || '').trim() ||
      settingsTiktok.trim() !== (currentBarbershop.socialMedia?.tiktok || '').trim() ||
      Number(settingsReminderMinutes) !== (currentBarbershop.reminderConfig?.advanceMinutes || 60) ||
      settingsLogoUrl !== (currentBarbershop.logoUrl || '') ||
      settingsBannerUrl !== (currentBarbershop.bannerUrl || '') ||
      JSON.stringify(settingsSalonImages) !== JSON.stringify(currentBarbershop.salonImages || []) ||
      JSON.stringify(settingsAddress) !== JSON.stringify(currentAddr) ||
      JSON.stringify(settingsBusinessHours) !== JSON.stringify(currentBarbershop.businessHours || DEFAULT_WEEKLY_BUSINESS_HOURS)
    );
  }, [
    settingsName,
    settingsAbout,
    settingsWhatsapp,
    settingsInstagram,
    settingsFacebook,
    settingsTiktok,
    settingsReminderMinutes,
    settingsLogoUrl,
    settingsBannerUrl,
    settingsSalonImages,
    settingsAddress,
    settingsBusinessHours,
    currentBarbershop
  ]);

  const handleSaveSettings = async () => {
    try {
      setIsSavingSettings(true);
      setSettingsError(null);
      await updateBarbershop({
        name: settingsName.trim(),
        about: settingsAbout.trim(),
        whatsapp: settingsWhatsapp.trim(),
        socialMedia: {
          ...currentBarbershop.socialMedia,
          instagram: settingsInstagram.trim(),
          facebook: settingsFacebook.trim(),
          tiktok: settingsTiktok.trim()
        },
        address: {
          street: settingsAddress.street.trim(),
          number: settingsAddress.number.trim(),
          complement: settingsAddress.complement?.trim() || '',
          neighborhood: settingsAddress.neighborhood.trim(),
          city: settingsAddress.city.trim(),
          state: settingsAddress.state.trim().toUpperCase(),
          zipCode: settingsAddress.zipCode.trim()
        },
        reminderConfig: {
          ...currentBarbershop.reminderConfig,
          advanceMinutes: Number(settingsReminderMinutes) || 60
        },
        logoUrl: settingsLogoUrl,
        bannerUrl: settingsBannerUrl,
        salonImages: settingsSalonImages,
        businessHours: settingsBusinessHours
      });
      setIsSettingsSaved(true);
      setTimeout(() => {
        setIsSettingsSaved(false);
      }, 3000);
    } catch (err: any) {
      setSettingsError(err?.message || 'Erro ao salvar alterações da barbearia.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTabClick = (nextTab: typeof activeTab) => {
    if (activeTab === 'SETTINGS' && isSettingsDirty && nextTab !== 'SETTINGS') {
      setPendingTabChange(nextTab);
      setShowUnsavedChangesModal(true);
      return;
    }
    setActiveTab(nextTab);
  };

  // Service modal states & dirty tracking
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState(50);
  const [newServiceDuration, setNewServiceDuration] = useState(30);
  const [newServiceCategory, setNewServiceCategory] = useState('Cabelo');
  const [newServiceReturnDays, setNewServiceReturnDays] = useState(25);
  const [newServiceImageUrl, setNewServiceImageUrl] = useState('https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600');
  const [isSavingService, setIsSavingService] = useState(false);
  const [isServiceSaved, setIsServiceSaved] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [showServiceUnsavedModal, setShowServiceUnsavedModal] = useState(false);

  const plan = MY_BARBER_PLANS[currentBarbershop.planId] || Object.values(MY_BARBER_PLANS)[0];
  const staffMembers = tenantUsers.filter(
    u => u.role === 'PROFISSIONAL' || u.role === 'PROPRIETARIO' || u.role === 'GERENTE'
  );

  // Financial calculations
  const totalRevenue = appointments
    .filter(a => a.status === 'AGENDADO' || a.status === 'CONCLUIDO')
    .reduce((sum, a) => sum + a.servicePrice, 0);

  const totalCommissions = appointments
    .filter(a => a.status === 'AGENDADO' || a.status === 'CONCLUIDO')
    .reduce((sum, a) => {
      const prof = professionals.find(p => p.id === a.professionalId);
      const rate = prof?.commissionPercentage || 40;
      return sum + (a.servicePrice * rate) / 100;
    }, 0);

  const netIncome = totalRevenue - totalCommissions;

  // Birthday clients for current month (August)
  const currentMonth = 8;
  const birthdayClients = clients.filter(c => {
    if (!c.birthDate) return false;
    const birthMonth = parseInt(c.birthDate.split('-')[1], 10);
    return birthMonth === currentMonth;
  });

  const openAddServiceModal = () => {
    setEditingService(null);
    setNewServiceName('');
    setNewServicePrice(50);
    setNewServiceDuration(30);
    setNewServiceCategory('Cabelo');
    setNewServiceReturnDays(25);
    setNewServiceImageUrl('https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600');
    setServiceError(null);
    setShowAddServiceModal(true);
  };

  const openEditServiceModal = (service: Service) => {
    setEditingService(service);
    setNewServiceName(service.name);
    setNewServicePrice(service.price);
    setNewServiceDuration(service.durationMinutes);
    setNewServiceCategory(service.category);
    setNewServiceReturnDays(service.returnReminderDays || 25);
    setNewServiceImageUrl(service.imageUrl || 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600');
    setServiceError(null);
    setShowAddServiceModal(true);
  };

  const isServiceDirty = useMemo(() => {
    if (!editingService) {
      return newServiceName.trim().length > 0;
    }
    return (
      newServiceName.trim() !== editingService.name ||
      newServicePrice !== editingService.price ||
      newServiceDuration !== editingService.durationMinutes ||
      newServiceCategory !== editingService.category ||
      newServiceReturnDays !== (editingService.returnReminderDays || 25) ||
      newServiceImageUrl !== (editingService.imageUrl || '')
    );
  }, [
    editingService,
    newServiceName,
    newServicePrice,
    newServiceDuration,
    newServiceCategory,
    newServiceReturnDays,
    newServiceImageUrl
  ]);

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) {
      setServiceError('Por favor, informe o nome do serviço.');
      return;
    }
    try {
      setIsSavingService(true);
      setServiceError(null);
      if (editingService) {
        await updateService(editingService.id, {
          name: newServiceName.trim(),
          price: Number(newServicePrice),
          durationMinutes: Number(newServiceDuration),
          category: newServiceCategory,
          imageUrl: newServiceImageUrl,
          returnReminderDays: Number(newServiceReturnDays)
        });
      } else {
        await addService({
          tenantId: currentBarbershop.id,
          name: newServiceName.trim(),
          description: 'Serviço profissional de barbearia',
          price: Number(newServicePrice),
          durationMinutes: Number(newServiceDuration),
          category: newServiceCategory,
          imageUrl: newServiceImageUrl,
          returnReminderDays: Number(newServiceReturnDays),
          active: true
        });
      }
      setIsServiceSaved(true);
      setTimeout(() => {
        setIsServiceSaved(false);
        setShowAddServiceModal(false);
        setEditingService(null);
      }, 700);
    } catch (err: any) {
      setServiceError(err?.message || 'Erro ao salvar serviço.');
    } finally {
      setIsSavingService(false);
    }
  };

  const handleCloseServiceModal = () => {
    if (isServiceDirty && !isServiceSaved) {
      setShowServiceUnsavedModal(true);
      return;
    }
    setShowAddServiceModal(false);
    setEditingService(null);
  };

  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"
      style={getThemeCssVariables(currentBarbershop.theme)}
    >
      {/* Header bar of WebAdmin */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Proprietário / Gerente • Gestão da Barbearia
            </span>
            <span className="text-xs text-neutral-400">Usuário: <strong>{currentUser.name}</strong> ({currentUser.role})</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-100 font-heading mt-1">
            {currentBarbershop.name}
          </h1>
          <p className="text-xs text-neutral-400">
            Painel administrativo exclusivo | Plano: <strong className="text-amber-400">{plan.name}</strong> ({plan.priceMonthly.toFixed(2).replace('.', ',')}/mês)
          </p>
        </div>

        <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
          <ThemeModeToggle />

          {/* Plan Limit badge */}
          <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-2xl flex items-center gap-3">
          <Users className="w-5 h-5 text-orange-400" />
          <div>
            <div className="text-xs font-semibold text-neutral-200">
              Equipe: {staffMembers.length} / {plan.maxProfessionals}
            </div>
            <div className="text-[10px] text-neutral-400">
              (proprietário, gerente e barbeiros)
            </div>
            <div className="w-28 bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-orange-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, (staffMembers.length / plan.maxProfessionals) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Link de Divulgação Exclusivo da Barbearia no My Barber */}
      <div className="my-4 bg-gradient-to-r from-orange-500/15 via-neutral-900 to-neutral-900 border border-orange-500/40 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl overflow-hidden">
        <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto flex-1">
          <div className="w-11 h-11 rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0 shadow-md">
            <Share2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-neutral-100 uppercase tracking-wider font-heading truncate">
                Endereço Exclusivo no My Barber
              </span>
              <span className="bg-orange-500 text-neutral-950 text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                Exclusivo
              </span>
            </div>
            <p className="text-xs text-neutral-300 mt-0.5 break-words">
              Seus clientes entram direto na sua página, carregando somente seus serviços, profissionais e fotos.
            </p>
            <div className="text-xs sm:text-sm font-mono text-orange-400 font-extrabold mt-1.5 select-all bg-neutral-950/80 px-3 py-1.5 rounded-xl border border-neutral-800 break-all max-w-full inline-block">
              https://{currentBarbershop.slug}.mybarberbr.com.br
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            onClick={() => {
              const url = `https://${currentBarbershop.slug}.mybarberbr.com.br`;
              navigator.clipboard.writeText(url);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 3000);
            }}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md cursor-pointer"
            title="Copiar link exclusivo para enviar aos clientes ou colocar no Instagram"
          >
            {copiedLink ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Link Copiado!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>Copiar Link Exclusivo</span>
              </>
            )}
          </button>

          <button
            onClick={() => setViewMode('CLIENT_APP')}
            className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Visualizar a página pública como o cliente vê"
          >
            <Eye className="w-4 h-4 text-orange-400" />
            <span className="hidden md:inline">Ver App do Cliente</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 my-6 overflow-x-auto border-b border-neutral-800 pb-2">
        {[
          { id: 'DASHBOARD', label: 'Visão Geral', icon: Building2 },
          { id: 'SUBSCRIPTION', label: 'Minha Assinatura', icon: CreditCard, highlight: isPastDue || isSuspended },
          { id: 'SETTINGS', label: 'Identidade & Fotos', icon: Settings },
          { id: 'APPOINTMENTS', label: `Agendamentos (${appointments.length})`, icon: CalendarCheck },
          { id: 'GALLERY', label: `Galeria & Portfólio (${galleryWorks.length})`, icon: Camera },
          { id: 'PROFESSIONALS', label: `Profissionais (${professionals.length})`, icon: Users },
          { id: 'RAFFLES', label: `Sorteios (${raffles.filter(r => r.status === 'ATIVO').length})`, icon: Gift },
          { id: 'PROMOTIONS', label: `Promoções (${promotions.filter(p => p.active).length})`, icon: Tag },
          { id: 'SERVICES', label: `Serviços (${services.length})`, icon: Scissors },
          { id: 'CLIENTS', label: `Clientes (${clients.length})`, icon: Calendar },
          { id: 'FINANCIAL', label: 'Relatórios & Comissões', icon: DollarSign }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id as any)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-neutral-800 text-amber-400 border border-neutral-700'
                  : tab.highlight
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. DASHBOARD */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => handleTabClick('APPOINTMENTS')}
              className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-amber-500/40 rounded-2xl p-4 transition-all cursor-pointer shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-semibold">Agendamentos</span>
                <CalendarCheck className="w-5 h-5 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-neutral-100 mt-2 font-mono">
                {appointments.filter(a => a.status === 'AGENDADO').length}
              </div>
              <div className="flex items-center gap-1 text-xs text-amber-400 mt-1 font-medium">
                <span>Ver agenda de hoje</span>
                <span>→</span>
              </div>
            </div>

            <div
              onClick={() => handleTabClick('FINANCIAL')}
              className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-emerald-500/40 rounded-2xl p-4 transition-all cursor-pointer shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-semibold">Faturamento</span>
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">
                R$ {totalRevenue.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-xs text-neutral-400 mt-1 font-normal">
                Líquido: <strong className="text-emerald-300 font-semibold font-mono">R$ {netIncome.toFixed(2).replace('.', ',')}</strong>
              </div>
            </div>

            <div
              onClick={() => setActiveTab('CLIENTS')}
              className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-purple-500/40 rounded-2xl p-4 transition-all cursor-pointer shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-semibold">Aniversariantes</span>
                <Cake className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-purple-400 mt-2 font-mono">
                {birthdayClients.length}
              </div>
              <div className="text-xs text-purple-300 mt-1 font-medium">
                Fidelização & WhatsApp →
              </div>
            </div>
          </div>

          {/* Quick Visual Agenda Preview */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-500" />
                <h3 className="font-semibold text-neutral-100 text-sm">
                  Próximos Horários & Atendimentos
                </h3>
              </div>
              <button
                onClick={() => setActiveTab('APPOINTMENTS')}
                className="text-xs text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1 bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/20"
              >
                <span>Abrir Agenda Completa</span>
                <span>→</span>
              </button>
            </div>

            {appointments.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-xs">
                Nenhum agendamento registrado ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {appointments.slice(0, 6).map(apt => (
                  <div
                    key={apt.id}
                    onClick={() => setActiveTab('APPOINTMENTS')}
                    className="bg-neutral-950 hover:bg-neutral-850 p-3.5 rounded-2xl border border-neutral-800 hover:border-neutral-700 transition-all flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col items-center justify-center text-center">
                        <span className="text-xs font-bold text-orange-400 font-mono">{apt.startTime}</span>
                        <span className="text-[9px] text-neutral-500">{apt.date.split('-').reverse().slice(0, 2).join('/')}</span>
                      </div>
                      <div>
                        <div className="font-extrabold text-neutral-100 text-xs">{apt.clientName}</div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5">
                          <Scissors className="w-3 h-3 text-orange-400" />
                          <span>{apt.serviceName}</span>
                          <span>•</span>
                          <span className="text-neutral-300">{apt.professionalName}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-400 font-mono block">
                        R$ {apt.servicePrice.toFixed(2).replace('.', ',')}
                      </span>
                      <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded mt-1 ${
                        apt.status === 'CONCLUIDO'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : apt.status === 'CANCELADO'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {apt.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. AGENDAMENTOS DOS PROFISSIONAIS */}
      {activeTab === 'APPOINTMENTS' && <AppointmentsTab />}

      {/* 3. GALERIA & PORTFÓLIO DE CORTES */}
      {activeTab === 'GALLERY' && <GalleryTab />}

      {/* 4. PROFISSIONAIS */}
      {activeTab === 'PROFESSIONALS' && <ProfessionalsTab />}

      {/* 4. SORTEIOS */}
      {activeTab === 'RAFFLES' && <RafflesTab />}

      {/* 5. PROMOÇÕES */}
      {activeTab === 'PROMOTIONS' && <PromotionsTab />}

      {/* 3. SERVIÇOS & JORNADAS */}
      {activeTab === 'SERVICES' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-neutral-100 text-lg font-heading">
                Serviços Cadastrados
              </h3>
              <p className="text-xs text-neutral-400">
                Durações, valores e período para mensagens de retorno automáticas
              </p>
            </div>

            <button
              onClick={openAddServiceModal}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Serviço</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map(srv => (
              <div key={srv.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col justify-between group">
                <div className="relative h-36 bg-neutral-950 overflow-hidden">
                  <AppImage
                    src={srv.imageUrl || 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400'}
                    alt={srv.name}
                    fallbackType="service"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-black/40"></div>
                  
                  <div className="absolute top-2.5 left-2.5">
                    <span className="text-[10px] font-bold bg-neutral-950/80 backdrop-blur-sm text-neutral-200 px-2 py-0.5 rounded-full border border-neutral-700">
                      {srv.category}
                    </span>
                  </div>

                  <div className="absolute top-2.5 right-2.5">
                    <span className="text-xs font-black bg-emerald-500/90 text-neutral-950 px-2 py-0.5 rounded-full shadow">
                      R$ {srv.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  {/* Edit Photo Button with Pencil */}
                  <button
                    type="button"
                    onClick={() => setEditingServiceForImage(srv)}
                    className="absolute bottom-2 right-2 bg-neutral-900/90 hover:bg-orange-500 hover:text-neutral-950 text-neutral-200 border border-neutral-700 hover:border-orange-500 p-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer shadow-md backdrop-blur-sm opacity-90 group-hover:opacity-100 transition-all"
                    title="Editar foto do serviço (upload ou link)"
                  >
                    <Pencil className="w-3 h-3 text-orange-400 group-hover:text-neutral-950" />
                    <span>Alterar Foto</span>
                  </button>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-bold text-neutral-100 text-sm">{srv.name}</h4>
                      <button
                        type="button"
                        onClick={() => openEditServiceModal(srv)}
                        className="p-1 text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 rounded transition-colors cursor-pointer"
                        title="Editar Serviço"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed mb-3">{srv.description}</p>
                  </div>

                  <div className="pt-3 border-t border-neutral-800/80 text-xs text-neutral-300 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Duração:
                      </span>
                      <strong>{srv.durationMinutes} minutos</strong>
                    </div>
                    {srv.returnReminderDays && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Retorno sugerido:</span>
                        <strong className="text-blue-400">{srv.returnReminderDays} dias</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add / Edit Service Modal */}
          {showAddServiceModal && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 text-neutral-100 shadow-2xl">
                <h3 className="text-lg font-bold mb-1 font-heading">
                  {editingService ? 'Editar Serviço' : 'Cadastrar Novo Serviço'}
                </h3>
                <p className="text-xs text-neutral-400 mb-4">
                  {editingService ? 'Altere as informações abaixo e clique em salvar.' : 'Preencha os dados do novo serviço da barbearia.'}
                </p>

                {serviceError && (
                  <div className="mb-4 p-3 bg-red-950/50 border border-red-800 rounded-xl text-red-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{serviceError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveService} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Nome do Serviço</label>
                    <input
                      type="text"
                      required
                      value={newServiceName}
                      onChange={e => setNewServiceName(e.target.value)}
                      placeholder="Ex: Barba Terapia & Hidratação"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Foto Ilustrativa do Serviço</label>
                    <div className="flex items-center gap-2">
                      <AppImage
                        src={newServiceImageUrl}
                        alt="Preview"
                        fallbackType="service"
                        className="w-12 h-12 rounded-lg object-cover border border-neutral-700 bg-neutral-950 shrink-0"
                      />
                      <div className="flex-1 space-y-1">
                        <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-bold cursor-pointer border border-neutral-700">
                          <Upload className="w-3 h-3 text-amber-400" />
                          <span>Upload Imagem</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                try {
                                  const url = await uploadMedia(file, 'services');
                                  setNewServiceImageUrl(url);
                                } catch (err) {
                                  console.error(err);
                                }
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        <input
                          type="text"
                          value={newServiceImageUrl}
                          onChange={e => setNewServiceImageUrl(e.target.value)}
                          placeholder="Ou cole a URL da foto"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">Preço (R$)</label>
                      <input
                        type="number"
                        step="0.5"
                        required
                        value={newServicePrice}
                        onChange={e => setNewServicePrice(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">Duração (min)</label>
                      <input
                        type="number"
                        step="5"
                        required
                        value={newServiceDuration}
                        onChange={e => setNewServiceDuration(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">Categoria</label>
                      <select
                        value={newServiceCategory}
                        onChange={e => setNewServiceCategory(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="Cabelo">Cabelo</option>
                        <option value="Barba">Barba</option>
                        <option value="Combos">Combos</option>
                        <option value="Estética">Estética</option>
                        <option value="Química">Química</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">Retorno (dias)</label>
                      <input
                        type="number"
                        value={newServiceReturnDays}
                        onChange={e => setNewServiceReturnDays(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={handleCloseServiceModal}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <SaveButton
                      isDirty={isServiceDirty}
                      isLoading={isSavingService}
                      isSaved={isServiceSaved}
                      type="submit"
                      label={editingService ? 'Salvar alterações' : 'Salvar Serviço'}
                    />
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Unsaved changes confirmation for service modal */}
          <UnsavedChangesModal
            isOpen={showServiceUnsavedModal}
            onContinueEditing={() => setShowServiceUnsavedModal(false)}
            onDiscard={() => {
              setShowServiceUnsavedModal(false);
              setShowAddServiceModal(false);
              setEditingService(null);
            }}
          />
        </div>
      )}

      {/* 4. CLIENTES & ANIVERSARIANTES */}
      {activeTab === 'CLIENTS' && (
        <div className="space-y-6">
          {/* Birthday special area (Seção 21) */}
          <div className="bg-purple-950/30 border border-purple-800/40 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Cake className="w-5 h-5 text-purple-400" />
              <h3 className="font-bold text-purple-200 text-base font-heading">
                Aniversariantes do Mês de Agosto (Seção 21)
              </h3>
            </div>
            <p className="text-xs text-purple-300/80 mb-4">
              Identifique clientes aniversariantes para enviar mensagens de felicitações e promoções exclusivas.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {birthdayClients.map(c => (
                <div key={c.id} className="bg-neutral-900/90 border border-purple-500/30 p-3.5 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-neutral-100 text-xs">{c.name}</div>
                    <div className="text-neutral-400 font-mono text-[11px]">{c.whatsapp}</div>
                    <div className="text-purple-400 font-semibold text-[11px] mt-0.5">
                      Nascimento: {c.birthDate?.split('-').reverse().join('/')}
                    </div>
                  </div>
                  <button
                    onClick={() => alert(`Mensagem de aniversário preparada para ${c.name} via WhatsApp (${c.whatsapp})!`)}
                    className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded-lg text-xs"
                    title="Enviar Mensagem de Aniversário"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Full Client List */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="font-bold text-neutral-100 font-heading text-base mb-4">
              Histórico & Lista Geral de Clientes (Login WhatsApp)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800 uppercase text-[11px]">
                  <tr>
                    <th className="p-3">Nome</th>
                    <th className="p-3">WhatsApp</th>
                    <th className="p-3">Aniversário</th>
                    <th className="p-3">Total de Atendimentos</th>
                    <th className="p-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 text-neutral-300">
                  {clients.map(c => {
                    const aptCount = appointments.filter(a => a.clientId === c.id).length;
                    return (
                      <tr key={c.id} className="hover:bg-neutral-800/40">
                        <td className="p-3 font-semibold text-neutral-100">{c.name}</td>
                        <td className="p-3 font-mono text-neutral-300">{c.whatsapp}</td>
                        <td className="p-3 text-neutral-400">
                          {c.birthDate ? c.birthDate.split('-').reverse().join('/') : '-'}
                        </td>
                        <td className="p-3">
                          <span className="px-2.5 py-0.5 rounded-full bg-neutral-800 font-bold text-neutral-200">
                            {aptCount}
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => alert(`Histórico de ${c.name}: ${aptCount} agendamentos registrados no sistema.`)}
                            className="text-amber-400 hover:underline font-semibold"
                          >
                            Ver Ficha
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. RELATÓRIOS FINANCEIROS & COMISSÕES */}
      {activeTab === 'FINANCIAL' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="text-xs text-neutral-400 font-medium">Faturamento Bruto Total</div>
              <div className="text-2xl font-bold text-neutral-100 mt-1">
                R$ {totalRevenue.toFixed(2).replace('.', ',')}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">Serviços agendados e concluídos</p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="text-xs text-neutral-400 font-medium">Total de Comissões a Pagar</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                R$ {totalCommissions.toFixed(2).replace('.', ',')}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">Calculado conforme % de cada profissional</p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="text-xs text-neutral-400 font-medium">Resultado Líquido do Estabelecimento</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                R$ {netIncome.toFixed(2).replace('.', ',')}
              </div>
              <p className="text-[11px] text-emerald-300 mt-1">Margem operacional da barbearia</p>
            </div>
          </div>

          {/* Commission by Professional */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="font-bold text-neutral-100 font-heading text-base mb-4">
              Demonstrativo de Comissões por Profissional
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800 uppercase text-[11px]">
                  <tr>
                    <th className="p-3">Profissional</th>
                    <th className="p-3">Atendimentos</th>
                    <th className="p-3">Faturamento Gerado</th>
                    <th className="p-3">Taxa (%)</th>
                    <th className="p-3">Comissão Líquida a Receber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 text-neutral-300">
                  {professionals.map(prof => {
                    const profAppointments = appointments.filter(a => a.professionalId === prof.id);
                    const gross = profAppointments.reduce((sum, a) => sum + a.servicePrice, 0);
                    const rate = prof.commissionPercentage || 40;
                    const commission = (gross * rate) / 100;

                    return (
                      <tr key={prof.id} className="hover:bg-neutral-800/40">
                        <td className="p-3 font-semibold text-neutral-100">{prof.name}</td>
                        <td className="p-3">{profAppointments.length} cortes</td>
                        <td className="p-3 font-mono">R$ {gross.toFixed(2).replace('.', ',')}</td>
                        <td className="p-3 font-bold text-neutral-300">{rate}%</td>
                        <td className="p-3 font-bold text-amber-400 font-mono text-sm">
                          R$ {commission.toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. IDENTIDADE DA BARBEARIA & CONFIGURAÇÕES */}
      {activeTab === 'SETTINGS' && (
        <div className="space-y-6">
          {/* Seletor Oficial dos 4 Temas de Cores do App */}
          <ThemeSelectorCard />

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
              <div>
                <h3 className="font-bold text-neutral-100 font-heading text-lg">
                  Identidade Visual & Informações do Estabelecimento (Seções 4 e 25)
                </h3>
                <p className="text-xs text-neutral-400">
                  Esses dados personalizam todo o aplicativo que o seu cliente visualiza.
                </p>
              </div>

              <SaveButton
                isDirty={isSettingsDirty}
                isLoading={isSavingSettings}
                isSaved={isSettingsSaved}
                onClick={handleSaveSettings}
                label="Salvar alterações"
              />
            </div>

            {settingsError && (
              <div className="p-3 bg-red-950/50 border border-red-800 rounded-xl text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{settingsError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Nome da Barbearia</label>
                  <input
                    type="text"
                    value={settingsName}
                    onChange={e => setSettingsName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Endereço Exclusivo da Barbearia (My Barber)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs font-mono text-orange-400 font-bold">
                      https://{currentBarbershop.slug}.mybarberbr.com.br
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `https://${currentBarbershop.slug}.mybarberbr.com.br`;
                        navigator.clipboard.writeText(url);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 3000);
                      }}
                      className="px-3 py-2 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
                    >
                      {copiedLink ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    Identificação exclusiva dentro do domínio oficial mybarberbr.com.br.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Sobre a Barbearia</label>
                  <textarea
                    rows={3}
                    value={settingsAbout}
                    onChange={e => setSettingsAbout(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">WhatsApp de Atendimento</label>
                  <input
                    type="text"
                    value={settingsWhatsapp}
                    onChange={e => setSettingsWhatsapp(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Bloco de Endereço Físico Completo da Barbearia */}
                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-850">
                    <div className="font-bold text-xs text-orange-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Endereço da Barbearia</span>
                    </div>
                    <span className="text-[10px] text-neutral-400">Exibido aos clientes e no Google Maps</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 mb-1">CEP</label>
                      <input
                        type="text"
                        placeholder="00000-000"
                        value={settingsAddress.zipCode}
                        onChange={e => {
                          const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
                          const formatted = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
                          setSettingsAddress(prev => ({ ...prev, zipCode: formatted }));
                        }}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Rua / Logradouro</label>
                      <input
                        type="text"
                        placeholder="Ex: Av. Paulista"
                        value={settingsAddress.street}
                        onChange={e => setSettingsAddress(prev => ({ ...prev, street: e.target.value }))}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Número</label>
                      <input
                        type="text"
                        placeholder="Ex: 1000"
                        value={settingsAddress.number}
                        onChange={e => setSettingsAddress(prev => ({ ...prev, number: e.target.value }))}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Complemento / Ref.</label>
                      <input
                        type="text"
                        placeholder="Ex: Sala 42, Bloco B"
                        value={settingsAddress.complement || ''}
                        onChange={e => setSettingsAddress(prev => ({ ...prev, complement: e.target.value }))}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Bairro</label>
                      <input
                        type="text"
                        placeholder="Ex: Bela Vista"
                        value={settingsAddress.neighborhood}
                        onChange={e => setSettingsAddress(prev => ({ ...prev, neighborhood: e.target.value }))}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Cidade</label>
                      <input
                        type="text"
                        placeholder="Ex: São Paulo"
                        value={settingsAddress.city}
                        onChange={e => setSettingsAddress(prev => ({ ...prev, city: e.target.value }))}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 mb-1">Estado (UF)</label>
                      <input
                        type="text"
                        placeholder="SP"
                        maxLength={2}
                        value={settingsAddress.state}
                        onChange={e => setSettingsAddress(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 uppercase font-mono text-center font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Social Media & Salon Images */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Logo da Barbearia</label>
                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => setShowLogoEditModal(true)}
                      className="relative group cursor-pointer w-14 h-14 rounded-2xl overflow-hidden border-2 border-neutral-700 hover:border-orange-500 bg-neutral-950 shrink-0 transition-colors shadow-md"
                    >
                      <AppImage
                        src={settingsLogoUrl}
                        alt="Logo"
                        fallbackType="logo"
                        className="w-full h-full object-cover"
                      />
                      <div
                        className="absolute inset-0 bg-neutral-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        title="Editar Logo"
                      >
                        <Pencil className="w-4 h-4 text-orange-400" />
                      </div>
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setShowLogoEditModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-orange-500 hover:text-neutral-950 text-neutral-200 rounded-xl text-xs font-bold transition-all border border-neutral-700 hover:border-orange-500 shadow-sm cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 text-orange-400" />
                        <span>Alterar Logo (Upload ou Link)</span>
                      </button>
                      <p className="text-[10px] text-neutral-500">
                        Recomendado formato quadrado (PNG com fundo transparente ou JPG).
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Banner de Capa</label>
                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => setShowBannerEditModal(true)}
                      className="relative group cursor-pointer w-24 h-14 rounded-2xl overflow-hidden border-2 border-neutral-700 hover:border-orange-500 bg-neutral-950 shrink-0 transition-colors shadow-md"
                    >
                      <AppImage
                        src={settingsBannerUrl}
                        alt="Banner"
                        fallbackType="banner"
                        className="w-full h-full object-cover"
                      />
                      <div
                        className="absolute inset-0 bg-neutral-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        title="Editar Capa"
                      >
                        <Pencil className="w-4 h-4 text-orange-400" />
                      </div>
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setShowBannerEditModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-orange-500 hover:text-neutral-950 text-neutral-200 rounded-xl text-xs font-bold transition-all border border-neutral-700 hover:border-orange-500 shadow-sm cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 text-orange-400" />
                        <span>Alterar Capa (Upload ou Link)</span>
                      </button>
                      <p className="text-[10px] text-neutral-500">
                        Exibido no topo do aplicativo e página de agendamentos.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bloco de Redes Sociais da Barbearia */}
                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-850">
                    <div className="font-bold text-xs text-neutral-200 flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5 text-orange-400" />
                      <span>Redes Sociais da Barbearia</span>
                    </div>
                    <span className="text-[10px] text-neutral-400">
                      Canais sem link preenchido não serão exibidos aos clientes
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Instagram */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 mb-1">
                        <span className="w-5 h-5 rounded-md bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                          <InstagramIcon size={12} />
                        </span>
                        <span>Instagram (Perfil ou Link)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: @minhabarbearia ou https://instagram.com/minhabarbearia"
                        value={settingsInstagram}
                        onChange={e => setSettingsInstagram(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>

                    {/* Facebook */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 mb-1">
                        <span className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                          <FacebookIcon size={12} />
                        </span>
                        <span>Facebook (Página ou Link)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: @minhabarbearia ou https://facebook.com/minhabarbearia"
                        value={settingsFacebook}
                        onChange={e => setSettingsFacebook(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* TikTok */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 mb-1">
                        <span className="w-5 h-5 rounded-md bg-neutral-900 border border-neutral-700 flex items-center justify-center text-white shrink-0 shadow-sm">
                          <TikTokIcon size={12} />
                        </span>
                        <span>TikTok (Perfil ou Link)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: @minhabarbearia ou https://tiktok.com/@minhabarbearia"
                        value={settingsTiktok}
                        onChange={e => setSettingsTiktok(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-teal-400"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <label className="block text-xs font-semibold text-neutral-300">
                        Fotos do Salão & Fachada ({Math.min(3, settingsSalonImages.length)}/3)
                      </label>
                      {settingsSalonImages.length >= 3 && (
                        <span className="text-[10px] bg-neutral-800 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-neutral-700">
                          Máximo de 3 fotos atingido
                        </span>
                      )}
                    </div>
                    {settingsSalonImages.length < 3 && (
                      <button
                        type="button"
                        onClick={() => setIsAddingSalonImage(true)}
                        className="inline-flex items-center gap-1.5 text-xs text-orange-400 font-bold bg-orange-500/10 hover:bg-orange-500 hover:text-neutral-950 px-3 py-1.5 rounded-xl border border-orange-500/30 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar Foto do Salão</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {settingsSalonImages.slice(0, 3).map((img, i) => (
                      <div key={i} className="relative group rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 shadow-md">
                        <AppImage
                          src={img}
                          alt={`Salão ${i + 1}`}
                          fallbackType="gallery"
                          className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        
                        {/* Pencil Edit Overlay Button */}
                        <button
                          type="button"
                          onClick={() => setEditingSalonImageIdx(i)}
                          className="absolute bottom-2 left-2 bg-neutral-950/85 hover:bg-orange-500 hover:text-neutral-950 text-neutral-200 p-1.5 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition-all border border-neutral-700 hover:border-orange-500 flex items-center gap-1 cursor-pointer"
                          title="Trocar esta foto"
                        >
                          <Pencil className="w-3 h-3 text-orange-400 group-hover:text-neutral-950" />
                          <span>Editar</span>
                        </button>

                        {settingsSalonImages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSettingsSalonImages(prev => prev.filter((_, idx) => idx !== i));
                            }}
                            className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-600 text-white p-1.5 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-md cursor-pointer"
                            title="Remover foto"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* WhatsApp Reminders config (Seção 11) */}
                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3">
                  <div className="font-semibold text-xs text-amber-400">Configuração de Lembretes WhatsApp</div>
                  <div className="flex items-center justify-between text-xs text-neutral-300">
                    <span>Antecedência do envio:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="10"
                        max="1440"
                        step="10"
                        value={settingsReminderMinutes}
                        onChange={e => setSettingsReminderMinutes(Number(e.target.value))}
                        className="w-20 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-amber-300 font-mono font-bold text-center focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-neutral-400">minutos antes</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabela Oficial de Horários de Atendimento (Largura Total Centralizada) */}
            <div className="w-full pt-4 border-t border-neutral-800/80">
              <BusinessHoursTable
                value={settingsBusinessHours}
                onChange={setSettingsBusinessHours}
                disabled={isSavingSettings}
              />
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
              <span className="text-xs text-neutral-400">
                {isSettingsDirty ? 'Há alterações pendentes nesta tela.' : 'Todas as alterações foram salvas.'}
              </span>
              <SaveButton
                isDirty={isSettingsDirty}
                isLoading={isSavingSettings}
                isSaved={isSettingsSaved}
                onClick={handleSaveSettings}
                label="Salvar alterações"
              />
            </div>
          </div>

          {/* Unsaved changes modal for tab change */}
          <UnsavedChangesModal
            isOpen={showUnsavedChangesModal}
            onContinueEditing={() => setShowUnsavedChangesModal(false)}
            onDiscard={() => {
              setShowUnsavedChangesModal(false);
              if (pendingTabChange) {
                setActiveTab(pendingTabChange);
                setPendingTabChange(null);
              }
            }}
            onSaveAndContinue={async () => {
              await handleSaveSettings();
              setShowUnsavedChangesModal(false);
              if (pendingTabChange) {
                setActiveTab(pendingTabChange);
                setPendingTabChange(null);
              }
            }}
          />
        </div>
      )}

      {/* MINHA ASSINATURA */}
      {activeTab === 'SUBSCRIPTION' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
          <MySubscriptionView />
        </div>
      )}

      {/* Global Image Edit Modals */}
      {showLogoEditModal && (
        <ImageEditModal
          isOpen={showLogoEditModal}
          onClose={() => setShowLogoEditModal(false)}
          title="Editar Logo da Barbearia"
          subtitle="Faça upload de uma foto da sua logomarca ou cole uma URL direta."
          currentImageUrl={currentBarbershop.logoUrl}
          fallbackType="logo"
          presets={[
            { label: 'Logo Barber Vintage', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400' },
            { label: 'Logo Premium Gold', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400' }
          ]}
          onSave={(newUrl) => updateBarbershop({ logoUrl: newUrl })}
        />
      )}

      {showBannerEditModal && (
        <ImageEditModal
          isOpen={showBannerEditModal}
          onClose={() => setShowBannerEditModal(false)}
          title="Editar Capa / Banner da Barbearia"
          subtitle="Faça upload do banner de capa ou cole uma URL de alta resolução."
          currentImageUrl={currentBarbershop.bannerUrl}
          fallbackType="banner"
          presets={[
            { label: 'Salão Rústico Madeira', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200' },
            { label: 'Cadeiras Clássicas de Barbeiro', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200' },
            { label: 'Bancada Moderna com Espelhos', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=1200' }
          ]}
          onSave={(newUrl) => updateBarbershop({ bannerUrl: newUrl })}
        />
      )}

      {isAddingSalonImage && (
        <ImageEditModal
          isOpen={isAddingSalonImage}
          onClose={() => setIsAddingSalonImage(false)}
          title="Adicionar Foto do Salão"
          subtitle="Faça upload de foto do interior ou fachada da barbearia."
          currentImageUrl="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800"
          fallbackType="gallery"
          presets={[
            { label: 'Cadeiras de Couro & Espelhos', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800' },
            { label: 'Bancada de Ferramentas & Navalhas', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800' },
            { label: 'Fachada & Recepção VIP', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800' }
          ]}
          onSave={(newUrl) => {
            const current = currentBarbershop.salonImages.slice(0, 2);
            updateBarbershop({
              salonImages: [...current, newUrl]
            });
            setIsAddingSalonImage(false);
          }}
        />
      )}

      {editingSalonImageIdx !== null && (
        <ImageEditModal
          isOpen={editingSalonImageIdx !== null}
          onClose={() => setEditingSalonImageIdx(null)}
          title={`Alterar Foto do Salão #${editingSalonImageIdx + 1}`}
          subtitle="Substitua esta foto por um novo arquivo ou link."
          currentImageUrl={currentBarbershop.salonImages[editingSalonImageIdx] || ''}
          fallbackType="gallery"
          presets={[
            { label: 'Cadeiras de Couro & Espelhos', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800' },
            { label: 'Bancada de Ferramentas', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800' }
          ]}
          onSave={(newUrl) => {
            const updated = [...currentBarbershop.salonImages];
            updated[editingSalonImageIdx] = newUrl;
            updateBarbershop({ salonImages: updated });
            setEditingSalonImageIdx(null);
          }}
        />
      )}

      {editingServiceForImage && (
        <ImageEditModal
          isOpen={!!editingServiceForImage}
          onClose={() => setEditingServiceForImage(null)}
          title={`Alterar Foto de "${editingServiceForImage.name}"`}
          subtitle="Faça upload ou cole o link da imagem ilustrativa deste serviço."
          currentImageUrl={editingServiceForImage.imageUrl || 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600'}
          fallbackType="service"
          presets={[
            { label: 'Corte Degradê na Máquina', url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600' },
            { label: 'Barba Terapia com Toalha Quente', url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600' },
            { label: 'Combo Cabelo + Barba', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600' },
            { label: 'Corte na Tesoura', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600' }
          ]}
          onSave={(newUrl) => {
            updateService(editingServiceForImage.id, { imageUrl: newUrl });
            setEditingServiceForImage(null);
          }}
        />
      )}
      {/* Botão Flutuante Sutil para Voltar ao Topo / Início da Página */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-40 p-3 rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-700/80 shadow-2xl backdrop-blur-md transition-all duration-300 transform hover:-translate-y-1 hover:scale-105 active:scale-95 flex items-center gap-2 group cursor-pointer animate-fade-in"
          title="Voltar ao início do painel"
          aria-label="Voltar ao topo"
        >
          <div className="w-6 h-6 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-neutral-950 transition-colors">
            <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
          <span className="text-xs font-bold pr-1 hidden sm:inline text-neutral-300 group-hover:text-white transition-colors">
            Voltar ao topo
          </span>
        </button>
      )}
    </div>
  );
};
