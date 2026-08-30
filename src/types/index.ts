/**
 * MY BARBER — Definições de Tipos e Modelos de Dados
 * Estrutura estritamente alinhada às regras do documento mestre.
 */

// ==========================================
// 1. PLANOS E ASSINATURAS RECORRENTES SAAS (Módulo de Planos & Mercado Pago)
// ==========================================
export type PlanId = 'PLANO_UNICO' | string;

export type PlanBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export interface PlanBillingScheduleStage {
  id: string;
  order: number;
  name: string; // Ex: "Período Gratuito", "Promoção de Lançamento", "Preço Normal"
  duration: number; // Ex: 14 (dias) ou 3 (meses)
  unit: 'DAYS' | 'MONTHS' | 'CYCLES' | 'INDEFINITE';
  price: number; // 0.00, 49.90, 99.90...
}

export interface PlanFeatures {
  agenda: boolean;
  clientes: boolean;
  profissionais: boolean;
  servicos: boolean;
  pacotes: boolean;
  comunicacoes: boolean;
  promocoes: boolean;
  sorteios: boolean;
  galeria: boolean;
  estoque: boolean;
  relatorios_financeiros: boolean;
}

export interface PlanLimits {
  maxProfessionals: number | 'UNLIMITED';
  maxUnits: number | 'UNLIMITED';
  maxClients: number | 'UNLIMITED';
}

export interface CustomPlan {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  priceMonthly: number; // Preço regular base
  billingCycle: PlanBillingCycle; // 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'
  
  // Período Gratuito
  hasTrial: boolean;
  trialDuration: number;
  trialUnit: 'DAYS' | 'MONTHS';

  // Promoção
  hasPromotion: boolean;
  promotionalPrice?: number;
  promotionDuration?: number;
  promotionUnit?: 'MONTHS' | 'CYCLES';
  priceAfterPromotion?: number;

  // Cronograma Calculado
  scheduleStages: PlanBillingScheduleStage[];

  // Funcionalidades Habilitadas
  features: PlanFeatures;

  // Limites
  limits: PlanLimits;

