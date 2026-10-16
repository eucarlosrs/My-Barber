import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('ETAPA 2.2J — Correção de Listeners e Queries Globais Multi-Tenant', () => {
  const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
  const firestoreSyncPath = path.resolve(process.cwd(), 'src/lib/firestoreSync.ts');

  const appContextContent = fs.readFileSync(appContextPath, 'utf8');
  const firestoreSyncContent = fs.readFileSync(firestoreSyncPath, 'utf8');

  // =========================================================================
  // 1. VERIFICAÇÃO DO HELPER subscribeDoc EM firestoreSync.ts
  // =========================================================================
  it('1. Deve exportar a função subscribeDoc em firestoreSync.ts para leitura direta de doc por ID', () => {
    assert.strictEqual(
      firestoreSyncContent.includes('export function subscribeDoc<T>('),
      true,
      'firestoreSync.ts deve conter export function subscribeDoc<T>'
    );
    assert.strictEqual(
      firestoreSyncContent.includes("const docRef = doc(db, collectionName, docId);"),
      true,
      'subscribeDoc deve utilizar doc(db, collectionName, docId)'
    );
  });

  // =========================================================================
  // 2. ELIMINAÇÃO DE LEITURA GLOBAL DE BARBERSHOPS NA INICIALIZAÇÃO
  // =========================================================================
  it('2. Inicialização (mount) NÃO deve conter subscribeCollection(\'barbershops\') global desnecessário', () => {
    // Localiza o bloco do primeiro useEffect (inicialização global)
    const initialEffectMatch = appContextContent.match(
      /\/\/ Real-time Firestore synchronization for global catalogs[\s\S]*?useEffect\(\(\) => {([\s\S]*?)}, \[\]\);/
    );
    assert.ok(initialEffectMatch, 'Primeiro useEffect de inicialização global deve existir');
    const initialEffectCode = initialEffectMatch[1];

    assert.strictEqual(
      initialEffectCode.includes("subscribeCollection<Barbershop>('barbershops'"),
      false,
      'O useEffect de montagem NÃO deve chamar subscribeCollection(\'barbershops\')'
    );
    assert.strictEqual(
      initialEffectCode.includes("subscribeCollection<PublicBarbershop>('publicBarbershops'"),
      false,
      'O useEffect de montagem NÃO deve baixar todas as publicBarbershops globalmente'
    );
    assert.strictEqual(
      initialEffectCode.includes("subscribeCollection<PublicService>('publicServices'"),
      false,
      'O useEffect de montagem NÃO deve baixar publicServices de todos os tenants'
    );
  });

  // =========================================================================
  // 3. CATÁLOGO GLOBAL LEGÍTIMO DE PLANOS
  // =========================================================================
  it('3. Catálogo SaaS de planos deve permanecer como leitura global legítima', () => {
    const initialEffectMatch = appContextContent.match(
      /\/\/ Real-time Firestore synchronization for global catalogs[\s\S]*?useEffect\(\(\) => {([\s\S]*?)}, \[\]\);/
    );
    assert.ok(initialEffectMatch, 'Primeiro useEffect deve existir');
    const initialEffectCode = initialEffectMatch[1];

    assert.strictEqual(
      initialEffectCode.includes("subscribeCollection<CustomPlan>('plans'"),
      true,
      'Planos do SaaS MY BARBER devem ser mantidos como leitura global legítima'
    );
  });

  // =========================================================================
  // 4. PROJEÇÕES PÚBLICAS RESTRITAS AO activeTenantId
  // =========================================================================
  it('4. Projeções públicas e catálogos no contexto de barbearia devem ser estritamente tenant-scoped', () => {
    // Projeções públicas devem utilizar where('tenantId', '==', activeTenantId)
    const collectionsToCheck = [
      'publicServices',
      'publicAvailability',
      'publicProfessionalProfiles',
      'publicSchedules',
      'publicCommunications',
      'publicRaffles',
      'packages',
      'promotions',
      'gallery'
    ];

    for (const col of collectionsToCheck) {
      const pattern = new RegExp(
        `subscribeQuery<[A-Za-z0-9_]+>\\(\\s*['"]${col}['"],\\s*\\[[\\s\\S]*?where\\(['"]tenantId['"],\\s*['"]==['"],\\s*activeTenantId\\)`
      );
      assert.ok(
        pattern.test(appContextContent),
        `Coleção ${col} deve ser consultada com where('tenantId', '==', activeTenantId)`
      );
    }
  });

  // =========================================================================
  // 5. BARBEARIA PÚBLICA VIA DOCUMENTO ESPECÍFICO (SEM LEITURA PRIVADA)
  // =========================================================================
  it('5. Dados da barbearia para clientes/visitantes devem ler publicBarbershops/{activeTenantId} via subscribeDoc', () => {
    const pubShopDocPattern = /subscribeDoc<PublicBarbershop>\(\s*['"]publicBarbershops['"],\s*activeTenantId/;
    assert.ok(
      pubShopDocPattern.test(appContextContent),
      'Cliente/visitante deve ler publicBarbershops por activeTenantId via subscribeDoc'
    );
  });

  // =========================================================================
  // 6. GESTORES E PROPRIETÁRIOS: LEITURA RESTRITA AO PRÓPRIO TENANT
  // =========================================================================
  it('6. Gestores/Proprietários devem ler estritamente o barbershops/{tenantId} do seu próprio tenant', () => {
    const managerDocPattern = /subscribeDoc<Barbershop>\(\s*['"]barbershops['"],\s*tenantId/;
    assert.ok(
      managerDocPattern.test(appContextContent),
      'Gestor deve ler barbershops/{tenantId} via subscribeDoc em vez de ler a coleção inteira'
    );
  });

  // =========================================================================
  // 7. SUPER ADMIN: ACESSO GLOBAL LEGÍTIMO PRESERVADO (GOVERNANÇA DO SAAS)
  // =========================================================================
  it('7. Super Admin deve manter acesso global legítimo nas coleções administrativas', () => {
    const superAdminBlockMatch = appContextContent.match(
      /if \(isSuperAdminUser\) {([\s\S]*?)return \(\) => {/
    );
    assert.ok(superAdminBlockMatch, 'Bloco de listeners do Super Admin deve existir');
    const saCode = superAdminBlockMatch[1];

    assert.ok(saCode.includes("subscribeCollection<Barbershop>('barbershops'"), 'Super Admin deve poder ler barbershops globalmente');
    assert.ok(saCode.includes("subscribeCollection<Subscription>('subscriptions'"), 'Super Admin deve poder ler subscriptions globalmente');
  });

  // =========================================================================
  // 8. AUSÊNCIA DE VULNERABILIDADE: NÃO USAR users/{uid} COMO AUTORIDADE DUAL
  // =========================================================================
  it('8. Verificação de Super Admin deve respeitar Custom Claims authClaims?.isSuperAdmin', () => {
    assert.ok(
      appContextContent.includes('authClaims?.isSuperAdmin === true') ||
      appContextContent.includes("authClaims?.role === 'super_admin'"),
      'Verificação de autorização do Super Admin deve considerar claims emitidos'
    );
  });
});
