import crypto from 'node:crypto';
import { getFirebaseAdmin } from './firebaseAdmin.js';

export interface StoredPlanBillingScheduleStage {
  id: string;
  order: number;
  name: string;
  duration: number;
  unit: 'DAYS' | 'MONTHS' | 'CYCLES' | 'INDEFINITE';
  price: number;
}

export interface StoredPlanFeatures {
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

export interface StoredPlanLimits {
  maxProfessionals: number | 'UNLIMITED';
  maxUnits: number | 'UNLIMITED';
  maxClients: number | 'UNLIMITED';
}

export interface StoredPlan {
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

export const DEFAULT_PLANS: StoredPlan[] = [
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
  },
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
        id: 'stage-trial-profissional',
        order: 1,
        name: '14 Dias Grátis de Avaliação',
        duration: 14,
        unit: 'DAYS',
        price: 0.00
      },
      {
        id: 'stage-promo-profissional',
        order: 2,
        name: 'Preço Promocional de Lançamento (3 Primeiros Meses)',
        duration: 3,
        unit: 'MONTHS',
        price: 49.90
      },
      {
        id: 'stage-regular-profissional',
        order: 3,
        name: 'Preço Normal Recorrente (A partir do 4º Mês)',
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
    mercadopagoPlanId: 'mp-plan-profissional-6990',
    subscribersCount: 8,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  },
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
        id: 'stage-trial-premium',
        order: 1,
        name: '14 Dias Grátis de Avaliação',
        duration: 14,
        unit: 'DAYS',
        price: 0.00
      },
      {
        id: 'stage-promo-premium',
        order: 2,
        name: 'Preço Promocional (3 Primeiros Meses)',
        duration: 3,
        unit: 'MONTHS',
        price: 79.90
      },
      {
        id: 'stage-regular-premium',
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
  },
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
];

export type PlanStatusChangeResult = StoredPlan & {
  changed: boolean;
  previousStatus?: 'ACTIVE' | 'INACTIVE';
};

export interface CreatePlanParams {
  planData: Omit<StoredPlan, 'id' | 'createdAt' | 'updatedAt' | 'subscribersCount' | 'mercadopagoPlanId'>;
  idempotencyKey: string;
  actorUid: string;
}

export interface DuplicatePlanParams {
  sourcePlanId: string;
  idempotencyKey: string;
  actorUid: string;
}

export interface PlanOperationResult {
  success: boolean;
  plan?: StoredPlan;
  isReplay?: boolean;
  collision?: boolean;
  notFound?: boolean;
  error?: string;
}

export function canonicalizeValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(canonicalizeValue);
  const sortedKeys = Object.keys(val).sort();
  const result: Record<string, any> = {};
  for (const k of sortedKeys) {
    result[k] = canonicalizeValue(val[k]);
  }
  return result;
}

