import { getFirebaseAdmin } from './firebaseAdmin.js';

export interface ProcessedWebhookRecord {
  eventId: string;
  type: string;
  source: 'MERCADO_PAGO';
  paymentId?: string;
  preapprovalId?: string;
  barbershopId?: string;
  processedAt: string;
  status: 'PROCESSING' | 'SUCCESS' | 'ERROR';
  error?: string;
}

export interface DurablePaymentRecord {
  id: string; // e.g. pay-{paymentId}
  subscriptionId: string;
  barbershopId: string;
  externalReference?: string;
  barbershopName: string;
  mercadopagoPaymentId: string;
  amount: number;
  currency?: string;
  status: 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CHARGED_BACK';
  originalStatus?: 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CHARGED_BACK';
  statusDetail: string;
  paymentDate: string;
  billingNumber: number;
  paymentMethod: string;
  approvedAt?: string;
  refundedAt?: string;
  chargedBackAt?: string;
  lastFinancialEventAt?: string;
  lastFinancialEventId?: string;
  lastFinancialEventStatus?: string;
  downgradePrevented?: boolean;
  needsPricingReconciliation?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface DurableSubscriptionRecord {
  id: string; // sub-{barbershopId}
  barbershopId: string;
  barbershopName: string;
  payerEmail: string;
  payerName?: string;
  payerPhone?: string;
  mercadopagoSubscriptionId: string;
  mercadopagoCustomerId?: string;
  status: 'TRIAL_14_DAYS' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED' | 'PENDING' | 'LIFETIME_LICENSE';
  plan: string;
  planId?: string;
  customPlan?: any;
  currentPrice: number;
  planPriceNormal?: number;
  planPricePromotional?: number;
  planPromotionCycles?: number;
  currency?: string;
  planInconsistent?: boolean;
  needsPricingReconciliation?: boolean;
  needsReconciliation?: boolean;
  isLifetime?: boolean;
  lifetimePurchasedAt?: string;
  previousSubscriptionId?: string;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'ONE_TIME';
  isInTrial: boolean;
  trialStartDate?: string;
  trialEndDate?: string;
  paidBillingCount: number;
  trialOrLaunchPeriod?: boolean;
  billingCount?: number;
  nextBillingDate?: string;
  initPointUrl?: string;
  cardValidated: boolean;
  cardBrand?: string;
  cardLastFourDigits?: string;
  toleranceDays?: number;
  pastDueSince?: string;
  canceledAt?: string;
  lastApprovedPaymentAt?: string;
  lastFinancialEventAt?: string;
  lastReversalAt?: string;
  lastReversalType?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanPricingResolution {
  currentPrice: number;
  isInPromotion: boolean;
  transitionedToRegular: boolean;
  regularPrice?: number;
  promotionalPrice?: number;
  promotionCycles?: number;
  currency: string;
  inconsistentPlan?: boolean;
  preventGatewayPriceUpdate?: boolean;
  needsPricingReconciliation?: boolean;
}

export const FINANCIAL_SEVERITY: Record<'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CHARGED_BACK', number> = {
  REJECTED: 0,
  APPROVED: 1,
  REFUNDED: 2,
  CHARGED_BACK: 3
};

export interface FinancialTimestampValidation {
  valid: boolean;
  timeMs: number;
  isoString?: string;
  error?: 'MISSING_TIMESTAMP' | 'INVALID_TIMESTAMP' | 'OUT_OF_RANGE_TIMESTAMP';
}

export function validateFinancialTimestamp(rawTimestamp?: string | null): FinancialTimestampValidation {
  if (!rawTimestamp || typeof rawTimestamp !== 'string' || rawTimestamp.trim() === '') {
    return { valid: false, timeMs: 0, error: 'MISSING_TIMESTAMP' };
  }
  const trimmed = rawTimestamp.trim();
  const parsedMs = Date.parse(trimmed);
  if (isNaN(parsedMs)) {
    return { valid: false, timeMs: 0, error: 'INVALID_TIMESTAMP' };
  }
  const year = new Date(parsedMs).getUTCFullYear();
  if (year < 2020 || year > 2100) {
    return { valid: false, timeMs: 0, error: 'OUT_OF_RANGE_TIMESTAMP' };
  }
  return { valid: true, timeMs: parsedMs, isoString: new Date(parsedMs).toISOString() };
}

/**
 * Resolução dinâmica e autoritativa do preço do plano contratado na assinatura (FASE 3.4B / FASE 3.4F - V3.4-E01).
 * 
 * INVARIANTE CONTRATUAL DE PREÇO:
 * 1. Uma alteração posterior em plans/{planId} (catálogo global) NÃO PODE alterar retroativamente
 *    o preço contratado de uma subscription/{id} já existente.
 * 2. Se a assinatura possuir snapshot contratual confiável (customPlan ou planPriceNormal),
 *    utiliza estritamente os valores congelados no snapshot. O catálogo atual NUNCA sobrescreve.
 * 3. Se a assinatura for legada (sem snapshot) e possuir preço histórico cobrado (currentPrice > 0):
 *    - Preserva o currentPrice contratado intacto.
 *    - Se o catálogo diferir, NÃO atualiza o preço e sinaliza needsPricingReconciliation / preventGatewayPriceUpdate.
 *    - Bloqueia updateMercadoPagoSubscriptionPrice com preço derivado de catálogo não contratado.
 * 4. Se a assinatura legada não possuir snapshot e não possuir preço confiável (currentPrice <= 0):
 *    - FAIL CLOSED: Marca inconsistentPlan e needsPricingReconciliation.
 *    - Jamais inventa preços sintéticos.
 */
export function resolveSubscriptionPlanPricing(
  subscription: DurableSubscriptionRecord,
  paidBillingCount: number,
  planFromService?: any | null
): PlanPricingResolution {
  const hasContractualSnapshot = Boolean(
    subscription.customPlan ||
    (typeof subscription.planPriceNormal === 'number' && subscription.planPriceNormal > 0)
  );

  let plan = subscription.customPlan;
  let normalPrice: number | undefined;
  let promoPrice: number | undefined;
  let promoDuration = 0;
  let hasPromotion = false;

  if (hasContractualSnapshot) {
    hasPromotion = Boolean(
      (plan && plan.hasPromotion) ||
      (typeof subscription.planPromotionCycles === 'number' && subscription.planPromotionCycles > 0)
    );
    promoDuration = typeof plan?.promotionDuration === 'number'
      ? plan.promotionDuration
      : (typeof subscription.planPromotionCycles === 'number' ? subscription.planPromotionCycles : 0);
    promoPrice = typeof plan?.promotionalPrice === 'number'
      ? plan.promotionalPrice
      : (typeof subscription.planPricePromotional === 'number' ? subscription.planPricePromotional : undefined);
    normalPrice = typeof plan?.priceAfterPromotion === 'number'
      ? plan.priceAfterPromotion
      : (typeof plan?.priceMonthly === 'number'
          ? plan.priceMonthly
          : (typeof subscription.planPriceNormal === 'number' ? subscription.planPriceNormal : undefined));
  } else {
    // V3.4-E01: ASSINATURA LEGADA SEM SNAPSHOT CONTRATUAL
    const currentPriceTrusted = typeof subscription.currentPrice === 'number' && subscription.currentPrice > 0;

    if (!currentPriceTrusted) {
      return {
        currentPrice: 0,
        isInPromotion: Boolean(subscription.trialOrLaunchPeriod),
        transitionedToRegular: false,
        currency: subscription.currency || 'BRL',
        inconsistentPlan: true,
        preventGatewayPriceUpdate: true,
        needsPricingReconciliation: true
      };
    }

    const hasCatalogPlan = Boolean(planFromService);
    const catalogNormalPrice = typeof planFromService?.priceMonthly === 'number' ? planFromService.priceMonthly : undefined;
    const isCatalogDivergent = catalogNormalPrice !== undefined && Math.abs(catalogNormalPrice - subscription.currentPrice) > 0.01;
    const isInconsistent = !hasCatalogPlan || isCatalogDivergent;

    return {
      currentPrice: subscription.currentPrice,
      isInPromotion: Boolean(subscription.trialOrLaunchPeriod),
      transitionedToRegular: false,
      regularPrice: subscription.currentPrice,
      currency: subscription.currency || 'BRL',
      inconsistentPlan: isInconsistent,
      preventGatewayPriceUpdate: true,
      needsPricingReconciliation: isInconsistent
    };
  }

  const currency = subscription.currency || (plan && plan.currency) || 'BRL';
  const effectiveNormalPrice = normalPrice !== undefined ? normalPrice : subscription.currentPrice;

  if (hasPromotion && promoDuration > 0 && promoPrice !== undefined) {
    if (paidBillingCount <= promoDuration) {
      return {
        currentPrice: promoPrice,
        isInPromotion: true,
        transitionedToRegular: false,
        promotionalPrice: promoPrice,
        regularPrice: effectiveNormalPrice,
        promotionCycles: promoDuration,
        currency,
        preventGatewayPriceUpdate: false
      };
    } else {
      return {
        currentPrice: effectiveNormalPrice,
        isInPromotion: false,
        transitionedToRegular: true,
        promotionalPrice: promoPrice,
        regularPrice: effectiveNormalPrice,
        promotionCycles: promoDuration,
        currency,
        preventGatewayPriceUpdate: false
      };
    }
  }

  const finalRegular = typeof plan?.priceMonthly === 'number'
    ? plan.priceMonthly
    : (typeof subscription.planPriceNormal === 'number' ? subscription.planPriceNormal : effectiveNormalPrice);

  return {
    currentPrice: finalRegular,
    isInPromotion: false,
    transitionedToRegular: false,
    regularPrice: finalRegular,
    currency,
    preventGatewayPriceUpdate: false
  };
}

/**
 * Registra o início do processamento de um evento de webhook de forma atômica no Firestore.
 * 
 * DESIGN DE CONCORRÊNCIA E IDEMPOTÊNCIA:
 * - Utiliza transação atômica em `webhook_events/{eventId}`.
 * - Se o documento já existir com status 'SUCCESS' ou 'PROCESSING', a transação rejeita a execução
 *   concorrente, garantindo que mesmo duas instâncias simultâneas nunca processem o mesmo evento.
 */
export async function claimWebhookEventExecution(
  eventId: string,
  eventType: string
): Promise<{ acquired: boolean; reason?: 'ALREADY_PROCESSED' | 'CURRENTLY_PROCESSING' | 'ERROR'; record?: ProcessedWebhookRecord }> {
  try {
    const { firestore } = getFirebaseAdmin();
    const eventRef = firestore.collection('webhook_events').doc(eventId);

    const result = await firestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(eventRef);
      const now = new Date().toISOString();

      if (doc.exists) {
        const data = doc.data() as ProcessedWebhookRecord;
        if (data.status === 'SUCCESS') {
          return { acquired: false, reason: 'ALREADY_PROCESSED' as const, record: data };
        }
        if (data.status === 'PROCESSING') {
          // Se estiver em processamento há mais de 2 minutos, pode ser crash anterior; senão é concorrência ativa
          const lockTime = new Date(data.processedAt).getTime();
          if (Date.now() - lockTime < 120 * 1000) {
            return { acquired: false, reason: 'CURRENTLY_PROCESSING' as const, record: data };
          }
        }
      }

      const newRecord: ProcessedWebhookRecord = {
        eventId,
        type: eventType,
        source: 'MERCADO_PAGO',
        processedAt: now,
        status: 'PROCESSING'
      };

      transaction.set(eventRef, newRecord);
      return { acquired: true, record: newRecord };
    });

    return result;
  } catch (err: any) {
    console.warn(`[WebhookService] Falha na transação de lock do evento ${eventId}:`, err);
    return { acquired: false, reason: 'ERROR' };
  }
}

