import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { setUserRole, verifyFirebaseIdToken, grantSuperAdminExplicit, handleGrantSuperAdminRequest, provisionManagerAccount, provisionProfessionalAccount, compensateAuthUserCreation, revokeAndDisableAuthAccount, getFirebaseAdmin } from './src/server/firebaseAdmin.js';
import { toCanonicalRole } from './src/lib/authClaims.js';
import {
  requireAuth,
  requireSuperAdmin,
  requireTenantOwner,
  requireTenantManagerOrOwner,
  requireSubscriptionCreation,
  verifyMercadoPagoWebhookSignature,
  AuthenticatedRequest
} from './src/server/authMiddleware.js';
import { handleBookAppointment } from './src/server/bookingController.js';
import {
  handleRescheduleAppointment,
  handleCancelAppointment
} from './src/server/adminAppointmentController.js';
import {
  handleCreateProfessional,
  handleDeleteProfessional
} from './src/server/teamController.js';
import { handleDeactivateCustomer } from './src/server/customerController.js';
import {
  syncPackageById,
  syncPromotionById,
  syncGalleryById,
  deletePackageById,
  deletePromotionById,
  deleteGalleryById,
  incrementGalleryLike,
  CatalogAuthorizationError,
  CatalogNotFoundError
} from './src/server/catalogProjectionService.js';
import { planService } from './src/server/planService.js';
import {
  claimWebhookEventExecution,
  finalizeWebhookEvent,
  markWebhookEventFailed,
  recordDurablePaymentTransaction,
  recordDurablePreapprovalTransaction,
  applyPreapprovalSyncToSubscription,
  DurableSubscriptionRecord
} from './src/server/webhookService.js';
import {
  evaluatePreapprovalCandidate,
  executePreapprovalRecoveryCheck,
  searchPreapprovalsByTenant,
  recoverPreapprovalById,
  reconcileSubscriptionWithMercadoPago,
  reconcileSubscriptionPaymentsWithMercadoPago,
  getAuthoritativeSubscriptionStatus,
  authoritativeCancelSubscription,
  LocalCreationContext
} from './src/server/subscriptionReconciliationService.js';
import {
  acquireDistributedCreationLock,
  completeDistributedCreationLock,
  failDistributedCreationLock,
  recordFirestoreWriteFailureLock,
  blockAmbiguousDistributedCreationLock
} from './src/server/subscriptionDistributedLock.js';
import { createRateLimitMiddleware } from './src/server/rateLimiter.js';
import { consumeCustomerPackageItem } from './src/server/customerPackageService.js';
import { acquireGlobalReconcileLock, releaseGlobalReconcileLock } from './src/server/globalReconcileLock.js';
import { correlationIdMiddleware } from './src/server/correlationMiddleware.js';
import { sendSanitizedInternalError } from './src/server/errorSanitizer.js';
import { logger } from './src/server/logger.js';
import { securityHeadersMiddleware } from './src/server/securityHeaders.js';
import { adjustStockAuthoritative } from './src/server/stockService.js';
import { recordAuditLog } from './src/server/auditLogService.js';
import { getAppEnv, resolveServerFirebaseConfig, validateFinancialEnvironment } from './src/server/serverEnvironmentConfig.js';

dotenv.config();

// Validação de segurança financeira do ambiente (Fail-Closed para Sandbox)
const currentAppEnv = getAppEnv();
if (currentAppEnv === 'sandbox') {
  try {
    const serverFirebaseConfig = resolveServerFirebaseConfig();
    console.log(`[Environment] Backend inicializado em modo SANDBOX com isolamento comprovado (Project: ${serverFirebaseConfig.projectId}, Database: ${serverFirebaseConfig.firestoreDatabaseId})`);
  } catch (err: any) {
    console.error('[Firebase Security Fail-Closed]', err.message);
    throw err;
  }
}
const initialFinValidation = validateFinancialEnvironment(currentAppEnv);
if (!initialFinValidation.valid && currentAppEnv === 'sandbox') {
  console.error('[Financial Security Fail-Closed]', initialFinValidation.error);
  throw new Error(`[Financial Security Fail-Closed] ${initialFinValidation.error}`);
}

const app = express();
const PORT = 3000;

// Configuração restritiva de proxy confiável para ambiente Cloud Run / Google Frontend (1 salto) (FASE 4.4D)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security Hardening HTTP Headers diretamente no Express (FASE 4.4B)
app.use(securityHeadersMiddleware);

// Correlation ID & Request Timing universal para toda a cadeia HTTP (FASE 4.3B)
app.use(correlationIdMiddleware);

// Capture raw body for webhook HMAC validation
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

// Types for backend plans and subscriptions
interface StoredPlanBillingScheduleStage {
  id: string;
  order: number;
  name: string;
  duration: number;
  unit: 'DAYS' | 'MONTHS' | 'CYCLES' | 'INDEFINITE';
  price: number;
}

interface StoredPlanFeatures {
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

interface StoredPlanLimits {
  maxProfessionals: number | 'UNLIMITED';
  maxUnits: number | 'UNLIMITED';
  maxClients: number | 'UNLIMITED';
}

interface StoredPlan {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  priceMonthly: number;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'ONE_TIME';
  isLifetime?: boolean;
  oneTimePrice?: number;
  hasTrial: boolean;
  trialDuration: number;
  trialUnit: 'DAYS' | 'MONTHS';
  hasPromotion: boolean;
  promotionalPrice?: number;
  promotionDuration?: number;
  promotionUnit?: 'MONTHS' | 'CYCLES';
  priceAfterPromotion?: number;
  scheduleStages: StoredPlanBillingScheduleStage[];
  features: StoredPlanFeatures;
  limits: StoredPlanLimits;
  mercadopagoPlanId?: string;
  subscribersCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface StoredSubscription {
  id: string;
  barbershopId: string;
  barbershopName: string;
  payerEmail: string;
  payerName?: string;
  payerPhone?: string;
  mercadopagoSubscriptionId: string;
  mercadopagoCustomerId?: string;
  status: 'PENDING' | 'TRIAL_14_DAYS' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED' | 'LIFETIME_LICENSE';
  plan: string;
  planId?: string;
  customPlan?: StoredPlan;
  currentPrice: number;
  planPriceNormal?: number;
  planPricePromotional?: number;
  planPromotionCycles?: number;
  currency?: string;
  planInconsistent?: boolean;
  needsPricingReconciliation?: boolean;
  isLifetime?: boolean;
  lifetimePurchasedAt?: string;
  previousSubscriptionId?: string;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'ONE_TIME';
  isInTrial: boolean;
  trialStartDate?: string;
  trialEndDate?: string;
  paidBillingCount: number; // Quantidade de mensalidades pagas (1, 2, 3 = R$ 49,90; 4+ = R$ 69,90)
  trialOrLaunchPeriod: boolean;
  billingCount: number;
  nextBillingDate: string;
  initPointUrl?: string;
  cardValidated: boolean;
  cardBrand?: string;
  cardLastFourDigits?: string;
  pastDueSince?: string;
  toleranceDays: number;
  createdAt: string;
  updatedAt: string;
  canceledAt?: string;
}

interface StoredPayment {
  id: string;
  subscriptionId: string;
  barbershopId: string;
  barbershopName?: string;
  mercadopagoPaymentId: string;
  amount: number;
  currency?: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'REFUNDED' | 'CHARGED_BACK';
  statusDetail?: string;
  paymentDate: string;
  billingNumber: number;
  paymentMethod?: string;
  createdAt: string;
}

interface WebhookEvent {
  id: string;
  eventId: string;
  type: string;
  source: 'MERCADO_PAGO';
  processed: boolean;
  receivedAt: string;
  processedAt: string;
  payload: any;
  status: 'SUCCESS' | 'IGNORED' | 'ERROR';
  error?: string;
}

// Helper: Calculate 14 days trial end date
function get14DaysFromDate(baseDate = new Date()): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
}

// Plans In-Memory Database with default plans matching system catalog
const plansDB: Map<string, StoredPlan> = new Map([
  [
    'plano-essencial',
    {
      id: 'plano-essencial',
      name: 'Plano Essencial',
      description: 'Para barbeiros autônomos e barbearias pequenas que querem organizar a agenda e começar a receber agendamentos online.',
      status: 'ACTIVE',
      priceMonthly: 39.90,
      billingCycle: 'MONTHLY',
      hasTrial: true,
      trialDuration: 14,
      trialUnit: 'DAYS',
      hasPromotion: false,
      promotionalPrice: 39.90,
      promotionDuration: 0,
      promotionUnit: 'MONTHS',
      priceAfterPromotion: 39.90,
      scheduleStages: [
        {
          id: 'stage-trial-essencial',
          order: 1,
          name: 'Período Gratuito de Degustação',
          duration: 14,
          unit: 'DAYS',
          price: 0.00
        },
        {
          id: 'stage-regular-essencial',
          order: 2,
          name: 'Preço Normal Recorrente',
          duration: 0,
          unit: 'INDEFINITE',
          price: 39.90
        }
      ],
      features: {
        agenda: true,
        clientes: true,
        profissionais: true,
        servicos: true,
        pacotes: true,
        comunicacoes: true,
        promocoes: true,
        sorteios: true,
        galeria: true,
        estoque: true,
        relatorios_financeiros: true
      },
      limits: {
        maxProfessionals: 1,
        maxUnits: 1,
        maxClients: 'UNLIMITED'
      },
      mercadopagoPlanId: 'mp-plan-essencial-3990',
      subscribersCount: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  ],
  [
    'plano-profissional',
    {
      id: 'plano-profissional',
      name: 'Plano Profissional',
      description: 'Gestão robusta para barbearias em expansão. Inclui 14 dias grátis, 3 meses a R$ 49,90 e depois R$ 69,90/mês.',
      status: 'ACTIVE',
      priceMonthly: 69.90,
      billingCycle: 'MONTHLY',
      hasTrial: true,
      trialDuration: 14,
      trialUnit: 'DAYS',
      hasPromotion: true,
      promotionalPrice: 49.90,
      promotionDuration: 3,
      promotionUnit: 'MONTHS',
      priceAfterPromotion: 69.90,
      scheduleStages: [
        {
          id: 'stage-prof-trial',
          order: 1,
          name: 'Período Gratuito de Degustação',
          duration: 14,
          unit: 'DAYS',
          price: 0.00
        },
        {
          id: 'stage-prof-promo',
          order: 2,
          name: 'Promoção de Entrada / Lançamento',
          duration: 3,
          unit: 'MONTHS',
          price: 49.90
        },
        {
          id: 'stage-prof-regular',
          order: 3,
          name: 'Preço Normal Recorrente',
          duration: 0,
          unit: 'INDEFINITE',
          price: 69.90
        }
      ],
      features: {
        agenda: true,
        clientes: true,
        profissionais: true,
        servicos: true,
        pacotes: true,
        comunicacoes: true,
        promocoes: true,
        sorteios: true,
        galeria: true,
        estoque: true,
        relatorios_financeiros: true
      },
      limits: {
        maxProfessionals: 5,
        maxUnits: 1,
        maxClients: 'UNLIMITED'
      },
      mercadopagoPlanId: 'mp-plan-prof-6990',
      subscribersCount: 0,
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z'
    }
  ],
  [
    'plano-premium',
    {
      id: 'plano-premium',
      name: 'Plano Premium Multiunidades',
      description: 'Para redes de barbearias e operações de grande porte com até 10 profissionais e 2 unidades.',
      status: 'ACTIVE',
      priceMonthly: 99.90,
      billingCycle: 'MONTHLY',
      hasTrial: true,
      trialDuration: 14,
      trialUnit: 'DAYS',
      hasPromotion: true,
      promotionalPrice: 79.90,
      promotionDuration: 3,
      promotionUnit: 'MONTHS',
      priceAfterPromotion: 99.90,
      scheduleStages: [
        {
          id: 'stage-premium-trial',
          order: 1,
          name: 'Período Gratuito de Degustação',
          duration: 14,
          unit: 'DAYS',
          price: 0.00
        },
        {
          id: 'stage-premium-promo',
          order: 2,
          name: 'Promoção de Entrada / Lançamento',
          duration: 3,
          unit: 'MONTHS',
          price: 79.90
        },
        {
          id: 'stage-premium-regular',
          order: 3,
          name: 'Preço Normal Recorrente',
          duration: 0,
          unit: 'INDEFINITE',
          price: 99.90
        }
      ],
      features: {
        agenda: true,
        clientes: true,
        profissionais: true,
        servicos: true,
        pacotes: true,
        comunicacoes: true,
        promocoes: true,
        sorteios: true,
        galeria: true,
        estoque: true,
        relatorios_financeiros: true
      },
      limits: {
        maxProfessionals: 10,
        maxUnits: 2,
        maxClients: 'UNLIMITED'
      },
      mercadopagoPlanId: 'mp-plan-premium-8990',
      subscribersCount: 0,
      createdAt: '2026-02-15T00:00:00Z',
      updatedAt: '2026-02-15T00:00:00Z'
    }
  ],
  [
    'plano-vitalicio',
    {
      id: 'plano-vitalicio',
      name: 'My Barber Compra Definitiva',
      description: 'Licença permanente de uso do SaaS vinculada à barbearia. Pagamento único de R$ 799,00 sem mensalidades. Recursos e limites do Plano Profissional (até 5 profissionais e 1 unidade).',
      status: 'ACTIVE',
      priceMonthly: 799.00,
      billingCycle: 'ONE_TIME',
      isLifetime: true,
      oneTimePrice: 799.00,
      hasTrial: false,
      trialDuration: 0,
      trialUnit: 'DAYS',
      hasPromotion: false,
      promotionalPrice: 799.00,
      promotionDuration: 0,
      promotionUnit: 'MONTHS',
      priceAfterPromotion: 799.00,
      scheduleStages: [
        {
          id: 'stage-lifetime-unique',
          order: 1,
          name: 'Pagamento Único da Licença Definitiva',
          duration: 0,
          unit: 'INDEFINITE',
          price: 799.00
        }
      ],
      features: {
        agenda: true,
        clientes: true,
        profissionais: true,
        servicos: true,
        pacotes: true,
        comunicacoes: true,
        promocoes: true,
        sorteios: true,
        galeria: true,
        estoque: true,
        relatorios_financeiros: true
      },
      limits: {
        maxProfessionals: 5,
        maxUnits: 1,
        maxClients: 'UNLIMITED'
      },
      mercadopagoPlanId: 'mp-payment-lifetime-799',
      subscribersCount: 0,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z'
    }
  ]
]);

// Backward compatibility alias for PLANO_UNICO
const legacyPlanEssencial = plansDB.get('plano-essencial')!;
plansDB.set('PLANO_UNICO', { ...legacyPlanEssencial, id: 'PLANO_UNICO', name: 'Plano Essencial' });

// In-Memory Database / Cache canônico (inicia vazio; o Firestore é a autoridade soberana)
const subscriptionsDB: Map<string, StoredSubscription> = new Map();

// Dados demonstrativos isolados para testes e prototipação
export const DEMO_SUBSCRIPTIONS_MAP: Map<string, StoredSubscription> = new Map([
  [
    'tenant-barbearia-do-joao',
    {
      id: 'sub-barbearia-rodrigues',
      barbershopId: 'tenant-barbearia-do-joao',
      barbershopName: 'Barbearia Rodrigues (Demo)',
      payerEmail: 'carlos.rodrigues@barbeariarodrigues.com.br',
      payerName: 'Carlos Rodrigues',
      payerPhone: '(11) 98765-4321',
      mercadopagoSubscriptionId: 'mp-sub-demo-01',
      mercadopagoCustomerId: 'mp-cust-demo-01',
      status: 'ACTIVE',
      plan: 'Plano Profissional',
      currentPrice: 49.90,
      billingCycle: 'MONTHLY',
      isInTrial: false,
      trialStartDate: '2026-01-01',
      trialEndDate: '2026-01-15',
      paidBillingCount: 2,
      trialOrLaunchPeriod: true,
      billingCount: 2,
      nextBillingDate: '2026-09-15',
      initPointUrl: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=demo-01',
      cardValidated: true,
      cardBrand: 'Mastercard',
      cardLastFourDigits: '4242',
      toleranceDays: 7,
      createdAt: '2026-01-01T10:00:00Z',
      updatedAt: '2026-02-15T10:00:00Z'
    }
  ],
  [
    'tenant-barbearia-vintage-club',
    {
      id: 'sub-barbearia-vintage',
      barbershopId: 'tenant-barbearia-vintage-club',
      barbershopName: 'Barbearia Vintage Club (Demo)',
      payerEmail: 'marcos.vintage@vintageclub.com.br',
      payerName: 'Marcos Vinicius',
      payerPhone: '(21) 99887-7665',
      mercadopagoSubscriptionId: 'mp-sub-demo-02',
      mercadopagoCustomerId: 'mp-cust-demo-02',
      status: 'ACTIVE',
      plan: 'Plano Premium Multiunidades',
      currentPrice: 69.90,
      billingCycle: 'MONTHLY',
      isInTrial: false,
      trialStartDate: '2025-11-06',
      trialEndDate: '2025-11-20',
      paidBillingCount: 4,
      trialOrLaunchPeriod: false,
      billingCount: 4,
      nextBillingDate: '2026-09-20',
      initPointUrl: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=demo-02',
      cardValidated: true,
      cardBrand: 'Visa',
      cardLastFourDigits: '8899',
      toleranceDays: 7,
      createdAt: '2025-11-06T10:00:00Z',
      updatedAt: '2026-02-20T10:00:00Z'
    }
  ]
]);

// Pagamentos canônicos em memória iniciam vazios
const paymentsDB: StoredPayment[] = [];

// Histórico de pagamentos demonstrativos isolado
export const DEMO_PAYMENTS_DB: StoredPayment[] = [
  {
    id: 'pay-rod-1',
    subscriptionId: 'sub-barbearia-rodrigues',
    barbershopId: 'tenant-barbearia-do-joao',
    barbershopName: 'Barbearia Rodrigues (Demo)',
    mercadopagoPaymentId: 'mp-pay-1001',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2026-01-15',
    billingNumber: 1,
    paymentMethod: 'Cartão de Crédito (Mastercard)',
    createdAt: '2026-01-15T10:05:00Z'
  },
  {
    id: 'pay-rod-2',
    subscriptionId: 'sub-barbearia-rodrigues',
    barbershopId: 'tenant-barbearia-do-joao',
    barbershopName: 'Barbearia Rodrigues (Demo)',
    mercadopagoPaymentId: 'mp-pay-1002',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2026-02-15',
    billingNumber: 2,
    paymentMethod: 'Cartão de Crédito (Mastercard)',
    createdAt: '2026-02-15T10:00:00Z'
  },
  {
    id: 'pay-vint-1',
    subscriptionId: 'sub-barbearia-vintage',
    barbershopId: 'tenant-barbearia-vintage-club',
    barbershopName: 'Barbearia Vintage Club (Demo)',
    mercadopagoPaymentId: 'mp-pay-2001',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2025-11-20',
    billingNumber: 1,
    paymentMethod: 'Cartão de Crédito (Visa)',
    createdAt: '2025-11-20T10:00:00Z'
  },
  {
    id: 'pay-vint-2',
    subscriptionId: 'sub-barbearia-vintage',
    barbershopId: 'tenant-barbearia-vintage-club',
    barbershopName: 'Barbearia Vintage Club (Demo)',
    mercadopagoPaymentId: 'mp-pay-2002',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2025-12-20',
    billingNumber: 2,
    paymentMethod: 'Cartão de Crédito (Visa)',
    createdAt: '2025-12-20T10:00:00Z'
  },
  {
    id: 'pay-vint-3',
    subscriptionId: 'sub-barbearia-vintage',
    barbershopId: 'tenant-barbearia-vintage-club',
    barbershopName: 'Barbearia Vintage Club (Demo)',
    mercadopagoPaymentId: 'mp-pay-2003',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2026-01-20',
    billingNumber: 3,
    paymentMethod: 'Cartão de Crédito (Visa)',
    createdAt: '2026-01-20T10:00:00Z'
  },
  {
    id: 'pay-vint-4',
    subscriptionId: 'sub-barbearia-vintage',
    barbershopId: 'tenant-barbearia-vintage-club',
    barbershopName: 'Barbearia Vintage Club (Demo)',
    mercadopagoPaymentId: 'mp-pay-2004',
    amount: 69.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2026-02-20',
    billingNumber: 4,
    paymentMethod: 'Cartão de Crédito (Visa)',
    createdAt: '2026-02-20T10:00:00Z'
  }
];

// NOTA ARQUITETURAL: processedWebhookEvents em memória atua como cache de idempotência rápido
// para a instância ativa. Para ambientes multi-instância e alta disponibilidade em produção,
// a idempotência deve ser persistida transacionalmente em coleção durável do Firestore (ex: `webhook_events`).
const processedWebhookEvents: Map<string, WebhookEvent> = new Map();

// Helper: Calculate next billing date
function getNextBillingDate(baseDate = new Date()): string {
  const d = new Date(baseDate);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

// Mercado Pago REST Helper
interface MercadoPagoCallResult {
  ok: boolean;
  status: number;
  data: any;
  errorText?: string;
}

async function callMercadoPagoWithDetails(endpoint: string, options: RequestInit = {}): Promise<MercadoPagoCallResult> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, status: 500, data: null, errorText: 'MERCADOPAGO_ACCESS_TOKEN não configurado no ambiente' };
  }

