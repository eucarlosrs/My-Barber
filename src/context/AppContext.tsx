import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  Barbershop,
  User,
  UserRole,
  Service,
  ProfessionalScheduleConfig,
  Appointment,
  AppointmentStatus,
  WaitlistEntry,
  ServicePackage,
  CustomerPackage,
  Raffle,
  Promotion,
  CommunicationMessage,
  StockItem,
  ReturnMessage,
  PlanId,
  MY_BARBER_PLANS,
  RegisterBarbershopInput,
  GalleryWork,
  AuditLog,
  Subscription,
  SubscriptionPaymentRecord,
  SubscriptionStatus,
  ColorMode,
  CustomPlan,
  PlanBillingScheduleStage
} from '../types';
import {
  INITIAL_BARBERSHOPS,
  INITIAL_USERS,
  INITIAL_SERVICES,
  INITIAL_SCHEDULES,
  INITIAL_APPOINTMENTS,
  INITIAL_PACKAGES,
  INITIAL_CUSTOMER_PACKAGES,
  INITIAL_WAITLIST,
  INITIAL_RAFFLES,
  INITIAL_PROMOTIONS,
  INITIAL_COMMUNICATIONS,
  INITIAL_STOCK,
  INITIAL_RETURN_MESSAGES,
  INITIAL_GALLERY_WORKS,
  INITIAL_AUDIT_LOGS,
  INITIAL_SUBSCRIPTIONS,
  INITIAL_SUBSCRIPTION_PAYMENTS,
  INITIAL_CUSTOM_PLANS
} from '../data/initialData';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isTimeSlotAvailable, timeToMinutes, minutesToTime } from '../utils/scheduleEngine';
import {
  subscribeCollection,
  subscribeTenantCollection,
  subscribeSubcollection,
  subscribeQuery,
  subscribeDoc,
  syncDoc,
  deleteDocFromDb,
  fetchHistoricalAppointments
} from '../lib/firestoreSync';
import {
  PublicAvailabilitySlot,
  PublicProfessionalProfile,
  PublicCommunication,
  PublicRaffle,
  PublicService,
  PublicProfessionalScheduleConfig,
  PublicBarbershop,
  PublicPackage,
  PublicPromotion,
  PublicGalleryWork
} from '../types';
import {
  toPublicAvailabilitySlot,
  toPublicProfessionalProfile,
  toPublicCommunication,
  toPublicRaffle,
  toPublicService,
  toPublicSchedule,
  toPublicBarbershop,
  toPublicPackage,
  toPublicPromotion,
  toPublicGalleryWork
} from '../utils/projections';
import {
  authenticateUserCredentials,
  validateProfessionalCreation,
  normalizeLogin
} from '../utils/professionalAuthEngine';
import { uploadImageToStorage } from '../lib/storage';
import {
  subscribeToAuthChanges,
  getFirebaseCurrentUser,
  logoutFromFirebaseAuth,
  tryMigrateUserToFirebaseAuth,
  getIdTokenFromCurrentUser,
  sanitizeUserProfileForFirestore
} from '../lib/authService';
import {
  AuthUserClaims,
  CanonicalRole,
  getAuthClaims,
  refreshAuthClaimsSafely,
  toCanonicalRole,
  toLegacyRole
} from '../lib/authClaims';
import { getAppCheckToken } from '../lib/appCheck';

export type AppViewMode = 'LOGIN' | 'STAFF_LOGIN' | 'ARCHITECTURE' | 'MASTER_ADMIN' | 'WEBADMIN' | 'CLIENT_APP' | 'PROFISSIONAL_APP' | 'DISCOVERY';

export const MY_BARBER_MAIN_DOMAIN = 'mybarberbr.com.br';

