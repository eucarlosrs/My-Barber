/**
 * MY BARBER — RECONCILIAÇÃO SEGURA DE PREAPPROVALS E PAGAMENTOS DO MERCADO PAGO
 * FASE 3.3B & FASE 3.5B: Reconciliação Durável, Recuperação de Pagamentos e Integridade Financeira
 * 
 * Princípios Fundamentais:
 * 1. CREATE: Cria nova preapproval via POST /preapproval (somente após RECOVERY CHECK retornar NOT_FOUND).
 * 2. RECOVER: Localiza preapproval existente no Mercado Pago e restaura associação local. NUNCA chama POST /preapproval.
 * 3. RECONCILE: Compara estado do Mercado Pago com estado local e identifica divergências. NUNCA chama POST /preapproval.
 * 4. RECONCILE PAYMENTS: Localiza pagamentos aprovados no gateway não processados localmente (gap de webhooks perdidos).
 * 5. Isolamento Multi-Tenant estrito: external_reference DEVE bater com barbershopId.
 * 6. Não-ambiguidade: Múltiplos candidatos compatíveis bloqueiam criação (RECONCILIATION_AMBIGUOUS).
 * 7. Blindagem Financeira: Idempotência via Firestore Transactions determinísticas (pay-{paymentId}).
 */

import { getFirebaseAdmin } from './firebaseAdmin.js';
import {
  recordDurablePaymentTransaction,
  validateFinancialTimestamp,
  DurableSubscriptionRecord,
  DurablePaymentRecord
} from './webhookService.js';

export type CandidateEvaluationResult = 'MATCH' | 'INCOMPATIBLE' | 'AMBIGUOUS' | 'NOT_FOUND' | 'NEEDS_REVIEW';

export interface LocalCreationContext {
  barbershopId: string;
  payerEmail: string;
  planId: string;
  planName?: string;
  expectedAmount: number;
  currencyId?: string;
  billingCycle?: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'ONE_TIME';
  frequency?: number;
  frequencyType?: 'months' | 'days';
  attemptTimestampMs?: number;
  knownMpSubscriptionId?: string;
}

export interface CandidateEvaluationDetail {
  result: CandidateEvaluationResult;
  reason?: string;
  candidateId?: string;
}

export interface RecoverySearchResult {
  status: 'RECOVERED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'GATEWAY_ERROR' | 'INCOMPATIBLE';
  candidate?: any;
  candidates?: any[];
  error?: string;
  statusCode?: number;
  reason?: string;
}

export interface RecoveryIdResult {
  status: 'RECOVERED' | 'NOT_FOUND' | 'INCOMPATIBLE' | 'GATEWAY_ERROR';
  candidate?: any;
  error?: string;
  statusCode?: number;
  reason?: string;
}

export interface RecoveryCheckResult {
  operation: 'PROCEED_TO_CREATE' | 'RECOVER_EXISTING' | 'BLOCK_AMBIGUOUS' | 'BLOCK_INCOMPATIBLE' | 'GATEWAY_UNAVAILABLE';
  candidate?: any;
  candidates?: any[];
  reason?: string;
  mpSubscriptionId?: string;
  initPointUrl?: string;
  httpStatus?: number;
}

/**
 * Avalia um candidato retornado pelo Mercado Pago em relação ao contexto da tentativa local.
 * Retorna estritamente 'MATCH', 'INCOMPATIBLE' ou 'NEEDS_REVIEW' com justificativa detalhada.
 * 
 * AUDITORIA FASE 3.3C:
 * - A janela temporal de 48h NÃO é utilizada isoladamente para descartar candidatos compatíveis.
 * - external_reference identifica o tenant (barbershopId), mas não é chave única primária.
 * - Candidatos cancelados são marcados como INCOMPATIBLE para nova contratação (mas não geram reativação).
 * - Se dados essenciais forem ambíguos ou incompletos, retorna 'NEEDS_REVIEW' para bloquear criação.
 */
export function evaluatePreapprovalCandidate(
  candidate: any,
  context: LocalCreationContext
): CandidateEvaluationResult {
  const detail = evaluatePreapprovalCandidateWithDetail(candidate, context);
  return detail.result;
}

export function evaluatePreapprovalCandidateWithDetail(
  candidate: any,
  context: LocalCreationContext
): CandidateEvaluationDetail {
  if (!candidate || typeof candidate !== 'object') {
    return { result: 'INCOMPATIBLE', reason: 'Candidato inválido ou nulo' };
  }

  const candidateId = candidate.id || candidate.preapproval_id;
  if (!candidateId || typeof candidateId !== 'string') {
    return { result: 'INCOMPATIBLE', reason: 'Candidato não possui ID válido', candidateId: String(candidateId) };
  }

  // 1. Cross-Tenant e external_reference: DEVE ser exatamente igual ao barbershopId
  const candidateExternalRef = candidate.external_reference;
  if (!candidateExternalRef || candidateExternalRef !== context.barbershopId) {
    return {
      result: 'INCOMPATIBLE',
      reason: `external_reference '${candidateExternalRef}' não coincide com o tenant '${context.barbershopId}'`,
      candidateId
    };
  }

  // 2. Status: Assinaturas CANCELADAS nunca podem ser recuperadas para nova contratação
  const rawStatus = String(candidate.status || '').toLowerCase();
  if (rawStatus === 'cancelled' || rawStatus === 'canceled') {
    return {
      result: 'INCOMPATIBLE',
      reason: 'Candidato está CANCELADO no Mercado Pago e não pode satisfazer nova contratação',
      candidateId
    };
  }

  // Status elegíveis para nova contratação: 'pending' ou 'authorized'
  if (rawStatus !== 'pending' && rawStatus !== 'authorized') {
    if (rawStatus === 'paused') {
      return {
        result: 'NEEDS_REVIEW',
        reason: 'Candidato está com status PAUSADO no Mercado Pago e requer intervenção manual',
        candidateId
      };
    }
    return {
      result: 'NEEDS_REVIEW',
      reason: `Status '${candidate.status}' desconhecido ou não reconhecido no Mercado Pago`,
      candidateId
    };
  }

  // 3. Payer Email: deve coincidir exatamente (case-insensitive)
  const candidateEmail = String(candidate.payer_email || '').trim().toLowerCase();
  const expectedEmail = String(context.payerEmail || '').trim().toLowerCase();
  if (!candidateEmail || candidateEmail !== expectedEmail) {
    return {
      result: 'INCOMPATIBLE',
      reason: `payer_email '${candidate.payer_email}' diverge do esperado '${context.payerEmail}'`,
      candidateId
    };
  }

  // 4. Valor (transaction_amount): deve ser numérico e idêntico ao esperado
  const candidateAmount = Number(candidate.auto_recurring?.transaction_amount ?? candidate.transaction_amount);
  if (isNaN(candidateAmount) || candidateAmount <= 0) {
    // Dados essenciais de valor ausentes ou corrompidos -> UNCERTAIN / NEEDS_REVIEW
    return {
      result: 'NEEDS_REVIEW',
      reason: `Valor de transação ausente ou inválido no candidato do Mercado Pago`,
      candidateId
    };
  }

  if (Math.abs(candidateAmount - context.expectedAmount) > 0.01) {
    return {
      result: 'INCOMPATIBLE',
      reason: `Valor R$ ${candidateAmount} diverge do valor esperado R$ ${context.expectedAmount}`,
      candidateId
    };
  }

  // 5. Moeda: BRL
  const candidateCurrency = String(candidate.auto_recurring?.currency_id || candidate.currency_id || 'BRL').toUpperCase();
  const expectedCurrency = String(context.currencyId || 'BRL').toUpperCase();
  if (candidateCurrency !== expectedCurrency) {
    return {
      result: 'INCOMPATIBLE',
      reason: `Moeda '${candidateCurrency}' diverge da esperada '${expectedCurrency}'`,
      candidateId
    };
  }

  // 6. Frequência / Ciclo
  if (context.frequency !== undefined) {
    const candidateFrequency = candidate.auto_recurring?.frequency ?? candidate.frequency;
    if (candidateFrequency !== undefined && Number(candidateFrequency) !== context.frequency) {
      return {
        result: 'INCOMPATIBLE',
        reason: `Frequência '${candidateFrequency}' diverge da esperada '${context.frequency}'`,
        candidateId
      };
    }
  }

  if (context.frequencyType) {
    const candidateFrequencyType = candidate.auto_recurring?.frequency_type ?? candidate.frequency_type;
    if (candidateFrequencyType && String(candidateFrequencyType).toLowerCase() !== context.frequencyType.toLowerCase()) {
      return {
        result: 'INCOMPATIBLE',
        reason: `Tipo de frequência '${candidateFrequencyType}' diverge do esperado '${context.frequencyType}'`,
        candidateId
      };
    }
  }

  // 7. Validação do ID específico (se fornecido no contexto, ex: tentativa anterior com mpSubscriptionId)
  if (context.knownMpSubscriptionId) {
    if (candidateId !== context.knownMpSubscriptionId) {
      return {
        result: 'INCOMPATIBLE',
        reason: `ID do candidato '${candidateId}' não coincide com o ID conhecido '${context.knownMpSubscriptionId}'`,
        candidateId
      };
    }
  }

  // 8. Init Point: Deve possuir URL válida de checkout do Mercado Pago
  const initPoint = candidate.init_point || candidate.sandbox_init_point;
  if (!initPoint || typeof initPoint !== 'string' || !initPoint.startsWith('https://')) {
    return {
      result: 'INCOMPATIBLE',
      reason: 'Candidato não possui URL de checkout (init_point) válida',
      candidateId
    };
  }

  // 9. Data de Criação (Auditoria FASE 3.3C):
  // A idade (> 48h) NÃO desqualifica nem autoriza um novo POST se o contrato pertencer ao tenant,
  // estiver pending/authorized e corresponder aos mesmos dados.
  // Contratos antigos continuam sendo MATCH recuperável para evitar cobrança duplicada.
  return {
    result: 'MATCH',
    candidateId
  };
}

