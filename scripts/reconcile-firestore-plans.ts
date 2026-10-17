/**
 * MY BARBER — Script de Estratégia de Reconciliação dos Planos SaaS no Firestore
 * 
 * ATENÇÃO: NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA.
 * Operação segura com modo padrão DRY-RUN, backup prévio, verificação de dependências
 * e IDs estáveis estritos.
 * 
 * USO:
 *   Simulação (Somente Leitura):
 *     npx tsx scripts/reconcile-firestore-plans.ts --dry-run
 * 
 *   Execução Real (Requer autorização explícita prévia):
 *     npx tsx scripts/reconcile-firestore-plans.ts --apply --confirm-reconciliation --operator <OPERATOR_EMAIL>
 */

import { getFirebaseAdmin } from '../src/server/firebaseAdmin.js';
import { DEFAULT_PLANS } from '../src/server/planService.js';
import fs from 'node:fs';
import path from 'node:path';

export const EXPECTED_PROJECT_ID = 'gen-lang-client-0472481079';
export const EXPECTED_DATABASE_ID = 'ai-studio-mybarber-1b7bcf67-417c-4eba-b227-1479fd547c81';

export interface ReconcileArgs {
  dryRun: boolean;
  apply: boolean;
  confirm: boolean;
  operator?: string;
  projectId?: string;
}

export function parseReconcileArgs(argv: string[]): ReconcileArgs {
  let operator: string | undefined;
  let projectId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--operator' && argv[i + 1]) {
      operator = argv[++i]?.trim();
    } else if (a.startsWith('--operator=')) {
      operator = a.split('=')[1]?.trim();
    } else if (a === '--project' && argv[i + 1]) {
      projectId = argv[++i]?.trim();
    } else if (a.startsWith('--project=')) {
      projectId = a.split('=')[1]?.trim();
    }
  }

  return {
    dryRun: argv.includes('--dry-run') || !argv.includes('--apply'),
    apply: argv.includes('--apply'),
    confirm: argv.includes('--confirm-reconciliation'),
    operator,
    projectId
  };
}

