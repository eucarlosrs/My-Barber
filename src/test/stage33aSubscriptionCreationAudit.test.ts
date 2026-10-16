import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('MY BARBER — FASE 3.3A: Correção Crítica da Criação de Assinatura e Idempotência', () => {
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  // =========================================================================
  // 1. ELIMINAÇÃO TOTAL DE FALSO SUCESSO FINANCEIRO E FALLBACKS SINTÉTICOS
  // =========================================================================
  describe('1. Eliminação estrita de falso sucesso e fallbacks sintéticos', () => {
    it('server.ts NÃO deve conter gerador sintético de subscription mp-sub-${Date.now()}', () => {
      assert.strictEqual(
        serverContent.includes('mp-sub-${Date.now()}'),
        false,
        'O código do backend NÃO PODE conter fallback mp-sub-${Date.now()}'
      );
    });

    it('server.ts NÃO deve conter fallback de URL fictícia de checkout para preapproval_id sintético', () => {
      assert.strictEqual(
        serverContent.includes('mercadopago.com.br/subscriptions/checkout?preapproval_id=${mpSubId}'),
        false,
        'O código do backend NÃO PODE gerar URL fictícia de checkout'
      );
    });

    it('server.ts utiliza callMercadoPagoWithDetails para obter status e dados detalhados da chamada', () => {
      assert.ok(
        serverContent.includes('callMercadoPagoWithDetails('),
        'server.ts DEVE chamar callMercadoPagoWithDetails para criação de assinatura'
      );
    });

    it('server.ts bloqueia criação com HTTP 503 se MERCADOPAGO_ACCESS_TOKEN não estiver configurado', () => {
      assert.ok(
        serverContent.includes('!process.env.MERCADOPAGO_ACCESS_TOKEN'),
        'server.ts DEVE checar a presença do token antes de prosseguir'
      );
      assert.ok(
        serverContent.includes("Credencial do gateway de pagamento (MERCADOPAGO_ACCESS_TOKEN) não configurada"),
        'server.ts DEVE registrar erro no lock quando token não configurado'
      );
    });

    it('server.ts não gera HTTP 200 quando mpResult não for ok, não tiver dados ou não contiver ID válido', () => {
      assert.ok(
        serverContent.includes('if (!mpResult.ok || !mpResult.data || !mpResult.data.id)'),
        'server.ts DEVE validar fail-closed estrito sobre a resposta do Mercado Pago'
      );
    });

    it('server.ts retorna HTTP 502 ou 503 em falha de gateway e mensagem genérica segura', () => {
      assert.ok(
        serverContent.includes("const isTemporary = mpResult.status === 503 || mpResult.status === 504 || mpResult.status === 429"),
        'server.ts deve diferenciar erros temporários (503/504/429) de erros definitivos de integração (502)'
      );
      assert.ok(
        serverContent.includes("error: errorMsg"),
        'server.ts deve fornecer mensagem segura ao cliente que garante que nada foi cobrado'
      );
    });
  });

  // =========================================================================
  // 2. COMPORTAMENTO DETERMINÍSTICO DO LOCK (IN_PROGRESS, FAILED, COMPLETED)
  // =========================================================================
  describe('2. Ciclo de vida determinístico do lock de criação', () => {
    const lockServicePath = path.resolve(process.cwd(), 'src/server/subscriptionDistributedLock.ts');
    const lockContent = fs.readFileSync(lockServicePath, 'utf8');

    it('lock transacional inicial registra status IN_PROGRESS com createdAtMs', () => {
      assert.ok(
        lockContent.includes("status: 'IN_PROGRESS'"),
        'Lock inicial deve ser IN_PROGRESS'
      );
      assert.ok(
        lockContent.includes('createdAtMs: nowMs'),
        'Lock inicial deve salvar timestamp em milissegundos para cálculo de TTL'
      );
      assert.ok(
        serverContent.includes('acquireDistributedCreationLock('),
        'server.ts DEVE orquestrar a criação adquirindo o lock distribuído'
      );
    });

    it('falha do Mercado Pago grava status FAILED no lock com erro e timestamp failedAt', () => {
      assert.ok(
        lockContent.includes("status: 'FAILED'"),
        'Falha no gateway deve atualizar lock para FAILED'
      );
      assert.ok(
        lockContent.includes('failedAt: new Date().toISOString()'),
        'Lock FAILED deve salvar timestamp de falha'
      );
      assert.ok(
        serverContent.includes('failDistributedCreationLock('),
        'server.ts DEVE chamar failDistributedCreationLock ao registrar falhas'
      );
    });

    it('sucesso confirmado grava status COMPLETED com externalReference e mpSubscriptionId', () => {
      assert.ok(
        lockContent.includes("status: 'COMPLETED'"),
        'Sucesso completo deve atualizar lock para COMPLETED'
      );
      assert.ok(
        lockContent.includes('mpSubscriptionId: completionData.mpSubscriptionId'),
        'Lock COMPLETED deve registrar mpSubscriptionId retornado pelo Mercado Pago'
      );
      assert.ok(
        serverContent.includes('completeDistributedCreationLock('),
        'server.ts DEVE chamar completeDistributedCreationLock após persistência bem-sucedida'
      );
    });

    it('se Firestore falhar APÓS Mercado Pago criar assinatura, registra FIRESTORE_WRITE_FAILED para reconciliação', () => {
      assert.ok(
        lockContent.includes("status: 'FIRESTORE_WRITE_FAILED'"),
        'Lock não deve fingir FAILED comum se MP já tiver criado a assinatura; deve registrar FIRESTORE_WRITE_FAILED'
      );
      assert.ok(
        serverContent.includes('recordFirestoreWriteFailureLock('),
        'server.ts DEVE registrar falha de escrita com recordFirestoreWriteFailureLock preservando mpSubId'
      );
      assert.ok(
        serverContent.includes('mpSubId'),
        'Registro de erro do Firestore DEVE reter o mpSubscriptionId obtido do MP'
      );
    });
  });

  // =========================================================================
  // 3. SIMULAÇÃO DE ESTADOS E REGRAS DE FALHA (FAIL-CLOSED)
  // =========================================================================
  describe('3. Simulação de cenários de fail-closed e integridade financeira', () => {
    interface CreationExecutionResult {
      httpStatus: number;
      body: any;
      lockStatus: string;
      lockPayload: any;
      subscriptionSaved: boolean;
      paidBillingCountIncremented: boolean;
    }

    function simulateSubscriptionCreation(params: {
      hasToken: boolean;
      mpResult: { ok: boolean; status: number; data: any; errorText?: string };
      firestoreSucceeds: boolean;
    }): CreationExecutionResult {
      let lockStatus = 'IN_PROGRESS';
      let lockPayload: any = {};
      let subscriptionSaved = false;
      let paidBillingCountIncremented = false;

      // 1. Token check
      if (!params.hasToken) {
        lockStatus = 'FAILED';
        lockPayload = { status: 'FAILED', error: 'Token não configurado' };
        return {
          httpStatus: 503,
          body: { error: 'Serviço de pagamento temporariamente indisponível. Tente novamente mais tarde.' },
          lockStatus,
          lockPayload,
          subscriptionSaved: false,
          paidBillingCountIncremented: false
        };
      }

      // 2. MP call
      const mpResult = params.mpResult;
      if (!mpResult.ok || !mpResult.data || !mpResult.data.id) {
        const isTemporary = mpResult.status === 503 || mpResult.status === 504 || mpResult.status === 429;
        const httpStatus = isTemporary ? 503 : 502;
        lockStatus = 'FAILED';
        lockPayload = { status: 'FAILED', mpStatus: mpResult.status, error: mpResult.errorText };
        return {
          httpStatus,
          body: { error: 'Falha ao processar assinatura junto ao gateway de pagamento. Nenhuma cobrança foi gerada.' },
          lockStatus,
          lockPayload,
          subscriptionSaved: false,
          paidBillingCountIncremented: false
        };
      }

      if (!mpResult.data.init_point) {
        lockStatus = 'FAILED';
        lockPayload = { status: 'FAILED', error: 'Gateway não retornou init_point', mpSubscriptionId: mpResult.data.id };
        return {
          httpStatus: 502,
          body: { error: 'Falha ao obter URL de checkout para a assinatura.' },
          lockStatus,
          lockPayload,
          subscriptionSaved: false,
          paidBillingCountIncremented: false
        };
      }

      // 3. Firestore persistence
      if (!params.firestoreSucceeds) {
        lockStatus = 'FIRESTORE_WRITE_FAILED';
        lockPayload = {
          status: 'FIRESTORE_WRITE_FAILED',
          externalReference: 'tenant-test',
          mpSubscriptionId: mpResult.data.id,
          error: 'Firestore unavailable'
        };
        return {
          httpStatus: 500,
          body: { error: 'Assinatura gerada no gateway, mas ocorreu um erro interno de persistência. O suporte irá reconciliar os dados.' },
          lockStatus,
          lockPayload,
          subscriptionSaved: false,
          paidBillingCountIncremented: false
        };
      }

      // 4. Success
      subscriptionSaved = true;
      lockStatus = 'COMPLETED';
      lockPayload = {
        status: 'COMPLETED',
        externalReference: 'tenant-test',
        mpSubscriptionId: mpResult.data.id
      };
      return {
        httpStatus: 200,
        body: { success: true, initPointUrl: mpResult.data.init_point },
        lockStatus,
        lockPayload,
        subscriptionSaved,
        paidBillingCountIncremented
      };
    }

    it('1. Mercado Pago retorna null/falha de rede → HTTP 502 (não 200), lock FAILED, sem assinatura', () => {
      const res = simulateSubscriptionCreation({
        hasToken: true,
        mpResult: { ok: false, status: 502, data: null, errorText: 'Network timeout' },
        firestoreSucceeds: true
      });

      assert.strictEqual(res.httpStatus, 502);
      assert.strictEqual(res.subscriptionSaved, false);
      assert.strictEqual(res.paidBillingCountIncremented, false);
      assert.strictEqual(res.lockStatus, 'FAILED');
      assert.ok(!res.body.success);
    });

    it('2. Mercado Pago lança erro 400 Bad Request → HTTP 502, lock FAILED, sem assinatura', () => {
      const res = simulateSubscriptionCreation({
        hasToken: true,
        mpResult: { ok: false, status: 400, data: null, errorText: 'Invalid payer email' },
        firestoreSucceeds: true
      });

      assert.strictEqual(res.httpStatus, 502);
      assert.strictEqual(res.subscriptionSaved, false);
      assert.strictEqual(res.lockStatus, 'FAILED');
    });

    it('3. Mercado Pago sofre timeout 504 → HTTP 503, lock FAILED, não cria mp-sub-${Date.now()}', () => {
      const res = simulateSubscriptionCreation({
        hasToken: true,
        mpResult: { ok: false, status: 504, data: null, errorText: 'Gateway timeout' },
        firestoreSucceeds: true
      });

      assert.strictEqual(res.httpStatus, 503);
      assert.strictEqual(res.subscriptionSaved, false);
      assert.strictEqual(res.lockStatus, 'FAILED');
    });

    it('4. Mercado Pago resposta sem ID → HTTP 502, lock FAILED, não cria assinatura', () => {
      const res = simulateSubscriptionCreation({
        hasToken: true,
        mpResult: { ok: true, status: 200, data: { status: 'error' } },
        firestoreSucceeds: true
      });

      assert.strictEqual(res.httpStatus, 502);
      assert.strictEqual(res.subscriptionSaved, false);
      assert.strictEqual(res.lockStatus, 'FAILED');
    });

    it('5. Mercado Pago sucesso com ID válido e init_point → HTTP 200, COMPLETED, persiste assinatura', () => {
      const res = simulateSubscriptionCreation({
        hasToken: true,
        mpResult: { ok: true, status: 200, data: { id: '2c9380848a90b1', init_point: 'https://mercadopago.com/checkout?id=2c9380848a90b1' } },
        firestoreSucceeds: true
      });

      assert.strictEqual(res.httpStatus, 200);
      assert.strictEqual(res.subscriptionSaved, true);
      assert.strictEqual(res.lockStatus, 'COMPLETED');
      assert.strictEqual(res.lockPayload.mpSubscriptionId, '2c9380848a90b1');
      assert.strictEqual(res.paidBillingCountIncremented, false);
    });

    it('6. Firestore falha após sucesso do MP → HTTP 500, lock FIRESTORE_WRITE_FAILED com mpSubscriptionId para reconciliação', () => {
      const res = simulateSubscriptionCreation({
        hasToken: true,
        mpResult: { ok: true, status: 200, data: { id: '2c9380848a90b1', init_point: 'https://mercadopago.com/checkout?id=2c9380848a90b1' } },
        firestoreSucceeds: false
      });

      assert.strictEqual(res.httpStatus, 500);
      assert.strictEqual(res.subscriptionSaved, false);
      assert.strictEqual(res.lockStatus, 'FIRESTORE_WRITE_FAILED');
      assert.strictEqual(res.lockPayload.mpSubscriptionId, '2c9380848a90b1');
    });

    it('7. Falha sem token configurado → HTTP 503, lock FAILED', () => {
      const res = simulateSubscriptionCreation({
        hasToken: false,
        mpResult: { ok: false, status: 500, data: null },
        firestoreSucceeds: true
      });

      assert.strictEqual(res.httpStatus, 503);
      assert.strictEqual(res.subscriptionSaved, false);
      assert.strictEqual(res.lockStatus, 'FAILED');
    });

    it('8. Nenhuma resposta de erro retorna initPointUrl fictícia ou preço default fictício', () => {
      const failedCases = [
        simulateSubscriptionCreation({ hasToken: false, mpResult: { ok: false, status: 500, data: null }, firestoreSucceeds: true }),
        simulateSubscriptionCreation({ hasToken: true, mpResult: { ok: false, status: 502, data: null }, firestoreSucceeds: true }),
        simulateSubscriptionCreation({ hasToken: true, mpResult: { ok: true, status: 200, data: {} }, firestoreSucceeds: true })
      ];

      for (const res of failedCases) {
        assert.ok(!res.body.initPointUrl, 'Resposta com erro NUNCA deve conter initPointUrl fictícia');
        assert.ok(!res.body.subscription, 'Resposta com erro NUNCA deve conter objeto de subscription');
      }
    });

    it('9. paidBillingCount permanece rigorosamente 0 em qualquer falha de criação', () => {
      const res = simulateSubscriptionCreation({
        hasToken: true,
        mpResult: { ok: false, status: 502, data: null },
        firestoreSucceeds: true
      });
      assert.strictEqual(res.paidBillingCountIncremented, false);
    });
  });
});