  try {
    const res = await fetch(`https://api.mercadopago.com${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`Mercado Pago API error (${endpoint}):`, res.status, errorText);
      return { ok: false, status: res.status, data: null, errorText };
    }

    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (error: any) {
    console.warn(`Mercado Pago fetch exception (${endpoint}):`, error);
    return { ok: false, status: 502, data: null, errorText: error?.message || 'Exceção de rede ao conectar com Mercado Pago' };
  }
}

async function callMercadoPago(endpoint: string, options: RequestInit = {}) {
  const result = await callMercadoPagoWithDetails(endpoint, options);
  return result.ok ? result.data : null;
}

// Update preapproval price in Mercado Pago (e.g. from 49.90 to 69.90)
async function updateMercadoPagoSubscriptionPrice(mpSubscriptionId: string, newPrice: number) {
  return await callMercadoPago(`/preapproval/${mpSubscriptionId}`, {
    method: 'PUT',
    body: JSON.stringify({
      auto_recurring: {
        transaction_amount: newPrice,
        currency_id: 'BRL'
      }
    })
  });
}

// Cancel preapproval in Mercado Pago
async function cancelMercadoPagoSubscription(mpSubscriptionId: string) {
  return await callMercadoPago(`/preapproval/${mpSubscriptionId}`, {
    method: 'PUT',
    body: JSON.stringify({
      status: 'cancelled'
    })
  });
}

// Collector ID autoritativo da plataforma (Fail-Closed, seguro e sem vazamento de credenciais)
let cachedCollectorId: string | null = null;
let cachedCollectorTimestamp = 0;

export async function getAuthorizedCollectorId(): Promise<string | null> {
  if (process.env.MERCADOPAGO_COLLECTOR_ID) {
    return String(process.env.MERCADOPAGO_COLLECTOR_ID).trim();
  }
  const now = Date.now();
  if (cachedCollectorId && now - cachedCollectorTimestamp < 300000) {
    return cachedCollectorId;
  }
  if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
    try {
      const meData = await callMercadoPago('/users/me');
      if (meData?.id) {
        cachedCollectorId = String(meData.id).trim();
        cachedCollectorTimestamp = now;
        return cachedCollectorId;
      }
    } catch {
      // Falha de rede ou credenciais sem expor detalhes
    }
  }
  return null;
}

// =========================================================================
// API ENDPOINTS - PLANOS SAAS DO MY BARBER
// =========================================================================

// Helper to calculate schedule stages for a plan
function calculatePlanScheduleStages(planData: Partial<StoredPlan>): StoredPlanBillingScheduleStage[] {
  const stages: StoredPlanBillingScheduleStage[] = [];
  let order = 1;

  if (planData.hasTrial && (planData.trialDuration || 0) > 0) {
    stages.push({
      id: `stage-trial-${Date.now()}-${order}`,
      order: order++,
      name: 'Período Gratuito',
      duration: planData.trialDuration || 14,
      unit: (planData.trialUnit as any) || 'DAYS',
      price: 0.00
    });
  }

  if (planData.hasPromotion && (planData.promotionDuration || 0) > 0 && planData.promotionalPrice !== undefined) {
    stages.push({
      id: `stage-promo-${Date.now()}-${order}`,
      order: order++,
      name: 'Promoção de Lançamento',
      duration: planData.promotionDuration || 3,
      unit: (planData.promotionUnit as any) || 'MONTHS',
      price: Number(planData.promotionalPrice)
    });
  }

  stages.push({
    id: `stage-regular-${Date.now()}-${order}`,
    order: order++,
    name: 'Preço Normal Recorrente',
    duration: 0,
    unit: 'INDEFINITE',
    price: Number(planData.priceAfterPromotion || planData.priceMonthly || 49.90)
  });

  return stages;
}

// =========================================================================
// RATE LIMITING POLICIES (FASE 2.9C - PROTEÇÃO CONTRA ABUSO DE API/HTTP)
// =========================================================================
// 1. Endpoints de autenticação e concessão de privilégios IAM (15 reqs / minuto por IP/ator)
const authEndpointsLimiter = createRateLimitMiddleware({
  maxRequests: 15,
  windowSeconds: 60,
  keyPrefix: 'ratelimit:auth'
});

// 2. Endpoints administrativos sensíveis (Super Admin / Provisionamento) (30 reqs / minuto)
const adminEndpointsLimiter = createRateLimitMiddleware({
  maxRequests: 30,
  windowSeconds: 60,
  keyPrefix: 'ratelimit:admin'
});

// 3. Gestão de equipe e colaboradores (30 reqs / minuto)
const teamEndpointsLimiter = createRateLimitMiddleware({
  maxRequests: 30,
  windowSeconds: 60,
  keyPrefix: 'ratelimit:team'
});

// 4. Criação e manipulação de assinaturas / checkout (20 reqs / minuto)
const subscriptionEndpointsLimiter = createRateLimitMiddleware({
  maxRequests: 20,
  windowSeconds: 60,
  keyPrefix: 'ratelimit:sub'
});

// 5. Agendamentos administrativos (reagendamento e cancelamento) (30 reqs / minuto)
const appointmentAdminLimiter = createRateLimitMiddleware({
  maxRequests: 30,
  windowSeconds: 60,
  keyPrefix: 'ratelimit:appointments'
});

// 6. Sincronização de catálogo público e projeções (60 reqs / minuto)
const catalogSyncLimiter = createRateLimitMiddleware({
  maxRequests: 60,
  windowSeconds: 60,
  keyPrefix: 'ratelimit:catalog'
});

// 7. Webhooks externos (120 reqs / minuto por IP de origem)
const webhookLimiter = createRateLimitMiddleware({
  maxRequests: 120,
  windowSeconds: 60,
  keyPrefix: 'ratelimit:webhook'
});

// 0. Plans CRUD Endpoints

app.get('/api/plans', async (_req: Request, res: Response) => {
  try {
    const plansArray = await planService.getPlans();
    // Update subscribers count dynamically
    const enrichedPlans = plansArray.map(plan => {
      let subscribers = 0;
      subscriptionsDB.forEach(sub => {
        if (sub.status !== 'CANCELED') {
          if (
            sub.planId === plan.id ||
            ((plan.id === 'plano-essencial' || plan.id === 'PLANO_UNICO') && (!sub.planId || sub.plan === 'Plano MY BARBER' || sub.plan === 'Plano Único & Fixo' || sub.plan === 'Plano Essencial'))
          ) {
            subscribers++;
          }
        }
      });
      return {
        ...plan,
        subscribersCount: subscribers
      };
    });

    res.json({
      success: true,
      plans: enrichedPlans
    });
  } catch (err: any) {
    console.error('Error fetching plans:', err);
    res.status(500).json({ error: 'Erro ao listar planos' });
  }
});

app.post('/api/plans', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const rawIdempKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
    if (!rawIdempKey || typeof rawIdempKey !== 'string' || !rawIdempKey.trim()) {
      return res.status(400).json({
        error: 'O cabeçalho Idempotency-Key é obrigatório para criação de planos.',
        code: 'IDEMPOTENCY_KEY_REQUIRED'
      });
    }

    const idempotencyKey = rawIdempKey.trim();
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({
        error: 'O cabeçalho Idempotency-Key deve ter entre 8 e 128 caracteres alfanuméricos, hífen ou underscore.',
        code: 'INVALID_IDEMPOTENCY_KEY'
      });
    }

    const {
      name,
      description,
      status = 'ACTIVE',
      priceMonthly,
      billingCycle = 'MONTHLY',
      hasTrial = false,
      trialDuration = 0,
      trialUnit = 'DAYS',
      hasPromotion = false,
      promotionalPrice,
      promotionDuration = 0,
      promotionUnit = 'MONTHS',
      priceAfterPromotion,
      features,
      limits
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'O nome do plano é obrigatório.' });
    }

    if (priceMonthly === undefined || isNaN(Number(priceMonthly)) || Number(priceMonthly) < 0) {
      return res.status(400).json({ error: 'O preço regular base do plano deve ser um valor numérico positivo.' });
    }

    const scheduleStages = calculatePlanScheduleStages({
      hasTrial,
      trialDuration,
      trialUnit,
      hasPromotion,
      promotionalPrice,
      promotionDuration,
      promotionUnit,
      priceAfterPromotion: priceAfterPromotion || priceMonthly,
      priceMonthly
    });

    const defaultFeatures: StoredPlanFeatures = {
      agenda: true,
      clientes: true,
      profissionais: true,
      servicos: true,
      pacotes: true,
      comunicacoes: true,
      promocoes: true,
      sorteios: true,
      galeria: true,
      estoque: true,
      relatorios_financeiros: true
    };

    const defaultLimits: StoredPlanLimits = {
      maxProfessionals: 10,
      maxUnits: 1,
      maxClients: 'UNLIMITED'
    };

    const planData = {
      name: name.trim(),
      description: description || `Plano de gestão para barbearias (${billingCycle}).`,
      status: (status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') as 'ACTIVE' | 'INACTIVE',
      priceMonthly: Number(priceMonthly),
      billingCycle: billingCycle || 'MONTHLY',
      hasTrial: Boolean(hasTrial),
      trialDuration: Number(trialDuration) || 0,
      trialUnit: trialUnit || 'DAYS',
      hasPromotion: Boolean(hasPromotion),
      promotionalPrice: promotionalPrice !== undefined ? Number(promotionalPrice) : undefined,
      promotionDuration: Number(promotionDuration) || 0,
      promotionUnit: promotionUnit || 'MONTHS',
      priceAfterPromotion: priceAfterPromotion !== undefined ? Number(priceAfterPromotion) : Number(priceMonthly),
      scheduleStages,
      features: { ...defaultFeatures, ...(features || {}) },
      limits: { ...defaultLimits, ...(limits || {}) }
    };

    const actorUid = (req as any).user?.uid || 'super_admin';
    const result = await planService.createPlanIdempotently({
      planData,
      idempotencyKey,
      actorUid
    });

    if (!result.success) {
      if (result.collision) {
        return res.status(409).json({
          error: result.error || 'Chave de idempotência já utilizada com parâmetros diferentes.',
          code: 'IDEMPOTENCY_KEY_COLLISION'
        });
      }
      return res.status(500).json({ error: result.error || 'Erro ao criar plano.' });
    }

    const savedPlan = result.plan;
    plansDB.set(savedPlan.id, savedPlan);

    // Auditoria administrativa oficial (FASE 4.4D / FASE 4.9D)
    // Se for replay, NÃO grava novo audit log redundante
    if (!result.isReplay) {
      await recordAuditLog({
        actorUid,
        actorRole: 'super_admin',
        action: 'PLAN_CREATED',
        targetType: 'plan',
        targetId: savedPlan.id,
        previousState: null,
        newState: { id: savedPlan.id, name: savedPlan.name, priceMonthly: savedPlan.priceMonthly, status: savedPlan.status },
        details: `Criação de plano: ${savedPlan.name}`,
        requestId: (req as any).id
      });
    }

    res.status(result.isReplay ? 200 : 201).json({
      success: true,
      plan: savedPlan,
      isReplay: result.isReplay,
      message: result.isReplay
        ? 'Replay idempotente: plano recuperado com sucesso.'
        : 'Plano criado com sucesso e pronto para contratação no Mercado Pago.'
    });
  } catch (err: any) {
    console.error('Error creating custom plan:', err);
    res.status(500).json({ error: err.message || 'Erro ao criar plano.' });
  }
});

app.put('/api/plans/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existingPlan = await planService.getPlanById(id);

    if (!existingPlan) {
      return res.status(404).json({ error: 'Plano não encontrado.' });
    }

    const updates = req.body;
    const nowIso = new Date().toISOString();

    // Check subscribers count
    let subscribers = 0;
    subscriptionsDB.forEach(sub => {
      if (sub.status !== 'CANCELED' && (sub.planId === id || (id === 'PLANO_UNICO' && !sub.planId))) {
        subscribers++;
      }
    });

    const updatedPlan: StoredPlan = {
      ...existingPlan,
      ...updates,
      id: existingPlan.id, // Immutable ID
      scheduleStages: calculatePlanScheduleStages({
        ...existingPlan,
        ...updates
      }),
      features: {
        ...existingPlan.features,
        ...(updates.features || {})
      },
      limits: {
        ...existingPlan.limits,
        ...(updates.limits || {})
      },
      subscribersCount: subscribers,
      updatedAt: nowIso
    };

    const savedPlan = await planService.savePlan(updatedPlan);
    plansDB.set(id, savedPlan);

    // Auditoria administrativa oficial (FASE 4.4D)
    await recordAuditLog({
      actorUid: (req as any).user?.uid || 'super_admin',
      actorRole: 'super_admin',
      action: 'PLAN_UPDATED',
      targetType: 'plan',
      targetId: id,
      previousState: { name: existingPlan.name, priceMonthly: existingPlan.priceMonthly, status: existingPlan.status },
      newState: { name: savedPlan.name, priceMonthly: savedPlan.priceMonthly, status: savedPlan.status },
      details: `Atualização de plano: ${savedPlan.name}`,
      requestId: (req as any).id
    });

    res.json({
      success: true,
      plan: savedPlan,
      message: 'Plano atualizado com sucesso.'
    });
  } catch (err: any) {
    console.error('Error updating custom plan:', err);
    res.status(500).json({ error: err.message || 'Erro ao atualizar plano.' });
  }
});

app.post('/api/plans/:id/toggle-status', requireSuperAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { targetStatus } = req.body || {};

  if (!targetStatus || (targetStatus !== 'ACTIVE' && targetStatus !== 'INACTIVE')) {
    return res.status(400).json({
      error: 'targetStatus é obrigatório no corpo da requisição e deve ser "ACTIVE" ou "INACTIVE".'
    });
  }

  try {
    // FASE 4.9B.4 & FASE 4.9B.6: setPlanStatus executa checagem e mutação atômica autoritativa no Firestore
    // Retorna null se o plano for inexistente, e inclui metadado { changed, previousStatus }
    // Lança exceção se a persistência autoritativa falhar (Fail-Closed)
    const updatedPlan = await planService.setPlanStatus(id, targetStatus);
    if (!updatedPlan) {
      return res.status(404).json({ error: 'Plano não encontrado.' });
    }

    plansDB.set(id, updatedPlan);
    if (id === 'plano-essencial') {
      plansDB.set('PLANO_UNICO', { ...updatedPlan, id: 'PLANO_UNICO', name: 'Plano Essencial' });
    } else if (id === 'PLANO_UNICO') {
      plansDB.set('plano-essencial', updatedPlan);
    }

    // Auditoria administrativa oficial (FASE 4.4D / FASE 4.9B / FASE 4.9B.4)
    // Decisão autoritativa baseada em updatedPlan.changed (NUNCA em cache local stale de getPlanById)
    if (updatedPlan.changed) {
      await recordAuditLog({
        actorUid: (req as any).user?.uid || 'super_admin',
        actorRole: 'super_admin',
        action: 'PLAN_STATUS_TOGGLED',
        targetType: 'plan',
        targetId: id,
        previousState: { status: updatedPlan.previousStatus || (updatedPlan.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE') },
        newState: { status: updatedPlan.status },
        details: `Status do plano alterado para: ${updatedPlan.status}`,
        requestId: (req as any).id
      });
    }

    res.json({
      success: true,
      plan: updatedPlan,
      message: `Plano ${updatedPlan.status === 'ACTIVE' ? 'ativado' : 'inativado'} com sucesso.`
    });
  } catch (err: any) {
    console.error(`[Plans] Erro ao persistir status do plano ${id}:`, err);
    res.status(500).json({
      success: false,
      error: 'Erro ao persistir status do plano no banco de dados autoritativo.'
    });
  }
});

app.post('/api/plans/:id/duplicate', requireSuperAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const rawIdempKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
  if (!rawIdempKey || typeof rawIdempKey !== 'string' || !rawIdempKey.trim()) {
    return res.status(400).json({
      error: 'O cabeçalho Idempotency-Key é obrigatório para duplicação de planos.',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
  }

  const idempotencyKey = rawIdempKey.trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
    return res.status(400).json({
      error: 'O cabeçalho Idempotency-Key deve ter entre 8 e 128 caracteres alfanuméricos, hífen ou underscore.',
      code: 'INVALID_IDEMPOTENCY_KEY'
    });
  }

  try {
    const actorUid = (req as any).user?.uid || 'super_admin';
    const result = await planService.duplicatePlanIdempotently({
      sourcePlanId: id,
      idempotencyKey,
      actorUid
    });

    if (!result.success) {
      if (result.collision) {
        return res.status(409).json({
          error: result.error || 'Chave de idempotência já utilizada para outra duplicação.',
          code: 'IDEMPOTENCY_KEY_COLLISION'
        });
      }
      if (result.notFound) {
        return res.status(404).json({ error: result.error || 'Plano original não encontrado para duplicação.' });
      }
      return res.status(500).json({ error: result.error || 'Erro ao duplicar plano.' });
    }

    const duplicated = result.plan;
    plansDB.set(duplicated.id, duplicated);

    // Auditoria administrativa oficial (FASE 4.4D / FASE 4.9D)
    // Se for replay, NÃO grava novo audit log redundante
    if (!result.isReplay) {
      await recordAuditLog({
        actorUid,
        actorRole: 'super_admin',
        action: 'PLAN_DUPLICATED',
        targetType: 'plan',
        targetId: duplicated.id,
        previousState: { originalPlanId: id },
        newState: { id: duplicated.id, name: duplicated.name, status: duplicated.status },
        details: `Plano duplicado a partir de ${id}`,
        requestId: (req as any).id
      });
    }

    res.status(result.isReplay ? 200 : 201).json({
      success: true,
      plan: duplicated,
      isReplay: result.isReplay,
      message: result.isReplay
        ? 'Replay idempotente: plano duplicado recuperado com sucesso.'
        : 'Plano duplicado com sucesso em modo inativo. Revise e ative quando desejar.'
    });
  } catch (err: any) {
    console.error(`[Plans] Erro ao duplicar plano ${id}:`, err);
    res.status(500).json({ error: err.message || 'Erro ao duplicar plano.' });
  }
});

// =========================================================================
// API ENDPOINTS - MERCADO PAGO E ASSINATURAS
// =========================================================================

// 1. Health check (Liveness) & Readiness Probe (FASE 4.3B)
app.get('/api/health', (_req, res) => {
  // Liveness ultra-rápida: apenas verifica que o processo Node.js está vivo e respondendo
  res.json({ status: 'ok', service: 'MY BARBER Subscription Engine' });
});

app.get('/api/health/ready', async (req: Request, res: Response) => {
  // Readiness probe: verifica conectividade com Firebase Admin / Firestore com timeout curto (máx 2000ms)
  try {
    const { firestore } = getFirebaseAdmin();
    if (!firestore || typeof firestore.collection !== 'function') {
      return res.status(503).json({
        status: 'not_ready',
        checks: { firestore: 'error' }
      });
    }

    const checkPromise = firestore.collection('plans').limit(1).get();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 2000)
    );

    await Promise.race([checkPromise, timeoutPromise]);

    return res.status(200).json({
      status: 'ready',
      checks: { firestore: 'ok' }
    });
  } catch (err) {
    logger.warn('[HealthCheck] Readiness probe falhou ou excedeu timeout', {
      requestId: (req as any).id,
      error: 'FIRESTORE_CHECK_FAILED'
    });
    return res.status(503).json({
      status: 'not_ready',
      checks: { firestore: 'error' }
    });
  }
});

app.get('/api/mercadopago/check-credentials', requireSuperAdmin, async (_req: Request, res: Response) => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY;
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  if (!token) {
    return res.json({
      configured: false,
      valid: false,
      message: 'Variável MERCADOPAGO_ACCESS_TOKEN não encontrada no ambiente.',
      hasPublicKey: Boolean(publicKey),
      hasWebhookSecret: Boolean(webhookSecret)
    });
  }

  // Mask token for safe diagnostic output
  const maskedToken = token.length > 16 
    ? `${token.slice(0, 10)}...${token.slice(-6)}` 
    : '***';

  // Validação de compatibilidade com APP_ENV (Fail-Closed)
  const envValidation = validateFinancialEnvironment(getAppEnv());
  if (!envValidation.valid) {
    return res.status(422).json({
      configured: true,
      valid: false,
      maskedToken,
      appEnv: envValidation.appEnv,
      error: envValidation.error,
      message: envValidation.error
    });
  }

  try {
    const mpUser = await callMercadoPago('/users/me');
    if (mpUser && mpUser.id) {
      return res.json({
        configured: true,
        valid: true,
        maskedToken,
        publicKeyConfigured: Boolean(publicKey),
        webhookSecretConfigured: Boolean(webhookSecret),
        mercadoPagoUser: {
          id: mpUser.id,
          nickname: mpUser.nickname,
          email: mpUser.email ? `${mpUser.email.slice(0, 3)}***@${mpUser.email.split('@')[1]}` : undefined,
          siteId: mpUser.site_id,
          collectorId: mpUser.id
        },
        message: 'Credenciais do Mercado Pago conectadas e autenticadas com sucesso!'
      });
    } else {
      return res.json({
        configured: true,
        valid: false,
        maskedToken,
        message: 'O token foi detectado, mas o Mercado Pago rejeitou a autenticação. Verifique se o Access Token foi copiado sem espaços extras.'
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      configured: true,
      valid: false,
      error: err.message,
      message: 'Falha ao conectar com a API do Mercado Pago.'
    });
  }
});

// 2. Create / Initialize Recurring Subscription
app.post('/api/subscriptions/create', subscriptionEndpointsLimiter, requireSubscriptionCreation, async (req: Request, res: Response) => {
  try {
    const { barbershopId, barbershopName, payerEmail, payerName, payerPhone, planId = 'PLANO_UNICO' } = req.body;

    if (!barbershopId || !payerEmail) {
      return res.status(400).json({ error: 'barbershopId e payerEmail são obrigatórios' });
    }

    // Resolve plan configuration (P2-05: sem fallback silencioso para plano inexistente, validação de status ACTIVE)
    const requestedPlanId = planId || 'PLANO_UNICO';
    let selectedPlan = plansDB.get(requestedPlanId);
    if (!selectedPlan) {
      try {
        const { firestore } = getFirebaseAdmin();
        const planDoc = await firestore.collection('plans').doc(requestedPlanId).get();
        if (planDoc.exists) {
          selectedPlan = planDoc.data() as any;
        }
      } catch {
        // Fallback para cache de planos
      }
    }

    if (!selectedPlan) {
      return res.status(400).json({
        error: `Plano '${requestedPlanId}' não encontrado. Selecione um plano válido existente.`
      });
    }

    if ((selectedPlan as any).status && (selectedPlan as any).status !== 'ACTIVE') {
      return res.status(409).json({
        error: `O plano '${selectedPlan.name}' está inativo e não pode ser contratado.`
      });
    }

    if (requestedPlanId === 'plano-vitalicio') {
      return res.status(400).json({
        error: 'O plano Compra Definitiva é um pagamento único de R$ 799,00 e não pode ser criado como assinatura recorrente. Utilize o checkout de compra definitiva.'
      });
    }

    // FASE 3.3E: Lock distribuído atômico no Firestore (runTransaction) com requestId e TTL
    // Gestão soberana via distributedCreationLock: firestore.collection('subscription_creations').doc(`create-${barbershopId}`)
    // Mapeamento: reservation.status === 'LOCKED' (ALREADY_IN_PROGRESS) e reservation.status === 'ALREADY_EXISTS' (ALREADY_ACTIVE_SUBSCRIPTION)
    const { firestore } = getFirebaseAdmin();
    const lockResult = await acquireDistributedCreationLock(
      firestore,
      barbershopId,
      payerEmail,
      selectedPlan.id
    );

    if (!lockResult.success) {
      const lockError = lockResult as { success: false; reason: string; subscription?: any; currentLock?: any };
      if (lockError.reason === 'ALREADY_ACTIVE_SUBSCRIPTION') {
        const existingSub = lockError.subscription;
        if (existingSub) {
          subscriptionsDB.set(barbershopId, existingSub);
        }
        return res.status(409).json({
          error: 'Já existe uma assinatura ativa ou pendente para este estabelecimento.',
          subscription: existingSub,
          initPointUrl: existingSub?.initPointUrl
        });
      }

      if (lockError.reason === 'ALREADY_IN_PROGRESS') {
        return res.status(409).json({
          error: 'Uma solicitação de criação de assinatura já está em andamento para esta barbearia. Aguarde a conclusão.'
        });
      }

      return res.status(503).json({
        error: 'Serviço de persistência indisponível. Criação bloqueada por segurança.'
      });
    }

    const { requestId, previousLockData } = lockResult;

    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const returnUrl = `${appUrl}?subscription_return=success&barbershopId=${encodeURIComponent(barbershopId)}`;

    const now = new Date();
    const trialStartDate = now.toISOString().split('T')[0];

    // Compute trial days and end date
    const trialDays = selectedPlan.hasTrial
      ? (selectedPlan.trialUnit === 'MONTHS' ? (selectedPlan.trialDuration || 1) * 30 : (selectedPlan.trialDuration || 14))
      : 0;

    const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Frequency mapping
    let frequency = 1;
    let frequencyType: 'months' | 'days' = 'months';
    if (selectedPlan.billingCycle === 'QUARTERLY') frequency = 3;
    else if (selectedPlan.billingCycle === 'SEMIANNUAL') frequency = 6;
    else if (selectedPlan.billingCycle === 'ANNUAL') frequency = 12;

    // Initial transaction amount (promotional or regular)
    const initialAmount = selectedPlan.hasPromotion && selectedPlan.promotionalPrice !== undefined
      ? Number(selectedPlan.promotionalPrice)
      : Number(selectedPlan.priceMonthly);

    const planReason = `${selectedPlan.name}${trialDays > 0 ? ` - ${trialDays} Dias Grátis` : ''} + R$ ${initialAmount.toFixed(2).replace('.', ',')}/${selectedPlan.billingCycle === 'MONTHLY' ? 'mês' : 'ciclo'}`;

    // Fail-closed: Exige credencial ativa do Mercado Pago para criação financeira
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      await failDistributedCreationLock(
        firestore,
        barbershopId,
        requestId,
        'Credencial do gateway de pagamento (MERCADOPAGO_ACCESS_TOKEN) não configurada'
      );
      return res.status(503).json({
        error: 'Serviço de pagamento temporariamente indisponível. Tente novamente mais tarde.'
      });
    }

    // FASE 3.3B: RECOVERY CHECK ANTES DE QUALQUER POST /preapproval (P2-C RESIDUAL)
    // Previne criação de preapprovals duplicadas caso a anterior tenha sido criada no gateway
    // mas a resposta tenha sofrido timeout de rede, desconexão ou erro de escrita no Firestore.
    const localContext: LocalCreationContext = {
      barbershopId,
      payerEmail,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      expectedAmount: initialAmount,
      currencyId: 'BRL',
      billingCycle: selectedPlan.billingCycle,
      frequency,
      frequencyType,
      attemptTimestampMs: now.getTime(),
      knownMpSubscriptionId: previousLockData?.mpSubscriptionId
    };

    const recoveryCheck = await executePreapprovalRecoveryCheck(
      barbershopId,
      localContext,
      previousLockData,
      callMercadoPagoWithDetails
    );

    if (recoveryCheck.operation === 'BLOCK_AMBIGUOUS') {
      // Transiciona lock para status: 'AMBIGUOUS_BLOCKED'
      await blockAmbiguousDistributedCreationLock(
        firestore,
        barbershopId,
        requestId,
        recoveryCheck.reason || '',
        recoveryCheck.candidates?.length || 0
      );
      return res.status(409).json({
        error: recoveryCheck.reason,
        candidatesCount: recoveryCheck.candidates?.length || 0
      });
    }

    if (recoveryCheck.operation === 'GATEWAY_UNAVAILABLE') {
      await failDistributedCreationLock(
        firestore,
        barbershopId,
        requestId,
        recoveryCheck.reason || ''
      );
      return res.status(recoveryCheck.httpStatus || 502).json({
        error: recoveryCheck.reason
      });
    }

    let mpSubId: string;
    let initPoint: string;
    let isRecovered = false;

    if (recoveryCheck.operation === 'RECOVER_EXISTING' && recoveryCheck.candidate) {
      // CONTRATO RECUPERADO: NÃO FAZ POST /preapproval
      const recoveredCandidate = recoveryCheck.candidate;
      mpSubId = recoveredCandidate.id;
      initPoint = recoveredCandidate.init_point || recoveredCandidate.sandbox_init_point;
      isRecovered = true;
    } else {
      // NENHUMA ASSINATURA PRÉ-EXISTENTE: CRIAÇÃO SEGURA VIA POST /preapproval
      const mpResult = await callMercadoPagoWithDetails('/preapproval', {
        method: 'POST',
        body: JSON.stringify({
          payer_email: payerEmail,
          back_url: returnUrl,
          reason: planReason,
          external_reference: barbershopId,
          auto_recurring: {
            frequency,
            frequency_type: frequencyType,
            transaction_amount: initialAmount,
            currency_id: 'BRL',
            start_date: trialDays > 0 
              ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
              : new Date().toISOString()
          },
          status: 'pending'
        })
      });

      if (!mpResult.ok || !mpResult.data || !mpResult.data.id) {
        const isTemporary = mpResult.status === 503 || mpResult.status === 504 || mpResult.status === 429;
        const httpStatus = isTemporary ? 503 : 502;
        const errorMsg = 'Falha ao processar assinatura junto ao gateway de pagamento. Nenhuma cobrança foi gerada.';

        await failDistributedCreationLock(
          firestore,
          barbershopId,
          requestId,
          `Mercado Pago retornou status ${mpResult.status}`
        );

        return res.status(httpStatus).json({
          error: errorMsg
        });
      }

      mpSubId = mpResult.data.id;
      initPoint = mpResult.data.init_point || mpResult.data.sandbox_init_point;
    }

    if (!initPoint) {
      await failDistributedCreationLock(
        firestore,
        barbershopId,
        requestId,
        'Gateway de pagamento não retornou URL de checkout (init_point)',
        mpSubId
      );

      return res.status(502).json({
        error: 'Falha ao obter URL de checkout para a assinatura.'
      });
    }

    const nowIso = now.toISOString();
    const newSubscription: StoredSubscription = {
      id: `sub-${barbershopId}`,
      barbershopId,
      barbershopName: barbershopName || 'Barbearia Parceira',
      payerEmail,
      payerName: payerName || '',
      payerPhone: payerPhone || '',
      mercadopagoSubscriptionId: mpSubId,
      status: 'PENDING',
      plan: selectedPlan.name,
      planId: selectedPlan.id,
      customPlan: selectedPlan as any,
      currentPrice: trialDays > 0 ? 0.00 : initialAmount,
      planPriceNormal: Number(selectedPlan.priceMonthly),
      planPricePromotional: selectedPlan.hasPromotion && selectedPlan.promotionalPrice !== undefined ? Number(selectedPlan.promotionalPrice) : undefined,
      planPromotionCycles: selectedPlan.hasPromotion ? (selectedPlan.promotionDuration || 0) : 0,
      currency: 'BRL',
      billingCycle: selectedPlan.billingCycle,
      isInTrial: false,
      trialStartDate,
      trialEndDate: trialDays > 0 ? trialEndDate : undefined,
      paidBillingCount: 0,
      trialOrLaunchPeriod: Boolean(selectedPlan.hasPromotion || selectedPlan.hasTrial),
      billingCount: 0,
      nextBillingDate: trialDays > 0 ? trialEndDate : getNextBillingDate(now),
      initPointUrl: initPoint,
      cardValidated: false,
      toleranceDays: 7,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // Se foi recuperado de status pré-existente no gateway (ex: já validado)
    if (isRecovered && recoveryCheck.candidate?.status === 'authorized') {
      newSubscription.cardValidated = true;
      if (trialDays > 0) {
        newSubscription.status = 'TRIAL_14_DAYS';
        newSubscription.isInTrial = true;
      } else {
        newSubscription.status = 'ACTIVE';
        newSubscription.isInTrial = false;
      }
    }

    subscriptionsDB.set(barbershopId, newSubscription);

    // Persistência soberana via Admin SDK no Firestore
    try {
      await firestore.collection('subscriptions').doc(newSubscription.id).set(newSubscription, { merge: true });
      await completeDistributedCreationLock(firestore, barbershopId, requestId, {
        mpSubscriptionId: mpSubId,
        recovered: isRecovered
      });
    } catch (fsErr: any) {
      console.warn('[server.ts] Erro ao sincronizar subscription no Firestore:', fsErr);
      // O contrato no Mercado Pago foi criado/recuperado com sucesso com mpSubId.
      // NÃO fingir FAILED ignorando a existência do contrato externo: registrar detalhes para reconciliação
      await recordFirestoreWriteFailureLock(
        firestore,
        barbershopId,
        requestId,
        fsErr?.message || 'Falha ao persistir subscription após criação/recuperação no Mercado Pago',
        mpSubId,
        isRecovered
      );

      return res.status(500).json({
        error: 'Assinatura gerada no gateway, mas ocorreu um erro interno de persistência. O suporte irá reconciliar os dados.'
      });
    }

    res.status(isRecovered ? 200 : 201).json({
      success: true,
      subscription: newSubscription,
      initPointUrl: initPoint,
      recovered: isRecovered,
      message: isRecovered
        ? 'Assinatura recuperada com sucesso do gateway de pagamento sem cobrança duplicada.'
        : 'Assinatura criada com sucesso. Redirecionando para validação do cartão de crédito no Mercado Pago.'
    });
  } catch (err: any) {
    console.error('Error creating subscription:', err);
    try {
      if (req.body?.barbershopId) {
        const { firestore } = getFirebaseAdmin();
        await firestore.collection('subscription_creations').doc(`create-${req.body.barbershopId}`).set({
          status: 'FAILED',
          error: err?.message || 'Erro ao processar assinatura',
          failedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch {}
    return sendSanitizedInternalError(res, err, {
      req,
      operation: 'create_subscription',
      publicMessage: 'Erro interno ao processar criação de assinatura.',
      extra: { barbershopId: req.body?.barbershopId }
    });
  }
});

// 2.1 Checkout Avulso para Compra Definitiva (R$ 799,00 - Pagamento Único Mercado Pago)
app.post('/api/subscriptions/checkout-lifetime', subscriptionEndpointsLimiter, requireSubscriptionCreation, async (req: Request, res: Response) => {
  try {
    const { barbershopId, barbershopName, payerEmail, payerName } = req.body;

    if (!barbershopId || !payerEmail) {
      return res.status(400).json({ error: 'barbershopId e payerEmail são obrigatórios' });
    }

    const { firestore } = getFirebaseAdmin();
    const subDoc = await firestore.collection('subscriptions').doc(`sub-${barbershopId}`).get();
    if (subDoc.exists) {
      const currentSub = subDoc.data() as StoredSubscription;
      if (currentSub?.status === 'LIFETIME_LICENSE') {
        return res.status(409).json({
          error: 'Este estabelecimento já possui uma licença vitalícia permanente ativa.'
        });
      }
    }

    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const returnUrl = `${appUrl}?lifetime_return=success&barbershopId=${encodeURIComponent(barbershopId)}`;
    const checkoutOperationId = req.body?.checkoutOperationId || `chk-op-lifetime-${barbershopId}-${Date.now()}`;

    const preferencePayload = {
      items: [
        {
          id: 'mybarber-lifetime-license',
          title: 'My Barber — Compra Definitiva (Licença Vitalícia)',
          description: 'Licença permanente de uso do SaaS para 1 barbearia (até 5 profissionais e 1 unidade)',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: 799.00
        }
      ],
      payer: {
        email: payerEmail,
        name: payerName || barbershopName || 'Proprietário da Barbearia'
      },
      external_reference: barbershopId,
      metadata: {
        barbershop_id: barbershopId,
        checkout_operation_id: checkoutOperationId,
        purchase_type: 'LIFETIME_LICENSE',
        plan_id: 'plano-vitalicio',
        amount: 799.00
      },
      back_urls: {
        success: returnUrl,
        pending: returnUrl,
        failure: returnUrl
      },
      auto_return: 'approved'
    };

    let initPointUrl = '';
    let preferenceId = `pref-lifetime-${Date.now()}`;

    if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
      const mpData = await callMercadoPago('/checkout/preferences', {
        method: 'POST',
        body: JSON.stringify(preferencePayload)
      });

      if (mpData && mpData.id) {
        preferenceId = mpData.id;
        initPointUrl = mpData.init_point || mpData.sandbox_init_point;
      } else {
        console.warn('[server.ts] Erro ao criar preferência de Compra Definitiva no Mercado Pago');
        return res.status(502).json({
          error: 'Falha ao gerar link de pagamento de compra definitiva no gateway.'
        });
      }
    } else {
      initPointUrl = `${returnUrl}&simulated_preference_id=${preferenceId}`;
    }

    const nowIso = new Date().toISOString();
    const durableCheckoutRecord = {
      tenantId: barbershopId,
      checkoutOperationId,
      preferenceId,
      external_reference: barbershopId,
      amount: 799.00,
      currency: 'BRL',
      status: 'PENDING',
      barbershopName: barbershopName || 'Barbearia',
      payerEmail,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await firestore.collection('lifetime_checkouts').doc(checkoutOperationId).set(durableCheckoutRecord);
    if (preferenceId) {
      await firestore.collection('lifetime_checkouts').doc(`pref-${preferenceId}`).set(durableCheckoutRecord);
    }

    res.status(200).json({
      success: true,
      initPointUrl,
      preferenceId,
      checkoutOperationId,
      price: 799.00,
      message: 'Checkout de Compra Definitiva (R$ 799,00) gerado com sucesso. Redirecionando para o Mercado Pago.'
    });
  } catch (err: any) {
    return sendSanitizedInternalError(res, err, {
      req,
      operation: 'checkout_lifetime',
      publicMessage: 'Erro interno ao gerar checkout de Compra Definitiva.',
      extra: { barbershopId: req.body?.barbershopId }
    });
  }
});

// 2.2 Ativação Idempotente da Licença Definitiva (com verificação autoritativa no gateway, combate a fraudes e idempotência atômica)
app.post('/api/subscriptions/activate-lifetime', subscriptionEndpointsLimiter, requireTenantManagerOrOwner((req) => req.body?.barbershopId), async (req: Request, res: Response) => {
  try {
    const {
      barbershopId,
      paymentId,
      checkoutOperationId,
      preferenceId,
      paymentMethod = 'Mercado Pago (Pagamento Único)'
    } = req.body;

    if (!barbershopId) {
      return res.status(400).json({ error: 'barbershopId é obrigatório' });
    }

    if (!paymentId) {
      return res.status(400).json({
        error: 'paymentId do Mercado Pago é obrigatório para ativação da licença definitiva.'
      });
    }

    const stringPaymentId = String(paymentId).trim();
    const { firestore } = getFirebaseAdmin();
    const subRef = firestore.collection('subscriptions').doc(`sub-${barbershopId}`);
    const shopRef = firestore.collection('barbershops').doc(barbershopId);
    const paymentRef = firestore.collection('subscription_payments').doc(`pay-${stringPaymentId}`);
    const globalPaymentDocRef = firestore.collection('mp_claimed_payments').doc(`payment-${stringPaymentId}`);

    // Validação obrigatória da conta recebedora autorizada (FAIL-CLOSED)
    const expectedCollectorId = await getAuthorizedCollectorId();
    if (!expectedCollectorId) {
      return res.status(422).json({
        error: 'Identidade da conta recebedora autorizada da plataforma não pôde ser validada. Ativação abortada de forma segura.'
      });
    }

    // Consulta autoritativa no Mercado Pago (Fail-Closed)
    let verifiedPaymentAmount = 799.00;
    let verifiedPaymentMethod = paymentMethod;
    let verifiedPayerEmail = '';
    let mpPreferenceId = preferenceId || '';

    if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
      const mpData = await callMercadoPago(`/v1/payments/${encodeURIComponent(stringPaymentId)}`);
      if (!mpData || !mpData.id) {
        return res.status(404).json({
          error: `Pagamento '${stringPaymentId}' não foi localizado na API do Mercado Pago.`
        });
      }

      // Validação obrigatória do recebedor (collector_id)
      const paymentCollectorId = mpData.collector_id ?? mpData.collector?.id;
      if (!paymentCollectorId || String(paymentCollectorId).trim() !== expectedCollectorId) {
        return res.status(422).json({
          error: 'Recebedor do pagamento não confere com a conta oficial autorizada da plataforma My Barber.'
        });
      }

      // Valida status aprovado
      if (mpData.status !== 'approved') {
        return res.status(422).json({
          error: `O pagamento não está aprovado no Mercado Pago (status atual: ${mpData.status}, detalhe: ${mpData.status_detail}).`
        });
      }

      // Valida moeda BRL
      if (mpData.currency_id && mpData.currency_id !== 'BRL') {
        return res.status(422).json({
          error: `Moeda do pagamento inválida: ${mpData.currency_id}. Exigido BRL.`
        });
      }

      // Valida valor exato R$ 799,00
      const amount = Number(mpData.transaction_amount);
      if (isNaN(amount) || amount !== 799.00) {
        return res.status(422).json({
          error: `Valor do pagamento incompatível com Compra Definitiva: R$ ${amount}. Exigido exatamente R$ 799,00.`
        });
      }

      // Valida referência ao tenant (external_reference ou metadata)
      const extRef = mpData.external_reference || mpData.metadata?.barbershop_id;
      if (extRef && extRef !== barbershopId) {
        return res.status(403).json({
          error: `O pagamento informado pertence a outro estabelecimento (${extRef}) e não confere com ${barbershopId}.`
        });
      }

      mpPreferenceId = mpData.preference_id || mpData.order?.id || mpData.metadata?.preference_id || mpPreferenceId;
      verifiedPaymentAmount = amount;
      verifiedPaymentMethod = mpData.payment_method_id || verifiedPaymentMethod;
      verifiedPayerEmail = mpData.payer?.email || '';
    } else if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        error: 'Gateway de pagamento Mercado Pago indisponível para validação autoritativa.'
      });
    }

    // Validação de vínculo transacional com a operação de checkout
    const opId = checkoutOperationId;
    let matchedCheckoutDocRef: any = null;
    let matchedCheckout: any = null;

    if (opId) {
      const doc = await firestore.collection('lifetime_checkouts').doc(String(opId)).get();
      if (doc.exists) {
        matchedCheckoutDocRef = doc.ref;
        matchedCheckout = doc.data();
      }
    }
    if (!matchedCheckout && mpPreferenceId) {
      const doc = await firestore.collection('lifetime_checkouts').doc(`pref-${String(mpPreferenceId)}`).get();
      if (doc.exists) {
        matchedCheckoutDocRef = doc.ref;
        matchedCheckout = doc.data();
      }
    }

    if (matchedCheckout) {
      if (matchedCheckout.tenantId && matchedCheckout.tenantId !== barbershopId) {
        return res.status(403).json({
          error: `A operação de checkout informada pertence a outro estabelecimento (${matchedCheckout.tenantId}).`
        });
      }
      if (Number(matchedCheckout.amount) !== 799.00 || matchedCheckout.currency !== 'BRL') {
        return res.status(422).json({
          error: 'Operação de checkout com valores inconsistentes para compra definitiva.'
        });
      }
    }

    const nowIso = new Date().toISOString();
    const subDoc = await subRef.get();
    let existingSub: StoredSubscription | null = null;
    if (subDoc.exists) {
      existingSub = subDoc.data() as StoredSubscription;
    } else if (subscriptionsDB.has(barbershopId)) {
      existingSub = subscriptionsDB.get(barbershopId)!;
    }

    const previousPreapprovalId = existingSub?.mercadopagoSubscriptionId || null;
    const payerEmail = verifiedPayerEmail || existingSub?.payerEmail || 'contato@barbearia.com.br';
    const shopName = existingSub?.barbershopName || 'Barbearia';

    const updatedSub: StoredSubscription = {
      id: `sub-${barbershopId}`,
      barbershopId,
      barbershopName: shopName,
      payerEmail,
      payerName: existingSub?.payerName || '',
      payerPhone: existingSub?.payerPhone || '',
      mercadopagoSubscriptionId: `lifetime-${stringPaymentId}`,
      status: 'LIFETIME_LICENSE',
      plan: 'My Barber Compra Definitiva',
      planId: 'plano-vitalicio',
      isLifetime: true,
      lifetimePurchasedAt: nowIso,
      previousSubscriptionId: previousPreapprovalId || undefined,
      currentPrice: 0.00,
      billingCycle: 'ONE_TIME',
      isInTrial: false,
      paidBillingCount: (existingSub?.paidBillingCount || 0) + 1,
      trialOrLaunchPeriod: false,
      billingCount: (existingSub?.billingCount || 0) + 1,
      nextBillingDate: 'VITALICIO',
      cardValidated: true,
      toleranceDays: 7,
      createdAt: existingSub?.createdAt || nowIso,
      updatedAt: nowIso
    };

    const paymentRecord: StoredPayment = {
      id: `pay-${stringPaymentId}`,
      subscriptionId: updatedSub.id,
      barbershopId,
      barbershopName: shopName,
      mercadopagoPaymentId: stringPaymentId,
      amount: verifiedPaymentAmount,
      currency: 'BRL',
      status: 'APPROVED',
      statusDetail: 'accredited',
      paymentDate: nowIso.split('T')[0],
      billingNumber: updatedSub.paidBillingCount,
      paymentMethod: verifiedPaymentMethod,
      createdAt: nowIso
    };

    // EXECUÇÃO ATÔMICA COM TRAVA GLOBAL NO FIRESTORE (GARANTIA CONTRA DUPLICIDADE E CONCORRÊNCIA)
    let transactionOutcome: { isIdempotentRetry: boolean; subscription: StoredSubscription };

    const executeClaimTransaction = async (transaction: any) => {
      const claimDoc = await transaction.get(globalPaymentDocRef);
      const currentSubDoc = await transaction.get(subRef);
      const subDataInTx = currentSubDoc.exists ? (currentSubDoc.data() as StoredSubscription) : null;

      if (claimDoc.exists) {
        const claimData = claimDoc.data() as { tenantId: string; paymentId: string; status: string };
        if (claimData.tenantId !== barbershopId) {
          const conflictErr = new Error(`Este identificador de pagamento já foi reivindicado por outro estabelecimento (${claimData.tenantId}) e não pode ser reutilizado.`);
          (conflictErr as any).statusCode = 409;
          throw conflictErr;
        }
        if (subDataInTx?.status === 'LIFETIME_LICENSE') {
          return {
            isIdempotentRetry: true,
            subscription: subDataInTx
          };
        }
      }

      transaction.set(globalPaymentDocRef, {
        tenantId: barbershopId,
        paymentId: stringPaymentId,
        amount: verifiedPaymentAmount,
        currency: 'BRL',
        status: 'CLAIMED',
        claimedAt: nowIso
      });

      if (matchedCheckoutDocRef) {
        transaction.set(matchedCheckoutDocRef, {
          status: 'COMPLETED',
          completedAt: nowIso,
          paymentId: stringPaymentId
        }, { merge: true });
      }

      transaction.set(subRef, updatedSub, { merge: true });
      transaction.set(shopRef, { planId: 'plano-vitalicio', updatedAt: nowIso }, { merge: true });
      transaction.set(paymentRef, paymentRecord, { merge: true });

      return {
        isIdempotentRetry: false,
        subscription: updatedSub
      };
    };

    try {
      transactionOutcome = await firestore.runTransaction(executeClaimTransaction);
    } catch (txErr: any) {
      if (txErr.statusCode === 409 || txErr.message?.includes('já foi reivindicado')) {
        return res.status(409).json({ error: txErr.message });
      }
      throw txErr;
    }

    if (transactionOutcome.isIdempotentRetry) {
      return res.status(200).json({
        success: true,
        subscription: transactionOutcome.subscription,
        message: 'Licença vitalícia já estava ativa para este estabelecimento.'
      });
    }

    // Cancelamento da assinatura recorrente anterior no Mercado Pago com registro durável
    if (previousPreapprovalId) {
      const cancellationDocRef = firestore.collection('pending_cancellations').doc(`cancel-${previousPreapprovalId}`);
      await cancellationDocRef.set({
        id: `cancel-${previousPreapprovalId}`,
        preapprovalId: previousPreapprovalId,
        barbershopId,
        reason: 'LIFETIME_LICENSE_MIGRATION',
        createdAt: nowIso,
        status: 'PENDING',
        retryCount: 0,
        lastAttemptAt: nowIso
      }, { merge: true });

      if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
        try {
          const cancelResult = await cancelMercadoPagoSubscription(previousPreapprovalId);
          await cancellationDocRef.set({
            status: 'CONFIRMED',
            confirmedAt: new Date().toISOString(),
            gatewayResponse: cancelResult ? { status: cancelResult.status || 'cancelled' } : { status: 'cancelled' }
          }, { merge: true });

          await firestore.collection('subscriptions').doc(`sub-${barbershopId}`).set({
            previousSubscriptionCancellation: {
              preapprovalId: previousPreapprovalId,
              status: 'CONFIRMED',
              confirmedAt: new Date().toISOString()
            }
          }, { merge: true });
        } catch (cancelErr: any) {
          console.warn('[server.ts] Falha transitória ao cancelar assinatura anterior no MP. Registrado para retry durável:', cancelErr?.message);
          await cancellationDocRef.set({
            status: 'FAILED',
            failedAt: new Date().toISOString(),
            errorMessage: cancelErr?.message || 'Gateway error',
            retryCount: 1,
            nextRetryAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
          }, { merge: true });

          await firestore.collection('subscriptions').doc(`sub-${barbershopId}`).set({
            previousSubscriptionCancellation: {
              preapprovalId: previousPreapprovalId,
              status: 'FAILED',
              failedAt: new Date().toISOString(),
              error: cancelErr?.message || 'Gateway error'
            }
          }, { merge: true });
        }
      } else {
        await cancellationDocRef.set({
          status: 'CONFIRMED',
          confirmedAt: new Date().toISOString(),
          gatewayResponse: { status: 'cancelled', mock: true }
        }, { merge: true });

        await firestore.collection('subscriptions').doc(`sub-${barbershopId}`).set({
          previousSubscriptionCancellation: {
            preapprovalId: previousPreapprovalId,
            status: 'CONFIRMED',
            confirmedAt: new Date().toISOString()
          }
        }, { merge: true });
      }
    }

    subscriptionsDB.set(barbershopId, updatedSub);
    paymentsDB.unshift(paymentRecord);

    // Auditoria
    await recordAuditLog({
      actorUid: (req as any).user?.uid || 'user',
      actorRole: (req as any).user?.role || 'owner',
      tenantId: barbershopId,
      action: 'LIFETIME_LICENSE_ACTIVATED',
      targetType: 'subscription',
      targetId: updatedSub.id,
      previousState: null,
      newState: { status: 'LIFETIME_LICENSE', planId: 'plano-vitalicio', paymentId: stringPaymentId },
      details: `Licença permanente ativada (Compra Definitiva R$ ${verifiedPaymentAmount.toFixed(2)}). Recorrência anterior cancelada.`,
      requestId: (req as any).id
    });

    res.status(200).json({
      success: true,
      subscription: updatedSub,
      message: 'Compra Definitiva ativada com sucesso! Acesso permanente liberado e assinatura recorrente anterior cancelada.'
    });
  } catch (err: any) {
    return sendSanitizedInternalError(res, err, {
      req,
      operation: 'activate_lifetime',
      publicMessage: 'Erro interno ao ativar Compra Definitiva.',
      extra: { barbershopId: req.body?.barbershopId }
    });
  }
});

// 2.3 Retentativa Segura de Cancelamento de Assinatura Anterior
app.post('/api/subscriptions/retry-cancel-previous', subscriptionEndpointsLimiter, requireTenantManagerOrOwner((req) => req.body?.barbershopId), async (req: Request, res: Response) => {
  try {
    const { barbershopId, preapprovalId } = req.body;
    if (!barbershopId) {
      return res.status(400).json({ error: 'barbershopId é obrigatório' });
    }

    const { firestore } = getFirebaseAdmin();
    let targetPreapprovalId = preapprovalId;

    if (!targetPreapprovalId) {
      const subDoc = await firestore.collection('subscriptions').doc(`sub-${barbershopId}`).get();
      if (subDoc.exists) {
        const subData = subDoc.data() as StoredSubscription;
        targetPreapprovalId = subData.previousSubscriptionId;
      }
    }

    if (!targetPreapprovalId) {
      return res.status(404).json({ error: 'Nenhuma assinatura anterior pendente de cancelamento encontrada para esta barbearia.' });
    }

    const cancellationDocRef = firestore.collection('pending_cancellations').doc(`cancel-${targetPreapprovalId}`);
    const cancelDoc = await cancellationDocRef.get();
    const cancelData = cancelDoc.exists ? cancelDoc.data() : null;

    if (cancelData?.status === 'CONFIRMED') {
      return res.status(200).json({
        success: true,
        status: 'CONFIRMED',
        message: 'Assinatura anterior já está cancelada e confirmada no gateway.'
      });
    }

    const nowIso = new Date().toISOString();
    const currentRetries = (cancelData?.retryCount || 0) + 1;

    if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
      try {
        const cancelResult = await cancelMercadoPagoSubscription(targetPreapprovalId);
        await cancellationDocRef.set({
          status: 'CONFIRMED',
          confirmedAt: nowIso,
          retryCount: currentRetries,
          lastAttemptAt: nowIso,
          gatewayResponse: cancelResult ? { status: cancelResult.status || 'cancelled' } : { status: 'cancelled' }
        }, { merge: true });

        await firestore.collection('subscriptions').doc(`sub-${barbershopId}`).set({
          previousSubscriptionCancellation: {
            preapprovalId: targetPreapprovalId,
            status: 'CONFIRMED',
            confirmedAt: nowIso
          }
        }, { merge: true });

        return res.status(200).json({
          success: true,
          status: 'CONFIRMED',
          message: 'Cancelamento da assinatura anterior confirmado com sucesso no gateway.'
        });
      } catch (err: any) {
        await cancellationDocRef.set({
          status: 'FAILED',
          failedAt: nowIso,
          retryCount: currentRetries,
          lastAttemptAt: nowIso,
          errorMessage: err?.message || 'Gateway error'
        }, { merge: true });

        return res.status(502).json({
          error: 'Falha ao cancelar assinatura anterior no gateway. Registrado para nova tentativa.',
          status: 'FAILED',
          retryCount: currentRetries
        });
      }
    } else {
      await cancellationDocRef.set({
        status: 'CONFIRMED',
        confirmedAt: nowIso,
        retryCount: currentRetries,
        lastAttemptAt: nowIso,
        mock: true
      }, { merge: true });

      await firestore.collection('subscriptions').doc(`sub-${barbershopId}`).set({
        previousSubscriptionCancellation: {
          preapprovalId: targetPreapprovalId,
          status: 'CONFIRMED',
          confirmedAt: nowIso
        }
      }, { merge: true });

      return res.status(200).json({
        success: true,
        status: 'CONFIRMED',
        message: 'Cancelamento da assinatura anterior confirmado com sucesso (modo simulado).'
      });
    }
  } catch (err: any) {
    return sendSanitizedInternalError(res, err, {
      req,
      operation: 'retry_cancel_previous',
      publicMessage: 'Erro interno ao tentar cancelar assinatura anterior.'
    });
  }
});

// 2.4 Visibilidade Administrativa de Cancelamentos Pendentes
app.get('/api/subscriptions/pending-cancellations', subscriptionEndpointsLimiter, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { firestore } = getFirebaseAdmin();
    const snapshot = await firestore.collection('pending_cancellations').get();
    const items = (snapshot.docs || []).map((d: any) => ({ id: d.id, ...d.data() }));
    return res.status(200).json({
      total: items.length,
      pending: items.filter((i: any) => i.status === 'PENDING' || i.status === 'FAILED'),
      confirmed: items.filter((i: any) => i.status === 'CONFIRMED'),
      items
    });
  } catch (err: any) {
    return sendSanitizedInternalError(res, err, {
      req,
      operation: 'list_pending_cancellations',
      publicMessage: 'Erro ao listar pendências de cancelamento.'
    });
  }
});

// 3. Get Subscription Status for a Barbershop (AUTORIDADE SOBERANA: FIRESTORE)
app.get(
  '/api/subscriptions/status/:barbershopId',
  subscriptionEndpointsLimiter,
  requireTenantManagerOrOwner((req) => req.params.barbershopId),
  async (req: Request, res: Response) => {
    const { barbershopId } = req.params;

    // FASE 3.5D: Firestore é a única fonte da verdade (P1 resolvido)
    // Autoridade soberana garantida via firestore.collection('subscriptions').doc(`sub-${barbershopId}`).get()
    const result = await getAuthoritativeSubscriptionStatus({
      barbershopId,
      memoryCache: subscriptionsDB,
      paymentsGetter: async (bId: string) => {
        const { firestore } = getFirebaseAdmin();
        let payments: StoredPayment[] = [];
        try {
          const paymentsSnap = await firestore.collection('subscription_payments')
            .where('barbershopId', '==', bId)
            .get();
          if (!paymentsSnap.empty) {
            paymentsSnap.forEach(doc => {
              payments.push(doc.data() as StoredPayment);
            });
            payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }
        } catch (fsErr) {
          console.warn('[server.ts] Erro ao consultar subscription_payments no Firestore:', fsErr);
        }
        if (payments.length === 0) {
          payments = paymentsDB
            .filter(p => p.barbershopId === bId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        return payments;
      }
    });

    if (result.statusCode !== 200) {
      return res.status(result.statusCode).json({ error: result.error });
    }

    return res.status(200).json({
      subscription: result.subscription,
      payments: result.payments || []
    });
  }
);

// 4. Get All Subscriptions (Master Admin Telemetry - Baseada soberanamente no Firestore)
// NOTA DE ARQUITETURA: Consulta a coleção canônica 'subscriptions' do Firestore; nunca mascara erros com dados fictícios.
app.get('/api/subscriptions/all', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const { firestore } = getFirebaseAdmin();
    const subsSnap = await firestore.collection('subscriptions').get();
    
    // Atualiza cache em memória
    subscriptionsDB.clear();
    const allSubs: StoredSubscription[] = [];
    subsSnap.docs.forEach(doc => {
      const sub = { ...doc.data(), id: doc.id } as StoredSubscription;
      allSubs.push(sub);
      if (sub.barbershopId) {
        subscriptionsDB.set(sub.barbershopId, sub);
      }
    });

    // REGRA FASE 5.2E: Compra Definitiva é receita avulsa única e NÃO deve compor o MRR recorrente mensal
    const totalMRR = allSubs
      .filter(s => (s.status === 'ACTIVE' || s.status === 'PAST_DUE') && !s.isLifetime && s.planId !== 'plano-vitalicio')
      .reduce((sum, s) => sum + (Number(s.currentPrice) || 0), 0);

    const lifetimeCount = allSubs.filter(s => s.status === 'LIFETIME_LICENSE' || s.isLifetime).length;
    const lifetimeRevenue = paymentsDB
      .filter(p => p.status === 'APPROVED' && (p.amount === 799 || p.paymentMethod?.includes('Compra Definitiva')))
      .reduce((sum, p) => sum + p.amount, 0);

    const trialCount = allSubs.filter(s => s.status === 'TRIAL_14_DAYS').length;
    const promoCount = allSubs.filter(s => s.status === 'ACTIVE' && s.paidBillingCount >= 1 && s.paidBillingCount <= 3).length;
    const regularCount = allSubs.filter(s => s.status === 'ACTIVE' && s.paidBillingCount >= 4).length;
    const activeCount = allSubs.filter(s => s.status === 'ACTIVE' || s.status === 'TRIAL_14_DAYS' || s.status === 'LIFETIME_LICENSE').length;
    const pastDueCount = allSubs.filter(s => s.status === 'PAST_DUE').length;
    const suspendedCount = allSubs.filter(s => s.status === 'SUSPENDED').length;
    const canceledCount = allSubs.filter(s => s.status === 'CANCELED').length;
    const pendingCount = allSubs.filter(s => s.status === 'PENDING').length;

    res.json({
      subscriptions: allSubs,
      payments: paymentsDB,
      metrics: {
        totalMRR,
        totalCount: allSubs.length,
        activeCount,
        lifetimeCount,
        lifetimeRevenue,
        trialCount,
        promoCount,
        regularCount,
        pastDueCount,
        suspendedCount,
        canceledCount,
        pendingCount
      }
    });
  } catch (err: any) {
    console.error('[Subscriptions/All] Erro ao consultar Firestore:', err);
    return res.status(503).json({
      error: 'Falha ao consultar a fonte canônica de assinaturas no Firestore.',
      details: err?.message || String(err)
    });
  }
});

// 5. Cancel Subscription (FASE 3.5F: AUTORIDADE SOBERANA NO FIRESTORE)
app.post(
  '/api/subscriptions/cancel',
  subscriptionEndpointsLimiter,
  requireTenantOwner((req) => req.body?.barbershopId),
  async (req: Request, res: Response) => {
    try {
      const { barbershopId, reason } = req.body;
      const actor = (req as AuthenticatedRequest).user;
      const result = await authoritativeCancelSubscription({
        barbershopId,
        reason,
        memoryCache: subscriptionsDB,
        gatewayCanceler: cancelMercadoPagoSubscription
      });

      if (result.success && result.subscription) {
        // Registro de auditoria administrativa oficial (FASE 4.4B)
        await recordAuditLog({
          actorUid: actor?.uid || 'unknown_owner',
          actorRole: actor?.role || 'barbershop_owner',
          tenantId: barbershopId,
          action: 'SUBSCRIPTION_CANCELED',
          targetType: 'subscription',
          targetId: result.subscription.id,
          previousState: { status: 'ACTIVE' },
          newState: { status: result.subscription.status, canceledAt: result.subscription.canceledAt },
          details: reason || 'Cancelamento solicitado pelo gestor',
          requestId: (req as any).id
        });
      }

      return res.status(result.statusCode).json({
        success: result.success,
        subscription: result.subscription,
        message: result.message,
        error: result.error
      });
    } catch (err: any) {
      return sendSanitizedInternalError(res, err, {
        req,
        operation: 'cancel_subscription',
        publicMessage: 'Erro interno ao cancelar assinatura.',
        extra: { barbershopId: req.body?.barbershopId }
      });
    }
  }
);

// 6. Sync Subscription directly with Mercado Pago (FASE 3.5F: SEM FALLBACK SILENCIOSO PARA RAM)
app.post(
  '/api/subscriptions/sync/:barbershopId',
  subscriptionEndpointsLimiter,
  requireTenantManagerOrOwner((req) => req.params.barbershopId),
  async (req: Request, res: Response) => {
    const { barbershopId } = req.params;
    const cleanBarbershopId = barbershopId?.trim();
    if (!cleanBarbershopId) {
      return res.status(400).json({ error: 'barbershopId é obrigatório' });
    }

    const { firestore } = getFirebaseAdmin();
    const subRef = firestore.collection('subscriptions').doc(`sub-${cleanBarbershopId}`);

    let subscription: StoredSubscription | null = null;
    try {
      const subDoc = await subRef.get();
      if (!subDoc.exists) {
        return res.status(404).json({ error: 'Assinatura não encontrada' });
      }
      subscription = subDoc.data() as StoredSubscription;
    } catch (fsErr) {
      console.error('[server.ts] Erro ao consultar Firestore no sync:', fsErr);
      // REQUISITO P2 ELIMINADO: Proibido fallback silencioso para subscriptionsDB
      return res.status(503).json({ error: 'Serviço de banco de dados temporariamente indisponível. Sincronização abortada.' });
    }

    if (process.env.MERCADOPAGO_ACCESS_TOKEN && subscription.mercadopagoSubscriptionId) {
      const mpData = await callMercadoPago(`/preapproval/${subscription.mercadopagoSubscriptionId}`);
      if (mpData) {
        const nowIso = new Date().toISOString();
        const prevStatus = subscription.status;
        // Se a assinatura está CANCELED, não reativa para ACTIVE/TRIAL (CANCELED é terminal)
        if (subscription.status !== 'CANCELED') {
          const syncResult = applyPreapprovalSyncToSubscription(subscription as any, mpData, nowIso);
          subscription = syncResult.subscription as StoredSubscription;
        }

        subscriptionsDB.set(cleanBarbershopId, subscription);

        try {
          await subRef.set(subscription, { merge: true });
        } catch (fsErr) {
          console.warn('[server.ts] Erro ao persistir sync no Firestore:', fsErr);
          return res.status(503).json({ error: 'Falha ao persistir sincronização no banco de dados autoritativo' });
        }

        // Auditoria administrativa oficial apenas se houver mutação real de estado (FASE 4.4D)
        if (prevStatus !== subscription.status) {
          await recordAuditLog({
            actorUid: (req as any).user?.uid || 'manager',
            actorRole: (req as any).user?.role || 'barbershop_owner',
            tenantId: cleanBarbershopId,
            action: 'SUBSCRIPTION_SYNCED',
            targetType: 'subscription',
            targetId: subscription.id,
            previousState: { status: prevStatus },
            newState: { status: subscription.status },
            details: 'Sincronização com Mercado Pago produziu alteração de status',
            requestId: (req as any).id
          });
        }
      }
    }

    return res.json({ success: true, subscription });
  }
);

// 6b. Explicit Reconcile Subscription endpoint (FASE 3.5F: SEM FALLBACK SILENCIOSO PARA RAM)
app.post(
  '/api/subscriptions/reconcile/:barbershopId',
  subscriptionEndpointsLimiter,
  requireTenantManagerOrOwner((req) => req.params.barbershopId),
  async (req: Request, res: Response) => {
    const { barbershopId } = req.params;
    const cleanBarbershopId = barbershopId?.trim();
    if (!cleanBarbershopId) {
      return res.status(400).json({ error: 'barbershopId é obrigatório' });
    }

    const { firestore } = getFirebaseAdmin();
    const subRef = firestore.collection('subscriptions').doc(`sub-${cleanBarbershopId}`);

    let subscription: StoredSubscription | null = null;
    try {
      const subDoc = await subRef.get();
      if (!subDoc.exists) {
        return res.status(404).json({ error: 'Assinatura não encontrada para este estabelecimento' });
      }
      subscription = subDoc.data() as StoredSubscription;
    } catch (fsErr) {
      console.error('[server.ts] Erro ao consultar Firestore na reconciliação:', fsErr);
      // REQUISITO P2 ELIMINADO: Proibido fallback silencioso para subscriptionsDB
      return res.status(503).json({ error: 'Serviço de banco de dados temporariamente indisponível. Reconciliação abortada.' });
    }

    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      return res.status(503).json({ error: 'Gateway de pagamento indisponível' });
    }

    let mpData: any = null;
    if (subscription.mercadopagoSubscriptionId) {
      const resMp = await callMercadoPagoWithDetails(`/preapproval/${encodeURIComponent(subscription.mercadopagoSubscriptionId)}`);
      if (resMp.ok && resMp.data) {
        mpData = resMp.data;
      }
    }

    if (!mpData) {
      // Tentar busca de contrato existente no gateway por barbershopId
      const searchRes = await searchPreapprovalsByTenant(
        cleanBarbershopId,
        {
          barbershopId: cleanBarbershopId,
          payerEmail: subscription.payerEmail,
          planId: subscription.planId || '',
          expectedAmount: subscription.currentPrice || 0
        },
        callMercadoPagoWithDetails
      );

      if (searchRes.status === 'RECOVERED' && searchRes.candidate) {
        mpData = searchRes.candidate;
      } else if (searchRes.status === 'AMBIGUOUS') {
        return res.status(409).json({
          error: 'Múltiplas preapprovals encontradas no Mercado Pago para este estabelecimento. Reconciliação manual obrigatória para evitar cobrança duplicada.',
          candidatesCount: searchRes.candidates?.length
        });
      }
    }

    if (!mpData) {
      return res.status(404).json({
        error: 'Nenhum contrato correspondente encontrado no Mercado Pago para reconciliação.'
      });
    }

    let { reconciledSubscription, hasDivergence, divergences } = reconcileSubscriptionWithMercadoPago(
      subscription,
      mpData
    );

    if (hasDivergence) {
      subscriptionsDB.set(cleanBarbershopId, reconciledSubscription);
      try {
        await subRef.set(reconciledSubscription, { merge: true });
      } catch (fsErr) {
        console.warn('[server.ts] Erro ao persistir reconciliação no Firestore:', fsErr);
        return res.status(503).json({ error: 'Falha ao persistir reconciliação no banco de dados autoritativo' });
      }

      // Auditoria administrativa oficial apenas em caso de divergência resolvida (FASE 4.4D)
      await recordAuditLog({
        actorUid: (req as any).user?.uid || 'manager',
        actorRole: (req as any).user?.role || 'barbershop_owner',
        tenantId: cleanBarbershopId,
        action: 'SUBSCRIPTION_RECONCILED',
        targetType: 'subscription',
        targetId: subscription.id,
        previousState: { status: subscription.status },
        newState: { status: reconciledSubscription.status },
        details: `Reconciliação com Mercado Pago resolveu divergências: ${divergences.join(', ')}`,
        requestId: (req as any).id
      });
    }

    // FASE 3.5B: Reconciliação dos pagamentos (gap de webhooks perdidos)
    let paymentReconciliation: any = null;
    try {
      paymentReconciliation = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: cleanBarbershopId,
        subscription: reconciledSubscription,
        callMpWithDetails: callMercadoPagoWithDetails
      });

      if (paymentReconciliation.newPayments && paymentReconciliation.newPayments.length > 0) {
        for (const p of paymentReconciliation.newPayments) {
          paymentsDB.unshift(p);
        }
        if (paymentReconciliation.updatedSubscription) {
          reconciledSubscription = paymentReconciliation.updatedSubscription as StoredSubscription;
          subscriptionsDB.set(cleanBarbershopId, reconciledSubscription);
        }
      }
    } catch (payReconErr) {
      console.warn('[server.ts] Aviso na reconciliação de pagamentos:', payReconErr);
    }

    return res.json({
      success: true,
      subscription: reconciledSubscription,
      hasDivergence,
      divergences,
      paymentReconciliation,
      message: hasDivergence 
        ? `Reconciliação concluída com ${divergences.length} divergência(s) resolvida(s).` 
        : 'Assinatura está totalmente em conformidade com o Mercado Pago.'
    });
  }
);

// 6c. Dedicated Payment Reconciliation endpoint (FASE 3.5B: Recuperação de Webhooks de Pagamento Perdidos)
app.post('/api/subscriptions/reconcile-payments/:barbershopId',
  subscriptionEndpointsLimiter,
  requireTenantManagerOrOwner((req) => req.params.barbershopId),
  async (req: Request, res: Response) => {
    const { barbershopId } = req.params;
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      return res.status(503).json({ error: 'Gateway de pagamento indisponível' });
    }

    try {
      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId,
        callMpWithDetails: callMercadoPagoWithDetails
      });

      if (result.newPayments && result.newPayments.length > 0) {
        for (const p of result.newPayments) {
          paymentsDB.unshift(p);
        }
        if (result.updatedSubscription) {
          subscriptionsDB.set(barbershopId, result.updatedSubscription as StoredSubscription);
        }

        // Auditoria administrativa oficial apenas se houver novos pagamentos reconciliados (FASE 4.4D)
        await recordAuditLog({
          actorUid: (req as any).user?.uid || 'manager',
          actorRole: (req as any).user?.role || 'barbershop_owner',
          tenantId: barbershopId,
          action: 'SUBSCRIPTION_PAYMENTS_RECONCILED',
          targetType: 'subscription_payments',
          targetId: barbershopId,
          previousState: null,
          newState: { newPaymentsCount: result.newPayments.length },
          details: `${result.newPayments.length} novo(s) pagamento(s) recuperado(s) do Mercado Pago`,
          requestId: (req as any).id
        });
      }

      const statusCode = result.status === 'GATEWAY_ERROR' ? (result.statusCode || 502)
        : (result.status === 'BLOCKED' ? (result.statusCode || 403)
        : (result.status === 'AMBIGUOUS' ? 409
        : (result.status === 'SUBSCRIPTION_NOT_FOUND' ? 404 : 200)));

      return res.status(statusCode).json({
        success: result.status === 'RECONCILED' || result.status === 'NO_NEW_PAYMENTS',
        ...result
      });
    } catch (err: any) {
      return sendSanitizedInternalError(res, err, {
        req,
        operation: 'reconcile_payments_for_barbershop',
        publicMessage: 'Erro interno na reconciliação de pagamentos.',
        extra: { barbershopId }
      });
    }
  }
);

// 6d. Administrative Batch Reconciliation endpoint (FASE 3.5B & 4.2A: Reconciliação Geral Protegida por Lock Distribuído Soberano)
app.post('/api/admin/subscriptions/reconcile-all',
  adminEndpointsLimiter,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      return res.status(503).json({ error: 'Gateway de pagamento indisponível' });
    }

    const { firestore } = getFirebaseAdmin();
    if (!firestore) {
      return res.status(503).json({ error: 'Banco de dados indisponível' });
    }

    const actor = (req as AuthenticatedRequest).user;
    const actorUid = actor?.uid || 'super_admin';

    // 1. Aquisição atômica de lock distribuído no Firestore
    const lockResult = await acquireGlobalReconcileLock(actorUid);
    if (!lockResult.success) {
      const failure = lockResult as { success: false; status: 409 | 503; reason: string; message: string; currentLock?: any };
      return res.status(failure.status).json({
        error: failure.reason,
        message: failure.message,
        currentLock: failure.currentLock
      });
    }

    const { requestId } = lockResult;
    const results: any[] = [];
    let totalReconciled = 0;
    let totalUnchanged = 0;
    let totalErrors = 0;
    let totalInconclusive = 0;

    try {
      // Busca assinaturas ativas, em atraso ou suspensas no Firestore
      const snapshot = await firestore.collection('subscriptions').get();
      const subs = snapshot.docs.map(doc => doc.data() as DurableSubscriptionRecord);

      for (const sub of subs) {
        // Ignora assinaturas que nunca tiveram contrato no gateway
        if (!sub.mercadopagoSubscriptionId && (!sub.barbershopId || sub.status === 'PENDING')) {
          totalUnchanged++;
          continue;
        }

        try {
          const resSingle = await reconcileSubscriptionPaymentsWithMercadoPago({
            barbershopId: sub.barbershopId,
            subscription: sub,
            callMpWithDetails: callMercadoPagoWithDetails
          });

          if (resSingle.newPayments && resSingle.newPayments.length > 0) {
            for (const p of resSingle.newPayments) {
              paymentsDB.unshift(p);
            }
            if (resSingle.updatedSubscription) {
              subscriptionsDB.set(sub.barbershopId, resSingle.updatedSubscription as StoredSubscription);
            }
            totalReconciled += resSingle.newPayments.length;
          } else {
            totalUnchanged++;
          }

          results.push({
            barbershopId: sub.barbershopId,
            status: resSingle.status,
            reconciledCount: resSingle.reconciledPaymentsCount,
            reason: resSingle.reason
          });
        } catch (subErr: any) {
          totalErrors++;
          results.push({
            barbershopId: sub.barbershopId,
            status: 'ERROR',
            error: subErr.message
          });
        }
      }

      const isFullyClean = totalErrors === 0 && totalInconclusive === 0;
      const summary = {
        totalChecked: subs.length,
        totalReconciled,
        totalUnchanged,
        totalErrors,
        totalInconclusive
      };

      // 2. Liberação segura do lock com resumo contábil auditado
      await releaseGlobalReconcileLock(requestId, summary, { status: isFullyClean ? 'COMPLETED' : 'FAILED' });

      // Auditoria administrativa oficial se houver mutações contábeis reais (FASE 4.4D)
      if (totalReconciled > 0) {
        await recordAuditLog({
          actorUid: actorUid,
          actorRole: 'super_admin',
          action: 'BATCH_SUBSCRIPTIONS_RECONCILED',
          targetType: 'subscriptions_batch',
          targetId: 'all',
          previousState: null,
          newState: summary,
          details: `Reconciliação administrativa geral recuperou ${totalReconciled} novos pagamento(s)`,
          requestId
        });
      }

      return res.status(200).json({
        success: isFullyClean,
        completed: isFullyClean,
        ...summary,
        results
      });
    } catch (err: any) {
      await releaseGlobalReconcileLock(requestId, undefined, { status: 'FAILED' });
      return sendSanitizedInternalError(res, err, {
        req,
        operation: 'reconcile_all_subscriptions',
        publicMessage: 'Erro interno ao executar reconciliação geral de assinaturas.',
        extra: { lockRequestId: requestId }
      });
    }
  }
);

// 7. Simulation & Testing Endpoint (Sandbox transitions)
app.post(
  '/api/subscriptions/simulate-action',
  subscriptionEndpointsLimiter,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
  // BLOQUEIO ABSOLUTO EM PRODUÇÃO: Nenhuma flag de simulação pode liberar
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Simulações financeiras arbitrárias estão desabilitadas em ambiente de produção.'
    });
  }
  const { barbershopId, action } = req.body;
  let subscription = subscriptionsDB.get(barbershopId);

  const now = new Date();
  const nowStr = now.toISOString().split('T')[0];
  const trialEnd = get14DaysFromDate(now);

  if (!subscription) {
    subscription = {
      id: `sub-${barbershopId}`,
      barbershopId,
      barbershopName: 'Barbearia Parceira',
      payerEmail: 'contato@barbearia.com.br',
      mercadopagoSubscriptionId: `mp-sim-${Date.now()}`,
      status: 'PENDING',
      plan: 'Plano MY BARBER',
      currentPrice: 0.00,
      billingCycle: 'MONTHLY',
      isInTrial: false,
      trialStartDate: nowStr,
      trialEndDate: trialEnd,
      paidBillingCount: 0,
      trialOrLaunchPeriod: true,
      billingCount: 0,
      nextBillingDate: trialEnd,
      cardValidated: false,
      toleranceDays: 7,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    subscriptionsDB.set(barbershopId, subscription);
  }

  const nowIso = now.toISOString();
  let message = '';

  switch (action) {
    case 'VALIDATE_CARD_AND_START_TRIAL': {
      // Step 1: Card is validated by Mercado Pago -> Starts Free Trial with full access
      const plan = plansDB.get(subscription.planId || 'PLANO_UNICO') || plansDB.get('PLANO_UNICO');
      const trialDays = plan?.hasTrial ? (plan.trialDuration || 14) : 14;
      const firstChargePrice = plan?.hasPromotion ? (plan.promotionalPrice ?? plan.priceMonthly) : plan?.priceMonthly;

      subscription.cardValidated = true;
      subscription.cardBrand = 'Mastercard';
      subscription.cardLastFourDigits = '8822';
      subscription.status = 'TRIAL_14_DAYS';
      subscription.isInTrial = true;
      subscription.trialStartDate = nowStr;
      subscription.trialEndDate = get14DaysFromDate(now);
      subscription.paidBillingCount = 0;
      subscription.currentPrice = 0.00;
      subscription.nextBillingDate = subscription.trialEndDate;
      subscription.updatedAt = nowIso;
      delete subscription.pastDueSince;

      message = `Cartão validado com sucesso pelo Mercado Pago! Período gratuito de ${trialDays} DIAS GRÁTIS iniciado com acesso completo. Primeira cobrança de R$ ${Number(firstChargePrice || 49.90).toFixed(2).replace('.', ',')} programada para ${subscription.trialEndDate}.`;
      break;
    }

    case 'CONFIRM_PAYMENT': {
      // Step 2, 3, 4: Monthly Recurring Billing
      const nextPaidCount = subscription.paidBillingCount + 1;
      subscription.paidBillingCount = nextPaidCount;
      subscription.billingCount = nextPaidCount;
      subscription.status = 'ACTIVE';
      subscription.isInTrial = false;
      subscription.cardValidated = true;
      delete subscription.pastDueSince;

      const plan = plansDB.get(subscription.planId || 'PLANO_UNICO') || plansDB.get('PLANO_UNICO');
      const promoMonths = (plan?.hasPromotion && plan?.promotionDuration) ? plan.promotionDuration : 3;
      const promoPrice = (plan?.hasPromotion && plan?.promotionalPrice !== undefined) ? Number(plan.promotionalPrice) : (plan?.priceMonthly || 49.90);
      const regularPrice = (plan?.hasPromotion && plan?.priceAfterPromotion !== undefined) ? Number(plan.priceAfterPromotion) : (plan?.priceMonthly || 69.90);

      const isPromo = Boolean(plan?.hasPromotion && nextPaidCount <= promoMonths);
      const paidAmount = isPromo ? promoPrice : regularPrice;

      if (!isPromo || nextPaidCount >= promoMonths) {
        subscription.currentPrice = regularPrice;
        subscription.trialOrLaunchPeriod = false;
      } else {
        subscription.currentPrice = promoPrice;
        subscription.trialOrLaunchPeriod = true;
      }

      subscription.nextBillingDate = getNextBillingDate();
      subscription.updatedAt = nowIso;

      // Record payment transaction
      const newPayment: StoredPayment = {
        id: `pay-sim-${Date.now()}`,
        subscriptionId: subscription.id,
        barbershopId: subscription.barbershopId,
        barbershopName: subscription.barbershopName,
        mercadopagoPaymentId: `mp-pay-${Date.now()}`,
        amount: paidAmount,
        status: 'APPROVED',
        statusDetail: 'accredited',
        paymentDate: nowStr,
        billingNumber: nextPaidCount,
        paymentMethod: 'Mercado Pago (Cartão de Crédito)',
        createdAt: nowIso
      };
      paymentsDB.unshift(newPayment);

      if (isPromo) {
        const remainingPromo = promoMonths - nextPaidCount;
        message = `${nextPaidCount}º Mês Pago confirmado (R$ ${paidAmount.toFixed(2).replace('.', ',')}). ${remainingPromo > 0 ? `Restam ${remainingPromo} mês(es) promocionais antes do valor regular de R$ ${regularPrice.toFixed(2).replace('.', ',')}.` : `Oferta promocional concluída! A próxima renovação foi programada para R$ ${regularPrice.toFixed(2).replace('.', ',')}/mês no Mercado Pago.`}`;
      } else {
        message = `Mensalidade regular #${nextPaidCount} faturada em R$ ${paidAmount.toFixed(2).replace('.', ',')} no Mercado Pago.`;
      }
      break;
    }