export async function runPlansReconciliation(args: ReconcileArgs) {
  console.log('='.repeat(65));
  console.log('MY BARBER — RECONCILIAÇÃO CONTROLADA DE PLANOS SAAS (FIRESTORE)');
  console.log('='.repeat(65));

  const { app, firestore } = getFirebaseAdmin();
  const connectedProject = app.options.projectId;
  const connectedDb = (firestore as any)._databaseId?.database || (firestore as any).databaseId || '(default)';

  console.log(`[CONFIG] Projeto Firebase:       ${connectedProject}`);
  console.log(`[CONFIG] Banco Firestore:        ${connectedDb}`);
  console.log(`[CONFIG] Modo de Execução:       ${args.dryRun ? '🔍 SIMULAÇÃO (DRY-RUN / LEITURA PURA)' : '⚡ APLICAÇÃO REAL'}`);
  console.log(`[CONFIG] Operador:               ${args.operator || 'Não especificado'}`);
  if (args.projectId) {
    console.log(`[CONFIG] Projeto Informado CLI:  ${args.projectId}`);
  }
  console.log('-'.repeat(65));

  // 1. Verificação de Integridade de Conexão com Projeto Firebase (Fail-Closed)
  // Interrompe imediatamente antes de qualquer leitura, backup ou escrita.
  if (args.projectId && args.projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`[Segurança] Abortado: argumento --project informado ('${args.projectId}') diverge do projeto Firebase oficial ('${EXPECTED_PROJECT_ID}').`);
  }

  if (!connectedProject || connectedProject !== EXPECTED_PROJECT_ID) {
    throw new Error(`[Segurança] Abortado: projeto Firebase conectado incorreto ('${connectedProject || 'nenhum'}'). Esperado exatamente o projeto oficial '${EXPECTED_PROJECT_ID}'. Não confie apenas no projeto ativo do Cloud Shell.`);
  }

  // 2. Verificação de Integridade de Conexão com Banco Nomeado (Fail-Closed)
  if (!connectedDb || connectedDb !== EXPECTED_DATABASE_ID) {
    throw new Error(`[Segurança] Abortado: banco de dados Firestore incorreto ('${connectedDb || 'nenhum'}'). Esperado banco nomeado '${EXPECTED_DATABASE_ID}'.`);
  }

  // 2. Leitura e Backup dos Planos Atuais no Firestore
  console.log('\n[1/4] Lendo documentos atuais da coleção "plans"...');
  const plansSnapshot = await firestore.collection('plans').get();
  const existingDocs = plansSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`  Documentos existentes no Firestore: ${existingDocs.length}`);
  existingDocs.forEach(d => {
    console.log(`  - [${d.id}] "${(d as any).name}" | Mensal: R$ ${(d as any).priceMonthly} | Promo: R$ ${(d as any).promotionalPrice || 'N/A'}`);
  });

  // Cria snapshot de backup local
  const backupData = {
    timestamp: new Date().toISOString(),
    projectId: connectedProject,
    databaseId: connectedDb,
    documentCount: existingDocs.length,
    plans: existingDocs
  };

  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupFilePath = path.join(backupDir, `plans-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`  ✅ Backup de segurança gravado em: ${backupFilePath}`);

  // 3. Verificação de Assinaturas Dependentes
  console.log('\n[2/4] Verificando assinaturas existentes na coleção "subscriptions"...');
  let dependentSubscribers = 0;
  try {
    const subsSnapshot = await firestore.collection('subscriptions').get();
    dependentSubscribers = subsSnapshot.size;
    console.log(`  Total de assinaturas encontradas no banco: ${dependentSubscribers}`);
    subsSnapshot.docs.forEach(doc => {
      const sub = doc.data();
      console.log(`  - Assinatura ${doc.id}: Tenant '${sub.barbershopId}' | Plano '${sub.planId}' | Preço Contratado R$ ${sub.currentPrice}`);
    });
  } catch (err: any) {
    console.warn('  ⚠️ Aviso ao inspecionar subscriptions:', err?.message || err);
  }

  // 4. Mapeamento das Ações Canônicas
  console.log('\n[3/4] Mapeando plano canônico e reconciliações necessárias:');
  const actions: Array<{ type: 'CREATE' | 'UPDATE' | 'PRESERVE'; planId: string; details: string; payload: any }> = [];

  for (const canon of DEFAULT_PLANS) {
    const existing = existingDocs.find(d => d.id === canon.id);
    if (!existing) {
      actions.push({
        type: 'CREATE',
        planId: canon.id,
        details: `Criação do plano ausente: "${canon.name}" (${canon.billingCycle === 'ONE_TIME' ? `Pagamento Único R$ ${canon.oneTimePrice || canon.priceMonthly}` : `R$ ${canon.priceMonthly}/mês`})`,
        payload: { ...canon, updatedAt: new Date().toISOString() }
      });
    } else {
      const needsUpdate =
        (existing as any).priceMonthly !== canon.priceMonthly ||
        (existing as any).promotionalPrice !== canon.promotionalPrice ||
        (existing as any).priceAfterPromotion !== canon.priceAfterPromotion ||
        (existing as any).billingCycle !== canon.billingCycle;

      if (needsUpdate) {
        actions.push({
          type: 'UPDATE',
          planId: canon.id,
          details: `Atualização de valores comerciais para alinhamento oficial: "${canon.name}"`,
          payload: {
            ...canon,
            subscribersCount: (existing as any).subscribersCount || 0,
            createdAt: (existing as any).createdAt || canon.createdAt,
            updatedAt: new Date().toISOString()
          }
        });
      } else {
        actions.push({
          type: 'PRESERVE',
          planId: canon.id,
          details: `Plano já alinhado com a configuração oficial: "${canon.name}"`,
          payload: existing
        });
      }
    }
  }

  actions.forEach(a => {
    const icon = a.type === 'CREATE' ? '➕ [CRIAR]' : a.type === 'UPDATE' ? '🔄 [ATUALIZAR]' : '🛡️ [PRESERVAR]';
    console.log(`  ${icon} ${a.planId}: ${a.details}`);
  });

  // 5. Execução ou Aborto por Dry-Run
  console.log('\n[4/4] Execução da Reconciliação...');
  if (args.dryRun || !args.apply || !args.confirm) {
    console.log('  🔒 MODO SEGURO / SIMULAÇÃO ATIVO: Nenhuma modificação foi gravada no Firestore.');
    console.log('  Para aplicar de verdade no futuro, este script exigirá autorização explícita com as flags:');
    console.log('    --apply --confirm-reconciliation --operator <SEU_EMAIL>\n');
    console.log('='.repeat(65));
    return { success: true, dryRun: true, actions, backupPath: backupFilePath };
  }

  // Execução atômica via Batch
  const batch = firestore.batch();
  for (const action of actions) {
    if (action.type === 'CREATE' || action.type === 'UPDATE') {
      const docRef = firestore.collection('plans').doc(action.planId);
      batch.set(docRef, action.payload, { merge: true });
    }
  }

  // Grava auditoria
  const auditRef = firestore.collection('audit_logs').doc(`audit-plans-reconcile-${Date.now()}`);
  batch.set(auditRef, {
    action: 'RECONCILE_SAAS_PLANS',
    actorUid: args.operator || 'system_operator',
    timestamp: new Date().toISOString(),
    actionsSummary: actions.map(a => ({ type: a.type, planId: a.planId })),
    backupRef: backupFilePath,
    status: 'SUCESSO'
  });

  await batch.commit();
  console.log('  ✅ Reconciliação concluída no Firestore com sucesso.');
  console.log(`  ✅ Registro de auditoria gravado em: ${auditRef.id}`);
  console.log('='.repeat(65));
  return { success: true, dryRun: false, actions, backupPath: backupFilePath };
}

// Executa apenas se chamado diretamente via CLI (e não importado em testes)
if ((process.argv[1]?.endsWith('reconcile-firestore-plans.ts') || process.argv[1]?.endsWith('reconcile-firestore-plans.js') || process.argv[1]?.includes('reconcile-firestore-plans')) && !process.argv[1]?.includes('.test.')) {
  const args = parseReconcileArgs(process.argv.slice(2));
  runPlansReconciliation(args).catch(err => {
    console.error('❌ Erro na reconciliação:', err);
    process.exit(1);
  });
}
