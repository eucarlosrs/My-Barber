import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Capture raw body for webhook HMAC validation
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

// Types for backend subscriptions
interface StoredSubscription {
  id: string;
  barbershopId: string;
  barbershopName: string;
  payerEmail: string;
  payerName?: string;
  payerPhone?: string;
  mercadopagoSubscriptionId: string;
  mercadopagoCustomerId?: string;
  status: 'PENDING' | 'TRIAL_14_DAYS' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED';
  plan: string;
  currentPrice: number; // 0.00 durante 14 dias grátis, 49.90 nos meses 1-3, 69.90 a partir do mês 4
  billingCycle: 'MONTHLY';
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
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'REFUNDED';
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

// In-Memory Database with persistent initial seed
const subscriptionsDB: Map<string, StoredSubscription> = new Map([
  [
    'tenant-barbearia-do-joao',
    {
      id: 'sub-barbearia-rodrigues',
      barbershopId: 'tenant-barbearia-do-joao',
      barbershopName: 'Barbearia Rodrigues',
      payerEmail: 'carlos.rodrigues@barbeariarodrigues.com.br',
      payerName: 'Carlos Rodrigues',
      payerPhone: '(11) 98765-4321',
      mercadopagoSubscriptionId: 'mp-sub-2c9380848a90b1',
      mercadopagoCustomerId: 'mp-cust-99881122',
      status: 'ACTIVE',
      plan: 'Plano MY BARBER',
      currentPrice: 49.90,
      billingCycle: 'MONTHLY',
      isInTrial: false,
      trialStartDate: '2026-01-01',
      trialEndDate: '2026-01-15',
      paidBillingCount: 2,
      trialOrLaunchPeriod: true,
      billingCount: 2,
      nextBillingDate: '2026-09-15',
      initPointUrl: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c9380848a90b1',
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
      barbershopName: 'Barbearia Vintage Club',
      payerEmail: 'marcos.vintage@vintageclub.com.br',
      payerName: 'Marcos Vinicius',
      payerPhone: '(21) 99887-7665',
      mercadopagoSubscriptionId: 'mp-sub-2c9380848a90b2',
      mercadopagoCustomerId: 'mp-cust-44556677',
      status: 'ACTIVE',
      plan: 'Plano MY BARBER',
      currentPrice: 69.90,
      billingCycle: 'MONTHLY',
      isInTrial: false,
      trialStartDate: '2025-11-06',
      trialEndDate: '2025-11-20',
      paidBillingCount: 4,
      trialOrLaunchPeriod: false,
      billingCount: 4,
      nextBillingDate: '2026-09-20',
      initPointUrl: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c9380848a90b2',
      cardValidated: true,
      cardBrand: 'Visa',
      cardLastFourDigits: '8899',
      toleranceDays: 7,
      createdAt: '2025-11-06T10:00:00Z',
      updatedAt: '2026-02-20T10:00:00Z'
    }
  ]
]);

const paymentsDB: StoredPayment[] = [
  {
    id: 'pay-rod-1',
    subscriptionId: 'sub-barbearia-rodrigues',
    barbershopId: 'tenant-barbearia-do-joao',
    barbershopName: 'Barbearia Rodrigues',
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
    barbershopName: 'Barbearia Rodrigues',
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
    barbershopName: 'Barbearia Vintage Club',
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
    barbershopName: 'Barbearia Vintage Club',
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
    barbershopName: 'Barbearia Vintage Club',
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
    barbershopName: 'Barbearia Vintage Club',
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

const processedWebhookEvents: Map<string, WebhookEvent> = new Map();

// Helper: Calculate next billing date
function getNextBillingDate(baseDate = new Date()): string {
  const d = new Date(baseDate);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

// Mercado Pago REST Helper
async function callMercadoPago(endpoint: string, options: RequestInit = {}) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return null;

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
      return null;
    }
    return await res.json();
  } catch (error) {
    console.warn(`Mercado Pago fetch exception (${endpoint}):`, error);
    return null;
  }
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

// =========================================================================
// API ENDPOINTS
// =========================================================================

// 1. Health check & Mercado Pago Credential Verification
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'MY BARBER Subscription Engine' });
});