    case 'TRIGGER_PAST_DUE': {
      subscription.status = 'PAST_DUE';
      subscription.pastDueSince = nowIso;
      subscription.updatedAt = nowIso;
      message = 'Cobrança não autorizada pelo Mercado Pago. Assinatura em tolerância de 7 dias com aviso de regularização.';
      break;
    }

    case 'TRIGGER_SUSPEND': {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      subscription.status = 'SUSPENDED';
      subscription.pastDueSince = eightDaysAgo;
      subscription.updatedAt = nowIso;
      message = 'Prazo de tolerância de 7 dias expirado. Sistema bloqueado operacionalmente até confirmação de pagamento pelo Mercado Pago.';
      break;
    }

    case 'REGULARIZE': {
      subscription.status = subscription.isInTrial ? 'TRIAL_14_DAYS' : 'ACTIVE';
      delete subscription.pastDueSince;
      subscription.updatedAt = nowIso;
      
      const count = Math.max(1, subscription.paidBillingCount || 1);
      const paidAmount = subscription.currentPrice > 0 ? subscription.currentPrice : 49.90;

      const newPayment: StoredPayment = {
        id: `pay-sim-${Date.now()}`,
        subscriptionId: subscription.id,
        barbershopId: subscription.barbershopId,
        barbershopName: subscription.barbershopName,
        mercadopagoPaymentId: `mp-pay-reg-${Date.now()}`,
        amount: paidAmount,
        status: 'APPROVED',
        statusDetail: 'accredited',
        paymentDate: nowStr,
        billingNumber: count,
        paymentMethod: 'Mercado Pago (Regularizado)',
        createdAt: nowIso
      };
      paymentsDB.unshift(newPayment);
      message = 'Pagamento regularizado e confirmado pelo Mercado Pago! Acesso 100% restabelecido.';
      break;
    }

