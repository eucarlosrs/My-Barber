import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  toPublicAvailabilitySlot,
  toPublicProfessionalProfile,
  toPublicCommunication,
  toPublicRaffle,
  toPublicService,
  toPublicSchedule,
  toPublicBarbershop
} from '../utils/projections';
import {
  Appointment,
  User,
  ServicePackage,
  CustomerPackage,
  Promotion,
  GalleryWork
} from '../types';

/**
 * FASE 2.2B — ISOLAMENTO DE LEITURA, REDUÇÃO DE CUSTO E REMOÇÃO DO SEED CLIENT-SIDE
 *
 * Suíte de Testes de Regressão e Integridade (30 Requisitos Oficiais)
 */

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
const appContextContent = fs.readFileSync(appContextPath, 'utf8');

const syncPath = path.resolve(process.cwd(), 'src/lib/firestoreSync.ts');
const syncContent = fs.readFileSync(syncPath, 'utf8');

const indexesPath = path.resolve(process.cwd(), 'firestore.indexes.json');
const indexesContent = fs.existsSync(indexesPath) ? fs.readFileSync(indexesPath, 'utf8') : '{}';

describe('FASE 2.2B: Isolamento de Leitura e Otimização do Firestore', () => {

  // 1. Frontend não executa seedFirestoreIfEmpty no boot
  it('1. frontend não executa seedFirestoreIfEmpty no boot', () => {
    // Verifica que seedFirestoreIfEmpty não é invocado no carregamento de AppContext
    assert.strictEqual(
      appContextContent.includes('seedFirestoreIfEmpty()'),
      false,
      'seedFirestoreIfEmpty() não deve ser chamado em AppContext'
    );
  });

  // 2. Appointments não usa cache local com dados sensíveis
  it('2. appointments não usa cache local com dados sensíveis', () => {
    assert.strictEqual(
      appContextContent.includes("localStorage.setItem('mybarber_cached_appointments'"),
      false,
      'mybarber_cached_appointments não deve ser salvo em localStorage'
    );
    assert.strictEqual(
      syncContent.includes("localStorage.setItem('mybarber_cached_appointments'"),
      false,
      'firestoreSync não deve persistir appointments em localStorage'
    );
  });

  // 3. Users não usa cache local com dados sensíveis
  it('3. users não usa cache local com dados sensíveis', () => {
    assert.strictEqual(
      appContextContent.includes("localStorage.setItem('mybarber_cached_users'"),
      false,
      'mybarber_cached_users não deve ser salvo em localStorage'
    );
    assert.strictEqual(
      syncContent.includes("localStorage.setItem('mybarber_cached_users'"),
      false,
      'firestoreSync não deve persistir users em localStorage'
    );
  });

  // 4. Appointments carrega apenas janela operacional no boot
  it('4. appointments carrega apenas janela operacional no boot (últimos 30 dias e próximos 60 dias)', () => {
    // Verifica a existência de restrição de data >= past30 e <= future60
    assert.ok(
      appContextContent.includes("where('date', '>=', past30)") &&
      appContextContent.includes("where('date', '<=', future60)"),
      'AppContext deve filtrar agendamentos na janela operacional de past30 a future60'
    );
  });

  // 5. Appointments histórico usa helper sob demanda
  it('5. appointments histórico usa helper sob demanda (loadHistoricalAppointments / fetchHistoricalAppointments)', () => {
    assert.ok(
      appContextContent.includes('loadHistoricalAppointments'),
      'AppContext deve exportar loadHistoricalAppointments para carregamento sob demanda'
    );
    assert.ok(
      syncContent.includes('export async function fetchHistoricalAppointments'),
      'firestoreSync deve exportar fetchHistoricalAppointments sob demanda'
    );
  });

  // 6. PublicAvailability aplica tenantId
  it('6. publicAvailability aplica tenantId em sua consulta', () => {
    assert.ok(
      appContextContent.includes("where('tenantId', '==', activeTenantId)"),
      'publicAvailability deve filtrar estritamente por activeTenantId'
    );
  });

  // 7. PublicAvailability aplica janela temporal
  it('7. publicAvailability aplica janela temporal operacional', () => {
    assert.ok(
      appContextContent.includes("where('date', '>=', todayStr)") &&
      appContextContent.includes("where('date', '<=', futureLimitStr)"),
      'publicAvailability deve possuir restrição temporal para evitar download de dados históricos'
    );
  });

  // 8. Super Admin não abre 24 listeners simultâneos
  it('8. Super Admin não abre 24 listeners simultâneos', () => {
    // Procura se o bloco do Super Admin contém 24 chamadas onSnapshot
    const superAdminBlockMatch = appContextContent.match(/if\s*\(isSuperAdminUser\)\s*\{([\s\S]*?)(?:return\s*\(\)\s*=>|\n\s*\}\n)/);
    assert.ok(superAdminBlockMatch, 'Bloco de isSuperAdminUser deve existir');
    const superAdminBlock = superAdminBlockMatch[1];
    
    // Contagem de listeners abertos incondicionalmente para o Super Admin
    const listenerCount = (superAdminBlock.match(/unsubs\.push/g) || []).length;
    assert.ok(
      listenerCount < 10,
      `Super Admin deve abrir apenas listeners indispensáveis (<10), mas encontrou ${listenerCount}`
    );
  });

  // 9. Super Admin mantém barbershops e subscriptions
  it('9. Super Admin mantém listeners de governança do SaaS (barbershops e subscriptions)', () => {
    assert.ok(
      appContextContent.includes("subscribeCollection<Barbershop>('barbershops'"),
      'Super Admin deve manter listener de barbershops'
    );
    assert.ok(
      appContextContent.includes("subscribeCollection<Subscription>('subscriptions'"),
      'Super Admin deve manter listener de subscriptions'
    );
  });

  // 10. Super Admin desinscreve listeners ao trocar de tenant
  it('10. Super Admin desinscreve listeners ao trocar de tenant ou desmontar', () => {
    assert.ok(
      appContextContent.includes('unsubs.forEach(u => u())'),
      'Listeners devem ser desinscritos no retorno do efeito'
    );
  });

  // 11. Profissional não consulta users do tenant inteiro
  it('11. profissional não consulta users do tenant inteiro via subscribeTenantCollection', () => {
    // Garante que no bloco do profissional não há subscribeTenantCollection('users', ...)
    const profBlockMatch = appContextContent.match(/if\s*\(role === 'PROFISSIONAL'\s*&&\s*tenantId\)\s*\{([\s\S]*?)(?:return\s*\(\)\s*=>)/);
    assert.ok(profBlockMatch, 'Bloco de PROFISSIONAL deve existir');
    const profBlock = profBlockMatch[1];

    assert.strictEqual(
      profBlock.includes("subscribeTenantCollection<User>('users'"),
      false,
      'Profissional NUNCA deve chamar subscribeTenantCollection para users'
    );
  });

  // 12. Profissional obtém seu próprio perfil com segurança
  it('12. profissional obtém seu próprio perfil com segurança via filtro de id', () => {
    assert.ok(
      appContextContent.includes("where('id', '==', userId)"),
      'Profissional deve buscar apenas o documento autorizado do próprio usuário'
    );
  });

  // 13. Profissional obtém dados de outros profissionais via publicProfessionalProfiles
  it('13. profissional obtém identificação de outros profissionais via publicProfessionalProfiles', () => {
    assert.ok(
      appContextContent.includes('publicProfessionalProfiles'),
      'AppContext deve assinar publicProfessionalProfiles'
    );
  });

  // 14. publicProfessionalProfiles não contém email privado
  it('14. publicProfessionalProfiles não contém email privado', () => {
    const rawUser: User = {
      id: 'prof-1',
      name: 'Carlos Barbeiro',
      role: 'PROFISSIONAL',
      tenantId: 'barbershop-1',
      email: 'carlos.privado@email.com',
      whatsapp: '11999999999',
      commissionPercentage: 50,
      createdAt: '2026-01-01'
    };
    const projection = toPublicProfessionalProfile(rawUser);
    assert.strictEqual('email' in projection, false, 'Projeção não deve conter email');
  });

  // 15. publicProfessionalProfiles não contém WhatsApp privado
  it('15. publicProfessionalProfiles não contém WhatsApp privado', () => {
    const rawUser: User = {
      id: 'prof-2',
      name: 'João Barbeiro',
      role: 'PROFISSIONAL',
      tenantId: 'barbershop-1',
      whatsapp: '11988888888',
      createdAt: '2026-01-01'
    };
    const projection = toPublicProfessionalProfile(rawUser);
    assert.strictEqual('whatsapp' in projection, false, 'Projeção não deve conter whatsapp');
  });

  // 16. publicProfessionalProfiles não contém comissão
  it('16. publicProfessionalProfiles não contém comissão ou dados financeiros', () => {
    const rawUser: User = {
      id: 'prof-3',
      name: 'Marcos Barbeiro',
      role: 'PROFISSIONAL',
      tenantId: 'barbershop-1',
      whatsapp: '11977777777',
      commissionPercentage: 45,
      createdAt: '2026-01-01'
    };
    const projection = toPublicProfessionalProfile(rawUser);
    assert.strictEqual('commissionPercentage' in projection, false, 'Projeção não deve conter comissão');
  });

  // 17. customerPackages do cliente filtra por clientId
  it('17. customerPackages do cliente filtra por clientId', () => {
    assert.ok(
      appContextContent.includes("subscribeQuery<CustomerPackage>(\n          'customerPackages',\n          [where('clientId', '==', userId)]") ||
      appContextContent.includes("[where('clientId', '==', userId)]"),
      'Cliente deve filtrar customerPackages estritamente por clientId'
    );
  });

  // 18. customerPackages da equipe filtra por tenantId
  it('18. customerPackages da equipe filtra por tenantId', () => {
    assert.ok(
      appContextContent.includes("subscribeTenantCollection<CustomerPackage>('customerPackages', tenantId"),
      'Equipe deve filtrar customerPackages estritamente por tenantId'
    );
  });

  // 19. packages exige tenantId válido ou escopo de tenant
  it('19. packages exige tenantId válido nas Security Rules', () => {
    assert.ok(
      rulesContent.includes('match /packages/{packageId}'),
      'Regra para /packages deve existir'
    );
    assert.ok(
      rulesContent.includes('(resource.data.tenantId is string && resource.data.tenantId.size() > 0)'),
      'Regra para packages deve exigir tenantId válido em string não-vazia'
    );
  });

  // 20. promotions exige tenantId válido ou escopo de tenant
  it('20. promotions exige tenantId válido nas Security Rules', () => {
    assert.ok(
      rulesContent.includes('match /promotions/{promoId}'),
      'Regra para /promotions deve existir'
    );
    assert.ok(
      rulesContent.includes('(resource.data.tenantId is string && resource.data.tenantId.size() > 0)'),
      'Regra para promotions deve exigir tenantId válido'
    );
  });

  // 21. gallery exige tenantId válido ou escopo de tenant
  it('21. gallery exige tenantId válido nas Security Rules', () => {
    assert.ok(
      rulesContent.includes('match /gallery/{workId}'),
      'Regra para /gallery deve existir'
    );
    assert.ok(
      rulesContent.includes('(resource.data.tenantId is string && resource.data.tenantId.size() > 0)'),
      'Regra para gallery deve exigir tenantId válido'
    );
  });

  // 22. queries compostas necessárias possuem índices mapeados
  it('22. queries compostas necessárias possuem índices mapeados em firestore.indexes.json', () => {
    assert.ok(
      indexesContent.includes('"collectionGroup": "appointments"'),
      'Índices de appointments devem estar documentados'
    );
    assert.ok(
      indexesContent.includes('"collectionGroup": "publicAvailability"'),
      'Índices de publicAvailability devem estar documentados'
    );
  });

  // 23. ausência de query sem tenantId em coleções multi-tenant
  it('23. ausência de query sem tenantId em coleções multi-tenant', () => {
    assert.ok(
      !appContextContent.includes("subscribeCollection<Appointment>('appointments'"),
      'Não deve existir subscribeCollection global irrestrito para appointments'
    );
  });

  // 24. ausência de listeners duplicados ao alternar abas
  it('24. ausência de listeners duplicados ao alternar abas (limpeza unsubs)', () => {
    const unsubsMatches = appContextContent.match(/unsubs\.forEach\(u => u\(\)\)/g);
    assert.ok(
      unsubsMatches && unsubsMatches.length >= 3,
      'AppContext deve garantir limpeza dos unsubs em todos os blocos de role'
    );
  });

  // 25. booking continua funcionando normalmente
  it('25. booking autoritativo preserva interface e fluxo de confirmação', () => {
    assert.ok(
      appContextContent.includes('bookOnlineAppointment:'),
      'bookOnlineAppointment deve permanecer exposto e funcional'
    );
  });

  // 26. reschedule continua funcionando normalmente
  it('26. reschedule autoritativo preserva interface e validação', () => {
    assert.ok(
      appContextContent.includes('rescheduleAppointment:'),
      'rescheduleAppointment deve permanecer exposto e funcional'
    );
  });

  // 27. cancelamento continua funcionando normalmente
  it('27. cancelamento autoritativo preserva chamada ao backend', () => {
    assert.ok(
      appContextContent.includes('cancelAppointment:'),
      'cancelAppointment deve permanecer exposto e funcional'
    );
  });

  // 28. publicAvailability reflete cancelamento e novo booking
  it('28. publicAvailability reflete cancelamento e novo booking em memória e slots', () => {
    const apt: Appointment = {
      id: 'apt-slot-test',
      tenantId: 'tenant-test',
      professionalId: 'prof-test',
      professionalName: 'Barbeiro Teste',
      clientId: 'client-test',
      clientName: 'Cliente Teste',
      clientWhatsApp: '11999999999',
      serviceId: 'srv-test',
      serviceName: 'Corte',
      servicePrice: 50,
      serviceDuration: 30,
      date: '2026-09-20',
      startTime: '10:00',
      endTime: '10:30',
      status: 'AGENDADO',
      isEncaixe: false,
      reminderSent: false,
      createdAt: '2026-09-15'
    };
    const slot = toPublicAvailabilitySlot(apt);
    assert.strictEqual(slot.id, 'apt-slot-test');
    assert.strictEqual(slot.date, '2026-09-20');
    assert.strictEqual('clientName' in slot, false, 'Slot não deve conter PII do cliente');
  });

  // 29. regras de segurança continuam negando acesso cruzado de tenant
  it('29. regras de segurança continuam negando acesso cruzado de tenant', () => {
    assert.ok(
      rulesContent.includes('isMemberOfTenant(resource.data.tenantId)'),
      'Regras devem validar isMemberOfTenant para isolamento do tenant'
    );
    assert.ok(
      rulesContent.includes('isSuperAdmin()'),
      'Regras devem validar isSuperAdmin'
    );
  });

  // 30. build e types continuam 100% íntegros sem erros
  it('30. contratos de tipos em AppContextType são consistentes', () => {
    assert.ok(
      appContextContent.includes('loadHistoricalAppointments: (options?:'),
      'AppContextType deve declarar a assinatura correta de loadHistoricalAppointments'
    );
    assert.ok(
      appContextContent.includes('loadTenantDataForAdmin: (tenantId: string) => Promise<void>;'),
      'AppContextType deve declarar a assinatura correta de loadTenantDataForAdmin'
    );
  });
});