app.get('/api/mercadopago/check-credentials', async (_req: Request, res: Response) => {
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
app.post('/api/subscriptions/create', async (req: Request, res: Response) => {
  try {
    const { barbershopId, barbershopName, payerEmail, payerName, payerPhone } = req.body;

    if (!barbershopId || !payerEmail) {
      return res.status(400).json({ error: 'barbershopId e payerEmail são obrigatórios' });
    }

    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const returnUrl = `${appUrl}?subscription_return=success&barbershopId=${encodeURIComponent(barbershopId)}`;

    let mpSubId = `mp-sub-${Date.now()}`;
    let initPoint = `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${mpSubId}`;

    const now = new Date();
    const trialStartDate = now.toISOString().split('T')[0];
    const trialEndDate = get14DaysFromDate(now);

    // Call Mercado Pago API if access token is configured
    // Start recurring monthly billing directly scheduled for 14 days later (end of trial)
    if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
      const mpResponse = await callMercadoPago('/preapproval', {
        method: 'POST',
        body: JSON.stringify({
          payer_email: payerEmail,
          back_url: returnUrl,
          reason: 'Plano MY BARBER - 14 Dias Grátis + R$ 49,90/mês (3 meses)',
          external_reference: barbershopId,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: 49.90,
            currency_id: 'BRL',
            start_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
          },
          status: 'pending'
        })
      });

      if (mpResponse && mpResponse.id) {
        mpSubId = mpResponse.id;
        initPoint = mpResponse.init_point || mpResponse.sandbox_init_point || initPoint;
      }
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
      status: 'PENDING', // Fica PENDING até o proprietário inserir e validar o cartão no checkout MP
      plan: 'Plano MY BARBER',
      currentPrice: 0.00, // 0.00 durante os 14 dias grátis
      billingCycle: 'MONTHLY',
      isInTrial: false,
      trialStartDate,
      trialEndDate,
      paidBillingCount: 0,
      trialOrLaunchPeriod: true,
      billingCount: 0,
      nextBillingDate: trialEndDate,
      initPointUrl: initPoint,
      cardValidated: false,
      toleranceDays: 7,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    subscriptionsDB.set(barbershopId, newSubscription);

    res.json({
      success: true,
      subscription: newSubscription,
      initPointUrl: initPoint,
      message: 'Assinatura criada com sucesso. Redirecionando para validação do cartão de crédito no Mercado Pago.'
    });
  } catch (err: any) {
    console.error('Error creating subscription:', err);
    res.status(500).json({ error: err.message || 'Erro interno ao criar assinatura' });
  }
});

// 3. Get Subscription Status for a Barbershop
app.get('/api/subscriptions/status/:barbershopId', async (req: Request, res: Response) => {
  const { barbershopId } = req.params;
  const subscription = subscriptionsDB.get(barbershopId);

  if (!subscription) {
    return res.status(404).json({ error: 'Assinatura não encontrada para esta barbearia' });
  }

  // Calculate trial days remaining if in TRIAL
  if (subscription.status === 'TRIAL_14_DAYS' && subscription.trialEndDate) {
    const today = new Date().toISOString().split('T')[0];
    const end = new Date(subscription.trialEndDate);
    const now = new Date(today);
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0 && subscription.paidBillingCount === 0) {
      // Trial expired -> first charge should happen
      // If payment did not occur yet, set to PAST_DUE or keep until webhook arrives
    }
  }

  // Calculate tolerance status if PAST_DUE
  if (subscription.status === 'PAST_DUE' && subscription.pastDueSince) {
    const pastDueDate = new Date(subscription.pastDueSince);
    const diffDays = Math.floor((Date.now() - pastDueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > subscription.toleranceDays) {
      subscription.status = 'SUSPENDED';
      subscription.updatedAt = new Date().toISOString();
    }
  }

  const shopPayments = paymentsDB
    .filter(p => p.barbershopId === barbershopId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    subscription,
    payments: shopPayments
  });
});

// 4. Get All Subscriptions (Master Admin)
app.get('/api/subscriptions/all', (_req: Request, res: Response) => {
  const allSubs = Array.from(subscriptionsDB.values());

  const totalMRR = allSubs
    .filter(s => s.status === 'ACTIVE' || s.status === 'PAST_DUE')
    .reduce((sum, s) => sum + s.currentPrice, 0);

  const trialCount = allSubs.filter(s => s.status === 'TRIAL_14_DAYS').length;
  const promoCount = allSubs.filter(s => s.status === 'ACTIVE' && s.paidBillingCount >= 1 && s.paidBillingCount <= 3).length;
  const regularCount = allSubs.filter(s => s.status === 'ACTIVE' && s.paidBillingCount >= 4).length;
  const activeCount = allSubs.filter(s => s.status === 'ACTIVE' || s.status === 'TRIAL_14_DAYS').length;
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
      trialCount,
      promoCount,
      regularCount,
      pastDueCount,
      suspendedCount,
      canceledCount,
      pendingCount
    }
  });
});

// 5. Cancel Subscription
app.post('/api/subscriptions/cancel', async (req: Request, res: Response) => {
  try {
    const { barbershopId, reason } = req.body;
    const subscription = subscriptionsDB.get(barbershopId);

    if (!subscription) {
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }

    if (process.env.MERCADOPAGO_ACCESS_TOKEN && subscription.mercadopagoSubscriptionId) {
      await cancelMercadoPagoSubscription(subscription.mercadopagoSubscriptionId);
    }

    subscription.status = 'CANCELED';
    subscription.canceledAt = new Date().toISOString();
    subscription.updatedAt = new Date().toISOString();

    subscriptionsDB.set(barbershopId, subscription);

    res.json({
      success: true,
      subscription,
      message: 'Assinatura cancelada com sucesso. As próximas cobranças foram interrompidas.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao cancelar assinatura' });
  }
});