/**
 * Consulta direta por ID no Mercado Pago: GET /preapproval/{mpSubscriptionId}
 * Valida o candidato retornado contra o contexto local.
 */
export async function recoverPreapprovalById(
  mpSubscriptionId: string,
  context: LocalCreationContext,
  callMpWithDetails: (endpoint: string, options?: RequestInit) => Promise<{ ok: boolean; status: number; data: any; errorText?: string }>
): Promise<RecoveryIdResult> {
  if (!mpSubscriptionId || typeof mpSubscriptionId !== 'string') {
    return { status: 'NOT_FOUND', reason: 'mpSubscriptionId inválido ou não fornecido' };
  }

  const res = await callMpWithDetails(`/preapproval/${encodeURIComponent(mpSubscriptionId)}`);
  if (!res.ok) {
    if (res.status === 404) {
      return { status: 'NOT_FOUND', statusCode: 404, reason: `Preapproval '${mpSubscriptionId}' não existe no Mercado Pago` };
    }
    return {
      status: 'GATEWAY_ERROR',
      statusCode: res.status,
      error: res.errorText || `Erro (${res.status}) ao consultar preapproval por ID no Mercado Pago`
    };
  }

  const candidate = res.data;
  const evaluation = evaluatePreapprovalCandidateWithDetail(candidate, context);

  if (evaluation.result === 'MATCH') {
    return { status: 'RECOVERED', candidate };
  }

  return {
    status: 'INCOMPATIBLE',
    candidate,
    reason: evaluation.reason || 'Preapproval não é compatível com os dados da tentativa'
  };
}

/**
 * Pesquisa exaustiva e paginada no Mercado Pago: GET /preapproval/search
 * 
 * AUDITORIA FASE 3.3C:
 * 1. Parâmetro de busca suportado oficialmente pela API do Mercado Pago: `payer_email`, `limit`, `offset`.
 *    A API do Mercado Pago NÃO documenta nem suporta `external_reference` como query param em /preapproval/search.
 * 2. O isolamento multi-tenant é realizado estritamente no processamento local de cada candidato retornado:
 *    `candidate.external_reference === barbershopId`.
 * 3. Paginação Obrigatória: Itera sobre todas as páginas utilizando `paging.total`, `paging.limit` e `paging.offset`.
 * 4. Jamais conclui NOT_FOUND se uma página intermediária falhar (retorna GATEWAY_ERROR).
 * 5. Múltiplos candidatos compatíveis retornam AMBIGUOUS (bloqueando criação sem escolha arbitrária).
 */