function getInitialTenantFromUrl(barbershopList: Barbershop[] = INITIAL_BARBERSHOPS): string | null {
  try {
    if (typeof window !== 'undefined') {
      // 1. Identificação por Subdomínio exclusivo (ex: barbeariadojoao.mybarberbr.com.br ou slug.localhost)
      const hostname = window.location.hostname.toLowerCase();
      const hostParts = hostname.split('.');
      if (hostParts.length >= 3 || (hostParts.length === 2 && hostParts[1].includes('localhost'))) {
        const sub = hostParts[0];
        if (sub && !['www', 'app', 'painel', 'admin', 'api', 'dev', 'ais-dev', 'ais-pre'].includes(sub)) {
          const found = barbershopList.find(
            b => b.slug.toLowerCase() === sub ||
                 b.slug.replace(/[^a-z0-9]/g, '') === sub.replace(/[^a-z0-9]/g, '') ||
                 b.id.toLowerCase() === sub ||
                 b.customDomain.toLowerCase().includes(sub)
          );
          if (found) return found.id;
        }
      }

      // 2. Identificação por parâmetros de URL (?b=slug, ?barbearia=slug, ?shop=slug)
      const searchParams = new URLSearchParams(window.location.search);
      const slugOrId = searchParams.get('b') || searchParams.get('barbearia') || searchParams.get('shop') || searchParams.get('slug') || searchParams.get('tenant') || searchParams.get('id');
      if (slugOrId) {
        const clean = slugOrId.toLowerCase().trim();
        const found = barbershopList.find(
          b => b.id.toLowerCase() === clean ||
               b.slug.toLowerCase() === clean ||
               b.slug.replace(/[^a-z0-9]/g, '') === clean.replace(/[^a-z0-9]/g, '')
        );
        if (found) return found.id;
      }

      // 3. Identificação por Hash ou Rota de Caminho (#/barbeariadojoao ou /barbearia/slug)
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (hash) {
        const hashSlug = hash.replace(/^barbearia\//, '');
        const found = barbershopList.find(
          b => b.id.toLowerCase() === hashSlug ||
               b.slug.toLowerCase() === hashSlug ||
               b.slug.replace(/[^a-z0-9]/g, '') === hashSlug.replace(/[^a-z0-9]/g, '')
        );
        if (found) return found.id;
      }

      const pathname = window.location.pathname.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
      if (pathname && !['login', 'master-admin', 'webadmin', 'profissional'].includes(pathname)) {
        const pathSlug = pathname.replace(/^barbearia\//, '');
        const found = barbershopList.find(
          b => b.slug.toLowerCase() === pathSlug || b.id.toLowerCase() === pathSlug
        );
        if (found) return found.id;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

interface AppContextType {
  // Loading & Hydration
  isInitialLoading: boolean;

  // Navigation & View Mode
  viewMode: AppViewMode;
  setViewMode: (mode: AppViewMode) => void;

  // Direct Link Helper
  getBarbershopDirectUrl: (barbershop?: Barbershop | string) => string;
  getBarbershopExclusiveDomain: (barbershop?: Barbershop | string) => string;

  // Authentication & Session
  authenticatedUser: User | null;
  loginWithCredentials: (identifier: string, password?: string) => { success: boolean; role?: UserRole; error?: string; user?: User };
  logout: () => void;

  // Active Tenant
  activeTenantId: string;
  setActiveTenantId: (id: string) => void;
  currentBarbershop: Barbershop;
  updateBarbershop: (updated: Partial<Barbershop>, targetShopId?: string) => void;
  barbershops: Barbershop[];
  registerBarbershop: (input: RegisterBarbershopInput) => Promise<{ success: boolean; barbershopId: string; subscription?: Subscription; initPointUrl?: string; error?: string }>;
  deleteBarbershop: (barbershopId: string) => { success: boolean; error?: string };
  toggleBarbershopStatus: (barbershopId: string, active: boolean) => void;

  // Master Admin Platform Audit Logs
  auditLogs: AuditLog[];
  addAuditLog: (log: Omit<AuditLog, 'id' | 'timestamp'>) => void;

  // Active User / Session
  currentUser: User;
  setCurrentUserId: (id: string) => void;
  setCurrentUserIdWithRoute: (id: string) => void;
  users: User[];
  tenantUsers: User[];
  professionals: User[];
  clients: User[];

  // Data Collections (isolated by tenant)
  services: Service[];
  allServices: Service[];
  schedules: ProfessionalScheduleConfig[];
  appointments: Appointment[];
  allAppointments: Appointment[];
  waitlist: WaitlistEntry[];
  packages: ServicePackage[];
  customerPackages: CustomerPackage[];
  raffles: Raffle[];
  promotions: Promotion[];
  communications: CommunicationMessage[];
  stock: StockItem[];
  returnMessages: ReturnMessage[];
  galleryWorks: GalleryWork[];

  // Operations
  addAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt' | 'reminderSent'>) => { success: boolean; error?: string };
  bookOnlineAppointment: (params: {
    tenantId: string;
    professionalId: string;
    serviceId: string;
    date: string;
    startTime: string;
    clientName: string;
    clientWhatsApp: string;
    notes?: string;
  }) => Promise<{ success: boolean; error?: string; appointment?: Appointment }>;
  rescheduleAppointment: (
    appointmentId: string,
    newDate: string,
    newStartTime: string,
    newEndTime?: string
  ) => Promise<{ success: boolean; error?: string; appointment?: Appointment }>;
  cancelAppointment: (
    appointmentId: string,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  updateAppointmentStatus: (appointmentId: string, status: AppointmentStatus) => void;
  addToWaitlist: (entry: Omit<WaitlistEntry, 'id' | 'createdAt' | 'status'>) => void;
  
  // Gallery & Storage Media
  addGalleryWork: (work: Omit<GalleryWork, 'id' | 'tenantId' | 'likesCount' | 'createdAt'>) => void;
  updateGalleryWork: (workId: string, updates: Partial<GalleryWork>) => void;
  deleteGalleryWork: (workId: string) => void;
  likeGalleryWork: (workId: string) => void;
  uploadMedia: (file: File, folder?: string) => Promise<string>;
  
  // Raffles
  createRaffle: (raffle: Omit<Raffle, 'id' | 'status' | 'participants' | 'createdAt'>) => void;
  updateRaffle: (raffleId: string, data: Partial<Raffle>) => void;
  executeRaffle: (raffleId: string) => { success: boolean; winnerName?: string; winnerId?: string; message: string; eligibleCount: number };
  deleteRaffle: (raffleId: string) => void;
  participateInRaffle: (raffleId: string, clientId: string) => { success: boolean; message: string };
  isClientEligibleForRaffle: (clientId: string) => { eligible: boolean; eligibleDate?: string; reason?: string };
  
  // Promotions
  createPromotion: (promo: Omit<Promotion, 'id' | 'createdAt'>) => void;
  updatePromotion: (promoId: string, promo: Partial<Promotion>) => void;
  togglePromotionActive: (promoId: string) => void;
  deletePromotion: (promoId: string) => void;

  usePackageItem: (customerPackageId: string, itemId: string) => Promise<boolean> | boolean;
  addService: (service: Omit<Service, 'id'>) => void;
  updateService: (serviceId: string, data: Partial<Service>) => void;
  updateUser: (userId: string, data: Partial<User>) => void;
  addProfessional: (user: Omit<User, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string; user?: User }> | { success: boolean; error?: string; user?: User };
  updateProfessional: (profId: string, data: Partial<User>) => void;
  deleteProfessional: (profId: string) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  updateStockQuantity: (id: string, delta: number) => Promise<boolean> | boolean | void;
  addStockItem: (item: Omit<StockItem, 'id' | 'tenantId'>) => void;
  updateStockItem: (stockId: string, data: Partial<StockItem>) => void;
  createCommunication: (comm: Omit<CommunicationMessage, 'id' | 'sentAt' | 'logs'>) => void;
  sendReturnMessage: (returnId: string) => void;

  // Client Google Authentication with WhatsApp & Birth Date
  whatsappLoginPhone: string;
  loginWithWhatsApp: (phone: string, name?: string) => User;
  loginWithGoogle: (data: { googleId?: string; email: string; name: string; avatarUrl?: string; whatsapp: string; birthDate: string; emailVerified?: boolean }) => User;
  logoutClient: () => void;

  // Access Hierarchy: Master creates Owner/Manager, Manager creates Professional
  createManagerAccess: (data: { tenantId: string; name: string; email: string; whatsapp: string; role: 'PROPRIETARIO' | 'GERENTE'; avatarUrl?: string; birthDate?: string }) => { success: boolean; error?: string; user?: User };
  createProfessionalAccess: (data: Omit<User, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string; user?: User }> | { success: boolean; error?: string; user?: User };

  // Super Admin Exclusive: Impersonation / "Visualizar como Usuário"
  isImpersonating: boolean;
  impersonationOriginUserId: string | null;
  startImpersonation: (targetRole: UserRole, targetTenantId?: string, specificUserId?: string) => void;
  stopImpersonation: () => void;

  // Plans Management (SaaS Custom Plans & Builder)
  customPlans: CustomPlan[];
  createCustomPlan: (planData: Partial<CustomPlan>, idempotencyKey?: string) => Promise<{ success: boolean; plan?: CustomPlan; error?: string; isReplay?: boolean }>;
  updateCustomPlan: (planId: string, updates: Partial<CustomPlan>) => Promise<{ success: boolean; plan?: CustomPlan; error?: string }>;
  togglePlanStatus: (planId: string, targetStatus: 'ACTIVE' | 'INACTIVE') => Promise<{ success: boolean; plan?: CustomPlan; error?: string }>;
  duplicateCustomPlan: (planId: string, idempotencyKey?: string) => Promise<{ success: boolean; plan?: CustomPlan; error?: string; isReplay?: boolean }>;

  // Recurring Subscriptions (Mercado Pago)
  subscriptions: Subscription[];
  subscriptionsLoading: boolean;
  subscriptionsError: string | null;
  subscriptionPayments: SubscriptionPaymentRecord[];
  currentSubscription?: Subscription;
  isPastDue: boolean;
  isSuspended: boolean;
  toleranceDaysRemaining: number;
  createSubscription: (data: { barbershopId: string; barbershopName?: string; payerEmail: string; payerName?: string; payerPhone?: string; planId?: string }) => Promise<{ success: boolean; subscription?: Subscription; initPointUrl?: string; error?: string }>;
  createLifetimeCheckout: (data: { barbershopId: string; barbershopName?: string; payerEmail: string; payerName?: string }) => Promise<{ success: boolean; initPointUrl?: string; preferenceId?: string; price?: number; error?: string }>;
  activateLifetimeLicense: (data: { barbershopId: string; paymentId: string; paymentMethod?: string }) => Promise<{ success: boolean; subscription?: Subscription; message?: string; error?: string }>;
  cancelSubscription: (barbershopId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  syncSubscription: (barbershopId: string) => Promise<{ success: boolean; subscription?: Subscription; error?: string }>;
  simulateSubscriptionAction: (barbershopId: string, action: 'CONFIRM_PAYMENT' | 'TRIGGER_PAST_DUE' | 'TRIGGER_SUSPEND' | 'REGULARIZE' | 'CANCEL' | 'STEP_BILLING_COUNT' | 'VALIDATE_CARD_AND_START_TRIAL') => Promise<{ success: boolean; subscription?: Subscription; message?: string; error?: string }>;

  // Dark / Light Theme Color Mode
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;

  // IAM & Custom Claims (RBAC Soberano / Multi-tenant)
  authClaims: AuthUserClaims | null;
  refreshClaims: () => Promise<AuthUserClaims | null>;
  changeUserRoleWithClaims: (targetUid: string, newRole: CanonicalRole | UserRole, tenantId?: string) => Promise<{ success: boolean; error?: string }>;

  // Projeções Públicas Blindadas (Zero PII / Isolamento Rigoroso)
  publicAvailability: PublicAvailabilitySlot[];
  publicProfessionals: PublicProfessionalProfile[];
  publicServices: PublicService[];
  publicSchedules: PublicProfessionalScheduleConfig[];
  publicCommunications: PublicCommunication[];
  publicRaffles: PublicRaffle[];
  publicBarbershops: PublicBarbershop[];
  publicPackages: PublicPackage[];
  publicPromotions: PublicPromotion[];
  publicGalleryWorks: PublicGalleryWork[];

  // Isolamento de Leitura e Consultas Sob Demanda (FASE 2.2B)
  loadHistoricalAppointments: (options?: { tenantId?: string; startDate?: string; endDate?: string; limitCount?: number }) => Promise<Appointment[]>;
  loadTenantDataForAdmin: (tenantId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // REGRA DE SEGURANÇA: Firebase Auth é a ÚNICA fonte de verdade da identidade.
  // Nenhum dado em localStorage pode autenticar o usuário ou conceder privilégios.
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [authClaims, setAuthClaims] = useState<AuthUserClaims | null>(null);

  const [viewMode, setViewMode] = useState<AppViewMode>(() => {
    try {
      if (typeof window !== 'undefined') {
        const searchParams = new URLSearchParams(window.location.search);
        const isStaffParam =
          searchParams.get('admin') ||
          searchParams.get('gestao') ||
          searchParams.get('staff') ||
          searchParams.get('painel') === 'gestao' ||
          searchParams.get('mode') === 'staff' ||
          searchParams.get('view') === 'admin';

        const hash = window.location.hash.toLowerCase();
        const isStaffHash = hash.includes('admin') || hash.includes('gestao') || hash.includes('staff');

        const pathname = window.location.pathname.toLowerCase();
        const isStaffPath = pathname.endsWith('/admin') || pathname.endsWith('/gestao') || pathname.endsWith('/staff');

        if (isStaffParam || isStaffHash || isStaffPath) {
          return 'STAFF_LOGIN';
        }
      }
    } catch {
      // ignore
    }
    return 'CLIENT_APP';
  });

  const [barbershops, setBarbershops] = useState<Barbershop[]>(() => {
    try {
      const cached = localStorage.getItem('mybarber_cached_barbershops');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const map = new Map<string, Barbershop>();
          INITIAL_BARBERSHOPS.forEach(b => map.set(b.id, b));
          parsed.forEach((b: Barbershop) => map.set(b.id, b));
          return Array.from(map.values());
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_BARBERSHOPS;
  });
  const [activeTenantId, setActiveTenantIdState] = useState<string>(() => {
    const urlTenant = getInitialTenantFromUrl();
    if (urlTenant) {
      try {
        localStorage.setItem('mybarber_active_tenant_id', urlTenant);
      } catch {
        // ignore
      }
      return urlTenant;
    }
    try {
      const savedTenantId = localStorage.getItem('mybarber_active_tenant_id');
      if (savedTenantId) {
        return savedTenantId;
      }
    } catch {
      // ignore
    }
    return INITIAL_BARBERSHOPS[0].id;
  });

  const setActiveTenantId = (newTenantId: string) => {
    setActiveTenantIdState(newTenantId);
    try {
      localStorage.setItem('mybarber_active_tenant_id', newTenantId);
    } catch {
      // ignore
    }
  };

  // Limpeza de resíduos de cache legados contendo PII
  try {
    localStorage.removeItem('mybarber_cached_users');
    localStorage.removeItem('mybarber_cached_appointments');
  } catch {
    // ignore
  }

  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  // Visitante padrão não autenticado (Zero privilégio)
  const [currentUserId, setCurrentUserId] = useState<string>('user-guest-client');

  const [services, setServices] = useState<Service[]>(INITIAL_SERVICES);
  const [schedules, setSchedules] = useState<ProfessionalScheduleConfig[]>(INITIAL_SCHEDULES);
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>(INITIAL_WAITLIST);
  const [packages, setPackages] = useState<ServicePackage[]>(INITIAL_PACKAGES);
  const [customerPackages, setCustomerPackages] = useState<CustomerPackage[]>(INITIAL_CUSTOMER_PACKAGES);
  const [raffles, setRaffles] = useState<Raffle[]>(INITIAL_RAFFLES);
  const [promotions, setPromotions] = useState<Promotion[]>(INITIAL_PROMOTIONS);
  const [communications, setCommunications] = useState<CommunicationMessage[]>(INITIAL_COMMUNICATIONS);
  const [stock, setStock] = useState<StockItem[]>(INITIAL_STOCK);
  const [returnMessages, setReturnMessages] = useState<ReturnMessage[]>(INITIAL_RETURN_MESSAGES);
  const [galleryWorks, setGalleryWorks] = useState<GalleryWork[]>(INITIAL_GALLERY_WORKS);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(INITIAL_SUBSCRIPTIONS);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState<boolean>(true);
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null);
  const [subscriptionPayments, setSubscriptionPayments] = useState<SubscriptionPaymentRecord[]>(INITIAL_SUBSCRIPTION_PAYMENTS);
  const [customPlans, setCustomPlans] = useState<CustomPlan[]>(INITIAL_CUSTOM_PLANS);

  // Projeções Públicas de Dados (Zero PII / Isolamento Rigoroso)
  const [publicAvailability, setPublicAvailability] = useState<PublicAvailabilitySlot[]>(() =>
    INITIAL_APPOINTMENTS.map(toPublicAvailabilitySlot)
  );
  const [publicProfessionals, setPublicProfessionals] = useState<PublicProfessionalProfile[]>(() =>
    INITIAL_USERS.filter(u => u.role === 'PROFISSIONAL').map(toPublicProfessionalProfile)
  );
  const [publicServices, setPublicServices] = useState<PublicService[]>(() =>
    INITIAL_SERVICES.map(toPublicService)
  );
  const [publicSchedules, setPublicSchedules] = useState<PublicProfessionalScheduleConfig[]>(() =>
    INITIAL_SCHEDULES.map(s => toPublicSchedule(s))
  );
  const [publicCommunications, setPublicCommunications] = useState<PublicCommunication[]>(() =>
    INITIAL_COMMUNICATIONS.map(toPublicCommunication)
  );
  const [publicRaffles, setPublicRaffles] = useState<PublicRaffle[]>(() =>
    INITIAL_RAFFLES.map(toPublicRaffle)
  );
  const [publicBarbershops, setPublicBarbershops] = useState<PublicBarbershop[]>(() =>
    INITIAL_BARBERSHOPS.map(toPublicBarbershop)
  );
  const [publicPackages, setPublicPackages] = useState<PublicPackage[]>(() =>
    INITIAL_PACKAGES.map(toPublicPackage)
  );
  const [publicPromotions, setPublicPromotions] = useState<PublicPromotion[]>(() =>
    INITIAL_PROMOTIONS.map(toPublicPromotion)
  );
  const [publicGalleryWorks, setPublicGalleryWorks] = useState<PublicGalleryWork[]>(() =>
    INITIAL_GALLERY_WORKS.map(toPublicGalleryWork)
  );

  // Dark Theme Permanent (Modo Escuro Padrão e Único do Sistema)
  const [colorMode] = useState<ColorMode>('dark');

  const setColorMode = (_mode: ColorMode) => {
    // Permanent dark mode - no-op
  };

  const toggleColorMode = () => {
    // Permanent dark mode - no-op
  };

  useEffect(() => {
    try {
      localStorage.removeItem('mybarber_color_mode');
      document.documentElement.classList.remove('light-mode');
      document.documentElement.setAttribute('data-theme-mode', 'dark');
      document.body.classList.remove('light-mode');
    } catch {
      // ignore
    }
  }, []);
  const [whatsappLoginPhone, setWhatsappLoginPhone] = useState<string>('');
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  // Impersonation state (Super Admin exclusive)
  const [isImpersonating, setIsImpersonating] = useState<boolean>(false);
  const [impersonationOriginUserId, setImpersonationOriginUserId] = useState<string | null>(null);

  // Current Barbershop (memoized for rock-solid stability)
  const currentBarbershop = useMemo(() => {
    return barbershops.find(b => b.id === activeTenantId) || barbershops[0];
  }, [barbershops, activeTenantId]);

  // Guest user representation for unauthenticated sessions
  const guestUser: User = useMemo(() => ({
    id: 'user-guest-client',
    tenantId: activeTenantId,
    role: 'CLIENTE',
    name: 'Visitante',
    whatsapp: '',
    createdAt: new Date().toISOString()
  }), [activeTenantId]);

  // Current User (memoized for rock-solid stability and zero privilege leak)
  const currentUser = useMemo(() => {
    if (isImpersonating && currentUserId) {
      const simulated = users.find(u => u.id === currentUserId);
      if (simulated) return simulated;
    }
    if (authenticatedUser) {
      return users.find(u => u.id === authenticatedUser.id || (authenticatedUser.uid && u.uid === authenticatedUser.uid)) || authenticatedUser;
    }
    return guestUser;
  }, [authenticatedUser, users, isImpersonating, currentUserId, guestUser]);

  // Tenant-scoped users
  const tenantUsers = users.filter(u => u.tenantId === activeTenantId);
  const professionals = useMemo(() => {
    const userMap = new Map<string, User>();
    tenantUsers
      .filter(u => u.role === 'PROFISSIONAL' && u.status !== 'inactive')
      .forEach(u => userMap.set(u.id, u));

    // Se houver profissionais na projeção pública que não estão na coleção privada
    // (ex: profissional comum autenticado que só lê seu próprio doc em /users, ou visitante/cliente)
    publicProfessionals
      .filter(p => p.tenantId === activeTenantId)
      .forEach(p => {
        if (!userMap.has(p.id)) {
          userMap.set(p.id, {
            id: p.id,
            name: p.name,
            tenantId: p.tenantId,
            role: 'PROFISSIONAL' as const,
            avatarUrl: p.avatarUrl,
            specialties: p.specialties,
            createdAt: ''
          } as User);
        }
      });

    return Array.from(userMap.values());
  }, [tenantUsers, publicProfessionals, activeTenantId]);
  const clients = tenantUsers.filter(u => u.role === 'CLIENTE');

  // Tenant-scoped collections
  const tenantServices = useMemo(() => {
    const fromServices = services.filter(s => s.tenantId === activeTenantId);
    if (fromServices.length > 0) return fromServices;
    // Fallback gracioso para a projeção pública caso o cliente não tenha acesso aos campos de comissão de /services
    return publicServices
      .filter(s => s.tenantId === activeTenantId)
      .map(s => ({
        ...s,
        commissionPercentage: 0,
        returnReminderDays: 0
      } as Service));
  }, [services, publicServices, activeTenantId]);

  const tenantAppointments = appointments.filter(a => a.tenantId === activeTenantId);
  const tenantWaitlist = waitlist.filter(w => w.tenantId === activeTenantId);
  
  const tenantPackages = useMemo(() => {
    const isManager = currentUser.role === 'PROPRIETARIO' || currentUser.role === 'GERENTE' || currentUser.role === 'SUPER_ADMIN';
    if (isManager) {
      return packages.filter(p => p.tenantId === activeTenantId);
    }
    return publicPackages
      .filter(p => p.tenantId === activeTenantId)
      .map(p => ({
        id: p.id,
        tenantId: p.tenantId,
        title: p.title,
        description: p.description,
        price: p.price,
        items: p.items,
        active: p.active,
        createdAt: ''
      } as ServicePackage));
  }, [currentUser, packages, publicPackages, activeTenantId]);

  const tenantCustomerPackages = customerPackages.filter(cp => cp.tenantId === activeTenantId);

  const tenantRaffles = useMemo(() => {
    const isManager = currentUser.role === 'PROPRIETARIO' || currentUser.role === 'GERENTE' || currentUser.role === 'SUPER_ADMIN';
    if (isManager) {
      return raffles.filter(r => r.tenantId === activeTenantId);
    }
    // Para clientes e visitantes, utiliza a projeção pública de sorteios (zero dados de participantes)
    return publicRaffles
      .filter(r => r.tenantId === activeTenantId)
      .map(r => ({
        id: r.id,
        tenantId: r.tenantId,
        title: r.title,
        description: r.description,
        prize: r.prize,
        drawDate: r.drawDate,
        imageUrl: r.imageUrl,
        status: r.status,
        showInHighlights: r.showInHighlights,
        highlightTag: r.highlightTag,
        participantsCount: r.participantsCount,
        winnerName: r.winnerName,
        winnerClientName: r.winnerClientName,
        createdAt: r.createdAt,
        participants: []
      } as Raffle));
  }, [currentUser, raffles, publicRaffles, activeTenantId]);

  const tenantPromotions = useMemo(() => {
    const isManager = currentUser.role === 'PROPRIETARIO' || currentUser.role === 'GERENTE' || currentUser.role === 'SUPER_ADMIN';
    if (isManager) {
      return promotions.filter(p => p.tenantId === activeTenantId);
    }
    return publicPromotions
      .filter(p => p.tenantId === activeTenantId)
      .map(p => ({
        id: p.id,
        tenantId: p.tenantId,
        title: p.title,
        description: p.description,
        discountPercentage: p.discountPercentage,
        discountPercent: p.discountPercent,
        promotionalPrice: p.promotionalPrice,
        serviceId: p.serviceId,
        serviceName: p.serviceName,
        serviceCategory: p.serviceCategory,
        code: p.code,
        validUntil: p.validUntil,
        active: p.active,
        imageUrl: p.imageUrl,
        bannerUrl: p.bannerUrl,
        showInHighlights: p.showInHighlights,
        highlightTag: p.highlightTag,
        createdAt: ''
      } as Promotion));
  }, [currentUser, promotions, publicPromotions, activeTenantId]);

  const tenantCommunications = useMemo(() => {
    const isManager = currentUser.role === 'PROPRIETARIO' || currentUser.role === 'GERENTE' || currentUser.role === 'SUPER_ADMIN';
    if (isManager) {
      return communications.filter(c => c.tenantId === activeTenantId);
    }
    // Para clientes e visitantes, utiliza a projeção pública de novidades (zero logs e zero números de WhatsApp)
    return publicCommunications
      .filter(c => c.tenantId === activeTenantId)
      .map(c => ({
        id: c.id,
        tenantId: c.tenantId,
        title: c.title,
        content: c.content,
        type: c.type,
        channel: c.channel,
        sentAt: c.sentAt,
        logs: []
      } as CommunicationMessage));
  }, [currentUser, communications, publicCommunications, activeTenantId]);
  const tenantStock = stock.filter(s => s.tenantId === activeTenantId);
  const tenantReturnMessages = returnMessages.filter(r => r.tenantId === activeTenantId);
  
  const tenantGalleryWorks = useMemo(() => {
    const isManager = currentUser.role === 'PROPRIETARIO' || currentUser.role === 'GERENTE' || currentUser.role === 'SUPER_ADMIN';
    if (isManager) {
      return galleryWorks.filter(g => g.tenantId === activeTenantId);
    }
    return publicGalleryWorks
      .filter(g => g.tenantId === activeTenantId)
      .map(g => ({
        id: g.id,
        tenantId: g.tenantId,
        title: g.title,
        category: g.category,
        imageUrl: g.imageUrl,
        professionalId: g.professionalId,
        professionalName: g.professionalName,
        serviceId: g.serviceId,
        serviceName: g.serviceName,
        servicePrice: g.servicePrice,
        likesCount: g.likesCount,
        description: g.description,
        createdAt: g.createdAt
      } as GalleryWork));
  }, [currentUser, galleryWorks, publicGalleryWorks, activeTenantId]);

  // Subscription status for the active tenant
  const currentSubscription = useMemo(() => {
    return subscriptions.find(s => s.barbershopId === activeTenantId);
  }, [subscriptions, activeTenantId]);

  const isPastDue = currentSubscription?.status === 'PAST_DUE';
  const isSuspended = currentSubscription?.status === 'SUSPENDED';

  const toleranceDaysRemaining = useMemo(() => {
    if (!currentSubscription || currentSubscription.status !== 'PAST_DUE' || !currentSubscription.pastDueSince) {
      return 7;
    }
    const pastDueDate = new Date(currentSubscription.pastDueSince).getTime();
    const elapsedDays = Math.floor((Date.now() - pastDueDate) / (1000 * 60 * 60 * 24));
    return Math.max(0, (currentSubscription.toleranceDays || 7) - elapsedDays);
  }, [currentSubscription]);

  // Custom Plans Management Handlers — Autoridade Única Backend + Fail-Closed (FASE 4.8B.2 / FASE 4.9D)
  const createCustomPlan = async (planData: Partial<CustomPlan>, idempotencyKey?: string) => {
    try {
      const token = await getIdTokenFromCurrentUser();
      if (!token) {
        return {
          success: false,
          error: 'Sessão expirada ou usuário não autenticado como Super Admin.'
        };
      }

      const effectiveKey = idempotencyKey || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `idemp_${Date.now()}_${Math.random().toString(36).slice(2)}`);

      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': effectiveKey
        },
        body: JSON.stringify(planData)
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const errData = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
        return {
          success: false,
          error: errData.error || `Erro ao criar plano (${res.status}).`
        };
      }

      if (contentType.includes('application/json')) {
        const result = await res.json();
        if (result.success && result.plan) {
          setCustomPlans(prev => {
            const filtered = prev.filter(p => p.id !== result.plan.id);
            return [result.plan, ...filtered];
          });
          return result;
        }
        return {
          success: false,
          error: result.error || 'Resposta inválida do servidor ao criar plano.'
        };
      }

      return {
        success: false,
        error: 'Resposta inválida do servidor ao criar plano.'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro de conexão com o servidor ao criar plano.'
      };
    }
  };

  const updateCustomPlan = async (planId: string, updates: Partial<CustomPlan>) => {
    const existing = customPlans.find(p => p.id === planId);
    if (!existing) {
      return { success: false, error: 'Plano não encontrado no sistema.' };
    }

    try {
      const token = await getIdTokenFromCurrentUser();
      if (!token) {
        return {
          success: false,
          error: 'Sessão expirada ou usuário não autenticado como Super Admin.'
        };
      }

      // Calcular ou garantir cronograma de cobrança (scheduleStages) sincronizado
      let computedStages = updates.scheduleStages;
      if (!computedStages || computedStages.length === 0) {
        const hasTrial = updates.hasTrial ?? existing.hasTrial;
        const trialDuration = updates.trialDuration ?? existing.trialDuration ?? 14;
        const trialUnit = updates.trialUnit ?? existing.trialUnit ?? 'DAYS';
        const hasPromotion = updates.hasPromotion ?? existing.hasPromotion;
        const promotionDuration = updates.promotionDuration ?? existing.promotionDuration ?? 3;
        const promotionUnit = updates.promotionUnit ?? existing.promotionUnit ?? 'MONTHS';
        const promotionalPrice = updates.promotionalPrice ?? existing.promotionalPrice ?? existing.priceMonthly;
        const priceAfterPromotion = updates.priceAfterPromotion ?? existing.priceAfterPromotion ?? (updates.priceMonthly ?? existing.priceMonthly);
        const regularPrice = updates.priceMonthly ?? existing.priceMonthly;

        const stages: PlanBillingScheduleStage[] = [];
        let order = 1;
        if (hasTrial && trialDuration > 0) {
          stages.push({
            id: `stage-trial-${order}`,
            order: order++,
            name: 'Período Gratuito',
            duration: trialDuration,
            unit: trialUnit,
            price: 0
          });
        }
        if (hasPromotion && promotionDuration > 0 && promotionalPrice !== undefined) {
          stages.push({
            id: `stage-promo-${order}`,
            order: order++,
            name: 'Promoção de Lançamento',
            duration: promotionDuration,
            unit: promotionUnit === 'CYCLES' ? 'MONTHS' : promotionUnit,
            price: Number(promotionalPrice)
          });
        }
        stages.push({
          id: `stage-regular-${order}`,
          order: order++,
          name: 'Preço Normal Recorrente',
          duration: 0,
          unit: 'INDEFINITE',
          price: Number(hasPromotion ? priceAfterPromotion : regularPrice)
        });
        computedStages = stages;
      }

      const payloadWithStages = {
        ...updates,
        scheduleStages: computedStages
      };

      const res = await fetch(`/api/plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payloadWithStages)
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const errData = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
        return {
          success: false,
          error: errData.error || `Erro ao atualizar plano (${res.status}).`
        };
      }

      if (contentType.includes('application/json')) {
        const result = await res.json();
        if (result.success && result.plan) {
          setCustomPlans(prev => prev.map(p => p.id === planId ? result.plan : p));
          return result;
        }
        return {
          success: false,
          error: result.error || 'Resposta inválida do servidor ao atualizar plano.'
        };
      }

      return {
        success: false,
        error: 'Resposta inválida do servidor ao atualizar plano.'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro de conexão com o servidor ao atualizar plano.'
      };
    }
  };

  const togglePlanStatus = async (planId: string, targetStatus: 'ACTIVE' | 'INACTIVE') => {
    try {
      const token = await getIdTokenFromCurrentUser();
      if (!token) {
        return {
          success: false,
          error: 'Sessão expirada ou usuário não autenticado como Super Admin.'
        };
      }

      const res = await fetch(`/api/plans/${planId}/toggle-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetStatus })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const errData = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
        return {
          success: false,
          error: errData.error || `Erro ao alternar status do plano (${res.status}).`
        };
      }

      if (contentType.includes('application/json')) {
        const result = await res.json();
        if (result.success && result.plan) {
          setCustomPlans(prev => prev.map(p => p.id === planId ? result.plan : p));
          return result;
        }
        return {
          success: false,
          error: result.error || 'Resposta inválida do servidor ao alternar status do plano.'
        };
      }

      return {
        success: false,
        error: 'Resposta inválida do servidor ao alternar status do plano.'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro de conexão com o servidor ao alternar status do plano.'
      };
    }
  };

  const duplicateCustomPlan = async (planId: string, idempotencyKey?: string) => {
    const existing = customPlans.find(p => p.id === planId);
    if (!existing) return { success: false, error: 'Plano não encontrado no sistema.' };

    try {
      const token = await getIdTokenFromCurrentUser();
      if (!token) {
        return {
          success: false,
          error: 'Sessão expirada ou usuário não autenticado como Super Admin.'
        };
      }

      const effectiveKey = idempotencyKey || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `idemp_${Date.now()}_${Math.random().toString(36).slice(2)}`);

      const res = await fetch(`/api/plans/${planId}/duplicate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': effectiveKey
        }
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const errData = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
        return {
          success: false,
          error: errData.error || `Erro ao duplicar plano (${res.status}).`
        };
      }

      if (contentType.includes('application/json')) {
        const result = await res.json();
        if (result.success && result.plan) {
          setCustomPlans(prev => [result.plan, ...prev]);
          return result;
        }
        return {
          success: false,
          error: result.error || 'Resposta inválida do servidor ao duplicar plano.'
        };
      }

      return {
        success: false,
        error: 'Resposta inválida do servidor ao duplicar plano.'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro de conexão com o servidor ao duplicar plano.'
      };
    }
  };

  const createSubscription = async (data: {
    barbershopId: string;
    barbershopName?: string;
    payerEmail: string;
    payerName?: string;
    payerPhone?: string;
    planId?: string;
  }) => {
    try {
      // FASE 4 — Obtém token soberano do Firebase Auth
      const token = await getIdTokenFromCurrentUser();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (result.success && result.subscription) {
        setSubscriptions(prev => {
          const filtered = prev.filter(s => s.barbershopId !== data.barbershopId);
          return [result.subscription, ...filtered];
        });
        // FASE 9: A coleção subscriptions é controlada soberanamente pelo backend (Admin SDK).
        // Nenhuma escrita direta client-side via syncDoc é realizada.
      }
      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao conectar ao servidor de assinaturas' };
    }
  };

  const createLifetimeCheckout = async (data: {
    barbershopId: string;
    barbershopName?: string;
    payerEmail: string;
    payerName?: string;
  }) => {
    try {
      const token = await getIdTokenFromCurrentUser();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/subscriptions/checkout-lifetime', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao conectar ao servidor de checkout' };
    }
  };

  const activateLifetimeLicense = async (data: {
    barbershopId: string;
    paymentId: string;
    paymentMethod?: string;
  }) => {
    try {
      const token = await getIdTokenFromCurrentUser();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/subscriptions/activate-lifetime', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (result.success && result.subscription) {
        setSubscriptions(prev => {
          const filtered = prev.filter(s => s.barbershopId !== data.barbershopId);
          return [result.subscription, ...filtered];
        });
      }
      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao ativar licença definitiva' };
    }
  };

  const cancelSubscription = async (barbershopId: string, reason?: string) => {
    try {
      const token = await getIdTokenFromCurrentUser();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers,
        body: JSON.stringify({ barbershopId, reason })
      });
      const result = await res.json();
      if (result.success && result.subscription) {
        setSubscriptions(prev => prev.map(s => s.barbershopId === barbershopId ? result.subscription : s));
      }
      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao cancelar assinatura' };
    }
  };

  const syncSubscription = async (barbershopId: string) => {
    try {
      const res = await fetch(`/api/subscriptions/sync/${barbershopId}`, { method: 'POST' });
      const result = await res.json();
      if (result.success && result.subscription) {
        setSubscriptions(prev => prev.map(s => s.barbershopId === barbershopId ? result.subscription : s));
        syncDoc('subscriptions', result.subscription.id, result.subscription);
      }
      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao sincronizar com Mercado Pago' };
    }
  };

  const simulateSubscriptionAction = async (
    barbershopId: string,
    action: 'CONFIRM_PAYMENT' | 'TRIGGER_PAST_DUE' | 'TRIGGER_SUSPEND' | 'REGULARIZE' | 'CANCEL' | 'STEP_BILLING_COUNT' | 'VALIDATE_CARD_AND_START_TRIAL'
  ) => {
    try {
      const res = await fetch('/api/subscriptions/simulate-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barbershopId, action })
      });
      const result = await res.json();
      if (result.success && result.subscription) {
        setSubscriptions(prev => {
          const exists = prev.some(s => s.barbershopId === barbershopId);
          if (exists) {
            return prev.map(s => s.barbershopId === barbershopId ? result.subscription : s);
          }
          return [result.subscription, ...prev];
        });
        syncDoc('subscriptions', result.subscription.id, result.subscription);

        // Fetch refreshed payments
        try {
          const payRes = await fetch(`/api/subscriptions/status/${barbershopId}`);
          const payData = await payRes.json();
          if (payData.payments) {
            setSubscriptionPayments(payData.payments);
            payData.payments.forEach((p: any) => syncDoc('subscription_payments', p.id, p));
          }
        } catch {
          // ignore
        }
      }
      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao executar simulação' };
    }
  };

  // Real-time Firestore synchronization for global catalogs (SaaS Plans) - Sem seeding client-side no boot (FASE 2.2B / FASE 4.8B)
  useEffect(() => {
    // Safety timeout: never let loading hang longer than 600ms
    const safetyTimeout = setTimeout(() => {
      setIsInitialLoading(false);
    }, 600);

    // Global legitimate listener: SaaS plans catalog for MY BARBER platform
    const unsubPlans = subscribeCollection<CustomPlan>('plans', setCustomPlans, INITIAL_CUSTOM_PLANS);

    return () => {
      clearTimeout(safetyTimeout);
      unsubPlans();
    };
  }, []);

  // -------------------------------------------------------------------------
  // ISOLAMENTO MULTI-TENANT, PROJEÇÕES PÚBLICAS & AUTORIZAÇÃO NAS COLEÇÕES
  // -------------------------------------------------------------------------
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const effectiveUser = isImpersonating && currentUserId
      ? users.find(u => u.id === currentUserId) || authenticatedUser
      : authenticatedUser;
    const role = effectiveUser?.role;
    const tenantId = activeTenantId || effectiveUser?.tenantId;
    const userId = effectiveUser?.id;

    const isSuperAdminUser = !isImpersonating && (
      authClaims?.isSuperAdmin === true ||
      authClaims?.role === 'super_admin' ||
      effectiveUser?.role === 'SUPER_ADMIN'
    );

    // -----------------------------------------------------------------------
    // A) SUPER_ADMIN: Acesso administrativo sob demanda (Zero 24 listeners permanentes)
    // -----------------------------------------------------------------------
    if (isSuperAdminUser) {
      // 1. Escuta apenas catálogo de barbearias/tenants e assinaturas para governança do SaaS
      unsubs.push(subscribeCollection<Barbershop>('barbershops', setBarbershops, INITIAL_BARBERSHOPS));
      setSubscriptionsLoading(true);
      unsubs.push(
        subscribeCollection<Subscription>('subscriptions',
          (items) => {
            setSubscriptions(items);
            setSubscriptionsError(null);
            setSubscriptionsLoading(false);
          },
          INITIAL_SUBSCRIPTIONS,
          () => setSubscriptionsLoading(false),
          (err) => {
            if (err) {
              setSubscriptionsError(err.message || 'Falha ao consultar a coleção subscriptions no Firestore');
            } else {
              setSubscriptionsError(null);
            }
            setSubscriptionsLoading(false);
          }
        )
      );

      // 2. Se houver barbearia selecionada em activeTenantId, carrega dados específicos desse tenant sob demanda/janela operacional
      if (activeTenantId) {
        const now = new Date();
        const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const future60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        unsubs.push(subscribeTenantCollection<Service>('services', activeTenantId, setServices, INITIAL_SERVICES.filter(s => s.tenantId === activeTenantId)));
        unsubs.push(subscribeTenantCollection<ProfessionalScheduleConfig>('schedules', activeTenantId, setSchedules, INITIAL_SCHEDULES.filter(s => s.tenantId === activeTenantId)));
        unsubs.push(subscribeQuery<Appointment>(
          'appointments',
          [
            where('tenantId', '==', activeTenantId),
            where('date', '>=', past30),
            where('date', '<=', future60)
          ],
          setAppointments,
          INITIAL_APPOINTMENTS.filter(a => a.tenantId === activeTenantId && a.date >= past30 && a.date <= future60)
        ));
      }

      return () => {
        unsubs.forEach(u => u());
      };
    }

    // -----------------------------------------------------------------------
    // B) USUÁRIOS COMUNS, GESTORES, PROFISSIONAIS & VISITANTES PÚBLICOS
    // Projeções públicas e catálogos SEMPRE restritos estritamente ao activeTenantId
    // -----------------------------------------------------------------------
    if (activeTenantId) {
      // 1. Barbershop pública do tenant ativo (nunca lê a coleção privada global /barbershops)
      unsubs.push(
        subscribeDoc<PublicBarbershop>(
          'publicBarbershops',
          activeTenantId,
          (shop) => {
            if (shop) {
              setPublicBarbershops(prev => [...prev.filter(b => b.id !== activeTenantId), shop]);
              setBarbershops(prev => {
                const existing = prev.find(b => b.id === activeTenantId);
                const merged: Barbershop = existing
                  ? { ...existing, ...shop }
                  : {
                      id: shop.id,
                      name: shop.name,
                      slug: shop.slug,
                      customDomain: shop.customDomain,
                      logoUrl: shop.logoUrl,
                      bannerUrl: shop.bannerUrl,
                      salonImages: shop.salonImages || [],
                      about: shop.about,
                      phone: shop.phone,
                      whatsapp: shop.whatsapp,
                      address: shop.address,
                      coordinates: shop.coordinates,
                      socialMedia: shop.socialMedia,
                      businessHours: shop.businessHours,
                      primaryColor: shop.primaryColor,
                      theme: shop.theme,
                      status: shop.status,
                      planId: 'custom-plan-free',
                      commercialMode: 'TESTE_GRATIS',
                      reminderConfig: {
                        enabled: false,
                        advanceMinutes: 120,
                        whatsappTemplate: ''
                      },
                      createdAt: new Date().toISOString()
                    };
                return [...prev.filter(b => b.id !== activeTenantId), merged];
              });
            }
          },
          INITIAL_BARBERSHOPS.map(toPublicBarbershop).find(b => b.id === activeTenantId)
        )
      );

      // 2. Serviços Públicos do tenant ativo
      unsubs.push(
        subscribeQuery<PublicService>(
          'publicServices',
          [where('tenantId', '==', activeTenantId)],
          setPublicServices,
          INITIAL_SERVICES.filter(s => s.tenantId === activeTenantId).map(toPublicService)
        )
      );

      // 3. Slots de Disponibilidade Pública do tenant ativo (com janela temporal operacional: hoje até +60 dias)
      const todayStr = new Date().toISOString().split('T')[0];
      const futureLimitStr = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      unsubs.push(
        subscribeQuery<PublicAvailabilitySlot>(
          'publicAvailability',
          [
            where('tenantId', '==', activeTenantId),
            where('date', '>=', todayStr),
            where('date', '<=', futureLimitStr)
          ],
          setPublicAvailability,
          INITIAL_APPOINTMENTS.filter(a => a.tenantId === activeTenantId && a.status === 'AGENDADO' && a.date >= todayStr && a.date <= futureLimitStr).map(toPublicAvailabilitySlot)
        )
      );

      // 4. Perfis Públicos dos Profissionais do tenant ativo
      unsubs.push(
        subscribeQuery<PublicProfessionalProfile>(
          'publicProfessionalProfiles',
          [where('tenantId', '==', activeTenantId)],
          setPublicProfessionals,
          INITIAL_USERS.filter(u => u.tenantId === activeTenantId && u.role === 'PROFISSIONAL').map(toPublicProfessionalProfile)
        )
      );

      // 5. Horários Públicos de Atendimento do tenant ativo
      unsubs.push(
        subscribeQuery<PublicProfessionalScheduleConfig>(
          'publicSchedules',
          [where('tenantId', '==', activeTenantId)],
          setPublicSchedules,
          INITIAL_SCHEDULES.filter(s => s.tenantId === activeTenantId || INITIAL_USERS.find(u => u.id === s.professionalId)?.tenantId === activeTenantId).map(s => toPublicSchedule(s, activeTenantId))
        )
      );

      // 6. Comunicados Públicos do tenant ativo
      unsubs.push(
        subscribeQuery<PublicCommunication>(
          'publicCommunications',
          [where('tenantId', '==', activeTenantId)],
          setPublicCommunications,
          INITIAL_COMMUNICATIONS.filter(c => c.tenantId === activeTenantId).map(toPublicCommunication)
        )
      );

      // 7. Sorteios Públicos do tenant ativo
      unsubs.push(
        subscribeQuery<PublicRaffle>(
          'publicRaffles',
          [where('tenantId', '==', activeTenantId)],
          setPublicRaffles,
          INITIAL_RAFFLES.filter(r => r.tenantId === activeTenantId).map(toPublicRaffle)
        )
      );

      // 8. Projeção Pública de Pacotes do tenant ativo (Path-based subcollection com isolamento soberano)
      unsubs.push(
        subscribeSubcollection<PublicPackage>(
          'publicPackages',
          activeTenantId,
          'items',
          setPublicPackages,
          INITIAL_PACKAGES.filter(p => p.tenantId === activeTenantId).map(toPublicPackage)
        )
      );

      // 9. Projeção Pública de Promoções do tenant ativo (Path-based subcollection com isolamento soberano)
      unsubs.push(
        subscribeSubcollection<PublicPromotion>(
          'publicPromotions',
          activeTenantId,
          'items',
          setPublicPromotions,
          INITIAL_PROMOTIONS.filter(p => p.tenantId === activeTenantId).map(toPublicPromotion)
        )
      );

      // 10. Projeção Pública de Galeria do tenant ativo (Path-based subcollection com isolamento soberano)
      unsubs.push(
        subscribeSubcollection<PublicGalleryWork>(
          'publicGallery',
          activeTenantId,
          'items',
          setPublicGalleryWorks,
          INITIAL_GALLERY_WORKS.filter(g => g.tenantId === activeTenantId).map(toPublicGalleryWork)
        )
      );
    }

    // -----------------------------------------------------------------------
    // C) COLEÇÕES PRIVADAS POR PAPEL AUTENTICADO
    // -----------------------------------------------------------------------
    // 1. Visitante / Anônimo: nenhum listener privado adicional
    if (!effectiveUser || !role) {
      return () => {
        unsubs.forEach(u => u());
      };
    }

    // 2. Cliente Comum (CLIENTE):
    // Zero listeners globais. Escuta estritamente seus próprios registros privados.
    if (role === 'CLIENTE' && userId) {
      unsubs.push(
        subscribeQuery<Appointment>(
          'appointments',
          [where('clientId', '==', userId)],
          setAppointments,
          INITIAL_APPOINTMENTS.filter(a => a.clientId === userId)
        )
      );
      unsubs.push(
        subscribeQuery<CustomerPackage>(
          'customerPackages',
          [where('clientId', '==', userId)],
          setCustomerPackages,
          INITIAL_CUSTOMER_PACKAGES.filter(cp => cp.clientId === userId)
        )
      );
      unsubs.push(
        subscribeQuery<WaitlistEntry>(
          'waitlist',
          [where('clientId', '==', userId)],
          setWaitlist,
          INITIAL_WAITLIST.filter(w => w.clientId === userId)
        )
      );
      unsubs.push(
        subscribeQuery<User>(
          'users',
          [where('id', '==', userId)],
          (userList) => {
            if (userList.length > 0) {
              setUsers(prev => [...prev.filter(u => u.id !== userId), ...userList]);
            }
          },
          INITIAL_USERS.filter(u => u.id === userId)
        )
      );
      return () => {
        unsubs.forEach(u => u());
      };
    }

    // 3. Profissional (PROFISSIONAL):
    // Acesso restrito ao documento do próprio usuário e sua agenda no tenant (janela operacional de 30 dias passados e 60 dias futuros)
    if (role === 'PROFISSIONAL' && tenantId) {
      if (userId) {
        unsubs.push(
          subscribeQuery<User>(
            'users',
            [where('id', '==', userId)],
            (userList) => {
              if (userList.length > 0) {
                setUsers(prev => [...prev.filter(u => u.id !== userId), ...userList]);
              }
            },
            INITIAL_USERS.filter(u => u.id === userId)
          )
        );
      }
      unsubs.push(
        subscribeTenantCollection<ProfessionalScheduleConfig>(
          'schedules',
          tenantId,
          setSchedules,
          INITIAL_SCHEDULES.filter(s => s.tenantId === tenantId || INITIAL_USERS.find(u => u.id === s.professionalId)?.tenantId === tenantId)
        )
      );
      unsubs.push(
        subscribeTenantCollection<Service>('services', tenantId, setServices, INITIAL_SERVICES.filter(s => s.tenantId === tenantId))
      );

      const now = new Date();
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const future60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      if (effectiveUser.canViewAllProfessionals) {
        unsubs.push(
          subscribeQuery<Appointment>(
            'appointments',
            [
              where('tenantId', '==', tenantId),
              where('date', '>=', past30),
              where('date', '<=', future60)
            ],
            setAppointments,
            INITIAL_APPOINTMENTS.filter(a => a.tenantId === tenantId && a.date >= past30 && a.date <= future60)
          )
        );
      } else if (userId) {
        unsubs.push(
          subscribeQuery<Appointment>(
            'appointments',
            [
              where('tenantId', '==', tenantId),
              where('professionalId', '==', userId),
              where('date', '>=', past30),
              where('date', '<=', future60)
            ],
            setAppointments,
            INITIAL_APPOINTMENTS.filter(a => a.tenantId === tenantId && a.professionalId === userId && a.date >= past30 && a.date <= future60)
          )
        );
      }
      unsubs.push(
        subscribeTenantCollection<StockItem>('stock', tenantId, setStock, INITIAL_STOCK.filter(s => s.tenantId === tenantId))
      );
      unsubs.push(
        subscribeTenantCollection<CustomerPackage>('customerPackages', tenantId, setCustomerPackages, INITIAL_CUSTOMER_PACKAGES.filter(cp => cp.tenantId === tenantId))
      );
      unsubs.push(
        subscribeTenantCollection<WaitlistEntry>('waitlist', tenantId, setWaitlist, INITIAL_WAITLIST.filter(w => w.tenantId === tenantId))
      );
      return () => {
        unsubs.forEach(u => u());
      };
    }

    // 4. Gestores (GERENTE e PROPRIETARIO):
    // Acesso restrito estritamente aos documentos do seu próprio tenant
    if ((role === 'GERENTE' || role === 'PROPRIETARIO') && tenantId) {
      // Documento da própria barbearia (configurações privadas)
      unsubs.push(
        subscribeDoc<Barbershop>(
          'barbershops',
          tenantId,
          (shop) => {
            if (shop) {
              setBarbershops(prev => [...prev.filter(b => b.id !== tenantId), shop]);
            }
          },
          INITIAL_BARBERSHOPS.find(b => b.id === tenantId)
        )
      );
      unsubs.push(
        subscribeTenantCollection<User>('users', tenantId, setUsers, INITIAL_USERS.filter(u => u.tenantId === tenantId))
      );
      unsubs.push(
        subscribeTenantCollection<Service>('services', tenantId, setServices, INITIAL_SERVICES.filter(s => s.tenantId === tenantId))
      );
      unsubs.push(
        subscribeTenantCollection<ProfessionalScheduleConfig>(
          'schedules',
          tenantId,
          setSchedules,
          INITIAL_SCHEDULES.filter(s => s.tenantId === tenantId || INITIAL_USERS.find(u => u.id === s.professionalId)?.tenantId === tenantId)
        )
      );

      const now = new Date();
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const future60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      unsubs.push(
        subscribeQuery<Appointment>(
          'appointments',
          [
            where('tenantId', '==', tenantId),
            where('date', '>=', past30),
            where('date', '<=', future60)
          ],
          setAppointments,
          INITIAL_APPOINTMENTS.filter(a => a.tenantId === tenantId && a.date >= past30 && a.date <= future60)
        )
      );
      unsubs.push(
        subscribeTenantCollection<WaitlistEntry>('waitlist', tenantId, setWaitlist, INITIAL_WAITLIST.filter(w => w.tenantId === tenantId))
      );
      unsubs.push(
        subscribeQuery<ServicePackage>(
          'packages',
          [where('tenantId', '==', activeTenantId)],
          setPackages,
          INITIAL_PACKAGES.filter(p => p.tenantId === activeTenantId)
        )
      );
      unsubs.push(
        subscribeQuery<Promotion>(
          'promotions',
          [where('tenantId', '==', activeTenantId)],
          setPromotions,
          INITIAL_PROMOTIONS.filter(p => p.tenantId === activeTenantId)
        )
      );
      unsubs.push(
        subscribeQuery<GalleryWork>(
          'gallery',
          [where('tenantId', '==', activeTenantId)],
          setGalleryWorks,
          INITIAL_GALLERY_WORKS.filter(g => g.tenantId === activeTenantId)
        )
      );
      unsubs.push(
        subscribeTenantCollection<CustomerPackage>('customerPackages', tenantId, setCustomerPackages, INITIAL_CUSTOMER_PACKAGES.filter(cp => cp.tenantId === tenantId))
      );
      unsubs.push(
        subscribeTenantCollection<Raffle>('raffles', tenantId, setRaffles, INITIAL_RAFFLES.filter(r => r.tenantId === tenantId))
      );
      unsubs.push(
        subscribeTenantCollection<CommunicationMessage>('communications', tenantId, setCommunications, INITIAL_COMMUNICATIONS.filter(c => c.tenantId === tenantId))
      );
      unsubs.push(
        subscribeTenantCollection<StockItem>('stock', tenantId, setStock, INITIAL_STOCK.filter(s => s.tenantId === tenantId))
      );
      unsubs.push(
        subscribeTenantCollection<ReturnMessage>('returnMessages', tenantId, setReturnMessages, INITIAL_RETURN_MESSAGES.filter(m => m.tenantId === tenantId))
      );
      unsubs.push(
        subscribeQuery<Subscription>(
          'subscriptions',
          [where('barbershopId', '==', tenantId)],
          setSubscriptions,
          INITIAL_SUBSCRIPTIONS.filter(s => s.barbershopId === tenantId)
        )
      );
      unsubs.push(
        subscribeQuery<SubscriptionPaymentRecord>(
          'subscription_payments',
          [where('barbershopId', '==', tenantId)],
          setSubscriptionPayments,
          INITIAL_SUBSCRIPTION_PAYMENTS.filter(sp => sp.barbershopId === tenantId)
        )
      );
      return () => {
        unsubs.forEach(u => u());
      };
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [authenticatedUser, activeTenantId, isImpersonating, currentUserId, authClaims]);

  // When changing tenant, reset current user if outside tenant (unless user is SUPER_ADMIN or CLIENTE)
  useEffect(() => {
    const activeUser = users.find(u => u.id === currentUserId);
    if (activeUser?.role === 'SUPER_ADMIN' || activeUser?.role === 'CLIENTE') {
      return; // Super Admin has global oversight; Clients have unified multi-barbershop accounts
    }

    const userInTenant = users.find(u => u.tenantId === activeTenantId && u.id === currentUserId);
    if (!userInTenant) {
      const firstUserInTenant = users.find(u => u.tenantId === activeTenantId);
      if (firstUserInTenant) {
        setCurrentUserId(firstUserInTenant.id);
      }
    }
  }, [activeTenantId, users, currentUserId]);

  // Detect exclusive barbershop subdomain/URL and load directly into client view
  useEffect(() => {
    if (barbershops.length > 0) {
      const urlTenant = getInitialTenantFromUrl(barbershops);
      if (urlTenant) {
        if (activeTenantId !== urlTenant) {
          setActiveTenantId(urlTenant);
        }
        if (!authenticatedUser || authenticatedUser.role === 'CLIENTE') {
          setViewMode('CLIENT_APP');
        }
      }
    }
  }, [barbershops, authenticatedUser]);

  // Sincronização oficial em tempo real com Firebase Authentication (onAuthStateChanged)
  // Firebase Auth é a ÚNICA fonte de verdade soberana para identidade autenticada
  useEffect(() => {
    const unsubscribeAuth = subscribeToAuthChanges(async (firebaseAuthUser) => {
      if (firebaseAuthUser) {
        const uid = firebaseAuthUser.uid;
        const email = (firebaseAuthUser.email || '').toLowerCase().trim();

        // 1. Obtenção segura e soberana dos Custom Claims do ID Token do Firebase Auth
        const claims = await getAuthClaims(firebaseAuthUser);
        setAuthClaims(claims);

        // 2. Procura se existe perfil correspondente no estado ou seed (verificação canônica por UID ou email verificado)
        const isEmailVerified = (firebaseAuthUser as any).emailVerified === true;
        let matched = users.find(u => 
          u.uid === uid || 
          u.id === uid || 
          (isEmailVerified && email && u.email?.toLowerCase() === email && (!u.googleId || u.googleId === uid))
        );

        // FASE 2.4C: Bloqueio estrito de sessão para usuário com status 'inactive' no banco ou nas claims
        if (matched && matched.status === 'inactive') {
          console.warn(`[Auth Security] Sessão bloqueada: usuário ${uid} com status 'inactive'.`);
          setAuthenticatedUser(null);
          setCurrentUserId(null);
          logoutFromFirebaseAuth();
          return;
        }

        if (claims?.status === 'inactive') {
          console.warn(`[Auth Security] Sessão bloqueada: claims indicam status 'inactive' para ${uid}.`);
          setAuthenticatedUser(null);
          setCurrentUserId(null);
          logoutFromFirebaseAuth();
          return;
        }

        // Se o usuário possui Custom Claim de super_admin, localiza perfil administrativo
        if (!matched && (claims?.isSuperAdmin || claims?.role === 'super_admin')) {
          matched = users.find(u => u.role === 'SUPER_ADMIN') || INITIAL_USERS[0];
        }

        // A autoridade de role provém dos Custom Claims (com fallback seguro de compatibilidade)
        const effectiveRole: UserRole = (claims?.isSuperAdmin || claims?.role === 'super_admin')
          ? 'SUPER_ADMIN'
          : claims?.role
          ? toLegacyRole(claims.role)
          : (matched?.role || 'CLIENTE');

        const effectiveTenantId = claims?.tenantId || matched?.tenantId || (effectiveRole === 'CLIENTE' ? activeTenantId : undefined);

        if (matched) {
          const profileWithUid: User = {
            ...matched,
            uid,
            id: matched.id || uid,
            role: effectiveRole,
            tenantId: effectiveTenantId
          };
          setAuthenticatedUser(profileWithUid);
          setCurrentUserId(profileWithUid.id);
          // Atualiza perfil no Firestore preservando ID canônico sem duplicar documentos
          syncDoc('users', matched.id, profileWithUid);
        } else {
          // Provisiona perfil de cliente seguro para novo usuário autenticado
          const newProfile: User = {
            id: uid,
            uid,
            tenantId: effectiveTenantId || activeTenantId,
            role: effectiveRole,
            name: firebaseAuthUser.displayName || (email ? email.split('@')[0] : 'Cliente'),
            email: email || undefined,
            whatsapp: firebaseAuthUser.phoneNumber || '',
            phone: firebaseAuthUser.phoneNumber || '',
            avatarUrl: firebaseAuthUser.photoURL || undefined,
            status: 'active',
            authProvider: 'FIREBASE_AUTH',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          setUsers(prev => {
            if (prev.some(u => u.id === uid || u.uid === uid)) return prev;
            return [...prev, newProfile];
          });
          setAuthenticatedUser(newProfile);
          setCurrentUserId(newProfile.id);
          syncDoc('users', uid, newProfile);
        }
      } else {
        // Se deslogado no Firebase Auth e a sessão estava associada a ele, limpa
        setAuthClaims(null);
        setAuthenticatedUser(prev => {
          if (prev?.uid || prev?.authProvider === 'GOOGLE' || prev?.authProvider === 'FIREBASE_AUTH') {
            setCurrentUserId('user-guest-client');
            return null;
          }
          return prev;
        });
      }
    });

    return () => unsubscribeAuth();
  }, [users, activeTenantId]);

  // Audit logging helper (FASE 4.4D: Mantém estado local de UI; escritas oficiais no Firestore são exclusivas do Backend Admin SDK)
  const addAuditLog = (log: Omit<AuditLog, 'id' | 'timestamp'>) => {
    const newLog: AuditLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    // syncDoc('audit_logs', ...) removido: Firestore Rules bloqueiam escrita client-side.
    // Todas as trilhas oficiais de auditoria são geradas com autoridade via Backend / recordAuditLog.
    setAuditLogs(prev => [newLog, ...prev]);
  };

  // Direct role routing when authenticating or switching profile
  const setCurrentUserIdWithRoute = (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    setCurrentUserId(userId);
    if (!targetUser) return;

    if (targetUser.role === 'SUPER_ADMIN') {
      setViewMode('MASTER_ADMIN');
    } else if (targetUser.role === 'PROPRIETARIO' || targetUser.role === 'GERENTE') {
      if (targetUser.tenantId && targetUser.tenantId !== activeTenantId && targetUser.tenantId !== 'platform-global' && targetUser.tenantId !== 'system-global') {
        setActiveTenantId(targetUser.tenantId);
      }
      setViewMode('WEBADMIN');
    } else if (targetUser.role === 'PROFISSIONAL') {
      if (targetUser.tenantId && targetUser.tenantId !== activeTenantId && targetUser.tenantId !== 'platform-global' && targetUser.tenantId !== 'system-global') {
        setActiveTenantId(targetUser.tenantId);
      }
      setViewMode('PROFISSIONAL_APP');
    } else if (targetUser.role === 'CLIENTE') {
      if (targetUser.tenantId && targetUser.tenantId !== activeTenantId && targetUser.tenantId !== 'platform-global' && targetUser.tenantId !== 'system-global') {
        setActiveTenantId(targetUser.tenantId);
      }
      setViewMode('CLIENT_APP');
    }
  };

  // Unified login identifying role automatically
  const loginWithCredentials = (identifier: string, _password?: string) => {
    const clean = identifier.trim().toLowerCase();
    const cleanDigits = identifier.replace(/\D/g, '');

    // Identificação de candidato a acesso Master via usuários cadastrados (sem email hardcoded)
    const masterCandidate = users.find(u => (u.email?.toLowerCase() === clean || u.id === clean || (u.username && u.username.toLowerCase() === clean)) && u.role === 'SUPER_ADMIN');
    if (masterCandidate) {
      if (!_password || !_password.trim()) {
        return {
          success: false,
          error: 'Senha obrigatória para acesso Master.'
        };
      }
      if (masterCandidate.password && masterCandidate.password !== _password) {
        return {
          success: false,
          error: 'Senha incorreta para acesso Master.'
        };
      }
      const superAdmin = masterCandidate;
      setAuthenticatedUser(superAdmin);
      setCurrentUserId(superAdmin.id);

      // Migração e vinculação segura e não-destrutiva ao Firebase Authentication
      if (superAdmin.email && _password) {
        tryMigrateUserToFirebaseAuth(superAdmin.email, _password, superAdmin.name)
          .then(async (authUser) => {
            if (authUser) {
              const claims = await getAuthClaims(authUser);
              setAuthClaims(claims);
              setAuthenticatedUser(prev => prev ? { ...prev, uid: authUser.uid } : prev);
              syncDoc('users', superAdmin.id, { ...superAdmin, uid: authUser.uid });
            }
          })
          .catch(() => {});
      }

      setViewMode('MASTER_ADMIN');
      addAuditLog({
        actorUserId: superAdmin.id,
        actorUserName: superAdmin.name,
        actorRole: 'SUPER_ADMIN',
        action: 'LOGIN_SUCESSO',
        targetTenantId: 'platform-global',
        targetTenantName: 'Plataforma My Barber',
        details: 'Login Master autenticado com sucesso com credenciais seguras.',
        status: 'SUCESSO'
      });
      return { success: true, role: 'SUPER_ADMIN' as UserRole, user: superAdmin };
    }

    // Centralized strict authentication validation
    const authResult = authenticateUserCredentials({
      identifier,
      password: _password,
      users
    });

    let matched = authResult.user;

    if (!matched) {
      return {
        success: false,
        error: authResult.error || 'Nenhuma conta encontrada com este e-mail, WhatsApp ou usuário.'
      };
    }

    // Se o resultado de autenticação apontou erro de senha ou status inativo, bloquear
    if (!authResult.success && authResult.error) {
      return {
        success: false,
        error: authResult.error
      };
    }

    // Inicia migração suave e segura para Firebase Auth em segundo plano quando há e-mail
    if (matched && matched.email && _password) {
      tryMigrateUserToFirebaseAuth(matched.email, _password, matched.name)
        .then(authUser => {
          if (authUser) {
            setAuthenticatedUser(prev => prev ? { ...prev, uid: authUser.uid } : prev);
            syncDoc('users', matched.id, { ...matched, uid: authUser.uid });
          }
        })
        .catch(() => {});
    }

    setAuthenticatedUser(matched);
    setCurrentUserId(matched.id);

    // Direct routing according to hierarchy
    if (matched.role === 'SUPER_ADMIN') {
      setViewMode('MASTER_ADMIN');
    } else if (matched.role === 'PROPRIETARIO' || matched.role === 'GERENTE') {
      if (matched.tenantId && matched.tenantId !== 'platform-global') {
        setActiveTenantId(matched.tenantId);
      }
      setViewMode('WEBADMIN');
    } else if (matched.role === 'PROFISSIONAL') {
      if (matched.tenantId && matched.tenantId !== 'platform-global') {
        setActiveTenantId(matched.tenantId);
      }
      setViewMode('PROFISSIONAL_APP');
    } else if (matched.role === 'CLIENTE') {
      if (matched.tenantId && matched.tenantId !== 'platform-global') {
        setActiveTenantId(matched.tenantId);
      }
      setViewMode('CLIENT_APP');
    }

    addAuditLog({
      actorUserId: matched.id,
      actorUserName: matched.name,
      actorRole: matched.role,
      action: 'LOGIN_SUCESSO',
      targetTenantId: matched.tenantId,
      targetTenantName: barbershops.find(b => b.id === matched.tenantId)?.name || 'Plataforma',
      details: `Login autenticado com sucesso. Hierarquia identificada: ${matched.role}.`,
      status: 'SUCESSO'
    });

    return { success: true, role: matched.role as UserRole, user: matched };
  };

  const logout = () => {
    logoutFromFirebaseAuth().catch(() => {});
    const prev = authenticatedUser;
    setAuthenticatedUser(null);
    setCurrentUserId('user-guest-client');
    try {
      localStorage.removeItem('mybarber_session_user_id');
      localStorage.removeItem('mybarber_session_user');
    } catch {
      // ignore
    }
    setIsImpersonating(false);
    setImpersonationOriginUserId(null);
    if (prev && prev.role !== 'CLIENTE') {
      setViewMode('STAFF_LOGIN');
    } else {
      setViewMode('CLIENT_APP');
    }

    if (prev) {
      addAuditLog({
        actorUserId: prev.id,
        actorUserName: prev.name,
        actorRole: prev.role,
        action: 'LOGOUT',
        details: `Sessão encerrada pelo usuário. Retornado com segurança à tela de login.`,
        status: 'SUCESSO'
      });
    }
  };

  const toggleBarbershopStatus = (barbershopId: string, active: boolean) => {
    const target = barbershops.find(b => b.id === barbershopId);
    if (!target) return;
    const newStatus = active ? 'ATIVA' : 'INATIVA';
    const updated = { ...target, status: newStatus as 'ATIVA' | 'INATIVA' };
    syncDoc('barbershops', barbershopId, updated);
    setBarbershops(prev => {
      const next = prev.map(b => b.id === barbershopId ? updated : b);
      try {
        localStorage.setItem('mybarber_cached_barbershops', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    addAuditLog({
      actorUserId: currentUser.id,
      actorUserName: currentUser.name,
      actorRole: currentUser.role,
      action: active ? 'ATIVACAO_BARBEARIA' : 'DESATIVACAO_BARBEARIA',
      targetTenantId: barbershopId,
      targetTenantName: target.name,
      details: `Status da barbearia alterado para ${newStatus}.`,
      status: 'SUCESSO'
    });
  };

  const updateBarbershop = (updated: Partial<Barbershop>, targetShopId?: string) => {
    const shopIdToUpdate = targetShopId || activeTenantId;
    const target = barbershops.find(b => b.id === shopIdToUpdate);
    if (target) {
      const merged = { ...target, ...updated };
      syncDoc('barbershops', target.id, merged);
      syncDoc('publicBarbershops', target.id, toPublicBarbershop(merged));
    }
    setBarbershops(prev => {
      const next = prev.map(b => (b.id === shopIdToUpdate ? { ...b, ...updated } : b));
      try {
        localStorage.setItem('mybarber_cached_barbershops', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const bookOnlineAppointment = async (params: {
    tenantId: string;
    professionalId: string;
    serviceId: string;
    date: string;
    startTime: string;
    clientName: string;
    clientWhatsApp: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string; appointment?: Appointment }> => {
    try {
      const idempotencyKey = crypto.randomUUID();

      let authHeader: string | undefined = undefined;
      try {
        const fbUser = getFirebaseCurrentUser();
        if (fbUser) {
          const idToken = await fbUser.getIdToken();
          if (idToken) {
            authHeader = `Bearer ${idToken}`;
          }
        }
      } catch (authErr) {
        console.warn('[bookOnlineAppointment] Aviso ao obter ID Token:', authErr);
      }

      const appCheckToken = await getAppCheckToken();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      if (appCheckToken) {
        headers['X-Firebase-AppCheck'] = appCheckToken;
      }

      const response = await fetch('/api/appointments/book', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId: params.tenantId,
          professionalId: params.professionalId,
          serviceId: params.serviceId,
          date: params.date,
          startTime: params.startTime,
          idempotencyKey,
          clientName: params.clientName,
          clientWhatsApp: params.clientWhatsApp,
          notes: params.notes || ''
        })
      });

      const data = await response.json();

      if (response.ok && data.success && data.appointment) {
        const confirmedApt: Appointment = data.appointment;

        // Atualização oficial autoritativa no estado do React após confirmação
        setAppointments(prev => {
          const exists = prev.some(a => a.id === confirmedApt.id);
          return exists
            ? prev.map(a => (a.id === confirmedApt.id ? confirmedApt : a))
            : [confirmedApt, ...prev];
        });

        // Atualização oficial na disponibilidade pública em memória
        setPublicAvailability(prev => {
          const exists = prev.some(a => a.id === confirmedApt.id);
          if (exists) return prev;
          return [
            ...prev,
            {
              id: confirmedApt.id,
              tenantId: confirmedApt.tenantId,
              professionalId: confirmedApt.professionalId,
              date: confirmedApt.date,
              startTime: confirmedApt.startTime,
              endTime: confirmedApt.endTime,
              status: 'AGENDADO'
            }
          ];
        });

        return {
          success: true,
          appointment: confirmedApt
        };
      }

      const errorMsg =
        data.message ||
        data.error ||
        (response.status === 409
          ? 'Esse horário acabou de ser reservado. Escolha outro horário disponível.'
          : 'Erro ao processar agendamento.');

      return {
        success: false,
        error: errorMsg
      };
    } catch (err: any) {
      console.error('[bookOnlineAppointment] Falha na requisição ao backend:', err);
      return {
        success: false,
        error: 'Erro de conexão com o servidor. Verifique sua conexão e tente novamente.'
      };
    }
  };

  const addAppointment = (newApp: Omit<Appointment, 'id' | 'createdAt' | 'reminderSent'>): { success: boolean; error?: string } => {
    // Para agendamentos administrativos de encaixe
    if (newApp.isEncaixe) {
      const srv = services.find(s => s.id === newApp.serviceId);
      const officialDuration = srv?.durationMinutes || 30;
      const startMins = timeToMinutes(newApp.startTime);
      const computedEnd = minutesToTime(startMins + officialDuration);

      const created: Appointment = {
        ...newApp,
        serviceName: srv?.name || newApp.serviceName || 'Serviço',
        servicePrice: srv?.price ?? newApp.servicePrice ?? 0,
        serviceDuration: officialDuration,
        endTime: newApp.endTime || computedEnd,
        id: `apt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString(),
        reminderSent: false
      };

      setAppointments(prev => [created, ...prev]);

      syncDoc('appointments', created.id, created);
      return { success: true };
    }

    // Para agendamentos convencionais disparados via addAppointment, encaminha para o fluxo autoritativo
    bookOnlineAppointment({
      tenantId: newApp.tenantId,
      professionalId: newApp.professionalId,
      serviceId: newApp.serviceId,
      date: newApp.date,
      startTime: newApp.startTime,
      clientName: newApp.clientName,
      clientWhatsApp: newApp.clientWhatsApp,
      notes: newApp.notes
    });

    return { success: true };
  };

  const rescheduleAppointment = async (
    appointmentId: string,
    newDate: string,
    newStartTime: string,
    _newEndTime?: string
  ): Promise<{ success: boolean; error?: string; appointment?: Appointment }> => {
    try {
      let authHeader: string | undefined = undefined;
      try {
        const fbUser = getFirebaseCurrentUser();
        if (fbUser) {
          const idToken = await fbUser.getIdToken();
          if (idToken) {
            authHeader = `Bearer ${idToken}`;
          }
        }
      } catch (authErr) {
        console.warn('[rescheduleAppointment] Aviso ao obter ID Token:', authErr);
      }

      if (!authHeader) {
        return {
          success: false,
          error: 'Autenticação necessária para remarcar agendamentos.'
        };
      }

      const appCheckToken = await getAppCheckToken();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: authHeader
      };
      if (appCheckToken) {
        headers['X-Firebase-AppCheck'] = appCheckToken;
      }

      const response = await fetch('/api/appointments/reschedule', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          appointmentId,
          newDate,
          newStartTime,
          idempotencyKey: crypto.randomUUID()
        })
      });

      const data = await response.json();

      if (response.ok && data.success && data.appointment) {
        const confirmedApt: Appointment = data.appointment;

        setAppointments(prev => {
          const exists = prev.some(a => a.id === confirmedApt.id);
          return exists
            ? prev.map(a => (a.id === confirmedApt.id ? confirmedApt : a))
            : [confirmedApt, ...prev];
        });

        setPublicAvailability(prev => [
          ...prev.filter(s => s.id !== confirmedApt.id),
          toPublicAvailabilitySlot(confirmedApt)
        ]);

        return { success: true, appointment: confirmedApt };
      }

      return {
        success: false,
        error: data.message || data.error || 'Falha ao remarcar agendamento.'
      };
    } catch (err: any) {
      console.error('[rescheduleAppointment] Erro ao comunicar com backend autoritativo:', err);
      return {
        success: false,
        error: 'Erro de comunicação ao remarcar agendamento. Tente novamente.'
      };
    }
  };

  const cancelAppointment = async (
    appointmentId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      let authHeader: string | undefined = undefined;
      try {
        const fbUser = getFirebaseCurrentUser();
        if (fbUser) {
          const idToken = await fbUser.getIdToken();
          if (idToken) {
            authHeader = `Bearer ${idToken}`;
          }
        }
      } catch (authErr) {
        console.warn('[cancelAppointment] Aviso ao obter ID Token:', authErr);
      }

      if (!authHeader) {
        return {
          success: false,
          error: 'Autenticação necessária para cancelar agendamentos.'
        };
      }

      const appCheckToken = await getAppCheckToken();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: authHeader
      };
      if (appCheckToken) {
        headers['X-Firebase-AppCheck'] = appCheckToken;
      }

      const response = await fetch('/api/appointments/cancel', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          appointmentId,
          reason,
          idempotencyKey: crypto.randomUUID()
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const cancelledApt: Appointment | undefined = data.appointment;

        setAppointments(prev =>
          prev.map(a =>
            a.id === appointmentId
              ? cancelledApt || { ...a, status: 'CANCELADO' as const }
              : a
          )
        );

        // Libera imediatamente a disponibilidade pública em memória
        setPublicAvailability(prev => prev.filter(s => s.id !== appointmentId));

        return { success: true };
      }

      return {
        success: false,
        error: data.message || data.error || 'Falha ao cancelar agendamento.'
      };
    } catch (err: any) {
      console.error('[cancelAppointment] Erro ao comunicar com backend autoritativo:', err);
      return {
        success: false,
        error: 'Erro de comunicação ao cancelar agendamento. Tente novamente.'
      };
    }
  };

  const updateAppointmentStatus = (appointmentId: string, status: AppointmentStatus) => {
    // FECHAMENTO DEFINITIVO DE BYPASS (ETAPA 2.1I):
    // Cancelamento altera disponibilidade e locks diários e DEVE passar obrigatoriamente pelo backend autoritativo
    if (status === 'CANCELADO') {
      cancelAppointment(appointmentId);
      return;
    }

    const apt = appointments.find(a => a.id === appointmentId);
    if (apt) {
      const updatedApt: Appointment = { ...apt, status };
      syncDoc('appointments', appointmentId, updatedApt);
    }
    setAppointments(prev => prev.map(a => (a.id === appointmentId ? { ...a, status } : a)));
  };

  const addToWaitlist = (entry: Omit<WaitlistEntry, 'id' | 'createdAt' | 'status'>) => {
    // Sanitização e proteção contra injeção de campos internos ou status indevido
    const sanitizedEntry: WaitlistEntry = {
      tenantId: entry.tenantId || activeTenantId,
      clientId: entry.clientId || `guest-${Date.now()}`,
      clientName: entry.clientName.trim(),
      clientWhatsApp: entry.clientWhatsApp.trim(),
      serviceId: entry.serviceId,
      serviceName: entry.serviceName || '',
      preferredProfessionalId: entry.preferredProfessionalId,
      preferredDate: entry.preferredDate,
      preferredTimeOfDay: entry.preferredTimeOfDay || 'QUALQUER',
      notes: entry.notes ? entry.notes.trim() : '',
      id: `wait-${Date.now()}`,
      status: 'AGUARDANDO',
      createdAt: new Date().toISOString()
    };
    syncDoc('waitlist', sanitizedEntry.id, sanitizedEntry);
    setWaitlist(prev => [sanitizedEntry, ...prev]);
  };

  // Sorteio: Regra estrita da Seção 23:
  // "Somente clientes que tiveram agendamento nos últimos 2 meses poderão ser considerados elegíveis.
  // PORÉM: O cliente NÃO deverá participar automaticamente. O cliente deverá acessar a área do sorteio e clicar em PARTICIPAR DO SORTEIO. Somente após clicar no botão deverá ser registrado."
  const isClientEligibleForRaffle = (clientId: string): { eligible: boolean; eligibleDate?: string; reason?: string } => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const clientAppointments = appointments.filter(
      a =>
        a.tenantId === activeTenantId &&
        a.clientId === clientId &&
        (a.status === 'CONCLUIDO' || a.status === 'AGENDADO')
    );

    const eligibleApt = clientAppointments.find(a => {
      const aptDate = new Date(a.date);
      return aptDate >= twoMonthsAgo;
    });

    if (eligibleApt) {
      return {
        eligible: true,
        eligibleDate: eligibleApt.date
      };
    }

    return {
      eligible: false,
      reason: 'É necessário ter ao menos um agendamento nos últimos 2 meses (60 dias) para estar apto ao sorteio.'
    };
  };

  const createRaffle = (raffleData: Omit<Raffle, 'id' | 'status' | 'participants' | 'createdAt'>) => {
    const newRaffle: Raffle = {
      ...raffleData,
      id: `raffle-${Date.now()}`,
      status: 'ATIVO',
      participants: [],
      createdAt: new Date().toISOString()
    };
    setRaffles(prev => [newRaffle, ...prev]);
  };

  const executeRaffle = (raffleId: string): { success: boolean; winnerName?: string; winnerId?: string; message: string; eligibleCount: number } => {
    const targetRaffle = raffles.find(r => r.id === raffleId && r.tenantId === activeTenantId);
    if (!targetRaffle) {
      return { success: false, message: 'Sorteio não encontrado.', eligibleCount: 0 };
    }

    if (targetRaffle.status === 'REALIZADO') {
      return {
        success: false,
        winnerName: targetRaffle.winnerClientName,
        winnerId: targetRaffle.winnerClientId,
        message: `Este sorteio já foi realizado! Ganhador: ${targetRaffle.winnerClientName}`,
        eligibleCount: targetRaffle.participants.length
      };
    }

    // Identificar participantes que confirmaram inscrição ou clientes aptos nos últimos 60 dias
    let candidates = [...targetRaffle.participants];

    // Se nenhum cliente se inscreveu ainda pela área logada, buscar todos os clientes que cortaram o cabelo nos últimos 60 dias
    if (candidates.length === 0) {
      const eligibleClients = clients.filter(c => isClientEligibleForRaffle(c.id).eligible);
      if (eligibleClients.length === 0) {
        return {
          success: false,
          message: 'Nenhum cliente elegível com corte realizado nos últimos 60 dias para realizar o sorteio.',
          eligibleCount: 0
        };
      }
      candidates = eligibleClients.map(c => {
        const elig = isClientEligibleForRaffle(c.id);
        return {
          clientId: c.id,
          clientName: c.name,
          clientWhatsApp: c.whatsapp,
          registeredAt: new Date().toISOString(),
          eligibleAppointmentDate: elig.eligibleDate || new Date().toISOString().split('T')[0]
        };
      });
    }

    // Sortear aleatoriamente 1 vencedor entre os candidatos aptos
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const winner = candidates[randomIndex];
    const drawnAt = new Date().toISOString();

    setRaffles(prev =>
      prev.map(r =>
        r.id === raffleId
          ? {
              ...r,
              status: 'REALIZADO',
              participants: candidates,
              winnerClientId: winner.clientId,
              winnerClientName: winner.clientName,
              winnerDrawnAt: drawnAt
            }
          : r
      )
    );

    return {
      success: true,
      winnerName: winner.clientName,
      winnerId: winner.clientId,
      eligibleCount: candidates.length,
      message: `🎉 Sorteio realizado com sucesso! Vencedor: ${winner.clientName} (${winner.clientWhatsApp}) entre ${candidates.length} clientes aptos!`
    };
  };

  const deleteRaffle = (raffleId: string) => {
    setRaffles(prev => prev.filter(r => r.id !== raffleId));
  };

  const updateRaffle = (raffleId: string, data: Partial<Raffle>) => {
    setRaffles(prev => prev.map(r => (r.id === raffleId ? { ...r, ...data } : r)));
  };

  const participateInRaffle = (raffleId: string, clientId: string): { success: boolean; message: string } => {
    const targetRaffle = raffles.find(r => r.id === raffleId && r.tenantId === activeTenantId);
    if (!targetRaffle) {
      return { success: false, message: 'Sorteio não encontrado.' };
    }

    if (targetRaffle.status !== 'ATIVO') {
      return { success: false, message: 'Este sorteio não está mais ativo.' };
    }

    const alreadyParticipating = targetRaffle.participants.some(p => p.clientId === clientId);
    if (alreadyParticipating) {
      return { success: false, message: 'Você já está participando deste sorteio!' };
    }

    const eligibility = isClientEligibleForRaffle(clientId);
    if (!eligibility.eligible) {
      return { success: false, message: eligibility.reason || 'Você não é elegível para este sorteio.' };
    }

    const clientUser = users.find(u => u.id === clientId);
    if (!clientUser) {
      return { success: false, message: 'Cliente não identificado.' };
    }

    const newParticipant = {
      clientId: clientUser.id,
      clientName: clientUser.name,
      clientWhatsApp: clientUser.whatsapp,
      registeredAt: new Date().toISOString(),
      eligibleAppointmentDate: eligibility.eligibleDate || new Date().toISOString().split('T')[0]
    };

    setRaffles(prev =>
      prev.map(r =>
        r.id === raffleId ? { ...r, participants: [...r.participants, newParticipant] } : r
      )
    );

    return { success: true, message: 'Inscrição confirmada com sucesso no sorteio!' };
  };

  // Projeções e Promoções Sincronizadas com Backend Autoritativo (Fase 2.2E)
  const syncPromotionProjection = async (promoId: string) => {
    try {
      const idToken = await getIdTokenFromCurrentUser();
      const res = await fetch('/api/catalog/sync-promotion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({ promotionId: promoId })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('[syncPromotionProjection] Falha na sincronização autoritativa:', data.error || res.statusText);
      }
    } catch (e) {
      console.warn('[syncPromotionProjection] Exceção de rede na sincronização de promoção:', e);
    }
  };

  const deletePromotionProjectionCall = async (tenantId: string, promoId: string) => {
    try {
      const idToken = await getIdTokenFromCurrentUser();
      const res = await fetch(`/api/catalog/promotion/${tenantId}/${promoId}`, {
        method: 'DELETE',
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('[deletePromotionProjectionCall] Falha na remoção da projeção:', data.error || res.statusText);
      }
    } catch (e) {
      console.warn('[deletePromotionProjectionCall] Exceção de rede na remoção de promoção pública:', e);
    }
  };

  // Promoções
  const createPromotion = (promoData: Omit<Promotion, 'id' | 'createdAt'>) => {
    const newPromo: Promotion = {
      ...promoData,
      id: `promo-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    syncDoc('promotions', newPromo.id, newPromo);
    syncPromotionProjection(newPromo.id);
    setPromotions(prev => [newPromo, ...prev]);
  };

  const updatePromotion = (promoId: string, promoData: Partial<Promotion>) => {
    const target = promotions.find(p => p.id === promoId);
    if (target) {
      const updated = { ...target, ...promoData };
      syncDoc('promotions', promoId, updated);
      syncPromotionProjection(promoId);
      setPromotions(prev => prev.map(p => (p.id === promoId ? updated : p)));
    }
  };

  const togglePromotionActive = (promoId: string) => {
    const target = promotions.find(p => p.id === promoId);
    if (target) {
      const updated = { ...target, active: !target.active };
      syncDoc('promotions', promoId, updated);
      syncPromotionProjection(promoId);
      setPromotions(prev => prev.map(p => (p.id === promoId ? updated : p)));
    }
  };

  const deletePromotion = (promoId: string) => {
    const target = promotions.find(p => p.id === promoId);
    if (target) {
      deleteDocFromDb('promotions', promoId);
      deletePromotionProjectionCall(target.tenantId || activeTenantId, promoId);
      setPromotions(prev => prev.filter(p => p.id !== promoId));
    }
  };

  const updateUser = (userId: string, data: Partial<User>) => {
    const target = users.find(u => u.id === userId);
    if (target) {
      // REGRA DE SEGURANÇA (RBAC / Custom Claims):
      // Role e TenantId de autorização são soberanos nos Custom Claims e NÃO podem ser alterados arbitrariamente via frontend.
      const safeData = { ...data };
      delete safeData.role;
      delete safeData.tenantId;
      delete (safeData as any).isSuperAdmin;
      delete (safeData as any).canonicalRole;

      const merged = { ...target, ...safeData };
      syncDoc('users', userId, merged);
      setUsers(prev => prev.map(u => (u.id === userId ? merged : u)));
      if (authenticatedUser?.id === userId) {
        setAuthenticatedUser(merged);
      }
    }
  };

  const updateProfessional = (profId: string, data: Partial<User>) => {
    let updatedUsers = [...users];
    if (data.canViewAllProfessionals) {
      updatedUsers = updatedUsers.map(u => {
        if (u.tenantId === activeTenantId && u.role === 'PROFISSIONAL' && u.id !== profId) {
          const toggled = { ...u, canViewAllProfessionals: false };
          syncDoc('users', u.id, toggled);
          return toggled;
        }
        return u;
      });
    }
    const target = users.find(u => u.id === profId);
    if (target) {
      const targetShop = barbershops.find(b => b.id === (target.tenantId || activeTenantId));
      let normalizedUsername = target.username;
      let normalizedEmail = target.email;
      if (data.username || data.email) {
        const norm = normalizeLogin(data.username || data.email || '', targetShop?.slug);
        if (norm) {
          normalizedUsername = norm.username;
          normalizedEmail = norm.email;
        }
      }

      const merged: User = {
        ...target,
        ...data,
        username: normalizedUsername,
        email: normalizedEmail,
        password: data.password !== undefined ? (data.password.trim() || undefined) : target.password
      };

      syncDoc('users', profId, merged);
      const nextUsers = updatedUsers.map(u => (u.id === profId ? merged : u));
      setUsers(nextUsers);
      if (authenticatedUser?.id === profId) {
        setAuthenticatedUser(merged);
      }
    }
  };

  const deleteProfessional = async (profId: string): Promise<{ success: boolean; error?: string }> => {
    if (professionals.length <= 1) {
      return { success: false, error: 'A barbearia deve manter ao menos 1 profissional ativo.' };
    }

    try {
      const token = await getIdTokenFromCurrentUser();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/team/professional/${encodeURIComponent(profId)}`, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          error: errData.error || `Falha ao remover profissional (HTTP ${res.status}).`
        };
      }

      // O backend realiza soft delete (status: 'inactive') em users/{uid} e revoga credenciais Auth,
      // preservando o documento para relatórios de comissão, histórico de agendamentos e auditoria.
      setUsers(prev => prev.map(u => (u.id === profId || u.uid === profId) ? { ...u, status: 'inactive' } : u));
      setPublicProfessionals(prev => prev.filter(p => p.id !== profId));
      return { success: true };
    } catch (netErr: any) {
      console.error('[deleteProfessional] Erro ao remover profissional:', netErr);
      return {
        success: false,
        error: netErr?.message || 'Erro de comunicação ao remover profissional.'
      };
    }
  };

  const usePackageItem = async (customerPackageId: string, itemId: string): Promise<boolean> => {
    try {
      const token = await getIdTokenFromCurrentUser();
      const idempotencyKey = 'pkg_use_' + (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/customer-packages/${encodeURIComponent(customerPackageId)}/items/${encodeURIComponent(itemId)}/consume`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ idempotencyKey })
      });

      const data = await res.json();
      if (res.ok && data.success && data.customerPackage) {
        setCustomerPackages(prev =>
          prev.map(cp => cp.id === customerPackageId ? data.customerPackage : cp)
        );
        return true;
      } else {
        console.warn('[usePackageItem] Falha ao consumir sessão:', data.message || data.error);
        return false;
      }
    } catch (err) {
      console.error('[usePackageItem] Erro de rede ao consumir pacote:', err);
      return false;
    }
  };

  const addService = (serviceData: Omit<Service, 'id'>) => {
    const newService: Service = {
      ...serviceData,
      id: `srv-${Date.now()}`
    };
    syncDoc('services', newService.id, newService);
    setServices(prev => [...prev, newService]);
  };

  const updateService = (serviceId: string, data: Partial<Service>) => {
    const target = services.find(s => s.id === serviceId);
    if (target) {
      const merged = { ...target, ...data };
      syncDoc('services', serviceId, merged);
      setServices(prev => prev.map(s => s.id === serviceId ? merged : s));
    }
  };

  const addProfessional = async (userData: Omit<User, 'id' | 'createdAt'>): Promise<{ success: boolean; error?: string; user?: User }> => {
    const targetTenantId = userData.tenantId || activeTenantId;
    const targetShop = barbershops.find(b => b.id === targetTenantId);

    const customPlan = customPlans.find(p => p.id === targetShop?.planId) ||
      (targetShop?.planId === 'PLANO_UNICO' ? customPlans.find(p => p.id === 'plano-essencial') : undefined) ||
      customPlans.find(p => p.id === 'plano-essencial') ||
      customPlans[0];
    const maxStaff = customPlan && customPlan.limits?.maxProfessionals !== undefined
      ? (customPlan.limits.maxProfessionals === 'UNLIMITED' ? 9999 : Number(customPlan.limits.maxProfessionals))
      : (MY_BARBER_PLANS[targetShop?.planId || '']?.maxProfessionals || 1);
    const currentStaffCount = users.filter(
      u => u.tenantId === targetTenantId &&
           (u.role === 'PROFISSIONAL' || (u as any).canonicalRole === 'barber') &&
           u.status !== 'inactive'
    ).length;

    // Validação centralizada e rigorosa
    const valResult = validateProfessionalCreation({
      name: userData.name,
      tenantId: targetTenantId,
      login: userData.username || userData.email,
      password: userData.password,
      creatorRole: authenticatedUser?.role,
      creatorTenantId: authenticatedUser?.tenantId,
      existingUsers: users,
      barbershops,
      maxStaff,
      currentStaffCount
    });

    if (!valResult.valid) {
      return { success: false, error: valResult.error || 'Dados inválidos para cadastro de profissional.' };
    }

    try {
      const token = await getIdTokenFromCurrentUser();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const normalized = valResult.normalized;
      const res = await fetch('/api/team/create-professional', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId: targetTenantId,
          name: userData.name.trim(),
          email: normalized?.email || (userData.email ? userData.email.trim().toLowerCase() : undefined),
          username: normalized?.username || (userData.username ? userData.username.trim().toLowerCase() : undefined),
          password: userData.password ? userData.password.trim() : undefined,
          whatsapp: userData.whatsapp ? userData.whatsapp.trim() : undefined,
          phone: userData.phone ? userData.phone.trim() : (userData.whatsapp ? userData.whatsapp.trim() : undefined),
          avatarUrl: userData.avatarUrl ? userData.avatarUrl.trim() : undefined,
          commissionPercentage: userData.commissionPercentage,
          canViewAllProfessionals: userData.canViewAllProfessionals,
          specialties: userData.specialties
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          error: errData.error || `Falha ao criar profissional (HTTP ${res.status}).`
        };
      }

      const resData = await res.json();
      if (!resData || !resData.user) {
        return {
          success: false,
          error: 'Resposta inválida do servidor ao criar profissional.'
        };
      }

      const createdUser: User = resData.user;

      // Se este profissional for marcado com canViewAllProfessionals, desmarca os outros
      let updatedUsers = [...users];
      if (createdUser.canViewAllProfessionals) {
        updatedUsers = updatedUsers.map(u =>
          u.tenantId === targetTenantId && u.role === 'PROFISSIONAL'
            ? { ...u, canViewAllProfessionals: false }
            : u
        );
      }

      const nextUsers = [...updatedUsers.filter(u => u.id !== createdUser.id), createdUser];
      setUsers(nextUsers);

      addAuditLog({
        actorUserId: authenticatedUser?.uid || authenticatedUser?.id || 'system',
        actorUserName: authenticatedUser?.name || 'Administrador',
        actorRole: authenticatedUser?.role || 'GERENTE',
        action: 'CRIAR_PROFISSIONAL',
        targetTenantId: targetTenantId,
        targetTenantName: targetShop?.name || 'Barbearia',
        details: `Profissional ${createdUser.name} cadastrado com sucesso com UID soberano ${createdUser.uid || createdUser.id}.`,
        status: 'SUCESSO'
      });

      return { success: true, user: createdUser };
    } catch (netErr: any) {
      console.error('[addProfessional] Erro de comunicação ao criar profissional:', netErr);
      return {
        success: false,
        error: netErr?.message || 'Erro de comunicação ao criar profissional.'
      };
    }
  };

  const updateStockQuantity = async (id: string, delta: number): Promise<boolean> => {
    try {
      const token = await getIdTokenFromCurrentUser();
      const idempotencyKey = 'stk_adj_' + (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/stock/${encodeURIComponent(id)}/adjust`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ delta, idempotencyKey })
      });

      const data = await res.json();
      if (res.ok && data.success && data.stockItem) {
        setStock(prev =>
          prev.map(item => (item.id === id ? { ...item, quantity: data.stockItem.quantity } : item))
        );
        return true;
      }
      console.warn('[updateStockQuantity] Falha ao ajustar estoque:', data.message || data.error);
      return false;
    } catch (err) {
      console.error('[updateStockQuantity] Erro de rede ao ajustar estoque:', err);
      return false;
    }
  };

  const addStockItem = (itemData: Omit<StockItem, 'id' | 'tenantId'>) => {
    const newItem: StockItem = {
      ...itemData,
      id: `prod-${Date.now()}`,
      tenantId: activeTenantId
    };
    syncDoc('stock', newItem.id, newItem);
    setStock(prev => [...prev, newItem]);
  };

  const updateStockItem = (stockId: string, data: Partial<StockItem>) => {
    const target = stock.find(s => s.id === stockId);
    if (target) {
      // FASE 4.4D: Proibição estrita de mutação de 'quantity' via client-side.
      // O quantity original é compulsoriamente preservado; ajustes de saldo devem utilizar a rota /api/stock/:id/adjust.
      const { quantity: _ignoredQty, ...cadastralData } = data;
      const merged = { ...target, ...cadastralData, quantity: target.quantity };
      syncDoc('stock', stockId, merged);
      setStock(prev => prev.map(s => s.id === stockId ? merged : s));
    }
  };

  const createCommunication = (comm: Omit<CommunicationMessage, 'id' | 'sentAt' | 'logs'>) => {
    const logs = clients.map(c => ({
      clientId: c.id,
      clientName: c.name,
      clientWhatsApp: c.whatsapp,
      channel: (comm.channel === 'AMBOS' ? 'APP' : comm.channel) as 'APP' | 'SMS',
      received: true,
      receivedAt: new Date().toISOString(),
      read: false
    }));

    const newComm: CommunicationMessage = {
      ...comm,
      id: `msg-${Date.now()}`,
      sentAt: new Date().toISOString(),
      logs
    };
    setCommunications(prev => [newComm, ...prev]);
  };

  const sendReturnMessage = (returnId: string) => {
    setReturnMessages(prev =>
      prev.map(r => (r.id === returnId ? { ...r, status: 'ENVIADA', sentAt: new Date().toISOString() } : r))
    );
  };

  // Helper to generate direct public link for any barbershop (Exclusive address on mybarberbr.com.br)
  const getBarbershopExclusiveDomain = (barbershop?: Barbershop | string): string => {
    let shopSlug = '';
    if (typeof barbershop === 'string') {
      const found = barbershops.find(b => b.id === barbershop || b.slug === barbershop);
      shopSlug = found?.slug || barbershop;
    } else if (barbershop) {
      shopSlug = barbershop.slug;
    } else {
      shopSlug = currentBarbershop.slug;
    }
    const cleanSlug = shopSlug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '') || 'barbearia';
    return `${cleanSlug}.${MY_BARBER_MAIN_DOMAIN}`;
  };

  const getBarbershopDirectUrl = (barbershop?: Barbershop | string): string => {
    const domain = getBarbershopExclusiveDomain(barbershop);
    return `https://${domain}`;
  };

  // Google Account Login for Clients with mandatory WhatsApp & Birth Date
  const loginWithGoogle = (data: {
    googleId?: string;
    email: string;
    name: string;
    avatarUrl?: string;
    whatsapp: string;
    birthDate: string;
    emailVerified?: boolean;
  }): User => {
    if (!data.googleId) {
      throw new Error('Autenticação Google oficial é obrigatória (Firebase UID ausente).');
    }

    const cleanPhone = data.whatsapp.trim();
    const cleanEmail = data.email.trim().toLowerCase();
    const isVerifiedEmail = data.emailVerified === true;
    
    // 1. Check if user is Super Admin or Staff (Proprietario, Gerente, Profissional) strictly by UID or verified Google email
    const existingStaffOrAdmin = users.find(
      u =>
        (data.googleId && (u.uid === data.googleId || u.id === data.googleId || u.googleId === data.googleId)) ||
        (isVerifiedEmail && cleanEmail && u.email?.toLowerCase() === cleanEmail && (!u.googleId || u.googleId === data.googleId))
    );

    if (existingStaffOrAdmin && existingStaffOrAdmin.role !== 'CLIENTE') {
      if (existingStaffOrAdmin.status === 'inactive') {
        throw new Error('Esta conta de usuário encontra-se inativa.');
      }
      if (data.googleId && !existingStaffOrAdmin.uid) {
        existingStaffOrAdmin.uid = data.googleId;
        syncDoc('users', existingStaffOrAdmin.id, existingStaffOrAdmin);
      }
      setCurrentUserId(existingStaffOrAdmin.id);
      setAuthenticatedUser(existingStaffOrAdmin);
      if (existingStaffOrAdmin.role === 'SUPER_ADMIN') {
        setViewMode('MASTER_ADMIN');
      } else if (existingStaffOrAdmin.role === 'PROPRIETARIO' || existingStaffOrAdmin.role === 'GERENTE') {
        if (existingStaffOrAdmin.tenantId && existingStaffOrAdmin.tenantId !== 'platform-global') {
          setActiveTenantId(existingStaffOrAdmin.tenantId);
        }
        setViewMode('WEBADMIN');
      } else if (existingStaffOrAdmin.role === 'PROFISSIONAL') {
        if (existingStaffOrAdmin.tenantId && existingStaffOrAdmin.tenantId !== 'platform-global') {
          setActiveTenantId(existingStaffOrAdmin.tenantId);
        }
        setViewMode('PROFISSIONAL_APP');
      }

      addAuditLog({
        actorUserId: existingStaffOrAdmin.id,
        actorUserName: existingStaffOrAdmin.name,
        actorRole: existingStaffOrAdmin.role,
        action: 'LOGIN_SUCESSO',
        targetTenantId: existingStaffOrAdmin.tenantId,
        targetTenantName: barbershops.find(b => b.id === existingStaffOrAdmin.tenantId)?.name || 'Plataforma',
        details: `Login autenticado com sucesso via Google. Hierarquia identificada: ${existingStaffOrAdmin.role}.`,
        status: 'SUCESSO'
      });

      return existingStaffOrAdmin;
    }

    // 2. Check if client already exists globally across the platform by canonical UID or verified email (never by phone alone)
    let client = users.find(
      u =>
        u.role === 'CLIENTE' &&
        ((data.googleId && (u.uid === data.googleId || u.id === data.googleId || u.googleId === data.googleId)) ||
         (isVerifiedEmail && cleanEmail && u.email?.toLowerCase() === cleanEmail && (!u.googleId || u.googleId === data.googleId)))
    );

    // FASE 2.4C: Bloqueio estrito de reativação não autorizada e login de cliente inativo
    if (client && client.status === 'inactive') {
      throw new Error('Esta conta de cliente foi desativada. Para assistência, entre em contato com a administração da barbearia.');
    }

    if (client) {
      // Update missing client info if provided, keeping global identity intact
      const updatedClient: User = {
        ...client,
        uid: data.googleId || client.uid,
        name: data.name.trim() || client.name,
        email: cleanEmail || client.email,
        whatsapp: cleanPhone || client.whatsapp,
        phone: cleanPhone || client.whatsapp,
        birthDate: data.birthDate || client.birthDate,
        avatarUrl: data.avatarUrl || client.avatarUrl,
        googleId: data.googleId || client.googleId,
        authProvider: 'GOOGLE',
        status: 'active',
        updatedAt: new Date().toISOString()
      };

      setUsers(prev => prev.map(u => (u.id === client!.id ? updatedClient : u)));
      syncDoc('users', updatedClient.id, updatedClient);
      client = updatedClient;
    } else {
      // Create new global client via Google login using canonical Firebase UID as document ID
      client = {
        id: data.googleId,
        uid: data.googleId,
        tenantId: activeTenantId,
        role: 'CLIENTE',
        status: 'active',
        name: data.name.trim(),
        email: cleanEmail,
        whatsapp: cleanPhone,
        phone: cleanPhone,
        birthDate: data.birthDate,
        avatarUrl: data.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
        googleId: data.googleId,
        authProvider: 'GOOGLE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      syncDoc('users', client.id, client);
      setUsers(prev => [...prev, client!]);
    }

    setCurrentUserId(client.id);
    setAuthenticatedUser(client);
    setWhatsappLoginPhone(cleanPhone);
    setViewMode('CLIENT_APP');
    return client;
  };

  const loginWithWhatsApp = (phone: string, name?: string): User => {
    const cleanPhone = phone.trim();
    let client = users.find(
      u => u.role === 'CLIENTE' && u.whatsapp && cleanPhone.replace(/\D/g, '').length >= 8 && u.whatsapp.replace(/\D/g, '') === cleanPhone.replace(/\D/g, '')
    );

    if (!client) {
      client = {
        id: `user-client-wa-${Date.now()}`,
        tenantId: activeTenantId,
        role: 'CLIENTE',
        name: name?.trim() || 'Cliente',
        whatsapp: cleanPhone,
        authProvider: 'SYSTEM',
        createdAt: new Date().toISOString()
      };
      syncDoc('users', client.id, client);
      setUsers(prev => [...prev, client!]);
    }

    setCurrentUserId(client.id);
    setAuthenticatedUser(client);
    setWhatsappLoginPhone(cleanPhone);
    setViewMode('CLIENT_APP');
    return client;
  };

  // Access Hierarchy: Master Admin (App Owner) creates Proprietário / Gerente login
  const createManagerAccess = (data: {
    tenantId: string;
    name: string;
    email: string;
    whatsapp: string;
    role: 'PROPRIETARIO' | 'GERENTE';
    avatarUrl?: string;
    birthDate?: string;
  }) => {
    const targetShop = barbershops.find(b => b.id === data.tenantId);
    if (!targetShop) {
      return { success: false, error: 'Barbearia selecionada não encontrada.' };
    }

    const newManager: User = {
      id: `user-mgr-${Date.now()}`,
      tenantId: data.tenantId,
      role: data.role,
      name: data.name.trim(),
      email: data.email.trim(),
      whatsapp: data.whatsapp.trim(),
      avatarUrl: data.avatarUrl?.trim() || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
      birthDate: data.birthDate,
      canViewAllProfessionals: true,
      commissionPercentage: 50,
      createdByUserId: 'master-app-owner',
      createdAt: new Date().toISOString()
    };

    syncDoc('users', newManager.id, newManager);
    setUsers(prev => [...prev, newManager]);

    addAuditLog({
      actorUserId: currentUser.id,
      actorUserName: currentUser.name,
      actorRole: currentUser.role,
      action: 'CRIACAO_GESTOR',
      targetTenantId: data.tenantId,
      targetTenantName: targetShop.name,
      targetUserId: newManager.id,
      targetUserName: newManager.name,
      details: `Criado acesso de ${data.role} para ${data.name} (${data.email}).`,
      status: 'SUCESSO'
    });

    return { success: true, user: newManager };
  };

  // Access Hierarchy: Gerente/Proprietário creates Profissional login
  const createProfessionalAccess = (userData: Omit<User, 'id' | 'createdAt'>) => {
    return addProfessional({
      ...userData,
      createdByUserId: currentUserId
    });
  };

  const logoutClient = () => {
    logoutFromFirebaseAuth().catch(() => {});
    setAuthenticatedUser(null);
    setCurrentUserId('user-guest-client');
    try {
      localStorage.removeItem('mybarber_session_user_id');
      localStorage.removeItem('mybarber_session_user');
    } catch {
      // ignore
    }
    setWhatsappLoginPhone('');
    setViewMode('CLIENT_APP');
  };

  const registerBarbershop = async (input: RegisterBarbershopInput): Promise<{
    success: boolean;
    barbershopId: string;
    subscription?: Subscription;
    initPointUrl?: string;
    error?: string;
  }> => {
    const newTenantId = `tenant-${Date.now()}`;
    const now = new Date();
    const isTrial = input.commercialMode === 'TESTE_GRATIS';
    const trialStartedAt = isTrial ? now.toISOString() : undefined;
    
    // Identificar plano alvo dinamicamente para aplicar regras de degustação e limites
    const targetPlan = customPlans.find(p => p.id === input.planId) || INITIAL_CUSTOM_PLANS.find(p => p.id === input.planId) || INITIAL_CUSTOM_PLANS[0];
    const trialDays = targetPlan.hasTrial && targetPlan.trialDuration ? targetPlan.trialDuration : (isTrial ? 14 : 0);
    const trialExpiresAt = isTrial 
      ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString() 
      : undefined;

    const managerEmail = (input.managerEmail?.trim() || `${input.slug.trim() || 'barbearia'}@mybarber.com.br`).toLowerCase();

    // FASE 1 & FASE 3: Provisionamento seguro do gestor no backend com Firebase Admin SDK e Custom Claims
    let ownerUid = '';
    let additionalManagerUid: string | undefined = undefined;
    let initialBarberData: User | null = null;

    try {
      const superAdminToken = await getIdTokenFromCurrentUser();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (superAdminToken) {
        headers['Authorization'] = `Bearer ${superAdminToken}`;
      }

      const provisionPayload: any = {
        email: managerEmail,
        name: input.managerName.trim(),
        tenantId: newTenantId,
        password: input.managerPassword?.trim() || undefined,
        phoneNumber: input.managerWhatsApp.trim()
      };

      if (input.hasAdditionalManager && input.additionalManagerName && input.additionalManagerWhatsApp) {
        provisionPayload.additionalManager = {
          email: (input.additionalManagerEmail?.trim() || `gerente-${newTenantId}@mybarber.com.br`).toLowerCase(),
          name: input.additionalManagerName.trim(),
          password: input.additionalManagerPassword?.trim() || undefined,
          phoneNumber: input.additionalManagerWhatsApp.trim()
        };
      }

      provisionPayload.initialBarber = {
        name: `Barbeiro Oficial (${input.managerName.split(' ')[0]})`,
        whatsapp: input.managerWhatsApp.trim()
      };

      const provRes = await fetch('/api/admin/provision-barbershop-owner', {
        method: 'POST',
        headers,
        body: JSON.stringify(provisionPayload)
      });

      if (!provRes.ok) {
        const errData = await provRes.json().catch(() => ({}));
        const errMsg = errData.error || `Falha no provisionamento do gestor (HTTP ${provRes.status}).`;
        console.error('[registerBarbershop] Falha no provisionamento via Admin SDK:', errMsg);
        return {
          success: false,
          barbershopId: '',
          error: `Não foi possível provisionar a conta do gestor no Firebase Authentication: ${errMsg}. O cadastro da barbearia foi cancelado sem persistência.`
        };
      }

      const provData = await provRes.json();
      if (!provData || !provData.ownerUid) {
        return {
          success: false,
          barbershopId: '',
          error: 'O serviço de autenticação não retornou um UID soberano válido para o gestor. O cadastro da barbearia foi cancelado.'
        };
      }

      ownerUid = provData.ownerUid;
      if (provData.additionalManagerUid) {
        additionalManagerUid = provData.additionalManagerUid;
      }
      if (provData.initialBarber) {
        initialBarberData = provData.initialBarber;
      }
    } catch (netErr: any) {
      console.error('[registerBarbershop] Erro de rede ao contatar endpoint de provisionamento:', netErr);
      return {
        success: false,
        barbershopId: '',
        error: `Erro de comunicação com o serviço de provisionamento: ${netErr?.message || 'Falha de rede'}. O cadastro foi cancelado sem persistência.`
      };
    }

    // Validação estrita: ownerUid DEVE ser o UID real do Firebase Auth (nunca vazio e nunca sintético)
    if (!ownerUid || ownerUid.trim() === '' || ownerUid.startsWith('user-mgr-')) {
      return {
        success: false,
        barbershopId: '',
        error: 'UID soberano do gestor ausente ou inválido. Operação abortada sem alterações.'
      };
    }

    // Se gerente adicional foi solicitado, exigir que seu UID tenha sido provisionado com sucesso
    if (input.hasAdditionalManager && input.additionalManagerName && input.additionalManagerWhatsApp) {
      if (!additionalManagerUid || additionalManagerUid.startsWith('user-mgr-')) {
        return {
          success: false,
          barbershopId: '',
          error: 'Falha no provisionamento da conta do gerente adicional no Firebase Authentication. O cadastro da barbearia foi cancelado.'
        };
      }
    }

    // FASE 2: ownerUid REAL da identidade soberana do gestor no Firebase Authentication
    const newBarbershop: Barbershop = {
      id: newTenantId,
      ownerUid, // UID soberano do gestor no Firebase Auth
      name: input.name.trim(),
      slug: input.slug.trim() || input.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      customDomain: input.customDomain.trim() || `www.${input.slug.trim() || 'barbearia'}.com.br`,
      logoUrl: input.logoUrl.trim() || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400',
      bannerUrl: input.bannerUrl.trim() || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200',
      salonImages: input.salonImages && input.salonImages.length > 0 ? input.salonImages : [
        input.bannerUrl.trim() || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800',
        'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800'
      ],
      about: input.about.trim() || `${input.name} — Barbearia e cuidados masculinos de alto padrão.`,
      phone: input.phone.trim(),
      whatsapp: input.whatsapp.trim(),
      address: {
        street: input.street.trim(),
        number: input.number.trim(),
        complement: input.complement?.trim() || '',
        neighborhood: input.neighborhood.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        zipCode: input.zipCode.trim()
      },
      socialMedia: {
        instagram: `@${(input.slug?.trim() || input.name.toLowerCase().replace(/[^a-z0-9]/g, '')).replace(/-/g, '')}`,
        facebook: input.name
      },
      planId: input.planId,
      status: isTrial ? 'TESTE' : 'ATIVA',
      commercialMode: isTrial ? 'TESTE_GRATIS' : 'PAGO',
      ...(trialStartedAt ? { trialStartedAt } : {}),
      ...(trialExpiresAt ? { trialExpiresAt } : {}),
      reminderConfig: {
        advanceMinutes: 60,
        enabled: true,
        whatsappTemplate: `Olá {cliente}! Lembrete do seu agendamento na ${input.name} hoje às {horario} com {profissional}.`
      },
      createdAt: now.toISOString()
    };

    // Perfil do Gestor/Proprietário com UID soberano e SEM SENHA no Firestore
    const newManager: User = {
      id: ownerUid,
      uid: ownerUid,
      tenantId: newTenantId,
      role: input.managerRole,
      name: input.managerName.trim(),
      username: input.managerUsername?.trim() || input.managerWhatsApp.trim(),
      email: managerEmail,
      whatsapp: input.managerWhatsApp.trim(),
      phone: input.managerWhatsApp.trim(),
      avatarUrl: input.managerAvatarUrl?.trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
      canViewAllProfessionals: true,
      commissionPercentage: 50,
      createdByUserId: currentUser.uid || currentUser.id || 'master-app-owner',
      status: 'active',
      authProvider: 'FIREBASE_AUTH',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Gerente adicional se configurado
    let additionalManager: User | null = null;
    if (input.hasAdditionalManager && input.additionalManagerName && input.additionalManagerWhatsApp) {
      const addUid = additionalManagerUid!;
      additionalManager = {
        id: addUid,
        uid: addUid,
        tenantId: newTenantId,
        role: 'GERENTE',
        name: input.additionalManagerName.trim(),
        username: input.additionalManagerUsername?.trim() || input.additionalManagerWhatsApp.trim(),
        email: input.additionalManagerEmail?.trim() || `gerente-${newTenantId}@mybarber.com.br`,
        whatsapp: input.additionalManagerWhatsApp.trim(),
        phone: input.additionalManagerWhatsApp.trim(),
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
        canViewAllProfessionals: true,
        commissionPercentage: 50,
        createdByUserId: currentUser.uid || currentUser.id || 'master-app-owner',
        status: 'active',
        authProvider: 'FIREBASE_AUTH',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    // Barbeiro oficial inicial provisionado canonicamente no Firebase Auth
    const initialBarber: User = initialBarberData || {
      id: `${ownerUid}-barber`,
      uid: `${ownerUid}-barber`,
      tenantId: newTenantId,
      role: 'PROFISSIONAL',
      canonicalRole: 'barber',
      name: `Barbeiro Oficial (${input.managerName.split(' ')[0]})`,
      whatsapp: input.managerWhatsApp.trim(),
      phone: input.managerWhatsApp.trim(),
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
      canViewAllProfessionals: false,
      commissionPercentage: 45,
      specialties: ['Degradê Navalhado', 'Barba Terapia', 'Pigmentação'],
      status: 'active',
      authProvider: 'FIREBASE_AUTH',
      createdByUserId: ownerUid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Starter services for new shop
    const defaultServices: Service[] = [
      {
        id: `srv-${Date.now()}-1`,
        tenantId: newTenantId,
        name: 'Corte Clássico & Degradê',
        description: 'Corte completo com lavagem, finalização e penteado personalizado.',
        durationMinutes: 30,
        price: 50.00,
        category: 'Cabelo',
        imageUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400',
        returnReminderDays: 25,
        active: true
      },
      {
        id: `srv-${Date.now()}-2`,
        tenantId: newTenantId,
        name: 'Barboterapia Tradicional',
        description: 'Toalha quente com essências, navalha afiada e óleo hidratante.',
        durationMinutes: 35,
        price: 45.00,
        category: 'Barba',
        imageUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400',
        returnReminderDays: 15,
        active: true
      },
      {
        id: `srv-${Date.now()}-3`,
        tenantId: newTenantId,
        name: 'Combo Cabelo + Barba VIP',
        description: 'Experiência completa com cerveja artesanal ou café expresso cortesia.',
        durationMinutes: 60,
        price: 85.00,
        category: 'Combos',
        imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400',
        returnReminderDays: 21,
        active: true
      }
    ];

    // Starter stock
    const defaultStock: StockItem[] = [
      {
        id: `stock-${Date.now()}-1`,
        tenantId: newTenantId,
        name: 'Pomada Efeito Matte 100g',
        category: 'Finalizadores',
        quantity: 20,
        minQuantity: 5,
        costPrice: 20.00,
        salePrice: 48.00,
        unit: 'UNIDADE'
      }
    ];

    const usersToCreate = [newManager, initialBarber];
    if (additionalManager) {
      usersToCreate.push(additionalManager);
    }

    // Persist permanently to Firestore (SEM SENHAS em users)
    syncDoc('barbershops', newBarbershop.id, newBarbershop);
    usersToCreate.forEach(u => syncDoc('users', u.id, sanitizeUserProfileForFirestore(u)));
    defaultServices.forEach(srv => syncDoc('services', srv.id, srv));
    defaultStock.forEach(stk => syncDoc('stock', stk.id, stk));

    // FASE 4 & 5: Criação da Subscription através do endpoint autenticado pelo backend
    let createdSub: Subscription | undefined = undefined;
    let initPointUrl: string | undefined = undefined;

    try {
      if (input.planId === 'plano-vitalicio') {
        const lifetimeRes = await createLifetimeCheckout({
          barbershopId: newTenantId,
          barbershopName: input.name,
          payerEmail: managerEmail,
          payerName: input.managerName
        });
        if (lifetimeRes.success) {
          initPointUrl = lifetimeRes.initPointUrl;
        }
      } else {
        const subResult = await createSubscription({
          barbershopId: newTenantId,
          barbershopName: input.name,
          payerEmail: managerEmail,
          payerName: input.managerName,
          payerPhone: input.managerWhatsApp,
          planId: input.planId
        });

        if (subResult.success && subResult.subscription) {
          createdSub = subResult.subscription;
          initPointUrl = subResult.initPointUrl || subResult.subscription.initPointUrl;
        }
      }
    } catch (subErr) {
      console.warn('[registerBarbershop] Erro ao iniciar assinatura ou compra definitiva no backend:', subErr);
    }

    // Atualiza estados locais apenas após a execução do fluxo
    setBarbershops(prev => {
      const next = [...prev, newBarbershop];
      try {
        localStorage.setItem('mybarber_cached_barbershops', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    setUsers(prev => [...prev, ...usersToCreate]);

    setServices(prev => [...prev, ...defaultServices]);
    setStock(prev => [...prev, ...defaultStock]);

    addAuditLog({
      actorUserId: currentUser.uid || currentUser.id,
      actorUserName: currentUser.name,
      actorRole: currentUser.role,
      action: 'CADASTRO_BARBEARIA',
      targetTenantId: newTenantId,
      targetTenantName: input.name,
      details: `Nova barbearia cadastrada no plano "${targetPlan.name}". Gestor oficial: ${input.managerName} (${managerEmail}, UID: ${ownerUid}).`,
      status: 'SUCESSO'
    });

    return {
      success: true,
      barbershopId: newTenantId,
      subscription: createdSub,
      initPointUrl
    };
  };

  const deleteBarbershop = (barbershopId: string) => {
    if (barbershops.length <= 1) {
      return { success: false, error: 'Não é possível remover a única barbearia ativa do sistema.' };
    }
    const target = barbershops.find(b => b.id === barbershopId);
    
    // Delete from Firestore
    deleteDocFromDb('barbershops', barbershopId);
    users.filter(u => u.tenantId === barbershopId).forEach(u => deleteDocFromDb('users', u.id));
    services.filter(s => s.tenantId === barbershopId).forEach(s => deleteDocFromDb('services', s.id));
    appointments.filter(a => a.tenantId === barbershopId).forEach(a => deleteDocFromDb('appointments', a.id));

    setBarbershops(prev => {
      const next = prev.filter(b => b.id !== barbershopId);
      try {
        localStorage.setItem('mybarber_cached_barbershops', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setUsers(prev => prev.filter(u => u.tenantId !== barbershopId));
    setServices(prev => prev.filter(s => s.tenantId !== barbershopId));
    setAppointments(prev => prev.filter(a => a.tenantId !== barbershopId));

    if (activeTenantId === barbershopId) {
      const remaining = barbershops.filter(b => b.id !== barbershopId);
      if (remaining.length > 0) {
        setActiveTenantId(remaining[0].id);
      }
    }

    addAuditLog({
      actorUserId: currentUser.id,
      actorUserName: currentUser.name,
      actorRole: currentUser.role,
      action: 'REMOCAO_BARBEARIA',
      targetTenantId: barbershopId,
      targetTenantName: target?.name || barbershopId,
      details: `Barbearia removida da plataforma e dados desvinculados.`,
      status: 'AVISO'
    });

    return { success: true };
  };

  // Projeções e Galeria Sincronizadas com Backend Autoritativo (Fase 2.2E)
  const syncGalleryProjection = async (workId: string) => {
    try {
      const idToken = await getIdTokenFromCurrentUser();
      const res = await fetch('/api/catalog/sync-gallery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({ workId })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('[syncGalleryProjection] Falha na sincronização autoritativa:', data.error || res.statusText);
      }
    } catch (e) {
      console.warn('[syncGalleryProjection] Exceção de rede na sincronização de galeria:', e);
    }
  };

  const deleteGalleryProjectionCall = async (tenantId: string, workId: string) => {
    try {
      const idToken = await getIdTokenFromCurrentUser();
      const res = await fetch(`/api/catalog/gallery/${tenantId}/${workId}`, {
        method: 'DELETE',
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('[deleteGalleryProjectionCall] Falha na remoção da projeção:', data.error || res.statusText);
      }
    } catch (e) {
      console.warn('[deleteGalleryProjectionCall] Exceção de rede na remoção de galeria pública:', e);
    }
  };

  // Gallery Works & Media Operations
  const addGalleryWork = (work: Omit<GalleryWork, 'id' | 'tenantId' | 'likesCount' | 'createdAt'>) => {
    const newWork: GalleryWork = {
      ...work,
      id: `work-${Date.now()}`,
      tenantId: activeTenantId,
      likesCount: 0,
      createdAt: new Date().toISOString()
    };
    syncDoc('gallery', newWork.id, newWork);
    syncGalleryProjection(newWork.id);
    setGalleryWorks(prev => [newWork, ...prev]);
  };

  const updateGalleryWork = (workId: string, updates: Partial<GalleryWork>) => {
    const target = galleryWorks.find(w => w.id === workId);
    if (target) {
      const updated = { ...target, ...updates };
      syncDoc('gallery', workId, updated);
      syncGalleryProjection(workId);
      setGalleryWorks(prev => prev.map(w => w.id === workId ? updated : w));
    }
  };

  const deleteGalleryWork = (workId: string) => {
    const target = galleryWorks.find(w => w.id === workId);
    if (target) {
      deleteDocFromDb('gallery', workId);
      deleteGalleryProjectionCall(target.tenantId || activeTenantId, workId);
      setGalleryWorks(prev => prev.filter(w => w.id !== workId));
    }
  };

  const likeGalleryWork = async (workId: string) => {
    // Atualização otimista no estado local para feedback visual instantâneo
    setGalleryWorks(prev =>
      prev.map(w => (w.id === workId ? { ...w, likesCount: (w.likesCount || 0) + 1 } : w))
    );

    try {
      const res = await fetch(`/api/catalog/gallery/${workId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.likesCount === 'number') {
          setGalleryWorks(prev =>
            prev.map(w => (w.id === workId ? { ...w, likesCount: data.likesCount } : w))
          );
        }
      } else {
        console.warn('[likeGalleryWork] Endpoint autoritativo rejeitou a curtida.');
      }
    } catch (e) {
      console.warn('[likeGalleryWork] Exceção ao curtir foto da galeria:', e);
    }
  };

  const uploadMedia = async (file: File, folder: string = 'barbershop_media', customTenantId?: string): Promise<string> => {
    const targetTenant = customTenantId || activeTenantId || 'tenant-barbearia-do-joao';
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `tenants/${targetTenant}/${folder}/${timestamp}_${cleanFileName}`;
    return await uploadImageToStorage(file, path);
  };

  // Super Admin Impersonation Handlers
  const startImpersonation = (targetRole: UserRole, targetTenantId?: string, specificUserId?: string) => {
    const activeShopId = targetTenantId || activeTenantId;
    if (targetTenantId && targetTenantId !== activeTenantId) {
      setActiveTenantId(targetTenantId);
    }

    if (!isImpersonating) {
      setImpersonationOriginUserId(currentUserId);
    }
    setIsImpersonating(true);

    const targetShopName = barbershops.find(b => b.id === activeShopId)?.name || 'Barbearia';

    addAuditLog({
      actorUserId: 'user-super-admin',
      actorUserName: 'Super Admin (Dono My Barber)',
      actorRole: 'SUPER_ADMIN',
      action: 'VISUALIZAR_COMO_INICIADO',
      targetTenantId: activeShopId,
      targetTenantName: targetShopName,
      details: `Iniciada simulação de experiência com perfil ${targetRole} na barbearia ${targetShopName}.`,
      status: 'SUCESSO'
    });

    if (targetRole === 'SUPER_ADMIN') {
      const superAdmin = users.find(u => u.role === 'SUPER_ADMIN');
      if (superAdmin) setCurrentUserId(superAdmin.id);
      setViewMode('MASTER_ADMIN');
      setIsImpersonating(false);
      setImpersonationOriginUserId(null);
      return;
    }

    if (specificUserId) {
      const specificUser = users.find(u => u.id === specificUserId);
      if (specificUser) {
        setCurrentUserId(specificUser.id);
        if (specificUser.role === 'CLIENTE') setViewMode('CLIENT_APP');
        else if (specificUser.role === 'PROFISSIONAL') setViewMode('PROFISSIONAL_APP');
        else if (specificUser.role === 'PROPRIETARIO' || specificUser.role === 'GERENTE') setViewMode('WEBADMIN');
        return;
      }
    }

    // Find or create sample role representation in target barbershop
    const matchInTenant = users.find(u => u.tenantId === activeShopId && u.role === targetRole);
    if (matchInTenant) {
      setCurrentUserId(matchInTenant.id);
      if (targetRole === 'CLIENTE') setViewMode('CLIENT_APP');
      else if (targetRole === 'PROFISSIONAL') setViewMode('PROFISSIONAL_APP');
      else if (targetRole === 'PROPRIETARIO' || targetRole === 'GERENTE') setViewMode('WEBADMIN');
    } else {
      // Create mock profile if no user exists for that role
      const tempUser: User = {
        id: `sim-${targetRole.toLowerCase()}-${Date.now()}`,
        tenantId: activeShopId,
        role: targetRole,
        name: `Simulação ${targetRole}`,
        whatsapp: '(11) 98888-0000',
        createdAt: new Date().toISOString()
      };
      setUsers(prev => [tempUser, ...prev]);
      setCurrentUserId(tempUser.id);
      if (targetRole === 'CLIENTE') setViewMode('CLIENT_APP');
      else if (targetRole === 'PROFISSIONAL') setViewMode('PROFISSIONAL_APP');
      else if (targetRole === 'PROPRIETARIO' || targetRole === 'GERENTE') setViewMode('WEBADMIN');
    }
  };

  const stopImpersonation = () => {
    setIsImpersonating(false);
    const superAdmin = users.find(u => u.role === 'SUPER_ADMIN') || (impersonationOriginUserId ? users.find(u => u.id === impersonationOriginUserId) : null);
    if (superAdmin) {
      setCurrentUserId(superAdmin.id);
    }
    setImpersonationOriginUserId(null);
    setViewMode('MASTER_ADMIN');

    addAuditLog({
      actorUserId: 'user-super-admin',
      actorUserName: 'Carlos Silva (Dono My Barber)',
      actorRole: 'SUPER_ADMIN',
      action: 'VISUALIZAR_COMO_ENCERRADO',
      details: `Encerrada simulação de experiência. Retorno seguro ao Painel Carlos Silva.`,
      status: 'SUCESSO'
    });
  };

  // IAM & Custom Claims (RBAC Soberano / Multi-tenant)
  const refreshClaims = async (): Promise<AuthUserClaims | null> => {
    const currentFbUser = getFirebaseCurrentUser();
    if (!currentFbUser) {
      setAuthClaims(null);
      return null;
    }
    const updated = await refreshAuthClaimsSafely(currentFbUser);
    setAuthClaims(updated);
    return updated;
  };

  const changeUserRoleWithClaims = async (
    targetUid: string,
    newRole: CanonicalRole | UserRole,
    tenantId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const idToken = await getIdTokenFromCurrentUser(true);
      if (!idToken) {
        return { success: false, error: 'Usuário não autenticado no Firebase Authentication.' };
      }

      const canonicalRole = toCanonicalRole(newRole);
      const res = await fetch('/api/auth/set-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          targetUid,
          role: canonicalRole,
          tenantId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Erro ao atualizar permissões no servidor.' };
      }

      await refreshClaims();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha de comunicação com o servidor de autorização.' };
    }
  };

  const loadHistoricalAppointments = async (options?: {
    tenantId?: string;
    startDate?: string;
    endDate?: string;
    limitCount?: number;
  }): Promise<Appointment[]> => {
    const tId = options?.tenantId || activeTenantId;
    const fetched = await fetchHistoricalAppointments({
      tenantId: tId,
      startDate: options?.startDate,
      endDate: options?.endDate,
      limitCount: options?.limitCount
    });

    if (fetched.length > 0) {
      setAppointments(prev => {
        const map = new Map<string, Appointment>();
        prev.forEach(a => map.set(a.id, a));
        fetched.forEach(a => map.set(a.id, a));
        return Array.from(map.values());
      });
    }
    return fetched;
  };

  const loadTenantDataForAdmin = async (targetTenantId: string): Promise<void> => {
    if (!targetTenantId) return;
    try {
      const [servicesSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, 'services'), where('tenantId', '==', targetTenantId))),
        getDocs(query(collection(db, 'users'), where('tenantId', '==', targetTenantId)))
      ]);

      const loadedServices = servicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Service));
      const loadedUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));

      setServices(prev => {
        const others = prev.filter(s => s.tenantId !== targetTenantId);
        return [...others, ...loadedServices];
      });

      setUsers(prev => {
        const others = prev.filter(u => u.tenantId !== targetTenantId);
        return [...others, ...loadedUsers];
      });
    } catch (err) {
      console.error('[loadTenantDataForAdmin] Erro ao carregar dados do tenant:', err);
    }
  };

  return (
    <AppContext.Provider
      value={{
        isInitialLoading,
        viewMode,
        setViewMode,
        getBarbershopDirectUrl,
        getBarbershopExclusiveDomain,
        authenticatedUser,
        loginWithCredentials,
        logout,
        activeTenantId,
        setActiveTenantId,
        currentBarbershop,
        updateBarbershop,
        barbershops,
        registerBarbershop,
        deleteBarbershop,
        toggleBarbershopStatus,
        auditLogs,
        addAuditLog,
        currentUser,
        setCurrentUserId,
        setCurrentUserIdWithRoute,
        users,
        tenantUsers,
        professionals,
        clients,
        services: tenantServices,
        allServices: services,
        schedules,
        appointments: tenantAppointments,
        allAppointments: appointments,
        waitlist: tenantWaitlist,
        packages: tenantPackages,
        customerPackages: tenantCustomerPackages,
        raffles: tenantRaffles,
        promotions: tenantPromotions,
        communications: tenantCommunications,
        stock: tenantStock,
        returnMessages: tenantReturnMessages,
        galleryWorks: tenantGalleryWorks,
        addGalleryWork,
        updateGalleryWork,
        deleteGalleryWork,
        likeGalleryWork,
        uploadMedia,
        addAppointment,
        bookOnlineAppointment,
        rescheduleAppointment,
        cancelAppointment,
        updateAppointmentStatus,
        addToWaitlist,
        createRaffle,
        updateRaffle,
        executeRaffle,
        deleteRaffle,
        participateInRaffle,
        isClientEligibleForRaffle,
        createPromotion,
        updatePromotion,
        togglePromotionActive,
        deletePromotion,
        usePackageItem,
        addService,
        updateService,
        updateUser,
        addProfessional,
        updateProfessional,
        deleteProfessional,
        updateStockQuantity,
        addStockItem,
        updateStockItem,
        createCommunication,
        sendReturnMessage,
        whatsappLoginPhone,
        loginWithWhatsApp,
        loginWithGoogle,
        createManagerAccess,
        createProfessionalAccess,
        logoutClient,
        isImpersonating,
        impersonationOriginUserId,
        startImpersonation,
        stopImpersonation,
        // SaaS Custom Plans Management
        customPlans,
        createCustomPlan,
        updateCustomPlan,
        togglePlanStatus,
        duplicateCustomPlan,
        // Recurring Subscriptions
        subscriptions,
        subscriptionsLoading,
        subscriptionsError,
        subscriptionPayments,
        currentSubscription,
        isPastDue,
        isSuspended,
        toleranceDaysRemaining,
        createSubscription,
        createLifetimeCheckout,
        activateLifetimeLicense,
        cancelSubscription,
        syncSubscription,
        simulateSubscriptionAction,
        // Color Mode Dark / Light
        colorMode,
        setColorMode,
        toggleColorMode,
        // IAM & Custom Claims
        authClaims,
        refreshClaims,
        changeUserRoleWithClaims,
        // Projeções Públicas Blindadas
        publicAvailability,
        publicProfessionals,
        publicServices,
        publicSchedules,
        publicCommunications,
        publicRaffles,
        publicBarbershops,
        publicPackages,
        publicPromotions,
        publicGalleryWorks,
        // Isolamento de Leitura e Consultas Sob Demanda (FASE 2.2B)
        loadHistoricalAppointments,
        loadTenantDataForAdmin
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
