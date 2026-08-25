/**
 * MY BARBER — Definições de Tipos e Modelos de Dados
 * Estrutura estritamente alinhada às regras do documento mestre.
 */

// ==========================================
// 1. PLANO ÚNICO E FIXO (Seção 8)
// ==========================================
export type PlanId = 'PLANO_UNICO';

export interface PlanConfig {
  id: PlanId;
  name: string;
  minProfessionals: number;
  maxProfessionals: number;
  priceMonthly: number; // R$ 49,90 fixo
  description: string;
}

export const MY_BARBER_PLANS: Record<PlanId, PlanConfig> = {
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
  primaryColor?: string;
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
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  planId: PlanId;
  commercialMode?: 'PAGO' | 'TESTE_GRATIS';
  managerName: string;
  managerWhatsApp: string;
  managerEmail?: string;
  managerRole: 'PROPRIETARIO' | 'GERENTE';
  managerAvatarUrl?: string;
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
  winnerDrawnAt?: string;
  showInHighlights?: boolean;
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
  promotionalPrice?: number;
  serviceId?: string;
  serviceName?: string;
  code?: string;
  validUntil: string; // YYYY-MM-DD
  active: boolean;
  imageUrl?: string;
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