export async function searchPreapprovalsByTenant(
  barbershopId: string,
  context: LocalCreationContext,
  callMpWithDetails: (endpoint: string, options?: RequestInit) => Promise<{ ok: boolean; status: number; data: any; errorText?: string }>
): Promise<RecoverySearchResult> {
  const payerEmail = context.payerEmail?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!payerEmail || !emailRegex.test(payerEmail)) {
    return {
      status: 'GATEWAY_ERROR',
      statusCode: 400,
      error: 'payer_email é obrigatório e deve ter formato válido no contexto para pesquisa segura no Mercado Pago'
    };
  }

  // Paginação com limit 30 conforme padrão do serviço
  const limit = 30;
  let offset = 0;
  let total = 0;
  let pageCount = 0;
  const MAX_PAGES = 50; // Limite de proteção (50 * 30 = 1500 registros)
  let searchExhausted = false;

  const allTenantCandidates: any[] = [];
  const matchedCandidates: any[] = [];
  const uncertainCandidates: any[] = [];
  const conflictingActiveCandidates: any[] = [];
  const incompatibleDetails: { id: string; reason: string }[] = [];
  const seenIds = new Set<string>();

  do {
    // Parâmetro suportado oficialmente: payer_email, limit, offset
    const endpoint = `/preapproval/search?payer_email=${encodeURIComponent(payerEmail)}&limit=${limit}&offset=${offset}`;
    const res = await callMpWithDetails(endpoint);

    if (!res.ok) {
      return {
        status: 'GATEWAY_ERROR',
        statusCode: res.status,
        error: res.errorText || `Erro na página ${pageCount + 1} de pesquisa no Mercado Pago (${res.status})`
      };
    }

    const pageResults = Array.isArray(res.data?.results) ? res.data.results : [];

    // Verificação de inconsistência de resposta da API do Mercado Pago
    const reportedTotal = res.data?.paging?.total;
    if (typeof reportedTotal === 'number' && (isNaN(reportedTotal) || reportedTotal < 0)) {
      return {
        status: 'GATEWAY_ERROR',
        statusCode: 502,
        error: `GATEWAY_INCONSISTENCY: Metadados de paginação inválidos retornados pelo Mercado Pago (total: ${reportedTotal}).`
      };
    }

    for (const candidate of pageResults) {
      const candidateId = candidate.id || candidate.preapproval_id;
      if (candidateId) {
        if (seenIds.has(candidateId)) {
          // Registro duplicado retornado pela paginação do gateway
          continue;
        }
        seenIds.add(candidateId);
      }

      // Filtragem de isolamento multi-tenant estrita:
      if (candidate.external_reference !== barbershopId) {
        // Candidato pertence a outro tenant (ou não tem external_reference) -> ignorar para este tenant
        continue;
      }

      allTenantCandidates.push(candidate);
      const evalDetail = evaluatePreapprovalCandidateWithDetail(candidate, context);

      if (evalDetail.result === 'MATCH') {
        matchedCandidates.push(candidate);
      } else if (evalDetail.result === 'NEEDS_REVIEW') {
        uncertainCandidates.push({ candidate, reason: evalDetail.reason });
      } else {
        // Se o status for ativo/pendente mas incompatível com o plano/valor, registrar conflito
        const rawStatus = String(candidate.status || '').toLowerCase();
        if (rawStatus === 'pending' || rawStatus === 'authorized' || rawStatus === 'paused') {
          conflictingActiveCandidates.push({ candidate, reason: evalDetail.reason });
        }
        incompatibleDetails.push({
          id: candidate.id || 'sem-id',
          reason: evalDetail.reason || 'incompatível'
        });
      }
    }

    // Leitura dos metadados de paginação oficiais
    total = typeof res.data?.paging?.total === 'number' ? res.data.paging.total : (offset + pageResults.length);
    offset += limit;
    pageCount++;

    // Inconsistência: gateway retornou página vazia antes de atingir o total declarado
    if (pageResults.length === 0 && offset < total) {
      return {
        status: 'GATEWAY_ERROR',
        statusCode: 502,
        error: `SEARCH_INCOMPLETE: O gateway retornou página vazia no offset ${offset - limit} antes de atingir o total de registros (${total}).`
      };
    }

    if (pageResults.length === 0 || offset >= total) {
      searchExhausted = true;
      break;
    }
  } while (pageCount < MAX_PAGES);

  // Se o loop parou pelo limite de páginas antes de esgotar todos os registros do gateway:
  if (!searchExhausted && offset < total) {
    return {
      status: 'GATEWAY_ERROR',
      statusCode: 502,
      error: `SEARCH_INCOMPLETE: A pesquisa no gateway não conseguiu examinar todos os registros (${offset}/${total}). Criação bloqueada por precaução contra duplicidade.`
    };
  }

  // Se houver qualquer candidato ambíguo/sob revisão deste tenant, BLOQUEIA a criação por segurança
  if (uncertainCandidates.length > 0) {
    return {
      status: 'AMBIGUOUS',
      candidates: uncertainCandidates.map(u => u.candidate),
      reason: `Detectado(s) contrato(s) com dados inconclusivos para o tenant: ${uncertainCandidates.map(u => u.reason).join('; ')}. Bloqueado para evitar cobrança duplicada.`
    };
  }

  // Se houver contratos ativos/pendentes do próprio tenant com plano ou valor diferente (conflito):
  // NUNCA concluir NOT_FOUND -> CREATE. Bloqueia para exigir cancelamento prévio do contrato antigo.
  if (matchedCandidates.length === 0 && conflictingActiveCandidates.length > 0) {
    return {
      status: 'AMBIGUOUS',
      candidates: conflictingActiveCandidates.map(c => c.candidate),
      reason: `Detectado(s) contrato(s) ativo(s)/pendente(s) pré-existente(s) no Mercado Pago para este estabelecimento com plano ou valor diferente: ${conflictingActiveCandidates.map(c => c.reason).join('; ')}. Cancele a assinatura anterior antes de contratar novo plano.`
    };
  }

  // Exatamente 1 compatível: RECOVERED
  if (matchedCandidates.length === 1) {
    return {
      status: 'RECOVERED',
      candidate: matchedCandidates[0]
    };
  }

  // 2+ compatíveis: AMBIGUOUS (bloqueio mandatório, nunca escolher arbitrariamente)
  if (matchedCandidates.length > 1) {
    return {
      status: 'AMBIGUOUS',
      candidates: matchedCandidates,
      reason: `Foram encontradas múltiplas preapprovals ativas/pendentes (${matchedCandidates.length}) compatíveis para este estabelecimento no gateway`
    };
  }

  // 0 compatíveis: NOT_FOUND verdadeiro (busca 100% exaustiva e sem pendências ativas)
  return {
    status: 'NOT_FOUND',
    reason: allTenantCandidates.length > 0
      ? `Foram encontrados ${allTenantCandidates.length} registros para este tenant, mas todos foram cancelados ou encerrados`
      : 'Nenhuma assinatura prévia encontrada no gateway para este pagador/tenant'
  };
}

/**
 * Fluxo completo de RECOVERY CHECK executado antes de qualquer tentativa de CREATE.
 * 
 * Ordem de avaliação:
 * 1. Se lock anterior possuir mpSubscriptionId conhecido (ex: FIRESTORE_WRITE_FAILED):
 *    Tenta recoverPreapprovalById.
 *    - Se der MATCH -> RECOVER_EXISTING.
 *    - Se der GATEWAY_ERROR -> GATEWAY_UNAVAILABLE (fail-closed, nunca prossegue para POST).
 *    - Se der NOT_FOUND ou INCOMPATIBLE -> prossegue para pesquisa completa.
 * 2. Busca ativa paginada no gateway via searchPreapprovalsByTenant.
 *    - Se der RECOVERED (1 candidato) -> RECOVER_EXISTING.
 *    - Se der AMBIGUOUS (múltiplos candidatos ou incerteza) -> BLOCK_AMBIGUOUS (409).
 *    - Se der GATEWAY_ERROR -> GATEWAY_UNAVAILABLE (502/503).
 *    - Se der NOT_FOUND -> PROCEED_TO_CREATE.
 */
export async function executePreapprovalRecoveryCheck(
  barbershopId: string,
  context: LocalCreationContext,
  previousLockData: any,
  callMpWithDetails: (endpoint: string, options?: RequestInit) => Promise<{ ok: boolean; status: number; data: any; errorText?: string }>
): Promise<RecoveryCheckResult> {
  // 1. Tentar por ID conhecido do lock se disponível
  const knownId = previousLockData?.mpSubscriptionId || context.knownMpSubscriptionId;
  if (knownId && typeof knownId === 'string') {
    const idResult = await recoverPreapprovalById(knownId, { ...context, knownMpSubscriptionId: knownId }, callMpWithDetails);
    if (idResult.status === 'RECOVERED' && idResult.candidate) {
      const candidate = idResult.candidate;
      return {
        operation: 'RECOVER_EXISTING',
        candidate,
        mpSubscriptionId: candidate.id,
        initPointUrl: candidate.init_point || candidate.sandbox_init_point,
        reason: 'Recuperado com sucesso via ID registrado na tentativa anterior'
      };
    }

    if (idResult.status === 'GATEWAY_ERROR') {
      const isTemp = idResult.statusCode === 503 || idResult.statusCode === 504 || idResult.statusCode === 429;
      return {
        operation: 'GATEWAY_UNAVAILABLE',
        reason: idResult.error || 'Falha ao consultar contrato existente por ID no gateway de pagamento.',
        httpStatus: isTemp ? 503 : 502
      };
    }

    // Se idResult for NOT_FOUND ou INCOMPATIBLE, busca completa é necessária
  }

  // 2. Busca paginada no gateway pelo payer_email com filtro local estrito de tenant
  const searchResult = await searchPreapprovalsByTenant(barbershopId, context, callMpWithDetails);

  if (searchResult.status === 'RECOVERED' && searchResult.candidate) {
    const candidate = searchResult.candidate;
    return {
      operation: 'RECOVER_EXISTING',
      candidate,
      mpSubscriptionId: candidate.id,
      initPointUrl: candidate.init_point || candidate.sandbox_init_point,
      reason: 'Recuperado contrato único compatível já existente no gateway'
    };
  }

  if (searchResult.status === 'AMBIGUOUS') {
    return {
      operation: 'BLOCK_AMBIGUOUS',
      candidates: searchResult.candidates,
      reason: searchResult.reason || 'Foram encontradas múltiplas assinaturas compatíveis no gateway de pagamento. A criação foi bloqueada para evitar cobrança duplicada.',
      httpStatus: 409
    };
  }

  if (searchResult.status === 'GATEWAY_ERROR') {
    const isTemp = searchResult.statusCode === 503 || searchResult.statusCode === 504 || searchResult.statusCode === 429;
    return {
      operation: 'GATEWAY_UNAVAILABLE',
      reason: searchResult.error || 'Falha ao consultar gateway de pagamento para verificar contratos pré-existentes.',
      httpStatus: isTemp ? 503 : 502
    };
  }

  // searchResult.status === 'NOT_FOUND': Nenhuma assinatura existente compatível
  return {
    operation: 'PROCEED_TO_CREATE',
    reason: 'Nenhuma assinatura pré-existente compatível encontrada. Seguro prosseguir com criação.'
  };
}