    case 'CANCEL': {
      subscription.status = 'CANCELED';
      subscription.canceledAt = nowIso;
      subscription.updatedAt = nowIso;
      message = 'Assinatura cancelada no Mercado Pago.';
      break;
    }

    case 'MIGRATE_TO_LIFETIME': {
      subscription.status = 'LIFETIME_LICENSE';
      subscription.plan = 'My Barber Compra Definitiva';
      subscription.planId = 'plano-vitalicio';
      subscription.isLifetime = true;
      subscription.currentPrice = 0.00;
      subscription.billingCycle = 'ONE_TIME' as any;
      subscription.lifetimePurchasedAt = nowIso;
      subscription.isInTrial = false;
      subscription.cardValidated = true;
      delete subscription.pastDueSince;
      subscription.updatedAt = nowIso;

      const lifetimePayment: StoredPayment = {
        id: `pay-sim-lifetime-${Date.now()}`,
        subscriptionId: subscription.id,
        barbershopId: subscription.barbershopId,
        barbershopName: subscription.barbershopName,
        mercadopagoPaymentId: `mp-pay-life-${Date.now()}`,
        amount: 799.00,
        currency: 'BRL',
        status: 'APPROVED',
        statusDetail: 'accredited',
        paymentDate: nowStr,
        billingNumber: (subscription.paidBillingCount || 0) + 1,
        paymentMethod: 'Mercado Pago (Compra Definitiva)',
        createdAt: nowIso
      };
      paymentsDB.unshift(lifetimePayment);

      message = 'Migração para Compra Definitiva Vitalícia realizada com sucesso! Pagamento único de R$ 799,00 registrado e recorrência anterior cancelada.';
      break;
    }

