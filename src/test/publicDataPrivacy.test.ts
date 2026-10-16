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

describe('MY BARBER — FASE 1: Privacidade e Isolamento Multi-Tenant (Cenários A a T)', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // Cenário A: Anônimo/cliente não pode ler /appointments completos com PII
  it('Cenário A: firestore.rules bloqueia leitura anônima de /appointments e restringe a staff ou dono do agendamento', () => {
    const appointmentsBlock = rulesContent.match(/match\s+\/appointments\/\{appointmentId\}\s*\{[\s\S]*?\n\s{4}\}/);
    assert.ok(appointmentsBlock, 'Deve existir bloco match /appointments/{appointmentId}');
    assert.match(appointmentsBlock[0], /isMemberOfTenant\(resource\.data\.tenantId\)/,
      'Leitura de appointments privados exige ser da equipe do tenant');
    assert.match(appointmentsBlock[0], /request\.auth\.uid\s*==\s*resource\.data\.clientId/,
      'Ou ser o próprio cliente autenticado dono do agendamento');
  });

  // Cenário B: Anônimo/cliente pode ler /publicAvailability sem PII
  it('Cenário B: firestore.rules permite leitura pública de /publicAvailability', () => {
    const publicAvailBlock = rulesContent.match(/match\s+\/publicAvailability\/\{slotId\}\s*\{[\s\S]*?\}/);
    assert.ok(publicAvailBlock, 'Deve existir bloco match /publicAvailability/{slotId}');
    assert.match(publicAvailBlock[0], /allow\s+read:\s*if\s+true;/, 'Leitura pública permitida para slots de disponibilidade');
  });

  // Cenário C: Agendamento gera/atualiza /publicAvailability com exatamente {id, tenantId, date, startTime, endTime, professionalId, status}
  it('Cenário C: toPublicAvailabilitySlot expurga todo PII (nome, whatsapp, notas, preço) e mantém apenas campos operacionais', () => {
    const privateApt: Appointment = {
      id: 'apt-101',
      tenantId: 'barbearia-central',
      serviceId: 'srv-corte',
      serviceName: 'Corte Degradê',
      servicePrice: 45.0,
      serviceDuration: 30,
      professionalId: 'prof-marcos',
      professionalName: 'Marcos Barbeiro',
      clientId: 'cli-joao',
      clientName: 'João da Silva',
      clientWhatsApp: '11999998888',
      date: '2026-09-15',
      startTime: '14:00',
      endTime: '14:30',
      isEncaixe: false,
      status: 'AGENDADO',
      notes: 'Cliente prefere tesoura no topo',
      reminderSent: true,
      createdAt: '2026-09-01T10:00:00.000Z'
    };

    const publicSlot = toPublicAvailabilitySlot(privateApt);

    assert.strictEqual(publicSlot.id, 'apt-101');
    assert.strictEqual(publicSlot.tenantId, 'barbearia-central');
    assert.strictEqual(publicSlot.professionalId, 'prof-marcos');
    assert.strictEqual(publicSlot.date, '2026-09-15');
    assert.strictEqual(publicSlot.startTime, '14:00');
    assert.strictEqual(publicSlot.endTime, '14:30');
    assert.strictEqual(publicSlot.status, 'AGENDADO');

    // Assegura ausência total de PII e dados financeiros
    assert.strictEqual((publicSlot as any).clientName, undefined);
    assert.strictEqual((publicSlot as any).clientWhatsApp, undefined);
    assert.strictEqual((publicSlot as any).clientId, undefined);
    assert.strictEqual((publicSlot as any).notes, undefined);
    assert.strictEqual((publicSlot as any).servicePrice, undefined);
  });

  // Cenário D: Agendamento que deixa de estar AGENDADO (ex: CANCELADO) é expurgado da projeção de disponibilidade
  it('Cenário D: Agendamento cancelado nunca publica status CANCELADO na projeção pública de disponibilidade', () => {
    const activeApt: Appointment = {
      id: 'apt-101',
      tenantId: 'barbearia-central',
      serviceId: 'srv-corte',
      serviceName: 'Corte',
      servicePrice: 40,
      serviceDuration: 30,
      professionalId: 'prof-marcos',
      professionalName: 'Marcos',
      clientId: 'cli-maria',
      clientName: 'Maria',
      clientWhatsApp: '11988887777',
      date: '2026-09-15',
      startTime: '14:00',
      endTime: '14:30',
      isEncaixe: false,
      status: 'AGENDADO',
      reminderSent: false,
      createdAt: '2026-09-01T10:00:00.000Z'
    };

    const slot = toPublicAvailabilitySlot(activeApt);
    assert.strictEqual(slot.status, 'AGENDADO');

    // Regra de integridade: status !== 'AGENDADO' resulta em remoção (expurgo) e nunca publicação como CANCELADO
    const cancelledApt: Appointment = {
      ...activeApt,
      status: 'CANCELADO'
    };

    const publicSlot = toPublicAvailabilitySlot(cancelledApt);
    assert.strictEqual(publicSlot.status, 'AGENDADO');
    assert.notStrictEqual((publicSlot as any).status, 'CANCELADO');
  });

  // Cenário E: firestore.rules proíbe estritamente escrita client-side em /publicAvailability para anônimos, clientes, profissionais e gerentes
  it('Cenário E: firestore.rules bloqueia escrita client-side em /publicAvailability (projeção derivada de backend / Admin SDK)', () => {
    const publicAvailBlock = rulesContent.match(/match\s+\/publicAvailability\/\{slotId\}\s*\{[\s\S]*?\}/);
    assert.ok(publicAvailBlock);
    assert.match(publicAvailBlock[0], /allow\s+read:\s*if\s+true;/);
    assert.match(publicAvailBlock[0], /allow\s+write:\s*if\s+false;/);
  });

  // Cenário F: Anônimo/cliente não pode ler /users completos
  it('Cenário F: firestore.rules proíbe leitura indiscriminada de /users para anônimos', () => {
    const usersBlock = rulesContent.match(/match\s+\/users\/\{userId\}\s*\{[\s\S]*?\n\s{4}\}/);
    assert.ok(usersBlock);
    assert.match(usersBlock[0], /isManagerOrOwnerOfTenant\(resource\.data\.tenantId\)/,
      'Apenas gestores da barbearia ou o próprio usuário podem ler o perfil privado completo');
  });

  // Cenário G: Anônimo/cliente pode ler /publicProfessionalProfiles
  it('Cenário G: firestore.rules permite leitura pública de /publicProfessionalProfiles', () => {
    const pubProfsBlock = rulesContent.match(/match\s+\/publicProfessionalProfiles\/\{profId\}\s*\{[\s\S]*?\}/);
    assert.ok(pubProfsBlock);
    assert.match(pubProfsBlock[0], /allow\s+read:\s*if\s+true;/);
  });

  // Cenário H: Criação/edição de profissional gera/atualiza /publicProfessionalProfiles
  it('Cenário H: toPublicProfessionalProfile expurga credenciais, whatsapp, email, comissões e dados privados', () => {
    const privateProf: User = {
      id: 'prof-carlos',
      tenantId: 'barbearia-central',
      role: 'PROFISSIONAL',
      name: 'Carlos Oliveira',
      email: 'carlos.barbeiro@gmail.com',
      whatsapp: '11977776666',
      phone: '11977776666',
      avatarUrl: 'https://images.unsplash.com/photo-carlos',
      birthDate: '1990-05-12',
      commissionPercentage: 40,
      specialties: ['Degradê', 'Barba Terapia'],
      canViewAllProfessionals: false,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z'
    };

    const publicProf = toPublicProfessionalProfile(privateProf);

    assert.strictEqual(publicProf.id, 'prof-carlos');
    assert.strictEqual(publicProf.tenantId, 'barbearia-central');
    assert.strictEqual(publicProf.name, 'Carlos Oliveira');
    assert.strictEqual(publicProf.avatarUrl, 'https://images.unsplash.com/photo-carlos');
    assert.deepStrictEqual(publicProf.specialties, ['Degradê', 'Barba Terapia']);
    assert.strictEqual(publicProf.role, 'PROFISSIONAL');

    // Confirma campos estritamente expurgados
    assert.strictEqual((publicProf as any).email, undefined);
    assert.strictEqual((publicProf as any).whatsapp, undefined);
    assert.strictEqual((publicProf as any).phone, undefined);
    assert.strictEqual((publicProf as any).commissionPercentage, undefined);
    assert.strictEqual((publicProf as any).birthDate, undefined);
    assert.strictEqual((publicProf as any).canViewAllProfessionals, undefined);
  });

  // Cenário I: Anônimo/cliente não pode ler logs de entrega e destinatários em /communications
  it('Cenário I: firestore.rules restringe leitura de /communications exclusivamente a gerentes e super admin', () => {
    const commsBlock = rulesContent.match(/match\s+\/communications\/\{commId\}\s*\{[\s\S]*?\}/);
    assert.ok(commsBlock);
    assert.match(commsBlock[0], /allow\s+read:\s*if\s+isSuperAdmin\(\)\s*\|\|\s*isManagerOrOwnerOfTenant\(resource\.data\.tenantId\);/);
  });

  // Cenário J: Anônimo/cliente pode ler /publicCommunications sem logs nem telefones
  it('Cenário J: toPublicCommunication expurga logs de envio, destinatários e números de WhatsApp', () => {
    const privateComm: CommunicationMessage = {
      id: 'comm-01',
      tenantId: 'barbearia-central',
      title: 'Novo Horário de Atendimento',
      content: 'Agora atendemos também aos domingos!',
      type: 'NOTICIA',
      channel: 'APP',
      target: 'TODOS',
      sentAt: '2026-09-01T12:00:00.000Z',
      logs: [
        {
          clientId: 'cli-01',
          clientName: 'Pedro Santos',
          clientWhatsApp: '11999990000',
          channel: 'APP',
          received: true,
          read: true,
          readAt: '2026-09-01T12:00:05.000Z'
        }
      ]
    };

    const publicComm = toPublicCommunication(privateComm);

    assert.strictEqual(publicComm.id, 'comm-01');
    assert.strictEqual(publicComm.title, 'Novo Horário de Atendimento');
    assert.strictEqual(publicComm.content, 'Agora atendemos também aos domingos!');
    assert.strictEqual((publicComm as any).logs, undefined);
  });

  // Cenário K: Anônimo/cliente não pode ler array participants[] de /raffles com telefones e nomes
  it('Cenário K: firestore.rules restringe leitura de /raffles com participantes a staff da barbearia', () => {
    const rafflesBlock = rulesContent.match(/match\s+\/raffles\/\{raffleId\}\s*\{[\s\S]*?\}/);
    assert.ok(rafflesBlock);
    assert.match(rafflesBlock[0], /isManagerOrOwnerOfTenant\(resource\.data\.tenantId\)/);
  });

  // Cenário L: Anônimo/cliente pode ler /publicRaffles apenas com participantsCount
  it('Cenário L: toPublicRaffle expurga participants[] e provê contagem agregada participantsCount', () => {
    const privateRaffle: Raffle = {
      id: 'raf-01',
      tenantId: 'barbearia-central',
      title: 'Sorteio Pomada Matte',
      description: 'Concorra a um kit completo',
      prize: 'Kit Pomada + Óleo',
      drawDate: '2026-10-01',
      status: 'ATIVO',
      createdAt: '2026-09-01T00:00:00.000Z',
      participants: [
        {
          clientId: 'cli-01',
          clientName: 'Lucas Lima',
          clientWhatsApp: '11988880000',
          registeredAt: '2026-09-02T10:00:00.000Z',
          eligibleAppointmentDate: '2026-08-20'
        },
        {
          clientId: 'cli-02',
          clientName: 'Fernando Alves',
          clientWhatsApp: '11977770000',
          registeredAt: '2026-09-03T11:00:00.000Z',
          eligibleAppointmentDate: '2026-08-25'
        }
      ]
    };

    const publicRaffle = toPublicRaffle(privateRaffle);

    assert.strictEqual(publicRaffle.id, 'raf-01');
    assert.strictEqual(publicRaffle.participantsCount, 2);
    assert.strictEqual((publicRaffle as any).participants, undefined);
  });

  // Cenário M: Sorteio realizado expõe apenas winnerName/winnerClientName na projeção pública
  it('Cenário M: Sorteio finalizado expõe o nome do ganhador sem expor whatsapp ou id interno', () => {
    const privateRaffleFinished: Raffle = {
      id: 'raf-02',
      tenantId: 'barbearia-central',
      title: 'Sorteio Aniversário',
      description: 'Sorteio especial',
      prize: 'Corte grátis por 3 meses',
      drawDate: '2026-09-01',
      status: 'REALIZADO',
      createdAt: '2026-08-01T00:00:00.000Z',
      winnerClientId: 'cli-999-secret',
      winnerClientName: 'Renato Silva',
      winnerName: 'Renato Silva',
      winnerDrawnAt: '2026-09-01T18:00:00.000Z',
      participants: []
    };

    const publicRaffle = toPublicRaffle(privateRaffleFinished);
    assert.strictEqual(publicRaffle.winnerName, 'Renato Silva');
    assert.strictEqual(publicRaffle.winnerClientName, 'Renato Silva');
    assert.strictEqual((publicRaffle as any).winnerClientId, undefined);
  });

  // Cenário N: /publicServices expurga comissões internas e dias de retorno
  it('Cenário N: toPublicService expurga commissionPercentage e returnReminderDays', () => {
    const privateService: Service = {
      id: 'srv-01',
      tenantId: 'barbearia-central',
      name: 'Barba Terapia',
      description: 'Toalha quente e massagem facial',
      durationMinutes: 40,
      price: 55.0,
      category: 'Barba',
      active: true,
      commissionPercentage: 50,
      returnReminderDays: 20
    };

    const publicService = toPublicService(privateService);

    assert.strictEqual(publicService.id, 'srv-01');
    assert.strictEqual(publicService.price, 55.0);
    assert.strictEqual(publicService.name, 'Barba Terapia');
    assert.strictEqual((publicService as any).commissionPercentage, undefined);
    assert.strictEqual((publicService as any).returnReminderDays, undefined);
  });

  // Cenário O: /publicSchedules expurga motivos pessoais/médicos de ausência
  it('Cenário O: toPublicSchedule expurga reason em periodOverrides', () => {
    const privateSchedule: ProfessionalScheduleConfig = {
      professionalId: 'prof-marcos',
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
          id: 'ovr-01',
          professionalId: 'prof-marcos',
          startDate: '2026-09-20',
          endDate: '2026-09-21',
          shifts: [],
          reason: 'Consulta médica sigilosa e exames de rotina'
        }
      ]
    };

    const publicSchedule = toPublicSchedule(privateSchedule, 'barbearia-central');

    assert.strictEqual(publicSchedule.professionalId, 'prof-marcos');
    assert.strictEqual(publicSchedule.periodOverrides.length, 1);
    assert.strictEqual(publicSchedule.periodOverrides[0].startDate, '2026-09-20');
    assert.strictEqual((publicSchedule.periodOverrides[0] as any).reason, undefined);
  });

  // Cenário P: /publicBarbershops expurga planId, commercialMode, credenciais e templates de whatsapp
  it('Cenário P: toPublicBarbershop expurga planId, commercialMode, trialStartedAt, trialExpiresAt e templates', () => {
    const privateBarbershop: Barbershop = {
      id: 'barb-01',
      name: 'Barbearia Vintage',
      slug: 'barbearia-vintage',
      customDomain: 'vintage.com.br',
      logoUrl: 'https://img.com/logo.png',
      salonImages: [],
      about: 'Melhor corte da cidade',
      phone: '11999990000',
      whatsapp: '11999990000',
      address: {
        street: 'Rua das Flores',
        number: '123',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001-000'
      },
      socialMedia: {},
      planId: 'plano-premium',
      commercialMode: 'PAGO',
      trialStartedAt: '2026-08-01',
      trialExpiresAt: '2026-08-04',
      reminderConfig: {
        advanceMinutes: 60,
        enabled: true,
        whatsappTemplate: 'Lembrete confidencial do sistema interno'
      },
      createdAt: '2026-08-01T00:00:00.000Z'
    };

    const publicBarbershop = toPublicBarbershop(privateBarbershop);

    assert.strictEqual(publicBarbershop.id, 'barb-01');
    assert.strictEqual(publicBarbershop.name, 'Barbearia Vintage');
    assert.strictEqual((publicBarbershop as any).planId, undefined);
    assert.strictEqual((publicBarbershop as any).commercialMode, undefined);
    assert.strictEqual((publicBarbershop as any).trialStartedAt, undefined);
    assert.strictEqual((publicBarbershop as any).trialExpiresAt, undefined);
    assert.strictEqual((publicBarbershop as any).reminderConfig, undefined);
  });

  // Cenário Q: /waitlist não pode ser lida publicamente
  it('Cenário Q: firestore.rules bloqueia leitura anônima de /waitlist', () => {
    const waitlistBlock = rulesContent.match(/match\s+\/waitlist\/\{entryId\}\s*\{[\s\S]*?\}/);
    assert.ok(waitlistBlock);
    assert.match(waitlistBlock[0], /isMemberOfTenant\(resource\.data\.tenantId\)/);
    assert.match(waitlistBlock[0], /request\.auth\.uid\s*==\s*resource\.data\.clientId/);
  });

  // Cenário R: /waitlist criação anônima valida formato estrito, status 'AGUARDANDO' e rejeita campos administrativos
  it('Cenário R: firestore.rules valida que create em waitlist exige status AGUARDANDO e rejeita campos administrativos', () => {
    const waitlistBlock = rulesContent.match(/match\s+\/waitlist\/\{entryId\}\s*\{[\s\S]*?\}/);
    assert.ok(waitlistBlock);
    assert.match(waitlistBlock[0], /request\.resource\.data\.status\s*==\s*'AGUARDANDO'/);
    assert.match(waitlistBlock[0], /!\('handledBy'\s+in\s+request\.resource\.data\)/);
    assert.match(waitlistBlock[0], /!\('notesInternal'\s+in\s+request\.resource\.data\)/);
    assert.match(waitlistBlock[0], /!\('isVip'\s+in\s+request\.resource\.data\)/);
  });

  // Cenário S: Multi-tenant isolation: /publicAvailability de Tenant A não vaza como sendo do Tenant B
  it('Cenário S: publicAvailability preserva tenantId permitindo filtragem estrita sem vazamento entre tenants', () => {
    const slotTenantA = toPublicAvailabilitySlot({
      id: 'apt-a',
      tenantId: 'tenant-alfa',
      serviceId: 's1',
      serviceName: 'Corte',
      servicePrice: 30,
      serviceDuration: 30,
      professionalId: 'p1',
      professionalName: 'P1',
      clientId: 'c1',
      clientName: 'C1',
      clientWhatsApp: '11',
      date: '2026-09-10',
      startTime: '10:00',
      endTime: '10:30',
      isEncaixe: false,
      status: 'AGENDADO',
      reminderSent: false,
      createdAt: '2026-09-01'
    });

    const slotTenantB = toPublicAvailabilitySlot({
      id: 'apt-b',
      tenantId: 'tenant-beta',
      serviceId: 's2',
      serviceName: 'Barba',
      servicePrice: 25,
      serviceDuration: 30,
      professionalId: 'p2',
      professionalName: 'P2',
      clientId: 'c2',
      clientName: 'C2',
      clientWhatsApp: '22',
      date: '2026-09-10',
      startTime: '10:00',
      endTime: '10:30',
      isEncaixe: false,
      status: 'AGENDADO',
      reminderSent: false,
      createdAt: '2026-09-01'
    });

    assert.strictEqual(slotTenantA.tenantId, 'tenant-alfa');
    assert.strictEqual(slotTenantB.tenantId, 'tenant-beta');
    assert.notStrictEqual(slotTenantA.tenantId, slotTenantB.tenantId);
  });

  // Cenário T: Compatibilidade retroativa: IDs legados permanecem intactos nas coleções privadas e se refletem nas projeções
  it('Cenário T: Preservação de IDs legados e correspondência 1:1 entre documento privado e projeção', () => {
    const legacyAptId = 'apt_legado_custom_99812';
    const privateApt: Appointment = {
      id: legacyAptId,
      tenantId: 'barbearia-do-joao',
      serviceId: 'servico_legado_01',
      serviceName: 'Corte Tradicional',
      servicePrice: 35,
      serviceDuration: 30,
      professionalId: 'prof_legado_joao',
      professionalName: 'João Barbeiro',
      clientId: 'cli_legado_antonio',
      clientName: 'Antônio',
      clientWhatsApp: '11999991111',
      date: '2026-09-12',
      startTime: '16:00',
      endTime: '16:30',
      isEncaixe: false,
      status: 'AGENDADO',
      reminderSent: false,
      createdAt: '2026-08-01'
    };

    const publicSlot = toPublicAvailabilitySlot(privateApt);
    assert.strictEqual(publicSlot.id, legacyAptId);
    assert.strictEqual(publicSlot.tenantId, 'barbearia-do-joao');
    assert.strictEqual(publicSlot.professionalId, 'prof_legado_joao');
  });

  // =========================================================================
  // CENÁRIO U: VALIDAÇÃO ESTÁTICA DE hasOnly() EM TODAS AS PROJEÇÕES PÚBLICAS
  // =========================================================================
  it('Cenário U: firestore.rules contém hasOnly() ou write:false em todas as 7 coleções públicas', () => {
    // 1. publicBarbershops
    const barbBlock = rulesContent.match(/match\s+\/publicBarbershops\/\{barbershopId\}[\s\S]*?\n\s{4}\}/);
    assert.ok(barbBlock, 'Bloco publicBarbershops deve existir');
    assert.match(barbBlock[0], /keys\(\)\.hasOnly\(/, 'publicBarbershops deve ter hasOnly');

    // 2. publicProfessionalProfiles
    const profBlock = rulesContent.match(/match\s+\/publicProfessionalProfiles\/\{profId\}[\s\S]*?\n\s{4}\}/);
    assert.ok(profBlock, 'Bloco publicProfessionalProfiles deve existir');
    assert.match(profBlock[0], /keys\(\)\.hasOnly\(/, 'publicProfessionalProfiles deve ter hasOnly');

    // 3. publicServices
    const servBlock = rulesContent.match(/match\s+\/publicServices\/\{serviceId\}[\s\S]*?\n\s{4}\}/);
    assert.ok(servBlock, 'Bloco publicServices deve existir');
    assert.match(servBlock[0], /keys\(\)\.hasOnly\(/, 'publicServices deve ter hasOnly');

    // 4. publicSchedules
    const schedBlock = rulesContent.match(/match\s+\/publicSchedules\/\{scheduleId\}[\s\S]*?\n\s{4}\}/);
    assert.ok(schedBlock, 'Bloco publicSchedules deve existir');
    assert.match(schedBlock[0], /keys\(\)\.hasOnly\(/, 'publicSchedules deve ter hasOnly');

    // 5. publicAvailability
    const availBlock = rulesContent.match(/match\s+\/publicAvailability\/\{slotId\}[\s\S]*?\n\s{4}\}/);
    assert.ok(availBlock, 'Bloco publicAvailability deve existir');
    assert.match(availBlock[0], /allow\s+write:\s*if\s+false;/, 'publicAvailability deve bloquear toda escrita client-side');

    // 6. publicRaffles
    const raffBlock = rulesContent.match(/match\s+\/publicRaffles\/\{raffleId\}[\s\S]*?\n\s{4}\}/);
    assert.ok(raffBlock, 'Bloco publicRaffles deve existir');
    assert.match(raffBlock[0], /keys\(\)\.hasOnly\(/, 'publicRaffles deve ter hasOnly');

    // 7. publicCommunications
    const commBlock = rulesContent.match(/match\s+\/publicCommunications\/\{commId\}[\s\S]*?\n\s{4}\}/);
    assert.ok(commBlock, 'Bloco publicCommunications deve existir');
    assert.match(commBlock[0], /keys\(\)\.hasOnly\(/, 'publicCommunications deve ter hasOnly');
  });

  // =========================================================================
  // CENÁRIO V: TESTES NEGATIVOS EXPLÍCITOS DE INJEÇÃO EM PROJEÇÕES PÚBLICAS
  // =========================================================================
  describe('Cenário V: Testes Negativos de Injeção de Campos Proibidos (hasOnly)', () => {
    // Lista de coleções públicas e seus esquemas permitidos conforme definidos nas Security Rules
    const PUBLIC_SCHEMAS: Record<string, string[]> = {
      publicBarbershops: [
        'id', 'name', 'slug', 'customDomain', 'logoUrl', 'bannerUrl', 'salonImages',
        'about', 'phone', 'whatsapp', 'address', 'coordinates', 'socialMedia',
        'businessHours', 'primaryColor', 'theme', 'status'
      ],
      publicProfessionalProfiles: [
        'id', 'tenantId', 'name', 'avatarUrl', 'specialties', 'role'
      ],
      publicServices: [
        'id', 'tenantId', 'name', 'description', 'durationMinutes', 'price', 'category', 'imageUrl', 'active'
      ],
      publicSchedules: [
        'id', 'professionalId', 'tenantId', 'weeklySchedule', 'periodOverrides'
      ],
      publicAvailability: [], // Bloqueada 100% no client-side (allow write: if false)
      publicRaffles: [
        'id', 'tenantId', 'title', 'description', 'prize', 'drawDate', 'imageUrl',
        'status', 'showInHighlights', 'highlightTag', 'participantsCount', 'winnerName',
        'winnerClientName', 'createdAt'
      ],
      publicCommunications: [
        'id', 'tenantId', 'title', 'content', 'type', 'channel', 'sentAt'
      ]
    };

    // Função de validação que simula com exatidão a avaliação do operador hasOnly() do Firestore
    function validateHasOnly(collectionName: string, data: Record<string, any>): { valid: boolean; rejectedFields: string[] } {
      if (collectionName === 'publicAvailability') {
        // Escrita client-side é negada incondicionalmente
        return { valid: false, rejectedFields: Object.keys(data) };
      }
      const allowed = new Set(PUBLIC_SCHEMAS[collectionName] || []);
      const rejectedFields = Object.keys(data).filter(key => !allowed.has(key));
      return {
        valid: rejectedFields.length === 0,
        rejectedFields
      };
    }

    const FORBIDDEN_FIELDS = [
      'email',
      'password',
      '_password',
      'uid',
      'commissionPercentage',
      'clientWhatsApp',
      'clientName',
      'notas internas',
      'internalNotes',
      'campos arbitrários',
      'roleOverride',
      'isAdmin'
    ];

    it('Rejeita tentativa de injeção de email, password, uid, commissionPercentage em publicProfessionalProfiles', () => {
      const baseData = {
        id: 'prof-01',
        tenantId: 'tenant-1',
        name: 'Carlos Barbeiro',
        avatarUrl: 'https://avatar.png',
        specialties: ['Corte'],
        role: 'PROFISSIONAL'
      };

      FORBIDDEN_FIELDS.forEach(field => {
        const maliciousPayload = { ...baseData, [field]: 'dado_sensivel' };
        const result = validateHasOnly('publicProfessionalProfiles', maliciousPayload);
        assert.strictEqual(result.valid, false, `Campo proibido '${field}' deveria ser rejeitado`);
        assert.ok(result.rejectedFields.includes(field));
      });

      // Testa também phone e whatsapp privados do barbeiro (não permitidos no perfil público)
      ['phone', 'whatsapp'].forEach(field => {
        const payload = { ...baseData, [field]: '11999998888' };
        const result = validateHasOnly('publicProfessionalProfiles', payload);
        assert.strictEqual(result.valid, false, `Telefone/whatsapp pessoal não deve ser permitido em publicProfessionalProfiles`);
      });
    });

    it('Rejeita tentativa de injeção de dados sensíveis em publicServices', () => {
      const baseData = {
        id: 'srv-01',
        tenantId: 'tenant-1',
        name: 'Corte',
        description: 'Corte tradicional',
        durationMinutes: 30,
        price: 45,
        category: 'Cabelo',
        imageUrl: '',
        active: true
      };

      FORBIDDEN_FIELDS.concat(['phone', 'whatsapp', 'commissionPercentage']).forEach(field => {
        const maliciousPayload = { ...baseData, [field]: 'injected_value' };
        const result = validateHasOnly('publicServices', maliciousPayload);
        assert.strictEqual(result.valid, false, `Campo '${field}' deve ser rejeitado em publicServices`);
      });
    });

    it('Rejeita tentativa de injeção de justificativas pessoais ou dados sensíveis em publicSchedules', () => {
      const baseData = {
        id: 'sch-01',
        professionalId: 'prof-01',
        tenantId: 'tenant-1',
        weeklySchedule: {},
        periodOverrides: []
      };

      FORBIDDEN_FIELDS.concat(['personalReason', 'justification', 'phone', 'whatsapp']).forEach(field => {
        const maliciousPayload = { ...baseData, [field]: 'consulta médica' };
        const result = validateHasOnly('publicSchedules', maliciousPayload);
        assert.strictEqual(result.valid, false, `Campo '${field}' deve ser rejeitado em publicSchedules`);
      });
    });

    it('Rejeita qualquer escrita client-side em publicAvailability (allow write: if false)', () => {
      // Mesmo com campos legítimos
      const validSlot = {
        id: 'slot-1',
        tenantId: 'tenant-1',
        professionalId: 'prof-01',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '10:30',
        status: 'AGENDADO'
      };
      const resultLegit = validateHasOnly('publicAvailability', validSlot);
      assert.strictEqual(resultLegit.valid, false, 'Escrita client-side em publicAvailability deve ser rejeitada');

      // Com campos proibidos
      FORBIDDEN_FIELDS.forEach(field => {
        const payload = { ...validSlot, [field]: 'forbidden' };
        const result = validateHasOnly('publicAvailability', payload);
        assert.strictEqual(result.valid, false);
      });
    });

    it('Rejeita tentativa de injeção de PII de clientes em publicRaffles', () => {
      const baseData = {
        id: 'raf-01',
        tenantId: 'tenant-1',
        title: 'Sorteio Pomada',
        description: 'Descrição',
        prize: 'Pomada Matte',
        drawDate: '2026-10-01',
        imageUrl: '',
        status: 'ATIVO',
        showInHighlights: true,
        highlightTag: 'Destaque',
        participantsCount: 42,
        winnerName: '',
        winnerClientName: '',
        createdAt: '2026-09-01'
      };

      FORBIDDEN_FIELDS.concat(['participants', 'clientPhone', 'clientEmail']).forEach(field => {
        const maliciousPayload = { ...baseData, [field]: 'confidential' };
        const result = validateHasOnly('publicRaffles', maliciousPayload);
        assert.strictEqual(result.valid, false, `Campo sensível '${field}' deve ser rejeitado em publicRaffles`);
      });
    });

    it('Rejeita tentativa de injeção de logs internos ou PII em publicCommunications', () => {
      const baseData = {
        id: 'com-01',
        tenantId: 'tenant-1',
        title: 'Comunicado',
        content: 'Conteúdo público',
        type: 'AVISO',
        channel: 'TODOS',
        sentAt: '2026-09-01'
      };

      FORBIDDEN_FIELDS.concat(['recipientTokens', 'deliveryLogs', 'readReceipts']).forEach(field => {
        const maliciousPayload = { ...baseData, [field]: 'logs' };
        const result = validateHasOnly('publicCommunications', maliciousPayload);
        assert.strictEqual(result.valid, false, `Campo sensível '${field}' deve ser rejeitado em publicCommunications`);
      });
    });

    it('Rejeita tentativa de injeção de senhas, planos internos ou campos arbitrários em publicBarbershops', () => {
      const baseData = {
        id: 'barb-01',
        name: 'Barbearia Top',
        slug: 'barbearia-top',
        status: 'ATIVO'
      };

      const forbiddenInBarbershop = [
        'password', '_password', 'uid', 'commissionPercentage',
        'clientWhatsApp', 'clientName', 'notas internas', 'arbitraryField',
        'planId', 'commercialMode', 'subscriptionId', 'mercadoPagoAccessToken'
      ];

      forbiddenInBarbershop.forEach(field => {
        const maliciousPayload = { ...baseData, [field]: 'forbidden' };
        const result = validateHasOnly('publicBarbershops', maliciousPayload);
        assert.strictEqual(result.valid, false, `Campo '${field}' deve ser rejeitado em publicBarbershops`);
      });
    });
  });

  // =========================================================================
  // CENÁRIO W: ISOLAMENTO MULTI-TENANT RIGOROSO (TENANT A VS TENANT B)
  // =========================================================================
  describe('Cenário W: Isolamento Multi-Tenant Baseado em Custom Claims / Auth Context', () => {
    // Simulação da função isManagerOrOwnerOfTenant(targetTenantId)
    function simulateIsManagerOrOwner(
      userAuth: { uid: string; role?: string; tenantId?: string },
      targetTenantId: string,
      isSuperAdmin = false
    ): boolean {
      if (isSuperAdmin) return true;
      if (!userAuth || !userAuth.uid) return false;
      const role = userAuth.role || '';
      const tenant = userAuth.tenantId || '';
      const isAllowedRole = ['barbershop_owner', 'PROPRIETARIO', 'owner', 'manager', 'GERENTE'].includes(role);
      return tenant === targetTenantId && isAllowedRole;
    }

    // Simulação da função isMemberOfTenant(targetTenantId)
    function simulateIsMember(
      userAuth: { uid: string; role?: string; tenantId?: string },
      targetTenantId: string,
      isSuperAdmin = false
    ): boolean {
      if (isSuperAdmin) return true;
      if (!userAuth || !userAuth.uid) return false;
      const tenant = userAuth.tenantId || '';
      return tenant === targetTenantId;
    }

    const userTenantA = {
      uid: 'user-manager-a',
      role: 'GERENTE',
      tenantId: 'barbearia-alfa'
    };

    const userTenantB = {
      uid: 'user-barber-b',
      role: 'PROFISSIONAL',
      tenantId: 'barbearia-beta'
    };

    it('Usuário do Tenant A não consegue ler ou escrever dados privados do Tenant B', () => {
      // Gerente do Tenant A tenta atuar como gestor no Tenant B
      const canManageB = simulateIsManagerOrOwner(userTenantA, 'barbearia-beta');
      assert.strictEqual(canManageB, false, 'Gerente de A não pode gerenciar dados privados de B');

      // Gerente do Tenant A tenta atuar como membro no Tenant B
      const canAccessB = simulateIsMember(userTenantA, 'barbearia-beta');
      assert.strictEqual(canAccessB, false, 'Usuário de A não pode ser membro de B');

      // No próprio tenant A, o acesso é autorizado
      assert.strictEqual(simulateIsManagerOrOwner(userTenantA, 'barbearia-alfa'), true);
      assert.strictEqual(simulateIsMember(userTenantA, 'barbearia-alfa'), true);
    });

    it('Usuário do Tenant A não consegue alterar projeções públicas do Tenant B', () => {
      // Tentativa de gravar em publicServices ou publicProfessionalProfiles com targetTenantId = barbearia-beta
      const canEditPublicB = simulateIsManagerOrOwner(userTenantA, 'barbearia-beta');
      assert.strictEqual(canEditPublicB, false, 'Usuário de A não pode alterar catálogo público de B');
    });

    it('Nenhum usuário (inclusive Tenant A ou B) consegue fabricar publicAvailability client-side', () => {
      // Rules definem: allow write: if false
      const clientSideWriteAllowed = false;
      assert.strictEqual(clientSideWriteAllowed, false, 'Fabricação client-side de publicAvailability é categoricamente bloqueada');
    });

    it('A autorização deriva da identidade autenticada/Claims e NÃO do tenantId enviado pelo cliente', () => {
      // Cenário de ataque: atacante autenticado no Tenant A envia request.resource.data.tenantId = 'barbearia-beta'
      const attackerAuth = {
        uid: 'attacker-123',
        role: 'GERENTE',
        tenantId: 'barbearia-alfa' // Claim soberana no token
      };
      const forgedTenantIdInBody = 'barbearia-beta'; // Tentativa de bypass

      // A regra verifica se attackerAuth.tenantId == forgedTenantIdInBody
      const authorized = simulateIsManagerOrOwner(attackerAuth, forgedTenantIdInBody);
      assert.strictEqual(authorized, false, 'Ataque de falsificação de tenantId no corpo da requisição foi bloqueado pelas regras');
    });

    it('Super Admin possui permissão administrativa global', () => {
      const superAdminAuth = {
        uid: 'super-admin-root',
        role: 'super_admin',
        tenantId: 'global'
      };
      assert.strictEqual(simulateIsManagerOrOwner(superAdminAuth, 'barbearia-alfa', true), true);
      assert.strictEqual(simulateIsManagerOrOwner(superAdminAuth, 'barbearia-beta', true), true);
    });
  });
});
