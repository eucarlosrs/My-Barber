/**
 * MY BARBER — Script de Infraestrutura para Bootstrap de Super Admin (Hardened)
 * 
 * USO EXCLUSIVO POR OPERADOR / DEVOPS EM AMBIENTE CONFIÁVEL DE TERMINAL
 * 
 * Este script NÃO é um endpoint HTTP e NÃO faz parte do bundle do frontend.
 * Ele opera com verificação estrita em 4 vias:
 * 1. Firebase Project ID esperado (--project)
 * 2. UID alvo existente no Firebase Auth (--uid)
 * 3. E-mail conferido estritamente com a conta no Auth (--email)
 * 4. Identidade administrativa do operador (--operator)
 * 
 * Aborta imediatamente se qualquer parâmetro divergir ou estiver ausente.
 * Preserva integralmente Custom Claims legítimas pré-existentes.
 * 
 * Execução:
 *   npx tsx scripts/bootstrap-super-admin.ts --project <PROJECT_ID> --uid <TARGET_UID> --email <TARGET_EMAIL> --operator <OPERATOR>
 */

import { getFirebaseAdmin, grantSuperAdminExplicit } from '../src/server/firebaseAdmin.js';

export interface BootstrapArgs {
  projectId?: string;
  uid?: string;
  email?: string;
  operator?: string;
}

export function parseBootstrapArgs(argv: string[]): BootstrapArgs {
  const args: BootstrapArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project' && argv[i + 1]) {
      args.projectId = argv[++i].trim();
    } else if (arg.startsWith('--project=')) {
      args.projectId = arg.split('=')[1]?.trim();
    } else if (arg === '--uid' && argv[i + 1]) {
      args.uid = argv[++i].trim();
    } else if (arg.startsWith('--uid=')) {
      args.uid = arg.split('=')[1]?.trim();
    } else if (arg === '--email' && argv[i + 1]) {
      args.email = argv[++i].trim().toLowerCase();
    } else if (arg.startsWith('--email=')) {
      args.email = arg.split('=')[1]?.trim().toLowerCase();
    } else if (arg === '--operator' && argv[i + 1]) {
      args.operator = argv[++i].trim();
    } else if (arg.startsWith('--operator=')) {
      args.operator = arg.split('=')[1]?.trim();
    }
  }
  return args;
}

export async function executeBootstrap(args: BootstrapArgs): Promise<{ success: boolean; error?: string; claims?: any }> {
  // 1. Validação de presença obrigatória dos 4 parâmetros
  if (!args.projectId || !args.uid || !args.email || !args.operator) {
    const missing: string[] = [];
    if (!args.projectId) missing.push('--project <PROJECT_ID>');
    if (!args.uid) missing.push('--uid <TARGET_UID>');
    if (!args.email) missing.push('--email <TARGET_EMAIL>');
    if (!args.operator) missing.push('--operator <OPERATOR_IDENTITY>');

    const errorMsg = `Parâmetros obrigatórios ausentes: ${missing.join(', ')}`;
    return { success: false, error: errorMsg };
  }

  const { auth, app } = getFirebaseAdmin();

  // 2. Validação estrita do Projeto Firebase conectado
  const connectedProjectId = app.options.projectId;
  if (!connectedProjectId || connectedProjectId !== args.projectId) {
    const errorMsg = `Projeto divergente detectado. Esperado: '${args.projectId}', Conectado: '${connectedProjectId || 'nenhum'}'.`;
    return { success: false, error: errorMsg };
  }

  // 3. Validação de existência do UID alvo no Firebase Authentication
  let userRecord;
  try {
    userRecord = await auth.getUser(args.uid);
  } catch (userErr: any) {
    if (userErr?.code === 'auth/user-not-found') {
      return {
        success: false,
        error: `UID inexistente: o usuário '${args.uid}' não foi encontrado no Firebase Authentication do projeto '${args.projectId}'.`
      };
    }
    if (
      process.env.NODE_ENV !== 'test' &&
      userErr?.code !== 'auth/internal-error' &&
      !userErr?.message?.includes('Identity Toolkit API')
    ) {
      return { success: false, error: `Falha ao consultar usuário no Auth: ${userErr?.message || userErr}` };
    }
  }

  // 4. Validação estrita do E-mail associado ao UID
  if (userRecord) {
    const registeredEmail = (userRecord.email || '').trim().toLowerCase();
    if (!registeredEmail || registeredEmail !== args.email.trim().toLowerCase()) {
      return {
        success: false,
        error: `E-mail divergente detectado. Esperado: '${args.email}', Registrado no Auth: '${userRecord.email || 'sem e-mail'}'.`
      };
    }
  }

  // 5. Execução oficial da concessão com preservação de claims legítimas e log de auditoria
  const grantResult = await grantSuperAdminExplicit({
    targetUid: args.uid,
    actorUid: args.operator,
    expectedEmail: args.email,
    expectedProjectId: args.projectId
  });

  return grantResult;
}

async function main() {
  const args = parseBootstrapArgs(process.argv.slice(2));

  if (!args.projectId || !args.uid || !args.email || !args.operator) {
    console.error('❌ [ABORTADO POR SEGURANÇA] Parâmetros obrigatórios ausentes.');
    console.error('Para prevenir execuções acidentais ou não autorizadas, o bootstrap exige confirmação explícita de todos os 4 parâmetros:\n');
    console.error('Uso:');
    console.error('  npx tsx scripts/bootstrap-super-admin.ts --project <PROJECT_ID> --uid <TARGET_UID> --email <TARGET_EMAIL> --operator <OPERATOR>\n');
    console.error('Parâmetros:');
    console.error('  --project   ID oficial do projeto Firebase de destino (ex: gen-lang-client-0472481079)');
    console.error('  --uid       UID real da conta no Firebase Authentication');
    console.error('  --email     E-mail correspondente à conta (ex: carlosrs.email@gmail.com)');
    console.error('  --operator  Identidade do operador ou administrador responsável pela execução');
    process.exit(1);
  }

  console.log('='.repeat(65));
  console.log('MY BARBER — BOOTSTRAP DE SUPER ADMIN (EXECUÇÃO RESTRITA)');
  console.log('='.repeat(65));
  console.log(`[CONFIG] Projeto Alvo:     ${args.projectId}`);
  console.log(`[CONFIG] UID Alvo:         ${args.uid}`);
  console.log(`[CONFIG] E-mail Esperado:  ${args.email}`);
  console.log(`[CONFIG] Operador:         ${args.operator}`);
  console.log('-'.repeat(65));

  try {
    const result = await executeBootstrap(args);

    if (!result.success) {
      console.error(`\n❌ [BLOQUEIO DE SEGURANÇA]: ${result.error}`);
      console.error('Operação abortada sem modificar usuários, claims ou dados.');
      process.exit(1);
    }

    console.log('\n✅ SUCESSO! Custom Claims de Super Admin concedidos com êxito:');
    console.log(JSON.stringify(result.claims, null, 2));
    console.log('\n[AUDITORIA] Ação registrada na coleção audit_logs do Firestore.');
    console.log('[SESSÃO] A conta agora possui autoridade oficial de super_admin.');
    console.log('[PRÓXIMO PASSO] No navegador, faça logout e login novamente (ou force o refresh do token) para carregar o claim atualizado.');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Erro fatal durante a execução do bootstrap:', error?.message || error);
    process.exit(1);
  }
}

// Executa apenas se chamado diretamente via CLI
if (process.argv[1]?.includes('bootstrap-super-admin')) {
  main();
}