    case 'REFUND_LIFETIME': {
      subscription.status = 'SUSPENDED';
      subscription.pastDueSince = nowIso;
      subscription.updatedAt = nowIso;
      (subscription as any).lastReversalAt = nowIso;
      (subscription as any).lastReversalType = 'REFUNDED';

      const refundPayment: StoredPayment = {
        id: `pay-sim-refund-${Date.now()}`,
        subscriptionId: subscription.id,
        barbershopId: subscription.barbershopId,
        barbershopName: subscription.barbershopName,
        mercadopagoPaymentId: `mp-pay-ref-${Date.now()}`,
        amount: 799.00,
        currency: 'BRL',
        status: 'REFUNDED',
        statusDetail: 'refunded',
        paymentDate: nowStr,
        billingNumber: subscription.paidBillingCount || 1,
        paymentMethod: 'Mercado Pago (Estorno)',
        createdAt: nowIso
      };
      paymentsDB.unshift(refundPayment);

      message = 'Estorno de Compra Definitiva processado. Acesso imediatamente revogado (SUSPENDED).';
      break;
    }

    default:
      return res.status(400).json({ error: `Ação desconhecida: ${action}` });
  }

  subscriptionsDB.set(barbershopId, subscription);

  // Auditoria administrativa oficial (FASE 4.4D)
  await recordAuditLog({
    actorUid: (req as any).user?.uid || 'super_admin',
    actorRole: 'super_admin',
    tenantId: barbershopId,
    action: `SUBSCRIPTION_SIMULATED_${action}`,
    targetType: 'subscription',
    targetId: subscription.id,
    previousState: null,
    newState: { status: subscription.status },
    details: `Simulação financeira (${action}): ${message}`,
    requestId: (req as any).id
  });

  res.json({ success: true, subscription, message });
});