/**
 * Operação RECONCILE: Compara estado de uma assinatura persistida no My Barber
 * com o estado do Mercado Pago.
 * NUNCA chama POST /preapproval.
 * NUNCA altera CANCELED para ACTIVE.
 * NUNCA incrementa paidBillingCount.
 */
export function reconcileSubscriptionWithMercadoPago(
  subscription: any,
  mpData: any,
  nowIso = new Date().toISOString()
): { reconciledSubscription: any; hasDivergence: boolean; divergences: string[] } {
  const divergences: string[] = [];
  const reconciled = { ...subscription };

  if (!mpData) {
    return { reconciledSubscription: reconciled, hasDivergence: false, divergences };
  }

  // 1. Comparar status
  const mpStatus = String(mpData.status || '').toLowerCase();
  if (mpStatus === 'cancelled' && reconciled.status !== 'CANCELED') {
    divergences.push(`Status local '${reconciled.status}' diverge do Mercado Pago 'cancelled'`);
    reconciled.status = 'CANCELED';
    if (!reconciled.canceledAt) reconciled.canceledAt = nowIso;
  } else if (mpStatus === 'authorized') {
    if (!reconciled.cardValidated) {
      divergences.push('Cartão não estava marcado como validado localmente');
      reconciled.cardValidated = true;
    }
    if (reconciled.status === 'PENDING') {
      divergences.push("Assinatura pendente autorizada no Mercado Pago transiciona para TRIAL ou ACTIVE");
      const nowDateStr = nowIso.split('T')[0];
      if (reconciled.trialEndDate && reconciled.trialEndDate >= nowDateStr && (reconciled.paidBillingCount || 0) === 0) {
        reconciled.status = 'TRIAL_14_DAYS';
        reconciled.isInTrial = true;
      } else {
        reconciled.status = 'ACTIVE';
        reconciled.isInTrial = false;
      }
    }
  }

  // 2. Comparar IDs
  if (mpData.id && reconciled.mercadopagoSubscriptionId !== mpData.id) {
    divergences.push(`ID local '${reconciled.mercadopagoSubscriptionId}' diverge de '${mpData.id}'`);
    reconciled.mercadopagoSubscriptionId = mpData.id;
  }

  // 3. Comparar Valor
  const mpAmount = Number(mpData.auto_recurring?.transaction_amount);
  if (!isNaN(mpAmount) && reconciled.currentPrice !== undefined && reconciled.currentPrice > 0) {
    if (Math.abs(mpAmount - reconciled.currentPrice) > 0.01 && !reconciled.isInTrial) {
      divergences.push(`Valor local R$ ${reconciled.currentPrice} diverge do Mercado Pago R$ ${mpAmount}`);
      reconciled.currentPrice = mpAmount;
    }
  }

  // 4. Comparar Init Point se faltar
  const mpInitPoint = mpData.init_point || mpData.sandbox_init_point;
  if (mpInitPoint && (!reconciled.initPointUrl || reconciled.initPointUrl !== mpInitPoint)) {
    reconciled.initPointUrl = mpInitPoint;
  }

  if (divergences.length > 0) {
    reconciled.updatedAt = nowIso;
  }

  return {
    reconciledSubscription: reconciled,
    hasDivergence: divergences.length > 0,
    divergences
  };
}

/**
 * Condição formal de autorização para emissão de POST /preapproval.
 * Somente autoriza novo contrato quando todas as regras e verificações
 * exaustivas foram 100% satisfeitas e nenhuma ambiguidade ou pendência existe.
 */
export function isCreateAllowed(checkResult: RecoveryCheckResult): boolean {
  return checkResult.operation === 'PROCEED_TO_CREATE';
}

/**
 * Calcula a próxima data de cobrança com base na data de evento e ciclo contratado.
 */
export function calculateNextBillingDate(
  fromDate: string | Date = new Date(),
  cycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'ONE_TIME' = 'MONTHLY'
): string {
  if (cycle === 'ONE_TIME') return 'VITALICIO';
  const d = typeof fromDate === 'string' ? new Date(fromDate) : new Date(fromDate.getTime());
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + 1);
    return fallback.toISOString().split('T')[0];
  }
  if (cycle === 'QUARTERLY') d.setMonth(d.getMonth() + 3);
  else if (cycle === 'SEMIANNUAL') d.setMonth(d.getMonth() + 6);
  else if (cycle === 'ANNUAL') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

export interface PaymentReconciliationOptions {
  barbershopId: string;
  subscription?: DurableSubscriptionRecord;
  callMpWithDetails?: (
    endpoint: string,
    options?: RequestInit
  ) => Promise<{ ok: boolean; status: number; data: any; errorText?: string }>;
  planDetails?: any;
  endpointMode?: 'auto' | 'authorized_payments' | 'payments_search';
  nextBillingDate?: string;
  paymentRecorder?: (params: any) => Promise<{
    isNewPayment: boolean;
    isReversalProcessed?: boolean;
    downgradePrevented?: boolean;
    paymentRecord: DurablePaymentRecord;
    subscriptionRecord: DurableSubscriptionRecord;
    planPricing?: any;
  }>;
  existingPaymentChecker?: (paymentId: string) => Promise<{ exists: boolean; data?: DurablePaymentRecord }>;
}

export interface PaymentReconciliationResult {
  status: 'RECONCILED' | 'NO_NEW_PAYMENTS' | 'AMBIGUOUS' | 'GATEWAY_ERROR' | 'SUBSCRIPTION_NOT_FOUND' | 'BLOCKED';
  barbershopId: string;
  mpSubscriptionId?: string;
  reconciledPaymentsCount: number;
  skippedPaymentsCount: number;
  newPayments: DurablePaymentRecord[];
  updatedSubscription?: DurableSubscriptionRecord;
  errors?: string[];
  error?: string;
  statusCode?: number;
  reason?: string;
}

interface ValidatedPaymentCandidate {
  paymentId: string;
  barbershopId: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  status: 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CHARGED_BACK';
  statusDetail: string;
  paymentMethod: string;
  eventDate: string;
  timeMs: number;
  rawCandidate: any;
}

/**
 * FASE 3.5B: RECONCILIAÇÃO REAL DE PAGAMENTOS COM O MERCADO PAGO
 * 
 * Corrige o gap de Webhook Perdido:
 * - Localiza pagamentos aprovados existentes no Mercado Pago associados ao preapproval/tenant;
 * - Pagina exaustivamente todas as páginas com detecção estrita de integridade;
 * - Valida tenant, amount, currency, status e timestamps financeiros;
 * - Bloqueia candidatos ambíguos ou incompletos (fail-closed);
 * - Persiste atomicamente no Firestore via recordDurablePaymentTransaction (pay-{paymentId});
 * - Incrementa paidBillingCount exatamente uma vez por novo pagamento;
 * - Preserva invariante contratual de preço (V3.4-E01) e status terminal CANCELED;
 * - Não cria cobranças (somente leitura no gateway e reconciliação durável no Firestore).
 */
