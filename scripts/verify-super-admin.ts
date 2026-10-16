/**
 * MY BARBER — Script de Verificação e Inspeção READ-ONLY
 * 
 * USO EXCLUSIVO PARA AUDITORIA PRÉVIA E PÓS-CONCESSÃO
 * Operação 100% SOMENTE LEITURA. Não realiza nenhuma escrita no Auth ou Firestore.
 * 
 * Execução:
 *   npx tsx scripts/verify-super-admin.ts
 */

import { getFirebaseAdmin } from '../src/server/firebaseAdmin.js';

const TARGET_UID = 'fMdgJeMVvJTbX8wNUocbMZGpJzH3';
const EXPECTED_EMAIL = 'carlosrs.email@gmail.com';
const EXPECTED_PROJECT = 'gen-lang-client-0472481079';
const EXPECTED_DATABASE = 'ai-studio-mybarber-1b7bcf67-417c-4eba-b227-1479fd547c81';

async function main() {
  console.log('='.repeat(65));
  console.log('MY BARBER — INSPEÇÃO DE SEGURANÇA READ-ONLY');
  console.log('='.repeat(65));

  const { app, auth, firestore } = getFirebaseAdmin();
  const connectedProject = app.options.projectId;
  const connectedDb = (firestore as any)._databaseId?.database || (firestore as any).databaseId || '(default)';

  console.log(`[CONFIG] Projeto Conectado:       ${connectedProject}`);
  console.log(`[CONFIG] Banco Firestore:         ${connectedDb}`);
  console.log(`[CONFIG] UID Alvo de Inspeção:    ${TARGET_UID}`);
  console.log(`[CONFIG] E-mail Esperado:         ${EXPECTED_EMAIL}`);
  console.log('-'.repeat(65));

  // Validação estrita de apontamento
  if (connectedProject !== EXPECTED_PROJECT) {
    console.error(`❌ ALERTA: Projeto divergente! Esperado: ${EXPECTED_PROJECT}, Atual: ${connectedProject}`);
  }
  if (connectedDb !== EXPECTED_DATABASE) {
    console.error(`❌ ALERTA: Banco Firestore divergente! Esperado: ${EXPECTED_DATABASE}, Atual: ${connectedDb}`);
  }

  // 1. Inspeção no Firebase Authentication
  console.log('\n[1/2] Consultando Firebase Authentication...');
  try {
    const userRecord = await auth.getUser(TARGET_UID);
    console.log('  UID Encontrado:        ', userRecord.uid);
    console.log('  E-mail Cadastrado:     ', userRecord.email);
    console.log('  E-mail Verificado:     ', userRecord.emailVerified);
    console.log('  Conta Desabilitada:    ', userRecord.disabled);
    console.log('  Data de Criação:       ', userRecord.metadata.creationTime);
    console.log('  Último Login:          ', userRecord.metadata.lastSignInTime);
    console.log('  Custom Claims Atuais:  ', JSON.stringify(userRecord.customClaims || {}, null, 2));

    const isSuperAdmin = userRecord.customClaims?.role === 'super_admin' && userRecord.customClaims?.isSuperAdmin === true;
    console.log('  Status Super Admin:    ', isSuperAdmin ? '✅ ATIVO' : '⏳ PENDENTE DE CONCESSÃO');
  } catch (authErr: any) {
    console.error('  ❌ Falha ao consultar Firebase Auth:', authErr?.message || authErr);
  }

  // 2. Inspeção no Firestore (Banco Nomeado)
  console.log('\n[2/2] Consultando Firestore (Banco Nomeado)...');
  try {
    const userDocRef = firestore.collection('users').doc(TARGET_UID);
    const userDoc = await userDocRef.get();
    if (userDoc.exists) {
      const data = userDoc.data() || {};
      console.log('  Documento users/:      Existe');
      console.log('  Nome no Perfil:        ', data.name || data.displayName || 'Não preenchido');
      console.log('  Role no Firestore:     ', data.role || 'nenhuma');
      console.log('  Canonical Role:        ', data.canonicalRole || 'nenhuma');
      console.log('  Tenant ID:             ', data.tenantId || 'global');
    } else {
      console.log('  Documento users/:      Não existe ainda (será sincronizado no bootstrap)');
    }

    // Consulta os últimos logs de auditoria
    const auditSnapshot = await firestore.collection('audit_logs')
      .where('targetUserId', '==', TARGET_UID)
      .limit(3)
      .get();
    
    console.log(`  Logs de Auditoria:     ${auditSnapshot.size} registro(s) encontrado(s) para este UID`);
    auditSnapshot.forEach(doc => {
      const a = doc.data();
      console.log(`    - [${a.timestamp}] Ação: ${a.action} | Status: ${a.status} | Operador: ${a.actorUserId}`);
    });
  } catch (fsErr: any) {
    console.error('  ❌ Falha ao consultar Firestore:', fsErr?.message || fsErr);
  }

  console.log('\n' + '='.repeat(65));
  console.log('Fim da inspeção READ-ONLY. Nenhuma escrita foi realizada.');
  console.log('='.repeat(65));
}

main().catch(err => {
  console.error('Erro na inspeção:', err);
  process.exit(1);
});
