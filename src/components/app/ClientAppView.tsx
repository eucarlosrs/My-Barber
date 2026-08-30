import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { PhoneFrame } from './PhoneFrame';
import {
  generateAvailableSlots,
  generateUpcomingDays,
  getTodayLocalDateString,
  getBarbershopRealOpenStatus,
  getTodayBusinessHours
} from '../../utils/scheduleEngine';
import {
  Calendar,
  Clock,
  User,
  Scissors,
  CheckCircle2,
  Gift,
  Package,
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
  ExternalLink,
  Trash2,
  Shield,
  Lock,
  Sparkles,
  Eye,
  EyeOff
} from 'lucide-react';
import { Service, User as UserType, GalleryWork, Promotion, Raffle, Barbershop } from '../../types';
import { AppImage } from '../common/AppImage';
import { TermsModal } from '../common/TermsModal';
import { APP_ASSETS } from '../../data/assets';
import { triggerGooglePopupLogin } from '../../lib/googleAuth';
import { formatPhoneNumber } from '../../utils/formatters';
import { getThemeCssVariables } from '../../utils/theme';
import { ThemeModeToggle } from '../common/ThemeModeToggle';
import { BusinessHoursModal } from './BusinessHoursModal';

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
    authenticatedUser,
    loginWithWhatsApp,
    loginWithGoogle,
    loginWithCredentials,
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

  const [activeTab, setActiveTab] = useState<'BOOKING' | 'GALLERY' | 'MY_APPOINTMENTS' | 'PROMOTIONS' | 'RAFFLES' | 'PACKAGES' | 'ABOUT' | 'WAITLIST' | 'NEWS'>('BOOKING');
  const [selectedGalleryCategory, setSelectedGalleryCategory] = useState<string>('TODOS');
  const [activeWorkDetail, setActiveWorkDetail] = useState<GalleryWork | null>(null);
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);
  const [copiedDirectLink, setCopiedDirectLink] = useState(false);

  // Google Login Modal & State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginTab, setLoginTab] = useState<'CLIENT' | 'STAFF'>('CLIENT');
  const [staffIdentifier, setStaffIdentifier] = useState('carlosrs.email@gmail.com');
  const [staffPassword, setStaffPassword] = useState('Ca.753268');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [isStaffLoading, setIsStaffLoading] = useState(false);
  const [googleStep, setGoogleStep] = useState<'SELECT_ACCOUNT' | 'MASTER_PASSWORD' | 'COMPLETE_DATA'>('SELECT_ACCOUNT');
  const [pendingBookingAfterLogin, setPendingBookingAfterLogin] = useState(false);
  const [googleAccount, setGoogleAccount] = useState<{
    googleId: string;
    name: string;
    email: string;
    avatarUrl: string;
  }>({
    googleId: '',
    name: '',
    email: '',
    avatarUrl: ''
  });

  // Local storage for real remembered accounts on this specific device/browser
  const [savedAccounts, setSavedAccounts] = useState<Array<{
    googleId: string;
    name: string;
    email: string;
    avatarUrl: string;
    phone?: string;
    birthDate?: string;
    lastLoginAt: string;
  }>>(() => {
    try {
      const raw = localStorage.getItem('mybarber_saved_google_accounts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const persistSavedAccount = (acc: {
    googleId: string;
    name: string;
    email: string;
    avatarUrl: string;
    phone?: string;
    birthDate?: string;
  }) => {
    try {
      setSavedAccounts(prev => {
        const filtered = prev.filter(a => a.email.toLowerCase() !== acc.email.toLowerCase());
        const updated = [{ ...acc, lastLoginAt: new Date().toISOString() }, ...filtered].slice(0, 5);
        localStorage.setItem('mybarber_saved_google_accounts', JSON.stringify(updated));
        return updated;
      });
    } catch {
      // ignore
    }
  };

  const removeSavedAccount = (emailToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setSavedAccounts(prev => {
        const updated = prev.filter(a => a.email.toLowerCase() !== emailToRemove.toLowerCase());
        localStorage.setItem('mybarber_saved_google_accounts', JSON.stringify(updated));
        return updated;
      });
    } catch {
      // ignore
    }
  };

  const [clientPreferredName, setClientPreferredName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientBirthDate, setClientBirthDate] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');
  const [useCustomGoogle, setUseCustomGoogle] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dynamic Highlights Modals (Promotions & Raffles)
  const [selectedHighlightPromo, setSelectedHighlightPromo] = useState<Promotion | null>(null);
  const [selectedHighlightRaffle, setSelectedHighlightRaffle] = useState<Raffle | null>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showBusinessHoursModal, setShowBusinessHoursModal] = useState(false);

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

  // Real-time verified opening status based on barbershop schedules
  const [currentDateTime, setCurrentDateTime] = useState<Date>(() => new Date());

  // Periodically refresh the time to keep the open status 100% accurate
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000); // updates every minute
    return () => clearInterval(timer);
  }, []);

  const realOpenStatus = useMemo(() => {
    const professionalIds = professionals.map(p => p.id);
    return getBarbershopRealOpenStatus({
      schedules,
      professionalIds,
      businessHours: currentBarbershop.businessHours,
      referenceDate: currentDateTime
    });
  }, [schedules, professionals, currentBarbershop.businessHours, currentDateTime]);

  const todayBusinessHours = useMemo(() => {
    return getTodayBusinessHours(currentBarbershop.businessHours, currentDateTime);
  }, [currentBarbershop.businessHours, currentDateTime]);

  // Booking Flow Steps & State
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [selectedService, setSelectedService] = useState<Service | null>(services[0] || null);
  const [selectedProfessional, setSelectedProfessional] = useState<UserType | null>(professionals[0] || null);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedTime, setSelectedTime] = useState<string>('14:00');
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);
  const [bookingErrorMsg, setBookingErrorMsg] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [showCelebrationModal, setShowCelebrationModal] = useState<boolean>(false);
  const [celebrationDetails, setCelebrationDetails] = useState<{
    serviceName: string;
    professionalName: string;
    date: string;
    time: string;
    price: number;
  } | null>(null);

  // Waitlist form
  const [waitlistDate, setWaitlistDate] = useState(todayStr);
  const [waitlistService, setWaitlistService] = useState(services[0]?.id || '');
  const [waitlistTimeRange, setWaitlistTimeRange] = useState<'MANHA' | 'TARDE' | 'NOITE' | 'QUALQUER'>('TARDE');
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  // Sorteio Feedback
  const [raffleFeedback, setRaffleFeedback] = useState<{ raffleId: string; message: string; success: boolean } | null>(null);

  // Is current logged in user a client?
  const isClient = Boolean(authenticatedUser && authenticatedUser.role === 'CLIENTE');

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
      businessHours: currentBarbershop.businessHours,
      existingAppointments: appointments,
      stepMinutes: 30
    });
  }, [selectedDate, serviceDuration, selectedProfessional, selectedScheduleConfig, currentBarbershop.businessHours, appointments]);

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

  // Identificação e agrupamento inteligente dos serviços essenciais (Cabelo e Barba)
  const hairServices = useMemo(() => {
    return services.filter(s => {
      const cat = s.category?.toLowerCase() || '';
      const name = s.name?.toLowerCase() || '';
      return cat.includes('cabelo') || cat.includes('corte') || name.includes('corte') || name.includes('cabelo') || name.includes('degrade') || name.includes('degradê') || name.includes('navalhad');
    });
  }, [services]);

  const beardServices = useMemo(() => {
    return services.filter(s => {
      const cat = s.category?.toLowerCase() || '';
      const name = s.name?.toLowerCase() || '';
      return (cat.includes('barba') || cat.includes('barboterapia') || name.includes('barba') || name.includes('barboterapia')) && !cat.includes('combo') && !name.includes('combo');
    });
  }, [services]);

  // Funções para seleção e rolagem suave automática passo a passo
  const handleSelectServiceAndProceed = (srv: Service) => {
    setSelectedService(srv);
    setTimeout(() => {
      const profSection = document.getElementById('step-2-professionals');
      if (profSection) {
        profSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  };

  const handleSelectProfessionalAndProceed = (prof: UserType) => {
    setSelectedProfessional(prof);
    setTimeout(() => {
      const dateTimeSection = document.getElementById('step-3-datetime');
      if (dateTimeSection) {
        dateTimeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  };

  const handleSelectDateAndProceed = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  const handleSelectTimeAndProceed = (timeStr: string) => {
    setSelectedTime(timeStr);
    setBookingErrorMsg(null);
    setTimeout(() => {
      const confirmSection = document.getElementById('step-4-confirm');
      if (confirmSection) {
        confirmSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  };

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
      setCelebrationDetails({
        serviceName: selectedService.name,
        professionalName: selectedProfessional.name,
        date: selectedDate,
        time: selectedTime,
        price: selectedService.price
      });
      setShowCelebrationModal(true);
      setBookingSuccessMsg(`Agendamento confirmado para ${selectedDate.split('-').reverse().join('/')} às ${selectedTime}! Lembrete via WhatsApp ativado.`);
    } else {
      setBookingErrorMsg(res.error || 'Erro ao agendar.');
    }
  };

  const handleRealGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setLoginError(null);
    try {
      const result = await triggerGooglePopupLogin();
      setIsGoogleLoading(false);

      if (!result.success || !result.user) {
        if (result.error) {
          setLoginError(result.error);
        }
        return;
      }

      const acc = {
        googleId: result.user.uid,
        name: result.user.displayName,
        email: result.user.email,
        avatarUrl:
          result.user.photoURL ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(result.user.displayName)}&background=f97316&color=fff`
      };

      handleSelectGoogleAccount(acc);
    } catch (err: any) {
      setIsGoogleLoading(false);
      setLoginError(err?.message || 'Erro ao conectar ao Google.');
    }
  };

  const handleSelectGoogleAccount = (acc: { googleId: string; name: string; email: string; avatarUrl: string }) => {
    setGoogleAccount(acc);
    setLoginError(null);

    const cleanEmail = acc.email.trim().toLowerCase();

    // Check if the user is Super Admin (Carlos Silva) or Team Staff (Proprietario, Gerente, Profissional)
    const matchingAdminOrStaff = users.find(
      u => (cleanEmail && u.email?.toLowerCase() === cleanEmail) || (acc.googleId && u.googleId === acc.googleId)
    );

    if (matchingAdminOrStaff && matchingAdminOrStaff.role !== 'CLIENTE') {
      persistSavedAccount({
        googleId: acc.googleId,
        email: acc.email,
        name: matchingAdminOrStaff.name || acc.name,
        avatarUrl: matchingAdminOrStaff.avatarUrl || acc.avatarUrl
      });

      setShowLoginModal(false);
      setGoogleStep('SELECT_ACCOUNT');
      setLoginError(null);

      // Authenticate directly through centralized role-based login
      loginWithGoogle({
        googleId: acc.googleId,
        email: acc.email,
        name: matchingAdminOrStaff.name || acc.name,
        avatarUrl: matchingAdminOrStaff.avatarUrl || acc.avatarUrl,
        whatsapp: matchingAdminOrStaff.whatsapp || '',
        birthDate: matchingAdminOrStaff.birthDate || ''
      });
      return;
    }

    // Check if client already exists globally and has complete data
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
      persistSavedAccount({
        googleId: acc.googleId,
        email: acc.email,
        name: existingClient.name || acc.name,
        avatarUrl: acc.avatarUrl,
        phone: existingClient.whatsapp,
        birthDate: existingClient.birthDate
      });

      const loggedUser = loginWithGoogle({
        googleId: acc.googleId,
        email: acc.email,
        name: existingClient.name || acc.name,
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
      // First access / incomplete data -> Prompt "Complete seu cadastro"
      setClientPreferredName(existingClient?.name || acc.name);
      setClientPhone(existingClient?.whatsapp || '');
      setClientBirthDate(existingClient?.birthDate || '');
      setGoogleStep('COMPLETE_DATA');
    }
  };

  const handleStaffLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffIdentifier.trim()) {
      setLoginError('Informe seu e-mail, usuário ou WhatsApp de cadastro.');
      return;
    }
    setIsStaffLoading(true);
    setLoginError(null);

    setTimeout(() => {
      const res = loginWithCredentials(staffIdentifier, staffPassword);
      setIsStaffLoading(false);
      if (!res.success) {
        setLoginError(res.error || 'Credenciais inválidas. Verifique seu login e senha.');
      } else {
        setShowLoginModal(false);
        setLoginError(null);
      }
    }, 400);
  };

  const handleMasterPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterPassword) {
      setLoginError('Digite a senha de acesso mestre.');
      return;
    }
    const res = loginWithCredentials('carlosrs.email@gmail.com', masterPassword);
    if (!res.success) {
      setLoginError(res.error || 'Senha incorreta.');
      return;
    }
    setShowLoginModal(false);
    setGoogleStep('SELECT_ACCOUNT');
    setMasterPassword('');
    setLoginError(null);
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
    const cleanPhoneDigits = clientPhone.replace(/\D/g, '');
    if (!cleanPhoneDigits || cleanPhoneDigits.length < 8) {
      setLoginError('O WhatsApp / Telefone é obrigatório para receber confirmações de agendamento.');
      return;
    }
    if (!clientBirthDate.trim()) {
      setLoginError('A Data de Nascimento é obrigatória para benefícios e sorteios.');
      return;
    }

    const finalName = clientPreferredName.trim() || googleAccount.name;

    persistSavedAccount({
      googleId: googleAccount.googleId,
      email: googleAccount.email,
      name: finalName,
      avatarUrl: googleAccount.avatarUrl,
      phone: clientPhone.trim(),
      birthDate: clientBirthDate.trim()
    });

    const loggedUser = loginWithGoogle({
      googleId: googleAccount.googleId,
      email: googleAccount.email,
      name: finalName,
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
    <div
      className="flex-1 w-full max-w-4xl mx-auto flex flex-col bg-neutral-950 text-neutral-100 relative pb-24 shadow-2xl overflow-hidden"
      style={getThemeCssVariables(currentBarbershop.theme)}
    >
      {/* Ambient Theme Background Glow (esfumaceado elegante respeitando a cor da paleta ativa) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-24 -left-20 w-80 sm:w-96 h-80 sm:h-96 rounded-full opacity-[0.14] transition-all duration-700 pointer-events-none"
          style={{
            backgroundColor: 'var(--theme-primary, #FF6B00)',
            filter: 'blur(80px)'
          }}
        />
        <div
          className="absolute top-1/4 -right-24 w-72 sm:w-80 h-72 sm:h-80 rounded-full opacity-[0.10] transition-all duration-700 pointer-events-none"
          style={{
            backgroundColor: 'var(--theme-primary, #FF6B00)',
            filter: 'blur(90px)'
          }}
        />
        <div
          className="absolute top-2/3 -left-20 w-80 h-80 rounded-full opacity-[0.09] transition-all duration-700 pointer-events-none"
          style={{
            backgroundColor: 'var(--theme-primary, #FF6B00)',
            filter: 'blur(100px)'
          }}
        />
      </div>

      {/* Real Client Top Bar with Barbershop Name, Client greeting and Logout */}
      {isClient && !isImpersonating && (
        <div className="bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs sm:text-sm font-bold text-neutral-200 truncate">{currentBarbershop.name}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeModeToggle />
            <div className="flex items-center gap-2 text-xs text-neutral-300">
              <User className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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
          <div className="h-36 sm:h-44 w-full overflow-hidden relative">
            <AppImage
              src={currentBarbershop.bannerUrl || currentBarbershop.salonImages[0] || APP_ASSETS.banner}
              alt="Salão da Barbearia"
              fallbackType="banner"
              className="w-full h-full object-cover opacity-90 scale-105"
            />
            {/* Soft gradient from banner to bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/50 to-transparent pointer-events-none"></div>
            
            {/* Real-time Verified Open/Closed Status Tag - Translucent Glassmorphism (Clickable to view full business hours table) */}
            <button
              type="button"
              onClick={() => setShowBusinessHoursModal(true)}
              className={`absolute top-3.5 left-3.5 bg-black/55 hover:bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 shadow-lg border transition-all cursor-pointer ${
                realOpenStatus.isOpen
                  ? 'border-emerald-500/50 text-emerald-400'
                  : realOpenStatus.isLunchBreak
                  ? 'border-orange-500/50 text-orange-400'
                  : 'border-amber-500/50 text-amber-400'
              }`}
              title="Clique para ver a tabela completa de horários de atendimento"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  realOpenStatus.isOpen ? 'bg-emerald-400 animate-ping' : realOpenStatus.isLunchBreak ? 'bg-orange-400' : 'bg-amber-400'
                }`}
              />
              <span className="tracking-wide">{realOpenStatus.statusLabel}</span>
              {realOpenStatus.detailLabel && (
                <span className="text-[9px] text-neutral-300 font-normal hidden sm:inline border-l border-white/20 pl-1.5">
                  {realOpenStatus.detailLabel}
                </span>
              )}
              <Clock className="w-3 h-3 ml-0.5 text-neutral-400" />
            </button>

            {/* Dark / Light Mode Switch in Banner */}
            <div className="absolute top-3.5 right-3.5 z-10">
              <ThemeModeToggle variant="pill" />
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
                  className="w-16 h-16 rounded-2xl object-cover border-2 shadow-2xl bg-neutral-900 shrink-0"
                  style={{ borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.6))' }}
                />
                <div>
                  <div className="flex items-center gap-0.5">
                    <h1 className="text-base sm:text-lg font-bold text-neutral-100 leading-tight">
                      {currentBarbershop.name}
                    </h1>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${currentBarbershop.name}, ${currentBarbershop.address.street}, ${currentBarbershop.address.number}, ${currentBarbershop.address.neighborhood}, ${currentBarbershop.address.city} - ${currentBarbershop.address.state}`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-0.5 hover:bg-neutral-800/80 rounded-lg transition-colors cursor-pointer inline-flex items-center"
                      style={{ color: 'var(--theme-primary, #FF6B00)' }}
                      title="Abrir no Google Maps"
                    >
                      <MapPin className="w-3.5 h-3.5 shrink-0 hover:scale-110 transition-transform" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
                    </a>
                  </div>
                </div>
              </div>

              {/* Login / Profile Chip */}
              <div>
                {authenticatedUser ? (
                  <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700/80 px-2.5 py-1.5 rounded-2xl text-xs shadow-md">
                    {currentUser.avatarUrl ? (
                      <AppImage
                        src={currentUser.avatarUrl}
                        alt={currentUser.name}
                        fallbackType="userAvatar"
                        className="w-7 h-7 rounded-full object-cover border shrink-0"
                        style={{ borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.6))' }}
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] shrink-0"
                        style={{
                          backgroundColor: 'var(--theme-primary, #FF6B00)',
                          color: 'var(--theme-contrast, #0D0D0D)'
                        }}
                      >
                        {currentUser.name.charAt(0)}
                      </div>
                    )}
                    <div className="text-left">
                      <div className="font-extrabold text-neutral-100 text-[11px] leading-tight flex items-center gap-1">
                        <span>{currentUser.name.split(' ')[0]}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      </div>
                      {currentUser.role !== 'CLIENTE' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (currentUser.role === 'SUPER_ADMIN') setViewMode('MASTER_ADMIN');
                            else if (currentUser.role === 'PROPRIETARIO' || currentUser.role === 'GERENTE') setViewMode('WEBADMIN');
                            else if (currentUser.role === 'PROFISSIONAL') setViewMode('PROFISSIONAL_APP');
                          }}
                          className="text-[9px] font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                          style={{ color: 'var(--theme-primary, #FF6B00)' }}
                          title="Ir para o Painel de Gestão"
                        >
                          <Shield className="w-2.5 h-2.5" />
                          <span>Painel Gestão</span>
                        </button>
                      )}
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
                    className="group bg-neutral-900/90 hover:bg-neutral-800 text-neutral-100 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 shadow-lg border border-neutral-700/80 active:scale-95 transition-all cursor-pointer backdrop-blur-sm"
                  >
                    <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
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
                    </div>
                    <span className="text-[11px] tracking-wide transition-colors">Entrar Google</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dynamic Propaganda & Highlights Bar (Configured by Barbershop Owner/Manager) */}
            {hasAnyHighlights && (
              <div className="mt-3.5 pt-3 border-t border-neutral-800/80">
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Flame className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
                    Destaques & Novidades da Barbearia
                  </span>
                  <span className="text-[9px] font-medium" style={{ color: 'var(--theme-primary, #FF6B00)' }}>Toque para ver</span>
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
                      <div
                        className="w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full p-[2.5px] group-hover:scale-105 transition-transform shadow-md relative"
                        style={{
                          background: 'linear-gradient(135deg, var(--theme-primary, #FF6B00), var(--theme-hover, #E05A00))'
                        }}
                      >
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
                          <div
                            className="absolute -top-1 -right-1 text-[9px] font-black px-1.5 py-0.2 rounded-full shadow border border-neutral-950 z-10"
                            style={{
                              backgroundColor: 'var(--theme-primary, #FF6B00)',
                              color: 'var(--theme-contrast, #0D0D0D)'
                            }}
                          >
                            {promo.discountPercentage}%
                          </div>
                        )}
                      </div>
                      <div className="text-center w-full px-0.5">
                        <span className="text-[10px] font-bold text-neutral-200 block truncate transition-colors">
                          {promo.title}
                        </span>
                        <span className="text-[8px] font-black uppercase block truncate" style={{ color: 'var(--theme-primary, #FF6B00)' }}>
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
                      <div
                        className="w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full p-[2.5px] group-hover:scale-105 transition-transform shadow-md relative"
                        style={{
                          background: 'linear-gradient(135deg, var(--theme-primary, #FF6B00), var(--theme-hover, #E05A00))'
                        }}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-neutral-950 border border-neutral-900 relative">
                          <AppImage
                            src={raffle.imageUrl || 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=200'}
                            alt={raffle.title}
                            fallbackType="banner"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-neutral-950/20" />
                        </div>
                        <div
                          className="absolute -top-1 -right-1 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow border border-neutral-950 flex items-center z-10"
                          style={{
                            backgroundColor: 'var(--theme-primary, #FF6B00)',
                            color: 'var(--theme-contrast, #0D0D0D)'
                          }}
                        >
                          <Trophy className="w-2.5 h-2.5" />
                        </div>
                      </div>
                      <div className="text-center w-full px-0.5">
                        <span className="text-[10px] font-bold text-neutral-200 block truncate transition-colors">
                          {raffle.title}
                        </span>
                        <span className="text-[8px] font-black uppercase block truncate" style={{ color: 'var(--theme-primary, #FF6B00)' }}>
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
                    <span
                      className="w-5 h-5 rounded-full font-bold text-[11px] flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--theme-primary, #FF6B00)',
                        color: 'var(--theme-contrast, #0D0D0D)'
                      }}
                    >
                      1
                    </span>
                    <h3 className="font-semibold text-neutral-100 text-sm">
                      Selecione o Serviço
                    </h3>
                  </div>
                  <span className="text-xs text-neutral-400">{services.length} disponíveis</span>
                </div>

                {/* Category Filter Chips */}
                {categories.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar">
                    {categories.map(cat => {
                      const isCatSelected = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                            isCatSelected
                              ? 'font-semibold shadow-md'
                              : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                          }`}
                          style={
                            isCatSelected
                              ? {
                                  backgroundColor: 'var(--theme-primary, #FF6B00)',
                                  color: 'var(--theme-contrast, #0D0D0D)'
                                }
                              : undefined
                          }
                        >
                          {cat}
                        </button>
                      );
                    })}
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
                      className="px-3 py-1.5 rounded-xl text-xs font-bold"
                      style={{
                        backgroundColor: 'var(--theme-primary, #FF6B00)',
                        color: 'var(--theme-contrast, #0D0D0D)'
                      }}
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
                          onClick={() => handleSelectServiceAndProceed(srv)}
                          className={`w-full text-left p-3 rounded-2xl border transition-all flex items-start gap-3.5 active:scale-[0.99] group cursor-pointer ${
                            isSelected
                              ? 'bg-neutral-900/95 border-2 shadow-lg'
                              : 'bg-neutral-900/90 border border-neutral-800/90 hover:border-neutral-700 text-neutral-300'
                          }`}
                          style={
                            isSelected
                              ? {
                                  borderColor: 'var(--theme-primary, #FF6B00)',
                                  boxShadow: '0 10px 25px -5px var(--theme-focus, rgba(255, 107, 0, 0.2))'
                                }
                              : undefined
                          }
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
                            {/* Service Name & Price */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <span
                                  className="font-bold text-sm text-neutral-100 block transition-colors line-clamp-2 leading-snug break-words"
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
                                      className="inline-flex items-center gap-1 text-[10px] font-bold mt-1.5"
                                      style={{ color: 'var(--theme-primary, #FF6B00)' }}
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
                                        className="p-1 px-1.5 bg-neutral-800/90 hover:bg-neutral-700 rounded-md text-[10px] font-black shrink-0 flex items-center gap-0.5 border border-neutral-700/60 transition-colors shadow-sm"
                                        style={{ color: 'var(--theme-primary, #FF6B00)' }}
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
                              <span
                                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border"
                                style={{
                                  backgroundColor: 'var(--theme-surface, rgba(255, 107, 0, 0.15))',
                                  color: 'var(--theme-primary, #FF6B00)',
                                  borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.3))'
                                }}
                              >
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
              <div id="step-2-professionals">
                <div className="flex items-center gap-2 mb-2.5">
                  <span
                    className="w-5 h-5 rounded-full font-bold text-[11px] flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--theme-primary, #FF6B00)',
                      color: 'var(--theme-contrast, #0D0D0D)'
                    }}
                  >
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
                        onClick={() => handleSelectProfessionalAndProceed(prof)}
                        className={`p-3 rounded-2xl border text-left transition-all flex flex-col items-center text-center active:scale-[0.98] ${
                          isSelected
                            ? 'shadow-md'
                            : 'bg-neutral-900 border-neutral-800/80 hover:border-neutral-700'
                        }`}
                        style={
                          isSelected
                            ? {
                                backgroundColor: 'var(--theme-surface, rgba(255, 107, 0, 0.12))',
                                borderColor: 'var(--theme-primary, #FF6B00)',
                                boxShadow: '0 4px 14px 0 var(--theme-focus, rgba(255, 107, 0, 0.25))'
                              }
                            : undefined
                        }
                      >
                        <div className="relative mb-2">
                          <AppImage
                            src={prof.avatarUrl || APP_ASSETS.barberFelipe}
                            alt={prof.name}
                            fallbackType="avatar"
                            className="w-14 h-14 rounded-full object-cover border-2 border-neutral-700 shadow-md"
                          />
                          {isSelected && (
                            <div
                              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shadow"
                              style={{
                                backgroundColor: 'var(--theme-primary, #FF6B00)',
                                color: 'var(--theme-contrast, #0D0D0D)'
                              }}
                            >
                              ✓
                            </div>
                          )}
                        </div>
                        <div className="font-bold text-xs text-neutral-100 truncate w-full">{prof.name}</div>
                        <div className="flex items-center gap-1 text-[10px] font-semibold mt-0.5" style={{ color: 'var(--theme-primary, #FF6B00)' }}>
                          <Star className="w-2.5 h-2.5 fill-current" />
                          <span>4.9 (Mestre)</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Select Date Strip & Time Slots */}
              <div id="step-3-datetime">
                <div className="flex items-center gap-2 mb-2.5">
                  <span
                    className="w-5 h-5 rounded-full font-bold text-[11px] flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--theme-primary, #FF6B00)',
                      color: 'var(--theme-contrast, #0D0D0D)'
                    }}
                  >
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
                        onClick={() => handleSelectDateAndProceed(d.date)}
                        className={`flex flex-col items-center py-2 px-3 rounded-2xl border min-w-[58px] transition-all active:scale-95 ${
                          isSelected
                            ? 'shadow-md font-bold'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                        }`}
                        style={
                          isSelected
                            ? {
                                backgroundColor: 'var(--theme-primary, #FF6B00)',
                                color: 'var(--theme-contrast, #0D0D0D)',
                                borderColor: 'var(--theme-primary, #FF6B00)'
                              }
                            : undefined
                        }
                      >
                        <span className={`text-[10px] uppercase ${isSelected ? 'font-black' : 'text-neutral-400'}`}>
                          {d.dayName}
                        </span>
                        <span className="text-base font-extrabold my-0.5">{d.dayNum}</span>
                        <span className={`text-[9px] ${isSelected ? 'opacity-90' : 'text-neutral-500'}`}>
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
                                      handleSelectTimeAndProceed(slot.time);
                                    }
                                  }}
                                  className={`py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative ${
                                    !slot.available
                                      ? 'bg-neutral-950/40 text-neutral-600 border border-neutral-900 cursor-not-allowed line-through opacity-60'
                                      : isSelected
                                      ? 'shadow-md'
                                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                                  }`}
                                  style={
                                    isSelected
                                      ? {
                                          backgroundColor: 'var(--theme-primary, #FF6B00)',
                                          color: 'var(--theme-contrast, #0D0D0D)',
                                          boxShadow: '0 0 0 2px var(--theme-focus, rgba(255, 107, 0, 0.4))'
                                        }
                                      : undefined
                                  }
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
                                      handleSelectTimeAndProceed(slot.time);
                                    }
                                  }}
                                  className={`py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative ${
                                    !slot.available
                                      ? 'bg-neutral-950/40 text-neutral-600 border border-neutral-900 cursor-not-allowed line-through opacity-60'
                                      : isSelected
                                      ? 'shadow-md'
                                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                                  }`}
                                  style={
                                    isSelected
                                      ? {
                                          backgroundColor: 'var(--theme-primary, #FF6B00)',
                                          color: 'var(--theme-contrast, #0D0D0D)',
                                          boxShadow: '0 0 0 2px var(--theme-focus, rgba(255, 107, 0, 0.4))'
                                        }
                                      : undefined
                                  }
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
                                      handleSelectTimeAndProceed(slot.time);
                                    }
                                  }}
                                  className={`py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative ${
                                    !slot.available
                                      ? 'bg-neutral-950/40 text-neutral-600 border border-neutral-900 cursor-not-allowed line-through opacity-60'
                                      : isSelected
                                      ? 'shadow-md'
                                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                                  }`}
                                  style={
                                    isSelected
                                      ? {
                                          backgroundColor: 'var(--theme-primary, #FF6B00)',
                                          color: 'var(--theme-contrast, #0D0D0D)',
                                          boxShadow: '0 0 0 2px var(--theme-focus, rgba(255, 107, 0, 0.4))'
                                        }
                                      : undefined
                                  }
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
              <div
                id="step-4-confirm"
                className="bg-neutral-900 border-2 rounded-2xl p-4 shadow-xl space-y-3"
                style={{ borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.4))' }}
              >
                <div className="flex items-center justify-between text-xs pb-2 border-b border-neutral-800 gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-neutral-400 uppercase font-bold block">Resumo do Horário</span>
                    <div className="font-extrabold text-neutral-100 text-xs mt-0.5 truncate">
                      {selectedService?.name || 'Selecione o serviço'}
                    </div>
                    <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--theme-primary, #FF6B00)' }}>
                      Com {selectedProfessional?.name || 'Barbeiro'} • {selectedDate.split('-').reverse().join('/')} às {selectedTime}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-neutral-400 block">Total</span>
                    <span className="text-xs xs:text-sm sm:text-base font-black text-emerald-400 font-mono whitespace-nowrap inline-block">
                      R$ {selectedService ? selectedService.price.toFixed(2).replace('.', ',') : '0,00'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleConfirmBooking}
                  disabled={!selectedService || !selectedProfessional}
                  className={`w-full py-3.5 rounded-xl text-xs sm:text-sm font-semibold tracking-wide flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
                    selectedService && selectedProfessional
                      ? 'cursor-pointer'
                      : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  }`}
                  style={
                    selectedService && selectedProfessional
                      ? {
                          backgroundColor: 'var(--theme-primary, #FF6B00)',
                          color: 'var(--theme-contrast, #0D0D0D)',
                          boxShadow: '0 4px 15px var(--theme-focus, rgba(255, 107, 0, 0.3))'
                        }
                      : undefined
                  }
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>CONFIRMAR AGENDAMENTO</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: 📅 MEUS AGENDAMENTOS (HISTÓRICO MULTI-BARBEARIA DA PLATAFORMA) */}
          {activeTab === 'MY_APPOINTMENTS' && (
            !isClient ? (
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-center space-y-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
                  style={{
                    backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.15))',
                    color: 'var(--theme-primary, #FF6B00)'
                  }}
                >
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-neutral-100">Acesse seus agendamentos</h4>
                  <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                    Faça login com sua conta Google para visualizar seus horários marcados, histórico de serviços e tickets de atendimento.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setGoogleStep('SELECT_ACCOUNT');
                    setShowLoginModal(true);
                  }}
                  className="px-5 py-2.5 font-black rounded-xl text-xs flex items-center gap-2 mx-auto shadow-md transition-all active:scale-95 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--theme-primary, #FF6B00)',
                    color: 'var(--theme-contrast, #0D0D0D)'
                  }}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Entrar com Google</span>
                </button>
              </div>
            ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-neutral-100 font-heading text-base">
                    Meus Agendamentos
                  </h3>
                  <p className="text-[11px] text-neutral-400">Tickets de corte e histórico em toda a rede My Barber</p>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-bold border"
                  style={{
                    backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.15))',
                    color: 'var(--theme-primary, #FF6B00)',
                    borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.3))'
                  }}
                >
                  {clientAppointments.length + clientOtherAppointments.length} agendados
                </span>
              </div>

              {/* Seção 1: Agendamentos na barbearia atual */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div
                    className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: 'var(--theme-primary, #FF6B00)' }}
                  >
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
                      className="px-4 py-1.5 font-bold rounded-xl text-xs"
                      style={{
                        backgroundColor: 'var(--theme-primary, #FF6B00)',
                        color: 'var(--theme-contrast, #0D0D0D)'
                      }}
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
                        <div
                          className="p-3.5 flex items-center justify-between border-b border-neutral-800/80"
                          style={{
                            background: 'linear-gradient(to right, var(--theme-light-bg, rgba(255, 107, 0, 0.2)), transparent)'
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Ticket className="w-4 h-4" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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
                              <span className="font-extrabold" style={{ color: 'var(--theme-primary, #FF6B00)' }}>
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
                            className="text-neutral-300 hover:opacity-80 flex items-center gap-1 font-bold"
                            style={{ color: 'var(--theme-primary, #FF6B00)' }}
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
                    <div
                      className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                      style={{ color: 'var(--theme-primary, #FF6B00)' }}
                    >
                      <Compass className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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
                          className="bg-neutral-900/90 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg transition-all relative"
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
                                <Store className="w-4 h-4" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer border"
                              style={{
                                backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.15))',
                                color: 'var(--theme-primary, #FF6B00)',
                                borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.35))'
                              }}
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
            )
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
                <div
                  className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: 'var(--theme-primary, #FF6B00)' }}
                >
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
                      className="bg-neutral-900 rounded-2xl p-4 shadow-xl relative overflow-hidden border"
                      style={{
                        borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.4))',
                        background: 'linear-gradient(135deg, #171717, #171717 60%, var(--theme-light-bg, rgba(255, 107, 0, 0.15)))'
                      }}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span
                            className="text-[9px] font-black px-2 py-0.5 rounded uppercase"
                            style={{
                              backgroundColor: 'var(--theme-primary, #FF6B00)',
                              color: 'var(--theme-contrast, #0D0D0D)'
                            }}
                          >
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
                                <span
                                  className="font-extrabold font-mono"
                                  style={{ color: 'var(--theme-primary, #FF6B00)' }}
                                >
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
                                          : 'ring-1'
                                      }`}
                                      style={
                                        !isUsed
                                          ? {
                                              backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.2))',
                                              borderColor: 'var(--theme-primary, #FF6B00)',
                                              color: 'var(--theme-primary, #FF6B00)'
                                            }
                                          : undefined
                                      }
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
                                    ? 'shadow-md active:scale-95 cursor-pointer'
                                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                }`}
                                style={
                                  remaining > 0
                                    ? {
                                        backgroundColor: 'var(--theme-primary, #FF6B00)',
                                        color: 'var(--theme-contrast, #0D0D0D)'
                                      }
                                    : undefined
                                }
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
                            <strong style={{ color: 'var(--theme-primary, #FF6B00)' }}>{it.totalQuantity}x</strong>
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
              <div
                className="rounded-2xl p-4 shadow-xl border bg-neutral-900"
                style={{
                  borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.4))',
                  background: 'linear-gradient(135deg, var(--theme-light-bg, rgba(255, 107, 0, 0.2)), #171717 60%)'
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="w-5 h-5" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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
                              <span
                                className="text-[9px] font-black px-2 py-0.5 rounded uppercase border"
                                style={
                                  raffle.status === 'ATIVO'
                                    ? {
                                        backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.15))',
                                        color: 'var(--theme-primary, #FF6B00)',
                                        borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.35))'
                                      }
                                    : {
                                        backgroundColor: '#262626',
                                        color: '#A3A3A3',
                                        borderColor: '#404040'
                                      }
                                }
                              >
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

                          <div
                            className="p-3 rounded-xl border"
                            style={{
                              backgroundColor: 'var(--theme-surface, rgba(255, 107, 0, 0.06))',
                              borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.25))'
                            }}
                          >
                            <span className="text-[10px] text-neutral-400 font-semibold block">Prêmio Especial:</span>
                            <div
                              className="text-xs font-black mt-0.5 flex items-center gap-1.5"
                              style={{ color: 'var(--theme-primary, #FF6B00)' }}
                            >
                              <Gift className="w-4 h-4" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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
                                  className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer"
                                >
                                  Sair
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleRaffleClick(raffle.id)}
                                className="px-4 py-2 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                                style={{
                                  backgroundColor: 'var(--theme-primary, #FF6B00)',
                                  color: 'var(--theme-contrast, #0D0D0D)',
                                  boxShadow: '0 4px 14px 0 var(--theme-focus, rgba(255, 107, 0, 0.25))'
                                }}
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
              <div
                className="rounded-2xl p-4 shadow-xl border"
                style={{
                  background: 'linear-gradient(135deg, var(--theme-surface, rgba(255, 107, 0, 0.12)), rgba(20, 20, 20, 0.95))',
                  borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.35))'
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-5 h-5" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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
                            <span
                              className="text-[10px] font-black px-2 py-0.5 rounded border"
                              style={{
                                backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.15))',
                                color: 'var(--theme-primary, #FF6B00)',
                                borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.35))'
                              }}
                            >
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

                      {/* Direct Automatic Discount Indicator & Action */}
                      <div
                        className="p-2.5 rounded-xl border flex items-center justify-between"
                        style={{
                          backgroundColor: 'var(--theme-surface, rgba(255, 107, 0, 0.06))',
                          borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.25))'
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-lg flex items-center justify-center border"
                            style={{
                              backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.15))',
                              borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.35))',
                              color: 'var(--theme-primary, #FF6B00)'
                            }}
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Benefício:</span>
                            <span className="text-xs font-bold text-neutral-200">Desconto Direto no Horário</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-2 border-t border-neutral-800">
                        <span>Válido até: <strong className="text-neutral-200">{promo.validUntil.split('-').reverse().join('/')}</strong></span>
                        <button
                          onClick={() => {
                            const matchingService = services.find(s => 
                              (promo.serviceId && s.id === promo.serviceId) ||
                              (promo.serviceCategory && s.category?.toLowerCase() === promo.serviceCategory.toLowerCase()) ||
                              (promo.title && s.name.toLowerCase().includes(promo.title.toLowerCase()))
                            );
                            if (matchingService) {
                              setSelectedService(matchingService);
                            }
                            setActiveTab('BOOKING');
                          }}
                          className="px-3.5 py-1.5 font-black rounded-xl text-xs flex items-center gap-1.5 shadow active:scale-95 transition-all cursor-pointer"
                          style={{
                            backgroundColor: 'var(--theme-primary, #FF6B00)',
                            color: 'var(--theme-contrast, #0D0D0D)',
                            boxShadow: '0 4px 14px 0 var(--theme-focus, rgba(255, 107, 0, 0.25))'
                          }}
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Agendar com Desconto</span>
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
                      <span
                        className="text-[9px] font-black px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.2))',
                          color: 'var(--theme-primary, #FF6B00)'
                        }}
                      >
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
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none"
                    style={{ outlineColor: 'var(--theme-primary, #FF6B00)' }}
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
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none"
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
                            ? 'shadow-md'
                            : 'bg-neutral-950 text-neutral-400 border border-neutral-800'
                        }`}
                        style={
                          waitlistTimeRange === p
                            ? {
                                backgroundColor: 'var(--theme-primary, #FF6B00)',
                                color: 'var(--theme-contrast, #0D0D0D)'
                              }
                            : undefined
                        }
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl font-black text-xs transition-colors shadow-md active:scale-95 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--theme-primary, #FF6B00)',
                    color: 'var(--theme-contrast, #0D0D0D)'
                  }}
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
                    <Camera className="w-4 h-4" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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
                        ? 'shadow-md'
                        : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                    }`}
                    style={
                      selectedGalleryCategory === cat.id
                        ? {
                            backgroundColor: 'var(--theme-primary, #FF6B00)',
                            color: 'var(--theme-contrast, #0D0D0D)'
                          }
                        : undefined
                    }
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
                      className="group bg-neutral-900 border border-neutral-800/90 rounded-2xl overflow-hidden flex flex-col shadow-lg transition-all"
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
                          <span
                            className="text-[9px] font-extrabold bg-neutral-950/80 px-1.5 py-0.5 rounded backdrop-blur-sm uppercase"
                            style={{ color: 'var(--theme-primary, #FF6B00)' }}
                          >
                            {work.category}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-2.5 flex-1 flex flex-col justify-between space-y-2 bg-neutral-900">
                        <div>
                          <h4
                            onClick={() => setActiveWorkDetail(work)}
                            className="font-bold text-neutral-100 text-xs line-clamp-1 cursor-pointer transition-colors"
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
                          className="w-full py-1.5 font-bold rounded-xl text-[10px] transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95"
                          style={{
                            backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.2))',
                            color: 'var(--theme-primary, #FF6B00)'
                          }}
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
                    <Building2 className="w-4 h-4" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
                    <span>Nosso Espaço</span>
                  </h3>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--theme-primary, #FF6B00)' }}
                  >
                    Ambiente VIP
                  </span>
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
                          <div
                            className="text-[10px] font-semibold"
                            style={{ color: 'var(--theme-primary, #FF6B00)' }}
                          >
                            {prof.specialty || 'Especialista em Degradê & Barba'}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedProfessional(prof);
                          setActiveTab('BOOKING');
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                        style={{
                          backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.2))',
                          color: 'var(--theme-primary, #FF6B00)'
                        }}
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
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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

          {/* Rodapé Elegante com Link para Gestão da Barbearia */}
          <div className="pt-8 pb-14 text-center">
            <button
              type="button"
              onClick={() => setViewMode('LOGIN')}
              className="text-[11px] text-neutral-500 hover:text-neutral-200 font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer py-1.5 px-3 rounded-xl hover:bg-neutral-900 border border-transparent hover:border-neutral-800"
            >
              <Shield className="w-3.5 h-3.5 text-neutral-500" />
              <span>Acesso da Barbearia (Gestão & Equipe)</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2.5 FLOATING ACTION BUTTON (AGENDAR) - FOLLOWS CLIENT ACROSS ALL TABS */}
        {/* ========================================================================= */}
        {activeTab !== 'BOOKING' && (
          <div className="fixed bottom-24 right-3.5 sm:right-5 md:right-6 z-40 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                setActiveTab('BOOKING');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="group flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900/90 hover:bg-neutral-800 font-bold rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.6)] border transition-all duration-200 transform active:scale-95 cursor-pointer backdrop-blur-md"
              style={{
                color: 'var(--theme-primary, #FF6B00)',
                borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.35))'
              }}
              title="Agendar horário na barbearia agora"
            >
              <Scissors
                className="w-3.5 h-3.5 stroke-[2.2] shrink-0 animate-scissor-snip"
                style={{ color: 'var(--theme-primary, #FF6B00)' }}
              />
              <span className="text-[11px] font-extrabold uppercase tracking-wide font-heading">
                Agendar
              </span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. NATIVE APP BOTTOM NAVIGATION BAR (FIXED WITH BARBER POLE THEMED EFFECT) */}
        {/* ========================================================================= */}
        <div className="fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none px-2 pb-2 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent pt-4">
          <div className="w-full max-w-4xl pointer-events-auto">
            <nav
              aria-label="Navegação da barbearia"
              className="relative overflow-hidden rounded-2xl bg-neutral-950 border border-neutral-800 shadow-[0_-12px_36px_rgba(0,0,0,0.95),0_0_24px_rgba(0,0,0,0.8)] px-1 pt-1 pb-1.5"
            >
              {/* Efeito Barber Pole Temático no Topo do Menu */}
              <div className="h-1 w-full barber-pole-stripe rounded-full opacity-90 shadow-[0_1px_6px_rgba(239,68,68,0.4)] mb-1" />

              <div className="flex items-center justify-around">
                {[
                  { id: 'BOOKING', label: 'Agendar', icon: Scissors },
                  { id: 'MY_APPOINTMENTS', label: 'Meus agendamentos', icon: Calendar, badge: clientAppointments.length },
                  { id: 'GALLERY', label: 'Galeria', icon: Camera },
                  { id: 'PROMOTIONS', label: 'Promoções', icon: Tag, badge: promotions.filter(p => p.active).length },
                  { id: 'ABOUT', label: 'Salão', icon: Building2 },
                  { id: 'RAFFLES', label: 'Sorteios', icon: Gift }
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all relative cursor-pointer group ${
                        isActive
                          ? 'font-bold'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                      style={isActive ? { color: 'var(--theme-primary, #FF6B00)' } : undefined}
                    >
                      {/* Efeito de Lâmina / Brilho do Tema da Barbearia no item Ativo */}
                      {isActive && (
                        <div
                          className="absolute inset-0 rounded-xl pointer-events-none"
                          style={{
                            background: 'linear-gradient(to bottom, var(--theme-light-bg, rgba(255, 107, 0, 0.15)), transparent)',
                            borderTop: '1px solid var(--theme-primary, #FF6B00)',
                            boxShadow: '0 0 12px var(--theme-glow, rgba(255, 107, 0, 0.25))'
                          }}
                        />
                      )}

                      <div className="relative">
                        <Icon
                          className={`w-4 h-4 transition-all duration-200 ${
                            isActive
                              ? 'stroke-[2.6] scale-110'
                              : 'stroke-2 group-hover:scale-105'
                          }`}
                          style={isActive ? { color: 'var(--theme-primary, #FF6B00)' } : undefined}
                        />
                        {tab.badge && tab.badge > 0 ? (
                          <span
                            className="absolute -top-1.5 -right-2 text-[9px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-md"
                            style={{
                              backgroundColor: 'var(--theme-primary, #FF6B00)',
                              color: 'var(--theme-contrast, #0D0D0D)'
                            }}
                          >
                            {tab.badge}
                          </span>
                        ) : null}
                      </div>

                      <span
                        className={`text-[9px] mt-0.5 tracking-tight transition-colors ${
                          isActive
                            ? 'font-black tracking-normal'
                            : 'font-medium text-neutral-400'
                        }`}
                        style={isActive ? { color: 'var(--theme-primary, #FF6B00)' } : undefined}
                      >
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>


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
                  <span
                    className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border"
                    style={{
                      color: 'var(--theme-primary, #FF6B00)',
                      backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.1))',
                      borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.2))'
                    }}
                  >
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
                    <Scissors className="w-4 h-4" style={{ color: 'var(--theme-primary, #FF6B00)' }} />
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
                  className="w-full py-3 font-black rounded-xl text-xs transition-colors shadow-lg active:scale-95 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--theme-primary, #FF6B00)',
                    color: 'var(--theme-contrast, #0D0D0D)'
                  }}
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
                <div
                  className="absolute top-4 left-4 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg shadow-md"
                  style={{
                    backgroundColor: 'var(--theme-primary, #FF6B00)',
                    color: 'var(--theme-contrast, #0D0D0D)'
                  }}
                >
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
                      <span
                        className="text-xs font-black border px-2 py-0.5 rounded-lg shrink-0"
                        style={{
                          backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.2))',
                          color: 'var(--theme-primary, #FF6B00)',
                          borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.3))'
                        }}
                      >
                        {selectedHighlightPromo.discountPercentage}% OFF
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
                    {selectedHighlightPromo.description}
                  </p>
                </div>

                {/* Automatic Direct Benefit indicator */}
                <div
                  className="bg-neutral-900 p-3 rounded-2xl border flex items-center justify-between"
                  style={{ borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.3))' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-xl border flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.1))',
                        borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.3))',
                        color: 'var(--theme-primary, #FF6B00)'
                      }}
                    >
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 font-bold block uppercase">Condição Especial:</span>
                      <span className="text-xs font-bold text-neutral-200">Desconto Aplicado no Agendamento</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-black bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                    Sem cupom
                  </span>
                </div>

                <button
                  onClick={() => {
                    const matchingService = services.find(s => 
                      (selectedHighlightPromo.serviceId && s.id === selectedHighlightPromo.serviceId) ||
                      (selectedHighlightPromo.serviceName && s.name.toLowerCase() === selectedHighlightPromo.serviceName.toLowerCase()) ||
                      (selectedHighlightPromo.title && s.name.toLowerCase().includes(selectedHighlightPromo.title.toLowerCase()))
                    );
                    if (matchingService) {
                      setSelectedService(matchingService);
                    }
                    setSelectedHighlightPromo(null);
                    setActiveTab('BOOKING');
                  }}
                  className="w-full py-3 font-black rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--theme-primary, #FF6B00)',
                    color: 'var(--theme-contrast, #0D0D0D)'
                  }}
                >
                  <Scissors className="w-4 h-4" />
                  <span>Aproveitar e Agendar com Desconto</span>
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
                <div
                  className="absolute top-4 left-4 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1"
                  style={{
                    backgroundColor: 'var(--theme-primary, #FF6B00)',
                    color: 'var(--theme-contrast, #0D0D0D)'
                  }}
                >
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

                <div
                  className="p-3 rounded-2xl border"
                  style={{
                    backgroundColor: 'var(--theme-surface, rgba(255, 107, 0, 0.06))',
                    borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.25))'
                  }}
                >
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block">Prêmio:</span>
                  <strong className="text-xs font-bold mt-0.5 block" style={{ color: 'var(--theme-primary, #FF6B00)' }}>
                    {selectedHighlightRaffle.prize}
                  </strong>
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
                  className="w-full py-3 font-black rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--theme-primary, #FF6B00)',
                    color: 'var(--theme-contrast, #0D0D0D)',
                    boxShadow: '0 4px 16px 0 var(--theme-focus, rgba(255, 107, 0, 0.25))'
                  }}
                >
                  <Gift className="w-4 h-4" />
                  <span>Ver Todos os Sorteios & Detalhes</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unified Authentication & Login Modal with Strict Tab Segmentation */}
        {showLoginModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-5 text-neutral-100 shadow-2xl animate-fade-in relative">
              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  setShowLoginModal(false);
                  setLoginError(null);
                  setGoogleStep('SELECT_ACCOUNT');
                }}
                className="absolute top-4 right-4 p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer shrink-0 z-10"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Centered Barbershop Logo Header */}
              <div className="flex flex-col items-center text-center pt-1 pb-3">
                <div className="w-16 h-16 rounded-2xl bg-neutral-950 border border-neutral-800 p-1 flex items-center justify-center shadow-lg overflow-hidden mb-2 relative">
                  <AppImage
                    src={currentBarbershop.logoUrl}
                    alt={currentBarbershop.name}
                    fallbackType="logo"
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>
                <h3 className="text-sm font-black font-heading text-neutral-100 truncate max-w-[240px]">
                  {currentBarbershop.name}
                </h3>
                <p className="text-[11px] text-neutral-400">
                  {loginTab === 'CLIENT' ? 'Acesso e agendamento para clientes' : 'Acesso administrativo & equipe'}
                </p>
              </div>

              {/* Navigation Tabs Segmentation: Sou Cliente vs Equipe & Gestão */}
              {googleStep === 'SELECT_ACCOUNT' && (
                <div className="grid grid-cols-2 p-1 bg-neutral-950 rounded-2xl border border-neutral-800 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginTab('CLIENT');
                      setLoginError(null);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      loginTab === 'CLIENT'
                        ? 'shadow-md'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                    style={
                      loginTab === 'CLIENT'
                        ? {
                            backgroundColor: 'var(--theme-primary, #FF6B00)',
                            color: 'var(--theme-contrast, #0D0D0D)'
                          }
                        : undefined
                    }
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Sou Cliente</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginTab('STAFF');
                      setLoginError(null);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      loginTab === 'STAFF'
                        ? 'shadow-md'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                    style={
                      loginTab === 'STAFF'
                        ? {
                            backgroundColor: 'var(--theme-primary, #FF6B00)',
                            color: 'var(--theme-contrast, #0D0D0D)'
                          }
                        : undefined
                    }
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Equipe & Gestão</span>
                  </button>
                </div>
              )}

              {/* Error Message */}
              {loginError && (
                <div className="mb-3 p-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">{loginError}</p>
                    {loginError.includes('autorização') && (
                      <p className="text-[11px] text-red-200/80">
                        Preencha seu nome e e-mail Google no formulário abaixo para acessar diretamente.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 1: CLIENT LOGIN VIA GOOGLE */}
              {loginTab === 'CLIENT' && (
                <div>
                  {googleStep === 'SELECT_ACCOUNT' ? (
                    <div>
                      {/* Botão Oficial de Login Real com Google */}
                      <button
                        type="button"
                        disabled={isGoogleLoading}
                        onClick={handleRealGoogleLogin}
                        className="w-full mb-3 py-3 px-4 bg-white hover:bg-neutral-100 text-neutral-900 font-bold rounded-2xl text-xs flex items-center justify-center gap-2.5 shadow-lg transition-all active:scale-98 cursor-pointer disabled:opacity-50"
                      >
                        {isGoogleLoading ? (
                          <div className="w-4 h-4 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                        )}
                        <span>{isGoogleLoading ? 'Autenticando com Google...' : 'Cliente: acesse com conta Google'}</span>
                      </button>

                      {/* Exibição apenas de contas salvas reais deste dispositivo */}
                      {savedAccounts.length > 0 && (
                        <div className="mb-3">
                          <div className="relative flex py-1 items-center mb-2.5">
                            <div className="flex-grow border-t border-neutral-800"></div>
                            <span className="flex-shrink mx-2 text-[9px] uppercase font-bold text-neutral-400 tracking-wider">
                              Contas salvas neste dispositivo
                            </span>
                            <div className="flex-grow border-t border-neutral-800"></div>
                          </div>

                          <div className="space-y-2">
                            {savedAccounts.map(acc => (
                              <div
                                key={acc.email}
                                onClick={() => handleSelectGoogleAccount(acc)}
                                className="w-full bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 p-2.5 rounded-2xl flex items-center justify-between text-left transition-all group cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                  <AppImage
                                    src={acc.avatarUrl}
                                    alt={acc.name}
                                    fallbackType="avatar"
                                    className="w-8 h-8 rounded-full object-cover border border-neutral-700 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-neutral-100 transition-colors truncate">
                                      {acc.name}
                                    </div>
                                    <div className="text-[10px] text-neutral-400 font-mono truncate">{acc.email}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    title="Remover deste dispositivo"
                                    onClick={(e) => removeSavedAccount(acc.email, e)}
                                    className="p-1.5 text-neutral-500 hover:text-red-400 rounded-lg hover:bg-neutral-800/80 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <ChevronRight className="w-4 h-4 text-neutral-500" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Opção para informar conta Google diretamente */}
                      {savedAccounts.length > 0 && !useCustomGoogle ? (
                        <button
                          type="button"
                          onClick={() => setUseCustomGoogle(true)}
                          className="w-full py-2 bg-neutral-950 hover:bg-neutral-850 text-neutral-300 rounded-xl text-xs font-semibold border border-neutral-800 transition-all text-center cursor-pointer"
                        >
                          + Usar outra conta Google
                        </button>
                      ) : (
                        <form onSubmit={handleCustomGoogleSubmit} className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: 'var(--theme-primary, #FF6B00)' }}
                            >
                              Entrar com Nome e E-mail Google:
                            </span>
                            {savedAccounts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setUseCustomGoogle(false)}
                                className="text-[10px] text-neutral-400 hover:text-neutral-200"
                              >
                                Fechar
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            required
                            placeholder="Seu Nome Completo"
                            value={customGoogleName}
                            onChange={e => setCustomGoogleName(e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none"
                          />
                          <input
                            type="email"
                            required
                            placeholder="seu.email@gmail.com"
                            value={customGoogleEmail}
                            onChange={e => setCustomGoogleEmail(e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none"
                          />
                          <div className="flex justify-end gap-2 pt-1">
                            {savedAccounts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setUseCustomGoogle(false)}
                                className="px-2.5 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                              >
                                Cancelar
                              </button>
                            )}
                            <button
                              type="submit"
                              className="w-full sm:w-auto px-4 py-2 font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
                              style={{
                                backgroundColor: 'var(--theme-primary, #FF6B00)',
                                color: 'var(--theme-contrast, #0D0D0D)'
                              }}
                            >
                              Continuar com esta conta
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ) : googleStep === 'MASTER_PASSWORD' ? (
                    /* Master Admin Carlos Silva Access Screen */
                    <form onSubmit={handleMasterPasswordSubmit} className="space-y-3.5">
                      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold"
                            style={{
                              backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.2))',
                              color: 'var(--theme-primary, #FF6B00)'
                            }}
                          >
                            <Lock className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black font-heading text-neutral-100">Acesso Master Plataforma</h3>
                            <p className="text-[10px] text-neutral-400 font-mono">carlosrs.email@gmail.com</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGoogleStep('SELECT_ACCOUNT')}
                          className="text-[10px] hover:underline"
                          style={{ color: 'var(--theme-primary, #FF6B00)' }}
                        >
                          Trocar
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-200 mb-1">
                          Senha Mestre de Acesso
                        </label>
                        <input
                          type="password"
                          required
                          autoFocus
                          value={masterPassword}
                          onChange={e => setMasterPassword(e.target.value)}
                          placeholder="Digite sua senha mestre"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none font-mono"
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
                          className="px-4 py-2 font-black rounded-xl text-xs shadow-md flex items-center gap-1.5 transition-all"
                          style={{
                            backgroundColor: 'var(--theme-primary, #FF6B00)',
                            color: 'var(--theme-contrast, #0D0D0D)'
                          }}
                        >
                          <Check className="w-4 h-4" />
                          <span>Acessar Painel Master</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* Step: Mandatory First Access "Bem-vindo! Complete seu cadastro" */
                    <form onSubmit={handleCompleteGoogleLogin} className="space-y-3.5">
                      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                        <div className="flex items-center gap-2.5">
                          <AppImage
                            src={googleAccount.avatarUrl}
                            alt={googleAccount.name}
                            fallbackType="avatar"
                            className="w-8 h-8 rounded-full border object-cover"
                            style={{ borderColor: 'var(--theme-primary, #FF6B00)' }}
                          />
                          <div>
                            <div className="text-xs font-bold text-neutral-100">{googleAccount.name}</div>
                            <div className="text-[10px] text-neutral-400 font-mono">{googleAccount.email}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGoogleStep('SELECT_ACCOUNT')}
                          className="text-[10px] hover:underline"
                          style={{ color: 'var(--theme-primary, #FF6B00)' }}
                        >
                          Trocar conta
                        </button>
                      </div>

                      <div>
                        <h3 className="text-sm font-black font-heading text-neutral-100 flex items-center gap-1.5">
                          <span>🎉 Bem-vindo! Complete seu cadastro</span>
                        </h3>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          Preencha seus dados para confirmar seu agendamento e receber lembretes no WhatsApp.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-200 mb-1 flex items-center justify-between">
                          <span>Como deseja ser chamado <span className="text-red-400">*</span></span>
                          <span className="text-[10px] text-neutral-400 font-normal">Nome no aplicativo</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={clientPreferredName}
                          onChange={e => setClientPreferredName(e.target.value)}
                          placeholder="Ex: Carlos Silva"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-200 mb-1 flex items-center justify-between">
                          <span>WhatsApp / Telefone <span className="text-red-400">*</span></span>
                          <span className="text-[10px] text-emerald-400 font-normal">Lembretes automáticos</span>
                        </label>
                        <input
                          type="tel"
                          required
                          value={clientPhone}
                          onChange={e => setClientPhone(formatPhoneNumber(e.target.value))}
                          placeholder="(11) 98888-7777"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-200 mb-1 flex items-center justify-between">
                          <span>Data de Nascimento <span className="text-red-400">*</span></span>
                          <span className="text-[10px] text-purple-400 font-normal">Sorteios & presentes</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={clientBirthDate}
                          onChange={e => setClientBirthDate(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none font-mono"
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
                          className="px-4 py-2 font-black rounded-xl text-xs shadow-md flex items-center gap-1.5 transition-all"
                          style={{
                            backgroundColor: 'var(--theme-primary, #FF6B00)',
                            color: 'var(--theme-contrast, #0D0D0D)'
                          }}
                        >
                          <Check className="w-4 h-4" />
                          <span>Salvar Cadastro & Continuar</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 2: STAFF & MANAGEMENT LOGIN */}
              {loginTab === 'STAFF' && (
                <form onSubmit={handleStaffLoginSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-200 mb-1">
                      E-mail / Usuário de Acesso
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                      <input
                        type="text"
                        required
                        value={staffIdentifier}
                        onChange={e => setStaffIdentifier(e.target.value)}
                        placeholder="seu.email@barbearia.com"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-neutral-100 focus:outline-none focus:border-orange-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-200 mb-1">
                      Senha de Acesso
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                      <input
                        type={showStaffPassword ? 'text' : 'password'}
                        required
                        value={staffPassword}
                        onChange={e => setStaffPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-10 py-2.5 text-xs text-neutral-100 focus:outline-none focus:border-orange-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStaffPassword(!showStaffPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                      >
                        {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isStaffLoading}
                    className="w-full py-3 px-4 font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98 cursor-pointer disabled:opacity-50 mt-2"
                    style={{
                      backgroundColor: 'var(--theme-primary, #FF6B00)',
                      color: 'var(--theme-contrast, #0D0D0D)'
                    }}
                  >
                    {isStaffLoading ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Shield className="w-4 h-4" />
                        <span>Acessar Painel da Barbearia</span>
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setShowLoginModal(false);
                        setViewMode('STAFF_LOGIN');
                      }}
                      className="text-[11px] text-neutral-400 hover:text-neutral-200 underline cursor-pointer"
                    >
                      Ir para tela completa de login administrativo
                    </button>
                  </div>
                </form>
              )}

              {/* Footer: Termos de Uso */}
              <div className="pt-3 mt-3 border-t border-neutral-800/80 text-center">
                <p className="text-[10.5px] text-neutral-400 leading-relaxed">
                  Acessando você concorda com o{' '}
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    className="font-bold underline hover:opacity-80 transition-opacity cursor-pointer inline-block"
                    style={{ color: 'var(--theme-primary, #FF6B00)' }}
                  >
                    termo de uso
                  </button>
                  .
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4.5 COMPLETE ADDRESS MODAL */}
        {showAddressModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-6 text-neutral-100 shadow-2xl relative animate-in fade-in zoom-in duration-200">
              <button
                type="button"
                onClick={() => setShowAddressModal(false)}
                className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded-full transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div
                  className="p-3 border rounded-2xl"
                  style={{
                    backgroundColor: 'var(--theme-light-bg, rgba(255, 107, 0, 0.1))',
                    borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.3))',
                    color: 'var(--theme-primary, #FF6B00)'
                  }}
                >
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-100">
                    Localização & Endereço
                  </h3>
                  <p className="text-xs text-neutral-400">
                    {currentBarbershop.name}
                  </p>
                </div>
              </div>

              <div className="bg-neutral-950/80 border border-neutral-800/80 rounded-2xl p-4 mb-5 space-y-2.5">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Rua e Número</span>
                  <p className="text-sm font-bold text-neutral-100 mt-0.5">
                    {currentBarbershop.address.street}, Nº {currentBarbershop.address.number}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-900">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Bairro</span>
                    <p className="text-xs font-semibold text-neutral-200 mt-0.5">
                      {currentBarbershop.address.neighborhood}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Cidade / UF</span>
                    <p className="text-xs font-semibold text-neutral-200 mt-0.5">
                      {currentBarbershop.address.city} - {currentBarbershop.address.state}
                    </p>
                  </div>
                </div>

                {currentBarbershop.address.zipCode && (
                  <div className="pt-2 border-t border-neutral-900">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">CEP</span>
                    <p className="text-xs font-mono text-neutral-300 mt-0.5">
                      {currentBarbershop.address.zipCode}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${currentBarbershop.address.street}, ${currentBarbershop.address.number} - ${currentBarbershop.address.neighborhood}, ${currentBarbershop.address.city} - ${currentBarbershop.address.state}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 px-4 font-black rounded-2xl text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
                  style={{
                    backgroundColor: 'var(--theme-primary, #FF6B00)',
                    color: 'var(--theme-contrast, #0D0D0D)'
                  }}
                >
                  <span>Abrir no Google Maps</span>
                  <ExternalLink className="w-4 h-4" />
                </a>

                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  className="py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-2xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4.6 BOOKING SUCCESS CELEBRATION MODAL (FESTIVE CONFETTI & CONFIRMATION) */}
        {/* ========================================================================= */}
        {showCelebrationModal && celebrationDetails && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div
              className="bg-neutral-950 border-2 rounded-3xl max-w-sm w-full p-6 text-center text-neutral-100 shadow-2xl relative overflow-hidden"
              style={{ borderColor: 'var(--theme-border, rgba(255, 107, 0, 0.5))' }}
            >
              {/* Decorative Barber Pole Line */}
              <div className="absolute top-0 left-0 right-0 h-1.5 barber-pole-stripe" />

              {/* Animated Floating Confetti / Sparks */}
              <div
                className="absolute -top-3 left-1/4 w-2 h-2 rounded-full animate-ping opacity-75"
                style={{ backgroundColor: 'var(--theme-primary, #FF6B00)' }}
              />
              <div className="absolute top-8 right-8 w-2 h-2 rounded-full bg-amber-300 animate-ping opacity-60" />
              <div className="absolute bottom-10 left-6 w-2 h-2 rounded-full bg-emerald-400 animate-pulse opacity-70" />

              {/* Animated Success Badge with Scissors & Checkmark */}
              <div className="relative my-4 inline-flex items-center justify-center">
                <div
                  className="w-20 h-20 rounded-full p-0.5 shadow-lg animate-bounce"
                  style={{
                    background: 'linear-gradient(135deg, var(--theme-primary, #FF6B00), #F59E0B)'
                  }}
                >
                  <div
                    className="w-full h-full rounded-full bg-neutral-950 flex items-center justify-center"
                    style={{ color: 'var(--theme-primary, #FF6B00)' }}
                  >
                    <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-neutral-950 rounded-full p-1.5 shadow-md">
                  <Scissors className="w-4 h-4 text-neutral-950" />
                </div>
              </div>

              <h3 className="text-xl font-black text-neutral-100 font-heading tracking-tight">
                Horário Confirmado!
              </h3>
              <p
                className="text-xs font-bold uppercase tracking-wider mt-1"
                style={{ color: 'var(--theme-primary, #FF6B00)' }}
              >
                Seu agendamento foi realizado com sucesso
              </p>

              {/* Appointment Ticket Card */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 my-5 text-left space-y-2.5 shadow-inner">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <span className="text-[11px] font-semibold text-neutral-400">Serviço</span>
                  <span className="text-xs font-black text-neutral-100">{celebrationDetails.serviceName}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <span className="text-[11px] font-semibold text-neutral-400">Profissional</span>
                  <span className="text-xs font-bold" style={{ color: 'var(--theme-primary, #FF6B00)' }}>{celebrationDetails.professionalName}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <span className="text-[11px] font-semibold text-neutral-400">Data e Horário</span>
                  <span className="text-xs font-bold text-emerald-400">
                    {celebrationDetails.date.split('-').reverse().join('/')} às {celebrationDetails.time}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-neutral-400">Valor</span>
                  <span className="text-sm font-black text-neutral-100 font-mono">
                    R$ {celebrationDetails.price.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-neutral-400 mb-5 leading-relaxed">
                Você pode acompanhar e gerenciar seus horários na aba <strong>Meus Agendamentos</strong>.
              </p>

              <button
                type="button"
                onClick={() => {
                  setShowCelebrationModal(false);
                  setActiveTab('MY_APPOINTMENTS');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full py-3.5 px-4 font-black rounded-2xl text-xs sm:text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
                style={{
                  backgroundColor: 'var(--theme-primary, #FF6B00)',
                  color: 'var(--theme-contrast, #0D0D0D)'
                }}
              >
                <span>VER MEUS AGENDAMENTOS</span>
                <ChevronRight className="w-4 h-4 stroke-[3]" />
              </button>
            </div>
          </div>
        )}

        {/* Termos de Uso Modal */}
        <TermsModal
          isOpen={showTermsModal}
          onClose={() => setShowTermsModal(false)}
          barbershopName={currentBarbershop.name}
        />

        {/* Horário de Atendimento e Funcionamento Modal */}
        <BusinessHoursModal
          isOpen={showBusinessHoursModal}
          onClose={() => setShowBusinessHoursModal(false)}
          barbershop={currentBarbershop}
          openStatus={realOpenStatus}
        />
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
