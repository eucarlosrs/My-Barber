import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ETAPA 2.1E - TESTES AUTOMATIZADOS DE HARDENING DE INTEGRIDADE EM APPOINTMENTS E DAY_LOCKS
 *
 * Cobertura Completa:
 * 1. Imutabilidade Absoluta de Campos Críticos (preço, duração, data, horário, tenantId, profissional) para Barbeiros.
 * 2. Bloqueio Completo de Edição de Agendamentos por Clientes / Anônimos (Bypass Zero).
 * 3. Permissões Legítimas de Barbeiros limitadas a status operacional (AGENDADO, CONCLUIDO, CANCELADO, NAO_COMPARECEU) e anotações.
 * 4. Permissões Administrativas de Gerentes e Proprietários restritas ao próprio Tenant (tenantId imutável).
 * 5. Isolamento Multi-Tenant Estrito (Barbeiro/Gestor de Barbearia A não altera Barbearia B).
 * 6. Fechamento Total de Day_Locks no Client SDK (allow read, write: if false) com autoridade exclusiva Admin SDK.
 */

describe('ETAPA 2.1E: Hardening de Integridade de Agendamentos e Concorrência (Security Rules)', () => {
  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  assert.strictEqual(fs.existsSync(rulesPath), true, 'firestore.rules deve existir na raiz do projeto');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('1. Deve conter regras de appointments.update com separação estrita de papéis (SuperAdmin, Gestão, Profissional)', () => {
    assert.match(
      rulesContent,
      /match\s+\/appointments\/\{appointmentId\}/,
      'Deve conter declaração de coleção appointments'
    );
    assert.match(
      rulesContent,
      /allow\s+update:\s*if\s*\([\s\S]*?isSuperAdmin\(\)/,
      'allow update deve suportar isSuperAdmin'
    );
    assert.match(
      rulesContent,
      /isManagerOrOwnerOfTenant\(resource\.data\.tenantId\)\s*&&\s*request\.resource\.data\.tenantId == resource\.data\.tenantId/,
      'allow update deve permitir gestão do tenant com tenantId estritamente imutável'
    );
    assert.match(
      rulesContent,
      /isProfessionalOfTenant\(resource\.data\.tenantId\)/,
      'allow update deve ter ramo específico com validações para profissional do tenant'
    );
  });

  it('2. Barbeiro NÃO pode alterar o preço do serviço (servicePrice imutável)', () => {
    assert.match(
      rulesContent,
      /request\.resource\.data\.servicePrice == resource\.data\.servicePrice/,
      'Profissional é impedido de fraudar ou alterar o preço do serviço no agendamento'
    );
  });

  it('3. Barbeiro NÃO pode alterar a duração do serviço (serviceDuration imutável)', () => {
    assert.match(
      rulesContent,
      /request\.resource\.data\.serviceDuration == resource\.data\.serviceDuration/,
      'Profissional é impedido de alterar a duração do serviço no agendamento'
    );
  });

  it('4. Barbeiro NÃO pode alterar data, horário de início ou término (date, startTime, endTime imutáveis)', () => {
    assert.match(
      rulesContent,
      /request\.resource\.data\.date == resource\.data\.date/,
      'Data do agendamento deve ser imutável para o profissional'
    );
    assert.match(
      rulesContent,
      /request\.resource\.data\.startTime == resource\.data\.startTime/,
      'Horário de início deve ser imutável para o profissional'
    );
    assert.match(
      rulesContent,
      /request\.resource\.data\.endTime == resource\.data\.endTime/,
      'Horário de término deve ser imutável para o profissional'
    );
  });

  it('5. Barbeiro NÃO pode alterar o profissional responsável nem o serviço (professionalId e serviceId imutáveis)', () => {
    assert.match(
      rulesContent,
      /request\.resource\.data\.professionalId == resource\.data\.professionalId/,
      'Profissional responsável não pode ser alterado pelo barbeiro'
    );
    assert.match(
      rulesContent,
      /request\.resource\.data\.serviceId == resource\.data\.serviceId/,
      'Serviço contratado não pode ser alterado pelo barbeiro'
    );
  });

  it('6. Barbeiro NÃO pode alterar identificador ou dados do cliente (clientId, clientName, clientWhatsApp imutáveis)', () => {
    assert.match(
      rulesContent,
      /request\.resource\.data\.clientId == resource\.data\.clientId/,
      'Identificador do cliente deve ser imutável'
    );
    assert.match(
      rulesContent,
      /request\.resource\.data\.clientName == resource\.data\.clientName/,
      'Nome do cliente deve ser imutável'
    );
    assert.match(
      rulesContent,
      /request\.resource\.data\.clientWhatsApp == resource\.data\.clientWhatsApp/,
      'WhatsApp do cliente deve ser imutável'
    );
  });

  it('7. Status permitido para o barbeiro deve pertencer estritamente ao enum operacional', () => {
    assert.match(
      rulesContent,
      /request\.resource\.data\.status in \['AGENDADO', 'CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU'\]/,
      'Status permitido para o profissional deve estar dentro da lista válida'
    );
  });

  it('8. Clientes e anônimos têm BLOQUEIO ABSOLUTO (DENY) em appointments.update', () => {
    // Verifica que não existe cláusula permitindo isCustomer ou anônimo no allow update
    const updateBlockMatch = rulesContent.match(/allow\s+update:\s*if\s*([\s\S]*?);/);
    assert.ok(updateBlockMatch, 'Deve conter bloco allow update em appointments');
    const updateCondition = updateBlockMatch[1];
    assert.strictEqual(
      updateCondition.includes('isCustomer'),
      false,
      'Clientes (customer) não podem atualizar agendamentos no Firestore'
    );
    assert.strictEqual(
      updateCondition.includes('true'),
      false,
      'Não pode haver permissão irrestrita true no update de agendamentos'
    );
  });

  it('9. Gestor/Proprietário é impedido de migrar agendamentos entre barbearias (tenantId imutável)', () => {
    assert.match(
      rulesContent,
      /isManagerOrOwnerOfTenant\(resource\.data\.tenantId\)\s*&&\s*request\.resource\.data\.tenantId == resource\.data\.tenantId/,
      'Gestor do tenant não pode transferir agendamentos para outro tenantId'
    );
  });

  it('10. Fechamento total de day_locks (subcoleção e raiz) no Client SDK (allow read, write: if false)', () => {
    // Subcoleção
    assert.match(
      rulesContent,
      /match\s+\/day_locks\/\{lockId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/,
      'day_locks deve estar completamente fechado (allow read, write: if false) no client-side'
    );
  });

  it('11. Chaves de idempotência (idempotency_keys) mantidas 100% blindadas no client-side', () => {
    assert.match(
      rulesContent,
      /match\s+\/idempotency_keys\/\{keyId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/,
      'idempotency_keys deve continuar estritamente fechado para client SDK'
    );
  });

  it('12. Projeção pública de disponibilidade (publicAvailability) mantém leitura pública e escrita exclusiva backend', () => {
    assert.match(
      rulesContent,
      /match\s+\/publicAvailability\/\{slotId\}\s*\{\s*allow\s+read:\s*if\s+true;\s*allow\s+write:\s*if\s+false;\s*\}/,
      'publicAvailability deve permitir leitura anônima de slots ocupados mas escrita estritamente negada no client'
    );
  });
});
