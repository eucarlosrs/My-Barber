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
  AuditLog
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
  INITIAL_AUDIT_LOGS
} from '../data/initialData';
import { isTimeSlotAvailable, timeToMinutes, minutesToTime } from '../utils/scheduleEngine';
import {
  seedFirestoreIfEmpty,
  subscribeCollection,
  syncDoc,
  deleteDocFromDb
} from '../lib/firestoreSync';
import { uploadImageToStorage } from '../lib/storage';

export type AppViewMode = 'LOGIN' | 'ARCHITECTURE' | 'MASTER_ADMIN' | 'WEBADMIN' | 'CLIENT_APP' | 'PROFISSIONAL_APP' | 'DISCOVERY';

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
  registerBarbershop: (input: RegisterBarbershopInput) => { success: boolean; barbershopId: string; error?: string };
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
  rescheduleAppointment: (appointmentId: string, newDate: string, newStartTime: string, newEndTime: string) => { success: boolean; error?: string };
  cancelAppointment: (appointmentId: string) => void;
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

  usePackageItem: (customerPackageId: string, itemId: string) => boolean;
  addService: (service: Omit<Service, 'id'>) => void;
  updateService: (serviceId: string, data: Partial<Service>) => void;
  addProfessional: (user: Omit<User, 'id' | 'createdAt'>) => { success: boolean; error?: string };
  updateProfessional: (profId: string, data: Partial<User>) => void;
  deleteProfessional: (profId: string) => { success: boolean; error?: string };
  updateStockQuantity: (id: string, delta: number) => void;
  addStockItem: (item: Omit<StockItem, 'id' | 'tenantId'>) => void;
  updateStockItem: (stockId: string, data: Partial<StockItem>) => void;
  createCommunication: (comm: Omit<CommunicationMessage, 'id' | 'sentAt' | 'logs'>) => void;
  sendReturnMessage: (returnId: string) => void;

  // Client Google Authentication with WhatsApp & Birth Date
  whatsappLoginPhone: string;
  loginWithWhatsApp: (phone: string, name?: string) => User;
  loginWithGoogle: (data: { googleId?: string; email: string; name: string; avatarUrl?: string; whatsapp: string; birthDate: string }) => User;
  logoutClient: () => void;

  // Access Hierarchy: Master creates Owner/Manager, Manager creates Professional
  createManagerAccess: (data: { tenantId: string; name: string; email: string; whatsapp: string; role: 'PROPRIETARIO' | 'GERENTE'; avatarUrl?: string; birthDate?: string }) => { success: boolean; error?: string; user?: User };
  createProfessionalAccess: (data: Omit<User, 'id' | 'createdAt'>) => { success: boolean; error?: string; user?: User };

  // Super Admin Exclusive: Impersonation / "Visualizar como Usuário"
  isImpersonating: boolean;
  impersonationOriginUserId: string | null;
  startImpersonation: (targetRole: UserRole, targetTenantId?: string, specificUserId?: string) => void;
  stopImpersonation: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(() => {
    try {
      const savedId = localStorage.getItem('mybarber_session_user_id');
      if (savedId) {
        return INITIAL_USERS.find(u => u.id === savedId) || null;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [viewMode, setViewMode] = useState<AppViewMode>(() => {
    const urlTenant = getInitialTenantFromUrl();
    if (urlTenant) {
      return 'CLIENT_APP';
    }
    try {
      const savedId = localStorage.getItem('mybarber_session_user_id');
      if (savedId) {
        const u = INITIAL_USERS.find(user => user.id === savedId);
        if (u) {
          if (u.role === 'SUPER_ADMIN') return 'MASTER_ADMIN';
          if (u.role === 'PROPRIETARIO' || u.role === 'GERENTE') return 'WEBADMIN';
          if (u.role === 'PROFISSIONAL') return 'PROFISSIONAL_APP';
          if (u.role === 'CLIENTE') return 'CLIENT_APP';
        }
      }
    } catch {
      // ignore
    }
    return 'CLIENT_APP';
  });

  const [barbershops, setBarbershops] = useState<Barbershop[]>(INITIAL_BARBERSHOPS);
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
      const savedUserId = localStorage.getItem('mybarber_session_user_id');
      if (savedUserId) {
        const u = INITIAL_USERS.find(user => user.id === savedUserId);
        if (u && u.tenantId && u.tenantId !== 'platform-global') {
          return u.tenantId;
        }
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

  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem('mybarber_session_user_id');
      if (savedId) return savedId;
    } catch {
      // ignore
    }
    return INITIAL_USERS[0].id;
  });

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
  const [whatsappLoginPhone, setWhatsappLoginPhone] = useState<string>('');
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  // Impersonation state (Super Admin exclusive)
  const [isImpersonating, setIsImpersonating] = useState<boolean>(false);
  const [impersonationOriginUserId, setImpersonationOriginUserId] = useState<string | null>(null);

  // Current Barbershop (memoized for rock-solid stability)
  const currentBarbershop = useMemo(() => {
    return barbershops.find(b => b.id === activeTenantId) || barbershops[0];
  }, [barbershops, activeTenantId]);

  // Current User (memoized for rock-solid stability)
  const currentUser = useMemo(() => {
    return users.find(u => u.id === currentUserId) || users[0];
  }, [users, currentUserId]);

  // Tenant-scoped users
  const tenantUsers = users.filter(u => u.tenantId === activeTenantId);
  const professionals = tenantUsers.filter(u => u.role === 'PROFISSIONAL');
  const clients = tenantUsers.filter(u => u.role === 'CLIENTE');

  // Tenant-scoped collections
  const tenantServices = services.filter(s => s.tenantId === activeTenantId);
  const tenantAppointments = appointments.filter(a => a.tenantId === activeTenantId);
  const tenantWaitlist = waitlist.filter(w => w.tenantId === activeTenantId);
  const tenantPackages = packages.filter(p => p.tenantId === activeTenantId);
  const tenantCustomerPackages = customerPackages.filter(cp => cp.tenantId === activeTenantId);
  const tenantRaffles = raffles.filter(r => r.tenantId === activeTenantId);
  const tenantPromotions = promotions.filter(p => p.tenantId === activeTenantId);
  const tenantCommunications = communications.filter(c => c.tenantId === activeTenantId);
  const tenantStock = stock.filter(s => s.tenantId === activeTenantId);
  const tenantReturnMessages = returnMessages.filter(r => r.tenantId === activeTenantId);
  const tenantGalleryWorks = galleryWorks.filter(g => g.tenantId === activeTenantId);

  // Real-time Firestore synchronization and initial seeding
  useEffect(() => {
    seedFirestoreIfEmpty();

    let loadedCount = 0;
    const requiredLoads = 3; // barbershops, users, services
    const checkInitialReady = () => {
      loadedCount++;
      if (loadedCount >= requiredLoads) {
        setIsInitialLoading(false);
      }
    };

    // Safety timeout: never let loading hang longer than 600ms
    const safetyTimeout = setTimeout(() => {
      setIsInitialLoading(false);
    }, 600);

    const unsubBarbershops = subscribeCollection<Barbershop>('barbershops', setBarbershops, INITIAL_BARBERSHOPS, checkInitialReady);
    const unsubUsers = subscribeCollection<User>('users', setUsers, INITIAL_USERS, checkInitialReady);
    const unsubServices = subscribeCollection<Service>('services', setServices, INITIAL_SERVICES, checkInitialReady);
    const unsubSchedules = subscribeCollection<ProfessionalScheduleConfig>('schedules', setSchedules, INITIAL_SCHEDULES);
    const unsubAppointments = subscribeCollection<Appointment>('appointments', setAppointments, INITIAL_APPOINTMENTS);
    const unsubWaitlist = subscribeCollection<WaitlistEntry>('waitlist', setWaitlist, INITIAL_WAITLIST);
    const unsubPackages = subscribeCollection<ServicePackage>('packages', setPackages, INITIAL_PACKAGES);
    const unsubCustomerPackages = subscribeCollection<CustomerPackage>('customerPackages', setCustomerPackages, INITIAL_CUSTOMER_PACKAGES);
    const unsubRaffles = subscribeCollection<Raffle>('raffles', setRaffles, INITIAL_RAFFLES);
    const unsubPromotions = subscribeCollection<Promotion>('promotions', setPromotions, INITIAL_PROMOTIONS);
    const unsubCommunications = subscribeCollection<CommunicationMessage>('communications', setCommunications, INITIAL_COMMUNICATIONS);
    const unsubStock = subscribeCollection<StockItem>('stock', setStock, INITIAL_STOCK);
    const unsubReturnMessages = subscribeCollection<ReturnMessage>('returnMessages', setReturnMessages, INITIAL_RETURN_MESSAGES);
    const unsubGallery = subscribeCollection<GalleryWork>('gallery', setGalleryWorks, INITIAL_GALLERY_WORKS);
    const unsubAuditLogs = subscribeCollection<AuditLog>('audit_logs', setAuditLogs, INITIAL_AUDIT_LOGS);

    return () => {
      clearTimeout(safetyTimeout);
      unsubBarbershops();
      unsubUsers();
      unsubServices();
      unsubSchedules();
      unsubAppointments();
      unsubWaitlist();
      unsubPackages();
      unsubCustomerPackages();
      unsubRaffles();
      unsubPromotions();
      unsubCommunications();
      unsubStock();
      unsubReturnMessages();
      unsubGallery();
      unsubAuditLogs();
    };
  }, []);

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
        try {
          const savedUserId = localStorage.getItem('mybarber_session_user_id');
          const u = users.find(user => user.id === savedUserId);
          if (!u || u.role === 'CLIENTE') {
            setViewMode('CLIENT_APP');
          }
        } catch {
          setViewMode('CLIENT_APP');
        }
      }
    }
  }, [barbershops]);

  // Audit logging helper
  const addAuditLog = (log: Omit<AuditLog, 'id' | 'timestamp'>) => {
    const newLog: AuditLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    syncDoc('audit_logs', newLog.id, newLog);
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

    // Validação estrita de segurança para acesso Master (Carlos Silva)
    if (clean === 'carlosrs.email@gmail.com') {
      if (_password !== 'Ca.753268') {
        return {
          success: false,
          error: 'Senha incorreta para acesso Master (Carlos Silva).'
        };
      }
      const superAdmin = users.find(u => u.role === 'SUPER_ADMIN') || INITIAL_USERS[0];
      setAuthenticatedUser(superAdmin);
      setCurrentUserId(superAdmin.id);
      try {
        localStorage.setItem('mybarber_session_user_id', superAdmin.id);
      } catch {
        // ignore
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
      return { success: true, role: 'SUPER_ADMIN', user: superAdmin };
    }

    // Search matching user in users list
    let matched = users.find(u => 
      (u.email && u.email.toLowerCase() === clean) ||
      (u.whatsapp && cleanDigits.length >= 8 && u.whatsapp.replace(/\D/g, '').endsWith(cleanDigits.slice(-8))) ||
      u.id.toLowerCase() === clean ||
      u.name.toLowerCase() === clean
    );

    // If client with phone doesn't exist yet, auto-register as client
    if (!matched && cleanDigits.length >= 8) {
      const isEmail = identifier.includes('@');
      matched = {
        id: `user-client-${Date.now()}`,
        tenantId: activeTenantId,
        role: 'CLIENTE',
        name: isEmail ? identifier.split('@')[0] : 'Cliente',
        email: isEmail ? identifier.trim().toLowerCase() : undefined,
        whatsapp: identifier.trim(),
        createdAt: new Date().toISOString()
      };
      setUsers(prev => [...prev, matched!]);
      syncDoc('users', matched.id, matched);
    }

    if (!matched) {
      return {
        success: false,
        error: 'Nenhuma conta encontrada com este e-mail ou WhatsApp. Verifique os dados ou utilize uma das contas de teste rápido.'
      };
    }

    setAuthenticatedUser(matched);
    setCurrentUserId(matched.id);
    try {
      localStorage.setItem('mybarber_session_user_id', matched.id);
    } catch {
      // ignore
    }

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

    return { success: true, role: matched.role, user: matched };
  };

  const logout = () => {
    const prev = authenticatedUser;
    setAuthenticatedUser(null);
    try {
      localStorage.removeItem('mybarber_session_user_id');
    } catch {
      // ignore
    }
    setIsImpersonating(false);
    setImpersonationOriginUserId(null);
    setViewMode('LOGIN');

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
    setBarbershops(prev => prev.map(b => b.id === barbershopId ? updated : b));
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
    }
    setBarbershops(prev =>
      prev.map(b => (b.id === shopIdToUpdate ? { ...b, ...updated } : b))
    );
  };

  const addAppointment = (newApp: Omit<Appointment, 'id' | 'createdAt' | 'reminderSent'>): { success: boolean; error?: string } => {
    // REGRA FUNDAMENTAL DO MY BARBER: O CLIENTE SÓ PODE AGENDAR SERVIÇOS CADASTRADOS PELA BARBEARIA
    const srv = services.find(s => s.id === newApp.serviceId);
    if (!srv) {
      return {
        success: false,
        error: 'O serviço selecionado não pertence a este estabelecimento ou não está cadastrado.'
      };
    }

    if (newApp.tenantId && srv.tenantId !== newApp.tenantId) {
      return {
        success: false,
        error: 'Inconsistência de estabelecimento: o serviço não pertence a esta barbearia.'
      };
    }

    // A duração utilizada no cálculo e no agendamento é estritamente a duração oficial cadastrada do serviço
    const officialDuration = srv.durationMinutes;

    // REGRA FUNDAMENTAL DO MY BARBER: Validação estrita de disponibilidade e jornada
    if (!newApp.isEncaixe) {
      const sched = schedules.find(s => s.professionalId === newApp.professionalId);

      const validation = isTimeSlotAvailable({
        date: newApp.date,
        startTime: newApp.startTime,
        durationMinutes: officialDuration > 0 ? officialDuration : 30,
        professionalId: newApp.professionalId,
        scheduleConfig: sched,
        existingAppointments: appointments,
        isEncaixe: false
      });

      if (!validation.available) {
        return {
          success: false,
          error: validation.reason || 'Este horário não está mais disponível para o profissional selecionado.'
        };
      }
    }

    const startMins = timeToMinutes(newApp.startTime);
    const computedEnd = minutesToTime(startMins + officialDuration);

    const created: Appointment = {
      ...newApp,
      serviceName: srv.name,
      servicePrice: srv.price,
      serviceDuration: officialDuration,
      endTime: newApp.endTime || computedEnd,
      id: `apt-${Date.now()}`,
      createdAt: new Date().toISOString(),
      reminderSent: false
    };

    syncDoc('appointments', created.id, created);
    setAppointments(prev => [created, ...prev]);
    return { success: true };
  };

  const rescheduleAppointment = (
    appointmentId: string,
    newDate: string,
    newStartTime: string,
    newEndTime: string
  ): { success: boolean; error?: string } => {
    const apt = appointments.find(a => a.id === appointmentId);
    if (!apt) {
      return { success: false, error: 'Agendamento não encontrado.' };
    }

    const srv = services.find(s => s.id === apt.serviceId);
    const officialDuration = srv?.durationMinutes || apt.serviceDuration || 30;
    const sched = schedules.find(s => s.professionalId === apt.professionalId);

    const validation = isTimeSlotAvailable({
      date: newDate,
      startTime: newStartTime,
      durationMinutes: officialDuration > 0 ? officialDuration : 30,
      professionalId: apt.professionalId,
      scheduleConfig: sched,
      existingAppointments: appointments,
      excludeAppointmentId: appointmentId,
      isEncaixe: apt.isEncaixe
    });

    if (!validation.available) {
      return {
        success: false,
        error: validation.reason || 'O novo horário selecionado não está disponível.'
      };
    }

    const startMins = timeToMinutes(newStartTime);
    const computedEnd = minutesToTime(startMins + officialDuration);

    const updated: Appointment = {
      ...apt,
      date: newDate,
      startTime: newStartTime,
      endTime: computedEnd,
      reminderSent: false
    };

    syncDoc('appointments', appointmentId, updated);
    setAppointments(prev => prev.map(a => (a.id === appointmentId ? updated : a)));
    return { success: true };
  };

  const cancelAppointment = (appointmentId: string) => {
    const apt = appointments.find(a => a.id === appointmentId);
    if (apt) {
      syncDoc('appointments', appointmentId, { ...apt, status: 'CANCELADO' });
    }
    setAppointments(prev =>
      prev.map(a => (a.id === appointmentId ? { ...a, status: 'CANCELADO' } : a))
    );
  };

  const updateAppointmentStatus = (appointmentId: string, status: AppointmentStatus) => {
    const apt = appointments.find(a => a.id === appointmentId);
    if (apt) {
      syncDoc('appointments', appointmentId, { ...apt, status });
    }
    setAppointments(prev =>
      prev.map(a => (a.id === appointmentId ? { ...a, status } : a))
    );
  };

  const addToWaitlist = (entry: Omit<WaitlistEntry, 'id' | 'createdAt' | 'status'>) => {
    const created: WaitlistEntry = {
      ...entry,
      id: `wait-${Date.now()}`,
      status: 'AGUARDANDO',
      createdAt: new Date().toISOString()
    };
    syncDoc('waitlist', created.id, created);
    setWaitlist(prev => [created, ...prev]);
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

  // Promoções
  const createPromotion = (promoData: Omit<Promotion, 'id' | 'createdAt'>) => {
    const newPromo: Promotion = {
      ...promoData,
      id: `promo-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setPromotions(prev => [newPromo, ...prev]);
  };

  const updatePromotion = (promoId: string, promoData: Partial<Promotion>) => {
    setPromotions(prev =>
      prev.map(p => (p.id === promoId ? { ...p, ...promoData } : p))
    );
  };

  const togglePromotionActive = (promoId: string) => {
    setPromotions(prev =>
      prev.map(p => (p.id === promoId ? { ...p, active: !p.active } : p))
    );
  };

  const deletePromotion = (promoId: string) => {
    setPromotions(prev => prev.filter(p => p.id !== promoId));
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
      const merged = { ...target, ...data };
      syncDoc('users', profId, merged);
    }
    setUsers(updatedUsers.map(u => (u.id === profId ? { ...u, ...data } : u)));
  };

  const deleteProfessional = (profId: string) => {
    if (professionals.length <= 1) {
      return { success: false, error: 'A barbearia deve manter ao menos 1 profissional ativo.' };
    }
    deleteDocFromDb('users', profId);
    setUsers(prev => prev.filter(u => u.id !== profId));
    return { success: true };
  };

  const usePackageItem = (customerPackageId: string, itemId: string): boolean => {
    let success = false;
    setCustomerPackages(prev =>
      prev.map(cp => {
        if (cp.id === customerPackageId) {
          const updatedItems = cp.items.map(item => {
            if (item.itemId === itemId && item.usedQuantity < item.totalQuantity) {
              success = true;
              return { ...item, usedQuantity: item.usedQuantity + 1 };
            }
            return item;
          });
          return { ...cp, items: updatedItems };
        }
        return cp;
      })
    );
    return success;
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

  const addProfessional = (userData: Omit<User, 'id' | 'createdAt'>) => {
    const currentStaff = tenantUsers.filter(
      u => u.role === 'PROFISSIONAL' || u.role === 'PROPRIETARIO' || u.role === 'GERENTE'
    );
    const planConfig = MY_BARBER_PLANS[currentBarbershop.planId] || Object.values(MY_BARBER_PLANS)[0];
    if (currentStaff.length >= planConfig.maxProfessionals) {
      return {
        success: false,
        error: `Limite de equipe do ${planConfig.name} atingido (${currentStaff.length}/${planConfig.maxProfessionals} membros cadastrados, incluindo proprietário, gerente e profissionais).`
      };
    }

    // Regra Seção 7: Se este profissional for marcado com canViewAllProfessionals, desmarca os outros
    let updatedUsers = [...users];
    if (userData.canViewAllProfessionals) {
      updatedUsers = updatedUsers.map(u =>
        u.tenantId === activeTenantId && u.role === 'PROFISSIONAL'
          ? { ...u, canViewAllProfessionals: false }
          : u
      );
    }

    const newUser: User = {
      ...userData,
      id: `user-prof-${Date.now()}`,
      createdAt: new Date().toISOString()
    };

    syncDoc('users', newUser.id, newUser);
    setUsers([...updatedUsers, newUser]);
    return { success: true };
  };

  const updateStockQuantity = (id: string, delta: number) => {
    setStock(prev =>
      prev.map(item => {
        if (item.id === id) {
          const newQty = Math.max(0, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
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
      const merged = { ...target, ...data };
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
  }): User => {
    const cleanPhone = data.whatsapp.trim();
    const cleanEmail = data.email.trim().toLowerCase();
    
    // Check if client already exists globally across the platform by Google ID, email, or WhatsApp
    let client = users.find(
      u =>
        u.role === 'CLIENTE' &&
        ((data.googleId && u.googleId === data.googleId) ||
         (cleanEmail && u.email?.toLowerCase() === cleanEmail) ||
         (cleanPhone && u.whatsapp && cleanPhone.replace(/\D/g, '').length >= 8 && u.whatsapp.replace(/\D/g, '') === cleanPhone.replace(/\D/g, '')))
    );

    if (client) {
      // Update missing client info if provided, keeping global identity intact
      const updatedClient: User = {
        ...client,
        name: data.name.trim() || client.name,
        email: cleanEmail || client.email,
        whatsapp: cleanPhone || client.whatsapp,
        birthDate: data.birthDate || client.birthDate,
        avatarUrl: data.avatarUrl || client.avatarUrl,
        googleId: data.googleId || client.googleId || `google-usr-${Date.now()}`,
        authProvider: 'GOOGLE'
      };

      setUsers(prev => prev.map(u => (u.id === client!.id ? updatedClient : u)));
      syncDoc('users', updatedClient.id, updatedClient);
      client = updatedClient;
    } else {
      // Create new global client via Google login
      client = {
        id: `user-client-google-${Date.now()}`,
        tenantId: activeTenantId,
        role: 'CLIENTE',
        name: data.name.trim(),
        email: cleanEmail,
        whatsapp: cleanPhone,
        birthDate: data.birthDate,
        avatarUrl: data.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
        googleId: data.googleId || `google-usr-${Date.now()}`,
        authProvider: 'GOOGLE',
        createdAt: new Date().toISOString()
      };
      syncDoc('users', client.id, client);
      setUsers(prev => [...prev, client!]);
    }

    setCurrentUserId(client.id);
    setAuthenticatedUser(client);
    setWhatsappLoginPhone(cleanPhone);
    try {
      localStorage.setItem('mybarber_session_user_id', client.id);
    } catch {
      // ignore
    }
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

    const currentStaff = users.filter(
      u => u.tenantId === data.tenantId && (u.role === 'PROFISSIONAL' || u.role === 'PROPRIETARIO' || u.role === 'GERENTE')
    );
    const planConfig = MY_BARBER_PLANS[targetShop.planId] || Object.values(MY_BARBER_PLANS)[0];
    if (currentStaff.length >= planConfig.maxProfessionals) {
      return {
        success: false,
        error: `Limite de equipe do plano atingido (${currentStaff.length}/${planConfig.maxProfessionals} membros cadastrados para ${targetShop.name}).`
      };
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
    setAuthenticatedUser(null);
    try {
      localStorage.removeItem('mybarber_session_user_id');
    } catch {
      // ignore
    }
    setWhatsappLoginPhone('');
    setViewMode('CLIENT_APP');
  };

  const registerBarbershop = (input: RegisterBarbershopInput) => {
    const newTenantId = `tenant-${Date.now()}`;
    const newBarbershop: Barbershop = {
      id: newTenantId,
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
        instagram: `@${input.slug.replace(/-/g, '')}`,
        facebook: input.name
      },
      planId: input.planId,
      reminderConfig: {
        advanceMinutes: 60,
        enabled: true,
        whatsappTemplate: `Olá {cliente}! Lembrete do seu agendamento na ${input.name} hoje às {horario} com {profissional}.`
      },
      createdAt: new Date().toISOString()
    };

    // Create the designated Manager or Owner
    const newManager: User = {
      id: `user-mgr-${Date.now()}`,
      tenantId: newTenantId,
      role: input.managerRole,
      name: input.managerName.trim(),
      email: input.managerEmail?.trim(),
      whatsapp: input.managerWhatsApp.trim(),
      avatarUrl: input.managerAvatarUrl?.trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
      canViewAllProfessionals: true,
      commissionPercentage: 50,
      createdAt: new Date().toISOString()
    };

    // Default professional (can also be the owner/manager or a barber)
    const initialBarber: User = {
      id: `user-prof-${Date.now() + 1}`,
      tenantId: newTenantId,
      role: 'PROFISSIONAL',
      name: `Barbeiro Oficial (${input.managerName.split(' ')[0]})`,
      whatsapp: input.managerWhatsApp.trim(),
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
      canViewAllProfessionals: false,
      commissionPercentage: 45,
      specialties: ['Degradê Navalhado', 'Barba Terapia', 'Pigmentação'],
      createdAt: new Date().toISOString()
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

    setBarbershops(prev => [...prev, newBarbershop]);
    setUsers(prev => [...prev, newManager, initialBarber]);
    setServices(prev => [...prev, ...defaultServices]);
    setStock(prev => [...prev, ...defaultStock]);

    // Persist permanently to Firestore
    syncDoc('barbershops', newBarbershop.id, newBarbershop);
    syncDoc('users', newManager.id, newManager);
    syncDoc('users', initialBarber.id, initialBarber);
    defaultServices.forEach(srv => syncDoc('services', srv.id, srv));
    defaultStock.forEach(stk => syncDoc('stock', stk.id, stk));

    addAuditLog({
      actorUserId: currentUser.id,
      actorUserName: currentUser.name,
      actorRole: currentUser.role,
      action: 'CADASTRO_BARBEARIA',
      targetTenantId: newTenantId,
      targetTenantName: input.name,
      details: `Nova barbearia cadastrada com plano fixo R$ 49,90/mês. Gestor inicial: ${input.managerName} (${input.managerRole}).`,
      status: 'SUCESSO'
    });

    return { success: true, barbershopId: newTenantId };
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

    setBarbershops(prev => prev.filter(b => b.id !== barbershopId));
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
    setGalleryWorks(prev => [newWork, ...prev]);
  };

  const updateGalleryWork = (workId: string, updates: Partial<GalleryWork>) => {
    const target = galleryWorks.find(w => w.id === workId);
    if (target) {
      const updated = { ...target, ...updates };
      syncDoc('gallery', workId, updated);
      setGalleryWorks(prev => prev.map(w => w.id === workId ? updated : w));
    }
  };

  const deleteGalleryWork = (workId: string) => {
    deleteDocFromDb('gallery', workId);
    setGalleryWorks(prev => prev.filter(w => w.id !== workId));
  };

  const likeGalleryWork = (workId: string) => {
    const target = galleryWorks.find(w => w.id === workId);
    if (target) {
      const updated = { ...target, likesCount: target.likesCount + 1 };
      syncDoc('gallery', workId, updated);
      setGalleryWorks(prev => prev.map(w => w.id === workId ? updated : w));
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
        addProfessional,
        updateProfessional,
        deleteProfessional,
        updateStockQuantity,
        addStockItem,
        updateStockItem,
        createCommunication,
        sendReturnMessage,
        whatsappLoginPhone,
        loginWithGoogle,
        createManagerAccess,
        createProfessionalAccess,
        logoutClient,
        isImpersonating,
        impersonationOriginUserId,
        startImpersonation,
        stopImpersonation
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