/**
 * Executa a reconciliação financeira durável de um pagamento aprovado de forma atômica no Firestore.
 * 
 * IDEMPOTÊNCIA FINANCEIRA DURÁVEL (FASE 2.9E):
 * - O documento `subscription_payments/pay-{paymentId}` possui chave determinística derivada exclusivamente do paymentId.
 * - Dentro da transação atômica do Firestore:
 *   1. Se `pay-{paymentId}` já existir (mesmo que por crash anterior entre processamento e SUCCESS do webhook),
 *      o pagamento é considerado JÁ COMPUTADO: `paidBillingCount` NÃO é incrementado novamente.
 *   2. Se não existir, `pay-{paymentId}` é criado e `paidBillingCount` da assinatura é incrementado exatamente uma vez.
 *   3. Atualiza duravelmente a coleção `subscriptions/sub-{barbershopId}` no Firestore.
 */
export async function recordDurablePaymentTransaction(params: {
  paymentId: string;
  barbershopId: string;
  amount: number;
  currency?: string;
  status: 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CHARGED_BACK';
  statusDetail: string;
  paymentMethod: string;
  fallbackSubscription?: DurableSubscriptionRecord;
  nextBillingDate: string;
  externalEventDate?: string;
  eventId?: string;
  planDetails?: any;
}): Promise<{
  isNewPayment: boolean;
  isReversalProcessed?: boolean;
  downgradePrevented?: boolean;
  paymentRecord: DurablePaymentRecord;
  subscriptionRecord: DurableSubscriptionRecord;
  planPricing?: PlanPricingResolution;
}> {
  const { firestore } = getFirebaseAdmin();
  const paymentKey = `pay-${params.paymentId}`;
  const paymentRef = firestore.collection('subscription_payments').doc(paymentKey);
  const subKey = `sub-${params.barbershopId}`;
  const subRef = firestore.collection('subscriptions').doc(subKey);

  return await firestore.runTransaction(async (transaction) => {
    const paymentDoc = await transaction.get(paymentRef);
    const subDoc = await transaction.get(subRef);

    const now = new Date().toISOString();
    let currentSub: DurableSubscriptionRecord;

    if (subDoc.exists) {
      currentSub = subDoc.data() as DurableSubscriptionRecord;
    } else if (params.fallbackSubscription) {
      currentSub = { ...params.fallbackSubscription };
    } else {
      throw new Error(`Assinatura sub-${params.barbershopId} não encontrada no Firestore.`);
    }

    // V3.4-E03: VALIDAÇÃO MULTI-TENANT NA ASSINATURA
    if (currentSub.barbershopId && currentSub.barbershopId !== params.barbershopId) {
      console.error(`[SECURITY V3.4-E03] Multi-tenant mismatch na subscription: sub.barbershopId (${currentSub.barbershopId}) !== params.barbershopId (${params.barbershopId})`);
      const err: any = new Error(`Violação de isolamento multi-tenant: A assinatura informada pertence a outro estabelecimento.`);
      err.code = 'CROSS_TENANT_SUBSCRIPTION_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    // =========================================================================
    // CENÁRIO 1: O DOCUMENTO DE PAGAMENTO JÁ EXISTE NO FIRESTORE
    // =========================================================================
    if (paymentDoc.exists) {
      const existingPayment = paymentDoc.data() as DurablePaymentRecord;

      // V3.4-E03: VALIDAÇÃO ESTRITA DE SOBERANIA CROSS-TENANT ANTES DE QUALQUER MUTAÇÃO
      if (existingPayment.barbershopId && existingPayment.barbershopId !== params.barbershopId) {
        console.error(
          `[SECURITY CRITICAL V3.4-E03] Tentativa de contaminação cross-tenant detectada: ` +
          `Pagamento ${params.paymentId} pertence ao tenant '${existingPayment.barbershopId}', ` +
          `mas evento financeiro recebido especificou tenant '${params.barbershopId}'. Transação abortada imediatamente.`
        );
        const err: any = new Error(
          `Violação de isolamento multi-tenant: O pagamento ${params.paymentId} pertence a outro estabelecimento.`
        );
        err.code = 'CROSS_TENANT_PAYMENT_MISMATCH';
        err.statusCode = 403;
        throw err;
      }

      // Se for um evento de estorno/reversão (REFUNDED ou CHARGED_BACK)
      if (params.status === 'REFUNDED' || params.status === 'CHARGED_BACK') {
        // Idempotência estrita: se o pagamento já reflete a mesma reversão ou o mesmo evento foi processado
        if (existingPayment.status === params.status || (params.eventId && existingPayment.lastFinancialEventId === params.eventId)) {
          return {
            isNewPayment: false,
            isReversalProcessed: false,
            paymentRecord: existingPayment,
            subscriptionRecord: currentSub
          };
        }

        const existingSeverity = FINANCIAL_SEVERITY[existingPayment.status] || 0;
        const incomingSeverity = FINANCIAL_SEVERITY[params.status] || 0;

        // V3.4-E02: PROTEÇÃO CONTRA DOWNGRADE DE SEVERIDADE FINANCEIRA
        // APPROVED (1) < REFUNDED (2) < CHARGED_BACK (3)
        // CHARGED_BACK -> REFUNDED É RIGOROSAMENTE PROIBIDO DE REDUZIR A SEVERIDADE!
        if (incomingSeverity < existingSeverity) {
          console.warn(
            `[FINANCIAL SECURITY V3.4-E02] Downgrade de severidade financeira rejeitado: ` +
            `Pagamento ${params.paymentId} já possui status '${existingPayment.status}' (severidade ${existingSeverity}). ` +
            `Evento recebido '${params.status}' (severidade ${incomingSeverity}) ignorado para preservação do estado de risco.`
          );
          const auditedPayment: DurablePaymentRecord = {
            ...existingPayment,
            lastFinancialEventId: params.eventId || existingPayment.lastFinancialEventId,
            lastFinancialEventAt: now,
            lastFinancialEventStatus: params.status,
            downgradePrevented: true,
            updatedAt: now
          };
          transaction.set(paymentRef, auditedPayment, { merge: true });
          return {
            isNewPayment: false,
            isReversalProcessed: false,
            downgradePrevented: true,
            paymentRecord: auditedPayment,
            subscriptionRecord: currentSub
          };
        }

        // V3.4-E05 & V3.4-E04: ORDENAÇÃO TEMPORAL E VALIDAÇÃO DE TIMESTAMP DE REVERSÃO
        const tsValidation = validateFinancialTimestamp(params.externalEventDate);
        if (params.externalEventDate && !tsValidation.valid) {
          console.warn(
            `[FINANCIAL HARDENING V3.4-E04] Timestamp inválido em reversão (${params.externalEventDate}). ` +
            `Transição tratada de forma fail-closed sem substituição ingênua por Date.now().`
          );
          currentSub.needsReconciliation = true;
        }

        const existingEventTime = existingPayment.lastFinancialEventAt
          ? Date.parse(existingPayment.lastFinancialEventAt)
          : (existingPayment.refundedAt ? Date.parse(existingPayment.refundedAt) : 0);

        if (tsValidation.valid && existingEventTime > 0 && tsValidation.timeMs < existingEventTime) {
          console.warn(
            `[FINANCIAL HARDENING V3.4-E05] Evento de reversão antigo descartado por ordenação temporal: ` +
            `Timestamp do evento (${tsValidation.isoString}) é anterior ao último evento registrado (${existingPayment.lastFinancialEventAt}).`
          );
          return {
            isNewPayment: false,
            isReversalProcessed: false,
            paymentRecord: existingPayment,
            subscriptionRecord: currentSub
          };
        }

        const eventIsoDate = tsValidation.valid ? tsValidation.isoString! : now;

        // Transição de estado financeiro do pagamento existente (APPROVED -> REFUNDED ou APPROVED/REFUNDED -> CHARGED_BACK)
        const updatedPayment: DurablePaymentRecord = {
          ...existingPayment,
          status: params.status,
          originalStatus: existingPayment.originalStatus || existingPayment.status,
          statusDetail: params.statusDetail || params.status.toLowerCase(),
          currency: params.currency || existingPayment.currency || 'BRL',
          refundedAt: params.status === 'REFUNDED' ? eventIsoDate : existingPayment.refundedAt,
          chargedBackAt: params.status === 'CHARGED_BACK' ? eventIsoDate : existingPayment.chargedBackAt,
          lastFinancialEventId: params.eventId || existingPayment.lastFinancialEventId,
          lastFinancialEventAt: eventIsoDate,
          lastFinancialEventStatus: params.status,
          updatedAt: now
        };

        // Reversão não incrementa e NÃO decrementa paidBillingCount (mantém contagem histórica)
        if (currentSub.status === 'CANCELED') {
          // REGRA P1-02: CANCELED é estritamente terminal: não pode ser reativado
          currentSub.lastReversalAt = eventIsoDate;
          currentSub.lastReversalType = params.status;
          currentSub.updatedAt = now;
          transaction.set(subRef, { lastReversalAt: eventIsoDate, lastReversalType: params.status, updatedAt: now }, { merge: true });
        } else {
          const wasLifetime = (currentSub.status as string) === 'LIFETIME_LICENSE';
          const isLifetimeReversal = wasLifetime && (
            Number(params.amount) === 799 ||
            params.planDetails?.id === 'plano-vitalicio' ||
            (params as any).purchaseType === 'LIFETIME_LICENSE' ||
            (currentSub as any).mercadopagoSubscriptionId === `lifetime-${params.paymentId}`
          );
          currentSub.status = params.status === 'CHARGED_BACK' ? 'SUSPENDED' : 'PAST_DUE';
          if (isLifetimeReversal) {
            currentSub.status = 'SUSPENDED';
          } else if (wasLifetime) {
            currentSub.status = 'LIFETIME_LICENSE';
          }
          if (currentSub.status !== 'LIFETIME_LICENSE' && !currentSub.pastDueSince) {
            currentSub.pastDueSince = now;
          }
          if (isLifetimeReversal) {
            currentSub.pastDueSince = now;
          }
          currentSub.lastReversalAt = eventIsoDate;
          currentSub.lastReversalType = params.status;
          currentSub.updatedAt = now;
          transaction.set(subRef, currentSub, { merge: true });
        }

        transaction.set(paymentRef, updatedPayment, { merge: true });

        return {
          isNewPayment: false,
          isReversalProcessed: true,
          paymentRecord: updatedPayment,
          subscriptionRecord: currentSub
        };
      }

      // Se for APPROVED chegando para um pagamento que já existe
      if (params.status === 'APPROVED') {
        // Se já está REFUNDED ou CHARGED_BACK, corrida com evento atrasado ou replay:
        // NÃO sobrescrever a reversão e NÃO reaprovar!
        return {
          isNewPayment: false,
          isReversalProcessed: false,
          paymentRecord: existingPayment,
          subscriptionRecord: currentSub
        };
      }

      // Se for REJECTED já existente
      return {
        isNewPayment: false,
        isReversalProcessed: false,
        paymentRecord: existingPayment,
        subscriptionRecord: currentSub
      };
    }

    // =========================================================================
    // CENÁRIO 2: PAGAMENTO AINDA NÃO REGISTRADO (NOVO REGISTRO)
    // =========================================================================
    // V3.4-E04: Validação estrita de timestamp para novos registros
    const tsValidation = validateFinancialTimestamp(params.externalEventDate);
    const eventIsoDate = tsValidation.valid ? tsValidation.isoString! : now;

    // REGRA P1-02: Se a assinatura estiver CANCELED, pagamentos ou reversões NÃO podem reativá-la
    if (currentSub.status === 'CANCELED') {
      const newPaymentRecord: DurablePaymentRecord = {
        id: paymentKey,
        subscriptionId: currentSub.id,
        barbershopId: currentSub.barbershopId,
        externalReference: currentSub.barbershopId,
        barbershopName: currentSub.barbershopName || 'Barbearia',
        mercadopagoPaymentId: String(params.paymentId),
        amount: Number(params.amount),
        currency: params.currency || 'BRL',
        status: params.status,
        originalStatus: params.status,
        statusDetail: params.statusDetail || (params.status === 'APPROVED' ? 'payment_received_after_cancellation' : params.status.toLowerCase()),
        paymentDate: eventIsoDate.split('T')[0],
        billingNumber: currentSub.paidBillingCount || 0,
        paymentMethod: params.paymentMethod || 'Cartão de Crédito',
        approvedAt: params.status === 'APPROVED' ? eventIsoDate : undefined,
        refundedAt: params.status === 'REFUNDED' ? eventIsoDate : undefined,
        chargedBackAt: params.status === 'CHARGED_BACK' ? eventIsoDate : undefined,
        lastFinancialEventId: params.eventId,
        lastFinancialEventAt: eventIsoDate,
        lastFinancialEventStatus: params.status,
        createdAt: now,
        updatedAt: now
      };

      transaction.set(paymentRef, newPaymentRecord);
      // Mantém status = 'CANCELED', sem reativação implícita
      currentSub.updatedAt = now;
      if (params.status === 'REFUNDED' || params.status === 'CHARGED_BACK') {
        currentSub.lastReversalAt = eventIsoDate;
        currentSub.lastReversalType = params.status;
      }
      transaction.set(subRef, {
        updatedAt: now,
        ...(params.status === 'REFUNDED' || params.status === 'CHARGED_BACK' ? {
          lastReversalAt: eventIsoDate,
          lastReversalType: params.status
        } : {})
      }, { merge: true });

      return {
        isNewPayment: true,
        isReversalProcessed: params.status === 'REFUNDED' || params.status === 'CHARGED_BACK',
        paymentRecord: newPaymentRecord,
        subscriptionRecord: currentSub
      };
    }

    // REGRA P2-06: Tratamento de REFUND e CHARGEBACK novo (reversões financeiras)
    if (params.status === 'REFUNDED' || params.status === 'CHARGED_BACK') {
      const wasLifetime = (currentSub.status as string) === 'LIFETIME_LICENSE';
      const isLifetimeReversal = wasLifetime && (
        Number(params.amount) === 799 ||
        params.planDetails?.id === 'plano-vitalicio' ||
        (params as any).purchaseType === 'LIFETIME_LICENSE' ||
        (currentSub as any).mercadopagoSubscriptionId === `lifetime-${params.paymentId}`
      );
      currentSub.status = params.status === 'CHARGED_BACK' ? 'SUSPENDED' : 'PAST_DUE';
      if (isLifetimeReversal) {
        currentSub.status = 'SUSPENDED';
      } else if (wasLifetime) {
        currentSub.status = 'LIFETIME_LICENSE';
      }
      if (currentSub.status !== 'LIFETIME_LICENSE' && !currentSub.pastDueSince) {
        currentSub.pastDueSince = now;
      }
      if (isLifetimeReversal) {
        currentSub.pastDueSince = now;
      }
      currentSub.lastReversalAt = eventIsoDate;
      currentSub.lastReversalType = params.status;
      currentSub.updatedAt = now;

      const newPaymentRecord: DurablePaymentRecord = {
        id: paymentKey,
        subscriptionId: currentSub.id,
        barbershopId: currentSub.barbershopId,
        externalReference: currentSub.barbershopId,
        barbershopName: currentSub.barbershopName || 'Barbearia',
        mercadopagoPaymentId: String(params.paymentId),
        amount: Number(params.amount),
        currency: params.currency || 'BRL',
        status: params.status,
        originalStatus: params.status,
        statusDetail: params.statusDetail || params.status.toLowerCase(),
        paymentDate: eventIsoDate.split('T')[0],
        billingNumber: currentSub.paidBillingCount || 0,
        paymentMethod: params.paymentMethod || 'Cartão de Crédito',
        refundedAt: params.status === 'REFUNDED' ? eventIsoDate : undefined,
        chargedBackAt: params.status === 'CHARGED_BACK' ? eventIsoDate : undefined,
        lastFinancialEventId: params.eventId,
        lastFinancialEventAt: eventIsoDate,
        lastFinancialEventStatus: params.status,
        createdAt: now,
        updatedAt: now
      };

      transaction.set(paymentRef, newPaymentRecord);
      transaction.set(subRef, currentSub, { merge: true });

      return {
        isNewPayment: true,
        isReversalProcessed: true,
        paymentRecord: newPaymentRecord,
        subscriptionRecord: currentSub
      };
    }

    // REGRA P2-07 / V3.4-E04: Proteção contra Webhook antigo ou timestamp inválido em REJECTED
    if (params.status === 'REJECTED') {
      const lastApprovedTime = currentSub.lastApprovedPaymentAt
        ? Date.parse(currentSub.lastApprovedPaymentAt)
        : 0;

      if (!tsValidation.valid) {
        console.warn(
          `[FINANCIAL HARDENING V3.4-E04] Evento REJECTED com timestamp inválido ou ausente (${params.externalEventDate}). ` +
          `Fail-closed: Estado ACTIVE preservado sem transição destrutiva para PAST_DUE.`
        );
        currentSub.needsReconciliation = true;
      } else {
        const isOldRejectedEvent = currentSub.status === 'ACTIVE' && lastApprovedTime > 0 && tsValidation.timeMs < lastApprovedTime;
        if (!isOldRejectedEvent) {
          currentSub.status = 'PAST_DUE';
          if (!currentSub.pastDueSince) currentSub.pastDueSince = now;
        }
      }
      currentSub.updatedAt = now;

      const newPaymentRecord: DurablePaymentRecord = {
        id: paymentKey,
        subscriptionId: currentSub.id,
        barbershopId: currentSub.barbershopId,
        externalReference: currentSub.barbershopId,
        barbershopName: currentSub.barbershopName || 'Barbearia',
        mercadopagoPaymentId: String(params.paymentId),
        amount: Number(params.amount),
        currency: params.currency || 'BRL',
        status: 'REJECTED',
        originalStatus: 'REJECTED',
        statusDetail: params.statusDetail || 'rejected',
        paymentDate: eventIsoDate.split('T')[0],
        billingNumber: currentSub.paidBillingCount || 0,
        paymentMethod: params.paymentMethod || 'Cartão de Crédito',
        lastFinancialEventId: params.eventId,
        lastFinancialEventAt: eventIsoDate,
        lastFinancialEventStatus: 'REJECTED',
        createdAt: now,
        updatedAt: now
      };

      transaction.set(paymentRef, newPaymentRecord);
      transaction.set(subRef, currentSub, { merge: true });

      return {
        isNewPayment: true,
        paymentRecord: newPaymentRecord,
        subscriptionRecord: currentSub
      };
    }

    // REGRA: Pagamento novo APPROVED
    const nextPaidCount = (currentSub.paidBillingCount || 0) + 1;
    currentSub.paidBillingCount = nextPaidCount;
    currentSub.billingCount = nextPaidCount;

    const lastReversalMs = currentSub.lastReversalAt ? Date.parse(currentSub.lastReversalAt) : 0;
    const isReversalNewer = lastReversalMs > 0 && tsValidation.timeMs <= lastReversalMs;

    const isLifetimePayment = Number(params.amount) === 799 ||
      params.planDetails?.id === 'plano-vitalicio' ||
      (params as any).purchaseType === 'LIFETIME_LICENSE' ||
      (params as any).planId === 'plano-vitalicio';

    if (isLifetimePayment) {
      currentSub.status = 'LIFETIME_LICENSE';
      currentSub.isLifetime = true;
      currentSub.plan = 'My Barber Compra Definitiva';
      currentSub.planId = 'plano-vitalicio';
      currentSub.currentPrice = 0.00;
      currentSub.billingCycle = 'ONE_TIME' as any;
      currentSub.lifetimePurchasedAt = eventIsoDate;
      currentSub.isInTrial = false;
      currentSub.cardValidated = true;
      delete currentSub.pastDueSince;
    } else if (currentSub.status === 'LIFETIME_LICENSE') {
      // REGRA FASE 5.2D: Webhooks atrasados da assinatura anterior NÃO sobrepõem LIFETIME_LICENSE
      // O status permanece LIFETIME_LICENSE, preservando o pagamento para histórico fiscal.
    } else if (currentSub.status === 'SUSPENDED' && (currentSub.lastReversalType === 'CHARGED_BACK' || isReversalNewer)) {
      // V3.4-E02 & V3.5: Preserva status SUSPENDED quando há chargeback ativo ou reversão mais recente
    } else if (currentSub.status === 'PAST_DUE' && isReversalNewer) {
      // V3.4-E05 & V3.5: Preserva status PAST_DUE quando a reversão foi mais recente que o pagamento aprovado
    } else {
      currentSub.status = 'ACTIVE';
      currentSub.isInTrial = false;
      currentSub.cardValidated = true;
      delete currentSub.pastDueSince;
    }

    currentSub.lastApprovedPaymentAt = eventIsoDate;
    currentSub.lastFinancialEventAt = eventIsoDate;

    // Resolução dinâmica do plano contratado com invariante de preço (V3.4-E01)
    let pricing: PlanPricingResolution | undefined;
    if (!isLifetimePayment && currentSub.status !== 'LIFETIME_LICENSE') {
      pricing = resolveSubscriptionPlanPricing(currentSub, nextPaidCount, params.planDetails);
      currentSub.currentPrice = pricing.currentPrice;
      currentSub.trialOrLaunchPeriod = pricing.isInPromotion;
      if (pricing.inconsistentPlan) {
        currentSub.planInconsistent = true;
      }
      if (pricing.needsPricingReconciliation) {
        currentSub.needsPricingReconciliation = true;
      }
    } else {
      currentSub.currentPrice = 0.00;
      currentSub.trialOrLaunchPeriod = false;
    }

    currentSub.nextBillingDate = params.nextBillingDate;
    currentSub.updatedAt = now;

    const newPaymentRecord: DurablePaymentRecord = {
      id: paymentKey,
      subscriptionId: currentSub.id,
      barbershopId: currentSub.barbershopId,
      externalReference: currentSub.barbershopId,
      barbershopName: currentSub.barbershopName || 'Barbearia',
      mercadopagoPaymentId: String(params.paymentId),
      amount: Number(params.amount),
      currency: params.currency || 'BRL',
      status: 'APPROVED',
      originalStatus: 'APPROVED',
      statusDetail: params.statusDetail || 'accredited',
      paymentDate: eventIsoDate.split('T')[0],
      billingNumber: nextPaidCount,
      paymentMethod: params.paymentMethod || 'Cartão de Crédito',
      approvedAt: eventIsoDate,
      lastFinancialEventId: params.eventId,
      lastFinancialEventAt: eventIsoDate,
      lastFinancialEventStatus: 'APPROVED',
      createdAt: now,
      updatedAt: now
    };

    transaction.set(paymentRef, newPaymentRecord);
    transaction.set(subRef, currentSub, { merge: true });

    return {
      isNewPayment: true,
      paymentRecord: newPaymentRecord,
      subscriptionRecord: currentSub,
      planPricing: pricing
    };
  });
}

/**
 * Conclui com sucesso o registro durável do evento de webhook no Firestore.
 */
export async function finalizeWebhookEvent(
  eventId: string,
  details: {
    paymentId?: string;
    preapprovalId?: string;
    barbershopId?: string;
  }
): Promise<void> {
  try {
    const { firestore } = getFirebaseAdmin();
    const eventRef = firestore.collection('webhook_events').doc(eventId);
    await eventRef.set(
      {
        status: 'SUCCESS',
        completedAt: new Date().toISOString(),
        paymentId: details.paymentId || null,
        preapprovalId: details.preapprovalId || null,
        barbershopId: details.barbershopId || null
      },
      { merge: true }
    );
  } catch (err) {
    console.warn(`[WebhookService] Falha ao finalizar webhook_events/${eventId}:`, err);
  }
}

/**
 * Marca o evento como falho caso o processamento lance exceção não tratada.
 */
export async function markWebhookEventFailed(eventId: string, error: string): Promise<void> {
  try {
    const { firestore } = getFirebaseAdmin();
    const eventRef = firestore.collection('webhook_events').doc(eventId);
    await eventRef.set(
      {
        status: 'ERROR',
        error,
        failedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (err) {
    console.warn(`[WebhookService] Falha ao marcar erro em webhook_events/${eventId}:`, err);
  }
}

export interface PreapprovalTransactionParams {
  barbershopId: string;
  preapprovalStatus: string;
  preapprovalId?: string;
  now?: string;
}

export interface PreapprovalTransactionResult {
  found: boolean;
  subscriptionRecord?: DurableSubscriptionRecord;
  statusTransitioned: boolean;
}

/**
 * P2-A: Processa a atualização de status de preapproval dentro de uma transação atômica no Firestore.
 * 
 * Regra Soberana:
 * - A consulta ao Mercado Pago ocorre FORA da transação.
 * - A transação lê subRef de forma consistente com OCC.
 * - Se a assinatura estiver CANCELED no snapshot mais recente, CANCELED é estritamente terminal:
 *   o evento authorized NUNCA altera status para ACTIVE ou TRIAL_14_DAYS.
 * - Se estiver SUSPENDED ou PAST_DUE, mantém o estado financeiro sem alterar para ACTIVE.
 */
export async function recordDurablePreapprovalTransaction(
  params: PreapprovalTransactionParams
): Promise<PreapprovalTransactionResult> {
  const { firestore } = getFirebaseAdmin();
  const subRef = firestore.collection('subscriptions').doc(`sub-${params.barbershopId}`);
  const now = params.now || new Date().toISOString();

  return await firestore.runTransaction(async (transaction) => {
    const subDoc = await transaction.get(subRef);
    if (!subDoc.exists) {
      return { found: false, statusTransitioned: false };
    }

    const currentSub = subDoc.data() as DurableSubscriptionRecord;

    // REGRA P2-A: CANCELED é estritamente terminal dentro da transação!
    // subscription_preapproval authorized NÃO pode alterar status -> ACTIVE
    // NÃO pode alterar status -> TRIAL_14_DAYS
    // NÃO pode reativar a assinatura.
    if (currentSub.status === 'CANCELED') {
      currentSub.updatedAt = now;
      if (params.preapprovalId) {
        currentSub.mercadopagoSubscriptionId = params.preapprovalId;
      }
      transaction.set(subRef, { updatedAt: now, mercadopagoSubscriptionId: currentSub.mercadopagoSubscriptionId }, { merge: true });
      return {
        found: true,
        subscriptionRecord: currentSub,
        statusTransitioned: false
      };
    }

    // REGRA FASE 5.2D: LIFETIME_LICENSE é permanente e soberana!
    // Webhooks de assinaturas mensais anteriores (authorized, cancelled, etc.) NÃO podem sobrescrever LIFETIME_LICENSE
    if (currentSub.status === 'LIFETIME_LICENSE') {
      currentSub.updatedAt = now;
      transaction.set(subRef, { updatedAt: now }, { merge: true });
      return {
        found: true,
        subscriptionRecord: currentSub,
        statusTransitioned: false
      };
    }

    let statusTransitioned = false;

    if (params.preapprovalStatus === 'authorized') {
      currentSub.cardValidated = true;
      if (params.preapprovalId) {
        currentSub.mercadopagoSubscriptionId = params.preapprovalId;
      }

      // Se a assinatura estiver em inadimplência ou suspensa por estorno/chargeback,
      // a simples autorização do contrato de preapproval NÃO quita a dívida!
      if (currentSub.status === 'SUSPENDED' || currentSub.status === 'PAST_DUE') {
        // Preserva status PAST_DUE / SUSPENDED sem transicionar para ACTIVE
        statusTransitioned = false;
      } else if (currentSub.status === 'PENDING') {
        const nowStr = now.split('T')[0];
        if (currentSub.trialEndDate && currentSub.trialEndDate >= nowStr && (currentSub.paidBillingCount || 0) === 0) {
          currentSub.status = 'TRIAL_14_DAYS';
          currentSub.isInTrial = true;
          currentSub.currentPrice = 0.00;
        } else {
          currentSub.status = 'ACTIVE';
          currentSub.isInTrial = false;
        }
        statusTransitioned = true;
      } else {
        // ACTIVE ou TRIAL_14_DAYS
        const nowStr = now.split('T')[0];
        if (currentSub.trialEndDate && currentSub.trialEndDate >= nowStr && (currentSub.paidBillingCount || 0) === 0) {
          currentSub.status = 'TRIAL_14_DAYS';
          currentSub.isInTrial = true;
          currentSub.currentPrice = 0.00;
        } else {
          currentSub.status = 'ACTIVE';
          currentSub.isInTrial = false;
        }
        statusTransitioned = true;
      }
    } else if (params.preapprovalStatus === 'cancelled') {
      currentSub.status = 'CANCELED';
      if (!currentSub.canceledAt) {
        currentSub.canceledAt = now;
      }
      statusTransitioned = true;
    }

    currentSub.updatedAt = now;
    transaction.set(subRef, currentSub, { merge: true });

    return {
      found: true,
      subscriptionRecord: currentSub,
      statusTransitioned
    };
  });
}

/**
 * P2-B: Aplica a reconciliação do preapproval à assinatura com guarda estrita contra sobrescrita financeira.
 * 
 * Regras Soberanas:
 * - preapproval authorized significa apenas autorização contratual do gateway.
 * - NÃO prova quitação de fatura do ciclo financeiro atual.
 * - CANCELED permanece CANCELED.
 * - SUSPENDED permanece SUSPENDED.
 * - PAST_DUE permanece PAST_DUE.
 * - Não apaga lastReversalAt nem lastReversalType.
 * - Não cria pagamentos nem incrementa paidBillingCount.
 * - Trata explicitamente PENDING para TRIAL_14_DAYS ou ACTIVE.
 */
export function applyPreapprovalSyncToSubscription(
  subscription: DurableSubscriptionRecord,
  mpData: any,
  nowIso = new Date().toISOString()
): { subscription: DurableSubscriptionRecord; changed: boolean } {
  const nowDateStr = nowIso.split('T')[0];
  let changed = false;

  if (mpData.status === 'authorized') {
    subscription.cardValidated = true;
    changed = true;

    // Guarda estrita contra retrocesso de status financeiro
    if (subscription.status === 'CANCELED') {
      // Permanece CANCELED (estado terminal)
    } else if (subscription.status === 'SUSPENDED') {
      // Permanece SUSPENDED (bloqueado por chargeback ou inadimplência)
    } else if (subscription.status === 'PAST_DUE') {
      // Permanece PAST_DUE (fatura rejeitada ou estornada)
    } else if (subscription.status === 'PENDING') {
      // Ativação cadastral inicial a partir de PENDING
      if (subscription.trialEndDate && subscription.trialEndDate >= nowDateStr && (subscription.paidBillingCount || 0) === 0) {
        subscription.status = 'TRIAL_14_DAYS';
        subscription.isInTrial = true;
      } else {
        subscription.status = 'ACTIVE';
        subscription.isInTrial = false;
      }
    } else if (subscription.status === 'TRIAL_14_DAYS') {
      if (subscription.trialEndDate && subscription.trialEndDate >= nowDateStr && (subscription.paidBillingCount || 0) === 0) {
        subscription.isInTrial = true;
      } else {
        subscription.status = 'ACTIVE';
        subscription.isInTrial = false;
      }
    } else if (subscription.status === 'ACTIVE') {
      subscription.isInTrial = false;
    }
  } else if (mpData.status === 'cancelled') {
    subscription.status = 'CANCELED';
    if (!subscription.canceledAt) subscription.canceledAt = nowIso;
    changed = true;
  } else if (mpData.status === 'pending') {
    if (subscription.status !== 'CANCELED' && subscription.status !== 'SUSPENDED' && subscription.status !== 'PAST_DUE') {
      subscription.status = 'PENDING';
      changed = true;
    }
  }

  subscription.updatedAt = nowIso;
  return { subscription, changed };
}
