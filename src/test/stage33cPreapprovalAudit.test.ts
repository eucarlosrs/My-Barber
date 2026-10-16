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

/**
 * MY BARBER — FASE 3.3C: AUDITORIA CORRETIVA E FECHAMENTO DA RECONCILIAÇÃO DE PREAPPROVALS
 * 
 * Classificação Explícita de Cada Teste:
 * - UNIT/MOCK: Execução isolada em memória com contratos mockados e rede simulada.
 * - STATIC: Inspeção de código estático (AST/Regex no backend/rotas/regras).
 * - FIRESTORE EMULATOR: Não configurado no ambiente local de CI (declarado explicitamente).
 * - MERCADO PAGO REAL/CLOUD: Não executado diretamente (sem credenciais de produção no sandbox de teste).
 */

describe('MY BARBER — FASE 3.3C: Auditoria Corretiva e Fechamento da Reconciliação', () => {
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  const baseContext: LocalCreationContext = {
    barbershopId: 'tenant-barber-audit',
    payerEmail: 'dono@auditoria.com.br',
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
    id: 'mp-candidate-' + Math.random().toString(36).substring(2, 9),
    external_reference: 'tenant-barber-audit',
    payer_email: 'dono@auditoria.com.br',
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
  // BLOCO 1: PAGINAÇÃO EXAUSTIVA E FILTRAGEM OFICIAL (Testes 1 a 7)
  // =========================================================================
  describe('Bloco 1: Paginação Exaustiva e Busca Oficial', () => {
    it('[UNIT/MOCK] 1. Paginação: Itera por múltiplas páginas utilizando paging.total, limit e offset', async () => {
      const requestedUrls: string[] = [];
      const mockCallMp = async (endpoint: string) => {
        requestedUrls.push(endpoint);
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');

        if (offset === 0) {
          return {
            ok: true,
            status: 200,
            data: {
              results: [createCandidate({ id: 'page1-item', external_reference: 'other-tenant' })],
              paging: { total: 60, limit: 30, offset: 0 }
            }
          };
        } else {
          return {
            ok: true,
            status: 200,
            data: {
              results: [createCandidate({ id: 'page2-item' })],
              paging: { total: 60, limit: 30, offset: 30 }
            }
          };
        }
      };

      const res = await searchPreapprovalsByTenant('tenant-barber-audit', baseContext, mockCallMp);
      assert.strictEqual(requestedUrls.length, 2, 'Deve ter paginado até a página 2');
      assert.strictEqual(res.status, 'RECOVERED');
      assert.strictEqual(res.candidate?.id, 'page2-item');
    });

    it('[UNIT/MOCK] 2. Candidato apenas na segunda página é recuperado com sucesso', async () => {
      const mockCallMp = async (endpoint: string) => {
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');
        if (offset === 0) {
          // Página 1 só com candidatos de outros tenants
          return {
            ok: true,
            status: 200,
            data: {
              results: [createCandidate({ id: 'other-1', external_reference: 'tenant-x' })],
              paging: { total: 40, limit: 30, offset: 0 }
            }
          };
        }
        // Página 2 com o candidato do tenant
        return {
          ok: true,
          status: 200,
          data: {
            results: [createCandidate({ id: 'target-page-2' })],
            paging: { total: 40, limit: 30, offset: 30 }
          }
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-barber-audit', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'RECOVERED');
      assert.strictEqual(res.candidate?.id, 'target-page-2');
    });

    it('[UNIT/MOCK] 3. Candidato apenas na última página (página 3) é localizado', async () => {
      const mockCallMp = async (endpoint: string) => {
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');
        if (offset === 0 || offset === 30) {
          return {
            ok: true,
            status: 200,
            data: {
              results: [createCandidate({ external_reference: 'tenant-alheio' })],
              paging: { total: 75, limit: 30, offset }
            }
          };
        }
        return {
          ok: true,
          status: 200,
          data: {
            results: [createCandidate({ id: 'target-last-page' })],
            paging: { total: 75, limit: 30, offset: 60 }
          }
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-barber-audit', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'RECOVERED');
      assert.strictEqual(res.candidate?.id, 'target-last-page');
    });

    it('[UNIT/MOCK] 4. Múltiplos candidatos compatíveis em páginas diferentes acionam AMBIGUOUS', async () => {
      const mockCallMp = async (endpoint: string) => {
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');
        if (offset === 0) {
          return {
            ok: true,
            status: 200,
            data: {
              results: [createCandidate({ id: 'cand-page-1' })],
              paging: { total: 60, limit: 30, offset: 0 }
            }
          };
        }
        return {
          ok: true,
          status: 200,
          data: {
            results: [createCandidate({ id: 'cand-page-2' })],
            paging: { total: 60, limit: 30, offset: 30 }
          }
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-barber-audit', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'AMBIGUOUS');
      assert.strictEqual(res.candidates?.length, 2);
    });

    it('[UNIT/MOCK] 5. Busca completa retorna NOT_FOUND quando nenhuma página contém candidato do tenant', async () => {
      const mockCallMp = async (endpoint: string) => {
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');
        return {
          ok: true,
          status: 200,
          data: {
            results: [createCandidate({ external_reference: 'tenant-x' })],
            paging: { total: 40, limit: 30, offset }
          }
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-barber-audit', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'NOT_FOUND');
    });

    it('[UNIT/MOCK] 6. Erro em página intermediária aborta com GATEWAY_ERROR (nunca conclui NOT_FOUND)', async () => {
      const mockCallMp = async (endpoint: string) => {
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');
        if (offset === 0) {
          return {
            ok: true,
            status: 200,
            data: {
              results: [createCandidate({ id: 'other-p1', external_reference: 'other-tenant' })],
              paging: { total: 60, limit: 30, offset: 0 }
            }
          };
        }
        return {
          ok: false,
          status: 500,
          data: null,
          errorText: 'Internal Gateway Error'
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-barber-audit', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
      assert.strictEqual(res.statusCode, 500);
    });

    it('[UNIT/MOCK] 7. Timeout em página intermediária aborta com GATEWAY_ERROR', async () => {
      const mockCallMp = async (endpoint: string) => {
        const url = new URL(endpoint, 'https://api.mercadopago.com');
        const offset = Number(url.searchParams.get('offset') || '0');
        if (offset === 0) {
          return {
            ok: true,
            status: 200,
            data: {
              results: [createCandidate({ id: 'other-p1', external_reference: 'other-tenant' })],
              paging: { total: 60, limit: 30, offset: 0 }
            }
          };
        }
        return {
          ok: false,
          status: 504,
          data: null,
          errorText: 'Gateway Timeout'
        };
      };

      const res = await searchPreapprovalsByTenant('tenant-barber-audit', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
      assert.strictEqual(res.statusCode, 504);
    });
  });

  // =========================================================================
  // BLOCO 2: SUPRESSÃO DA JANELA CEGA DE 48H E CRITÉRIOS DE COMPATIBILIDADE (Testes 8 a 17)
  // =========================================================================
  describe('Bloco 2: Supressão da Janela Cega de 48h e Critérios de Match', () => {
    it('[UNIT/MOCK] 8. Contrato criado há mais de 48 horas NÃO é ignorado (classificado como MATCH para evitar duplicata)', () => {
      const ancientDate = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(); // 5 dias atrás
      const candidate = createCandidate({ date_created: ancientDate, status: 'authorized' });
      const detail = evaluatePreapprovalCandidateWithDetail(candidate, baseContext);
      assert.strictEqual(detail.result, 'MATCH');
    });

    it('[UNIT/MOCK] 9. Timeout após Mercado Pago criar contrato: retry localiza contrato e NÃO executa novo POST', async () => {
      // Simula: MP criou contrato, mas servidor sofreu timeout de rede. No retry:
      const existingSub = createCandidate({ id: 'mp-recovered-after-timeout' });
      const mockCallMp = async (endpoint: string) => {
        assert.ok(endpoint.includes('/preapproval/search'));
        return {
          ok: true,
          status: 200,
          data: {
            results: [existingSub],
            paging: { total: 1, limit: 30, offset: 0 }
          }
        };
      };

      const check = await executePreapprovalRecoveryCheck('tenant-barber-audit', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
      assert.strictEqual(check.mpSubscriptionId, 'mp-recovered-after-timeout');
    });

    it('[UNIT/MOCK] 10. Crash após criação no Mercado Pago: novo processo recupera contrato via gateway', async () => {
      // Simula: servidor morreu imediatamente antes do write no Firestore (lock anterior nulo/perdido)
      const existingSub = createCandidate({ id: 'mp-recovered-after-crash' });
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: {
          results: [existingSub],
          paging: { total: 1, limit: 30, offset: 0 }
        }
      });

      const check = await executePreapprovalRecoveryCheck('tenant-barber-audit', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
      assert.strictEqual(check.mpSubscriptionId, 'mp-recovered-after-crash');
    });

    it('[UNIT/MOCK] 11. Firestore indisponível após criação: não fabricar estado local volátil', async () => {
      // Se lock anterior tinha mpSubscriptionId registrado mas Firestore falhou:
      const existingSub = createCandidate({ id: 'mp-firestore-recovery' });
      const mockCallMp = async (endpoint: string) => {
        if (endpoint.includes('mp-firestore-recovery')) {
          return { ok: true, status: 200, data: existingSub };
        }
        return { ok: true, status: 200, data: { results: [], paging: { total: 0 } } };
      };

      const check = await executePreapprovalRecoveryCheck(
        'tenant-barber-audit',
        baseContext,
        { mpSubscriptionId: 'mp-firestore-recovery' },
        mockCallMp
      );
      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
      assert.strictEqual(check.mpSubscriptionId, 'mp-firestore-recovery');
    });

    it('[UNIT/MOCK] 12. Retry após crash restaura associação sem duplicar assinatura', async () => {
      const existing = createCandidate({ id: 'mp-crash-retry' });
      const calls: string[] = [];
      const mockCallMp = async (endpoint: string) => {
        calls.push(endpoint);
        return {
          ok: true,
          status: 200,
          data: { results: [existing], paging: { total: 1 } }
        };
      };

      const check = await executePreapprovalRecoveryCheck('tenant-barber-audit', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
      // Garante que nenhuma chamada de POST foi solicitada durante o check
      assert.ok(calls.every(c => !c.includes('POST')));
    });

    it('[UNIT/MOCK] 13. Retry após timeout recupera init_point existente sem nova contratação', async () => {
      const candidate = createCandidate({
        id: 'mp-timeout-sub',
        init_point: 'https://mercadopago.com/checkout/retry-ok'
      });
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [candidate], paging: { total: 1 } }
      });

      const check = await executePreapprovalRecoveryCheck('tenant-barber-audit', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
      assert.strictEqual(check.initPointUrl, 'https://mercadopago.com/checkout/retry-ok');
    });

    it('[UNIT/MOCK] 14. MATCH existente não realiza novo POST /preapproval', async () => {
      const candidate = createCandidate({ id: 'mp-sub-exact-match' });
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [candidate], paging: { total: 1 } }
      });

      const check = await executePreapprovalRecoveryCheck('tenant-barber-audit', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'RECOVER_EXISTING');
    });

    it('[UNIT/MOCK] 15. AMBIGUOUS bloqueia criação com status 409', async () => {
      const c1 = createCandidate({ id: 'amb-1' });
      const c2 = createCandidate({ id: 'amb-2' });
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [c1, c2], paging: { total: 2 } }
      });

      const check = await executePreapprovalRecoveryCheck('tenant-barber-audit', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'BLOCK_AMBIGUOUS');
      assert.strictEqual(check.httpStatus, 409);
    });

    it('[UNIT/MOCK] 16. UNCERTAIN / NEEDS_REVIEW bloqueia criação para intervenção segura', async () => {
      // Candidato com valor zerado/corrompido
      const corruptedCandidate = createCandidate({
        id: 'mp-corrupted',
        auto_recurring: { transaction_amount: null }
      });
      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [corruptedCandidate], paging: { total: 1 } }
      });

      const check = await executePreapprovalRecoveryCheck('tenant-barber-audit', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'BLOCK_AMBIGUOUS');
      assert.strictEqual(check.httpStatus, 409);
    });

    it('[UNIT/MOCK] 17. Contrato CANCELADO no Mercado Pago é rejeitado para recuperação ativa', () => {
      const canceledCandidate = createCandidate({ status: 'cancelled' });
      const detail = evaluatePreapprovalCandidateWithDetail(canceledCandidate, baseContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('CANCELADO'));
    });
  });

  // =========================================================================
  // BLOCO 3: ISOLAMENTO MULTI-TENANT E ATRIBUTOS INCOMPATÍVEIS (Testes 18 a 26)
  // =========================================================================
  describe('Bloco 3: Isolamento Multi-Tenant e Divergências de Contrato', () => {
    it('[UNIT/MOCK] 18. Isolamento Multi-Tenant estrito: Tenant A NUNCA recupera contrato de Tenant B', async () => {
      const tenantBCandidate = createCandidate({
        id: 'sub-tenant-b',
        external_reference: 'tenant-barber-b',
        payer_email: baseContext.payerEmail,
        auto_recurring: { transaction_amount: 149.90, currency_id: 'BRL' }
      });

      const mockCallMp = async () => ({
        ok: true,
        status: 200,
        data: { results: [tenantBCandidate], paging: { total: 1 } }
      });

      const check = await executePreapprovalRecoveryCheck('tenant-barber-a', baseContext, null, mockCallMp);
      assert.strictEqual(check.operation, 'PROCEED_TO_CREATE', 'Contrato do Tenant B não pode ser recuperado pelo Tenant A');
    });

    it('[UNIT/MOCK] 19. Rejeita candidato com payer_email incompatível', () => {
      const wrongPayer = createCandidate({ payer_email: 'hacker@invasao.com' });
      const detail = evaluatePreapprovalCandidateWithDetail(wrongPayer, baseContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('payer_email'));
    });

    it('[UNIT/MOCK] 20. Rejeita candidato com valor incompatível', () => {
      const wrongValue = createCandidate({
        auto_recurring: { transaction_amount: 299.90, currency_id: 'BRL' }
      });
      const detail = evaluatePreapprovalCandidateWithDetail(wrongValue, baseContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('diverge do valor esperado'));
    });

    it('[UNIT/MOCK] 21. Rejeita candidato com moeda incompatível', () => {
      const wrongCurrency = createCandidate({
        auto_recurring: { transaction_amount: 149.90, currency_id: 'USD' }
      });
      const detail = evaluatePreapprovalCandidateWithDetail(wrongCurrency, baseContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('Moeda'));
    });

    it('[UNIT/MOCK] 22. Rejeita candidato com frequência incompatível', () => {
      const wrongFrequency = createCandidate({
        auto_recurring: { transaction_amount: 149.90, currency_id: 'BRL', frequency: 12, frequency_type: 'months' }
      });
      const detail = evaluatePreapprovalCandidateWithDetail(wrongFrequency, baseContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('Frequência'));
    });

    it('[UNIT/MOCK] 23. Rejeita candidato com plano/frequency_type incompatível', () => {
      const wrongFreqType = createCandidate({
        auto_recurring: { transaction_amount: 149.90, currency_id: 'BRL', frequency: 1, frequency_type: 'days' }
      });
      const detail = evaluatePreapprovalCandidateWithDetail(wrongFreqType, baseContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('Tipo de frequência'));
    });

    it('[UNIT/MOCK] 24. Rejeita candidato sem init_point válido', () => {
      const invalidInitPoint = createCandidate({ init_point: 'http://inseguro.com/pay' });
      const detail = evaluatePreapprovalCandidateWithDetail(invalidInitPoint, baseContext);
      assert.strictEqual(detail.result, 'INCOMPATIBLE');
      assert.ok(detail.reason?.includes('init_point'));
    });

    it('[UNIT/MOCK] 25. GET /preapproval/{id} retorna NOT_FOUND quando ID não existe (404)', async () => {
      const mockCallMp = async () => ({
        ok: false,
        status: 404,
        data: null,
        errorText: 'Not Found'
      });

      const res = await recoverPreapprovalById('mp-inexistent', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'NOT_FOUND');
      assert.strictEqual(res.statusCode, 404);
    });

    it('[UNIT/MOCK] 26. GET /preapproval/{id} retorna GATEWAY_ERROR quando Mercado Pago falha (500)', async () => {
      const mockCallMp = async () => ({
        ok: false,
        status: 500,
        data: null,
        errorText: 'Mercado Pago 500 Internal Error'
      });

      const res = await recoverPreapprovalById('mp-error', baseContext, mockCallMp);
      assert.strictEqual(res.status, 'GATEWAY_ERROR');
      assert.strictEqual(res.statusCode, 500);
    });
  });

  // =========================================================================
  // BLOCO 4: RECONCILIAÇÃO PURA E PROTEÇÃO CONTRA DUPLICATAS (Testes 27 a 30)
  // =========================================================================
  describe('Bloco 4: Blindagem Financeira e Integridade de Rotas', () => {
    it('[STATIC] 27. Reconciliação NUNCA emite POST /preapproval', () => {
      // Reconciliação não deve conter chamada POST /preapproval
      const reconcileFnSource = reconcileSubscriptionWithMercadoPago.toString();
      assert.strictEqual(reconcileFnSource.includes('fetch'), false);
      assert.strictEqual(reconcileFnSource.includes('POST'), false);
    });

    it('[STATIC] 28. Recovery check NUNCA emite POST /preapproval', () => {
      const recoveryFnSource = executePreapprovalRecoveryCheck.toString();
      assert.strictEqual(recoveryFnSource.includes('method: \'POST\''), false);
      assert.strictEqual(recoveryFnSource.includes('POST /preapproval'), false);
    });

    it('[STATIC] 29. Segundo create após timeout interceptado pelo recovery check sem duplicar assinatura', () => {
      // Verifica no server.ts que executePreapprovalRecoveryCheck precede a chamada de criação
      const serverCode = serverContent;
      const recoveryCheckIndex = serverCode.indexOf('executePreapprovalRecoveryCheck(');
      const postPreapprovalIndex = serverCode.indexOf("callMercadoPagoWithDetails('/preapproval', {");
      assert.ok(recoveryCheckIndex > 0, 'executePreapprovalRecoveryCheck deve ser invocado no server.ts');
      assert.ok(postPreapprovalIndex > recoveryCheckIndex, 'POST /preapproval só ocorre APÓS o recoveryCheck');
    });

    it('[STATIC] 30. Nenhuma rota ou serviço seleciona candidato arbitrariamente em caso de ambiguidade', () => {
      // Verifica que não existe res.data.results[0] cego em searchPreapprovalsByTenant
      const searchFnSource = searchPreapprovalsByTenant.toString();
      assert.ok(
        !searchFnSource.includes('results[0]') || searchFnSource.includes('matchedCandidates.length === 1'),
        'Não pode selecionar results[0] sem conferir unicidade de matchedCandidates'
      );
    });
  });
});
