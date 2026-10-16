import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * FASE 2.2B — AUDITORIA DE VALIDAÇÃO FINAL (ESTRITAMENTE ESTÁTICA / READ-ONLY)
 *
 * 18 Testes Mínimos Obrigatórios da Auditoria Final
 */

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
const appContextContent = fs.readFileSync(appContextPath, 'utf8');

const syncPath = path.resolve(process.cwd(), 'src/lib/firestoreSync.ts');
const syncContent = fs.readFileSync(syncPath, 'utf8');

const clientAppViewPath = path.resolve(process.cwd(), 'src/components/app/ClientAppView.tsx');
const clientAppViewContent = fs.readFileSync(clientAppViewPath, 'utf8');

describe('FASE 2.2B: Auditoria de Validação Final (Static Analysis)', () => {

  // 1. packages não possui read público cross-tenant
  it('1. packages não possui read público cross-tenant', () => {
    const match = rulesContent.match(/match\s+\/packages\/\{packageId\}\s*\{([\s\S]*?)\}/);
    assert.ok(match, 'Bloco de regras de packages deve existir');
    const ruleBlock = match[1];
    assert.strictEqual(
      ruleBlock.includes('allow read: if true;'),
      false,
      'packages NUNCA deve conter allow read: if true;'
    );
  });

  // 2. promotions não possui read público cross-tenant
  it('2. promotions não possui read público cross-tenant', () => {
    const match = rulesContent.match(/match\s+\/promotions\/\{promoId\}\s*\{([\s\S]*?)\}/);
    assert.ok(match, 'Bloco de regras de promotions deve existir');
    const ruleBlock = match[1];
    assert.strictEqual(
      ruleBlock.includes('allow read: if true;'),
      false,
      'promotions NUNCA deve conter allow read: if true;'
    );
  });

  // 3. gallery não possui read público cross-tenant
  it('3. gallery não possui read público cross-tenant', () => {
    const match = rulesContent.match(/match\s+\/gallery\/\{workId\}\s*\{([\s\S]*?)\}/);
    assert.ok(match, 'Bloco de regras de gallery deve existir');
    const ruleBlock = match[1];
    assert.strictEqual(
      ruleBlock.includes('allow read: if true;'),
      false,
      'gallery NUNCA deve conter allow read: if true;'
    );
  });

  // 4. queries públicas permanecem tenant-scoped
  it('4. queries públicas permanecem tenant-scoped', () => {
    assert.ok(
      appContextContent.includes("subscribeTenantCollection<ServicePackage>('packages', tenantId") ||
      appContextContent.includes("where('tenantId', '==', activeTenantId)"),
      'queries de catálogo devem ser estritamente escopadas por tenant'
    );
  });

  // 5. publicAvailability possui tenant filter
  it('5. publicAvailability possui tenant filter', () => {
    const pubIndex = appContextContent.indexOf("'publicAvailability'");
    assert.ok(pubIndex !== -1, 'Chamada de publicAvailability deve existir em AppContext');
    const snippet = appContextContent.substring(pubIndex, pubIndex + 400);
    assert.ok(
      snippet.includes("where('tenantId', '==', activeTenantId)"),
      'publicAvailability deve conter filtro explícito de tenantId'
    );
  });

  // 6. publicAvailability possui date filter
  it('6. publicAvailability possui date filter', () => {
    const pubIndex = appContextContent.indexOf("'publicAvailability'");
    assert.ok(pubIndex !== -1, 'Chamada de publicAvailability deve existir em AppContext');
    const snippet = appContextContent.substring(pubIndex, pubIndex + 400);
    assert.ok(
      snippet.includes("where('date', '>=', todayStr)") && snippet.includes("where('date', '<=', futureLimitStr)"),
      'publicAvailability deve conter filtros temporais hoje e +60 dias'
    );
  });

  // 7. publicAvailability não possui escrita client-side
  it('7. publicAvailability não possui escrita client-side (allow write: if false;)', () => {
    const match = rulesContent.match(/match\s+\/publicAvailability\/\{slotId\}\s*\{([\s\S]*?)\}/);
    assert.ok(match, 'Bloco de publicAvailability deve existir nas rules');
    assert.ok(
      match[1].includes('allow write: if false;'),
      'publicAvailability deve possuir allow write: if false;'
    );
  });

  // 8. não existe leitura global de publicAvailability
  it('8. não existe leitura global de publicAvailability', () => {
    assert.strictEqual(
      appContextContent.includes("subscribeCollection<PublicAvailabilitySlot>('publicAvailability'"),
      false,
      'Não deve existir subscribeCollection para publicAvailability'
    );
    assert.strictEqual(
      appContextContent.includes("collection(db, 'publicAvailability')"),
      false,
      'AppContext não deve fazer getDocs irrestrito em publicAvailability'
    );
  });

  // 9. fetchPublicAvailabilityForDate continua específica por data (ou syncAppointmentWithLock por professional/data)
  it('9. consultas de disponibilidade por slot são específicas por data', () => {
    assert.ok(
      syncContent.includes("where('date', '==', appointment.date)"),
      'syncAppointmentWithLock deve consultar estritamente a data do agendamento'
    );
  });

  // 10. Super Admin não possui os antigos 24 listeners globais
  it('10. Super Admin não possui os antigos 24 listeners globais (< 5 listeners no boot)', () => {
    const saBlock = appContextContent.match(/if\s*\(isSuperAdminUser\)\s*\{([\s\S]*?)(?:return\s*\(\)\s*=>|\n\s*\}\n)/);
    assert.ok(saBlock, 'Bloco de Super Admin deve existir');
    const listenerCount = (saBlock[1].match(/unsubs\.push/g) || []).length;
    assert.ok(
      listenerCount < 10,
      `Super Admin deve abrir apenas listeners essenciais (< 10), mas encontrou ${listenerCount}`
    );
  });

  // 11. loadTenantDataForAdmin é tenant-scoped
  it('11. loadTenantDataForAdmin é tenant-scoped', () => {
    const fnMatch = appContextContent.match(/const\s+loadTenantDataForAdmin\s*=\s*async\s*\(([\s\S]*?)\n\s*\};/);
    assert.ok(fnMatch, 'loadTenantDataForAdmin deve existir');
    const fnBody = fnMatch[0];
    assert.ok(
      fnBody.includes("where('tenantId', '==', targetTenantId)"),
      'Todas as queries de loadTenantDataForAdmin devem conter where tenantId'
    );
    assert.strictEqual(
      fnBody.includes('onSnapshot'),
      false,
      'loadTenantDataForAdmin não deve conter listeners permanentes'
    );
  });

  // 12. troca de tenant desinscreve listeners anteriores
  it('12. troca de tenant desinscreve listeners anteriores', () => {
    assert.ok(
      appContextContent.includes('unsubs.forEach(u => u())'),
      'Efeito de listeners multi-tenant deve desinscrever todos os unsubs no cleanup'
    );
    assert.ok(
      appContextContent.includes('activeTenantId'),
      'activeTenantId deve estar nas dependências do efeito de isolamento'
    );
  });

  // 13. não existem caches de appointments/users no localStorage
  it('13. não existem caches de appointments/users no localStorage', () => {
    assert.strictEqual(
      appContextContent.includes("localStorage.setItem('mybarber_cached_appointments'"),
      false,
      'mybarber_cached_appointments não deve ser gravado'
    );
    assert.strictEqual(
      appContextContent.includes("localStorage.setItem('mybarber_cached_users'"),
      false,
      'mybarber_cached_users não deve ser gravado'
    );
    assert.strictEqual(
      syncContent.includes("localStorage.setItem('mybarber_cached_appointments'"),
      false,
      'firestoreSync não deve gravar appointments em localStorage'
    );
    assert.strictEqual(
      syncContent.includes("localStorage.setItem('mybarber_cached_users'"),
      false,
      'firestoreSync não deve gravar users em localStorage'
    );
  });

  // 14. localStorage não contém credenciais
  it('14. localStorage não contém credenciais (senhas, private tokens, admin claims)', () => {
    const localStorageMatches = appContextContent.match(/localStorage\.setItem\(([^)]+)\)/g) || [];
    for (const statement of localStorageMatches) {
      assert.strictEqual(
        statement.includes('password') || statement.includes('token') || statement.includes('secret'),
        false,
        `localStorage não deve conter credenciais: ${statement}`
      );
    }
  });

  // 15. booking/reschedule/cancel continuam no backend
  it('15. booking/reschedule/cancel continuam no backend', () => {
    assert.ok(
      appContextContent.includes("fetch('/api/appointments/book'"),
      'bookOnlineAppointment deve chamar /api/appointments/book'
    );
    assert.ok(
      appContextContent.includes("fetch('/api/appointments/reschedule'"),
      'rescheduleAppointment deve chamar /api/appointments/reschedule'
    );
    assert.ok(
      appContextContent.includes("fetch('/api/appointments/cancel'"),
      'cancelAppointment deve chamar /api/appointments/cancel'
    );
  });

  // 16. day_locks continua client-deny
  it('16. day_locks continua client-deny', () => {
    const match = rulesContent.match(/match\s+\/day_locks\/\{lockId\}\s*\{([\s\S]*?)\}/);
    assert.ok(match, 'Bloco de day_locks deve existir');
    assert.ok(
      match[1].includes('allow read, write: if false;'),
      'day_locks deve ser completamente negado no Client SDK'
    );
  });

  // 17. idempotency_keys continua client-deny
  it('17. idempotency_keys continua client-deny', () => {
    const match = rulesContent.match(/match\s+\/idempotency_keys\/\{keyId\}\s*\{([\s\S]*?)\}/);
    assert.ok(match, 'Bloco de idempotency_keys deve existir');
    assert.ok(
      match[1].includes('allow read, write: if false;'),
      'idempotency_keys deve ser completamente negado no Client SDK'
    );
  });

  // 18. nenhuma Security Rule crítica foi enfraquecida
  it('18. nenhuma Security Rule crítica foi enfraquecida', () => {
    assert.ok(
      rulesContent.includes('isMemberOfTenant(resource.data.tenantId)'),
      'isMemberOfTenant deve permanecer como pilar'
    );
    assert.ok(
      rulesContent.includes('isSuperAdmin()'),
      'isSuperAdmin deve permanecer como pilar'
    );
    assert.ok(
      rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
      'Default deny global deve ser mantido'
    );
  });
});