// 8. Official Mercado Pago Webhook Handler
app.post('/api/webhooks/mercadopago', webhookLimiter, async (req: any, res: Response) => {
  const eventId = req.query['data.id'] || req.body?.data?.id || req.body?.id || `evt-${Date.now()}`;
  const eventType = req.query.type || req.body?.type || req.body?.action || 'unknown';

  // 1. Validação estrita de assinatura HMAC com Fail Closed e proteção contra replay attacks
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const xSignature = req.headers['x-signature'] as string | undefined;
  const xRequestId = (req.headers['x-request-id'] as string) || '';

  const verification = verifyMercadoPagoWebhookSignature({
    xSignature,
    xRequestId,
    eventId: String(eventId),
    secret: webhookSecret
  });

  if (!verification.valid) {
    if (verification.statusCode === 500) {
      console.error(`[Webhook MP] Fail Closed: ${verification.error}`);
      return res.status(500).json({ error: verification.error });
    }
    console.warn(`[Webhook MP] Requisição rejeitada: ${verification.error}`);
    return res.status(verification.statusCode || 401).json({ error: verification.error });
  }

  // 2. Idempotency Check durável contra redeploy e concorrência multi-instância (Firestore)
  const eventIdStr = String(eventId);
  const eventTypeStr = String(eventType);

  // Verificação rápida em cache de memória
  if (processedWebhookEvents.has(eventIdStr)) {
    console.log(`[Webhook MP] Evento já processado previamente em cache (Idempotência): ${eventIdStr}`);
    return res.status(200).json({ status: 'already_processed', eventId: eventIdStr });
  }

  // Verificação e lock atômico transacional no Firestore
  const claim = await claimWebhookEventExecution(eventIdStr, eventTypeStr);
  if (!claim.acquired) {
    if (claim.reason === 'ALREADY_PROCESSED') {
      console.log(`[Webhook MP] Evento já processado previamente no Firestore (Idempotência): ${eventIdStr}`);
      return res.status(200).json({ status: 'already_processed', eventId: eventIdStr });
    }
    if (claim.reason === 'CURRENTLY_PROCESSING') {
      console.log(`[Webhook MP] Evento está sendo processado por outra instância concorrente: ${eventIdStr}`);
      return res.status(200).json({ status: 'processing_in_progress', eventId: eventIdStr });
    }
  }

  const now = new Date().toISOString();
  const eventRecord: WebhookEvent = {
    id: `evt-log-${Date.now()}`,
    eventId: String(eventId),
    type: String(eventType),
    source: 'MERCADO_PAGO',
    processed: true,
    receivedAt: now,
    processedAt: now,
    payload: req.body,
    status: 'SUCCESS'
  };

  try {
    let affectedBarbershopId: string | undefined;
    let affectedPaymentId: string | undefined;
    let affectedPreapprovalId: string | undefined;

    // 3. Process according to event type
    if (eventType === 'payment' || eventType === 'subscription_authorized_payment') {
      const paymentId = eventId;
      affectedPaymentId = String(paymentId);
      let paymentData: any = null;

      if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
        try {
          paymentData = await callMercadoPago(`/v1/payments/${paymentId}`);
        } catch (mpErr) {
          console.error('[server.ts] Erro de rede/consulta Mercado Pago:', mpErr);
          await markWebhookEventFailed(eventIdStr, 'Falha transitória na consulta do pagamento no Mercado Pago.');
          return res.status(503).json({ error: 'Mercado Pago temporariamente indisponível.' });
        }

        if (!paymentData || paymentData.status === 404 || paymentData.error === 'not_found') {
          await markWebhookEventFailed(eventIdStr, `Pagamento ${paymentId} não encontrado no Mercado Pago.`);
          return res.status(404).json({ error: 'Pagamento não encontrado na API do Mercado Pago.' });
        }
      }

      const externalRef = paymentData?.external_reference || req.body?.external_reference;
      const rawStatus = paymentData?.status || req.body?.data?.status || req.body?.status;
      const rawAmount = paymentData?.transaction_amount ?? req.body?.data?.transaction_amount ?? req.body?.transaction_amount;

      // FAIL CLOSED: Rejeitar dados financeiros incompletos (sem status, sem external_ref ou sem valor válido)
      if (!externalRef || !rawStatus || rawAmount === undefined || rawAmount === null || isNaN(Number(rawAmount))) {
        await markWebhookEventFailed(eventIdStr, 'Dados financeiros incompletos ou inválidos no webhook (external_reference, status ou valor ausentes).');
        return res.status(422).json({ error: 'Dados financeiros insuficientes para confirmação de pagamento.' });
      }

      affectedBarbershopId = externalRef;

      // Localização da assinatura com autoridade no Firestore
      const { firestore } = getFirebaseAdmin();
      const subDoc = await firestore.collection('subscriptions').doc(`sub-${externalRef}`).get();

      let sub: StoredSubscription | null = null;
      if (subDoc.exists) {
        sub = subDoc.data() as StoredSubscription;
      } else if (subscriptionsDB.has(externalRef)) {
        sub = subscriptionsDB.get(externalRef)!;
      }

      if (!sub) {
        await markWebhookEventFailed(eventIdStr, `Assinatura sub-${externalRef} não encontrada no Firestore.`);
        return res.status(404).json({ error: `Assinatura para estabelecimento '${externalRef}' não encontrada.` });
      }

      const status = String(rawStatus).toLowerCase();
      const amount = Number(rawAmount);

      if (status === 'approved') {
        let planDetails: any = null;
        if (sub.planId) {
          try {
            planDetails = await planService.getPlanById(sub.planId);
          } catch (planErr) {
            console.warn(`[Webhook] Aviso ao buscar plano ${sub.planId}:`, planErr);
          }
        }

        const durableResult = await recordDurablePaymentTransaction({
          paymentId: String(paymentId),
          barbershopId: externalRef,
          amount,
          currency: paymentData?.currency_id || 'BRL',
          status: 'APPROVED',
          statusDetail: paymentData?.status_detail || req.body?.data?.status_detail || 'accredited',
          paymentMethod: paymentData?.payment_method_id || req.body?.data?.payment_method_id || 'Cartão de Crédito',
          fallbackSubscription: sub as any,
          nextBillingDate: getNextBillingDate(),
          externalEventDate: paymentData?.date_approved || paymentData?.date_created || req.body?.date_created,
          eventId: eventIdStr,
          planDetails
        });

        const { isNewPayment, paymentRecord, subscriptionRecord, planPricing } = durableResult;
        if (isNewPayment) {
          paymentsDB.unshift(paymentRecord);
        } else {
          const pIdx = paymentsDB.findIndex(p => p.id === paymentRecord.id || p.mercadopagoPaymentId === paymentRecord.mercadopagoPaymentId);
          if (pIdx >= 0) {
            paymentsDB[pIdx] = paymentRecord;
          }
        }
        subscriptionsDB.set(externalRef, subscriptionRecord as any);

        if (subscriptionRecord.status === 'LIFETIME_LICENSE') {
          if (sub.mercadopagoSubscriptionId && process.env.MERCADOPAGO_ACCESS_TOKEN) {
            try {
              await cancelMercadoPagoSubscription(sub.mercadopagoSubscriptionId);
            } catch (cErr) {
              console.warn('[server.ts] Aviso ao cancelar preapproval anterior no MP após compra definitiva:', cErr);
            }
          }
        } else if (
          subscriptionRecord.status === 'ACTIVE' &&
          planPricing?.transitionedToRegular &&
          !planPricing?.preventGatewayPriceUpdate &&
          !subscriptionRecord.needsPricingReconciliation &&
          typeof planPricing?.regularPrice === 'number' &&
          process.env.MERCADOPAGO_ACCESS_TOKEN &&
          subscriptionRecord.mercadopagoSubscriptionId
        ) {
          await updateMercadoPagoSubscriptionPrice(
            subscriptionRecord.mercadopagoSubscriptionId,
            planPricing.regularPrice
          );
        }
      } else if (status === 'rejected') {
        const durableResult = await recordDurablePaymentTransaction({
          paymentId: String(paymentId),
          barbershopId: externalRef,
          amount,
          currency: paymentData?.currency_id || 'BRL',
          status: 'REJECTED',
          statusDetail: paymentData?.status_detail || req.body?.data?.status_detail || 'rejected',
          paymentMethod: paymentData?.payment_method_id || req.body?.data?.payment_method_id || 'Cartão de Crédito',
          fallbackSubscription: sub as any,
          nextBillingDate: getNextBillingDate(),
          externalEventDate: paymentData?.date_created || req.body?.date_created,
          eventId: eventIdStr
        });

        const { isNewPayment, paymentRecord, subscriptionRecord } = durableResult;
        if (isNewPayment) {
          paymentsDB.unshift(paymentRecord);
        }
        subscriptionsDB.set(externalRef, subscriptionRecord as any);
      } else if (status === 'refunded' || status === 'charged_back') {
        const durableResult = await recordDurablePaymentTransaction({
          paymentId: String(paymentId),
          barbershopId: externalRef,
          amount,
          currency: paymentData?.currency_id || 'BRL',
          status: status === 'refunded' ? 'REFUNDED' : 'CHARGED_BACK',
          statusDetail: paymentData?.status_detail || status,
          paymentMethod: paymentData?.payment_method_id || req.body?.data?.payment_method_id || 'Cartão de Crédito',
          fallbackSubscription: sub as any,
          nextBillingDate: getNextBillingDate(),
          externalEventDate: paymentData?.date_last_updated || req.body?.date_created,
          eventId: eventIdStr
        });

        const { isNewPayment, isReversalProcessed, paymentRecord, subscriptionRecord } = durableResult;
        if (isNewPayment) {
          paymentsDB.unshift(paymentRecord);
        } else if (isReversalProcessed) {
          const pIdx = paymentsDB.findIndex(p => p.id === paymentRecord.id || p.mercadopagoPaymentId === paymentRecord.mercadopagoPaymentId);
          if (pIdx >= 0) {
            paymentsDB[pIdx] = paymentRecord;
          } else {
            paymentsDB.unshift(paymentRecord);
          }
        }
        subscriptionsDB.set(externalRef, subscriptionRecord as any);
      }
    } else if (eventType === 'subscription_preapproval') {
      const preapprovalId = eventId;
      affectedPreapprovalId = String(preapprovalId);
      let preapprovalData: any = null;

      if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
        try {
          preapprovalData = await callMercadoPago(`/preapproval/${preapprovalId}`);
        } catch (mpErr) {
          console.error('[server.ts] Erro de rede/consulta Mercado Pago preapproval:', mpErr);
          await markWebhookEventFailed(eventIdStr, 'Falha transitória na consulta de preapproval no Mercado Pago.');
          return res.status(503).json({ error: 'Mercado Pago temporariamente indisponível.' });
        }

        if (!preapprovalData || preapprovalData.status === 404 || preapprovalData.error === 'not_found') {
          await markWebhookEventFailed(eventIdStr, `Preapproval ${preapprovalId} não encontrado no Mercado Pago.`);
          return res.status(404).json({ error: 'Preapproval não encontrado na API do Mercado Pago.' });
        }
      }

      const externalRef = preapprovalData?.external_reference || req.body?.external_reference;
      if (!externalRef) {
        await markWebhookEventFailed(eventIdStr, 'external_reference ausente no evento de preapproval.');
        return res.status(422).json({ error: 'external_reference ausente no preapproval.' });
      }

      affectedBarbershopId = externalRef;

      const preapprovalStatus = preapprovalData?.status || req.body?.data?.status;

      let txResult;
      try {
        txResult = await recordDurablePreapprovalTransaction({
          barbershopId: externalRef,
          preapprovalStatus: preapprovalStatus || '',
          preapprovalId: affectedPreapprovalId,
          now
        });
      } catch (txErr: any) {
        console.error('[server.ts] Erro na transação do Firestore para preapproval:', txErr);
        await markWebhookEventFailed(eventIdStr, `Falha na transação do Firestore: ${txErr.message}`);
        return res.status(500).json({ error: 'Erro ao persistir evento de preapproval.' });
      }

      if (!txResult.found || !txResult.subscriptionRecord) {
        await markWebhookEventFailed(eventIdStr, `Assinatura sub-${externalRef} não encontrada no Firestore.`);
        return res.status(404).json({ error: `Assinatura para estabelecimento '${externalRef}' não encontrada.` });
      }

      subscriptionsDB.set(externalRef, txResult.subscriptionRecord as StoredSubscription);
    }

    // Finalização durável no Firestore
    await finalizeWebhookEvent(eventIdStr, {
      paymentId: affectedPaymentId,
      preapprovalId: affectedPreapprovalId,
      barbershopId: affectedBarbershopId
    });

    processedWebhookEvents.set(eventIdStr, eventRecord);
    logger.info('[Webhook MP] Webhook processado com sucesso', {
      requestId: req.id,
      eventId: eventIdStr,
      eventType: eventTypeStr,
      paymentId: affectedPaymentId,
      preapprovalId: affectedPreapprovalId,
      tenantId: affectedBarbershopId
    });
    res.status(200).json({ status: 'ok', eventId });
  } catch (err: any) {
    logger.error('[Webhook MP] Erro ao processar webhook', {
      requestId: req.id,
      eventId: eventIdStr,
      eventType: eventTypeStr,
      error: err?.message || String(err)
    });
    eventRecord.status = 'ERROR';
    eventRecord.error = err.message;
    processedWebhookEvents.set(eventIdStr, eventRecord);
    await markWebhookEventFailed(eventIdStr, err.message || 'Erro desconhecido');
    res.status(500).json({ error: 'Erro ao processar webhook', requestId: req.id });
  }
});