  // Mercado Pago
  mercadopagoPlanId?: string;
  subscribersCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanConfig {
  id: PlanId;
  name: string;
  minProfessionals: number;
  maxProfessionals: number;
  priceMonthly: number; // R$ 49,90 fixo
  description: string;
}

export const MY_BARBER_PLANS: Record<string, PlanConfig> = {
  PLANO_UNICO: {
    id: 'PLANO_UNICO',
    name: 'Plano Único & Fixo',
    minProfessionals: 1,
    maxProfessionals: 10,
    priceMonthly: 49.90,
    description: 'Até 10 profissionais (incluindo proprietário, gerente e barbeiros) — R$ 49,90 por mês'
  }
};

// ==========================================
// 2. USUÁRIOS E PERMISSÕES (Seção 7)
// ==========================================
export type UserRole = 'SUPER_ADMIN' | 'PROPRIETARIO' | 'GERENTE' | 'PROFISSIONAL' | 'CLIENTE';

export interface User {
  id: string;
  tenantId: string;
  role: UserRole;
  name: string;
  username?: string; // Nome de usuário para login
  password?: string; // Senha para acesso
  email?: string;
  whatsapp: string; // Identificador principal
  avatarUrl?: string;
  birthDate?: string; // Formato YYYY-MM-DD para aniversariantes
  googleId?: string; // ID Google para login de clientes
  authProvider?: 'GOOGLE' | 'SYSTEM';
  createdByUserId?: string; // ID de quem criou este acesso (Dono do App -> Proprietário/Gerente -> Profissional)
  // Regra Seção 7: Profissional com visualização de todos
  canViewAllProfessionals?: boolean;
  commissionPercentage?: number; // Para profissionais
  specialties?: string[];
  specialty?: string;
  createdAt: string;
}

// ==========================================
// 3. BARBEARIA / TENANT (Seções 1, 2, 4, 25, 26)
// ==========================================
export interface BarbershopSocialMedia {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
}

export interface BarbershopAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface BarbershopReminderConfig {
  advanceMinutes: number; // Ex: 60, 120 minutos antes
  enabled: boolean;
  whatsappTemplate: string;
}

export interface BarbershopCoordinates {
  latitude: number;
  longitude: number;
}

export type BarbershopStatus = 'ATIVA' | 'TESTE' | 'TESTE_EXPIRADO' | 'INATIVA';

export type BarbershopThemeId = 'CURRENT' | 'GOLD' | 'BLUE' | 'NEON_GREEN';

export type ColorMode = 'dark' | 'light';

export interface DayBusinessHours {
  dayOfWeek: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  dayName: string;   // "Segunda-feira"
  shortDayName: string; // "Seg"
  isOpen: boolean;   // true = Aberto, false = Fechado
  // Antes do almoço (Turno Manhã)
  morningStart: string; // Ex: "08:30"
  morningEnd: string;   // Ex: "12:00"
  // Pausa para almoço
  hasLunchBreak: boolean; // Se há intervalo de almoço
  lunchStart: string;   // Ex: "12:00"
  lunchEnd: string;     // Ex: "13:30"
  // Depois do almoço (Turno Tarde/Noite)
  afternoonStart: string; // Ex: "13:30"
  afternoonEnd: string;   // Ex: "19:30"
}

export type WeeklyBusinessHours = DayBusinessHours[];

export interface Barbershop {
  id: string;
  name: string; // Ex: "Barbearia do João"
  slug: string; // Ex: "barbearia-do-joao"
  customDomain: string; // Ex: "www.barbeariadojoao.com.br"
  logoUrl: string;
  bannerUrl?: string; // Banner principal da barbearia
  salonImages: string[]; // Fotos do salão
  about: string; // Informações do estabelecimento
  phone: string;
  whatsapp: string;
  address: BarbershopAddress;
  coordinates?: BarbershopCoordinates;
  socialMedia: BarbershopSocialMedia;
  planId: PlanId;
  reminderConfig: BarbershopReminderConfig;
  businessHours?: WeeklyBusinessHours; // Horário de atendimento semanal da barbearia
  primaryColor?: string;
  theme?: BarbershopThemeId; // 'CURRENT' | 'GOLD' | 'BLUE' | 'NEON_GREEN'
  status?: BarbershopStatus | 'ACTIVE' | 'INACTIVE';
  commercialMode?: 'PAGO' | 'TESTE_GRATIS';
  trialStartedAt?: string; // Data e hora de início do teste grátis (ISO)
  trialExpiresAt?: string; // Data e hora de expiração do teste (ISO - 3 dias)
  createdAt: string;
}

export interface RegisterBarbershopInput {
  name: string;
  slug: string;
  customDomain: string;
  logoUrl: string;
  bannerUrl: string;
  salonImages?: string[];
  about: string;
  phone: string;
  whatsapp: string;
  theme?: BarbershopThemeId;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  planId: PlanId;
  commercialMode?: 'PAGO' | 'TESTE_GRATIS';
  // Login Principal (Proprietário ou Gerente)
  managerName: string;
  managerWhatsApp: string;
  managerEmail?: string;
  managerRole: 'PROPRIETARIO' | 'GERENTE';
  managerUsername?: string;
  managerPassword?: string;
  managerAvatarUrl?: string;
  // Login Adicional Opcional para Gerente (quando Proprietário adiciona Gerente)
  hasAdditionalManager?: boolean;
  additionalManagerName?: string;
  additionalManagerWhatsApp?: string;
  additionalManagerEmail?: string;
  additionalManagerUsername?: string;
  additionalManagerPassword?: string;
}

// ==========================================
// 4. SERVIÇOS (Seção 10)
// ==========================================
export interface Service {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  category: string;
  imageUrl?: string;
  returnReminderDays?: number; // Configuração para Seção 20
  commissionPercentage?: number;
  active: boolean;
}

// ==========================================
// 5. JORNADAS E HORÁRIOS (Seções 12, 13)
// ==========================================
export interface TimeShift {
  start: string; // "09:00"
  end: string;   // "18:00"
}

export interface WeeklyDaySchedule {
  dayOfWeek: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  dayName: string;
  enabled: boolean;
  shifts: TimeShift[];
}

export interface SchedulePeriodOverride {
  id: string;
  professionalId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  shifts: TimeShift[];
  reason?: string;
}

export interface ProfessionalScheduleConfig {
  professionalId: string;
  weeklySchedule: WeeklyDaySchedule[];
  periodOverrides: SchedulePeriodOverride[];
}

// ==========================================
// 6. AGENDAMENTOS E ENCAIXES (Seções 10, 14, 16)
// ==========================================
export type AppointmentStatus = 'AGENDADO' | 'CONCLUIDO' | 'CANCELADO' | 'NAO_COMPARECEU';

export interface Appointment {
  id: string;
  tenantId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDuration: number;
  professionalId: string;
  professionalName: string;
  clientId: string;
  clientName: string;
  clientWhatsApp: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  isEncaixe: boolean; // Seção 14: Encaixe fora da programação normal
  status: AppointmentStatus;
  notes?: string;
  reminderSent: boolean;
  reminderSentAt?: string;
  createdAt: string;
}

// ==========================================
// 7. LISTA DE ESPERA (Seção 19)
// ==========================================
export type PreferredTimeOfDay = 'MANHA' | 'TARDE' | 'NOITE' | 'QUALQUER';
export type WaitlistStatus = 'AGUARDANDO' | 'AVISADO' | 'AGENDADO' | 'EXPIRADO';

export interface WaitlistEntry {
  id: string;
  tenantId: string;
  clientId: string;
  clientName: string;
  clientWhatsApp: string;
  serviceId: string;
  serviceName: string;
  preferredProfessionalId?: string;
  preferredDate: string; // YYYY-MM-DD
  preferredTimeOfDay: PreferredTimeOfDay;
  notes?: string;
  status: WaitlistStatus;
  notifiedAt?: string;
  createdAt: string;
}

// ==========================================
// 8. PACOTES (Seção 17)
// ==========================================
export type PackageItemType = 'SERVICO' | 'PRODUTO';

export interface PackageItem {
  id: string;
  type: PackageItemType;
  itemId: string; // ID do serviço ou produto
  name: string;
  totalQuantity: number;
}

export interface ServicePackage {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  price: number;
  items: PackageItem[];
  active: boolean;
  createdAt: string;
}

export interface CustomerPackageItemUsage {
  itemId: string;
  name: string;
  type: PackageItemType;
  totalQuantity: number;
  usedQuantity: number; // Restantes = totalQuantity - usedQuantity
}

export interface CustomerPackage {
  id: string;
  tenantId: string;
  packageId: string;
  packageTitle: string;
  clientId: string;
  clientName: string;
  clientWhatsApp: string;
  purchaseDate: string;
  items: CustomerPackageItemUsage[];
}

// ==========================================
// 9. SORTEIOS (Seção 23)
// ==========================================
export type RaffleStatus = 'ATIVO' | 'REALIZADO' | 'CANCELADO';

export interface RaffleParticipant {
  clientId: string;
  clientName: string;
  clientWhatsApp: string;
  registeredAt: string;
  eligibleAppointmentDate: string; // Comprova agendamento nos últimos 2 meses
}

export interface Raffle {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  prize: string;
  drawDate: string; // YYYY-MM-DD
  imageUrl?: string;
  status: RaffleStatus;
  participants: RaffleParticipant[];
  winnerClientId?: string;
  winnerClientName?: string;
  winnerName?: string;
  winnerDrawnAt?: string;
  showInHighlights?: boolean;
  highlightTag?: string;
  createdAt: string;
}

// ==========================================
// 10. PROMOÇÕES DA BARBEARIA (Seção 15)
// ==========================================
export interface Promotion {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  discountPercentage?: number;
  discountPercent?: number;
  promotionalPrice?: number;
  serviceId?: string;
  serviceName?: string;
  serviceCategory?: string;
  code?: string;
  validUntil: string; // YYYY-MM-DD
  active: boolean;
  imageUrl?: string;
  bannerUrl?: string;
  showInHighlights?: boolean;
  highlightTag?: string; // Ex: "PROMOÇÃO", "GANHADOR", "NOVIDADE"
  createdAt: string;
}

// ==========================================
// 10.1 NOTÍCIAS E COMUNICADOS (Seção 15)
// ==========================================
export type CommunicationType = 'NOTICIA' | 'PROMOCAO' | 'EVENTO';
export type CommunicationChannel = 'APP' | 'SMS' | 'AMBOS';
export type CommunicationTarget = 'TODOS' | 'GRUPO_ESPECIFICO';

export interface CommunicationLog {
  clientId: string;
  clientName: string;
  clientWhatsApp: string;
  channel: 'APP' | 'SMS';
  received: boolean;
  receivedAt?: string;
  read: boolean;
  readAt?: string;
}

export interface CommunicationMessage {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  type: CommunicationType;
  channel: CommunicationChannel;
  target: CommunicationTarget;
  targetGroupName?: string;
  sentAt: string;
  logs: CommunicationLog[];
}

// ==========================================
// 11. CONTROLE DE ESTOQUE (Seção 5, Módulo 1)
// ==========================================
export interface StockItem {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  costPrice: number;
  salePrice: number;
  unit: string; // un, ml, cx
  imageUrl?: string;
  lastRestockedAt?: string;
}

// ==========================================
// 11.1 GALERIA DE CORTES & TRABALHOS REALIZADOS
// ==========================================
export type GalleryCategory = 'DEGRADE' | 'BARBA' | 'COMBO' | 'SOCIAL' | 'PLATINADO' | 'FREESTYLE';

export interface GalleryWork {
  id: string;
  tenantId: string;
  title: string;
  category: GalleryCategory;
  imageUrl: string;
  professionalId: string;
  professionalName: string;
  serviceId?: string;
  serviceName?: string;
  servicePrice?: number;
  likesCount: number;
  description?: string;
  createdAt: string;
}

// ==========================================
// 12. MENSAGENS DE RETORNO AUTOMÁTICAS (Seção 20)
// ==========================================
export interface ReturnMessage {
  id: string;
  tenantId: string;
  serviceId: string;
  serviceName: string;
  clientId: string;
  clientName: string;
  clientWhatsApp: string;
  lastAppointmentDate: string;
  scheduledReturnDate: string;
  suggestedMessage: string;
  status: 'PENDENTE' | 'ENVIADA';
  sentAt?: string;
}

// ==========================================
// 13. RELATÓRIOS FINANCEIROS E COMISSÕES (Seções 5 e 6)
// ==========================================
export interface ProfessionalCommission {
  professionalId: string;
  professionalName: string;
  totalAppointments: number;
  grossRevenue: number;
  commissionPercentage: number;
  netCommission: number;
  period: string; // YYYY-MM
}

export interface FinancialSummary {
  tenantId: string;
  period: string;
  totalGrossRevenue: number;
  totalCommissions: number;
  totalStockCosts: number;
  netIncome: number;
  appointmentsCount: number;
}

// ==========================================
// 14. AUDITORIA MASTER ADMIN (Registro de Ações Globais)
// ==========================================
export interface AuditLog {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorUserName: string;
  actorRole: UserRole;
  action: string; // Ex: 'CADASTRO_BARBEARIA', 'ALTERACAO_STATUS_BARBEARIA', 'CRIACAO_GERENTE', 'VISUALIZAR_COMO'
  targetTenantId?: string;
  targetTenantName?: string;
  targetUserId?: string;
  targetUserName?: string;
  details: string;
  status: 'SUCESSO' | 'ERRO' | 'AVISO';
}

// ==========================================
// 15. ASSINATURAS RECORRENTES MERCADO PAGO
// ==========================================
export type SubscriptionStatus = 
  | 'PENDING'          // Aguardando validação do cartão no Mercado Pago
  | 'TRIAL_14_DAYS'     // 14 dias grátis ativos (acesso total liberado)
  | 'ACTIVE'           // Ativa (cobranças em dia)
  | 'PAST_DUE'         // Pagamento pendente (em tolerância de 7 dias)
  | 'SUSPENDED'        // Inadimplente (tolerância expirada, acesso bloqueado)
  | 'CANCELED';        // Assinatura cancelada

export interface Subscription {
  id: string;
  barbershopId: string;
  barbershopName: string;
  payerEmail: string;
  payerName?: string;
  payerPhone?: string;
  mercadopagoSubscriptionId: string;
  mercadopagoCustomerId?: string;
  status: SubscriptionStatus;
  plan: string; // 'Plano MY BARBER'
  planId?: string; // ID do CustomPlan
  customPlan?: CustomPlan;
  currentPrice: number; // 0.00 (Trial 14 dias), 49.90 (meses 1 a 3 pagos), 69.90 (do 4º mês pago em diante)
  billingCycle: PlanBillingCycle | 'MONTHLY';
  
