import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { PhoneFrame } from './PhoneFrame';
import { generateAvailableSlots, generateUpcomingDays, getTodayLocalDateString } from '../../utils/scheduleEngine';
import {
  Calendar,
  Clock,
  User,
  Scissors,
  CheckCircle2,
  Gift,
  Package,
  Sparkles,
  Phone,
  Instagram,
  MapPin,
  LogIn,
  LogOut,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  X,
  Star,
  QrCode,
  Share2,
  CalendarCheck,
  Send,
  Ticket,
  Flame,
  Check,
  Zap,
  Info,
  Tag,
  Percent,
  Copy,
  Heart,
  Camera,
  Building2,
  ThumbsUp,
  Trophy,
  Plus,
  Minus,
  Compass,
  Store,
  ExternalLink
} from 'lucide-react';
import { Service, User as UserType, GalleryWork, Promotion, Raffle, Barbershop } from '../../types';
import { AppImage } from '../common/AppImage';
import { APP_ASSETS } from '../../data/assets';

export const ClientAppView: React.FC = () => {
  const {
    currentBarbershop,
    barbershops,
    users,
    services,
    professionals,
    schedules,
    appointments,
    allAppointments,
    addAppointment,
    currentUser,
    loginWithWhatsApp,
    loginWithGoogle,
    logoutClient,
    packages,
    customerPackages,
    usePackageItem,
    raffles,
    promotions,
    participateInRaffle,
    isClientEligibleForRaffle,
    communications,
    addToWaitlist,
    galleryWorks,
    likeGalleryWork,
    isImpersonating,
    logout,
    setActiveTenantId,
    setViewMode,
    getBarbershopDirectUrl
  } = useApp();

  const [activeTab, setActiveTab] = useState<'BOOKING' | 'GALLERY' | 'MY_APPOINTMENTS' | 'PROMOTIONS' | 'RAFFLES' | 'PACKAGES' | 'ABOUT' | 'WAITLIST'>('BOOKING');
  const [selectedGalleryCategory, setSelectedGalleryCategory] = useState<string>('TODOS');
  const [activeWorkDetail, setActiveWorkDetail] = useState<GalleryWork | null>(null);
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);
  const [copiedDirectLink, setCopiedDirectLink] = useState(false);

  // Google Login Modal & State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [googleStep, setGoogleStep] = useState<'SELECT_ACCOUNT' | 'COMPLETE_DATA'>('SELECT_ACCOUNT');
  const [pendingBookingAfterLogin, setPendingBookingAfterLogin] = useState(false);
  const [googleAccount, setGoogleAccount] = useState<{
    googleId: string;
    name: string;
    email: string;
    avatarUrl: string;
  }>({
    googleId: 'g-user-carlos-1',
    name: 'Carlos Eduardo Silva',
    email: 'carlosrs.email@gmail.com',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80'
  });
  const [clientPhone, setClientPhone] = useState('(11) 99123-4567');
  const [clientBirthDate, setClientBirthDate] = useState('1995-08-15');
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');
  const [useCustomGoogle, setUseCustomGoogle] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dynamic Highlights Modals (Promotions & Raffles)
  const [selectedHighlightPromo, setSelectedHighlightPromo] = useState<Promotion | null>(null);
  const [selectedHighlightRaffle, setSelectedHighlightRaffle] = useState<Raffle | null>(null);

  // Dynamic Destaques list (configured by owner/manager)
  const highlightedPromos = useMemo(() => {
    return promotions.filter(p => p.active && p.showInHighlights !== false);
  }, [promotions]);

  const highlightedRaffles = useMemo(() => {
    return raffles.filter(r => r.showInHighlights !== false);
  }, [raffles]);

  const hasAnyHighlights = highlightedPromos.length > 0 || highlightedRaffles.length > 0;

  // Real-time dynamic date tracking
  const todayStr = useMemo(() => getTodayLocalDateString(), []);
  const upcomingDays = useMemo(() => generateUpcomingDays(14), []);

  // Booking Flow Steps & State
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [selectedService, setSelectedService] = useState<Service | null>(services[0] || null);
  const [selectedProfessional, setSelectedProfessional] = useState<UserType | null>(professionals[0] || null);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedTime, setSelectedTime] = useState<string>('14:00');
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);
  const [bookingErrorMsg, setBookingErrorMsg] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});

  // Waitlist form
  const [waitlistDate, setWaitlistDate] = useState(todayStr);
  const [waitlistService, setWaitlistService] = useState(services[0]?.id || '');
  const [waitlistTimeRange, setWaitlistTimeRange] = useState<'MANHA' | 'TARDE' | 'NOITE' | 'QUALQUER'>('TARDE');
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  // Sorteio Feedback
  const [raffleFeedback, setRaffleFeedback] = useState<{ raffleId: string; message: string; success: boolean } | null>(null);

  // Is current logged in user a client?
  const isClient = currentUser.role === 'CLIENTE';

  // Client's appointments
  const clientAppointments = useMemo(() => {
    return appointments.filter(a => a.clientId === currentUser.id);
  }, [appointments, currentUser.id]);

  const clientOtherAppointments = useMemo(() => {
    return allAppointments.filter(a => a.clientId === currentUser.id && a.tenantId !== currentBarbershop.id);
  }, [allAppointments, currentUser.id, currentBarbershop.id]);

  const clientCustPackages = customerPackages.filter(cp => cp.clientId === currentUser.id);

  // Dynamic Time Slots calculation based on fundamental availability rules
  const selectedScheduleConfig = schedules.find(s => s.professionalId === selectedProfessional?.id);
  const serviceDuration = selectedService?.durationMinutes || 30;

  const {
    morningSlots,
    afternoonSlots,
    eveningSlots,
    allSlots
  } = useMemo(() => {
    if (!selectedProfessional) {
      return { morningSlots: [], afternoonSlots: [], eveningSlots: [], allSlots: [] };
    }
    return generateAvailableSlots({
      date: selectedDate,
      durationMinutes: serviceDuration,
      professionalId: selectedProfessional.id,
      scheduleConfig: selectedScheduleConfig,
      existingAppointments: appointments,
      stepMinutes: 30
    });
  }, [selectedDate, serviceDuration, selectedProfessional, selectedScheduleConfig, appointments]);

  // Sincroniza automaticamente a seleção de horário com o primeiro horário disponível
  useEffect(() => {
    if (allSlots.length > 0) {
      const isCurrentSelectedValid = allSlots.some(s => s.time === selectedTime && s.available);
      if (!isCurrentSelectedValid) {
        const firstAvailable = allSlots.find(s => s.available);
        if (firstAvailable) {
          setSelectedTime(firstAvailable.time);
        }
      }
    }
  }, [allSlots, selectedTime]);

  // Dynamic categories list based on services registered by the barbershop
  // Prioritized sequence: TODOS -> Cabelo -> Barba -> Combos -> Química -> Estética -> others
  const categories = useMemo(() => {
    const existingCats: string[] = Array.from(
      new Set(services.map(s => s.category?.trim()).filter((c): c is string => Boolean(c)))
    );

    const getPriority = (cat: string) => {
      const lower = cat.toLowerCase();
      if (lower.includes('cabelo') || lower.includes('corte')) return 1;
      if (lower.includes('barba') || lower.includes('barboterapia')) return 2;
      if (lower.includes('combo')) return 3;
      if (lower.includes('quim') || lower.includes('quím') || lower.includes('platinad') || lower.includes('nevou')) return 4;
      if (lower.includes('estét') || lower.includes('estet') || lower.includes('sobrancelha') || lower.includes('facial')) return 5;
      return 10;
    };

    const sorted = existingCats.sort((a, b) => {
      const pA = getPriority(a);
      const pB = getPriority(b);
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b, 'pt-BR');
    });

    return ['TODOS', ...sorted];
  }, [services]);

  const filteredServices = selectedCategory === 'TODOS'
    ? services
    : services.filter(s => s.category.toLowerCase() === selectedCategory.toLowerCase());

  // Garante que o serviço selecionado pertença aos serviços cadastrados da barbearia
  useEffect(() => {
    if (services.length > 0) {
      if (!selectedService || !services.some(s => s.id === selectedService.id)) {
        setSelectedService(services[0]);
      }
    } else {
      setSelectedService(null);
    }
  }, [services, selectedService]);

  const executeBookingWithClient = (clientUser: UserType) => {
    if (!selectedService || !selectedProfessional) {
      setBookingErrorMsg('Por favor selecione o serviço e o profissional.');
      return;
    }

    setBookingErrorMsg(null);

    // Calculate end time
    const [h, m] = selectedTime.split(':').map(Number);
    const totalMin = h * 60 + m + selectedService.durationMinutes;
    const endH = Math.floor(totalMin / 60).toString().padStart(2, '0');
    const endM = (totalMin % 60).toString().padStart(2, '0');
    const endTime = `${endH}:${endM}`;

    const res = addAppointment({
      tenantId: currentBarbershop.id,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      servicePrice: selectedService.price,
      serviceDuration: selectedService.durationMinutes,
      professionalId: selectedProfessional.id,
      professionalName: selectedProfessional.name,
      clientId: clientUser.id,
      clientName: clientUser.name,
      clientWhatsApp: clientUser.whatsapp,
      date: selectedDate,
      startTime: selectedTime,
      endTime,
      isEncaixe: false,
      status: 'AGENDADO'
    });

    if (res.success) {
      setBookingSuccessMsg(`Agendamento confirmado para ${selectedDate.split('-').reverse().join('/')} às ${selectedTime}! Lembrete via WhatsApp ativado.`);
      setActiveTab('MY_APPOINTMENTS');
    } else {
      setBookingErrorMsg(res.error || 'Erro ao agendar.');
    }
  };

  const handleSelectGoogleAccount = (acc: { googleId: string; name: string; email: string; avatarUrl: string }) => {
    setGoogleAccount(acc);
    setLoginError(null);

    // Check if client already exists globally and has whatsapp + birthDate in database
    const existingClient = users.find(
      u =>
        u.role === 'CLIENTE' &&
        ((acc.googleId && u.googleId === acc.googleId) ||
         (acc.email && u.email?.toLowerCase() === acc.email.toLowerCase()))
    );

    const hasCompleteData =
      existingClient &&
      existingClient.whatsapp &&
      existingClient.whatsapp.replace(/\D/g, '').length >= 8 &&
      existingClient.birthDate &&
      existingClient.birthDate.trim().length > 0;

    if (hasCompleteData && existingClient) {
      // User has existing complete profile -> log in directly without asking again!
      const loggedUser = loginWithGoogle({
        googleId: acc.googleId,
        email: acc.email,
        name: acc.name,
        avatarUrl: acc.avatarUrl,
        whatsapp: existingClient.whatsapp,
        birthDate: existingClient.birthDate
      });

      setShowLoginModal(false);
      setGoogleStep('SELECT_ACCOUNT');
      setLoginError(null);

      if (pendingBookingAfterLogin) {
        setPendingBookingAfterLogin(false);
        executeBookingWithClient(loggedUser);
      }
    } else {
      // Prompt "COMPLETE SEU CADASTRO" screen
      if (existingClient?.whatsapp) {
        setClientPhone(existingClient.whatsapp);
      }
      if (existingClient?.birthDate) {
        setClientBirthDate(existingClient.birthDate);
      }
      setGoogleStep('COMPLETE_DATA');
    }
  };

  const handleCustomGoogleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGoogleEmail.trim() || !customGoogleName.trim()) {
      setLoginError('Por favor informe seu nome e e-mail Google.');
      return;
    }
    const acc = {
      googleId: `g-custom-${Date.now()}`,
      name: customGoogleName.trim(),
      email: customGoogleEmail.trim(),
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(customGoogleName.trim())}&background=f97316&color=fff`
    };
    handleSelectGoogleAccount(acc);
  };

  const handleCompleteGoogleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientPhone.trim()) {
      setLoginError('O WhatsApp / Telefone é obrigatório para receber confirmações de agendamento.');
      return;
    }
    if (!clientBirthDate.trim()) {
      setLoginError('A Data de Aniversário é obrigatória para benefícios e sorteios.');
      return;
    }

    const loggedUser = loginWithGoogle({
      googleId: googleAccount.googleId,
      email: googleAccount.email,
      name: googleAccount.name,
      avatarUrl: googleAccount.avatarUrl,
      whatsapp: clientPhone.trim(),
      birthDate: clientBirthDate.trim()
    });

    setShowLoginModal(false);
    setGoogleStep('SELECT_ACCOUNT');
    setLoginError(null);

    if (pendingBookingAfterLogin) {
      setPendingBookingAfterLogin(false);
      executeBookingWithClient(loggedUser);
    }
  };

  const handleConfirmBooking = () => {
    if (!selectedService || !selectedProfessional) {
      setBookingErrorMsg('Por favor selecione o serviço e o profissional.');
      return;
    }

    if (!isClient) {
      setPendingBookingAfterLogin(true);
      setShowLoginModal(true);
      return;
    }

    executeBookingWithClient(currentUser);
  };

  const handleRaffleClick = (raffleId: string) => {
    if (!isClient) {
      setShowLoginModal(true);
      return;
    }
    const res = participateInRaffle(raffleId, currentUser.id);
    setRaffleFeedback({
      raffleId,
      message: res.message,
      success: res.success
    });
  };

  const handleJoinWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isClient) {
      setShowLoginModal(true);
      return;
    }
    const srv = services.find(s => s.id === waitlistService) || services[0];
    addToWaitlist({
      tenantId: currentBarbershop.id,
      clientId: currentUser.id,
      clientName: currentUser.name,
      clientWhatsApp: currentUser.whatsapp,
      serviceId: srv.id,
      serviceName: srv.name,
      preferredDate: waitlistDate,
      preferredTimeOfDay: waitlistTimeRange
    });
    setWaitlistSuccess(true);
    setTimeout(() => setWaitlistSuccess(false), 4000);
  };

  const appBody = (
    <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col bg-neutral-950 text-neutral-100 relative pb-24 shadow-2xl">
      {/* Real Client Top Bar with Barbershop Name, Client greeting and Logout */}
      {isClient && !isImpersonating && (
        <div className="bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs sm:text-sm font-bold text-neutral-200 truncate">{currentBarbershop.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-neutral-300">
              <User className="w-3.5 h-3.5 text-orange-400" />
              <span className="font-semibold">{currentUser.name}</span>
            </div>
            <button
              onClick={logout}
              className="text-xs font-bold text-neutral-300 hover:text-red-400 flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded-xl border border-neutral-700 transition-colors cursor-pointer shadow-sm"
              title="Sair e voltar para a tela de login"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. APP HEADER & BRANDING */}
      {/* ========================================================================= */}
        <div className="relative bg-neutral-900 border-b border-neutral-800/80">
          {/* Cover photo banner */}
          <div className="h-32 w-full overflow-hidden relative">
            <AppImage
              src={currentBarbershop.bannerUrl || currentBarbershop.salonImages[0] || APP_ASSETS.banner}
              alt="Salão da Barbearia"
              fallbackType="banner"
              className="w-full h-full object-cover opacity-75 scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent"></div>
            
            {/* Live Open Status Tag */}
            <div className="absolute top-3 left-3 bg-neutral-950/80 backdrop-blur-md border border-emerald-500/40 text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span>ABERTO AGORA</span>
            </div>

            {/* Top Right Quick Actions */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              {/* Copy Link Button */}
              <button
                type="button"
                onClick={() => {
                  const url = getBarbershopDirectUrl(currentBarbershop);
                  navigator.clipboard.writeText(url);
                  setCopiedDirectLink(true);
                  setTimeout(() => setCopiedDirectLink(false), 3000);
                }}
                className={`p-2 rounded-full shadow-lg backdrop-blur-md transition-all active:scale-95 text-xs flex items-center gap-1 font-bold ${
                  copiedDirectLink
                    ? 'bg-emerald-500 text-neutral-950 px-2.5'
                    : 'bg-neutral-950/80 hover:bg-neutral-900 text-neutral-200 border border-neutral-700/80'
                }`}
                title="Copiar link direto desta barbearia"
              >
                {copiedDirectLink ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="text-[10px]">Copiado!</span>
                  </>
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Discovery / Switch Barbershop */}
              <button
                type="button"
                onClick={() => setViewMode('DISCOVERY')}
                className="p-2 rounded-full bg-neutral-950/80 hover:bg-neutral-900 text-neutral-200 border border-neutral-700/80 shadow-lg backdrop-blur-md transition-all active:scale-95"
                title="Explorar outras barbearias da rede My Barber"
              >
                <Compass className="w-3.5 h-3.5 text-orange-400" />
              </button>

              {/* WhatsApp Action Button */}
              <a
                href={`https://wa.me/55${currentBarbershop.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 p-2 rounded-full shadow-lg transition-transform active:scale-95"
                title="Conversar no WhatsApp"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Barbershop Info Row & Client Login Status */}
          <div className="px-4 pb-3 -mt-10 relative">
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-center gap-3">
                <AppImage
                  src={currentBarbershop.logoUrl}
                  alt={currentBarbershop.name}
                  fallbackType="logo"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-orange-500/60 shadow-2xl bg-neutral-900 shrink-0"
                />
                <div>
                  <h1 className="text-base sm:text-lg font-bold text-neutral-100 leading-tight">
                    {currentBarbershop.name}
                  </h1>
                  <div className="flex items-center gap-1 text-xs text-neutral-400 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="line-clamp-1">{currentBarbershop.address.neighborhood}, {currentBarbershop.address.city}</span>
                  </div>
                </div>
              </div>

              {/* Login / Profile Chip */}
              <div>
                {isClient ? (
                  <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700/80 px-2.5 py-1.5 rounded-2xl text-xs shadow-md">
                    {currentUser.avatarUrl ? (
                      <AppImage
                        src={currentUser.avatarUrl}
                        alt={currentUser.name}
                        fallbackType="userAvatar"
                        className="w-7 h-7 rounded-full object-cover border border-orange-500/60 shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-orange-500 text-neutral-950 flex items-center justify-center font-black text-[11px] shrink-0">
                        {currentUser.name.charAt(0)}
                      </div>
                    )}
                    <div className="text-left">
                      <div className="font-extrabold text-neutral-100 text-[11px] leading-tight flex items-center gap-1">
                        <span>{currentUser.name.split(' ')[0]}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      </div>
                      <div className="text-[9px] text-neutral-400 font-mono">
                        {currentUser.whatsapp || 'Google'}
                      </div>
                    </div>
                    <button
                      onClick={logoutClient}
                      className="text-neutral-400 hover:text-red-400 p-1 ml-0.5 rounded-lg hover:bg-neutral-800 transition-colors"
                      title="Sair da Conta Google"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setGoogleStep('SELECT_ACCOUNT');
                      setShowLoginModal(true);
                    }}
                    className="bg-white hover:bg-neutral-100 text-neutral-950 font-black px-3 py-1.5 rounded-xl text-[11px] flex items-center gap-1.5 shadow-md active:scale-95 transition-all border border-neutral-300"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span>Entrar Google</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dynamic Propaganda & Highlights Bar (Configured by Barbershop Owner/Manager) */}
            {hasAnyHighlights && (
              <div className="mt-3.5 pt-3 border-t border-neutral-800/80">
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Destaques & Novidades da Barbearia
                  </span>
                  <span className="text-[9px] text-orange-400/90 font-medium">Toque para ver</span>
                </div>
                <div className="flex items-center gap-3.5 overflow-x-auto py-2 px-1 no-scrollbar">
                  {/* Highlighted Promotions - Sized for ~3.5 items visible & unclipped circles */}
                  {highlightedPromos.map(promo => (
                    <button
                      key={promo.id}
                      onClick={() => setSelectedHighlightPromo(promo)}
                      className="w-[88px] sm:w-[94px] shrink-0 flex flex-col items-center gap-1.5 group focus:outline-none"
                      title={promo.title}
                    >
                      <div className="w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full p-[2.5px] bg-gradient-to-tr from-orange-500 via-amber-500 to-orange-400 group-hover:scale-105 transition-transform shadow-md relative">
                        <div className="w-full h-full rounded-full overflow-hidden bg-neutral-950 border border-neutral-900 relative">
                          <AppImage
                            src={promo.imageUrl || 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=200'}
                            alt={promo.title}
                            fallbackType="banner"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-neutral-950/20" />
                        </div>
                        {promo.discountPercentage && (
                          <div className="absolute -top-1 -right-1 bg-orange-500 text-neutral-950 text-[9px] font-black px-1.5 py-0.2 rounded-full shadow border border-neutral-950 z-10">
                            {promo.discountPercentage}%
                          </div>
                        )}
                      </div>
                      <div className="text-center w-full px-0.5">
                        <span className="text-[10px] font-bold text-neutral-200 block truncate group-hover:text-orange-400 transition-colors">
                          {promo.title}
                        </span>
                        <span className="text-[8px] font-black uppercase text-amber-400/90 block truncate">
                          {promo.highlightTag || 'PROMO'}
                        </span>
                      </div>
                    </button>
                  ))}

                  {/* Highlighted Raffles - Sized for ~3.5 items visible & unclipped circles */}
                  {highlightedRaffles.map(raffle => (
                    <button
                      key={raffle.id}
                      onClick={() => setSelectedHighlightRaffle(raffle)}
                      className="w-[88px] sm:w-[94px] shrink-0 flex flex-col items-center gap-1.5 group focus:outline-none"
                      title={raffle.title}
                    >
                      <div className="w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full p-[2.5px] bg-gradient-to-tr from-amber-400 via-orange-500 to-yellow-300 group-hover:scale-105 transition-transform shadow-md relative">
                        <div className="w-full h-full rounded-full overflow-hidden bg-neutral-950 border border-neutral-900 relative">
                          <AppImage
                            src={raffle.imageUrl || 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=200'}
                            alt={raffle.title}
                            fallbackType="banner"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-neutral-950/20" />
                        </div>
                        <div className="absolute -top-1 -right-1 bg-amber-400 text-neutral-950 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow border border-neutral-950 flex items-center z-10">
                          <Trophy className="w-2.5 h-2.5" />
                        </div>
                      </div>
                      <div className="text-center w-full px-0.5">
                        <span className="text-[10px] font-bold text-neutral-200 block truncate group-hover:text-amber-400 transition-colors">
                          {raffle.title}
                        </span>
                        <span className="text-[8px] font-black uppercase text-amber-400/90 block truncate">
                          {raffle.status === 'REALIZADO' ? 'GANHADOR' : (raffle.highlightTag || 'SORTEIO')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. TABS MAIN CONTENT */}
        {/* ========================================================================= */}
        <div className="px-4 py-4 flex-1">
          
          {/* TAB 1: ✂️ AGENDAR (MODO APP VIVO & DIRETO) */}
          {activeTab === 'BOOKING' && (
            <div className="space-y-5">
              {bookingSuccessMsg && (
                <div className="bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 p-3.5 rounded-2xl text-xs flex items-start gap-3 shadow-lg animate-fade-in">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm text-emerald-200">Agendamento Realizado!</div>
                    <p className="mt-0.5 text-neutral-300">{bookingSuccessMsg}</p>
                  </div>
                </div>
              )}

              {bookingErrorMsg && (
                <div className="bg-red-500/15 border border-red-500/50 text-red-300 p-3.5 rounded-2xl text-xs flex items-start gap-3 shadow-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm text-red-200">Atenção</div>
                    <p className="mt-0.5 text-neutral-300">{bookingErrorMsg}</p>
                  </div>
                </div>
              )}

              {/* Step 1: Select Service */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-neutral-950 font-bold text-[11px] flex items-center justify-center">
                      1
                    </span>
                    <h3 className="font-semibold text-neutral-100 text-sm">
                      Selecione o Serviço
                    </h3>
                  </div>
                  <span className="text-xs text-neutral-400">{filteredServices.length} opções</span>
                </div>

                {/* Category Filter Chips */}
                {categories.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                          selectedCategory === cat
                            ? 'bg-orange-500 text-neutral-950 font-semibold shadow-md'
                            : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Services Cards List matching reference image */}
                {services.length === 0 ? (
                  <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-2xl p-6 text-center space-y-2">
                    <Scissors className="w-8 h-8 text-neutral-600 mx-auto" />
                    <p className="text-xs font-bold text-neutral-300">Nenhum serviço cadastrado nesta barbearia</p>
                    <p className="text-[11px] text-neutral-500">Esta barbearia ainda não cadastrou opções para agendamento.</p>
                  </div>
                ) : filteredServices.length === 0 ? (
                  <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-2xl p-6 text-center space-y-2">
                    <p className="text-xs font-bold text-neutral-300">Nenhum serviço encontrado nesta categoria</p>
                    <button
                      onClick={() => setSelectedCategory('TODOS')}
                      className="px-3 py-1.5 bg-orange-500 text-neutral-950 rounded-xl text-xs font-bold"
                    >
                      Ver Todos os Serviços
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {filteredServices.map(srv => {
                      const isSelected = selectedService?.id === srv.id;
                      const isDescExpanded = !!expandedDescriptions[srv.id];

                      return (
                        <button
                          key={srv.id}
                          onClick={() => setSelectedService(srv)}
                          className={`w-full text-left p-3 rounded-2xl border transition-all flex items-start gap-3.5 active:scale-[0.99] group ${
                            isSelected
                              ? 'bg-neutral-900/95 border-2 border-orange-500 shadow-lg shadow-orange-500/10'
                              : 'bg-neutral-900/90 border border-neutral-800/90 hover:border-neutral-700 text-neutral-300'
                          }`}
                        >
                          {/* Service Thumbnail */}
                          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl overflow-hidden bg-neutral-950 shrink-0 border border-neutral-800 relative mt-0.5">
                            <AppImage
                              src={srv.imageUrl || 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=200'}
                              alt={srv.name}
                              fallbackType="service"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>

                          {/* Service Details */}
                          <div className="flex-1 min-w-0 space-y-1">
                            {/* Service Name & Price (wraps up to 2 lines on mobile instead of marquee) */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <span
                                  className="font-bold text-sm text-neutral-100 block group-hover:text-orange-400 transition-colors line-clamp-2 leading-snug break-words"
                                  title={srv.name}
                                >
                                  {srv.name}
                                </span>
                              </div>
                              <span className="font-bold text-emerald-400 text-sm shrink-0 font-mono tracking-tight pt-0.5">
                                R$ {srv.price.toFixed(2).replace('.', ',')}
                              </span>
                            </div>

                            {/* Service Description with '+' expander button */}
                            {srv.description && (
                              <div className="text-xs text-neutral-400 leading-snug">
                                {isDescExpanded ? (
                                  <div className="text-neutral-300 whitespace-normal text-xs bg-neutral-950/80 p-2.5 rounded-xl border border-neutral-800/80 my-1">
                                    <p className="leading-relaxed">{srv.description}</p>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedDescriptions(prev => ({ ...prev, [srv.id]: false }));
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-400 hover:text-orange-300 mt-1.5"
                                    >
                                      <Minus className="w-3 h-3" />
                                      <span>Ver menos</span>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-1.5">
                                    <p className="truncate flex-1">{srv.description}</p>
                                    {srv.description.length > 28 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedDescriptions(prev => ({ ...prev, [srv.id]: true }));
                                        }}
                                        className="p-1 px-1.5 bg-neutral-800/90 hover:bg-neutral-700 text-orange-400 rounded-md text-[10px] font-black shrink-0 flex items-center gap-0.5 border border-neutral-700/60 transition-colors shadow-sm"
                                        title="Ver descrição completa"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Badges: Duration & Category */}
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-500 bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/20">
                                <Clock className="w-3.5 h-3.5" />
                                {srv.durationMinutes} min
                              </span>
                              {srv.category && (
                                <span className="text-xs text-neutral-300 bg-neutral-950 px-2.5 py-1 rounded-lg border border-neutral-800 font-medium">
                                  {srv.category}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2: Select Professional */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-5 h-5 rounded-full bg-orange-500 text-neutral-950 font-bold text-[11px] flex items-center justify-center">
                    2
                  </span>
                  <h3 className="font-semibold text-neutral-100 text-sm">
                    Escolha o Barbeiro
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {professionals.map(prof => {
                    const isSelected = selectedProfessional?.id === prof.id;
                    return (
                      <button
                        key={prof.id}
                        onClick={() => setSelectedProfessional(prof)}
                        className={`p-3 rounded-2xl border text-left transition-all flex flex-col items-center text-center active:scale-[0.98] ${
                          isSelected
                            ? 'bg-orange-500/10 border-orange-500 ring-1 ring-orange-500/50 shadow-md'
                            : 'bg-neutral-900 border-neutral-800/80 hover:border-neutral-700'
                        }`}
                      >
                        <div className="relative mb-2">
                          <AppImage
                            src={prof.avatarUrl || APP_ASSETS.barberFelipe}
                            alt={prof.name}
                            fallbackType="avatar"
                            className="w-14 h-14 rounded-full object-cover border-2 border-neutral-700 shadow-md"
                          />
                          {isSelected && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-neutral-950 font-bold text-[10px] shadow">
                              ✓
                            </div>
                          )}
                        </div>
                        <div className="font-bold text-xs text-neutral-100 truncate w-full">{prof.name}</div>
                        <div className="flex items-center gap-1 text-[10px] text-orange-400 font-semibold mt-0.5">
                          <Star className="w-2.5 h-2.5 fill-orange-400 text-orange-400" />
                          <span>4.9 (Mestre)</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Select Date Strip & Time Slots */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-5 h-5 rounded-full bg-orange-500 text-neutral-950 font-bold text-[11px] flex items-center justify-center">
                    3
                  </span>
                  <h3 className="font-semibold text-neutral-100 text-sm">
                    Data & Horário
                  </h3>
                </div>

                {/* Horizontal Date Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3 no-scrollbar">
                  {upcomingDays.map(d => {
                    const isSelected = selectedDate === d.date;
                    return (
                      <button
                        key={d.date}
                        onClick={() => setSelectedDate(d.date)}
                        className={`flex flex-col items-center py-2 px-3 rounded-2xl border min-w-[58px] transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-orange-500 text-neutral-950 border-orange-500 shadow-md font-bold'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                        }`}
                      >
                        <span className={`text-[10px] uppercase ${isSelected ? 'text-neutral-950 font-black' : 'text-neutral-400'}`}>
                          {d.dayName}
                        </span>
                        <span className="text-base font-extrabold my-0.5">{d.dayNum}</span>
                        <span className={`text-[9px] ${isSelected ? 'text-neutral-900' : 'text-neutral-500'}`}>
                          {d.month}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Time Slots Section */}
                <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-2xl p-3.5 space-y-3">
                  {allSlots.length === 0 ? (
                    <div className="text-center py-4 px-2">
                      <Clock className="w-6 h-6 text-neutral-500 mx-auto mb-1.5" />
                      <p className="text-xs font-bold text-neutral-300">Sem expediente nesta data</p>
                      <p className="text-[10px] text-neutral-500 mt-0.5">
                        O profissional selecionado não possui horários de atendimento nesta data. Escolha outro dia ou profissional.
                      </p>
                    </div>
                  ) : (
                    <>
                      {morningSlots.length > 0 && (
                        <div>
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
                            ☀️ Manhã
                          </span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {morningSlots.map(slot => {
                              const isSelected = selectedTime === slot.time && slot.available;
                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  disabled={!slot.available}
                                  title={slot.reason || (slot.available ? 'Disponível' : 'Indisponível')}
                                  onClick={() => {
                                    if (slot.available) {
                                      setSelectedTime(slot.time);
                                      setBookingErrorMsg(null);
                                    }
                                  }}
                                  className={`py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative ${
                                    !slot.available
                                      ? 'bg-neutral-950/40 text-neutral-600 border border-neutral-900 cursor-not-allowed line-through opacity-60'
                                      : isSelected
                                      ? 'bg-orange-500 text-neutral-950 shadow-md ring-2 ring-orange-400'
                                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                                  }`}
                                >
                                  {slot.time}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {afternoonSlots.length > 0 && (
                        <div>
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
                            🌤️ Tarde
                          </span>
                          <div className="grid grid-cols-4 gap-1.5">
                            {afternoonSlots.map(slot => {
                              const isSelected = selectedTime === slot.time && slot.available;
                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  disabled={!slot.available}
                                  title={slot.reason || (slot.available ? 'Disponível' : 'Indisponível')}
                                  onClick={() => {
                                    if (slot.available) {
                                      setSelectedTime(slot.time);
                                      setBookingErrorMsg(null);
                                    }
                                  }}
                                  className={`py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative ${
                                    !slot.available
                                      ? 'bg-neutral-950/40 text-neutral-600 border border-neutral-900 cursor-not-allowed line-through opacity-60'
                                      : isSelected
                                      ? 'bg-orange-500 text-neutral-950 shadow-md ring-2 ring-orange-400'
                                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                                  }`}
                                >
                                  {slot.time}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {eveningSlots.length > 0 && (
                        <div>
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
                            🌙 Noite
                          </span>
                          <div className="grid grid-cols-4 gap-1.5">
                            {eveningSlots.map(slot => {
                              const isSelected = selectedTime === slot.time && slot.available;
                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  disabled={!slot.available}
                                  title={slot.reason || (slot.available ? 'Disponível' : 'Indisponível')}
                                  onClick={() => {
                                    if (slot.available) {
                                      setSelectedTime(slot.time);
                                      setBookingErrorMsg(null);
                                    }
                                  }}
                                  className={`py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative ${
                                    !slot.available
                                      ? 'bg-neutral-950/40 text-neutral-600 border border-neutral-900 cursor-not-allowed line-through opacity-60'
                                      : isSelected
                                      ? 'bg-orange-500 text-neutral-950 shadow-md ring-2 ring-orange-400'
                                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                                  }`}
                                >
                                  {slot.time}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Sticky Booking Summary Sheet */}
              <div className="bg-neutral-900 border-2 border-orange-500/40 rounded-2xl p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-neutral-800">
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase font-bold block">Resumo do Horário</span>
                    <div className="font-extrabold text-neutral-100 text-xs mt-0.5">
                      {selectedService?.name || 'Selecione o serviço'}
                    </div>
                    <div className="text-[11px] text-orange-400 font-semibold">
                      Com {selectedProfessional?.name || 'Barbeiro'} • {selectedDate.split('-').reverse().join('/')} às {selectedTime}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-neutral-400 block">Total</span>
                    <span className="text-base font-black text-emerald-400 font-mono">
                      R$ {selectedService ? selectedService.price.toFixed(2).replace('.', ',') : '0,00'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleConfirmBooking}
                  disabled={!selectedService || !selectedProfessional}
                  className={`w-full py-3.5 rounded-xl text-xs sm:text-sm font-semibold tracking-wide flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
                    selectedService && selectedProfessional
                      ? 'bg-orange-500 hover:bg-orange-400 text-neutral-950 cursor-pointer shadow-orange-500/20'
                      : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>CONFIRMAR AGENDAMENTO</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: 📅 MEUS AGENDAMENTOS (HISTÓRICO MULTI-BARBEARIA DA PLATAFORMA) */}
          {activeTab === 'MY_APPOINTMENTS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-neutral-100 font-heading text-base">
                    Meus Agendamentos
                  </h3>
                  <p className="text-[11px] text-neutral-400">Tickets de corte e histórico em toda a rede My Barber</p>
                </div>
                <span className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold">
                  {clientAppointments.length + clientOtherAppointments.length} agendados
                </span>
              </div>

              {/* Seção 1: Agendamentos na barbearia atual */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-black text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5" />
                    <span>Nesta Barbearia ({currentBarbershop.name})</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {clientAppointments.length} agendamento(s)
                  </span>
                </div>

                {clientAppointments.length === 0 ? (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center space-y-2.5">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 text-neutral-500 flex items-center justify-center mx-auto">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-200">Sem agendamentos nesta barbearia</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">Reserve seu horário em poucos segundos na aba Agendar.</p>
                    </div>
                    <button
                      onClick={() => setActiveTab('BOOKING')}
                      className="px-4 py-1.5 bg-orange-500 text-neutral-950 font-bold rounded-xl text-xs"
                    >
                      Agendar Agora
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {clientAppointments.map(apt => (
                      <div
                        key={apt.id}
                        className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg relative"
                      >
                        {/* Ticket Top Header */}
                        <div className="bg-gradient-to-r from-orange-500/20 via-neutral-900 to-neutral-900 p-3.5 flex items-center justify-between border-b border-neutral-800/80">
                          <div className="flex items-center gap-2">
                            <Ticket className="w-4 h-4 text-orange-400" />
                            <span className="font-black text-neutral-100 text-xs uppercase tracking-wider font-heading">
                              VIP PASS • {apt.serviceName}
                            </span>
                          </div>
                          <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/30">
                            {apt.status}
                          </span>
                        </div>

                        {/* Ticket Body */}
                        <div className="p-3.5 space-y-3">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-neutral-500 block">Data e Horário</span>
                              <span className="font-extrabold text-orange-400">
                                {apt.date.split('-').reverse().join('/')} às {apt.startTime}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-neutral-500 block">Profissional</span>
                              <span className="font-bold text-neutral-200">{apt.professionalName}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-dashed border-neutral-800">
                            <div className="flex items-center gap-2">
                              <QrCode className="w-6 h-6 text-neutral-400" />
                              <span className="text-[10px] text-neutral-500 font-mono">ID: {apt.id.slice(0, 8)}</span>
                            </div>
                            <span className="text-sm font-black text-emerald-400 font-mono">
                              R$ {apt.servicePrice.toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        </div>

                        {/* WhatsApp Reminder status */}
                        <div className="bg-neutral-950 px-3.5 py-2 border-t border-neutral-800/80 flex items-center justify-between text-[10px] text-neutral-400">
                          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            Lembrete via WhatsApp Ativo
                          </span>
                          <a
                            href={`https://wa.me/55${currentBarbershop.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-neutral-300 hover:text-orange-400 flex items-center gap-1 font-bold"
                          >
                            <Phone className="w-2.5 h-2.5" />
                            Falar com Salão
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Seção 2: Agendamentos em outras barbearias da rede com o mesmo cadastro global */}
              {clientOtherAppointments.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-neutral-800/80">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5" />
                      <span>Em Outras Barbearias da Rede</span>
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {clientOtherAppointments.length} agendamento(s)
                    </span>
                  </div>

                  <div className="space-y-3">
                    {clientOtherAppointments.map(apt => {
                      const shop = barbershops.find(b => b.id === apt.tenantId);
                      return (
                        <div
                          key={apt.id}
                          className="bg-neutral-900/90 border border-neutral-800 hover:border-amber-500/40 rounded-2xl overflow-hidden shadow-lg transition-all relative"
                        >
                          <div className="bg-neutral-950 p-3 flex items-center justify-between border-b border-neutral-800/80">
                            <div className="flex items-center gap-2">
                              {shop?.logoUrl ? (
                                <AppImage
                                  src={shop.logoUrl}
                                  alt={shop.name}
                                  fallbackType="logo"
                                  className="w-6 h-6 rounded-lg object-cover border border-neutral-700"
                                />
                              ) : (
                                <Store className="w-4 h-4 text-amber-400" />
                              )}
                              <div>
                                <span className="font-extrabold text-neutral-100 text-xs block leading-tight">
                                  {shop?.name || 'Barbearia da Rede'}
                                </span>
                                <span className="text-[10px] text-neutral-400">
                                  {shop?.address.neighborhood}, {shop?.address.city}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (shop) {
                                  setActiveTenantId(shop.id);
                                }
                              }}
                              className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors"
                            >
                              <span>Acessar</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="p-3 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-neutral-200">{apt.serviceName}</span>
                              <span className="text-xs font-black text-emerald-400 font-mono">
                                R$ {apt.servicePrice.toFixed(2).replace('.', ',')}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400">
                              <div>
                                <span className="text-[10px] text-neutral-500 block">Data e Horário</span>
                                <span className="font-semibold text-neutral-200">
                                  {apt.date.split('-').reverse().join('/')} às {apt.startTime}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-neutral-500 block">Profissional</span>
                                <span className="font-semibold text-neutral-200">{apt.professionalName}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 🎟️ PACOTES (SEÇÃO 17 - CARTEIRA DIGITAL VIP) */}
          {activeTab === 'PACKAGES' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-black text-neutral-100 font-heading text-base">
                  Pacotes & Fidelidade
                </h3>
                <p className="text-[11px] text-neutral-400">Acompanhe suas sessões com total transparência (Seção 17)</p>
              </div>

              {/* My active digital passes */}
              <div className="space-y-3">
                <div className="text-[10px] font-black text-orange-400 uppercase tracking-wider">
                  Minha Carteira Digital de Cortes
                </div>

                {clientCustPackages.length === 0 ? (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 text-xs text-neutral-400">
                    Você ainda não possui pacotes ativos vinculados ao seu WhatsApp.
                  </div>
                ) : (
                  clientCustPackages.map(cp => (
                    <div
                      key={cp.id}
                      className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-orange-950/30 border border-orange-500/40 rounded-2xl p-4 shadow-xl relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[9px] font-black bg-orange-500 text-neutral-950 px-2 py-0.5 rounded uppercase">
                            VIP PASS ATIVO
                          </span>
                          <h4 className="font-extrabold text-neutral-100 text-sm font-heading mt-1">{cp.packageTitle}</h4>
                          <span className="text-[10px] text-neutral-500">Adquirido em {cp.purchaseDate.split('-').reverse().join('/')}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {cp.items.map(item => {
                          const remaining = item.totalQuantity - item.usedQuantity;
                          return (
                            <div key={item.itemId} className="bg-neutral-950/80 p-3 rounded-xl border border-neutral-800">
                              <div className="flex justify-between text-xs mb-1.5">
                                <span className="font-bold text-neutral-200">{item.name}</span>
                                <span className="font-extrabold text-orange-400 font-mono">
                                  {remaining} restantes ({item.usedQuantity}/{item.totalQuantity} usadas)
                                </span>
                              </div>

                              {/* Stamp punch card simulation */}
                              <div className="flex items-center gap-1.5 my-2">
                                {Array.from({ length: item.totalQuantity }).map((_, idx) => {
                                  const isUsed = idx < item.usedQuantity;
                                  return (
                                    <div
                                      key={idx}
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border ${
                                        isUsed
                                          ? 'bg-neutral-800 border-neutral-700 text-neutral-500 opacity-60'
                                          : 'bg-orange-500/20 border-orange-500 text-orange-300 ring-1 ring-orange-500/30'
                                      }`}
                                    >
                                      {isUsed ? '✓' : '✂️'}
                                    </div>
                                  );
                                })}
                              </div>

                              <button
                                onClick={() => usePackageItem(cp.id, item.itemId)}
                                disabled={remaining === 0}
                                className={`w-full mt-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                                  remaining > 0
                                    ? 'bg-orange-500 hover:bg-orange-400 text-neutral-950 shadow-md active:scale-95'
                                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                }`}
                              >
                                {remaining > 0 ? 'Utilizar 1 Sessão no Atendimento' : 'Pacote Totalmente Utilizado'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Available Packages in Barbershop */}
              <div className="space-y-3 pt-3 border-t border-neutral-800">
                <div className="text-[10px] font-black text-neutral-300 uppercase tracking-wider">
                  Pacotes Disponíveis no Salão
                </div>
                <div className="space-y-2.5">
                  {packages.map(pkg => (
                    <div key={pkg.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-neutral-100 text-xs">{pkg.title}</h4>
                          <p className="text-[11px] text-neutral-400 mt-0.5">{pkg.description}</p>
                        </div>
                        <span className="text-sm font-black text-emerald-400 font-mono shrink-0 ml-2">
                          R$ {pkg.price.toFixed(2).replace('.', ',')}
                        </span>
                      </div>

                      <div className="bg-neutral-950 p-2 rounded-xl border border-neutral-800 text-[11px] text-neutral-300 space-y-1">
                        {pkg.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>• {it.name}</span>
                            <strong className="text-orange-400">{it.totalQuantity}x</strong>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => alert(`Para adquirir o ${pkg.title}, converse com o barbeiro na recepção ou via WhatsApp!`)}
                        className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold"
                      >
                        Comprar na Barbearia
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 🎁 SORTEIOS (SEÇÃO 23 - REGRA DOS 2 MESES) */}
          {activeTab === 'RAFFLES' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-orange-500/20 via-neutral-900 to-neutral-900 border border-orange-500/40 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="w-5 h-5 text-orange-400" />
                  <h3 className="font-black text-neutral-100 text-base font-heading">
                    Sorteios Exclusivos da Barbearia
                  </h3>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  <strong>Regra de Participação:</strong> Para garantir sorteios justos, apenas clientes com corte ou atendimento nos <strong>últimos 60 dias</strong> (2 meses) podem se cadastrar.
                </p>

                {/* Eligibility pill */}
                <div className="mt-3 bg-neutral-950/90 p-2.5 rounded-xl border border-neutral-800 text-xs">
                  {isClient ? (
                    (() => {
                      const elig = isClientEligibleForRaffle(currentUser.id);
                      return elig.eligible ? (
                        <div className="text-emerald-400 font-bold flex items-center gap-1.5 text-[11px]">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Você está APTO para participar! (Último corte: {elig.eligibleDate?.split('-').reverse().join('/')})</span>
                        </div>
                      ) : (
                        <div className="text-amber-400 flex items-center gap-1.5 text-[11px]">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{elig.reason}</span>
                        </div>
                      );
                    })()
                  ) : (
                    <button
                      onClick={() => setShowLoginModal(true)}
                      className="text-amber-400 font-semibold text-[11px] underline flex items-center gap-1"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Entre com seu WhatsApp para verificar sua aptidão
                    </button>
                  )}
                </div>
              </div>

              {/* Raffles Cards */}
              <div className="space-y-3">
                {raffles.length === 0 ? (
                  <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl text-center text-xs text-neutral-400">
                    Nenhum sorteio ativo no momento. Fique atento às próximas novidades!
                  </div>
                ) : (
                  raffles.map(raffle => {
                    const isParticipating = isClient && raffle.participants.some(p => p.clientId === currentUser.id);

                    return (
                      <div key={raffle.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg space-y-3">
                        {raffle.imageUrl && (
                          <div className="h-32 w-full overflow-hidden relative">
                            <AppImage
                              src={raffle.imageUrl}
                              alt={raffle.title}
                              fallbackType="product"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent"></div>
                          </div>
                        )}

                        <div className="p-4 pt-1 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase border ${
                                raffle.status === 'ATIVO'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                              }`}>
                                {raffle.status === 'ATIVO' ? 'Sorteio em Aberto' : 'Sorteio Realizado'}
                              </span>
                              <h4 className="font-extrabold text-neutral-100 text-sm font-heading mt-1">
                                {raffle.title}
                              </h4>
                            </div>
                            <div className="text-right text-[11px] text-neutral-400">
                              Data: <strong className="text-neutral-200">{raffle.drawDate.split('-').reverse().join('/')}</strong>
                            </div>
                          </div>

                          <p className="text-xs text-neutral-300">{raffle.description}</p>

                          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                            <span className="text-[10px] text-neutral-400 font-semibold block">Prêmio Especial:</span>
                            <div className="text-xs font-black text-amber-400 mt-0.5 flex items-center gap-1.5">
                              <Gift className="w-4 h-4 text-amber-400" />
                              {raffle.prize}
                            </div>
                          </div>

                          {raffleFeedback && raffleFeedback.raffleId === raffle.id && (
                            <div className={`p-2.5 rounded-xl text-xs ${
                              raffleFeedback.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'
                            }`}>
                              {raffleFeedback.message}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                            <span className="text-[11px] text-neutral-400">
                              Participantes: <strong className="text-neutral-200">{raffle.participants.length}</strong>
                            </span>

                            {raffle.status === 'REALIZADO' ? (
                              <span className="text-xs text-purple-400 font-bold">
                                Vencedor: {raffle.winnerName || 'Sorteado'}
                              </span>
                            ) : isParticipating ? (
                              <div className="flex items-center gap-2">
                                <div className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Inscrito</span>
                                </div>
                                <button
                                  onClick={() => handleRaffleClick(raffle.id)}
                                  className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 rounded-xl text-[11px] font-semibold transition-colors"
                                >
                                  Sair
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleRaffleClick(raffle.id)}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                              >
                                <Gift className="w-3.5 h-3.5" />
                                <span>Quero Participar</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 5: 🏷️ PROMOÇÕES */}
          {activeTab === 'PROMOTIONS' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-amber-500/20 via-neutral-900 to-neutral-900 border border-amber-500/40 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-5 h-5 text-amber-400" />
                  <h3 className="font-black text-neutral-100 text-base font-heading">
                    Promoções & Cupons Ativos
                  </h3>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Aproveite descontos especiais e cupons exclusivos para os seus cortes e cuidados na {currentBarbershop.name}.
                </p>
              </div>

              <div className="space-y-3">
                {promotions.filter(p => p.active).length === 0 ? (
                  <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl text-center text-xs text-neutral-400">
                    Nenhuma promoção ativa no momento. Em breve novas ofertas!
                  </div>
                ) : (
                  promotions.filter(p => p.active).map(promo => (
                    <div key={promo.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg p-4 space-y-3">
                      {promo.bannerUrl && (
                        <div className="h-28 w-full -mx-4 -mt-4 mb-2 overflow-hidden relative">
                          <AppImage
                            src={promo.bannerUrl}
                            alt={promo.title}
                            fallbackType="banner"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                              {promo.discountPercent}% OFF
                            </span>
                            {promo.serviceCategory && (
                              <span className="text-[10px] bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded">
                                {promo.serviceCategory}
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-neutral-100 text-sm mt-1.5">{promo.title}</h4>
                        </div>
                      </div>

                      <p className="text-xs text-neutral-300 leading-relaxed">{promo.description}</p>

                      {promo.voucherCode && (
                        <div className="bg-neutral-950 p-2.5 rounded-xl border border-dashed border-amber-500/40 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">Cupom de Desconto:</span>
                            <span className="text-xs font-mono font-bold text-amber-400">{promo.voucherCode}</span>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(promo.voucherCode || '');
                              setCopiedCoupon(promo.voucherCode || null);
                              setTimeout(() => setCopiedCoupon(null), 3000);
                            }}
                            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                          >
                            {copiedCoupon === promo.voucherCode ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-2 border-t border-neutral-800">
                        <span>Válido até: <strong className="text-neutral-200">{promo.validUntil.split('-').reverse().join('/')}</strong></span>
                        <button
                          onClick={() => setActiveTab('BOOKING')}
                          className="text-amber-400 hover:text-amber-300 font-bold"
                        >
                          Usar no Agendamento →
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 6: 📢 NOVIDADES (SEÇÃO 15) */}
          {activeTab === 'NEWS' && (
            <div className="space-y-3">
              <h3 className="font-black text-neutral-100 font-heading text-base">
                Novidades da Barbearia
              </h3>

              {communications.length === 0 ? (
                <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl text-center text-xs text-neutral-400">
                  Nenhuma novidade no momento.
                </div>
              ) : (
                communications.map(comm => (
                  <div key={comm.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] font-black bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded">
                        {comm.type}
                      </span>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {comm.sentAt.split('T')[0].split('-').reverse().join('/')}
                      </span>
                    </div>
                    <h4 className="font-bold text-neutral-100 text-xs">{comm.title}</h4>
                    <p className="text-xs text-neutral-300 leading-relaxed">{comm.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 7: ⏳ FILA DE ESPERA (SEÇÃO 19) */}
          {activeTab === 'WAITLIST' && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4">
              <div>
                <h3 className="font-black text-neutral-100 font-heading text-base">
                  Lista de Espera Inteligente
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Não achou o dia ou horário que queria? Entre na lista e receba aviso automático no WhatsApp caso surja vaga!
                </p>
              </div>

              {waitlistSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Inscrição na lista confirmada com sucesso!</span>
                </div>
              )}

              <form onSubmit={handleJoinWaitlist} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Serviço Desejado</label>
                  <select
                    value={waitlistService}
                    onChange={e => setWaitlistService(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  >
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} - R$ {s.price.toFixed(2).replace('.', ',')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Data Desejada</label>
                  <input
                    type="date"
                    required
                    value={waitlistDate}
                    onChange={e => setWaitlistDate(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Período Preferido</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['MANHA', 'TARDE', 'NOITE', 'QUALQUER'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setWaitlistTimeRange(p)}
                        className={`py-1.5 rounded-xl text-xs font-bold transition-all ${
                          waitlistTimeRange === p
                            ? 'bg-orange-500 text-neutral-950'
                            : 'bg-neutral-950 text-neutral-400 border border-neutral-800'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl font-black text-xs transition-colors shadow-md active:scale-95"
                >
                  ENTRAR NA FILA DE ESPERA
                </button>
              </form>
            </div>
          )}
          {/* TAB 8: 📸 GALERIA DE INSPIRAÇÕES & CORTES */}
          {activeTab === 'GALLERY' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-neutral-100 font-heading text-base flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-orange-400" />
                    <span>Galeria & Inspirações</span>
                  </h3>
                  <span className="text-[11px] text-neutral-400 font-semibold">{galleryWorks.slice(0, 4).length} fotos</span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Veja cortes e barboterapias reais executadas pelos nossos barbeiros.
                </p>
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {[
                  { id: 'TODOS', label: 'Todos' },
                  { id: 'DEGRADE', label: 'Degradê / Fade' },
                  { id: 'BARBA', label: 'Barba & Terapia' },
                  { id: 'COMBO', label: 'Combos' },
                  { id: 'SOCIAL', label: 'Tesoura & Clássicos' },
                  { id: 'PLATINADO', label: 'Platinado / Nevou' },
                  { id: 'FREESTYLE', label: 'Freestyle' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedGalleryCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                      selectedGalleryCategory === cat.id
                        ? 'bg-orange-500 text-neutral-950 shadow-md'
                        : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Gallery Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {galleryWorks
                  .slice(0, 4)
                  .filter(w => selectedGalleryCategory === 'TODOS' || w.category === selectedGalleryCategory)
                  .map(work => (
                    <div
                      key={work.id}
                      className="group bg-neutral-900 border border-neutral-800/90 rounded-2xl overflow-hidden flex flex-col shadow-lg transition-all hover:border-orange-500/40"
                    >
                      {/* Photo Container */}
                      <div
                        onClick={() => setActiveWorkDetail(work)}
                        className="relative aspect-square w-full bg-neutral-950 cursor-pointer overflow-hidden"
                      >
                        <AppImage
                          src={work.imageUrl}
                          alt={work.title}
                          fallbackType="gallery"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity"></div>
                        
                        {/* Like Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            likeGalleryWork(work.id);
                          }}
                          className="absolute top-2 right-2 bg-neutral-950/80 backdrop-blur-md text-neutral-200 hover:text-rose-400 p-1.5 rounded-full flex items-center gap-1 text-[10px] font-bold border border-neutral-800 shadow-md transition-colors"
                        >
                          <Heart className="w-3 h-3 text-rose-500 fill-rose-500/80" />
                          <span>{work.likesCount}</span>
                        </button>

                        <div className="absolute bottom-2 left-2 right-2">
                          <span className="text-[9px] font-extrabold text-orange-400 bg-neutral-950/80 px-1.5 py-0.5 rounded backdrop-blur-sm uppercase">
                            {work.category}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-2.5 flex-1 flex flex-col justify-between space-y-2 bg-neutral-900">
                        <div>
                          <h4
                            onClick={() => setActiveWorkDetail(work)}
                            className="font-bold text-neutral-100 text-xs line-clamp-1 cursor-pointer hover:text-orange-400"
                          >
                            {work.title}
                          </h4>
                          <p className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-1 truncate">
                            <span>Barbeiro:</span>
                            <strong className="text-neutral-300 font-semibold">{work.professionalName}</strong>
                          </p>
                        </div>

                        <button
                          onClick={() => {
                            if (work.serviceId) {
                              const srv = services.find(s => s.id === work.serviceId);
                              if (srv) setSelectedService(srv);
                            }
                            if (work.professionalId) {
                              const prof = professionals.find(p => p.id === work.professionalId);
                              if (prof) setSelectedProfessional(prof);
                            }
                            setActiveTab('BOOKING');
                          }}
                          className="w-full py-1.5 bg-orange-500/20 hover:bg-orange-500 text-orange-300 hover:text-neutral-950 font-bold rounded-xl text-[10px] transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95"
                        >
                          <Scissors className="w-3 h-3" />
                          <span>Quero Esse Estilo</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 9: 💈 SOBRE O SALÃO & FOTOS DO ESPAÇO */}
          {activeTab === 'ABOUT' && (
            <div className="space-y-4">
              {/* Salon Photos Gallery Carousel/Grid */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-neutral-100 font-heading text-base flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-orange-400" />
                    <span>Nosso Espaço</span>
                  </h3>
                  <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Ambiente VIP</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {currentBarbershop.salonImages.map((imgUrl, i) => (
                    <div key={i} className="aspect-[4/3] rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 relative group">
                      <AppImage
                        src={imgUrl}
                        alt={`Ambiente ${i + 1}`}
                        fallbackType="banner"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ))}
                </div>

                <p className="text-xs text-neutral-300 leading-relaxed pt-1">
                  {currentBarbershop.about}
                </p>
              </div>

              {/* Amenities */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-2.5">
                <h4 className="font-bold text-xs text-neutral-200 uppercase tracking-wider">Cortesias & Estrutura</h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
                  <div className="bg-neutral-950 p-2 rounded-xl border border-neutral-800/80 flex items-center gap-2">
                    <span className="text-base">🍺</span>
                    <span>Cerveja Artesanal Free</span>
                  </div>
                  <div className="bg-neutral-950 p-2 rounded-xl border border-neutral-800/80 flex items-center gap-2">
                    <span className="text-base">☕</span>
                    <span>Café Expresso Grátis</span>
                  </div>
                  <div className="bg-neutral-950 p-2 rounded-xl border border-neutral-800/80 flex items-center gap-2">
                    <span className="text-base">❄️</span>
                    <span>Ar-Condicionado 100%</span>
                  </div>
                  <div className="bg-neutral-950 p-2 rounded-xl border border-neutral-800/80 flex items-center gap-2">
                    <span className="text-base">📶</span>
                    <span>Wi-Fi de Alta Velocidade</span>
                  </div>
                </div>
              </div>

              {/* Barbers Team */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
                <h4 className="font-bold text-xs text-neutral-200 uppercase tracking-wider">Mestres da Navalha</h4>
                <div className="space-y-2.5">
                  {professionals.map(prof => (
                    <div key={prof.id} className="flex items-center justify-between bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
                      <div className="flex items-center gap-3">
                        <AppImage
                          src={prof.avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200'}
                          alt={prof.name}
                          fallbackType="avatar"
                          className="w-10 h-10 rounded-xl object-cover border border-neutral-700"
                        />
                        <div>
                          <div className="font-bold text-xs text-neutral-100">{prof.name}</div>
                          <div className="text-[10px] text-orange-400 font-semibold">{prof.specialty || 'Especialista em Degradê & Barba'}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedProfessional(prof);
                          setActiveTab('BOOKING');
                        }}
                        className="px-2.5 py-1 bg-orange-500/20 hover:bg-orange-500 text-orange-300 hover:text-neutral-950 text-[10px] font-bold rounded-lg transition-colors"
                      >
                        Agendar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Address & Contacts */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
                <h4 className="font-bold text-xs text-neutral-200 uppercase tracking-wider">Localização & Contato</h4>
                <div className="space-y-2 text-xs text-neutral-300">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <div>{currentBarbershop.address.street}, {currentBarbershop.address.number} {currentBarbershop.address.complement || ''}</div>
                      <div className="text-neutral-400 text-[11px]">{currentBarbershop.address.neighborhood} • {currentBarbershop.address.city}/{currentBarbershop.address.state}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
                    <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>WhatsApp: <strong>{currentBarbershop.whatsapp}</strong></span>
                  </div>
                  {currentBarbershop.socialMedia.instagram && (
                    <div className="flex items-center gap-2">
                      <Instagram className="w-4 h-4 text-pink-400 shrink-0" />
                      <span>Instagram: <strong>{currentBarbershop.socialMedia.instagram}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. NATIVE APP BOTTOM NAVIGATION BAR (FIXED/STICKY) */}
        {/* ========================================================================= */}
        <nav aria-label="Navegação do aplicativo" className="absolute bottom-0 inset-x-0 bg-neutral-900/95 backdrop-blur-md border-t border-neutral-800/80 px-1 py-1.5 flex items-center justify-around z-30 shadow-2xl">
          {[
            { id: 'BOOKING', label: 'Agendar', icon: Scissors },
            { id: 'GALLERY', label: 'Galeria', icon: Camera },
            { id: 'MY_APPOINTMENTS', label: 'Cortes', icon: Calendar, badge: clientAppointments.length },
            { id: 'PROMOTIONS', label: 'Promoções', icon: Tag, badge: promotions.filter(p => p.active).length },
            { id: 'ABOUT', label: 'Salão', icon: Building2 },
            { id: 'RAFFLES', label: 'Sorteios', icon: Gift }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-all relative ${
                  isActive ? 'text-orange-400 scale-105' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                  {tab.badge && tab.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 bg-orange-500 text-neutral-950 text-[9px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">
                      {tab.badge}
                    </span>
                  ) : null}
                </div>
                <span className={`text-[9px] mt-0.5 tracking-tight font-semibold ${isActive ? 'font-black text-orange-400' : ''}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ========================================================================= */}
        {/* 4. MODALS (STORY VIEWER & GALLERY WORK DETAIL) */}
        {/* ========================================================================= */}
        
        {/* Gallery Work Zoom Modal */}
        {activeWorkDetail && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="relative w-full max-w-sm bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl">
              <button
                onClick={() => setActiveWorkDetail(null)}
                className="absolute top-4 right-4 z-20 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-white p-2 rounded-full shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="h-80 w-full relative bg-neutral-950">
                <AppImage
                  src={activeWorkDetail.imageUrl}
                  alt={activeWorkDetail.title}
                  fallbackType="gallery"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent"></div>
              </div>

              <div className="p-5 -mt-6 relative bg-neutral-950 rounded-t-3xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                    {activeWorkDetail.category}
                  </span>
                  <button
                    onClick={() => likeGalleryWork(activeWorkDetail.id)}
                    className="flex items-center gap-1.5 bg-rose-500/10 text-rose-300 px-3 py-1 rounded-full text-xs font-bold border border-rose-500/20 active:scale-95"
                  >
                    <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                    <span>{activeWorkDetail.likesCount} curtidas</span>
                  </button>
                </div>

                <h3 className="text-base font-black text-neutral-100 font-heading">
                  {activeWorkDetail.title}
                </h3>
                
                {activeWorkDetail.description && (
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    {activeWorkDetail.description}
                  </p>
                )}

                <div className="bg-neutral-900 p-3 rounded-xl border border-neutral-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-orange-400" />
                    <span className="text-neutral-300">Feito por: <strong>{activeWorkDetail.professionalName}</strong></span>
                  </div>
                  {activeWorkDetail.servicePrice && (
                    <span className="font-extrabold text-emerald-400 font-mono">
                      R$ {activeWorkDetail.servicePrice.toFixed(2).replace('.', ',')}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (activeWorkDetail.serviceId) {
                      const srv = services.find(s => s.id === activeWorkDetail.serviceId);
                      if (srv) setSelectedService(srv);
                    }
                    if (activeWorkDetail.professionalId) {
                      const prof = professionals.find(p => p.id === activeWorkDetail.professionalId);
                      if (prof) setSelectedProfessional(prof);
                    }
                    setActiveWorkDetail(null);
                    setActiveTab('BOOKING');
                  }}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-neutral-950 font-black rounded-xl text-xs transition-colors shadow-lg active:scale-95"
                >
                  Agendar com esse Profissional
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* 4. MODALS (HIGHLIGHT PROMOTION & RAFFLE VIEWER, GOOGLE LOGIN) */}
        {/* ========================================================================= */}
        
        {/* Promotion Highlight Viewer Modal */}
        {selectedHighlightPromo && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="relative w-full max-w-sm bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl">
              {/* Close button */}
              <button
                onClick={() => setSelectedHighlightPromo(null)}
                className="absolute top-4 right-4 z-20 bg-neutral-900/80 text-neutral-300 hover:text-white p-2 rounded-full border border-neutral-800 backdrop-blur-sm"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="h-64 w-full relative">
                <AppImage
                  src={selectedHighlightPromo.imageUrl || 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600'}
                  alt={selectedHighlightPromo.title}
                  fallbackType="banner"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent" />
                <div className="absolute top-4 left-4 bg-orange-500 text-neutral-950 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg shadow-md">
                  {selectedHighlightPromo.highlightTag || 'PROMOÇÃO EM DESTAQUE'}
                </div>
              </div>

              <div className="p-5 relative -mt-6 bg-neutral-950 rounded-t-3xl space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-black text-white font-heading">
                      {selectedHighlightPromo.title}
                    </h3>
                    {selectedHighlightPromo.discountPercentage && (
                      <span className="text-xs font-black bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-lg shrink-0">
                        {selectedHighlightPromo.discountPercentage}% OFF
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
                    {selectedHighlightPromo.description}
                  </p>
                </div>

                {selectedHighlightPromo.code && (
                  <div className="bg-neutral-900 p-3 rounded-2xl border border-dashed border-orange-500/50 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-neutral-400 font-bold block uppercase">Cupom da Promoção:</span>
                      <span className="text-xs font-mono font-black text-orange-400 tracking-wider">
                        {selectedHighlightPromo.code}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedHighlightPromo.code || '');
                        setCopiedCoupon(selectedHighlightPromo.code || null);
                        setTimeout(() => setCopiedCoupon(null), 2500);
                      }}
                      className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500 text-orange-400 hover:text-neutral-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                    >
                      {copiedCoupon === selectedHighlightPromo.code ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => {
                    setSelectedHighlightPromo(null);
                    setActiveTab('BOOKING');
                  }}
                  className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-neutral-950 font-black rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <Scissors className="w-4 h-4" />
                  <span>Aproveitar e Agendar Agora</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Raffle Highlight Viewer Modal */}
        {selectedHighlightRaffle && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="relative w-full max-w-sm bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl">
              {/* Close button */}
              <button
                onClick={() => setSelectedHighlightRaffle(null)}
                className="absolute top-4 right-4 z-20 bg-neutral-900/80 text-neutral-300 hover:text-white p-2 rounded-full border border-neutral-800 backdrop-blur-sm"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="h-60 w-full relative">
                <AppImage
                  src={selectedHighlightRaffle.imageUrl || 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=600'}
                  alt={selectedHighlightRaffle.title}
                  fallbackType="banner"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent" />
                <div className="absolute top-4 left-4 bg-amber-400 text-neutral-950 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1">
                  <Trophy className="w-3 h-3" />
                  <span>{selectedHighlightRaffle.status === 'REALIZADO' ? 'SORTEIO REALIZADO' : (selectedHighlightRaffle.highlightTag || 'SORTEIO EM DESTAQUE')}</span>
                </div>
              </div>

              <div className="p-5 relative -mt-6 bg-neutral-950 rounded-t-3xl space-y-3.5">
                <div>
                  <h3 className="text-base font-black text-white font-heading">
                    {selectedHighlightRaffle.title}
                  </h3>
                  <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                    {selectedHighlightRaffle.description}
                  </p>
                </div>

                <div className="bg-neutral-900 p-3 rounded-2xl border border-neutral-800">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block">Prêmio:</span>
                  <strong className="text-xs text-amber-400 font-bold mt-0.5 block">{selectedHighlightRaffle.prize}</strong>
                </div>

                {selectedHighlightRaffle.status === 'REALIZADO' && selectedHighlightRaffle.winnerClientName ? (
                  <div className="bg-emerald-950/60 border border-emerald-500/40 p-3.5 rounded-2xl flex items-center gap-3 animate-fade-in">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-emerald-300">Ganhador(a) Oficial:</div>
                      <div className="text-sm font-black text-white">{selectedHighlightRaffle.winnerClientName}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Sorteio realizado pela barbearia!</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-neutral-400 bg-neutral-900/60 px-3 py-2 rounded-xl border border-neutral-800/80">
                    <span>Data do Sorteio:</span>
                    <strong className="text-neutral-200 font-mono">
                      {selectedHighlightRaffle.drawDate.split('-').reverse().join('/')}
                    </strong>
                  </div>
                )}

                <button
                  onClick={() => {
                    setSelectedHighlightRaffle(null);
                    setActiveTab('RAFFLES');
                  }}
                  className="w-full py-3 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 hover:from-amber-300 hover:to-orange-400 text-neutral-950 font-black rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <Gift className="w-4 h-4" />
                  <span>Ver Todos os Sorteios & Detalhes</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Google Account Login Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-5 text-neutral-100 shadow-2xl animate-fade-in">
              {googleStep === 'SELECT_ACCOUNT' ? (
                <div>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-md">
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                          />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-black font-heading text-neutral-100">Fazer Login com Google</h3>
                        <p className="text-[10px] text-neutral-400">Acesso exclusivo do cliente na {currentBarbershop.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowLoginModal(false)}
                      className="p-1 rounded-lg text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-neutral-300 mb-3">
                    Selecione sua conta Google para acessar seus agendamentos, sorteios e histórico:
                  </p>

                  <div className="space-y-2 mb-3">
                    {[
                      {
                        googleId: 'g-user-carlos-1',
                        name: 'Carlos Eduardo Silva (Cliente)',
                        email: 'carlos.cliente@gmail.com',
                        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
                        phone: '(11) 99123-4567',
                        birthDate: '1995-08-15'
                      },
                      {
                        googleId: 'g-user-bruno-2',
                        name: 'Bruno Henrique Souza',
                        email: 'bruno.henrique@gmail.com',
                        avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80',
                        phone: '(11) 99234-5678',
                        birthDate: '1991-05-20'
                      },
                      {
                        googleId: 'g-user-gustavo-3',
                        name: 'Gustavo Santos',
                        email: 'gustavo.santos@gmail.com',
                        avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80',
                        phone: '(11) 99345-6789',
                        birthDate: '1998-08-25'
                      }
                    ].map(acc => (
                      <button
                        key={acc.googleId}
                        type="button"
                        onClick={() => {
                          setClientPhone(acc.phone);
                          setClientBirthDate(acc.birthDate);
                          handleSelectGoogleAccount(acc);
                        }}
                        className="w-full bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 hover:border-orange-500/50 p-2.5 rounded-2xl flex items-center justify-between text-left transition-all group"
                      >
                        <div className="flex items-center gap-2.5">
                          <AppImage
                            src={acc.avatarUrl}
                            alt={acc.name}
                            fallbackType="avatar"
                            className="w-9 h-9 rounded-full object-cover border border-neutral-700"
                          />
                          <div>
                            <div className="text-xs font-bold text-neutral-100 group-hover:text-orange-400 transition-colors">
                              {acc.name}
                            </div>
                            <div className="text-[11px] text-neutral-400 font-mono">{acc.email}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-orange-400 transition-colors" />
                      </button>
                    ))}
                  </div>

                  {/* Option for custom Google Account */}
                  {!useCustomGoogle ? (
                    <button
                      type="button"
                      onClick={() => setUseCustomGoogle(true)}
                      className="w-full py-2 bg-neutral-950 hover:bg-neutral-800 text-neutral-300 rounded-xl text-xs font-semibold border border-neutral-800 transition-all text-center"
                    >
                      + Usar outra conta Google
                    </button>
                  ) : (
                    <form onSubmit={handleCustomGoogleSubmit} className="bg-neutral-950 p-3 rounded-2xl border border-neutral-800 space-y-2 mt-2">
                      <div className="text-[11px] font-bold text-orange-400">Informar outra Conta Google:</div>
                      <input
                        type="text"
                        required
                        placeholder="Nome completo (Ex: Rafael Lima)"
                        value={customGoogleName}
                        onChange={e => setCustomGoogleName(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                      />
                      <input
                        type="email"
                        required
                        placeholder="seu.email@gmail.com"
                        value={customGoogleEmail}
                        onChange={e => setCustomGoogleEmail(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setUseCustomGoogle(false)}
                          className="px-2 py-1 text-xs text-neutral-400"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 bg-orange-500 text-neutral-950 rounded-lg text-xs font-bold"
                        >
                          Continuar com esta conta
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                /* Step 2: Mandatory Phone (WhatsApp) & Birthday */
                <form onSubmit={handleCompleteGoogleLogin} className="space-y-3.5">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                    <div className="flex items-center gap-2.5">
                      <AppImage
                        src={googleAccount.avatarUrl}
                        alt={googleAccount.name}
                        fallbackType="avatar"
                        className="w-8 h-8 rounded-full border border-orange-500/60 object-cover"
                      />
                      <div>
                        <div className="text-xs font-bold text-neutral-100">{googleAccount.name}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">{googleAccount.email}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoogleStep('SELECT_ACCOUNT')}
                      className="text-[10px] text-orange-400 hover:underline"
                    >
                      Trocar conta
                    </button>
                  </div>

                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-2.5 text-[11px] text-orange-300">
                    <strong>Etapa Obrigatória:</strong> Complete seu telefone e data de aniversário para ativar seus agendamentos e benefícios de fidelização.
                  </div>

                  {loginError && (
                    <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-neutral-200 mb-1 flex items-center justify-between">
                      <span>WhatsApp / Telefone <span className="text-red-400">*</span></span>
                      <span className="text-[10px] text-emerald-400 font-normal">Lembretes automáticos</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={clientPhone}
                      onChange={e => setClientPhone(e.target.value)}
                      placeholder="(11) 98888-7777"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-200 mb-1 flex items-center justify-between">
                      <span>Data de Aniversário <span className="text-red-400">*</span></span>
                      <span className="text-[10px] text-purple-400 font-normal">Sorteios & presentes</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={clientBirthDate}
                      onChange={e => setClientBirthDate(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setGoogleStep('SELECT_ACCOUNT')}
                      className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-xl text-xs font-semibold"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all"
                    >
                      <Check className="w-4 h-4" />
                      <span>Concluir Login Google</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );

  if (isImpersonating) {
    return (
      <PhoneFrame
        title="App Exclusivo do Cliente"
        subtitle="Visualização com Vida de Aplicativo (Painel Carlos Silva)"
        barbershopName={currentBarbershop.name}
      >
        {appBody}
      </PhoneFrame>
    );
  }

  return (
    <div className="w-full min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center">
      {appBody}
    </div>
  );
};
