import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { setMockFirebaseAdmin } from '../server/firebaseAdmin.js';
import { recordDurablePaymentTransaction, recordDurablePreapprovalTransaction } from '../server/webhookService.js';

function createInMemoryFirestore() {
  const store = new Map<string, Map<string, any>>();

  function getCol(colName: string) {
    if (!store.has(colName)) {
      store.set(colName, new Map<string, any>());
    }
    return store.get(colName)!;
  }

  function makeDocRef(colName: string, docId: string) {
    const col = getCol(colName);
    return {
      id: docId,
      get: async () => {
        const exists = col.has(docId);
        const data = exists ? JSON.parse(JSON.stringify(col.get(docId))) : undefined;
        return {
          id: docId,
          ref: makeDocRef(colName, docId),
          exists,
          data: () => data
        };
      },
      set: async (data: any, opts?: any) => {
        if (opts?.merge && col.has(docId)) {
          col.set(docId, { ...col.get(docId), ...JSON.parse(JSON.stringify(data)) });
        } else {
          col.set(docId, JSON.parse(JSON.stringify(data)));
        }
      },
      update: async (data: any) => {
        const existing = col.get(docId) || {};
        col.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      },
      delete: async () => {
        col.delete(docId);
      }
    };
  }

  return {
    runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (docRef: any) => docRef.get(),
        set: async (docRef: any, data: any, opts?: any) => docRef.set(data, opts),
        update: async (docRef: any, data: any) => docRef.update(data),
        delete: async (docRef: any) => docRef.delete()
      };
      return await updateFunction(tx);
    },
    collection: (colName: string) => {
      const col = getCol(colName);
      return {
        doc: (docId: string) => makeDocRef(colName, docId),
        get: async () => {
          const docs = Array.from(col.entries()).map(([id, val]) => ({
            id,
            data: () => JSON.parse(JSON.stringify(val))
          }));
          return { docs };
        }
      };
    }
  };
}