export async function reconcileSubscriptionPaymentsWithMercadoPago(
  options: PaymentReconciliationOptions
): Promise<PaymentReconciliationResult> {
  const barbershopId = options.barbershopId?.trim();
  if (!barbershopId) {
    return {
      status: 'BLOCKED',
      barbershopId: '',
      reconciledPaymentsCount: 0,
      skippedPaymentsCount: 0,
      newPayments: [],
      reason: 'barbershopId é obrigatório para reconciliação financeira.',
      statusCode: 400
    };
  }

  // 1. Identificar a subscription com autoridade no Firestore
  const { firestore } = getFirebaseAdmin();
  let subscription: DurableSubscriptionRecord | null = options.subscription || null;

  if (!subscription) {
    const subRef = firestore.collection('subscriptions').doc(`sub-${barbershopId}`);
    const subDoc = await subRef.get();
    if (!subDoc.exists) {
      return {
        status: 'SUBSCRIPTION_NOT_FOUND',
        barbershopId,
        reconciledPaymentsCount: 0,
        skippedPaymentsCount: 0,
        newPayments: [],
        reason: `Assinatura sub-${barbershopId} não encontrada no Firestore.`,
        statusCode: 404
      };
    }
    subscription = subDoc.data() as DurableSubscriptionRecord;
  }

  // 2. Validação Multi-Tenant rigorosa na assinatura
  if (subscription.barbershopId && subscription.barbershopId !== barbershopId) {
    return {
      status: 'BLOCKED',
      barbershopId,
      reconciledPaymentsCount: 0,
      skippedPaymentsCount: 0,
      newPayments: [],
      reason: `Violação multi-tenant: subscription.barbershopId '${subscription.barbershopId}' diverge de '${barbershopId}'.`,
      statusCode: 403
    };
  }

  // 3. Obter o mpSubscriptionId
  const mpSubscriptionId = subscription.mercadopagoSubscriptionId;

  // 4. Configuração do chamador Mercado Pago
  const callMp = options.callMpWithDetails || (async (endpoint: string, opts: RequestInit = {}) => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      return { ok: false, status: 500, data: null, errorText: 'MERCADOPAGO_ACCESS_TOKEN não configurado no ambiente' };
    }
    try {
      const res = await fetch(`https://api.mercadopago.com${endpoint}`, {
        ...opts,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(opts.headers || {})
        }
      });
      if (!res.ok) {
        const errorText = await res.text();
        return { ok: false, status: res.status, data: null, errorText };
      }
      const data = await res.json();
      return { ok: true, status: res.status, data };
    } catch (err: any) {
      return { ok: false, status: 502, data: null, errorText: err?.message || 'Exceção de rede ao conectar com Mercado Pago' };
    }
  });

  // 5. Função interna de paginação completa e infalível
  async function fetchAllPages(buildEndpoint: (limit: number, offset: number) => string): Promise<{
    ok: boolean;
    results?: any[];
    statusCode?: number;
    error?: string;
  }> {
    const limit = 30;
    let offset = 0;
    let total = 0;
    let pageCount = 0;
    const MAX_PAGES = 50;
    let searchExhausted = false;
    const allResults: any[] = [];

    do {
      const endpoint = buildEndpoint(limit, offset);
      const res = await callMp(endpoint);

      if (!res.ok) {
        return {
          ok: false,
          statusCode: res.status,
          error: res.errorText || `Erro na página ${pageCount + 1} de pagamentos no gateway (${res.status})`
        };
      }

      const pageResults = Array.isArray(res.data?.results) ? res.data.results : [];

      const reportedTotal = res.data?.paging?.total;
      if (typeof reportedTotal === 'number' && (isNaN(reportedTotal) || reportedTotal < 0)) {
        return {
          ok: false,
          statusCode: 502,
          error: `GATEWAY_INCONSISTENCY: Metadados de paginação inválidos retornados pelo Mercado Pago (total: ${reportedTotal}).`
        };
      }

      allResults.push(...pageResults);

      total = typeof res.data?.paging?.total === 'number' ? res.data.paging.total : (offset + pageResults.length);
      offset += limit;
      pageCount++;

      if (pageResults.length === 0 && offset < total) {
        return {
          ok: false,
          statusCode: 502,
          error: `SEARCH_INCOMPLETE: O gateway retornou página vazia no offset ${offset - limit} antes de atingir o total de registros (${total}).`
        };
      }

      if (pageResults.length === 0 || offset >= total) {
        searchExhausted = true;
        break;
      }
    } while (pageCount < MAX_PAGES);

    if (!searchExhausted && offset < total) {
      return {
        ok: false,
        statusCode: 502,
        error: `SEARCH_INCOMPLETE: A pesquisa no gateway não conseguiu examinar todos os registros (${offset}/${total}). Reconciliação bloqueada para evitar inconsistência.`
      };
    }

    return { ok: true, results: allResults };
  }

  // 6. Consulta ao Mercado Pago (Modo 'auto', 'authorized_payments' ou 'payments_search')
  let rawCandidates: any[] = [];
  let isAuthorizedPaymentsSearch = false;

  const mode = options.endpointMode || 'auto';

  if (mode === 'payments_search') {
    const fetchRes = await fetchAllPages(
      (limit, offset) => `/v1/payments/search?external_reference=${encodeURIComponent(barbershopId)}&limit=${limit}&offset=${offset}`
    );
    if (!fetchRes.ok) {
      return {
        status: 'GATEWAY_ERROR',
        barbershopId,
        mpSubscriptionId,
        reconciledPaymentsCount: 0,
        skippedPaymentsCount: 0,
        newPayments: [],
        error: fetchRes.error,
        statusCode: fetchRes.statusCode || 502,
        reason: 'Falha ao consultar pesquisa de pagamentos no Mercado Pago.'
      };
    }
    rawCandidates = fetchRes.results || [];
  } else if (mode === 'authorized_payments') {
    if (!mpSubscriptionId) {
      return {
        status: 'BLOCKED',
        barbershopId,
        reconciledPaymentsCount: 0,
        skippedPaymentsCount: 0,
        newPayments: [],
        reason: 'mercadopagoSubscriptionId ausente na assinatura para consulta de authorized_payments.',
        statusCode: 400
      };
    }
    const fetchRes = await fetchAllPages(
      (limit, offset) => `/authorized_payments/search?preapproval_id=${encodeURIComponent(mpSubscriptionId)}&limit=${limit}&offset=${offset}`
    );
    if (!fetchRes.ok) {
      return {
        status: 'GATEWAY_ERROR',
        barbershopId,
        mpSubscriptionId,
        reconciledPaymentsCount: 0,
        skippedPaymentsCount: 0,
        newPayments: [],
        error: fetchRes.error,
        statusCode: fetchRes.statusCode || 502,
        reason: 'Falha ao consultar pagamentos autorizados no Mercado Pago.'
      };
    }
    rawCandidates = fetchRes.results || [];
    isAuthorizedPaymentsSearch = true;
  } else {
    // Modo AUTO: Se tiver mpSubscriptionId, tenta authorized_payments; se 404, recorre a v1/payments/search
    if (mpSubscriptionId) {
      const authRes = await fetchAllPages(
        (limit, offset) => `/authorized_payments/search?preapproval_id=${encodeURIComponent(mpSubscriptionId)}&limit=${limit}&offset=${offset}`
      );
      if (authRes.ok) {
        rawCandidates = authRes.results || [];
        isAuthorizedPaymentsSearch = true;
      } else if (authRes.statusCode === 404) {
        // Fallback gracioso para v1/payments/search apenas em caso de 404
        const searchRes = await fetchAllPages(
          (limit, offset) => `/v1/payments/search?external_reference=${encodeURIComponent(barbershopId)}&limit=${limit}&offset=${offset}`
        );
        if (!searchRes.ok) {
          return {
            status: 'GATEWAY_ERROR',
            barbershopId,
            mpSubscriptionId,
            reconciledPaymentsCount: 0,
            skippedPaymentsCount: 0,
            newPayments: [],
            error: searchRes.error,
            statusCode: searchRes.statusCode || 502,
            reason: 'Falha ao consultar histórico de pagamentos no Mercado Pago após fallback 404.'
          };
        }
        rawCandidates = searchRes.results || [];
      } else {
        // Erro real de gateway (500, 502, 503, 504, 429) -> Tratar como GATEWAY_ERROR imediato (regra 6 e 7)
        return {
          status: 'GATEWAY_ERROR',
          barbershopId,
          mpSubscriptionId,
          reconciledPaymentsCount: 0,
          skippedPaymentsCount: 0,
          newPayments: [],
          error: authRes.error,
          statusCode: authRes.statusCode || 502,
          reason: 'Gateway de pagamento indisponível ou instável ao consultar pagamentos autorizados.'
        };
      }
    } else {
      // Sem mpSubscriptionId: busca por external_reference
      const searchRes = await fetchAllPages(
        (limit, offset) => `/v1/payments/search?external_reference=${encodeURIComponent(barbershopId)}&limit=${limit}&offset=${offset}`
      );
      if (!searchRes.ok) {
        return {
          status: 'GATEWAY_ERROR',
          barbershopId,
          mpSubscriptionId,
          reconciledPaymentsCount: 0,
          skippedPaymentsCount: 0,
          newPayments: [],
          error: searchRes.error,
          statusCode: searchRes.statusCode || 502,
          reason: 'Falha ao consultar pagamentos pelo tenant no Mercado Pago.'
        };
      }
      rawCandidates = searchRes.results || [];
    }
  }

  // 7. Validação estrita de cada candidato retornado
  const validCandidates: ValidatedPaymentCandidate[] = [];
  const uncertainCandidates: { paymentId?: string; reason: string }[] = [];
  const incompatibleReasons: string[] = [];

  for (const candidate of rawCandidates) {
    if (!candidate || typeof candidate !== 'object') {
      incompatibleReasons.push('Candidato nulo ou inválido ignorado');
      continue;
    }

    // A) paymentId
    const rawId = candidate.payment?.id || candidate.id || candidate.payment_id;
    if (!rawId || String(rawId).trim() === '') {
      incompatibleReasons.push('Candidato sem ID de pagamento válido');
      continue;
    }
    const paymentId = String(rawId).trim();

    // Rejeição rigorosa de IDs sintéticos
    const lowerId = paymentId.toLowerCase();
    if (lowerId.includes('synth') || lowerId.includes('fake') || lowerId.includes('mock') || lowerId === '0') {
      uncertainCandidates.push({ paymentId, reason: `ID de pagamento sintético ou suspeito rejeitado: ${paymentId}` });
      continue;
    }

    // B) Tenant / external_reference
    const candExtRef = candidate.external_reference || candidate.payment?.external_reference;
    if (candExtRef && candExtRef !== barbershopId) {
      // Cross-tenant mismatch explícito: pertence a outro estabelecimento
      incompatibleReasons.push(`Pagamento ${paymentId} pertence ao tenant '${candExtRef}', diferente de '${barbershopId}'`);
      continue;
    }

    // C) Subscription / preapproval_id
    const candPreapproval = candidate.preapproval_id || candidate.metadata?.preapproval_id || candidate.payment?.preapproval_id;
    if (candPreapproval && mpSubscriptionId && candPreapproval !== mpSubscriptionId) {
      // Pertence a outro contrato de assinatura
      incompatibleReasons.push(`Pagamento ${paymentId} vinculado a outro preapproval '${candPreapproval}' (esperado: '${mpSubscriptionId}')`);
      continue;
    }

    // Se nem external_reference nem preapproval coincidem e não foi busca específica por preapproval:
    if (!candExtRef && !candPreapproval && !isAuthorizedPaymentsSearch) {
      uncertainCandidates.push({ paymentId, reason: `Pagamento ${paymentId} não possui comprovação de vínculo com a assinatura ou tenant` });
      continue;
    }

    // D) Valor (amount): Proibido default, proibido preço de catálogo como substituto
    const rawAmount = candidate.transaction_amount ?? candidate.payment?.transaction_amount;
    if (rawAmount === undefined || rawAmount === null || typeof rawAmount !== 'number' || isNaN(rawAmount) || rawAmount <= 0) {
      uncertainCandidates.push({
        paymentId,
        reason: `Pagamento ${paymentId} possui valor transacional ausente ou inválido (${rawAmount}). Substituição por default proibida.`
      });
      continue;
    }
    const amount = Number(rawAmount);

    // E) Moeda (currency)
    const currency = candidate.currency_id || candidate.payment?.currency_id || 'BRL';

    // F) Status financeiro
    const rawStatus = String(candidate.status || candidate.payment?.status || '').toLowerCase();
    let mappedStatus: 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CHARGED_BACK' | 'UNKNOWN';
    if (rawStatus === 'approved' || rawStatus === 'authorized') {
      mappedStatus = 'APPROVED';
    } else if (rawStatus === 'rejected') {
      mappedStatus = 'REJECTED';
    } else if (rawStatus === 'refunded') {
      mappedStatus = 'REFUNDED';
    } else if (rawStatus === 'charged_back') {
      mappedStatus = 'CHARGED_BACK';
    } else {
      mappedStatus = 'UNKNOWN';
    }

    if (mappedStatus === 'UNKNOWN') {
      uncertainCandidates.push({ paymentId, reason: `Pagamento ${paymentId} possui status desconhecido no gateway ('${rawStatus}')` });
      continue;
    }

    // G) Timestamp financeiro (validateFinancialTimestamp): Proibido Date.now() silencioso
    const rawTimestamp = candidate.date_approved || candidate.payment?.date_approved || candidate.date_created || candidate.payment?.date_created;
    const tsValidation = validateFinancialTimestamp(rawTimestamp);
    if (!tsValidation.valid) {
      uncertainCandidates.push({
        paymentId,
        reason: `Pagamento ${paymentId} com timestamp financeiro inválido (${rawTimestamp}): ${tsValidation.error}. Substituição por Date.now() proibida.`
      });
      continue;
    }
    const eventDate = tsValidation.isoString!;

    const statusDetail = candidate.status_detail || candidate.payment?.status_detail || (mappedStatus === 'APPROVED' ? 'accredited' : rawStatus);
    const paymentMethod = candidate.payment_method_id || candidate.payment?.payment_method_id || 'Cartão de Crédito';

    validCandidates.push({
      paymentId,
      barbershopId,
      subscriptionId: subscription.id,
      amount,
      currency,
      status: mappedStatus,
      statusDetail,
      paymentMethod,
      eventDate,
      timeMs: tsValidation.timeMs,
      rawCandidate: candidate
    });
  }

  // 8. Se houver candidatos ambíguos ou com evidência incompleta para o tenant: BLOQUEAR (Fail-closed)
  if (uncertainCandidates.length > 0) {
    return {
      status: 'AMBIGUOUS',
      barbershopId,
      mpSubscriptionId,
      reconciledPaymentsCount: 0,
      skippedPaymentsCount: 0,
      newPayments: [],
      reason: `Detectado(s) pagamento(s) com dados insuficientes ou ambíguos no gateway: ${uncertainCandidates.map(u => u.reason).join('; ')}. Reconciliação bloqueada para segurança contábil.`,
      statusCode: 409
    };
  }

  // 9. Desduplicação de candidatos (agrupar por paymentId)
  const candidateMap = new Map<string, ValidatedPaymentCandidate>();
  for (const cand of validCandidates) {
    if (candidateMap.has(cand.paymentId)) {
      const existing = candidateMap.get(cand.paymentId)!;
      if (existing.amount !== cand.amount || existing.status !== cand.status) {
        return {
          status: 'AMBIGUOUS',
          barbershopId,
          mpSubscriptionId,
          reconciledPaymentsCount: 0,
          skippedPaymentsCount: 0,
          newPayments: [],
          reason: `Conflito de dados para o mesmo paymentId '${cand.paymentId}' retornado pelo gateway. Reconciliação manual requerida.`,
          statusCode: 409
        };
      }
    } else {
      candidateMap.set(cand.paymentId, cand);
    }
  }

  // 10. Ordenação cronológica estrita por timestamp financeiro (ascendente)
  const sortedCandidates = Array.from(candidateMap.values()).sort((a, b) => a.timeMs - b.timeMs);

  // 11. Processamento e Registro Durável Atômico no Firestore
  const newPayments: DurablePaymentRecord[] = [];
  let skippedPaymentsCount = 0;
  let reconciledPaymentsCount = 0;

  const checkPayment = options.existingPaymentChecker || (async (id: string) => {
    const { firestore } = getFirebaseAdmin();
    const paymentKey = `pay-${id}`;
    const paymentRef = firestore.collection('subscription_payments').doc(paymentKey);
    const existingDoc = await paymentRef.get();
    return {
      exists: existingDoc.exists,
      data: existingDoc.exists ? (existingDoc.data() as DurablePaymentRecord) : undefined
    };
  });

  const recordPayment = options.paymentRecorder || recordDurablePaymentTransaction;

  for (const cand of sortedCandidates) {
    const existing = await checkPayment(cand.paymentId);

    if (existing.exists && existing.data) {
      const existingData = existing.data;

      // Validação multi-tenant no Firestore
      if (existingData.barbershopId && existingData.barbershopId !== barbershopId) {
        return {
          status: 'BLOCKED',
          barbershopId,
          reconciledPaymentsCount,
          skippedPaymentsCount,
          newPayments,
          reason: `Violação multi-tenant no Firestore: Documento pay-${cand.paymentId} pertence a '${existingData.barbershopId}', não a '${barbershopId}'.`,
          statusCode: 403
        };
      }

      // Se já está registrado com o mesmo status financeiro, skip idempotente
      if (existingData.status === cand.status) {
        skippedPaymentsCount++;
        continue;
      }
    }

    // Calcula próxima data de faturamento de forma consistente
    const nextBilling = options.nextBillingDate || calculateNextBillingDate(cand.eventDate, subscription.billingCycle || 'MONTHLY');

    // Executa a transação financeira durável com invariante de preço e garantias ACID
    const durableRes = await recordPayment({
      paymentId: cand.paymentId,
      barbershopId,
      amount: cand.amount,
      currency: cand.currency,
      status: cand.status,
      statusDetail: cand.statusDetail,
      paymentMethod: cand.paymentMethod,
      fallbackSubscription: subscription,
      nextBillingDate: nextBilling,
      externalEventDate: cand.eventDate,
      planDetails: options.planDetails
    });

    if (durableRes.isNewPayment || durableRes.isReversalProcessed) {
      newPayments.push(durableRes.paymentRecord);
      reconciledPaymentsCount++;
      subscription = durableRes.subscriptionRecord;
    } else {
      skippedPaymentsCount++;
    }
  }

  return {
    status: newPayments.length > 0 ? 'RECONCILED' : 'NO_NEW_PAYMENTS',
    barbershopId,
    mpSubscriptionId,
    reconciledPaymentsCount,
    skippedPaymentsCount,
    newPayments,
    updatedSubscription: subscription,
    reason: newPayments.length > 0
      ? `${newPayments.length} pagamento(s) recuperado(s) e reconciliado(s) com sucesso no Firestore.`
      : (sortedCandidates.length > 0 
          ? `Todos os ${sortedCandidates.length} pagamentos do Mercado Pago já estavam reconciliados no Firestore.`
          : 'Nenhum pagamento correspondente encontrado no Mercado Pago.')
  };
}

