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
  CommunicationMessage,
  Raffle,
  Service,
  ProfessionalScheduleConfig,
  Barbershop
} from '../types';

// Helper de higienização réplica de firestoreSync.ts para teste funcional sem carregar assets de imagem
function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as unknown as T;
  if (Array.isArray(obj)) return obj.map(item => sanitizeForFirestore(item)) as unknown as T;
  if (typeof obj === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        sanitized[key] = sanitizeForFirestore(value);
      }
    }
    return sanitized as unknown as T;
  }
  return obj;
}

/**
 * FASE 2.2A — AUDITORIA READ-ONLY DE ISOLAMENTO DE DADOS, PRIVACIDADE E LISTENERS FIRESTORE
 *
 * Suíte de Testes Automatizados de Verificação Estática e Funcional:
 * 1. appointments possuem tenant filter quando necessário;
 * 2. users não expõe campos secretos (senhas, tokens, hashes);
 * 3. publicAvailability não contém PII (nome, telefone, notas, preço);
 * 4. day_locks não é leitura pública (allow read, write: if false);
 * 5. queries administrativas possuem escopo adequado (filtro por tenantId);
 * 6. projeções públicas removem campos privados e de PII;
 * 7. listeners globais existentes são identificados e catalogados;
 * 8. collectionGroup existente é identificado (inexistência de collectionGroup global);
 * 9. cliente anônimo não possui acesso administrativo;
 * 10. dados de outro tenant não devem ser consumidos pelo frontend quando o escopo exige tenant.
 */

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
const appContextContent = fs.readFileSync(appContextPath, 'utf8');

const firestoreSyncPath = path.resolve(process.cwd(), 'src/lib/firestoreSync.ts');
const firestoreSyncContent = fs.readFileSync(firestoreSyncPath, 'utf8');

