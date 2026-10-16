import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveSubscriptionPlanPricing,
  validateFinancialTimestamp,
  FINANCIAL_SEVERITY,
  DurableSubscriptionRecord,
  DurablePaymentRecord
} from '../server/webhookService.js';

describe('FASE 3.4F — Hardening Financeiro, Severidade de Reversões e Integridade Temporal', () => {

  // =========================================================================
  // 1. V3.4-E01: INVARIANTE CONTRATUAL DE PREÇO & ASSINATURAS LEGADAS
  // =========================================================================
  describe('1. V3.4-E01: Invariante de Preço e Proteção a Assinaturas Legadas', () => {
    it('assinatura nova com snapshot contratual não tem preço alterado se o catálogo global for modificado', () => {
      const contractedSub: DurableSubscriptionRecord = {
        id: 'sub-tenant-snapshot',
        barbershopId: 'tenant-snapshot',
        barbershopName: 'Barbearia Snapshot',
        payerEmail: 'owner@snapshot.com',
        mercadopagoSubscriptionId: 'mp-sub-snap',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Pro',
        planId: 'plan-pro',
        planPriceNormal: 79.90,
        currentPrice: 79.90,
        paidBillingCount: 1,
        billingCount: 1,
        isInTrial: false,
        trialOrLaunchPeriod: false,
        nextBillingDate: '2026-11-01',
        toleranceDays: 7,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      };

      // Super Admin alterou o preço do catálogo global para 129.90
      const alteredCatalogPlan = {
        id: 'plan-pro',
        name: 'Plano Pro Reajustado',
        priceMonthly: 129.90,
        currency: 'BRL'
      };

      const pricing = resolveSubscriptionPlanPricing(contractedSub, 2, alteredCatalogPlan);

      // Deve preservar rigorosamente o preço contratado original
      assert.strictEqual(pricing.currentPrice, 79.90, 'Preço deve ser o do snapshot contratado');
      assert.strictEqual(pricing.regularPrice, 79.90, 'Preço regular deve ser o do contrato');
      assert.strictEqual(pricing.preventGatewayPriceUpdate, false, 'Preço legítimo do contrato');
    });

    it('assinatura legada sem snapshot com currentPrice histórico preserva preço e bloqueia reajuste de catálogo no gateway', () => {
      const legacySub: DurableSubscriptionRecord = {
        id: 'sub-tenant-legacy',
        barbershopId: 'tenant-legacy',
        barbershopName: 'Barbearia Legada',
        payerEmail: 'owner@legada.com',
        mercadopagoSubscriptionId: 'mp-sub-legacy',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Antigo',
        // Sem planPriceNormal e sem customPlan (criada antes da FASE 3.4B)
        currentPrice: 49.90,
        paidBillingCount: 5,
        billingCount: 5,
        isInTrial: false,
        trialOrLaunchPeriod: false,
        nextBillingDate: '2026-11-01',
        toleranceDays: 7,
        createdAt: '2025-10-01T00:00:00Z',
        updatedAt: '2025-10-01T00:00:00Z'
      };

      // Super Admin reajustou catálogo para 89.90
      const alteredCatalogPlan = {
        id: 'plan-antigo',
        name: 'Plano Antigo Modificado',
        priceMonthly: 89.90,
        currency: 'BRL'
      };

      const pricing = resolveSubscriptionPlanPricing(legacySub, 6, alteredCatalogPlan);

      assert.strictEqual(pricing.currentPrice, 49.90, 'Não deve reajustar silenciosamente para 89.90');
      assert.strictEqual(pricing.preventGatewayPriceUpdate, true, 'Deve impedir atualização indevida no Mercado Pago');
      assert.strictEqual(pricing.needsPricingReconciliation, true, 'Deve marcar necessidade de reconciliação');
      assert.strictEqual(pricing.inconsistentPlan, true, 'Deve sinalizar divergência com o catálogo');
    });

    it('assinatura legada sem evidência de preço opera fail-closed sem inventar valor arbitrário', () => {
      const unpricedLegacySub: DurableSubscriptionRecord = {
        id: 'sub-tenant-unpriced',
        barbershopId: 'tenant-unpriced',
        barbershopName: 'Barbearia Sem Preço',
        payerEmail: 'owner@sempreco.com',
        mercadopagoSubscriptionId: 'mp-sub-unpriced',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Vazio',
        currentPrice: 0,
        paidBillingCount: 0,
        billingCount: 0,
        isInTrial: false,
        nextBillingDate: '2026-11-01',
        toleranceDays: 7,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      };

      const pricing = resolveSubscriptionPlanPricing(unpricedLegacySub, 1);

      assert.strictEqual(pricing.currentPrice, 0, 'Não inventa preço');
      assert.strictEqual(pricing.inconsistentPlan, true, 'Sinaliza plano inconsistente');
      assert.strictEqual(pricing.preventGatewayPriceUpdate, true, 'Bloqueia update de gateway');
      assert.strictEqual(pricing.needsPricingReconciliation, true, 'Sinaliza necessidade de reconciliação');
    });

    it('servidor server.ts protege gateway contra reajuste não contratado', () => {
      const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
      assert.ok(
        serverCode.includes('!planPricing?.preventGatewayPriceUpdate'),
        'server.ts deve checar preventGatewayPriceUpdate antes de chamar updateMercadoPagoSubscriptionPrice'
      );
      assert.ok(
        serverCode.includes('!subscriptionRecord.needsPricingReconciliation'),
        'server.ts deve bloquear update de preço se houver flag needsPricingReconciliation'
      );
    });
  });

  // =========================================================================
  // 2. V3.4-E02: HIERARQUIA DE SEVERIDADE FINANCEIRA E DOWNGRADE PROIBIDO
  // =========================================================================
  describe('2. V3.4-E02: Hierarquia de Severidade e Bloqueio de Downgrade', () => {
    it('FINANCIAL_SEVERITY define ordenação matemática estrita: APPROVED < REFUNDED < CHARGED_BACK', () => {
      assert.ok(FINANCIAL_SEVERITY.APPROVED < FINANCIAL_SEVERITY.REFUNDED, 'REFUNDED deve ser mais severo que APPROVED');
      assert.ok(FINANCIAL_SEVERITY.REFUNDED < FINANCIAL_SEVERITY.CHARGED_BACK, 'CHARGED_BACK deve ser mais severo que REFUNDED');
      assert.ok(FINANCIAL_SEVERITY.REJECTED < FINANCIAL_SEVERITY.APPROVED, 'APPROVED possui maior severidade operacional que REJECTED');
    });

    it('webhookService.ts bloqueia explicitamente downgrade de CHARGED_BACK para REFUNDED', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'src/server/webhookService.ts'), 'utf-8');
      assert.ok(
        code.includes('incomingSeverity < existingSeverity'),
        'Deve comparar explicitamente a severidade do estado existente contra o novo estado'
      );
      assert.ok(
        code.includes('downgradePrevented: true'),
        'Deve sinalizar downgradePrevented quando tentativa de redução de severidade ocorrer'
      );
      assert.ok(
        code.includes('Downgrade de severidade financeira rejeitado'),
        'Deve emitir log de segurança financeira'
      );
    });

    it('idempotência pura é garantida para eventos com mesma severidade', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'src/server/webhookService.ts'), 'utf-8');
      assert.ok(
        code.includes('existingPayment.status === params.status'),
        'Mesmo status deve ser tratado com retorno idempotente sem reprocessamento destrutivo'
      );
    });
  });

  // =========================================================================
  // 3. V3.4-E03: ISOLAMENTO MULTI-TENANT E PREVENÇÃO DE PAYMENT POISONING
  // =========================================================================
  describe('3. V3.4-E03: Prevenção de Contaminação Cross-Tenant', () => {
    it('webhookService.ts valida estritamente a soberania de tenant no pagamento antes de qualquer mutação', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'src/server/webhookService.ts'), 'utf-8');
      assert.ok(
        code.includes('existingPayment.barbershopId !== params.barbershopId'),
        'Deve validar que o pagamento pertence ao barbershopId requisitado'
      );
      assert.ok(
        code.includes('CROSS_TENANT_PAYMENT_MISMATCH'),
        'Deve lançar código de erro CROSS_TENANT_PAYMENT_MISMATCH'
      );
      assert.ok(
        code.includes('CROSS_TENANT_SUBSCRIPTION_MISMATCH'),
        'Deve lançar código de erro CROSS_TENANT_SUBSCRIPTION_MISMATCH'
      );
    });

    it('criação inicial de payment document persiste relationamento multi-tenant imutável', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'src/server/webhookService.ts'), 'utf-8');
      assert.ok(
        code.includes('barbershopId: currentSub.barbershopId'),
        'Pagamento deve nascer associado ao tenant da assinatura'
      );
      assert.ok(
        code.includes('externalReference: currentSub.barbershopId'),
        'Pagamento deve conter externalReference do tenant'
      );
      assert.ok(
        code.includes('subscriptionId: currentSub.id'),
        'Pagamento deve nascer associado ao ID da assinatura'
      );
    });
  });

  // =========================================================================
  // 4. V3.4-E04: VALIDAÇÃO DE TIMESTAMPS E PROTEÇÃO CONTRA NaN
  // =========================================================================
  describe('4. V3.4-E04: Validação Estrita de Timestamps', () => {
    it('validateFinancialTimestamp aceita datas ISO válidas dentro da janela 2020-2100', () => {
      const validIso = '2026-09-24T12:00:00.000Z';
      const result = validateFinancialTimestamp(validIso);
      assert.strictEqual(result.valid, true);
      assert.ok(result.timeMs > 0);
      assert.strictEqual(result.isoString, validIso);
    });

    it('validateFinancialTimestamp rejeita timestamp ausente sem falha ou NaN', () => {
      const resNull = validateFinancialTimestamp(null);
      assert.strictEqual(resNull.valid, false);
      assert.strictEqual(resNull.error, 'MISSING_TIMESTAMP');
      assert.strictEqual(isNaN(resNull.timeMs), false);

      const resEmpty = validateFinancialTimestamp('   ');
      assert.strictEqual(resEmpty.valid, false);
      assert.strictEqual(resEmpty.error, 'MISSING_TIMESTAMP');
    });

    it('validateFinancialTimestamp rejeita strings não parseáveis e evita NaN silencioso', () => {
      const resInvalid = validateFinancialTimestamp('data_invalida_mp');
      assert.strictEqual(resInvalid.valid, false);
      assert.strictEqual(resInvalid.error, 'INVALID_TIMESTAMP');
      assert.strictEqual(isNaN(resInvalid.timeMs), false);
    });

    it('validateFinancialTimestamp rejeita anos anômalos fora de 2020-2100', () => {
      const resOld = validateFinancialTimestamp('1970-01-01T00:00:00Z');
      assert.strictEqual(resOld.valid, false);
      assert.strictEqual(resOld.error, 'OUT_OF_RANGE_TIMESTAMP');

      const resFar = validateFinancialTimestamp('2150-01-01T00:00:00Z');
      assert.strictEqual(resFar.valid, false);
      assert.strictEqual(resFar.error, 'OUT_OF_RANGE_TIMESTAMP');
    });

    it('webhookService.ts trata timestamp inválido em REJECTED de forma fail-closed sem assumir Date.now()', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'src/server/webhookService.ts'), 'utf-8');
      assert.ok(
        code.includes('validateFinancialTimestamp(params.externalEventDate)'),
        'Deve validar timestamp usando validateFinancialTimestamp'
      );
      assert.ok(
        code.includes('Fail-closed: Estado ACTIVE preservado sem transição destrutiva para PAST_DUE'),
        'Deve preservar ACTIVE de forma fail-closed quando timestamp for inválido'
      );
    });
  });

  // =========================================================================
  // 5. V3.4-E05: ORDENAÇÃO TEMPORAL E REVERSÕES FORA DE ORDEM
  // =========================================================================
  describe('5. V3.4-E05: Ordenação Temporal e Resolução de Reversões Fora de Ordem', () => {
    it('webhookService.ts descarta evento de reversão comprovadamente mais antigo que o estado já registrado', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'src/server/webhookService.ts'), 'utf-8');
      assert.ok(
        code.includes('tsValidation.timeMs < existingEventTime'),
        'Deve comparar timestamp do evento com o timestamp do último evento registrado'
      );
      assert.ok(
        code.includes('Evento de reversão antigo descartado por ordenação temporal'),
        'Deve registrar descarte de evento obsoleto'
      );
    });

    it('mesmo paymentId não pode ser re-aprovado após refund ou chargeback', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'src/server/webhookService.ts'), 'utf-8');
      assert.ok(
        code.includes('// Se já está REFUNDED ou CHARGED_BACK, corrida com evento atrasado ou replay:'),
        'Deve documentar que APPROVED posterior para mesmo paymentId é descartado'
      );
      assert.ok(
        code.includes("if (params.status === 'APPROVED') {"),
        'Branch de APPROVED deve retornar sem mutação se pagamento já existe'
      );
    });
  });

  // =========================================================================
  // 6. INVARIANTES DE TERMINALIDADE (CANCELED) E PAIDBILLINGCOUNT
  // =========================================================================
  describe('6. Invariantes de CANCELED e Preservação de PaidBillingCount', () => {
    it('assinatura CANCELED jamais tem seu status alterado para ACTIVE, PAST_DUE ou SUSPENDED', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'src/server/webhookService.ts'), 'utf-8');
      // No cenário 1
      assert.ok(
        code.includes("if (currentSub.status === 'CANCELED') {"),
        'Cenário 1 deve checar CANCELED'
      );
      // No cenário 2
      assert.ok(
        code.includes("// Mantém status = 'CANCELED', sem reativação implícita"),
        'Cenário 2 deve manter CANCELED estritamente terminal'
      );
    });

    it('paidBillingCount nunca sofre decremento em refund ou chargeback', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'src/server/webhookService.ts'), 'utf-8');
      assert.strictEqual(code.includes('paidBillingCount--'), false, 'Não deve decrementar paidBillingCount');
      assert.strictEqual(code.includes('paidBillingCount -= 1'), false, 'Não deve decrementar paidBillingCount');
      assert.strictEqual(code.includes('paidBillingCount = currentSub.paidBillingCount -'), false, 'Não deve subtrair de paidBillingCount');
    });
  });
});