// =========================================================================
// IAM & CUSTOM CLAIMS SECURE ENDPOINTS (FIREBASE ADMIN SDK)
// =========================================================================

/**
 * POST /api/auth/set-user-role
 * Atribui role e tenantId nos Custom Claims do usuário de forma segura.
 * Requer autenticação via Bearer ID Token com privilégio adequado.
 */
app.post('/api/auth/set-user-role', authEndpointsLimiter, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Cabeçalho de autorização Bearer ausente ou inválido.' });
    }

    const decoded = await verifyFirebaseIdToken(authHeader);
    if (!decoded) {
      return res.status(401).json({ error: 'ID Token do Firebase inválido ou expirado.' });
    }

    const { targetUid, role, tenantId } = req.body;
    if (!targetUid || !role) {
      return res.status(400).json({ error: 'targetUid e role são campos obrigatórios.' });
    }

    // Role e Tenant do solicitante extraídos dos claims verificados do token
    const actorRole = decoded.role || (decoded.isSuperAdmin ? 'super_admin' : 'customer');
    const actorUid = decoded.uid;
    const actorTenantId = (decoded.tenantId as string) || (decoded.barbershopId as string) || undefined;

    const result = await setUserRole({
      targetUid,
      role,
      tenantId,
      actorUid,
      actorRole,
      actorTenantId
    });

    if (!result.success) {
      return res.status(403).json({ error: result.error });
    }

    // Auditoria administrativa oficial (FASE 4.4D)
    await recordAuditLog({
      actorUid,
      actorRole,
      tenantId,
      action: 'USER_ROLE_ASSIGNED',
      targetType: 'user_claims',
      targetId: targetUid,
      previousState: null,
      newState: { role, tenantId, claims: result.claims },
      details: `Atribuição de papel ${role} para UID ${targetUid}`,
      requestId: (req as any).id
    });

    return res.status(200).json({
      success: true,
      claims: result.claims,
      message: `Custom claims atualizados para UID ${targetUid}`
    });
  } catch (err: any) {
    console.error('[API /api/auth/set-user-role] Erro:', err);
    return res.status(500).json({ error: 'Erro interno ao atualizar claims do usuário.' });
  }
});