export interface SubscriptionStatusOptions {
  barbershopId: string;
  firestoreGetter?: (barbershopId: string) => Promise<{ exists: boolean; data?: any }>;
  firestoreSetter?: (docId: string, data: any) => Promise<void>;
  paymentsGetter?: (barbershopId: string) => Promise<any[]>;
  memoryCache?: Map<string, any>;
  nowMs?: number;
}

export interface SubscriptionStatusResult {
  statusCode: number;
  error?: string;
  subscription?: any;
  payments?: any[];
}

/**
 * FASE 3.5D: OBTENÇÃO AUTORITATIVA DO STATUS DA ASSINATURA
 * 
 * Regra P1 de Soberania:
 * - O Firestore é SEMPRE consultado como fonte única da verdade;
 * - Nenhum cache em RAM (subscriptionsDB) é consultado antes do Firestore;
 * - Se o Firestore falhar, executa fail-closed (HTTP 503) em vez de retornar cache velho;
 * - O cache em RAM só é atualizado APÓS leitura com sucesso do Firestore (somente espelho).
 */
export async function getAuthoritativeSubscriptionStatus(
  options: SubscriptionStatusOptions
): Promise<SubscriptionStatusResult> {
  const { barbershopId } = options;
  if (!barbershopId || !barbershopId.trim()) {
    return { statusCode: 400, error: 'barbershopId é obrigatório.' };
  }

  const cleanBarbershopId = barbershopId.trim();

  // 1. OBRIGATÓRIO: Consulta inicial direta e soberana ao Firestore (sem leitura prévia de cache em RAM)
  const getSub = options.firestoreGetter || (async (bId: string) => {
    const { firestore } = getFirebaseAdmin();
    const docSnap = await firestore.collection('subscriptions').doc(`sub-${bId}`).get();
    return {
      exists: docSnap.exists,
      data: docSnap.exists ? docSnap.data() : undefined
    };
  });

  let subscription: any = null;
  try {
    const docResult = await getSub(cleanBarbershopId);
    if (docResult.exists && docResult.data) {
      subscription = docResult.data;
      // Atualiza o cache de memória estritamente como espelho de leitura (nunca autoridade)
      if (options.memoryCache) {
        options.memoryCache.set(cleanBarbershopId, subscription);
      }
    }
  } catch (fsErr: any) {
    console.error('[subscriptionService] Falha de comunicação com Firestore ao obter status da assinatura:', fsErr);
    // REQUISITO 2: Fail-closed absoluto. PROIBIDO usar subscriptionsDB como fallback silencioso!
    return {
      statusCode: 503,
      error: 'Serviço de banco de dados temporariamente indisponível. Não foi possível validar o estado autoritativo da assinatura.'
    };
  }

  // Se não existe no Firestore: 404 estrito (não aceita lixo em memória)
  if (!subscription) {
    return {
      statusCode: 404,
      error: 'Assinatura não encontrada para esta barbearia'
    };
  }

  // Validação estrita de Tenant
  if (subscription.barbershopId && subscription.barbershopId !== cleanBarbershopId) {
    return {
      statusCode: 403,
      error: 'Violação de isolamento multi-tenant detectada.'
    };
  }

  // Verificação de tolerância PAST_DUE -> SUSPENDED
  if (subscription.status === 'PAST_DUE' && subscription.pastDueSince) {
    const pastDueDate = new Date(subscription.pastDueSince);
    const nowTime = options.nowMs ?? Date.now();
    const toleranceDays = subscription.toleranceDays ?? 7;
    const diffDays = Math.floor((nowTime - pastDueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > toleranceDays) {
      subscription.status = 'SUSPENDED';
      subscription.updatedAt = new Date(nowTime).toISOString();

      const setSub = options.firestoreSetter || (async (docId: string, data: any) => {
        const { firestore } = getFirebaseAdmin();
        await firestore.collection('subscriptions').doc(docId).set(data, { merge: true });
      });

      try {
        await setSub(subscription.id || `sub-${cleanBarbershopId}`, {
          status: 'SUSPENDED',
          updatedAt: subscription.updatedAt
        });
        if (options.memoryCache) {
          options.memoryCache.set(cleanBarbershopId, subscription);
        }
      } catch (err) {
        console.warn('[subscriptionService] Erro ao suspender assinatura no Firestore:', err);
      }
    }
  }

  // Consulta pagamentos
  let shopPayments: any[] = [];
  const getPayments = options.paymentsGetter || (async (bId: string) => {
    const { firestore } = getFirebaseAdmin();
    const snap = await firestore.collection('subscription_payments')
      .where('barbershopId', '==', bId)
      .get();
    if (snap.empty) return [];
    const list: any[] = [];
    snap.forEach((d: any) => list.push(d.data()));
    return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  try {
    shopPayments = await getPayments(cleanBarbershopId);
  } catch (fsErr) {
    console.warn('[subscriptionService] Erro ao buscar pagamentos no Firestore:', fsErr);
  }

  return {
    statusCode: 200,
    subscription,
    payments: shopPayments
  };
}

export interface AuthoritativeCancelOptions {
  barbershopId: string;
  reason?: string;
  memoryCache?: Map<string, any>;
  firestoreGetter?: (barbershopId: string) => Promise<{ exists: boolean; data?: any }>;
  firestoreTransactionRunner?: (updateFn: (currentDoc: any) => any) => Promise<any>;
  gatewayCanceler?: (mpSubscriptionId: string) => Promise<any>;
  nowIso?: string;
}

export interface AuthoritativeCancelResult {
  statusCode: number;
  success: boolean;
  subscription?: any;
  error?: string;
  message?: string;
}

/**
 * FASE 3.5F: CANCELAMENTO AUTORITATIVO DE ASSINATURA (SOBERANIA FIRESTORE)
 * 
 * Elimina o P1 ACH-35E-01:
 * - Firestore é consultado obrigatoriamente antes de qualquer ação;
 * - subscriptionsDB NUNCA é consultado como autoridade nem como fallback;
 * - Se Firestore estiver indisponível, retorna fail-closed (HTTP 503);
 * - O cancelamento no gateway ocorre fora da transação Firestore;
 * - A persistência é atômica, preservando rigorosamente paidBillingCount,
 *   lastApprovedPaymentAt, currentPrice e demais campos financeiros históricos;
 * - subscriptionsDB só é atualizado como espelho ao término da transação.
 */
export async function authoritativeCancelSubscription(
  options: AuthoritativeCancelOptions
): Promise<AuthoritativeCancelResult> {
  const { barbershopId, reason } = options;
  if (!barbershopId || !barbershopId.trim()) {
    return {
      statusCode: 400,
      success: false,
      error: 'barbershopId é obrigatório'
    };
  }

  const cleanBarbershopId = barbershopId.trim();
  const nowIso = options.nowIso || new Date().toISOString();

  // 1. OBRIGATÓRIO: Leitura inicial soberana do Firestore (sem consulta prévia a RAM)
  const getSub = options.firestoreGetter || (async (bId: string) => {
    const { firestore } = getFirebaseAdmin();
    const docSnap = await firestore.collection('subscriptions').doc(`sub-${bId}`).get();
    return {
      exists: docSnap.exists,
      data: docSnap.exists ? docSnap.data() : undefined
    };
  });

  let initialDoc: any = null;
  try {
    const docResult = await getSub(cleanBarbershopId);
    if (!docResult.exists || !docResult.data) {
      return {
        statusCode: 404,
        success: false,
        error: 'Assinatura não encontrada'
      };
    }
    initialDoc = docResult.data;
  } catch (fsErr: any) {
    console.error('[subscriptionService] Falha ao consultar Firestore no cancelamento:', fsErr);
    // REQUISITO CENTRAL: Fail-closed HTTP 503. NUNCA usar subscriptionsDB em falha de Firestore!
    return {
      statusCode: 503,
      success: false,
      error: 'Serviço de banco de dados temporariamente indisponível. Cancelamento abortado por segurança.'
    };
  }

  // Se já está CANCELED, operação é idempotente
  if (initialDoc.status === 'CANCELED') {
    if (options.memoryCache) {
      options.memoryCache.set(cleanBarbershopId, initialDoc);
    }
    return {
      statusCode: 200,
      success: true,
      subscription: initialDoc,
      message: 'Assinatura já se encontra cancelada.'
    };
  }

  // 2. Chamada ao Gateway fora da transação de banco de dados
  if (options.gatewayCanceler && initialDoc.mercadopagoSubscriptionId) {
    try {
      await options.gatewayCanceler(initialDoc.mercadopagoSubscriptionId);
    } catch (gwErr) {
      console.warn('[subscriptionService] Falha ao cancelar preapproval no Mercado Pago:', gwErr);
    }
  }

  // 3. Persistência atômica no Firestore protegendo contra sobrescrita de dados stale
  let updatedSubscription: any = null;
  if (options.firestoreTransactionRunner) {
    try {
      updatedSubscription = await options.firestoreTransactionRunner((currentDoc) => {
        return {
          ...currentDoc,
          status: 'CANCELED',
          canceledAt: nowIso,
          updatedAt: nowIso,
          ...(reason ? { cancellationReason: String(reason).trim() } : {})
        };
      });
    } catch (txErr: any) {
      console.error('[subscriptionService] Erro ao persistir cancelamento via runner:', txErr);
      return {
        statusCode: 503,
        success: false,
        error: 'Falha ao persistir cancelamento no banco de dados autoritativo'
      };
    }
  } else {
    try {
      const { firestore } = getFirebaseAdmin();
      const subRef = firestore.collection('subscriptions').doc(initialDoc.id || `sub-${cleanBarbershopId}`);
      await firestore.runTransaction(async (transaction) => {
        const freshDocSnap = await transaction.get(subRef);
        if (!freshDocSnap.exists) {
          throw new Error('SUBSCRIPTION_NOT_FOUND');
        }
        const freshData = freshDocSnap.data() as DurableSubscriptionRecord;

        // Preserva rigorosamente campos financeiros atualizados (paidBillingCount, lastApprovedPaymentAt, etc.)
        const merged: any = {
          ...freshData,
          status: 'CANCELED',
          canceledAt: nowIso,
          updatedAt: nowIso
        };
        if (reason) {
          merged.cancellationReason = String(reason).trim();
        }

        transaction.set(subRef, merged, { merge: true });
        updatedSubscription = merged;
      });
    } catch (txErr: any) {
      if (txErr.message === 'SUBSCRIPTION_NOT_FOUND') {
        return {
          statusCode: 404,
          success: false,
          error: 'Assinatura não encontrada no momento da persistência'
        };
      }
      console.error('[subscriptionService] Erro ao persistir cancelamento no Firestore:', txErr);
      return {
        statusCode: 503,
        success: false,
        error: 'Falha ao persistir cancelamento no banco de dados autoritativo'
      };
    }
  }

  // 4. Atualiza subscriptionsDB exclusivamente como espelho (após sucesso da transação)
  if (options.memoryCache && updatedSubscription) {
    options.memoryCache.set(cleanBarbershopId, updatedSubscription);
  }

  return {
    statusCode: 200,
    success: true,
    subscription: updatedSubscription,
    message: 'Assinatura cancelada com sucesso. As próximas cobranças foram interrompidas.'
  };
}