export function computePlanCreateFingerprint(data: any): string {
  const canonical = {
    name: typeof data.name === 'string' ? data.name.trim() : '',
    priceMonthly: Number(data.priceMonthly),
    billingCycle: data.billingCycle || 'MONTHLY',
    status: data.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    description: data.description ? String(data.description).trim() : '',
    hasTrial: Boolean(data.hasTrial),
    trialDuration: Number(data.trialDuration) || 0,
    trialUnit: data.trialUnit || 'DAYS',
    hasPromotion: Boolean(data.hasPromotion),
    promotionalPrice: data.promotionalPrice !== undefined && data.promotionalPrice !== null ? Number(data.promotionalPrice) : null,
    promotionDuration: Number(data.promotionDuration) || 0,
    promotionUnit: data.promotionUnit || 'MONTHS',
    priceAfterPromotion: data.priceAfterPromotion !== undefined && data.priceAfterPromotion !== null ? Number(data.priceAfterPromotion) : Number(data.priceMonthly),
    features: canonicalizeValue(data.features || {}),
    limits: canonicalizeValue(data.limits || {}),
    scheduleStages: canonicalizeValue(data.scheduleStages || [])
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function computePlanDuplicateFingerprint(sourcePlanId: string): string {
  const canonical = {
    sourcePlanId: sourcePlanId.trim()
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function getPlanIdempotencyDocId(operation: 'PLAN_CREATE' | 'PLAN_DUPLICATE', actorUid: string, idempotencyKey: string): string {
  const raw = `${operation}:${actorUid}:${idempotencyKey}`;
  return `plan_idemp_${crypto.createHash('sha256').update(raw).digest('hex')}`;
}

export class PlanService {
  private plansCache: Map<string, StoredPlan> = new Map();
  private isInitialized = false;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 15 * 1000; // 15 segundos TTL para garantir consistência entre múltiplas instâncias

  constructor() {
    this.populateDefaultCache();
  }

  private populateDefaultCache(): void {
    for (const plan of DEFAULT_PLANS) {
      this.plansCache.set(plan.id, { ...plan });
    }
    const legacy = this.plansCache.get('plano-essencial');
    if (legacy) {
      this.plansCache.set('PLANO_UNICO', { ...legacy, id: 'PLANO_UNICO', name: 'Plano Essencial' });
    }
  }

  public async getPlans(): Promise<StoredPlan[]> {
    await this.ensureInitialized();
    const plansArray = Array.from(this.plansCache.values())
      .filter(p => p.id !== 'PLANO_UNICO');
    return plansArray;
  }

  public async getPlanById(id: string): Promise<StoredPlan | null> {
    await this.ensureInitialized();
    if (id === 'PLANO_UNICO') {
      return this.plansCache.get('PLANO_UNICO') || this.plansCache.get('plano-essencial') || null;
    }
    return this.plansCache.get(id) || null;
  }

  public async savePlan(plan: StoredPlan): Promise<StoredPlan> {
    await this.ensureInitialized();
    const nowIso = new Date().toISOString();
    const planToSave: StoredPlan = {
      ...plan,
      updatedAt: nowIso
    };

    // 1. Persistência primária autoritativa no Firestore
    try {
      const { firestore } = getFirebaseAdmin();
      await firestore.collection('plans').doc(plan.id).set(planToSave, { merge: true });
    } catch (err) {
      console.warn(`[PlanService] Aviso ao persistir plano ${plan.id} no Firestore:`, err);
    }

    // 2. Atualização atômica do cache local em memória e timestamp
    this.plansCache.set(plan.id, planToSave);
    if (plan.id === 'plano-essencial') {
      this.plansCache.set('PLANO_UNICO', { ...planToSave, id: 'PLANO_UNICO', name: 'Plano Essencial' });
    }
    this.lastFetchTime = Date.now();

    return planToSave;
  }

  /**
   * Define o status de um plano com semântica absoluta e autoridade transacional fail-closed.
   * FASE 4.9B.4 & FASE 4.9B.6: A decisão de idempotência (no-op) e a gravação ocorrem diretamente
   * sobre o estado autoritativo no Firestore via runTransaction.
   * Se a transação falhar ou for abortada, nenhuma mutação em memória ou sucesso fictício é aplicado.
   */
  public async setPlanStatus(
    id: string,
    targetStatus: 'ACTIVE' | 'INACTIVE'
  ): Promise<PlanStatusChangeResult | null> {
    const canonicalId = id === 'PLANO_UNICO' ? 'plano-essencial' : id;

    const { firestore } = getFirebaseAdmin();
    if (!firestore || typeof firestore.runTransaction !== 'function') {
      throw new Error(`[PlanService] Firestore runTransaction indisponível para mutação autoritativa de ${canonicalId}`);
    }

    const docRef = firestore.collection('plans').doc(canonicalId);

    const txResult = await firestore.runTransaction(async (transaction: any) => {
      const docSnap = await transaction.get(docRef);

      let existing: StoredPlan | null = null;
      if (docSnap && docSnap.exists) {
        existing = docSnap.data() as StoredPlan;
      } else {
        // Se o documento ainda não foi persistido no Firestore, verifica catálogo padrão
        const defaultPlan = DEFAULT_PLANS.find(p => p.id === canonicalId);
        if (defaultPlan) {
          existing = { ...defaultPlan };
        }
      }

      if (!existing) {
        return null; // Plano inexistente
      }

      const previousStatus = existing.status;
      const changed = previousStatus !== targetStatus;

      if (!changed) {
        // Verdadeiro no-op autoritativo: Firestore já se encontra no status pretendido
        return {
          plan: existing,
          changed: false,
          previousStatus
        };
      }

      const nowIso = new Date().toISOString();
      const updated: StoredPlan = {
        ...existing,
        id: canonicalId,
        status: targetStatus,
        updatedAt: nowIso
      };

      transaction.set(docRef, updated, { merge: true });

      return {
        plan: updated,
        changed: true,
        previousStatus
      };
    });

    if (!txResult) {
      return null; // Plano inexistente
    }

    // Atualização imediata do cache local desta instância APENAS após commit bem-sucedido
    this.plansCache.set(canonicalId, txResult.plan);
    if (canonicalId === 'plano-essencial') {
      this.plansCache.set('PLANO_UNICO', {
        ...txResult.plan,
        id: 'PLANO_UNICO',
        name: 'Plano Essencial'
      });
    }
    this.lastFetchTime = Date.now();

    return {
      ...txResult.plan,
      changed: txResult.changed,
      previousStatus: txResult.previousStatus
    };
  }

  /**
   * Cria um novo plano de forma idempotente e atômica via Firestore runTransaction.
   * FASE 4.9D: IDs seguros via UUID (elimina slice(-4)), proteção durável contra replay
   * e detecção estrita de colisão de payload (HTTP 409).
   */
  public async createPlanIdempotently(params: CreatePlanParams): Promise<PlanOperationResult> {
    const { planData, idempotencyKey, actorUid } = params;
    const { firestore } = getFirebaseAdmin();
    if (!firestore || typeof firestore.runTransaction !== 'function') {
      throw new Error('[PlanService] Firestore runTransaction indisponível para criação idempotente de plano.');
    }

    const fingerprint = computePlanCreateFingerprint(planData);
    const docId = getPlanIdempotencyDocId('PLAN_CREATE', actorUid, idempotencyKey);
    const idempRef = firestore.collection('idempotency_keys').doc(docId);

    const nowIso = new Date().toISOString();
    const normalizedSlug = (planData.name || 'custom')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'custom';
    const planId = `plan-${normalizedSlug}-${crypto.randomUUID()}`;

    const newPlan: StoredPlan = {
      ...planData,
      id: planId,
      name: planData.name.trim(),
      description: planData.description || `Plano de gestão para barbearias (${planData.billingCycle || 'MONTHLY'}).`,
      status: planData.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      priceMonthly: Number(planData.priceMonthly),
      billingCycle: planData.billingCycle || 'MONTHLY',
      mercadopagoPlanId: `mp-plan-${planId}`,
      subscribersCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const txResult = await firestore.runTransaction(async (transaction: any) => {
      // 1. Verificar idempotency record
      const idempDoc = await transaction.get(idempRef);
      if (idempDoc && idempDoc.exists) {
        const idempData = idempDoc.data();
        if (idempData.fingerprint !== fingerprint) {
          return {
            collision: true as const,
            error: 'Chave de idempotência já utilizada com parâmetros diferentes.'
          };
        }
        return {
          replay: true as const,
          plan: idempData.savedPlan as StoredPlan
        };
      }

      // 2. Gravar o novo documento de plano
      const planRef = firestore.collection('plans').doc(planId);
      transaction.set(planRef, newPlan);

      // 3. Gravar o registro de idempotência atomicamente
      const record = {
        id: docId,
        actorUid,
        operation: 'PLAN_CREATE',
        idempotencyKey,
        fingerprint,
        status: 'COMPLETED',
        planId: newPlan.id,
        savedPlan: newPlan,
        createdAt: nowIso
      };
      transaction.set(idempRef, record);

      return {
        success: true as const,
        plan: newPlan
      };
    });

    if (txResult.collision) {
      return { success: false, collision: true, error: txResult.error };
    }

    if (txResult.replay) {
      this.plansCache.set(txResult.plan.id, txResult.plan);
      this.lastFetchTime = Date.now();
      return { success: true, plan: txResult.plan, isReplay: true };
    }

    this.plansCache.set(txResult.plan.id, txResult.plan);
    this.lastFetchTime = Date.now();
    return { success: true, plan: txResult.plan, isReplay: false };
  }

  /**
   * Duplica um plano de forma idempotente e atômica via Firestore runTransaction.
   * FASE 4.9D: ID seguro via UUID e registro durável de idempotência.
   */
  public async duplicatePlanIdempotently(params: DuplicatePlanParams): Promise<PlanOperationResult> {
    const { sourcePlanId, idempotencyKey, actorUid } = params;
    const { firestore } = getFirebaseAdmin();
    if (!firestore || typeof firestore.runTransaction !== 'function') {
      throw new Error('[PlanService] Firestore runTransaction indisponível para duplicação idempotente de plano.');
    }

    const fingerprint = computePlanDuplicateFingerprint(sourcePlanId);
    const docId = getPlanIdempotencyDocId('PLAN_DUPLICATE', actorUid, idempotencyKey);
    const idempRef = firestore.collection('idempotency_keys').doc(docId);

    const canonicalSourceId = sourcePlanId === 'PLANO_UNICO' ? 'plano-essencial' : sourcePlanId;
    const sourceRef = firestore.collection('plans').doc(canonicalSourceId);

    const txResult = await firestore.runTransaction(async (transaction: any) => {
      // 1. Verificar registro de idempotência
      const idempDoc = await transaction.get(idempRef);
      if (idempDoc && idempDoc.exists) {
        const idempData = idempDoc.data();
        if (idempData.fingerprint !== fingerprint) {
          return {
            collision: true as const,
            error: 'Chave de idempotência já utilizada para outra duplicação.'
          };
        }
        return {
          replay: true as const,
          plan: idempData.savedPlan as StoredPlan
        };
      }

      // 2. Ler plano de origem diretamente na transação (autoritativo)
      const sourceDoc = await transaction.get(sourceRef);
      let original: StoredPlan | null = null;
      if (sourceDoc && sourceDoc.exists) {
        original = sourceDoc.data() as StoredPlan;
      } else {
        const defaultPlan = DEFAULT_PLANS.find(p => p.id === canonicalSourceId);
        if (defaultPlan) {
          original = { ...defaultPlan };
        }
      }

      if (!original) {
        return {
          notFound: true as const,
          error: 'Plano original não encontrado para duplicação.'
        };
      }

      // 3. Montar plano duplicado com ID seguro e UUID
      const nowIso = new Date().toISOString();
      const newId = `plan-${original.id}-copia-${crypto.randomUUID()}`;
      const duplicatedPlan: StoredPlan = {
        ...original,
        id: newId,
        name: `${original.name} (Cópia)`,
        status: 'INACTIVE',
        subscribersCount: 0,
        mercadopagoPlanId: `mp-plan-${newId}`,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const newPlanRef = firestore.collection('plans').doc(newId);
      transaction.set(newPlanRef, duplicatedPlan);

      // 4. Gravar registro de idempotência
      const record = {
        id: docId,
        actorUid,
        operation: 'PLAN_DUPLICATE',
        idempotencyKey,
        fingerprint,
        status: 'COMPLETED',
        planId: duplicatedPlan.id,
        savedPlan: duplicatedPlan,
        createdAt: nowIso
      };
      transaction.set(idempRef, record);

      return {
        success: true as const,
        plan: duplicatedPlan
      };
    });

    if (txResult.collision) {
      return { success: false, collision: true, error: txResult.error };
    }

    if (txResult.notFound) {
      return { success: false, notFound: true, error: txResult.error };
    }

    if (txResult.replay) {
      this.plansCache.set(txResult.plan.id, txResult.plan);
      this.lastFetchTime = Date.now();
      return { success: true, plan: txResult.plan, isReplay: true };
    }

    this.plansCache.set(txResult.plan.id, txResult.plan);
    this.lastFetchTime = Date.now();
    return { success: true, plan: txResult.plan, isReplay: false };
  }

  public async duplicatePlan(id: string, idempotencyKey?: string, actorUid?: string): Promise<StoredPlan | null> {
    const key = idempotencyKey || crypto.randomUUID();
    const actor = actorUid || 'super_admin';
    const result = await this.duplicatePlanIdempotently({
      sourcePlanId: id,
      idempotencyKey: key,
      actorUid: actor
    });
    if (result.success) {
      return result.plan;
    }
    return null;
  }

  public async ensureInitialized(forceRefresh = false): Promise<void> {
    const isTtlExpired = Date.now() - this.lastFetchTime > this.CACHE_TTL_MS;
    if (this.isInitialized && !forceRefresh && !isTtlExpired) return;

    try {
      const { firestore } = getFirebaseAdmin();
      const snapshot = await firestore.collection('plans').get();

      if (!snapshot.empty) {
        for (const doc of snapshot.docs) {
          const data = doc.data() as StoredPlan;
          if (data && data.id) {
            this.plansCache.set(data.id, data);
          }
        }
      } else {
        // Bootstrap inicial idempotente no Firestore com os planos padrão
        const batch = firestore.batch();
        for (const plan of DEFAULT_PLANS) {
          const docRef = firestore.collection('plans').doc(plan.id);
          batch.set(docRef, plan, { merge: true });
        }
        await batch.commit().catch(e => console.warn('[PlanService] Falha no bootstrap de planos no Firestore:', e));
      }

      const legacy = this.plansCache.get('plano-essencial');
      if (legacy) {
        this.plansCache.set('PLANO_UNICO', { ...legacy, id: 'PLANO_UNICO', name: 'Plano Essencial' });
      }
      this.isInitialized = true;
      this.lastFetchTime = Date.now();
    } catch (err) {
      console.warn('[PlanService] Usando fallback em memória (Firestore indisponível):', err);
      this.isInitialized = true; // Permite prosseguir com cache em memória
    }
  }

  // Método auxiliar para testes e reinicialização de cache
  public resetCache(): void {
    this.plansCache.clear();
    this.populateDefaultCache();
    this.isInitialized = false;
    this.lastFetchTime = 0;
  }

  // Método auxiliar para testes e simulação de cache stale multi-instância
  public setLocalCacheStatusForTesting(id: string, status: 'ACTIVE' | 'INACTIVE'): void {
    const canonicalId = id === 'PLANO_UNICO' ? 'plano-essencial' : id;
    const plan = this.plansCache.get(canonicalId);
    if (plan) {
      this.plansCache.set(canonicalId, { ...plan, status });
      if (canonicalId === 'plano-essencial') {
        this.plansCache.set('PLANO_UNICO', { ...plan, id: 'PLANO_UNICO', status });
      }
      this.lastFetchTime = Date.now();
    }
  }
}

export const planService = new PlanService();