/**
 * POST /api/auth/grant-super-admin
 * Rota administrativa para concessão de Super Admin.
 * Protegida EXCLUSIVAMENTE por verificação de Firebase ID Token de um Super Admin autenticado.
 */
app.post('/api/auth/grant-super-admin', authEndpointsLimiter, async (req: Request, res: Response) => {
  try {
    const result = await handleGrantSuperAdminRequest(req);

    if (result.status === 200) {
      // Auditoria administrativa oficial (FASE 4.4D)
      await recordAuditLog({
        actorUid: (req as any).user?.uid || 'super_admin',
        actorRole: 'super_admin',
        action: 'SUPER_ADMIN_GRANTED',
        targetType: 'user_claims',
        targetId: req.body?.targetUid || 'unknown',
        previousState: null,
        newState: { role: 'super_admin', isSuperAdmin: true },
        details: `Concessão de privilégio Super Admin para UID ${req.body?.targetUid}`,
        requestId: (req as any).id
      });
    }

    return res.status(result.status).json(result.body);
  } catch (err: any) {
    console.error('[API /api/auth/grant-super-admin] Erro:', err);
    return res.status(500).json({ error: 'Erro ao conceder privilégio de Super Admin.' });
  }
});

/**
 * POST /api/admin/provision-barbershop-owner
 * FASE 1, 2, 3: Provisiona a identidade soberana do gestor no Firebase Authentication,
 * atribui os Custom Claims de 'barbershop_owner' associados ao tenantId da barbearia
 * e cria o perfil de negócio seguro no Firestore (sem persistir senhas).
 * Restrito estritamente a Super Administradores da plataforma.
 */
app.post('/api/admin/provision-barbershop-owner', adminEndpointsLimiter, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { email, name, tenantId, password, phoneNumber, additionalManager } = req.body || {};

    if (!email || !tenantId) {
      return res.status(400).json({ error: 'email e tenantId são campos obrigatórios para provisionar o gestor.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanTenantId = String(tenantId).trim();
    const displayName = name ? String(name).trim() : cleanEmail.split('@')[0];

    // 1. Provisiona identidade oficial no Firebase Authentication
    const managerAuth = await provisionManagerAccount({
      email: cleanEmail,
      displayName,
      password: password && String(password).length >= 6 ? String(password).trim() : undefined,
      phoneNumber: phoneNumber ? String(phoneNumber).trim() : undefined
    });

    const actor = (req as AuthenticatedRequest).user;

    // 2. Atribui Custom Claims oficiais via Firebase Admin SDK
    const roleResult = await setUserRole({
      targetUid: managerAuth.uid,
      role: 'barbershop_owner',
      tenantId: cleanTenantId,
      actorUid: actor?.uid || 'super_admin',
      actorRole: 'super_admin'
    });

    if (!roleResult.success) {
      return res.status(500).json({ error: roleResult.error || 'Falha ao atribuir claims ao gestor.' });
    }

    // 3. Cria / atualiza o perfil em users/{uid} sem senha, sem tokens
    try {
      const { firestore } = getFirebaseAdmin();
      await firestore.collection('users').doc(managerAuth.uid).set({
        id: managerAuth.uid,
        uid: managerAuth.uid,
        email: cleanEmail,
        name: displayName,
        phone: phoneNumber || '',
        whatsapp: phoneNumber || '',
        role: 'PROPRIETARIO',
        canonicalRole: 'barbershop_owner',
        tenantId: cleanTenantId,
        status: 'active',
        authProvider: 'FIREBASE_AUTH',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (fsErr) {
      console.warn('[provision-barbershop-owner] Aviso ao sincronizar perfil no Firestore (não-bloqueante):', fsErr);
    }

    // 4. Se houver gerente adicional configurado, provisiona também
    let additionalManagerUid: string | undefined = undefined;
    if (additionalManager && additionalManager.email) {
      try {
        const addEmail = String(additionalManager.email).trim().toLowerCase();
        const addName = additionalManager.name ? String(additionalManager.name).trim() : addEmail.split('@')[0];
        const addAuth = await provisionManagerAccount({
          email: addEmail,
          displayName: addName,
          password: additionalManager.password && String(additionalManager.password).length >= 6 ? String(additionalManager.password).trim() : undefined,
          phoneNumber: additionalManager.phoneNumber ? String(additionalManager.phoneNumber).trim() : undefined
        });

        await setUserRole({
          targetUid: addAuth.uid,
          role: 'manager',
          tenantId: cleanTenantId,
          actorUid: actor?.uid || 'super_admin',
          actorRole: 'super_admin'
        });

        const { firestore } = getFirebaseAdmin();
        await firestore.collection('users').doc(addAuth.uid).set({
          id: addAuth.uid,
          uid: addAuth.uid,
          email: addEmail,
          name: addName,
          phone: additionalManager.phoneNumber || '',
          whatsapp: additionalManager.phoneNumber || '',
          role: 'GERENTE',
          canonicalRole: 'manager',
          tenantId: cleanTenantId,
          status: 'active',
          authProvider: 'FIREBASE_AUTH',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        additionalManagerUid = addAuth.uid;
      } catch (addErr) {
        console.warn('[provision-barbershop-owner] Aviso ao provisionar gerente adicional:', addErr);
      }
    }

    // 5. Provisiona Barbeiro Oficial inicial canônico (Firebase Auth -> UID -> Claims -> users/{uid})
    let initialBarberData: any = null;
    try {
      const barberName = req.body?.initialBarber?.name || `Barbeiro Oficial (${displayName.split(' ')[0]})`;
      const barberPhone = req.body?.initialBarber?.whatsapp || phoneNumber || '';
      const barberEmail = `barbeiro-${cleanTenantId}@mybarber.com.br`;

      const barberAuth = await provisionProfessionalAccount({
        email: barberEmail,
        displayName: barberName,
        phoneNumber: (barberPhone && String(barberPhone).startsWith('+')) ? String(barberPhone).trim() : undefined
      });

      await setUserRole({
        targetUid: barberAuth.uid,
        role: 'barber',
        tenantId: cleanTenantId,
        actorUid: actor?.uid || 'super_admin',
        actorRole: 'super_admin'
      });

      const { firestore } = getFirebaseAdmin();
      const nowIso = new Date().toISOString();
      const initialBarberDoc = {
        id: barberAuth.uid,
        uid: barberAuth.uid,
        tenantId: cleanTenantId,
        role: 'PROFISSIONAL',
        canonicalRole: 'barber',
        name: barberName,
        email: barberEmail,
        whatsapp: barberPhone,
        phone: barberPhone,
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
        canViewAllProfessionals: false,
        commissionPercentage: 45,
        specialties: ['Degradê Navalhado', 'Barba Terapia', 'Pigmentação'],
        status: 'active',
        authProvider: 'FIREBASE_AUTH',
        createdByUserId: actor?.uid || 'super_admin',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await firestore.collection('users').doc(barberAuth.uid).set(initialBarberDoc, { merge: true });

      try {
        await firestore.collection('publicProfessionalProfiles').doc(barberAuth.uid).set({
          id: barberAuth.uid,
          name: barberName,
          tenantId: cleanTenantId,
          avatarUrl: initialBarberDoc.avatarUrl,
          specialties: initialBarberDoc.specialties
        }, { merge: true });
      } catch (pubErr) {
        console.warn('[provision-barbershop-owner] Aviso ao criar projeção pública do barbeiro:', pubErr);
      }

      initialBarberData = initialBarberDoc;
    } catch (barberErr) {
      console.warn('[provision-barbershop-owner] Aviso ao provisionar barbeiro inicial:', barberErr);
    }

    // 6. Auditoria administrativa oficial (FASE 4.4D)
    await recordAuditLog({
      actorUid: actor?.uid || 'super_admin',
      actorRole: 'super_admin',
      tenantId: cleanTenantId,
      action: 'BARBERSHOP_OWNER_PROVISIONED',
      targetType: 'barbershop_owner',
      targetId: managerAuth.uid,
      previousState: null,
      newState: { email: cleanEmail, tenantId: cleanTenantId, role: 'barbershop_owner' },
      details: `Provisionamento do gestor soberano para ${cleanTenantId}`,
      requestId: (req as any).id
    });

    return res.status(200).json({
      success: true,
      ownerUid: managerAuth.uid,
      email: managerAuth.email,
      tenantId: cleanTenantId,
      role: 'barbershop_owner',
      claims: roleResult.claims,
      additionalManagerUid,
      initialBarber: initialBarberData
    });
  } catch (err: any) {
    return sendSanitizedInternalError(res, err, {
      req,
      operation: 'provision_barbershop_owner',
      publicMessage: 'Erro interno ao provisionar gestor da barbearia.',
      extra: { tenantId: req.body?.tenantId }
    });
  }
});

// =========================================================================
// GESTÃO AUTORITATIVA DE EQUIPE / PROFISSIONAIS (FASE 2.3C)
// =========================================================================
app.post('/api/team/create-professional', teamEndpointsLimiter, requireAuth, handleCreateProfessional);
app.delete('/api/team/professional/:id', teamEndpointsLimiter, requireAuth, handleDeleteProfessional);

// =========================================================================
// GESTÃO AUTORITATIVA DE CLIENTES (FASE 2.4B)
// =========================================================================
app.post('/api/customers/deactivate', teamEndpointsLimiter, requireAuth, handleDeactivateCustomer);

// =========================================================================
// SINCRONIZAÇÃO AUTORITATIVA DE PROJEÇÕES PÚBLICAS DE CATÁLOGO (FASE 2.2E)
// =========================================================================
app.post(
  '/api/catalog/sync-package',
  catalogSyncLimiter,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const packageId = req.body?.packageId || req.body?.id;
      if (!packageId) {
        return res.status(400).json({ error: 'packageId obrigatório não fornecido.' });
      }
      await syncPackageById(packageId, user);
      return res.status(200).json({ success: true, message: 'Projeção pública de pacote sincronizada com sucesso.' });
    } catch (err: any) {
      console.error('[API /api/catalog/sync-package] Erro:', err);
      const status = err.statusCode || (err instanceof CatalogAuthorizationError ? 403 : err instanceof CatalogNotFoundError ? 404 : 500);
      return res.status(status).json({ error: err.message || 'Erro ao sincronizar projeção de pacote.' });
    }
  }
);

app.post(
  '/api/catalog/sync-promotion',
  catalogSyncLimiter,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const promotionId = req.body?.promotionId || req.body?.id;
      if (!promotionId) {
        return res.status(400).json({ error: 'promotionId obrigatório não fornecido.' });
      }
      await syncPromotionById(promotionId, user);
      return res.status(200).json({ success: true, message: 'Projeção pública de promoção sincronizada com sucesso.' });
    } catch (err: any) {
      console.error('[API /api/catalog/sync-promotion] Erro:', err);
      const status = err.statusCode || (err instanceof CatalogAuthorizationError ? 403 : err instanceof CatalogNotFoundError ? 404 : 500);
      return res.status(status).json({ error: err.message || 'Erro ao sincronizar projeção de promoção.' });
    }
  }
);

app.post(
  '/api/catalog/sync-gallery',
  catalogSyncLimiter,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const workId = req.body?.workId || req.body?.id;
      if (!workId) {
        return res.status(400).json({ error: 'workId obrigatório não fornecido.' });
      }
      await syncGalleryById(workId, user);
      return res.status(200).json({ success: true, message: 'Projeção pública de galeria sincronizada com sucesso.' });
    } catch (err: any) {
      console.error('[API /api/catalog/sync-gallery] Erro:', err);
      const status = err.statusCode || (err instanceof CatalogAuthorizationError ? 403 : err instanceof CatalogNotFoundError ? 404 : 500);
      return res.status(status).json({ error: err.message || 'Erro ao sincronizar projeção de galeria.' });
    }
  }
);

app.delete(
  '/api/catalog/package/:tenantId/:id',
  catalogSyncLimiter,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      await deletePackageById(req.params.id, req.params.tenantId, user);
      return res.status(200).json({ success: true, message: 'Projeção pública de pacote removida com sucesso.' });
    } catch (err: any) {
      console.error('[API DELETE /api/catalog/package] Erro:', err);
      const status = err.statusCode || (err instanceof CatalogAuthorizationError ? 403 : 500);
      return res.status(status).json({ error: err.message || 'Erro ao remover projeção de pacote.' });
    }
  }
);

app.delete(
  '/api/catalog/promotion/:tenantId/:id',
  catalogSyncLimiter,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      await deletePromotionById(req.params.id, req.params.tenantId, user);
      return res.status(200).json({ success: true, message: 'Projeção pública de promoção removida com sucesso.' });
    } catch (err: any) {
      console.error('[API DELETE /api/catalog/promotion] Erro:', err);
      const status = err.statusCode || (err instanceof CatalogAuthorizationError ? 403 : 500);
      return res.status(status).json({ error: err.message || 'Erro ao remover projeção de promoção.' });
    }
  }
);

app.delete(
  '/api/catalog/gallery/:tenantId/:id',
  catalogSyncLimiter,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      await deleteGalleryById(req.params.id, req.params.tenantId, user);
      return res.status(200).json({ success: true, message: 'Projeção pública de galeria removida com sucesso.' });
    } catch (err: any) {
      console.error('[API DELETE /api/catalog/gallery] Erro:', err);
      const status = err.statusCode || (err instanceof CatalogAuthorizationError ? 403 : 500);
      return res.status(status).json({ error: err.message || 'Erro ao remover projeção de galeria.' });
    }
  }
);

// Curtida Autoritativa de Fotos da Galeria (Fase 2.2E)
app.post(
  '/api/catalog/gallery/:id/like',
  catalogSyncLimiter,
  async (req: Request, res: Response) => {
    try {
      const workId = req.params.id;
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-client';
      const result = await incrementGalleryLike(workId, clientIp);
      return res.status(200).json({ success: true, likesCount: result.newLikesCount });
    } catch (err: any) {
      console.error('[API /api/catalog/gallery/:id/like] Erro:', err);
      const status = err.statusCode || (err instanceof CatalogAuthorizationError ? 429 : err instanceof CatalogNotFoundError ? 404 : 500);
      return res.status(status).json({ error: err.message || 'Erro ao registrar curtida.' });
    }
  }
);

// =========================================================================
// BOOKING E GESTÃO AUTORITATIVA DE AGENDA (ETAPAS 2.1C & 2.1H)
// =========================================================================
app.post('/api/appointments/book', handleBookAppointment);
app.post('/api/appointments/reschedule', appointmentAdminLimiter, handleRescheduleAppointment);
app.post('/api/appointments/cancel', appointmentAdminLimiter, handleCancelAppointment);

// =========================================================================
// CUSTOMER PACKAGES — CONSUMO ATÔMICO AUTORITATIVO (FASE 4.2A)
// =========================================================================
app.post(
  '/api/customer-packages/:customerPackageId/items/:itemId/consume',
  appointmentAdminLimiter,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = (req as AuthenticatedRequest).user;
      if (!actor) {
        return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Usuário não autenticado.' });
      }

      const { customerPackageId, itemId } = req.params;
      const { idempotencyKey } = req.body || {};

      const result = await consumeCustomerPackageItem({
        customerPackageId,
        itemId,
        idempotencyKey,
        actor
      });

      if (result.isReplay) {
        res.setHeader('X-Cache-Lookup', 'IDEMPOTENT_REPLAY');
      }

      return res.status(result.status).json(result);
    } catch (err: any) {
      return sendSanitizedInternalError(res, err, {
        req,
        operation: 'consume_customer_package',
        publicMessage: 'Erro interno ao processar consumo do pacote.',
        extra: { customerPackageId: req.params.customerPackageId, itemId: req.params.itemId }
      });
    }
  }
);

// =========================================================================
// GESTÃO AUTORITATIVA E ATÔMICA DE ESTOQUE (FASE 4.4B)
// =========================================================================
app.post(
  '/api/stock/:stockItemId/adjust',
  appointmentAdminLimiter,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = (req as AuthenticatedRequest).user;
      if (!actor) {
        return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Usuário não autenticado.' });
      }

      const { stockItemId } = req.params;
      const { delta, idempotencyKey } = req.body || {};

      const result = await adjustStockAuthoritative({
        stockItemId,
        delta: Number(delta),
        idempotencyKey,
        actor,
        requestId: (req as any).id
      });

      if (result.isReplay) {
        res.setHeader('X-Cache-Lookup', 'IDEMPOTENT_REPLAY');
      }

      return res.status(result.status).json(result);
    } catch (err: any) {
      return sendSanitizedInternalError(res, err, {
        req,
        operation: 'adjust_stock',
        publicMessage: 'Erro interno ao processar ajuste de estoque.',
        extra: { stockItemId: req.params.stockItemId, delta: req.body?.delta }
      });
    }
  }
);


// =========================================================================
// VITE / STATIC SERVING & GRACEFUL SHUTDOWN (FASE 4.2A)
// =========================================================================
import { setupGracefulShutdown } from './src/server/gracefulShutdown.js';
export { setupGracefulShutdown };

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // FASE 4.7B: Cache HTTP para assets estáticos versionados/hashados e SPA entry point
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
      }
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`MY BARBER Full-Stack Server rodando na porta ${PORT}`);
  });

  setupGracefulShutdown(server, 10000);
  return server;
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
