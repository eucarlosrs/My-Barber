import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluatePreapprovalCandidate,
  evaluatePreapprovalCandidateWithDetail,
  searchPreapprovalsByTenant,
  recoverPreapprovalById,
  executePreapprovalRecoveryCheck,
  reconcileSubscriptionWithMercadoPago,
  LocalCreationContext
} from '../server/subscriptionReconciliationService.js';

describe('MY BARBER — FASE 3.3B: Resolução do P2-C Residual (Idempotência e Recuperação sem Duplicidade de Preapproval)', () => {
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  // =========================================================================
  // 1. AVALIAÇÃO DE CANDIDATOS (evaluatePreapprovalCandidate)
  // =========================================================================
  describe('1. Avaliação Estrita de Compatibilidade de Candidato', () => {
    const validContext: LocalCreationContext = {
      barbershopId: 'tenant-barber-01',
      payerEmail: 'dono@barbearia.com.br',
      planId: 'plan-pro',
      planName: 'Plano Pro',
      expectedAmount: 99.90,
      currencyId: 'BRL',
      billingCycle: 'MONTHLY',
      frequency: 1,
      frequencyType: 'months',
      attemptTimestampMs: 1727000000000
    };

    const validCandidate = {
      id: '2c9380848f123456018f987654321000',
      external_reference: 'tenant-barber-01',
      payer_email: 'dono@barbearia.com.br',
      status: 'pending',
      auto_recurring: {
        transaction_amount: 99.90,
        currency_id: 'BRL',
        frequency: 1,
        frequency_type: 'months'
      },
      init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c9380848f123456018f987654321000',
      date_created: new Date(1727000000000 - 60000).toISOString()
    };

    it('Aprova candidato 100% coincidente com o tenant, valor, e-mail e status pending', () => {
      const result = evaluatePreapprovalCandidate(validCandidate, validContext);
      assert.strictEqual(result, 'MATCH', 'Candidato legítimo deve ser aprovado como MATCH');
    });

    it('Aprova candidato com status authorized se todos os outros parâmetros coincidirem', () => {
      const authorizedCandidate = { ...validCandidate, status: 'authorized' };
      const result = evaluatePreapprovalCandidate(authorizedCandidate, validContext);
      assert.strictEqual(result, 'MATCH', 'Candidato já autorizado deve ser aprovado como MATCH');
    });

    it('REJEITA candidato de outro estabelecimento (cross-tenant violation)', () => {
      const crossTenantCandidate = { ...validCandidate, external_reference: 'tenant-invasor-99' };
      const detail = evaluatePreapprovalCandidateWithDetail(crossTenantCandidate, validContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('não coincide com o tenant'));
    });

    it('REJEITA candidato com status CANCELADO (nunca satisfaz nova contratação)', () => {
      const canceledCandidate = { ...validCandidate, status: 'cancelled' };
      const detail = evaluatePreapprovalCandidateWithDetail(canceledCandidate, validContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('CANCELADO'));
    });

    it('REJEITA candidato com e-mail pagador divergente', () => {
      const wrongEmailCandidate = { ...validCandidate, payer_email: 'outro@usuario.com' };
      const detail = evaluatePreapprovalCandidateWithDetail(wrongEmailCandidate, validContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('payer_email'));
    });

    it('REJEITA candidato com valor divergente do plano pretendido', () => {
      const wrongAmountCandidate = {
        ...validCandidate,
        auto_recurring: { ...validCandidate.auto_recurring, transaction_amount: 149.90 }
      };
      const detail = evaluatePreapprovalCandidateWithDetail(wrongAmountCandidate, validContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('diverge do valor esperado'));
    });

    it('NÃO descarta candidato compatível criado há mais de 48 horas (reconcilia como MATCH evitando duplicata)', () => {
      const ancientCandidate = {
        ...validCandidate,
        date_created: new Date(validContext.attemptTimestampMs! - 72 * 3600 * 1000).toISOString()
      };
      const detail = evaluatePreapprovalCandidateWithDetail(ancientCandidate, validContext);
      assert.strictEqual(detail.result, 'MATCH', 'Candidato legítimo antigo não deve ser descartado cegamente');
    });

    it('REJEITA candidato que não possua init_point válido', () => {
      const noInitPointCandidate = { ...validCandidate, init_point: '' };
      const detail = evaluatePreapprovalCandidateWithDetail(noInitPointCandidate, validContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('init_point'));
    });
  });

  // =========================================================================
  // 2. BUSCA NO GATEWAY E RESOLUÇÃO DE AMBIGUIDADE (searchPreapprovalsByTenant)
  // =========================================================================
  describe('2. Busca no Gateway e Bloqueio de Ambiguidade de Assinaturas Múltiplas', () => {
    const context: LocalCreationContext = {
      barbershopId: 'tenant-test-100',
      payerEmail: 'barbeiro@teste.com',
      planId: 'plan-basic',
      expectedAmount: 50.00
    };

    it('Retorna NOT_FOUND quando Mercado Pago retorna lista vazia', async () => {
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [], paging: { total: 0 } }
      });

      const res = await searchPreapprovalsByTenant('tenant-test-100', context, mockCallMp);
      assert.strictEqual(res.status, 'NOT_FOUND');
    });

    it('Retorna RECOVERED quando existe exatamente 1 candidato compatível', async () => {
      const mockCandidate = {
        id: 'mp-sub-unique-1',
        external_reference: 'tenant-test-100',
        payer_email: 'barbeiro@teste.com',
        status: 'pending',
        auto_recurring: { transaction_amount: 50.00, currency_id: 'BRL' },
        init_point: 'https://mercadopago.com.br/checkout/1'
      };

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [mockCandidate] }
      });

      const res = await searchPreapprovalsByTenant('tenant-test-100', context, mockCallMp);
      assert.strictEqual(res.status, 'RECOVERED');
      assert.strictEqual(res.candidate?.id, 'mp-sub-unique-1');
    });

    it('Retorna AMBIGUOUS e NÃO escolhe arbitrariamente quando existem 2+ candidatos compatíveis', async () => {
      const candidate1 = {
        id: 'mp-sub-dup-1',
        external_reference: 'tenant-test-100',
        payer_email: 'barbeiro@teste.com',
        status: 'pending',
        auto_recurring: { transaction_amount: 50.00, currency_id: 'BRL' },
        init_point: 'https://mercadopago.com.br/checkout/1'
      };
      const candidate2 = {
        id: 'mp-sub-dup-2',
        external_reference: 'tenant-test-100',
        payer_email: 'barbeiro@teste.com',
        status: 'pending',
        auto_recurring: { transaction_amount: 50.00, currency_id: 'BRL' },
        init_point: 'https://mercadopago.com.br/checkout/2'
      };

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [candidate1, candidate2] }
      });

      const res = await searchPreapprovalsByTenant('tenant-test-100', context, mockCallMp);
      assert.strictEqual(res.status, 'AMBIGUOUS');
      assert.strictEqual(res.candidates?.length, 2);
      assert.ok(res.reason?.includes('múltiplas preapprovals ativas/pendentes'));
    });

    it('Ignora candidatos incompatíveis na lista e recupera se sobrar exatamente 1 compatível', async () => {
      const incompatibleCanceled = {
        id: 'mp-sub-canceled',
        external_reference: 'tenant-test-100',
        payer_email: 'barbeiro@teste.com',
        status: 'cancelled',
        auto_recurring: { transaction_amount: 50.00, currency_id: 'BRL' },
        init_point: 'https://mercadopago.com.br/checkout/c'
      };
      const validPending = {
        id: 'mp-sub-valid-single',
        external_reference: 'tenant-test-100',
        payer_email: 'barbeiro@teste.com',
        status: 'pending',
        auto_recurring: { transaction_amount: 50.00, currency_id: 'BRL' },
        init_point: 'https://mercadopago.com.br/checkout/v'
      };

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [incompatibleCanceled, validPending] }
      });

      const res = await searchPreapprovalsByTenant('tenant-test-100', context, mockCallMp);
      assert.strictEqual(res.status, 'RECOVERED');
      assert.strictEqual(res.candidate?.id, 'mp-sub-valid-single');
    });

    it('Retorna GATEWAY_ERROR quando o Mercado Pago falha na consulta', async () => {
      const mockCallMp = async () => ({
        ok: false,
        status: 503,
        data: null,
        errorText: 'Service Unavailable'
      });

      const res = await searchPreapprovalsByTenant('tenant-test-100', context, mockCallMp);
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
      assert.strictEqual(res.statusCode, 503);
    });
  });

  // =========================================================================
  // 3. RECUPERAÇÃO POR ID CONHECIDO (recoverPreapprovalById)
  // =========================================================================
  describe('3. Recuperação Direta por ID Conhecido', () => {
    const context: LocalCreationContext = {
      barbershopId: 'tenant-direct-id',
      payerEmail: 'owner@direct.com',
      planId: 'plan-pro',
      expectedAmount: 120.00
    };

    it('Recupera com sucesso preapproval válida por ID', async () => {
      const candidate = {
        id: 'known-sub-777',
        external_reference: 'tenant-direct-id',
        payer_email: 'owner@direct.com',
        status: 'pending',
        auto_recurring: { transaction_amount: 120.00, currency_id: 'BRL' },
        init_point: 'https://mercadopago.com.br/checkout/777'
      };

      const mockCallMp = async (endpoint: string) => {
        assert.ok(endpoint.includes('known-sub-777'));
        return { ok: true, status: 200, data: candidate };
      };

      const res = await recoverPreapprovalById('known-sub-777', context, mockCallMp);
      assert.strictEqual(res.status, 'RECOVERED');
      assert.strictEqual(res.candidate.id, 'known-sub-777');
    });

    it('Retorna NOT_FOUND quando o ID não existe (404)', async () => {
      const mockCallMp = async () => ({ ok: false, status: 404, data: null });
      const res = await recoverPreapprovalById('inexistent-sub', context, mockCallMp);
      assert.strictEqual(res.status, 'NOT_FOUND');
    });
  });

  // =========================================================================
  // 4. ORQUESTRADOR DO RECOVERY CHECK (executePreapprovalRecoveryCheck)
  // =========================================================================
  describe('4. Orquestração Pré-Criação (executePreapprovalRecoveryCheck)', () => {
    const context: LocalCreationContext = {
      barbershopId: 'tenant-orch-01',
      payerEmail: 'orch@barber.com',
      planId: 'plan-orch',
      expectedAmount: 89.00
    };

    it('Permite PROCEED_TO_CREATE quando nenhuma preapproval existe no gateway', async () => {
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [] }
      });

      const check = await executePreapprovalRecoveryCheck(
        'tenant-orch-01',
        context,
        null,
        mockCallMp
      );

      assert.strictEqual(check.operation, 'PROCEED_TO_CREATE');
    });

    it('Recupera contrato anterior (RECOVER_EXISTING) quando lock anterior tinha mpSubscriptionId registrado', async () => {
      const candidate = {
        id: 'previous-failed-fs-write-sub',
        external_reference: 'tenant-orch-01',
        payer_email: 'orch@barber.com',
        status: 'pending',
        auto_recurring: { transaction_amount: 89.00, currency_id: 'BRL' },
        init_point: 'https://mercadopago.com.br/checkout/fs-write'
      };

      const mockCallMp = async (endpoint: string) => {
        if (endpoint.includes('previous-failed-fs-write-sub')) {
          return { ok: true, status: 200, data: candidate };
        }
        return { ok: true, status: 200, data: { results: [] } };
      };

      const previousLock = {
        status: 'FIRESTORE_WRITE_FAILED',
        mpSubscriptionId: 'previous-failed-fs-write-sub'
      };

      const check = await executePreapprovalRecoveryCheck(
        'tenant-orch-01',
        context,
        previousLock,
        mockCallMp
      );

      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
      assert.strictEqual(check.mpSubscriptionId, 'previous-failed-fs-write-sub');
    });

    it('Bloqueia criação com BLOCK_AMBIGUOUS (409) quando múltiplos contratos compatíveis existem', async () => {
      const c1 = {
        id: 'dup-1',
        external_reference: 'tenant-orch-01',
        payer_email: 'orch@barber.com',
        status: 'pending',
        auto_recurring: { transaction_amount: 89.00, currency_id: 'BRL' },
        init_point: 'https://mp.com/1'
      };
      const c2 = {
        id: 'dup-2',
        external_reference: 'tenant-orch-01',
        payer_email: 'orch@barber.com',
        status: 'pending',
        auto_recurring: { transaction_amount: 89.00, currency_id: 'BRL' },
        init_point: 'https://mp.com/2'
      };

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [c1, c2] }
      });

      const check = await executePreapprovalRecoveryCheck(
        'tenant-orch-01',
        context,
        null,
        mockCallMp
      );

      assert.strictEqual(check.operation, 'BLOCK_AMBIGUOUS');
      assert.strictEqual(check.httpStatus, 409);
    });

    it('Retorna GATEWAY_UNAVAILABLE (502/503) em falha de comunicação externa', async () => {
      const mockCallMp = async () => ({
        ok: false,
        status: 504,
        data: null,
        errorText: 'Gateway Timeout'
      });

      const check = await executePreapprovalRecoveryCheck(
        'tenant-orch-01',
        context,
        null,
        mockCallMp
      );

      assert.strictEqual(check.operation, 'GATEWAY_UNAVAILABLE');
      assert.strictEqual(check.httpStatus, 503);
    });
  });

  // =========================================================================
  // 5. RECONCILIAÇÃO SEGURA DE ASSINATURAS (reconcileSubscriptionWithMercadoPago)
  // =========================================================================
  describe('5. Reconciliação sem Efeitos Colaterais ou Falsos Pagamentos', () => {
    it('NUNCA altera uma assinatura CANCELED local para ACTIVE mesmo se o gateway retornar authorized', () => {
      const canceledLocal = {
        id: 'sub-canceled-01',
        status: 'CANCELED',
        currentPrice: 99.00,
        paidBillingCount: 2,
        canceledAt: '2026-09-01T00:00:00.000Z'
      };

      const mpData = {
        id: 'mp-sub-01',
        status: 'authorized',
        auto_recurring: { transaction_amount: 99.00 }
      };

      const { reconciledSubscription } = reconcileSubscriptionWithMercadoPago(canceledLocal, mpData);
      assert.strictEqual(
        reconciledSubscription.status,
        'CANCELED',
        'Assinatura cancelada localmente NUNCA deve ser reativada'
      );
      assert.strictEqual(
        reconciledSubscription.paidBillingCount,
        2,
        'Reconciliação JAMAIS deve alterar paidBillingCount'
      );
    });

    it('Atualiza status para CANCELED quando o Mercado Pago estiver cancelado', () => {
      const activeLocal = {
        id: 'sub-active-01',
        status: 'ACTIVE',
        currentPrice: 99.00,
        paidBillingCount: 1
      };

      const mpData = {
        id: 'mp-sub-01',
        status: 'cancelled',
        auto_recurring: { transaction_amount: 99.00 }
      };

      const { reconciledSubscription, hasDivergence } = reconcileSubscriptionWithMercadoPago(activeLocal, mpData);
      assert.strictEqual(hasDivergence, true);
      assert.strictEqual(reconciledSubscription.status, 'CANCELED');
      assert.ok(reconciledSubscription.canceledAt);
    });

    it('Transiciona PENDING para TRIAL_14_DAYS quando autorizado e dentro do período de teste', () => {
      const futureDateStr = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0];
      const pendingLocal = {
        id: 'sub-pending-01',
        status: 'PENDING',
        trialEndDate: futureDateStr,
        paidBillingCount: 0,
        currentPrice: 0
      };

      const mpData = {
        id: 'mp-sub-01',
        status: 'authorized',
        auto_recurring: { transaction_amount: 0 }
      };

      const { reconciledSubscription } = reconcileSubscriptionWithMercadoPago(pendingLocal, mpData);
      assert.strictEqual(reconciledSubscription.status, 'TRIAL_14_DAYS');
      assert.strictEqual(reconciledSubscription.cardValidated, true);
      assert.strictEqual(reconciledSubscription.isInTrial, true);
    });
  });

  // =========================================================================
  // 6. VALIDAÇÃO DO SERVIDOR (server.ts) E ROTAS
  // =========================================================================
  describe('6. Integração Soberana no Backend (server.ts)', () => {
    it('Importa e executa executePreapprovalRecoveryCheck antes de POST /preapproval', () => {
      assert.ok(
        serverContent.includes('executePreapprovalRecoveryCheck('),
        'server.ts DEVE invocar executePreapprovalRecoveryCheck antes de chamar a criação no MP'
      );
    });

    it('Recupera contrato existente sem chamar POST /preapproval quando status for RECOVER_EXISTING', () => {
      assert.ok(
        serverContent.includes("if (recoveryCheck.operation === 'RECOVER_EXISTING' && recoveryCheck.candidate)"),
        'server.ts DEVE tratar RECOVER_EXISTING recuperando id e init_point sem criar novo contrato'
      );
      assert.ok(
        serverContent.includes('isRecovered = true;'),
        'server.ts DEVE sinalizar isRecovered'
      );
    });

    it('Bloqueia com HTTP 409 quando o recovery check acusar BLOCK_AMBIGUOUS', () => {
      assert.ok(
        serverContent.includes("if (recoveryCheck.operation === 'BLOCK_AMBIGUOUS')"),
        'server.ts DEVE tratar BLOCK_AMBIGUOUS'
      );
      assert.ok(
        serverContent.includes("status: 'AMBIGUOUS_BLOCKED'"),
        'server.ts DEVE registrar lock como AMBIGUOUS_BLOCKED'
      );
    });

    it('Disponibiliza rota explícita POST /api/subscriptions/reconcile/:barbershopId', () => {
      assert.ok(
        serverContent.includes('/api/subscriptions/reconcile/:barbershopId'),
        'server.ts DEVE disponibilizar endpoint explícito de reconciliação'
      );
      assert.ok(
        serverContent.includes('reconcileSubscriptionWithMercadoPago('),
        'Endpoint de reconciliação DEVE utilizar a função pura de reconciliação'
      );
    });

    it('Resposta de criação indica se a assinatura foi recuperada (recovered: true/false)', () => {
      assert.ok(
        serverContent.includes('recovered: isRecovered'),
        'Resposta JSON DEVE informar se a assinatura foi criada nova ou recuperada'
      );
    });
  });
});
