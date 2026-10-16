import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  evaluatePreapprovalCandidate,
  evaluatePreapprovalCandidateWithDetail,
  searchPreapprovalsByTenant,
  executePreapprovalRecoveryCheck,
  isCreateAllowed,
  LocalCreationContext
} from '../server/subscriptionReconciliationService.js';

/**
 * MY BARBER — FASE 3.3D: AUDITORIA FINAL DE COMPLETUDE DA RECONCILIAÇÃO DE PREAPPROVALS
 * 
 * Classificação Explícita:
 * - UNIT/MOCK: Execução isolada com simulação determinística de rede e gateway.
 * - STATIC: Análise de invariantes de código e assinaturas de tipos.
 * - FIRESTORE EMULATOR: Não utilizado no ambiente local (declarado explicitamente).
 * - MERCADO PAGO REAL/CLOUD: Não utilizado (sem chamadas a ambiente externo de produção em testes automatizados).
 */

describe('MY BARBER — FASE 3.3D: Completude Exaustiva da Reconciliação', () => {
  const baseContext: LocalCreationContext = {
    barbershopId: 'tenant-audit-33d',
    payerEmail: 'dono.barbearia@teste.com',
    planId: 'plan-master',
    planName: 'Plano Master',
    expectedAmount: 149.90,
    currencyId: 'BRL',
    billingCycle: 'MONTHLY',
    frequency: 1,
    frequencyType: 'months',
    attemptTimestampMs: Date.now()
  };

  const createCandidate = (overrides: Record<string, any> = {}) => ({
    id: 'mp-33d-' + Math.random().toString(36).substring(2, 9),
    external_reference: 'tenant-audit-33d',
    payer_email: 'dono.barbearia@teste.com',
    status: 'pending',
    auto_recurring: {
      transaction_amount: 149.90,
      currency_id: 'BRL',
      frequency: 1,
      frequency_type: 'months'
    },
    init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=valid',
    date_created: new Date().toISOString(),
    ...overrides
  });

  // =========================================================================
  // CENÁRIOS 1 A 5: TOTAL > 1500, CANDIDATO ALÉM DO LIMITE E LIMITES DE PÁGINA
  // =========================================================================
  describe('1. Completude de Paginação e Limite Superior de Registros', () => {
    it('[UNIT/MOCK] 1. total > 1500 (ex: 1501): busca incompleta NÃO conclui NOT_FOUND e retorna SEARCH_INCOMPLETE / GATEWAY_ERROR', async () => {
      // Simula uma resposta do MP dizendo que há 3000 contratos, mas após 50 páginas (2500 itens) o loop de proteção interrompe
      const mockCallMp = async (endpoint: string) => {
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');
        return {
          ok: true,
          status: 200,
          data: {
            // Nenhum candidato encontrado nas páginas avaliadas
            results: [createCandidate({ id: `item-${offset}`, external_reference: 'other-shop' })],
            paging: { total: 3000, limit: 50, offset }
          }
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-audit-33d', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
      assert.strictEqual(res.statusCode, 502);
      assert.ok(res.error?.includes('SEARCH_INCOMPLETE'));
    });

    it('[UNIT/MOCK] 2. Candidato além do limite artificial não pode ser ignorado (não permite POST /preapproval)', async () => {
      const mockCallMp = async (endpoint: string) => {
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');
        return {
          ok: true,
          status: 200,
          data: {
            results: [createCandidate({ id: `item-${offset}`, external_reference: 'other-shop' })],
            paging: { total: 3500, limit: 50, offset }
          }
        };
      };

      const check = await executePreapprovalRecoveryCheck('tenant-audit-33d', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'GATEWAY_UNAVAILABLE');
      assert.strictEqual(isCreateAllowed(check), false, 'isCreateAllowed DEVE ser false se a busca foi incompleta');
    });

    it('[UNIT/MOCK] 3. Busca incompleta NUNCA retorna NOT_FOUND', async () => {
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          results: [],
          paging: { total: 500, limit: 50, offset: 0 }
        }
      });

      const res = await searchPreapprovalsByTenant('tenant-audit-33d', baseContext, mockCallMp);
      assert.notStrictEqual(res.status, 'NOT_FOUND', 'Não pode concluir NOT_FOUND se houver divergência no total');
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
    });

    it('[UNIT/MOCK] 4. Erro na página 50 aborta com GATEWAY_ERROR e não gera NOT_FOUND', async () => {
      let pagesServed = 0;
      const mockCallMp = async (endpoint: string) => {
        pagesServed++;
        if (pagesServed === 50) {
          return { ok: false, status: 500, data: null, errorText: 'Gateway Error at page 50' };
        }
        return {
          ok: true,
          status: 200,
          data: {
            results: [createCandidate({ external_reference: 'other' })],
            paging: { total: 2600, limit: 50, offset: (pagesServed - 1) * 50 }
          }
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-audit-33d', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
      assert.strictEqual(res.statusCode, 500);
    });

    it('[UNIT/MOCK] 5. Erro na página intermediária (51) aborta com GATEWAY_ERROR', async () => {
      const mockCallMp = async (endpoint: string) => {
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');
        if (offset >= 2500) {
          return { ok: false, status: 502, data: null, errorText: 'Bad Gateway beyond 2500' };
        }
        return {
          ok: true,
          status: 200,
          data: {
            results: [createCandidate({ external_reference: 'other' })],
            paging: { total: 3000, limit: 50, offset }
          }
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-audit-33d', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
    });
  });

  // =========================================================================
  // CENÁRIOS 6 A 8: INCONSISTÊNCIAS DE RESPOSTA DA API DO MERCADO PAGO
  // =========================================================================
  describe('2. Tolerância e Rejeição a Respostas Inconsistentes do Gateway', () => {
    it('[UNIT/MOCK] 6. total inconsistente (NaN / negativo) é rejeitado com GATEWAY_ERROR', async () => {
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          results: [],
          paging: { total: -10, limit: 50, offset: 0 }
        }
      });

      const res = await searchPreapprovalsByTenant('tenant-audit-33d', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
      assert.ok(res.error?.includes('GATEWAY_INCONSISTENCY'));
    });

    it('[UNIT/MOCK] 7. Registros duplicados na paginação não causam falsos positivos ou contagem dupla', async () => {
      const duplicateCandidate = createCandidate({ id: 'same-unique-sub' });
      let callCount = 0;
      const mockCallMp = async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          data: {
            results: [duplicateCandidate],
            paging: { total: 2, limit: 1, offset: callCount - 1 }
          }
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-audit-33d', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'RECOVERED');
      assert.strictEqual(res.candidate?.id, 'same-unique-sub');
    });

    it('[UNIT/MOCK] 8. results vazio antes de atingir total declarado aciona GATEWAY_ERROR', async () => {
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          results: [],
          paging: { total: 100, limit: 50, offset: 0 }
        }
      });

      const res = await searchPreapprovalsByTenant('tenant-audit-33d', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
      assert.ok(res.error?.includes('SEARCH_INCOMPLETE'));
    });
  });

  // =========================================================================
  // CENÁRIOS 9 A 12: STATUS DESCONHECIDOS, CONFLITOS E BLOQUEIO DE CRIAÇÃO
  // =========================================================================
  describe('3. Estados Desconhecidos e Bloqueio Mandatório de Conflito de Contratos', () => {
    it('[UNIT/MOCK] 9. Status não reconhecido (paused, unknown) retorna NEEDS_REVIEW e nunca NOT_FOUND', () => {
      const pausedCandidate = createCandidate({ status: 'paused' });
      const detailPaused = evaluatePreapprovalCandidateWithDetail(pausedCandidate, baseContext);
      assert.strictEqual(detailPaused.result, 'NEEDS_REVIEW');

      const unknownCandidate = createCandidate({ status: 'strange_status' });
      const detailUnknown = evaluatePreapprovalCandidateWithDetail(unknownCandidate, baseContext);
      assert.strictEqual(detailUnknown.result, 'NEEDS_REVIEW');
    });

    it('[UNIT/MOCK] 10. Candidato incompatível do próprio tenant (valor divergente em contrato ativo) BLOQUEIA novo POST', async () => {
      // O estabelecimento já possui um contrato 'pending' de R$ 999.00 no Mercado Pago
      const conflictingCandidate = createCandidate({
        id: 'mp-conflict-different-price',
        status: 'pending',
        auto_recurring: {
          transaction_amount: 999.00,
          currency_id: 'BRL',
          frequency: 1,
          frequency_type: 'months'
        }
      });

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          results: [conflictingCandidate],
          paging: { total: 1, limit: 50, offset: 0 }
        }
      });

      const check = await executePreapprovalRecoveryCheck('tenant-audit-33d', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'BLOCK_AMBIGUOUS', 'Contrato ativo com outro valor deve bloquear criação para evitar duas assinaturas concorrentes');
      assert.strictEqual(check.httpStatus, 409);
      assert.strictEqual(isCreateAllowed(check), false);
    });

    it('[UNIT/MOCK] 11. NEEDS_REVIEW bloqueia criação (isCreateAllowed === false)', async () => {
      const uncalibratedCandidate = createCandidate({
        status: 'pending',
        auto_recurring: { transaction_amount: null } // Valor inválido
      });

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          results: [uncalibratedCandidate],
          paging: { total: 1, limit: 50, offset: 0 }
        }
      });

      const check = await executePreapprovalRecoveryCheck('tenant-audit-33d', baseContext, null, mockCallMp);
      assert.strictEqual(isCreateAllowed(check), false);
      assert.strictEqual(check.operation, 'BLOCK_AMBIGUOUS');
    });

    it('[UNIT/MOCK] 12. Gateway timeout bloqueia criação com status GATEWAY_UNAVAILABLE', async () => {
      const mockCallMp = async () => ({
        ok: false,
        status: 504,
        data: null,
        errorText: 'Gateway Timeout'
      });

      const check = await executePreapprovalRecoveryCheck('tenant-audit-33d', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'GATEWAY_UNAVAILABLE');
      assert.strictEqual(check.httpStatus, 503);
      assert.strictEqual(isCreateAllowed(check), false);
    });
  });
});
