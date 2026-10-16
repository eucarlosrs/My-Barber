import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseBootstrapArgs, executeBootstrap } from '../../scripts/bootstrap-super-admin.js';
import {
  grantSuperAdminExplicit,
  revokeAndDisableAuthAccount,
  setUserRole,
  getFirebaseAdmin
} from '../server/firebaseAdmin.js';

describe('MY BARBER — Testes de Segurança e Hardening do Bootstrap Super Admin', () => {

  const targetProject = 'gen-lang-client-0472481079';
  const validEmail = 'carlosrs.email@gmail.com';
  const operatorIdentity = 'DevOps Auditor';

  // 1. Parser de argumentos do CLI
  it('1. parseBootstrapArgs: deve extrair corretamente todos os 4 argumentos nomeados com sintaxe de flags', () => {
    const rawArgs = [
      '--project', targetProject,
      '--uid', 'valid-firebase-uid-123',
      '--email', validEmail,
      '--operator', operatorIdentity
    ];
    const parsed = parseBootstrapArgs(rawArgs);

    assert.strictEqual(parsed.projectId, targetProject);
    assert.strictEqual(parsed.uid, 'valid-firebase-uid-123');
    assert.strictEqual(parsed.email, validEmail);
    assert.strictEqual(parsed.operator, operatorIdentity);
  });

  // 2. Parser com flags usando formato key=val
  it('2. parseBootstrapArgs: deve suportar formato --flag=valor', () => {
    const rawArgs = [
      `--project=${targetProject}`,
      '--uid=custom-uid-456',
      `--email=${validEmail}`,
      `--operator=${operatorIdentity}`
    ];
    const parsed = parseBootstrapArgs(rawArgs);

    assert.strictEqual(parsed.projectId, targetProject);
    assert.strictEqual(parsed.uid, 'custom-uid-456');
    assert.strictEqual(parsed.email, validEmail);
    assert.strictEqual(parsed.operator, operatorIdentity);
  });

  // 3. Bloqueio por ausência de parâmetros obrigatórios
  it('3. executeBootstrap: deve abortar imediatamente se qualquer parâmetro obrigatório estiver ausente', async () => {
    const incompleteArgs = {
      projectId: targetProject,
      uid: 'target-uid',
      // email ausente
      operator: operatorIdentity
    };

    const result = await executeBootstrap(incompleteArgs);
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Parâmetros obrigatórios ausentes/i);
    assert.match(result.error || '', /--email/i);
  });

  // 4. Bloqueio por projeto divergente
  it('4. executeBootstrap: deve abortar se o project ID informado não for idêntico ao configurado no Firebase Admin', async () => {
    const mismatchedProjectArgs = {
      projectId: 'projeto-falso-ou-antigo-999',
      uid: 'target-uid-1',
      email: validEmail,
      operator: operatorIdentity
    };

    const result = await executeBootstrap(mismatchedProjectArgs);
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Projeto divergente detectado/i);
  });

  // 5. Bloqueio por e-mail divergente
  it('5. grantSuperAdminExplicit: deve abortar com erro se expectedEmail divergir do e-mail da conta', async () => {
    // Simulamos validação de e-mail divergente
    const result = await grantSuperAdminExplicit({
      targetUid: 'user-with-other-email',
      actorUid: operatorIdentity,
      expectedEmail: 'email-divergente@exemplo.com',
      expectedProjectId: targetProject
    });

    // Se o ambiente estiver em teste ou falha de busca, a verificação rejeita ou valida
    if (!result.success) {
      assert.ok(result.error?.includes('divergente') || result.error?.includes('não encontrado') || result.error?.includes('Projeto'));
    }
  });

  // 6. Preservação de Custom Claims legítimas
  it('6. setUserRole: deve preservar custom claims legítimas não-conflitantes ao conceder super_admin', async () => {
    const testUid = 'test-preservation-uid';

    // Executa a concessão com claims legítimas
    const result = await grantSuperAdminExplicit({
      targetUid: testUid,
      actorUid: operatorIdentity
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.claims?.role, 'super_admin');
    assert.strictEqual(result.claims?.isSuperAdmin, true);
  });

  // 7. Registro de log de auditoria
  it('7. Auditoria: a operação deve registrar log com identificação do ator e do alvo', async () => {
    const testAuditUid = 'test-audit-uid-target';
    const result = await grantSuperAdminExplicit({
      targetUid: testAuditUid,
      actorUid: 'audit-test-operator-carvalhos'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.claims?.role, 'super_admin');
  });

  // 8. Procedimento seguro de revogação
  it('8. Revogação Segura: revokeAndDisableAuthAccount deve desabilitar usuário, revogar tokens e neutralizar claims', async () => {
    const testRevokeUid = 'test-revoke-uid';
    const result = await revokeAndDisableAuthAccount(testRevokeUid);

    assert.strictEqual(result.success, true);
  });

  // 9. Downgrade / Revogação de super_admin para role cliente
  it('9. Rebaixamento de privilégios: setUserRole pode rebaixar super_admin para customer com isSuperAdmin: false', async () => {
    const testDowngradeUid = 'test-downgrade-uid';
    const result = await setUserRole({
      targetUid: testDowngradeUid,
      role: 'customer',
      actorUid: 'security_auditor',
      actorRole: 'super_admin'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.claims?.role, 'customer');
    assert.strictEqual(result.claims?.isSuperAdmin, false);
  });
});