// 6. Sync Subscription directly with Mercado Pago
app.post('/api/subscriptions/sync/:barbershopId', async (req: Request, res: Response) => {
  const { barbershopId } = req.params;
  const subscription = subscriptionsDB.get(barbershopId);

  if (!subscription) {
    return res.status(404).json({ error: 'Assinatura não encontrada' });
  }

  if (process.env.MERCADOPAGO_ACCESS_TOKEN && subscription.mercadopagoSubscriptionId) {
    const mpData = await callMercadoPago(`/preapproval/${subscription.mercadopagoSubscriptionId}`);
    if (mpData) {
      if (mpData.status === 'authorized') {
        subscription.cardValidated = true;
        // If it's still in the 14 days window, set to TRIAL_14_DAYS with full access
        const nowIso = new Date().toISOString().split('T')[0];
        if (subscription.trialEndDate && subscription.trialEndDate >= nowIso && subscription.paidBillingCount === 0) {
          subscription.status = 'TRIAL_14_DAYS';
          subscription.isInTrial = true;
        } else {
          subscription.status = 'ACTIVE';
          subscription.isInTrial = false;
        }
      } else if (mpData.status === 'cancelled') {
        subscription.status = 'CANCELED';
      } else if (mpData.status === 'pending') {
        subscription.status = 'PENDING';
      }
      subscription.updatedAt = new Date().toISOString();
    }
  }

  res.json({ success: true, subscription });
});