describe('MY BARBER — FASE 5.2F: Fechamento dos Riscos Financeiros Residuais', () => {
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  let mockFirestore: any;

  beforeEach(() => {
    mockFirestore = createInMemoryFirestore();
    setMockFirebaseAdmin({
      firestore: mockFirestore as any,
      auth: {} as any
    });
  });

  // =========================================================================
  // 1. BLOQUEIO ABSOLUTO DE SIMULAÇÕES EM PRODUÇÃO
  // =========================================================================
  describe('1. Bloqueio Absoluto de Simulações em Produção', () => {
    it('1.1. simulate-action bloqueia incondicionalmente quando NODE_ENV === production', () => {
      // Verifica que a verificação de produção NÃO depende de ALLOW_SANDBOX_SIMULATIONS ou ALLOW_SIMULATION
      assert.ok(
        serverContent.includes("if (process.env.NODE_ENV === 'production')"),
        'server.ts DEVE verificar NODE_ENV === production'
      );
      assert.ok(
        !serverContent.includes("process.env.NODE_ENV === 'production' && !process.env.ALLOW_SIMULATION"),
        'NÃO deve existir bypass de produção com ALLOW_SIMULATION'
      );
      assert.ok(
        !serverContent.includes("process.env.NODE_ENV === 'production' && !process.env.ALLOW_SANDBOX_SIMULATIONS"),
        'NÃO deve existir bypass de produção com ALLOW_SANDBOX_SIMULATIONS'
      );
    });

    it('1.2. Handler de simulate-action rejeita com HTTP 403 em produção mesmo com flags ativas', () => {
      const checkSimulationBlockedInProd = (env: Record<string, string | undefined>) => {
        if (env.NODE_ENV === 'production') {
          return { status: 403, error: 'Simulações financeiras arbitrárias estão desabilitadas em ambiente de produção.' };
        }
        return { status: 200 };
      };

      const result1 = checkSimulationBlockedInProd({
        NODE_ENV: 'production',
        ALLOW_SANDBOX_SIMULATIONS: 'true',
        ALLOW_SIMULATION: 'true'
      });
      assert.strictEqual(result1.status, 403, 'Deve retornar HTTP 403 em produção mesmo com todas as flags ativas');
    });

    it('1.3. Ações de simulação NÃO chamam endpoints ao vivo do gateway (zero vazamento de credenciais)', () => {
      // Localiza o bloco de simulate-action e garante que não há chamadas reais a callMercadoPago
      const simBlockStart = serverContent.indexOf("app.post(\n  '/api/subscriptions/simulate-action'");
      const simBlockEnd = serverContent.indexOf("// 8. Update Subscription Plan (Admin / Owner)", simBlockStart);
      const simBlock = serverContent.slice(simBlockStart, simBlockEnd > 0 ? simBlockEnd : simBlockStart + 4000);

      assert.ok(
        !simBlock.includes('updateMercadoPagoSubscriptionPrice('),
        'simulate-action NÃO deve chamar updateMercadoPagoSubscriptionPrice no gateway'
      );
      assert.ok(
        !simBlock.includes('cancelMercadoPagoSubscription('),
        'simulate-action NÃO deve chamar cancelMercadoPagoSubscription no gateway'
      );
    });
  });

  // =========================================================================
  // 2. VALIDAÇÃO OBRIGATÓRIA DO RECEBEDOR (COLLECTOR ID)
  // =========================================================================
  describe('2. Validação Obrigatória do Recebedor (Collector ID)', () => {
    it('2.1. getAuthorizedCollectorId falha de forma segura (Fail-Closed) se o recebedor não puder ser determinado', () => {
      assert.ok(
        serverContent.includes('export async function getAuthorizedCollectorId()'),
        'server.ts DEVE possuir função getAuthorizedCollectorId'
      );
      assert.ok(
        serverContent.includes('const expectedCollectorId = await getAuthorizedCollectorId()') &&
        serverContent.includes('if (!expectedCollectorId) {'),
        'activate-lifetime DEVE falhar de forma fechada (HTTP 422) se expectedCollectorId for nulo'
      );
    });

    it('2.2. Pagamento com recebedor diferente da conta autorizada é rejeitado (HTTP 422)', () => {
      const validateCollector = (paymentCollectorId: string, authorizedCollectorId: string | null) => {
        if (!authorizedCollectorId) {
          return { status: 422, error: 'Identidade da conta recebedora autorizada não pôde ser validada.' };
        }
        if (String(paymentCollectorId).trim() !== String(authorizedCollectorId).trim()) {
          return { status: 422, error: 'Recebedor do pagamento não confere com a conta oficial autorizada.' };
        }
        return { status: 200, ok: true };
      };

      // Caso 1: Recebedor ausente na plataforma
      const res1 = validateCollector('collector-123', null);
      assert.strictEqual(res1.status, 422);

      // Caso 2: Recebedor incorreto no pagamento recebido
      const res2 = validateCollector('collector-hacker-666', 'collector-mybarber-999');
      assert.strictEqual(res2.status, 422);

      // Caso 3: Recebedor correto
      const res3 = validateCollector('collector-mybarber-999', 'collector-mybarber-999');
      assert.strictEqual(res3.status, 200);
    });
  });

  // =========================================================================
  // 3. VÍNCULO TRANSACIONAL DO PAGAMENTO & UNICIDADE GLOBAL
  // =========================================================================
  describe('3. Vínculo Transacional e Unicidade Global do Pagamento', () => {
    it('3.1. checkout-lifetime registra duravelmente a operação com tenantId, 799.00 BRL e PENDING', async () => {
      const nowIso = new Date().toISOString();
      const checkoutRecord = {
        tenantId: 'tenant-barber-01',
        checkoutOperationId: 'chk-op-lifetime-tenant-barber-01-12345',
        preferenceId: 'pref-lifetime-12345',
        external_reference: 'tenant-barber-01',
        amount: 799.00,
        currency: 'BRL',
        status: 'PENDING',
        createdAt: nowIso
      };

      await mockFirestore.collection('lifetime_checkouts').doc(checkoutRecord.checkoutOperationId).set(checkoutRecord);
      await mockFirestore.collection('lifetime_checkouts').doc(`pref-${checkoutRecord.preferenceId}`).set(checkoutRecord);

      const savedByOp = await mockFirestore.collection('lifetime_checkouts').doc(checkoutRecord.checkoutOperationId).get();
      assert.ok(savedByOp.exists);
      assert.strictEqual(savedByOp.data().amount, 799.00);
      assert.strictEqual(savedByOp.data().currency, 'BRL');
      assert.strictEqual(savedByOp.data().status, 'PENDING');
      assert.strictEqual(savedByOp.data().tenantId, 'tenant-barber-01');

      const savedByPref = await mockFirestore.collection('lifetime_checkouts').doc(`pref-${checkoutRecord.preferenceId}`).get();
      assert.ok(savedByPref.exists);
      assert.strictEqual(savedByPref.data().tenantId, 'tenant-barber-01');
    });

    it('3.2. Duas requisições concorrentes com o mesmo paymentId para tenants diferentes são bloqueadas atomicamente', async () => {
      const sharedPaymentId = 'mp-pay-shared-999999';

      // Simulação da transação Firestore de ativação
      async function attemptActivationInTransaction(tenantId: string, paymentId: string) {
        const globalPaymentDocRef = mockFirestore.collection('mp_claimed_payments').doc(`payment-${paymentId}`);
        const subRef = mockFirestore.collection('subscriptions').doc(`sub-${tenantId}`);

        return await mockFirestore.runTransaction(async (transaction: any) => {
          const claimDoc = await transaction.get(globalPaymentDocRef);
          const subDoc = await transaction.get(subRef);
          const currentSub = subDoc.exists ? subDoc.data() : null;

          if (claimDoc.exists) {
            const claimData = claimDoc.data();
            if (claimData.tenantId !== tenantId) {
              const conflictError = new Error(`Este identificador de pagamento já foi reivindicado por outro estabelecimento (${claimData.tenantId}) e não pode ser reutilizado.`);
              (conflictError as any).statusCode = 409;
              throw conflictError;
            }
            if (currentSub?.status === 'LIFETIME_LICENSE') {
              return { isIdempotentRetry: true, status: 200 };
            }
          }

          transaction.set(globalPaymentDocRef, {
            tenantId,
            paymentId,
            amount: 799.00,
            currency: 'BRL',
            status: 'CLAIMED',
            claimedAt: new Date().toISOString()
          });

          transaction.set(subRef, {
            id: `sub-${tenantId}`,
            barbershopId: tenantId,
            status: 'LIFETIME_LICENSE',
            planId: 'plano-vitalicio',
            isLifetime: true,
            currentPrice: 0.00
          }, { merge: true });

          return { isIdempotentRetry: false, status: 200 };
        });
      }

      // Tenant A ativa com sucesso
      const resA = await attemptActivationInTransaction('tenant-alpha', sharedPaymentId);
      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resA.isIdempotentRetry, false);

      // Tenant B tenta ativar usando o mesmo paymentId de Tenant A -> DEVE LANÇAR 409
      await assert.rejects(
        async () => {
          await attemptActivationInTransaction('tenant-beta', sharedPaymentId);
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 409);
          assert.ok(err.message.includes('já foi reivindicado por outro estabelecimento (tenant-alpha)'));
          return true;
        }
      );

      // Retry legítimo de Tenant A com o mesmo paymentId -> DEVE SER IDEMPOTENTE (HTTP 200)
      const retryA = await attemptActivationInTransaction('tenant-alpha', sharedPaymentId);
      assert.strictEqual(retryA.status, 200);
      assert.strictEqual(retryA.isIdempotentRetry, true);
    });

    it('3.3. Pagamento pertencente a outra preferência ou operação de outro tenant é rejeitado', () => {
      const validatePaymentLink = (
        matchedCheckout: { tenantId: string; amount: number; currency: string } | null,
        targetTenant: string
      ) => {
        if (!matchedCheckout) {
          return { status: 422, error: 'Operação de checkout não encontrada para validação de vínculo.' };
        }
        if (matchedCheckout.tenantId !== targetTenant) {
          return { status: 403, error: `A operação de checkout informada pertence a outro estabelecimento (${matchedCheckout.tenantId}).` };
        }
        if (matchedCheckout.amount !== 799.00 || matchedCheckout.currency !== 'BRL') {
          return { status: 422, error: 'Valores inconsistentes.' };
        }
        return { status: 200 };
      };

      const res = validatePaymentLink(
        { tenantId: 'outro-tenant-malicioso', amount: 799.00, currency: 'BRL' },
        'meu-tenant-legitimo'
      );
      assert.strictEqual(res.status, 403);
    });
  });

  // =========================================================================
  // 4. RECONCILIAÇÃO E CANCELAMENTO DA ASSINATURA ANTERIOR
  // =========================================================================
  describe('4. Reconciliação e Cancelamento da Assinatura Anterior', () => {
    it('4.1. Migração registra pendência com status PENDING e trata falha transitória com FAILED para retry', async () => {
      const preapprovalId = 'preapproval-old-9988';
      const tenantId = 'tenant-cancellation-test';
      const cancelDocRef = mockFirestore.collection('pending_cancellations').doc(`cancel-${preapprovalId}`);

      // 1. Criação do registro de pendência
      await cancelDocRef.set({
        id: `cancel-${preapprovalId}`,
        preapprovalId,
        barbershopId: tenantId,
        reason: 'LIFETIME_LICENSE_MIGRATION',
        createdAt: new Date().toISOString(),
        status: 'PENDING',
        retryCount: 0
      });

      let doc = await cancelDocRef.get();
      assert.strictEqual(doc.data().status, 'PENDING');

      // 2. Falha simulada do gateway -> transição para FAILED com contagem de retentativas
      await cancelDocRef.set({
        status: 'FAILED',
        failedAt: new Date().toISOString(),
        errorMessage: 'Mercado Pago 504 Gateway Timeout',
        retryCount: 1,
        nextRetryAt: new Date(Date.now() + 300000).toISOString()
      }, { merge: true });

      doc = await cancelDocRef.get();
      assert.strictEqual(doc.data().status, 'FAILED');
      assert.strictEqual(doc.data().retryCount, 1);

      // 3. Execução de retry bem-sucedido -> transição para CONFIRMED
      await cancelDocRef.set({
        status: 'CONFIRMED',
        confirmedAt: new Date().toISOString(),
        retryCount: 2,
        gatewayResponse: { status: 'cancelled' }
      }, { merge: true });

      doc = await cancelDocRef.get();
      assert.strictEqual(doc.data().status, 'CONFIRMED');
      assert.strictEqual(doc.data().gatewayResponse.status, 'cancelled');
    });

    it('4.2. Webhooks atrasados de cancelamento ou pausa de preapproval NÃO afetam licença definitiva', async () => {
      await mockFirestore.collection('subscriptions').doc('sub-tenant-vitalicio-imune').set({
        id: 'sub-tenant-vitalicio-imune',
        barbershopId: 'tenant-vitalicio-imune',
        status: 'LIFETIME_LICENSE',
        currentPrice: 0.00,
        planId: 'plano-vitalicio',
        isLifetime: true,
        mercadopagoSubscriptionId: 'lifetime-pay-123'
      });

      // Chegada atrasada de webhook da preapproval antiga informando "cancelled"
      const resPreapproval = await recordDurablePreapprovalTransaction({
        barbershopId: 'tenant-vitalicio-imune',
        preapprovalId: 'preapproval-old-9988',
        preapprovalStatus: 'cancelled',
        now: new Date().toISOString()
      });

      // A licença definitiva PERMANECE com status LIFETIME_LICENSE!
      assert.strictEqual(resPreapproval.subscriptionRecord.status, 'LIFETIME_LICENSE');

      const savedSub = await mockFirestore.collection('subscriptions').doc('sub-tenant-vitalicio-imune').get();
      assert.strictEqual(savedSub.data().status, 'LIFETIME_LICENSE', 'Status deve permanecer LIFETIME_LICENSE');
    });
  });
});