  // Controle detalhado dos 14 dias grátis
  isInTrial: boolean; // true durante os 14 dias
  trialStartDate?: string; // YYYY-MM-DD
  trialEndDate?: string;   // YYYY-MM-DD (exatamente 14 dias após início)
  trialDaysRemaining?: number;

  // Controle dos meses promocionais pagos (1º, 2º e 3º mês a R$ 49,90)
  paidBillingCount: number; // 0 (trial), 1 (1º mês pago), 2 (2º mês pago), 3 (3º mês pago), 4+ (regular R$ 69,90)
  trialOrLaunchPeriod: boolean; // true se está no trial ou nos 3 meses a R$ 49,90
  billingCount: number; // total de cobranças processadas
  
  nextBillingDate: string; // Formato YYYY-MM-DD
  initPointUrl?: string; // Link de checkout/autorização do Mercado Pago
  cardValidated: boolean; // true se o cartão foi tokenizado e validado pelo MP
  cardBrand?: string; // 'visa', 'mastercard', etc.
  cardLastFourDigits?: string;
  
  pastDueSince?: string; // Data em que falhou cobrança (tolerância de 7 dias)
  toleranceDays: number; // 7 dias
  createdAt: string;
  updatedAt: string;
  canceledAt?: string;
}

export type PaymentRecordStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'REFUNDED';

export interface SubscriptionPaymentRecord {
  id: string;
  subscriptionId: string;
  barbershopId: string;
  barbershopName?: string;
  mercadopagoPaymentId: string;
  amount: number;
  status: PaymentRecordStatus;
  statusDetail?: string;
  paymentDate: string; // YYYY-MM-DD ou ISO
  billingNumber: number; // 1, 2, 3, 4...
  paymentMethod?: string;
  createdAt: string;
}

export interface WebhookEventLog {
  id: string;
  eventId: string;
  type: string;
  source: 'MERCADO_PAGO';
  processed: boolean;
  receivedAt: string;
  processedAt?: string;
  payload?: any;
  status: 'SUCCESS' | 'IGNORED' | 'ERROR';
  error?: string;
}