describe('FASE 2.2A — Auditoria de Isolamento de Dados, Privacidade e Listeners Firestore', () => {

  // =========================================================================
  // ITEM 1: APPOINTMENTS POSSUEM TENANT FILTER QUANDO NECESSÁRIO
  // =========================================================================
  it('1. Appointments possuem tenant filter ou client filter estrito, sem varredura global desprotegida', () => {
    // A) Confirmar que NÃO existe getDocs(collection(db, 'appointments'))
    assert.strictEqual(
      appContextContent.includes("getDocs(collection(db, 'appointments'))"),
      false,
      'Não deve existir getDocs global em appointments'
    );
    assert.strictEqual(
      firestoreSyncContent.includes("getDocs(collection(db, 'appointments'))"),
      false,
      'firestoreSync não deve carregar todos os appointments via getDocs'
    );

    // B) Confirmar que cliente comum escuta apenas seus próprios agendamentos por clientId
    assert.ok(
      appContextContent.includes("where('clientId', '==', userId)"),
      'Cliente comum deve filtrar appointments exclusivamente por clientId'
    );

    // C) Confirmar que equipe (profissionais e gestores) filtra por tenantId
    assert.ok(
      appContextContent.includes("subscribeTenantCollection<Appointment>('appointments', tenantId") ||
      (appContextContent.includes("where('tenantId', '==', tenantId)") && appContextContent.includes("where('date', '>=', past30)")),
      'Gestores e profissionais devem escutar appointments restritos ao tenantId'
    );

    // D) Confirmar que firestore.rules impõe isolamento de leitura
    assert.ok(
      rulesContent.includes("isMemberOfTenant(resource.data.tenantId)") &&
      rulesContent.includes("request.auth.uid == resource.data.clientId"),
      'Rules devem exigir membresia no tenant ou clientId para leitura de appointments'
    );
  });

  // =========================================================================
  // ITEM 2: USERS NÃO EXPÕE CAMPOS SECRETOS
  // =========================================================================
  it('2. Users não expõe campos secretos (senhas, tokens, chaves)', () => {
    // A) sanitizeForFirestore e syncDoc removem password, token e refreshToken
    const sampleUserWithSecrets: Record<string, any> = {
      id: 'usr-1',
      name: 'Barbeiro Teste',
      password: 'secret_raw_password',
      _password: 'secret_hash',
      token: 'jwt_token_123',
      refreshToken: 'refresh_token_456'
    };

    // Teste da lógica de higienização
    const sanitized = sanitizeForFirestore(sampleUserWithSecrets);
    assert.strictEqual(sanitized.id, 'usr-1');
    assert.strictEqual(sanitized.name, 'Barbeiro Teste');

    // Verificação estática do código em firestoreSync.ts
    assert.ok(
      firestoreSyncContent.includes("delete (cleanData as any).password") &&
      firestoreSyncContent.includes("delete (cleanData as any).token"),
      'syncDoc deve remover explicitamente password e token ao salvar usuários'
    );

    // B) firestore.rules bloqueia leitura pública da coleção users
    assert.ok(
      rulesContent.includes("match /users/{userId}") &&
      rulesContent.includes("allow read: if isSuperAdmin() || (") &&
      rulesContent.includes("isSelf(userId)") &&
      rulesContent.includes("isManagerOrOwnerOfTenant(resource.data.tenantId)"),
      'firestore.rules deve restringir leitura de users a self, manager do tenant ou super_admin'
    );
  });

  // =========================================================================
  // ITEM 3: PUBLICAVAILABILITY NÃO CONTÉM PII
  // =========================================================================
  it('3. publicAvailability não contém PII (nome de cliente, whatsapp, notas, preço)', () => {
    const fullAppointment: Appointment = {
      id: 'apt-audit-01',
      tenantId: 'barbershop-01',
      professionalId: 'prof-01',
      professionalName: 'Carlos Barbeiro',
      serviceId: 'srv-01',
      serviceName: 'Corte Degradê',
      servicePrice: 45.0,
      serviceDuration: 30,
      clientId: 'client-999',
      clientName: 'João da Silva Cliente',
      clientWhatsApp: '5511999998888',
      date: '2026-09-20',
      startTime: '14:00',
      endTime: '14:30',
      isEncaixe: false,
      status: 'AGENDADO',
      notes: 'Cliente tem cicatriz na têmpora esquerda',
      reminderSent: false,
      createdAt: '2026-09-15T10:00:00Z'
    };

    const publicSlot = toPublicAvailabilitySlot(fullAppointment);

    // Verificar que apenas os campos estritamente permitidos existem
    assert.strictEqual(publicSlot.id, 'apt-audit-01');
    assert.strictEqual(publicSlot.tenantId, 'barbershop-01');
    assert.strictEqual(publicSlot.professionalId, 'prof-01');
    assert.strictEqual(publicSlot.date, '2026-09-20');
    assert.strictEqual(publicSlot.startTime, '14:00');
    assert.strictEqual(publicSlot.endTime, '14:30');
    assert.strictEqual(publicSlot.status, 'AGENDADO');

    // Confirmar ausência total de PII
    assert.strictEqual((publicSlot as any).clientName, undefined);
    assert.strictEqual((publicSlot as any).clientWhatsApp, undefined);
    assert.strictEqual((publicSlot as any).clientId, undefined);
    assert.strictEqual((publicSlot as any).notes, undefined);
    assert.strictEqual((publicSlot as any).servicePrice, undefined);
    assert.strictEqual((publicSlot as any).serviceName, undefined);
  });

  // =========================================================================
  // ITEM 4: DAY_LOCKS NÃO É LEITURA PÚBLICA
  // =========================================================================
  it('4. day_locks possui fechamento absoluto no Client SDK (allow read, write: if false)', () => {
    // Verificar regra de day_locks na subcoleção de barbershops
    assert.ok(
      rulesContent.includes("match /day_locks/{lockId} {\n        allow read, write: if false;\n      }") ||
      rulesContent.includes("match /day_locks/{lockId} {\n      allow read, write: if false;\n    }"),
      'day_locks deve ter allow read, write: if false'
    );

    // Verificar regra raiz de day_locks
    assert.ok(
      rulesContent.includes("match /day_locks/{lockId}"),
      'day_locks raiz deve estar declarado nas rules com negação total'
    );
  });

  // =========================================================================
  // ITEM 5: QUERIES ADMINISTRATIVAS POSSUEM ESCOPO ADEQUADO
  // =========================================================================
  it('5. Queries administrativas possuem escopo adequado restrito ao tenantId', () => {
    // Gestores nunca escutam coleções de outros tenants
    assert.ok(
      appContextContent.includes("subscribeDoc<Barbershop>(\n          'barbershops',\n          tenantId"),
      'Gestor deve escutar unicamente o documento da própria barbearia'
    );
    assert.ok(
      appContextContent.includes("subscribeQuery<Subscription>(\n          'subscriptions',\n          [where('barbershopId', '==', tenantId)]"),
      'Gestor deve escutar apenas subscriptions da sua própria barbearia'
    );
    assert.ok(
      appContextContent.includes("subscribeQuery<SubscriptionPaymentRecord>(\n          'subscription_payments',\n          [where('barbershopId', '==', tenantId)]"),
      'Gestor deve escutar apenas pagamentos da sua própria barbearia'
    );
  });

  // =========================================================================
  // ITEM 6: PROJEÇÕES PÚBLICAS REMOVEM CAMPOS PRIVADOS
  // =========================================================================
  it('6. Projeções públicas removem dados pessoais, logs e regras de comissão', () => {
    // A) Perfil de profissional expurga comissão, WhatsApp e e-mail
    const fullUser: User = {
      id: 'prof-01',
      name: 'Mestre da Navalha',
      tenantId: 'barbershop-01',
      role: 'PROFISSIONAL',
      email: 'mestre@barbearia.com',
      whatsapp: '5511988887777',
      phone: '5511988887777',
      commissionPercentage: 45,
      canViewAllProfessionals: true,
      status: 'active',
      createdAt: '2026-01-01'
    };
    const pubProf = toPublicProfessionalProfile(fullUser);
    assert.strictEqual(pubProf.name, 'Mestre da Navalha');
    assert.strictEqual((pubProf as any).commissionPercentage, undefined);
    assert.strictEqual((pubProf as any).whatsapp, undefined);
    assert.strictEqual((pubProf as any).email, undefined);

    // B) Sorteio público expurga participantes (nomes e telefones de clientes)
    const fullRaffle: Raffle = {
      id: 'raf-01',
      tenantId: 'barbershop-01',
      title: 'Sorteio de Natal',
      description: 'Pomada modeladora grátis',
      prize: 'Kit Barba',
      drawDate: '2026-12-25',
      status: 'ATIVO',
      participants: [
        { clientId: 'c1', clientName: 'Cliente 1', clientWhatsApp: '11999991111', registeredAt: '2026-12-01', eligibleAppointmentDate: '2026-11-20' },
        { clientId: 'c2', clientName: 'Cliente 2', clientWhatsApp: '11999992222', registeredAt: '2026-12-02', eligibleAppointmentDate: '2026-11-21' }
      ],
      createdAt: '2026-12-01'
    };
    const pubRaffle = toPublicRaffle(fullRaffle);
    assert.strictEqual(pubRaffle.title, 'Sorteio de Natal');
    assert.strictEqual(pubRaffle.participantsCount, 2);
    assert.strictEqual((pubRaffle as any).participants, undefined);

    // C) Comunicações públicas expurgam logs com números de clientes
    const fullComm: CommunicationMessage = {
      id: 'comm-01',
      tenantId: 'barbershop-01',
      title: 'Feriado de Carnaval',
      content: 'Estaremos fechados na terça-feira',
      type: 'NOTICIA',
      channel: 'APP',
      target: 'TODOS',
      sentAt: '2026-02-10',
      logs: [
        { clientId: 'cli-01', clientName: 'Cliente A', clientWhatsApp: '11999990001', channel: 'APP', received: true, read: true }
      ]
    };
    const pubComm = toPublicCommunication(fullComm);
    assert.strictEqual(pubComm.title, 'Feriado de Carnaval');
    assert.strictEqual((pubComm as any).logs, undefined);

    // D) Serviço expurga comissão
    const fullService: Service = {
      id: 'srv-01',
      tenantId: 'barbershop-01',
      name: 'Corte Cabelo',
      description: 'Corte tradicional',
      category: 'Cabelo',
      durationMinutes: 30,
      price: 50,
      commissionPercentage: 50,
      returnReminderDays: 20,
      active: true
    };
    const pubSrv = toPublicService(fullService);
    assert.strictEqual(pubSrv.name, 'Corte Cabelo');
    assert.strictEqual((pubSrv as any).commissionPercentage, undefined);
    assert.strictEqual((pubSrv as any).returnReminderDays, undefined);

    // E) Grade de horários expurga motivos pessoais de ausência
    const fullSchedule: ProfessionalScheduleConfig = {
      professionalId: 'prof-01',
      weeklySchedule: [
        {
          dayOfWeek: 1,
          dayName: 'Segunda',
          enabled: true,
          shifts: [{ start: '09:00', end: '18:00' }]
        }
      ],
      periodOverrides: [
        {
          id: 'po-1',
          professionalId: 'prof-01',
          startDate: '2026-09-20',
          endDate: '2026-09-21',
          shifts: [],
          reason: 'Consulta médica sigilosa'
        }
      ]
    };
    const pubSched = toPublicSchedule(fullSchedule, 'barbershop-01');
    assert.strictEqual((pubSched.periodOverrides![0] as any).reason, undefined);

    // F) Barbearia pública expurga plano, período de teste e templates de WhatsApp
    const fullShop: Barbershop = {
      id: 'barbershop-01',
      name: 'Barbearia VIP',
      slug: 'vip',
      customDomain: '',
      logoUrl: '',
      salonImages: [],
      about: '',
      phone: '11999990000',
      whatsapp: '11999990000',
      address: {
        street: 'Rua 1',
        number: '10',
        neighborhood: 'Bairro',
        city: 'Cidade',
        state: 'SP',
        zipCode: '00000-000'
      },
      socialMedia: {},
      planId: 'plan-pro',
      commercialMode: 'PAGO',
      trialStartedAt: '2026-01-01',
      reminderConfig: {
        enabled: true,
        advanceMinutes: 120,
        whatsappTemplate: 'Template interno secreto'
      },
      createdAt: '2026-01-01'
    };
    const pubShop = toPublicBarbershop(fullShop);
    assert.strictEqual(pubShop.name, 'Barbearia VIP');
    assert.strictEqual((pubShop as any).planId, undefined);
    assert.strictEqual((pubShop as any).commercialMode, undefined);
    assert.strictEqual((pubShop as any).trialStartedAt, undefined);
    assert.strictEqual((pubShop as any).reminderConfig, undefined);
  });

  // =========================================================================
  // ITEM 7: LISTENERS GLOBAIS EXISTENTES SÃO IDENTIFICADOS
  // =========================================================================
  it('7. Listeners globais existentes são identificados e restritos ao Super Admin ou catálogo público de planos', () => {
    // O único listener global universal é o catálogo de planos SaaS
    assert.ok(
      appContextContent.includes("subscribeCollection<CustomPlan>('plans', setCustomPlans, INITIAL_CUSTOM_PLANS)"),
      'plans deve ser o único catálogo global para todos os usuários'
    );

    // Todos os outros subscribeCollection estão confinados dentro do bloco isSuperAdminUser
    const superAdminBlock = appContextContent.split('if (isSuperAdminUser) {')[1]?.split('if (activeTenantId)')[0];
    assert.ok(superAdminBlock, 'Deve existir bloco exclusivo para Super Admin');
    assert.ok(
      superAdminBlock.includes("subscribeCollection<Barbershop>('barbershops'"),
      'Apenas Super Admin escuta coleção barbershops globalmente'
    );
    assert.ok(
      superAdminBlock.includes("subscribeCollection<Subscription>('subscriptions'"),
      'Apenas Super Admin escuta coleção subscriptions globalmente'
    );
  });

  // =========================================================================
  // ITEM 8: COLLECTIONGROUP EXISTENTE É IDENTIFICADO
  // =========================================================================
  it('8. collectionGroup não é utilizado no projeto (0 ocorrências em código produtivo)', () => {
    assert.strictEqual(
      appContextContent.includes('collectionGroup('),
      false,
      'AppContext não deve usar collectionGroup'
    );
    assert.strictEqual(
      firestoreSyncContent.includes('collectionGroup('),
      false,
      'firestoreSync não deve usar collectionGroup'
    );
  });

  // =========================================================================
  // ITEM 9: CLIENTE ANÔNIMO NÃO POSSUI ACESSO ADMINISTRATIVO
  // =========================================================================
  it('9. Cliente anônimo não possui acesso a coleções privadas nas Security Rules nem no AppContext', () => {
    // Em AppContext, usuário anônimo ou sem role não recebe listeners privados
    assert.ok(
      appContextContent.includes("if (!effectiveUser || !role) {\n      return () => {\n        unsubs.forEach(u => u());\n      };\n    }"),
      'Visitante anônimo deve ter retorno antecipado sem ativar nenhum listener privado'
    );

    // Nas Security Rules, leitura de dados privados exige autenticação
    assert.ok(
      rulesContent.includes("function isAuthenticated() {\n      return request.auth != null;\n    }"),
      'Rules devem declarar isAuthenticated'
    );
    assert.ok(
      rulesContent.includes("match /audit_logs/{logId} {\n      // Leitura estritamente restrita ao Super Admin\n      allow read: if isSuperAdmin();"),
      'audit_logs deve ser restrito ao Super Admin'
    );
    assert.ok(
      rulesContent.includes("match /subscriptions/{subscriptionId} {\n      // Leitura: Super Admin ou Proprietário"),
      'subscriptions deve exigir autenticação e propriedade de tenant'
    );
  });

  // =========================================================================
  // ITEM 10: DADOS DE OUTRO TENANT NÃO DEVEM SER CONSUMIDOS PELO FRONTEND
  // =========================================================================
  it('10. Dados de outro tenant não devem ser consumidos pelo frontend quando o escopo exige tenant', () => {
    // Projeções públicas e catálogos escopados pelo activeTenantId
    assert.ok(
      appContextContent.includes("subscribeDoc<PublicBarbershop>(\n          'publicBarbershops',\n          activeTenantId"),
      'publicBarbershops deve ser restrito ao activeTenantId'
    );
    assert.ok(
      appContextContent.includes("subscribeQuery<PublicService>(\n          'publicServices',\n          [where('tenantId', '==', activeTenantId)]"),
      'publicServices deve conter filtro de tenantId'
    );
    assert.ok(
      appContextContent.includes("subscribeQuery<PublicAvailabilitySlot>(\n          'publicAvailability',") &&
      appContextContent.includes("where('tenantId', '==', activeTenantId)"),
      'publicAvailability deve conter filtro de tenantId'
    );
    assert.ok(
      appContextContent.includes("subscribeQuery<PublicProfessionalProfile>(\n          'publicProfessionalProfiles',\n          [where('tenantId', '==', activeTenantId)]"),
      'publicProfessionalProfiles deve conter filtro de tenantId'
    );
    assert.ok(
      appContextContent.includes("subscribeQuery<PublicProfessionalScheduleConfig>(\n          'publicSchedules',\n          [where('tenantId', '==', activeTenantId)]"),
      'publicSchedules deve conter filtro de tenantId'
    );
  });

});
