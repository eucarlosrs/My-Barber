import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('MY BARBER — Validação e Auditoria das Firestore Security Rules', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('1. O arquivo firestore.rules deve existir e utilizar rules_version = 2', () => {
    assert.ok(fs.existsSync(rulesPath), 'firestore.rules deve existir no root');
    assert.match(rulesContent, /rules_version\s*=\s*'2';/, 'Deve especificar rules_version 2');
  });

  it('2. Deve conter Deny-by-Default explícito para coleções não declaradas', () => {
    assert.match(
      rulesContent,
      /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/,
      'Deve conter match /{document=**} { allow read, write: if false; }'
    );
  });

  it('3. Deve validar Super Admin exclusivamente através de Custom Claims (sem email hardcoded)', () => {
    assert.match(rulesContent, /request\.auth\.token\.role\s*==\s*'super_admin'/, 'Deve checar custom claim role super_admin');
    assert.match(rulesContent, /request\.auth\.token\.isSuperAdmin\s*==\s*true/, 'Deve checar claim booleano isSuperAdmin');
    assert.doesNotMatch(rulesContent, /carlosrs\.email@gmail\.com/, 'NÃO deve conter e-mail hardcoded de autorização');
    assert.doesNotMatch(rulesContent, /email_verified/, 'NÃO deve usar email_verified para autorização de Super Admin');
  });

  it('4. Deve extrair tenantId e role estritamente do token de autorização soberano', () => {
    assert.match(rulesContent, /request\.auth\.token\.tenantId/, 'Deve ler tenantId do token');
    assert.match(rulesContent, /request\.auth\.token\.role/, 'Deve ler role do token');
  });

  it('5. Coleção audit_logs deve bloquear toda escrita client-side (create, update e delete = false)', () => {
    const auditBlock = rulesContent.match(/match\s+\/audit_logs\/\{logId\}\s*\{[\s\S]*?\}/);
    assert.ok(auditBlock, 'Deve existir bloco match /audit_logs/{logId}');
    assert.match(auditBlock[0], /allow\s+read:\s*if\s+isSuperAdmin\(\);/, 'Apenas super_admin pode ler logs');
    assert.match(auditBlock[0], /allow\s+create,\s*update,\s*delete:\s*if\s+false;/, 'Audit logs não podem ser escritos pelo cliente');
  });

  it('6. Assinaturas e pagamentos Mercado Pago devem ter toda escrita client-side bloqueada', () => {
    const subsBlock = rulesContent.match(/match\s+\/subscriptions\/\{subscriptionId\}\s*\{[\s\S]*?\}/);
    assert.ok(subsBlock, 'Deve existir bloco match /subscriptions/{subscriptionId}');
    assert.match(subsBlock[0], /allow\s+create,\s*update,\s*delete:\s*if\s+false;/, 'Escrita client-side de assinaturas totalmente bloqueada');

    const paymentsBlock = rulesContent.match(/match\s+\/subscription_payments\/\{paymentId\}\s*\{[\s\S]*?\}/);
    assert.ok(paymentsBlock, 'Deve existir bloco match /subscription_payments/{paymentId}');
    assert.match(paymentsBlock[0], /allow\s+create,\s*update,\s*delete:\s*if\s+false;/, 'Escrita client-side de pagamentos totalmente bloqueada');
  });

  it('7. Coleção users deve bloquear escalonamento de privilégios em updates (role e tenant imutáveis)', () => {
    const usersBlock = rulesContent.match(/match\s+\/users\/\{userId\}\s*\{[\s\S]*?\n\s{4}\}/);
    assert.ok(usersBlock, 'Deve existir bloco match /users/{userId}');
    assert.match(usersBlock[0], /request\.resource\.data\.role\s*==\s*resource\.data\.role/, 'Usuário não pode alterar seu próprio role');
    assert.match(usersBlock[0], /request\.resource\.data\.tenantId\s*==\s*resource\.data\.tenantId/, 'Usuário não pode alterar seu próprio tenantId');
  });

  it('8. Catálogo de planos deve ter escrita restrita a Super Admin e leitura pública', () => {
    const plansBlock = rulesContent.match(/match\s+\/plans\/\{planId\}\s*\{[\s\S]*?\}/);
    assert.ok(plansBlock, 'Deve existir bloco match /plans/{planId}');
    assert.match(plansBlock[0], /allow\s+read:\s*if\s+true;/, 'Leitura de planos é pública');
    assert.match(plansBlock[0], /allow\s+write:\s*if\s+isSuperAdmin\(\);/, 'Escrita de planos restrita a Super Admin');
  });

  it('9. Agendamentos devem validar formato na criação e status inicial AGENDADO', () => {
    const apptsBlock = rulesContent.match(/match\s+\/appointments\/\{appointmentId\}\s*\{[\s\S]*?\n\s{4}\}/);
    assert.ok(apptsBlock, 'Deve existir bloco match /appointments/{appointmentId}');
    assert.match(apptsBlock[0], /request\.resource\.data\.status\s*==\s*'AGENDADO'/, 'Agendamento deve nascer com status AGENDADO');
    assert.match(apptsBlock[0], /request\.resource\.data\.tenantId\s+is\s+string/, 'Agendamento deve ter tenantId como string');
  });

  it('10. Deve garantir retrocompatibilidade com documentos legados via verificação isSelf', () => {
    assert.match(rulesContent, /function\s+isSelf\(userId\)\s*\{/, 'Deve definir helper isSelf');
    assert.match(rulesContent, /request\.auth\.uid\s*==\s*userId/, 'Deve checar se o docId é igual ao UID');
    assert.match(rulesContent, /resource\.data\.uid\s*==\s*request\.auth\.uid/, 'Deve checar se o campo uid interno confere com o UID do Firebase');
  });

  it('11. Barbershops create deve validar que clientes comuns só definem seu próprio ownerUid', () => {
    const barbershopBlock = rulesContent.match(/match\s+\/barbershops\/\{barbershopId\}\s*\{[\s\S]*?\n\s{4}\}/);
    assert.ok(barbershopBlock, 'Deve existir bloco match /barbershops/{barbershopId}');
    assert.match(barbershopBlock[0], /isSuperAdmin\(\)\s*\|\|\s*\(/, 'Super Admin deve ter permissão de criação');
    assert.match(barbershopBlock[0], /request\.resource\.data\.ownerUid\s*==\s*request\.auth\.uid/, 'Cliente comum deve ter ownerUid == request.auth.uid');
  });

  it('12. Barbershops update deve bloquear alteração ou transferência de ownerUid por usuários comuns', () => {
    const barbershopBlock = rulesContent.match(/match\s+\/barbershops\/\{barbershopId\}\s*\{[\s\S]*?\n\s{4}\}/);
    assert.ok(barbershopBlock, 'Deve existir bloco match /barbershops/{barbershopId}');
    assert.match(barbershopBlock[0], /request\.resource\.data\.ownerUid\s*==\s*resource\.data\.ownerUid/, 'ownerUid deve ser imutável no update por clientes');
  });
});