// 7. Simulation & Testing Endpoint (Sandbox transitions)
app.post('/api/subscriptions/simulate-action', async (req: Request, res: Response) => {
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
      // Step 1: Card is validated by Mercado Pago -> Starts 14 Days Free Trial with full access
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

      message = `Cartão validado com sucesso pelo Mercado Pago! Período gratuito de 14 DIAS GRÁTIS iniciado com acesso completo. Primeira cobrança de R$ 49,90 programada para ${subscription.trialEndDate}.`;
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

      // Rule:
      // Month 1, 2, 3 = R$ 49.90 (promotional)
      // Month 4+ = R$ 69.90 (regular auto-switch)
      const paidAmount = nextPaidCount <= 3 ? 49.90 : 69.90;

      if (nextPaidCount >= 3) {
        // Automatically switch next recurring price to 69.90 on Mercado Pago
        subscription.currentPrice = 69.90;
        subscription.trialOrLaunchPeriod = false;
        if (process.env.MERCADOPAGO_ACCESS_TOKEN && subscription.mercadopagoSubscriptionId) {
          await updateMercadoPagoSubscriptionPrice(subscription.mercadopagoSubscriptionId, 69.90);
        }
      } else {
        subscription.currentPrice = 49.90;
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

      if (nextPaidCount === 1) {
        message = '1º Mês Pago confirmado (R$ 49,90). Faltam 2 meses promocionais antes do valor definitivo de R$ 69,90.';
      } else if (nextPaidCount === 2) {
        message = '2º Mês Pago confirmado (R$ 49,90). Falta 1 mês promocional antes do valor definitivo de R$ 69,90.';
      } else if (nextPaidCount === 3) {
        message = '3º Mês Pago confirmado (R$ 49,90). Oferta de 3 meses concluída! A próxima renovação (#4) foi atualizada automaticamente para R$ 69,90/mês no Mercado Pago.';
      } else {
        message = `Mensalidade regular #${nextPaidCount} faturada em R$ 69,90 no Mercado Pago.`;
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

    default:
      return res.status(400).json({ error: `Ação desconhecida: ${action}` });
  }

  subscriptionsDB.set(barbershopId, subscription);
  res.json({ success: true, subscription, message });
});

// 8. Official Mercado Pago Webhook Handler
app.post('/api/webhooks/mercadopago', async (req: any, res: Response) => {
  const eventId = req.query['data.id'] || req.body?.data?.id || req.body?.id || `evt-${Date.now()}`;
  const eventType = req.query.type || req.body?.type || req.body?.action || 'unknown';

  // 1. Validate HMAC signature if secret is configured
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const xSignature = req.headers['x-signature'] as string;
  const xRequestId = req.headers['x-request-id'] as string;

  if (webhookSecret && xSignature) {
    try {
      const parts = xSignature.split(',');
      let ts = '';
      let v1 = '';
      for (const part of parts) {
        const [key, val] = part.trim().split('=');
        if (key === 'ts') ts = val;
        if (key === 'v1') v1 = val;
      }

      const manifest = `id:${eventId};request-id:${xRequestId};ts:${ts};`;
      const hmac = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');

      if (hmac !== v1) {
        console.warn('Invalid HMAC signature from Mercado Pago webhook');
        return res.status(401).json({ error: 'Assinatura do webhook inválida' });
      }
    } catch (e) {
      console.warn('Error validating webhook HMAC signature:', e);
    }
  }

  // 2. Idempotency Check
  if (processedWebhookEvents.has(eventId)) {
    console.log(`[Webhook MP] Evento já processado previamente (Idempotência): ${eventId}`);
    return res.status(200).json({ status: 'already_processed', eventId });
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
    // 3. Process according to event type
    if (eventType === 'payment' || eventType === 'subscription_authorized_payment') {
      const paymentId = eventId;
      let paymentData = null;

      if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
        paymentData = await callMercadoPago(`/v1/payments/${paymentId}`);
      }

      const externalRef = paymentData?.external_reference || req.body?.external_reference;
      const status = paymentData?.status || req.body?.data?.status || 'approved';
      const amount = paymentData?.transaction_amount || req.body?.data?.transaction_amount || 49.90;

      if (externalRef && subscriptionsDB.has(externalRef)) {
        const sub = subscriptionsDB.get(externalRef)!;

        if (status === 'approved') {
          const nextPaidCount = (sub.paidBillingCount || 0) + 1;
          sub.paidBillingCount = nextPaidCount;
          sub.billingCount = nextPaidCount;
          sub.status = 'ACTIVE';
          sub.isInTrial = false;
          sub.cardValidated = true;
          delete sub.pastDueSince;

          // Rule: Month 1-3 = 49.90, Month 4+ = 69.90
          if (nextPaidCount >= 3) {
            sub.currentPrice = 69.90;
            sub.trialOrLaunchPeriod = false;
            if (process.env.MERCADOPAGO_ACCESS_TOKEN && sub.mercadopagoSubscriptionId) {
              await updateMercadoPagoSubscriptionPrice(sub.mercadopagoSubscriptionId, 69.90);
            }
          } else {
            sub.currentPrice = 49.90;
            sub.trialOrLaunchPeriod = true;
          }

          sub.nextBillingDate = getNextBillingDate();
          sub.updatedAt = now;

          paymentsDB.unshift({
            id: `pay-${paymentId}`,
            subscriptionId: sub.id,
            barbershopId: sub.barbershopId,
            barbershopName: sub.barbershopName,
            mercadopagoPaymentId: String(paymentId),
            amount: Number(amount),
            status: 'APPROVED',
            statusDetail: paymentData?.status_detail || 'accredited',
            paymentDate: now.split('T')[0],
            billingNumber: nextPaidCount,
            paymentMethod: paymentData?.payment_method_id || 'Cartão de Crédito',
            createdAt: now
          });
        } else if (status === 'rejected') {
          sub.status = 'PAST_DUE';
          if (!sub.pastDueSince) sub.pastDueSince = now;
          sub.updatedAt = now;
        }
        subscriptionsDB.set(externalRef, sub);
      }
    } else if (eventType === 'subscription_preapproval') {
      const preapprovalId = eventId;
      let preapprovalData = null;

      if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
        preapprovalData = await callMercadoPago(`/preapproval/${preapprovalId}`);
      }

      const externalRef = preapprovalData?.external_reference;
      if (externalRef && subscriptionsDB.has(externalRef)) {
        const sub = subscriptionsDB.get(externalRef)!;
        if (preapprovalData?.status === 'authorized') {
          sub.cardValidated = true;
          const nowStr = now.split('T')[0];
          // If within the 14 days trial window and no paid months yet, activate 14-days free trial
          if (sub.trialEndDate && sub.trialEndDate >= nowStr && (sub.paidBillingCount || 0) === 0) {
            sub.status = 'TRIAL_14_DAYS';
            sub.isInTrial = true;
            sub.currentPrice = 0.00;
          } else {
            sub.status = 'ACTIVE';
            sub.isInTrial = false;
          }
        } else if (preapprovalData?.status === 'cancelled') {
          sub.status = 'CANCELED';
          sub.canceledAt = now;
        }
        sub.updatedAt = now;
        subscriptionsDB.set(externalRef, sub);
      }
    }

    processedWebhookEvents.set(eventId, eventRecord);
    res.status(200).json({ status: 'ok', eventId });
  } catch (err: any) {
    console.error('Error handling Mercado Pago webhook:', err);
    eventRecord.status = 'ERROR';
    eventRecord.error = err.message;
    processedWebhookEvents.set(eventId, eventRecord);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

// =========================================================================
// VITE / STATIC SERVING
// =========================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MY BARBER Full-Stack Server rodando na porta ${PORT}`);
  });
}

startServer();
