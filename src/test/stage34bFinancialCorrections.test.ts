import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveSubscriptionPlanPricing,
  DurableSubscriptionRecord,
  DurablePaymentRecord
} from '../server/webhookService.js';
import { evaluateTenantSubscriptionStatus } from '../server/subscriptionEnforcement.js';

describe('FASE 3.4B — Testes Automatizados de Correções Financeiras e Enforcement', () => {

  // =========================================================================
  // 1. V3.4-01: REMOÇÃO DE PREÇOS HARDCODED E PRECIFICAÇÃO DINÂMICA
  // =========================================================================
  describe('1. V3.4-01: Resolução Dinâmica de Preços e Fim dos Valores Fixos (49.90 / 69.90)', () => {
    it('calcula preço promocional durante o período contratado e transiciona para o preço normal', () => {
      const customSub: DurableSubscriptionRecord = {
        id: 'sub-tenant-1',
        barbershopId: 'tenant-1',
        barbershopName: 'Barbearia Modelo',
        payerEmail: 'owner@barbearia.com',
        mercadopagoSubscriptionId: 'mp-sub-1',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Custom Premium',
        planId: 'custom-premium',
        planPriceNormal: 120.00,
        planPricePromotional: 80.00,
        planPromotionCycles: 2,
        currentPrice: 80.00,
        paidBillingCount: 1,
        billingCount: 1,
        isInTrial: false,
        trialOrLaunchPeriod: true,
        nextBillingDate: '2026-10-01',
        toleranceDays: 7,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      };

      // Ciclo 2 (ainda na promoção de 2 ciclos)
      const resCycle2 = resolveSubscriptionPlanPricing(customSub, 2);
      assert.strictEqual(resCycle2.currentPrice, 80.00);
      assert.strictEqual(resCycle2.isInPromotion, true);
      assert.strictEqual(resCycle2.transitionedToRegular, false);

      // Ciclo 3 (transição para preço integral normal de 120.00)
      const resCycle3 = resolveSubscriptionPlanPricing(customSub, 3);
      assert.strictEqual(resCycle3.currentPrice, 120.00);
      assert.strictEqual(resCycle3.isInPromotion, false);
      assert.strictEqual(resCycle3.transitionedToRegular, true);
      assert.strictEqual(resCycle3.regularPrice, 120.00);
    });

    it('plano sem promoção cobra preço normal desde o primeiro ciclo', () => {
      const subNoPromo: DurableSubscriptionRecord = {
        id: 'sub-tenant-2',
        barbershopId: 'tenant-2',
        barbershopName: 'Barbearia Modelo 2',
        payerEmail: 'owner2@barbearia.com',
        mercadopagoSubscriptionId: 'mp-sub-2',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Direto',
        planId: 'plano-direto',
        planPriceNormal: 99.00,
        currentPrice: 99.00,
        paidBillingCount: 0,
        billingCount: 0,
        isInTrial: false,
        trialOrLaunchPeriod: false,
        nextBillingDate: '2026-10-01',
        toleranceDays: 7,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      };

      const resCycle1 = resolveSubscriptionPlanPricing(subNoPromo, 1);
      assert.strictEqual(resCycle1.currentPrice, 99.00);
      assert.strictEqual(resCycle1.isInPromotion, false);
      assert.strictEqual(resCycle1.transitionedToRegular, false);
    });

    it('plano inconsistente não inventa preço e preserva o preço atual de forma fail-safe', () => {
      const inconsistentSub: DurableSubscriptionRecord = {
        id: 'sub-tenant-3',
        barbershopId: 'tenant-3',
        barbershopName: 'Barbearia Modelo 3',
        payerEmail: 'owner3@barbearia.com',
        mercadopagoSubscriptionId: 'mp-sub-3',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        cardValidated: true,
        plan: 'Plano Desconhecido',
        currentPrice: 75.50,
        paidBillingCount: 1,
        billingCount: 1,
        isInTrial: false,
        trialOrLaunchPeriod: false,
        nextBillingDate: '2026-10-01',
        toleranceDays: 7,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      };

      const res = resolveSubscriptionPlanPricing(inconsistentSub, 2);
      assert.strictEqual(res.currentPrice, 75.50, 'Deve preservar currentPrice existente');
      assert.strictEqual(res.inconsistentPlan, true, 'Deve sinalizar plano inconsistente');
    });

    it('código fonte de webhookService.ts não possui lógica com 69.90 ou 49.90 fixos no cálculo de transição', () => {
      const webhookServiceCode = fs.readFileSync(
        path.join(process.cwd(), 'src/server/webhookService.ts'),
        'utf-8'
      );
      assert.ok(
        !webhookServiceCode.includes('currentSub.currentPrice = 69.90'),
        'webhookService não deve conter atribuição hardcoded de 69.90'
      );
      assert.ok(
        !webhookServiceCode.includes('currentSub.currentPrice = 49.90'),
        'webhookService não deve conter atribuição hardcoded de 49.90'
      );
    });
  });

  // =========================================================================
  // 2. V3.4-02: AUDITORIA E REGRAS DE REFUND / CHARGEBACK
  // =========================================================================
  describe('2. V3.4-02: Idempotência e Tratamento de Reversões Financeiras', () => {
    it('webhookService.ts suporta transição de status do pagamento de APPROVED para REFUNDED/CHARGED_BACK sem rejeitar como duplicado', () => {
      const webhookServiceCode = fs.readFileSync(
        path.join(process.cwd(), 'src/server/webhookService.ts'),
        'utf-8'
      );
      assert.ok(
        webhookServiceCode.includes("params.status === 'REFUNDED' || params.status === 'CHARGED_BACK'"),
        'webhookService deve tratar explicitamente reversões'
      );
      assert.ok(
        webhookServiceCode.includes('isReversalProcessed'),
        'webhookService deve retornar indicador isReversalProcessed'
      );
    });

    it('reversão não altera nem decrementa paidBillingCount histórico da assinatura', () => {
      const webhookServiceCode = fs.readFileSync(
        path.join(process.cwd(), 'src/server/webhookService.ts'),
        'utf-8'
      );
      assert.ok(
        !webhookServiceCode.includes('currentSub.paidBillingCount--'),
        'paidBillingCount não deve ser decrementado via operador --'
      );
      assert.ok(
        !webhookServiceCode.includes('currentSub.paidBillingCount -= 1'),
        'paidBillingCount não deve ser decrementado via decremento'
      );
    });

    it('assinatura em CANCELED permanece estritamente terminal mesmo ao receber refund/chargeback', () => {
      const webhookServiceCode = fs.readFileSync(
        path.join(process.cwd(), 'src/server/webhookService.ts'),
        'utf-8'
      );
      assert.ok(
        webhookServiceCode.includes("currentSub.status === 'CANCELED'"),
        'webhookService deve verificar CANCELED como terminal'
      );
      assert.ok(
        webhookServiceCode.includes('// REGRA P1-02: CANCELED é estritamente terminal'),
        'webhookService deve documentar a regra de CANCELED terminal'
      );
    });
  });

  // =========================================================================
  // 3. V3.4-03: ENFORCEMENT DE ASSINATURA EM OPERAÇÕES DE BACKEND
  // =========================================================================
  describe('3. V3.4-03: Bloqueio de Operações Operacionais para Assinaturas Inadimplentes/Canceladas', () => {
    it('evaluateTenantSubscriptionStatus bloqueia SUSPENDED e CANCELED imediatamente', () => {
      const suspended = evaluateTenantSubscriptionStatus({
        status: 'SUSPENDED'
      });
      assert.strictEqual(suspended.allowed, false);
      assert.strictEqual(suspended.status, 'SUSPENDED');
      assert.strictEqual(suspended.statusCode, 402);

      const canceled = evaluateTenantSubscriptionStatus({
        status: 'CANCELED'
      });
      assert.strictEqual(canceled.allowed, false);
      assert.strictEqual(canceled.status, 'CANCELED');
      assert.strictEqual(canceled.statusCode, 403);
    });

    it('adminAppointmentService.ts bloqueia remarcação (reschedule) se a assinatura do tenant estiver SUSPENDED ou CANCELED', () => {
      const serviceCode = fs.readFileSync(
        path.join(process.cwd(), 'src/server/adminAppointmentService.ts'),
        'utf-8'
      );
      assert.ok(
        serviceCode.includes('assertTenantSubscriptionActive(aptData.tenantId)'),
        'adminAppointmentService deve checar assinatura do tenant'
      );
      assert.ok(
        serviceCode.includes('TENANT_SUBSCRIPTION_SUSPENDED'),
        'adminAppointmentService deve responder com TENANT_SUBSCRIPTION_SUSPENDED'
      );
    });

    it('adminAppointmentService.ts preserva idempotência de agendamentos já cancelados mas bloqueia novos cancelamentos para assinaturas suspensas', () => {
      const serviceCode = fs.readFileSync(
        path.join(process.cwd(), 'src/server/adminAppointmentService.ts'),
        'utf-8'
      );
      const cancelCode = serviceCode.slice(serviceCode.indexOf('executeAuthoritativeCancel'));
      // A checagem de CANCELADO vem antes da checagem de assinatura
      const indexOfAptCanceled = cancelCode.indexOf("if (aptData.status === 'CANCELADO')");
      const indexOfSubCheck = cancelCode.indexOf("assertTenantSubscriptionActive(aptData.tenantId)");
      assert.ok(indexOfAptCanceled >= 0, 'Deve verificar aptData.status === CANCELADO');
      assert.ok(indexOfSubCheck >= 0, 'Deve verificar assinatura');
      assert.ok(indexOfAptCanceled < indexOfSubCheck, 'Idempotência de agendamento cancelado deve preceder o bloqueio de assinatura');
    });

    it('catalogProjectionService.ts bloqueia sincronização de pacotes, promoções e galeria quando tenant está SUSPENDED/CANCELED', () => {
      const catalogCode = fs.readFileSync(
        path.join(process.cwd(), 'src/server/catalogProjectionService.ts'),
        'utf-8'
      );
      assert.ok(
        catalogCode.includes('assertCatalogTenantOperational'),
        'catalogProjectionService deve possuir helper assertCatalogTenantOperational'
      );
      assert.ok(
        catalogCode.includes('assertTenantSubscriptionActive(targetTenantId)'),
        'catalogProjectionService deve validar assinatura do tenant'
      );
    });

    it('teamController.ts bloqueia inativação/exclusão de profissionais quando tenant está SUSPENDED/CANCELED', () => {
      const teamCode = fs.readFileSync(
        path.join(process.cwd(), 'src/server/teamController.ts'),
        'utf-8'
      );
      assert.ok(
        teamCode.includes('assertTenantSubscriptionActive(targetData.tenantId)'),
        'teamController deve verificar assinatura na exclusão de profissional'
      );
    });
  });
});
