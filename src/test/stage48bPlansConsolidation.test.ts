import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('FASE 4.8B — Consolidação do Fluxo de Planos e Autoridade Única Backend', () => {
  const appContextPath = path.resolve('src/context/AppContext.tsx');
  const appContextContent = fs.readFileSync(appContextPath, 'utf-8');

  // =========================================================================
  // 1. BOOTSTRAP: ELIMINAÇÃO DO FETCH REDUNDANTE E PRESERVAÇÃO DO LISTENER
  // =========================================================================
  it('1.1. AppContext bootstrap mantém listener reativo Firestore subscribeCollection para planos', () => {
    assert.ok(
      appContextContent.includes("subscribeCollection<CustomPlan>('plans', setCustomPlans, INITIAL_CUSTOM_PLANS)"),
      'subscribeCollection de planos com INITIAL_CUSTOM_PLANS deve permanecer ativo no boot'
    );
  });

  it('1.2. AppContext bootstrap removeu completamente a chamada concorrente e redundante fetch("/api/plans")', () => {
    const effectMatch = appContextContent.match(
      /\/\/ Real-time Firestore synchronization for global catalogs \(SaaS Plans\)[\s\S]*?return \(\) => \{[\s\S]*?unsubPlans\(\);[\s\S]*?\};/
    );
    assert.ok(effectMatch, 'Deve existir o useEffect com o listener global de planos');
    const effectBody = effectMatch[0];

    assert.ok(
      !effectBody.includes("fetch('/api/plans')"),
      'O useEffect de bootstrap NÃO deve conter fetch("/api/plans")'
    );
    assert.ok(
      !effectBody.includes('fetch("/api/plans")'),
      'O useEffect de bootstrap NÃO deve conter fetch("/api/plans")'
    );
    assert.ok(
      effectBody.includes('unsubPlans()'),
      'O cleanup do listener unsubPlans() deve permanecer íntegro'
    );
  });

  // =========================================================================
  // 2. AUTORIDADE ÚNICA BACKEND & REMOÇÃO TOTAL DE syncDoc('plans')
  // =========================================================================
  it('2.1. AppContext não possui nenhuma chamada syncDoc para a coleção "plans"', () => {
    const syncDocMatches = (appContextContent.match(/syncDoc\(['"]plans['"]/g) || []).length;
    assert.strictEqual(
      syncDocMatches,
      0,
      `Nenhuma chamada syncDoc('plans') deve existir em AppContext.tsx (encontradas: ${syncDocMatches})`
    );
  });

  // =========================================================================
  // 3. HANDLERS ADMINISTRATIVOS: ID TOKEN + AUTHORIZATION + FAIL-CLOSED
  // =========================================================================
  it('3.1. createCustomPlan utiliza Bearer token e adota Fail-Closed estrito', () => {
    const fnBlock = appContextContent.match(/const createCustomPlan = async[\s\S]*?const updateCustomPlan/)?.[0];
    assert.ok(fnBlock, 'createCustomPlan deve ser localizado');

    assert.ok(
      fnBlock.includes('await getIdTokenFromCurrentUser()'),
      'createCustomPlan deve obter o token Firebase Auth oficial'
    );
    assert.ok(
      fnBlock.includes("'Authorization': `Bearer ${token}`") || fnBlock.includes('"Authorization": `Bearer ${token}`'),
      'createCustomPlan deve enviar o cabeçalho Authorization: Bearer <token>'
    );
    assert.ok(
      fnBlock.includes('if (!token)') && fnBlock.includes('success: false'),
      'createCustomPlan deve falhar fechado se o token não existir'
    );
    assert.ok(
      fnBlock.includes('if (!res.ok)') && fnBlock.includes('success: false'),
      'createCustomPlan deve retornar success: false para respostas HTTP não-2xx'
    );
    assert.ok(
      fnBlock.includes('catch (err: any)') && fnBlock.includes('success: false'),
      'createCustomPlan deve retornar success: false em caso de exceção de rede'
    );
    assert.ok(
      !fnBlock.includes('plano-${Date.now()}'),
      'createCustomPlan não deve fabricar ID substituto no frontend'
    );
  });

  it('3.2. updateCustomPlan utiliza Bearer token e adota Fail-Closed estrito', () => {
    const fnBlock = appContextContent.match(/const updateCustomPlan = async[\s\S]*?const togglePlanStatus/)?.[0];
    assert.ok(fnBlock, 'updateCustomPlan deve ser localizado');

    assert.ok(
      fnBlock.includes('await getIdTokenFromCurrentUser()'),
      'updateCustomPlan deve obter o token Firebase Auth oficial'
    );
    assert.ok(
      fnBlock.includes("'Authorization': `Bearer ${token}`") || fnBlock.includes('"Authorization": `Bearer ${token}`'),
      'updateCustomPlan deve enviar o cabeçalho Authorization: Bearer <token>'
    );
    assert.ok(
      fnBlock.includes('if (!token)') && fnBlock.includes('success: false'),
      'updateCustomPlan deve falhar fechado se o token não existir'
    );
    assert.ok(
      fnBlock.includes('if (!res.ok)') && fnBlock.includes('success: false'),
      'updateCustomPlan deve retornar success: false para respostas HTTP não-2xx'
    );
    assert.ok(
      fnBlock.includes('catch (err: any)') && fnBlock.includes('success: false'),
      'updateCustomPlan deve retornar success: false em caso de exceção de rede'
    );
  });

  it('3.3. togglePlanStatus utiliza Bearer token e adota Fail-Closed estrito', () => {
    const fnBlock = appContextContent.match(/const togglePlanStatus = async[\s\S]*?const duplicateCustomPlan/)?.[0];
    assert.ok(fnBlock, 'togglePlanStatus deve ser localizado');

    assert.ok(
      fnBlock.includes('await getIdTokenFromCurrentUser()'),
      'togglePlanStatus deve obter o token Firebase Auth oficial'
    );
    assert.ok(
      fnBlock.includes("'Authorization': `Bearer ${token}`") || fnBlock.includes('"Authorization": `Bearer ${token}`'),
      'togglePlanStatus deve enviar o cabeçalho Authorization: Bearer <token>'
    );
    assert.ok(
      fnBlock.includes('if (!token)') && fnBlock.includes('success: false'),
      'togglePlanStatus deve falhar fechado se o token não existir'
    );
    assert.ok(
      fnBlock.includes('if (!res.ok)') && fnBlock.includes('success: false'),
      'togglePlanStatus deve retornar success: false para respostas HTTP não-2xx'
    );
    assert.ok(
      fnBlock.includes('catch (err: any)') && fnBlock.includes('success: false'),
      'togglePlanStatus deve retornar success: false em caso de exceção de rede'
    );
  });

  it('3.4. duplicateCustomPlan utiliza Bearer token e adota Fail-Closed estrito', () => {
    const fnBlock = appContextContent.match(/const duplicateCustomPlan = async[\s\S]*?const createSubscription/)?.[0];
    assert.ok(fnBlock, 'duplicateCustomPlan deve ser localizado');

    assert.ok(
      fnBlock.includes('await getIdTokenFromCurrentUser()'),
      'duplicateCustomPlan deve obter o token Firebase Auth oficial'
    );
    assert.ok(
      fnBlock.includes("'Authorization': `Bearer ${token}`") || fnBlock.includes('"Authorization": `Bearer ${token}`'),
      'duplicateCustomPlan deve enviar o cabeçalho Authorization: Bearer <token>'
    );
    assert.ok(
      fnBlock.includes('if (!token)') && fnBlock.includes('success: false'),
      'duplicateCustomPlan deve falhar fechado se o token não existir'
    );
    assert.ok(
      fnBlock.includes('if (!res.ok)') && fnBlock.includes('success: false'),
      'duplicateCustomPlan deve retornar success: false para respostas HTTP não-2xx'
    );
    assert.ok(
      fnBlock.includes('catch (err: any)') && fnBlock.includes('success: false'),
      'duplicateCustomPlan deve retornar success: false em caso de exceção de rede'
    );
    assert.ok(
      !fnBlock.includes('plano-${Date.now()}'),
      'duplicateCustomPlan não deve criar IDs sintéticos substitutos no frontend'
    );
  });

  // =========================================================================
  // 4. PRESERVAÇÃO DE CONTRATOS BACKEND E AUDITORIA
  // =========================================================================
  it('4.1. Endpoint backend GET /api/plans permanece intacto em server.ts', () => {
    const serverPath = path.resolve('server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');
    assert.ok(
      serverContent.includes("app.get('/api/plans'"),
      'GET /api/plans deve permanecer disponível em server.ts'
    );
    assert.ok(
      serverContent.includes('planService.getPlans()'),
      'GET /api/plans deve delegar para planService'
    );
  });

  it('4.2. Nenhum componente frontend acessa .subscribersCount como regra funcional ou de segurança', () => {
    const files = fs.readdirSync('src', { recursive: true }) as string[];
    const tsFiles = files.filter(f => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('test'));

    let directReadMatches: string[] = [];
    for (const file of tsFiles) {
      const fullPath = path.join('src', file);
      if (fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (content.includes('.subscribersCount')) {
          directReadMatches.push(file);
        }
      }
    }

    assert.strictEqual(
      directReadMatches.length,
      0,
      `Nenhum arquivo de código frontend deve depender de .subscribersCount: encontrados em ${directReadMatches.join(', ')}`
    );
  });
});
