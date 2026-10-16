import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  reconcileSubscriptionPaymentsWithMercadoPago,
  calculateNextBillingDate
} from '../server/subscriptionReconciliationService.js';
import {
  DurableSubscriptionRecord,
  DurablePaymentRecord
} from '../server/webhookService.js';

describe('FASE 3.5B — Reconciliação Real de Pagamentos, Recuperação de Webhooks Perdidos e Consistência Financeira', () => {

  function createTestHarness(initialSub: DurableSubscriptionRecord) {
    let subState: DurableSubscriptionRecord = JSON.parse(JSON.stringify(initialSub));
    const paymentsStore = new Map<string, DurablePaymentRecord>();

    const existingPaymentChecker = async (id: string) => {
      const key = `pay-${id}`;
      if (paymentsStore.has(key)) {
        return { exists: true, data: paymentsStore.get(key) };
      }
      return { exists: false };
    };

    const paymentRecorder = async (params: {
      barbershopId: string;
      paymentId: string | number;
      eventId?: string;
      status: 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CHARGED_BACK';
      amount: number;
      currency?: string;
      statusDetail?: string;
      paymentMethod?: string;
      externalEventDate?: string;
      preapprovalId?: string;
    }) => {
      const key = `pay-${params.paymentId}`;
      if (paymentsStore.has(key)) {
        const existing = paymentsStore.get(key)!;
        return {
          isNewPayment: false,
          paymentRecord: existing,
          subscriptionRecord: subState
        };
      }

      const eventDate = params.externalEventDate || new Date().toISOString();
      const isApproved = params.status === 'APPROVED';

      const newPayment: DurablePaymentRecord = {
        id: key,
        subscriptionId: subState.id,
        barbershopId: params.barbershopId,
        externalReference: params.barbershopId,
        barbershopName: subState.barbershopName || 'Barbearia',
        mercadopagoPaymentId: String(params.paymentId),
        amount: Number(params.amount),
        currency: params.currency || 'BRL',
        status: params.status,
        originalStatus: params.status,
        statusDetail: params.statusDetail || (isApproved ? 'accredited' : params.status.toLowerCase()),
        paymentDate: eventDate.split('T')[0],
        billingNumber: subState.paidBillingCount || 0,
        paymentMethod: params.paymentMethod || 'Cartão de Crédito',
        approvedAt: isApproved ? eventDate : undefined,
        lastFinancialEventId: params.eventId,
        lastFinancialEventAt: eventDate,
        lastFinancialEventStatus: params.status,
        createdAt: eventDate,
        updatedAt: eventDate
      };

      paymentsStore.set(key, newPayment);

      if (subState.status === 'CANCELED') {
        // Preserva CANCELED
      } else {
        const lastReversalMs = subState.lastReversalAt ? Date.parse(subState.lastReversalAt) : 0;
        const eventTimeMs = Date.parse(eventDate);
        const isReversalNewer = lastReversalMs > 0 && eventTimeMs <= lastReversalMs;

        if (subState.status === 'SUSPENDED' && (subState.lastReversalType === 'CHARGED_BACK' || isReversalNewer)) {
          // Preserva SUSPENDED
        } else if (subState.status === 'PAST_DUE' && isReversalNewer) {
          // Preserva PAST_DUE
        } else if (isApproved) {
          subState.status = 'ACTIVE';
          subState.isInTrial = false;
          subState.cardValidated = true;
          delete subState.pastDueSince;
        }
      }

      if (isApproved) {
        subState.paidBillingCount = (subState.paidBillingCount || 0) + 1;
        subState.billingCount = subState.paidBillingCount;
        subState.lastApprovedPaymentAt = eventDate;
      }
      subState.lastFinancialEventAt = eventDate;
      subState.updatedAt = eventDate;

      return {
        isNewPayment: true,
        paymentRecord: newPayment,
        subscriptionRecord: subState
      };
    };

    return {
      getSubState: () => subState,
      paymentsStore,
      existingPaymentChecker,
      paymentRecorder
    };
  }

  // =========================================================================
  // 1. RECUPERAÇÃO DO CENÁRIO OBRIGATÓRIO (WEBHOOK PERDIDO)
  // =========================================================================
  describe('1. Cenário Obrigatório: Recuperação de Pagamento Perdido e Idempotência', () => {
    it('detecta pagamento aprovado P1 no gateway, vincula a S1, atualiza PAST_DUE -> ACTIVE e incrementa paidBillingCount', async () => {
      const tenantId = 'tenant-missed-webhook';
      const initialSub: DurableSubscriptionRecord = {
        id: `sub-${tenantId}`,
        barbershopId: tenantId,
        barbershopName: 'Barbearia Webhook Perdido',
        payerEmail: 'owner@missed.com',
        mercadopagoSubscriptionId: 'mp-sub-s1',
        status: 'PAST_DUE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Pro',
        planId: 'plan-pro',
        planPriceNormal: 79.90,
        currentPrice: 79.90,
        paidBillingCount: 0,
        billingCount: 0,
        isInTrial: false,
        nextBillingDate: '2026-10-01',
        pastDueSince: '2026-09-15T00:00:00Z',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z'
      };

      const mockMpPayment = {
        id: '100123456',
        status: 'approved',
        status_detail: 'accredited',
        transaction_amount: 79.90,
        currency_id: 'BRL',
        preapproval_id: 'mp-sub-s1',
        external_reference: tenantId,
        payment_method_id: 'master',
        date_approved: '2026-09-24T12:00:00.000Z',
        date_created: '2026-09-24T12:00:00.000Z'
      };

      const mockCallMp = async (endpoint: string) => {
        if (endpoint.includes('/authorized_payments/search')) {
          return {
            ok: true,
            status: 200,
            data: {
              paging: { total: 1, limit: 30, offset: 0 },
              results: [mockMpPayment]
            }
          };
        }
        return { ok: false, status: 404, data: null };
      };

      const harness = createTestHarness(initialSub);

      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: initialSub,
        callMpWithDetails: mockCallMp,
        existingPaymentChecker: harness.existingPaymentChecker,
        paymentRecorder: harness.paymentRecorder
      });

      assert.strictEqual(result.status, 'RECONCILED', 'Status deve ser RECONCILED');
      assert.strictEqual(result.reconciledPaymentsCount, 1, 'Deve reconciliar exatamente 1 pagamento');
      assert.strictEqual(result.newPayments.length, 1, 'Deve gerar exatamente 1 novo registro');

      const p1 = result.newPayments[0];
      assert.strictEqual(p1.mercadopagoPaymentId, '100123456');
      assert.strictEqual(p1.amount, 79.90);
      assert.strictEqual(p1.status, 'APPROVED');
      assert.strictEqual(p1.barbershopId, tenantId);

      // Verificação da assinatura atualizada
      const updated = result.updatedSubscription!;
      assert.strictEqual(updated.status, 'ACTIVE', 'Deve restaurar status para ACTIVE');
      assert.strictEqual(updated.paidBillingCount, 1, 'paidBillingCount deve ser incrementado para 1');
      assert.strictEqual(updated.currentPrice, 79.90, 'Deve manter o preço contratual congelado');
      assert.strictEqual(updated.pastDueSince, undefined, 'Deve remover pastDueSince');
      assert.strictEqual(updated.lastApprovedPaymentAt, '2026-09-24T12:00:00.000Z');

      // Segunda execução (Idempotência estrita): NÃO deve duplicar nem re-incrementar
      const secondResult = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: updated,
        callMpWithDetails: mockCallMp,
        existingPaymentChecker: harness.existingPaymentChecker,
        paymentRecorder: harness.paymentRecorder
      });

      assert.strictEqual(secondResult.status, 'NO_NEW_PAYMENTS', 'Não deve haver novos pagamentos');
      assert.strictEqual(secondResult.reconciledPaymentsCount, 0, 'Zero pagamentos novos');
      assert.strictEqual(secondResult.skippedPaymentsCount, 1, 'Deve marcar como skipped');
      assert.strictEqual(secondResult.updatedSubscription?.paidBillingCount, 1, 'paidBillingCount NÃO pode incrementar novamente');
    });
  });

  // =========================================================================
  // 2. PROTEÇÃO DE ESTADOS TERMINAIS E SEVERIDADE (CANCELED E SUSPENDED)
  // =========================================================================
  describe('2. Proteção de Estados Terminais e Severidade Financeira', () => {
    it('pagamento recuperado NÃO reativa assinatura CANCELED para ACTIVE', async () => {
      const tenantId = 'tenant-canceled-sub';
      const canceledSub: DurableSubscriptionRecord = {
        id: `sub-${tenantId}`,
        barbershopId: tenantId,
        barbershopName: 'Barbearia Cancelada',
        payerEmail: 'owner@canceled.com',
        mercadopagoSubscriptionId: 'mp-sub-canceled',
        status: 'CANCELED',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Regular',
        currentPrice: 59.90,
        paidBillingCount: 2,
        isInTrial: false,
        canceledAt: '2026-09-20T00:00:00Z',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-09-20T00:00:00Z'
      };

      const mockPayment = {
        id: '200111222',
        status: 'approved',
        transaction_amount: 59.90,
        currency_id: 'BRL',
        preapproval_id: 'mp-sub-canceled',
        external_reference: tenantId,
        date_approved: '2026-09-22T10:00:00.000Z'
      };

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          paging: { total: 1, limit: 30, offset: 0 },
          results: [mockPayment]
        }
      });

      const harness = createTestHarness(canceledSub);

      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: canceledSub,
        callMpWithDetails: mockCallMp,
        existingPaymentChecker: harness.existingPaymentChecker,
        paymentRecorder: harness.paymentRecorder
      });

      // O pagamento é registrado para fins contábeis históricos, mas o status CANCELED é preservado
      assert.strictEqual(result.updatedSubscription?.status, 'CANCELED', 'Assinatura cancelada JAMAIS pode voltar a ACTIVE');
    });

    it('pagamento aprovado anterior a um CHARGEBACK não remove status SUSPENDED', async () => {
      const tenantId = 'tenant-suspended-cb';
      const suspendedSub: DurableSubscriptionRecord = {
        id: `sub-${tenantId}`,
        barbershopId: tenantId,
        barbershopName: 'Barbearia Contestada',
        payerEmail: 'owner@cb.com',
        mercadopagoSubscriptionId: 'mp-sub-cb',
        status: 'SUSPENDED',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Pro',
        currentPrice: 89.90,
        paidBillingCount: 3,
        isInTrial: false,
        lastReversalAt: '2026-09-23T15:00:00.000Z',
        lastReversalType: 'CHARGED_BACK',
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-09-23T15:00:00Z'
      };

      // Pagamento antigo de 2026-09-01 (anterior ao chargeback do dia 23)
      const oldApprovedPayment = {
        id: '300999888',
        status: 'approved',
        transaction_amount: 89.90,
        currency_id: 'BRL',
        preapproval_id: 'mp-sub-cb',
        external_reference: tenantId,
        date_approved: '2026-09-01T10:00:00.000Z'
      };

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          paging: { total: 1, limit: 30, offset: 0 },
          results: [oldApprovedPayment]
        }
      });

      const harness = createTestHarness(suspendedSub);

      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: suspendedSub,
        callMpWithDetails: mockCallMp,
        existingPaymentChecker: harness.existingPaymentChecker,
        paymentRecorder: harness.paymentRecorder
      });

      assert.strictEqual(
        result.updatedSubscription?.status,
        'SUSPENDED',
        'Pagamento anterior ao chargeback não pode remover status SUSPENDED'
      );
    });
  });

  // =========================================================================
  // 3. PAGINAÇÃO EXAUSTIVA E TRATAMENTO DE ERRO DE GATEWAY
  // =========================================================================
  describe('3. Paginação Exaustiva e Tratamento de Erros de Gateway', () => {
    it('itera completamente sobre múltiplas páginas (offset/limit)', async () => {
      const tenantId = 'tenant-paginated';
      const baseSub: DurableSubscriptionRecord = {
        id: `sub-${tenantId}`,
        barbershopId: tenantId,
        barbershopName: 'Barbearia Paginação',
        payerEmail: 'owner@pages.com',
        mercadopagoSubscriptionId: 'mp-sub-pages',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Pro',
        currentPrice: 99.90,
        paidBillingCount: 0,
        isInTrial: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      };

      let pageCalls = 0;
      const mockCallMp = async (endpoint: string) => {
        pageCalls++;
        if (endpoint.includes('offset=0')) {
          return {
            ok: true,
            status: 200,
            data: {
              paging: { total: 35, limit: 30, offset: 0 },
              results: Array.from({ length: 30 }, (_, i) => ({
                id: `page1-pay-${i + 1}`,
                status: 'approved',
                transaction_amount: 99.90,
                currency_id: 'BRL',
                preapproval_id: 'mp-sub-pages',
                external_reference: tenantId,
                date_approved: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`
              }))
            }
          };
        } else if (endpoint.includes('offset=30')) {
          return {
            ok: true,
            status: 200,
            data: {
              paging: { total: 35, limit: 30, offset: 30 },
              results: Array.from({ length: 5 }, (_, i) => ({
                id: `page2-pay-${i + 1}`,
                status: 'approved',
                transaction_amount: 99.90,
                currency_id: 'BRL',
                preapproval_id: 'mp-sub-pages',
                external_reference: tenantId,
                date_approved: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`
              }))
            }
          };
        }
        return { ok: false, status: 404, data: null };
      };

      const harness = createTestHarness(baseSub);

      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: baseSub,
        callMpWithDetails: mockCallMp,
        existingPaymentChecker: harness.existingPaymentChecker,
        paymentRecorder: harness.paymentRecorder
      });

      assert.strictEqual(pageCalls, 2, 'Deve ter paginado exatamente 2 vezes');
      assert.strictEqual(result.reconciledPaymentsCount, 35, 'Deve ter reconciliado todos os 35 pagamentos');
      assert.strictEqual(result.updatedSubscription?.paidBillingCount, 35, 'paidBillingCount deve refletir o total acumulado');
    });

    it('erro em página intermediária aborta como GATEWAY_ERROR e nunca finge "nenhum pagamento"', async () => {
      const tenantId = 'tenant-gateway-error';
      const baseSub: DurableSubscriptionRecord = {
        id: `sub-${tenantId}`,
        barbershopId: tenantId,
        barbershopName: 'Barbearia Gateway Error',
        payerEmail: 'owner@gwerr.com',
        mercadopagoSubscriptionId: 'mp-sub-gwerr',
        status: 'PAST_DUE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Pro',
        currentPrice: 99.90,
        paidBillingCount: 0,
        isInTrial: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      };

      const mockCallMp = async (endpoint: string) => {
        if (endpoint.includes('offset=0')) {
          // Página 1 retorna OK dizendo que existem 40 registros
          return {
            ok: true,
            status: 200,
            data: {
              paging: { total: 40, limit: 30, offset: 0 },
              results: [{ id: 'pay-1', status: 'approved', transaction_amount: 99.90, date_approved: '2026-09-01T00:00:00Z' }]
            }
          };
        } else {
          // Página 2 falha no gateway (503 Service Unavailable)
          return {
            ok: false,
            status: 503,
            data: null,
            errorText: 'Mercado Pago upstream service temporarily unavailable'
          };
        }
      };

      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: baseSub,
        callMpWithDetails: mockCallMp
      });

      assert.strictEqual(result.status, 'GATEWAY_ERROR', 'Deve falhar com GATEWAY_ERROR');
      assert.strictEqual(result.statusCode, 503, 'Deve propagar status 503');
      assert.strictEqual(result.reconciledPaymentsCount, 0, 'Zero pagamentos parciais salvos quando há erro');
    });
  });

  // =========================================================================
  // 4. ISOLAMENTO MULTI-TENANT E BLOQUEIO DE DADOS CONTAMINADOS
  // =========================================================================
  describe('4. Isolamento Multi-Tenant e Prevenção de Dados Incompatíveis', () => {
    it('pagamento retornado de outro tenant é estritamente ignorado', async () => {
      const tenantId = 'tenant-legit';
      const otherTenant = 'tenant-intruder';

      const baseSub: DurableSubscriptionRecord = {
        id: `sub-${tenantId}`,
        barbershopId: tenantId,
        barbershopName: 'Barbearia Legítima',
        payerEmail: 'owner@legit.com',
        mercadopagoSubscriptionId: 'mp-sub-legit',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Pro',
        currentPrice: 79.90,
        paidBillingCount: 1,
        isInTrial: false,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      };

      // Mock com 1 pagamento do outro tenant e 1 legítimo
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          paging: { total: 2, limit: 30, offset: 0 },
          results: [
            {
              id: 'pay-cross-tenant',
              status: 'approved',
              transaction_amount: 150.00,
              currency_id: 'BRL',
              external_reference: otherTenant,
              preapproval_id: 'mp-sub-legit',
              date_approved: '2026-09-20T10:00:00.000Z'
            },
            {
              id: 'pay-legit-2',
              status: 'approved',
              transaction_amount: 79.90,
              currency_id: 'BRL',
              external_reference: tenantId,
              preapproval_id: 'mp-sub-legit',
              date_approved: '2026-09-21T10:00:00.000Z'
            }
          ]
        }
      });

      const harness = createTestHarness(baseSub);

      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: baseSub,
        callMpWithDetails: mockCallMp,
        existingPaymentChecker: harness.existingPaymentChecker,
        paymentRecorder: harness.paymentRecorder
      });

      assert.strictEqual(result.status, 'RECONCILED');
      assert.strictEqual(result.reconciledPaymentsCount, 1);
      assert.strictEqual(result.newPayments[0].mercadopagoPaymentId, 'pay-legit-2');
      assert.strictEqual(result.newPayments.some(p => p.mercadopagoPaymentId === 'pay-cross-tenant'), false);
    });
  });

  // =========================================================================
  // 5. FAIL-CLOSED CONTRA DADOS INCONCLUSIVOS, TIMESTAMPS INVÁLIDOS E VALORES DEFAULT
  // =========================================================================
  describe('5. Fail-Closed contra Ambiguidade, Timestamp Inválido e Valores Incompletos', () => {
    it('candidato com valor ausente ou zerado é bloqueado como AMBIGUOUS sem inventar preço default', async () => {
      const tenantId = 'tenant-invalid-amount';
      const baseSub: DurableSubscriptionRecord = {
        id: `sub-${tenantId}`,
        barbershopId: tenantId,
        barbershopName: 'Barbearia Valor Inválido',
        payerEmail: 'owner@invalid.com',
        mercadopagoSubscriptionId: 'mp-sub-inv',
        status: 'PAST_DUE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Pro',
        currentPrice: 79.90,
        paidBillingCount: 0,
        isInTrial: false,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      };

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          paging: { total: 1, limit: 30, offset: 0 },
          results: [
            {
              id: 'pay-no-amount',
              status: 'approved',
              // transaction_amount ausente / nulo
              transaction_amount: null,
              preapproval_id: 'mp-sub-inv',
              external_reference: tenantId,
              date_approved: '2026-09-24T12:00:00.000Z'
            }
          ]
        }
      });

      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: baseSub,
        callMpWithDetails: mockCallMp
      });

      assert.strictEqual(result.status, 'AMBIGUOUS', 'Deve retornar AMBIGUOUS para impedir gravação corrupta');
      assert.strictEqual(result.reconciledPaymentsCount, 0, 'Zero pagamentos processados');
    });

    it('candidato com timestamp inválido é bloqueado sem usar Date.now() como substituição', async () => {
      const tenantId = 'tenant-invalid-ts';
      const baseSub: DurableSubscriptionRecord = {
        id: `sub-${tenantId}`,
        barbershopId: tenantId,
        barbershopName: 'Barbearia TS Inválido',
        payerEmail: 'owner@badts.com',
        mercadopagoSubscriptionId: 'mp-sub-badts',
        status: 'PAST_DUE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Pro',
        currentPrice: 79.90,
        paidBillingCount: 0,
        isInTrial: false,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      };

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          paging: { total: 1, limit: 30, offset: 0 },
          results: [
            {
              id: 'pay-bad-ts',
              status: 'approved',
              transaction_amount: 79.90,
              preapproval_id: 'mp-sub-badts',
              external_reference: tenantId,
              date_approved: 'data_corrompida_mp'
            }
          ]
        }
      });

      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: baseSub,
        callMpWithDetails: mockCallMp
      });

      assert.strictEqual(result.status, 'AMBIGUOUS', 'Deve retornar AMBIGUOUS quando timestamp não é parseável');
    });

    it('rejeita IDs sintéticos ou mocks', async () => {
      const tenantId = 'tenant-synth';
      const baseSub: DurableSubscriptionRecord = {
        id: `sub-${tenantId}`,
        barbershopId: tenantId,
        barbershopName: 'Barbearia Synth',
        payerEmail: 'owner@synth.com',
        mercadopagoSubscriptionId: 'mp-sub-synth',
        status: 'PAST_DUE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Pro',
        currentPrice: 79.90,
        paidBillingCount: 0,
        isInTrial: false,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      };

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          paging: { total: 1, limit: 30, offset: 0 },
          results: [
            {
              id: 'synth-payment-12345',
              status: 'approved',
              transaction_amount: 79.90,
              preapproval_id: 'mp-sub-synth',
              external_reference: tenantId,
              date_approved: '2026-09-24T12:00:00.000Z'
            }
          ]
        }
      });

      const result = await reconcileSubscriptionPaymentsWithMercadoPago({
        barbershopId: tenantId,
        subscription: baseSub,
        callMpWithDetails: mockCallMp
      });

      assert.strictEqual(result.status, 'AMBIGUOUS', 'ID sintético deve ser rejeitado');
    });
  });

  // =========================================================================
  // 6. ENDPOINTS ADMINISTRATIVOS E ARQUITETURA DE RECUPERAÇÃO
  // =========================================================================
  describe('6. Endpoints Administrativos e Arquitetura de Reconciliação', () => {
    it('server.ts expõe endpoint protegido /api/subscriptions/reconcile-payments/:barbershopId', () => {
      const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
      assert.ok(
        serverCode.includes("app.post('/api/subscriptions/reconcile-payments/:barbershopId'"),
        'server.ts deve conter a rota /api/subscriptions/reconcile-payments/:barbershopId'
      );
      assert.ok(
        serverCode.includes("requireTenantManagerOrOwner((req) => req.params.barbershopId)"),
        'A rota deve ser protegida por requireTenantManagerOrOwner'
      );
    });

    it('server.ts expõe endpoint administrativo geral /api/admin/subscriptions/reconcile-all', () => {
      const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
      assert.ok(
        serverCode.includes("app.post('/api/admin/subscriptions/reconcile-all'"),
        'server.ts deve conter a rota /api/admin/subscriptions/reconcile-all'
      );
      assert.ok(
        serverCode.includes("requireSuperAdmin"),
        'A rota de lote geral deve ser restrita ao Super Admin'
      );
    });

    it('calcula nextBillingDate de forma consistente com ciclos', () => {
      const base = '2026-01-15T00:00:00.000Z';
      assert.strictEqual(calculateNextBillingDate(base, 'MONTHLY'), '2026-02-15');
      assert.strictEqual(calculateNextBillingDate(base, 'QUARTERLY'), '2026-04-15');
      assert.strictEqual(calculateNextBillingDate(base, 'SEMIANNUAL'), '2026-07-15');
      assert.strictEqual(calculateNextBillingDate(base, 'ANNUAL'), '2027-01-15');
    });
  });
});
