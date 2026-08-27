import {
  Barbershop,
  User,
  Service,
  ProfessionalScheduleConfig,
  Appointment,
  WaitlistEntry,
  ServicePackage,
  CustomerPackage,
  Raffle,
  Promotion,
  CommunicationMessage,
  StockItem,
  ReturnMessage,
  GalleryWork,
  AuditLog
} from '../types';
import { APP_ASSETS } from './assets';
import { REALISTIC_BARBERSHOP_ASSETS } from '../lib/storage';

export const INITIAL_BARBERSHOPS: Barbershop[] = [
  {
    id: 'tenant-barbearia-do-joao',
    name: 'Barbearia Rodrigues',
    slug: 'barbearia-rodrigues',
    customDomain: 'barbearia-rodrigues.mybarberbr.com.br',
    logoUrl: APP_ASSETS.logo,
    bannerUrl: APP_ASSETS.banner,
    salonImages: [
      'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1000&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1000&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1000&auto=format&fit=crop&q=80'
    ],
    about: 'Ambiente climatizado com poltronas vintage de couro, atendimento de excelência, navalha afiada e cerveja artesanal gelada. Mais que um corte de cabelo, uma experiência de estilo e bem-estar.',
    phone: '(11) 3456-7890',
    whatsapp: '(11) 98765-4321',
    address: {
      street: 'Rua Augusta',
      number: '1420',
      complement: 'Loja 2',
      neighborhood: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01304-001'
    },
    coordinates: {
      latitude: -23.5558,
      longitude: -46.6606
    },
    socialMedia: {
      instagram: '@barbeariarodrigues.oficial',
      facebook: 'fb.com/barbeariarodrigues',
      tiktok: '@barbeariarodrigues'
    },
    planId: 'PLANO_UNICO', // Plano Único & Fixo — R$ 49,90/mês (até 10 profissionais)
    reminderConfig: {
      advanceMinutes: 120, // 2 horas antes
      enabled: true,
      whatsappTemplate: 'Olá {cliente}! Lembramos do seu agendamento de {servico} com {profissional} hoje às {horario} na {barbearia}.'
    },
    createdAt: '2026-01-15T10:00:00Z'
  },
  {
    id: 'tenant-barbearia-vintage-club',
    name: 'Barbearia Vintage Club',
    slug: 'barbearia-vintage-club',
    customDomain: 'barbearia-vintage-club.mybarberbr.com.br',
    logoUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&auto=format&fit=crop&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=1400&auto=format&fit=crop&q=85',
    salonImages: [
      'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=1000&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?w=1000&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1000&auto=format&fit=crop&q=80'
    ],
    about: 'Tradição e modernidade no coração da cidade. Especialistas em barba terapia, cortes clássicos na tesoura e visagismo facial.',
    phone: '(21) 2233-4455',
    whatsapp: '(21) 99887-7665',
    address: {
      street: 'Av. Nossa Senhora de Copacabana',
      number: '580',
      neighborhood: 'Copacabana',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '22020-001'
    },
    coordinates: {
      latitude: -22.9711,
      longitude: -43.1856
    },
    socialMedia: {
      instagram: '@vintagebarberclub',
      facebook: 'fb.com/vintagebarberclub'
    },
    planId: 'PLANO_UNICO', // Plano Único & Fixo — R$ 49,90/mês (até 10 profissionais)
    reminderConfig: {
      advanceMinutes: 60,
      enabled: true,
      whatsappTemplate: 'Fala {cliente}! Tudo pronto para seu atendimento na {barbearia} às {horario}. Te esperamos!'
    },
    createdAt: '2026-02-01T09:00:00Z'
  }
];

export const INITIAL_USERS: User[] = [
  // Super Admin — Dono e Proprietário da Plataforma My Barber (Controle Global)
  {
    id: 'user-super-admin',
    tenantId: 'platform-global',
    role: 'SUPER_ADMIN',
    name: 'Carlos Silva (Proprietário da Plataforma)',
    email: 'carlosrs.email@gmail.com',
    whatsapp: '(11) 99999-0000',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    birthDate: '1988-01-01',
    createdAt: '2026-01-01T00:00:00Z'
  },
  // Barbearia Rodrigues - Proprietário
  {
    id: 'user-joao-owner',
    tenantId: 'tenant-barbearia-do-joao',
    role: 'PROPRIETARIO',
    name: 'Barbearia Rodrigues',
    email: 'contato@barbeariarodrigues.com.br',
    whatsapp: '(11) 98765-4321',
    avatarUrl: APP_ASSETS.barberDiego,
    birthDate: '1985-04-12',
    createdAt: '2026-01-15T10:00:00Z'
  },
  // Barbearia do João - Gerente
  {
    id: 'user-ricardo-manager',
    tenantId: 'tenant-barbearia-do-joao',
    role: 'GERENTE',
    name: 'Ricardo Mendes',
    email: 'ricardo@barbeariadojoao.com.br',
    whatsapp: '(11) 98111-2233',
    avatarUrl: APP_ASSETS.barberDiego,
    birthDate: '1990-08-22',
    createdAt: '2026-01-18T11:00:00Z'
  },
  // Barbearia do João - Profissional 1 (Líder com canViewAllProfessionals = true)
  {
    id: 'user-marcos-barber-leader',
    tenantId: 'tenant-barbearia-do-joao',
    role: 'PROFISSIONAL',
    name: 'Marcos Oliveira (Mestre)',
    email: 'marcos@barbeariadojoao.com.br',
    whatsapp: '(11) 97222-3344',
    avatarUrl: APP_ASSETS.barberFelipe,
    birthDate: '1992-03-15',
    canViewAllProfessionals: true, // REGRA SEÇÃO 7: Visualiza a agenda de todos os profissionais
    commissionPercentage: 50,
    specialties: ['Corte Degradê', 'Barba Terapia', 'Pigmentação'],
    createdAt: '2026-01-15T10:00:00Z'
  },
  // Barbearia do João - Profissional 2 (Individual com canViewAllProfessionals = false)
  {
    id: 'user-felipe-barber',
    tenantId: 'tenant-barbearia-do-joao',
    role: 'PROFISSIONAL',
    name: 'Felipe Santana',
    email: 'felipe@barbeariadojoao.com.br',
    whatsapp: '(11) 97333-4455',
    avatarUrl: APP_ASSETS.barberFelipe,
    birthDate: '1996-11-05',
    canViewAllProfessionals: false, // REGRA SEÇÃO 7: Visualiza apenas suas próprias informações
    commissionPercentage: 45,
    specialties: ['Corte Clássico', 'Barba na Toalha Quente', 'Tratamentos'],
    createdAt: '2026-01-20T10:00:00Z'
  },
  // Barbearia do João - Profissional 3
  {
    id: 'user-lucas-barber',
    tenantId: 'tenant-barbearia-do-joao',
    role: 'PROFISSIONAL',
    name: 'Lucas Souza',
    email: 'lucas@barbeariadojoao.com.br',
    whatsapp: '(11) 97444-5566',
    avatarUrl: APP_ASSETS.barberDiego,
    birthDate: '1994-08-10', // Aniversariante no mês corrente (agosto)
    canViewAllProfessionals: false,
    commissionPercentage: 45,
    specialties: ['Platinado', 'Alinhamento Capilar', 'Visagismo'],
    createdAt: '2026-02-01T10:00:00Z'
  },
  // Barbearia do João - Clientes (Login por WhatsApp)
  {
    id: 'user-cliente-carlos',
    tenantId: 'tenant-barbearia-do-joao',
    role: 'CLIENTE',
    name: 'Carlos Eduardo',
    whatsapp: '(11) 99123-4567',
    avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200&auto=format&fit=crop&q=80',
    birthDate: '1995-08-15', // Aniversariante neste mês!
    createdAt: '2026-02-10T14:30:00Z'
  },
  {
    id: 'user-cliente-bruno',
    tenantId: 'tenant-barbearia-do-joao',
    role: 'CLIENTE',
    name: 'Bruno Henrique',
    whatsapp: '(11) 99234-5678',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80',
    birthDate: '1991-05-20',
    createdAt: '2026-03-01T10:00:00Z'
  },
  {
    id: 'user-cliente-gustavo',
    tenantId: 'tenant-barbearia-do-joao',
    role: 'CLIENTE',
    name: 'Gustavo Santos',
    whatsapp: '(11) 99345-6789',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80',
    birthDate: '1998-08-25', // Aniversariante neste mês!
    createdAt: '2026-04-12T16:00:00Z'
  }
];

export const INITIAL_SERVICES: Service[] = [
  {
    id: 'srv-corte-cabelo',
    tenantId: 'tenant-barbearia-do-joao',
    name: 'Corte Cabelo Moderno / Clássico',
    description: 'Corte completo com lavagem, finalização com pomada e toalha perfumada.',
    durationMinutes: 30,
    price: 50.00,
    category: 'Cabelo',
    imageUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400&auto=format&fit=crop&q=80',
    returnReminderDays: 25, // Retorno sugerido após 25 dias (Seção 20)
    active: true
  },
  {
    id: 'srv-barboterapia',
    tenantId: 'tenant-barbearia-do-joao',
    name: 'Barboterapia & Toalha Quente',
    description: 'Modelagem com navalha, esfoliação facial, hidratação profunda e massagem relaxante.',
    durationMinutes: 35,
    price: 45.00,
    category: 'Barba',
    imageUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&auto=format&fit=crop&q=80',
    returnReminderDays: 15, // Retorno após 15 dias
    active: true
  },
  {
    id: 'srv-combo-completo',
    tenantId: 'tenant-barbearia-do-joao',
    name: 'Combo Completo (Cabelo + Barba)',
    description: 'A experiência completa: corte personalizado + barba completa com toalha quente e bebida cortesia.',
    durationMinutes: 60,
    price: 85.00,
    category: 'Combos',
    imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80',
    returnReminderDays: 21,
    active: true
  },
  {
    id: 'srv-sobrancelha',
    tenantId: 'tenant-barbearia-do-joao',
    name: 'Design de Sobrancelha na Navalha',
    description: 'Alinhamento e limpeza estética das sobrancelhas masculinas.',
    durationMinutes: 15,
    price: 20.00,
    category: 'Estética',
    imageUrl: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400&auto=format&fit=crop&q=80',
    returnReminderDays: 20,
    active: true
  },
  {
    id: 'srv-platinado',
    tenantId: 'tenant-barbearia-do-joao',
    name: 'Platinado / Nevou Global',
    description: 'Descoloração profissional com matização e tratamento reconstrutor.',
    durationMinutes: 120,
    price: 180.00,
    category: 'Química',
    imageUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&auto=format&fit=crop&q=80',
    returnReminderDays: 45,
    active: true
  }
];

export const INITIAL_SCHEDULES: ProfessionalScheduleConfig[] = [
  {
    professionalId: 'user-marcos-barber-leader',
    weeklySchedule: [
      { dayOfWeek: 0, dayName: 'Domingo', enabled: false, shifts: [] },
      {
        dayOfWeek: 1, dayName: 'Segunda-feira', enabled: true,
        shifts: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }]
      },
      {
        dayOfWeek: 2, dayName: 'Terça-feira', enabled: true,
        shifts: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }]
      },
      {
        dayOfWeek: 3, dayName: 'Quarta-feira', enabled: true,
        shifts: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }]
      },
      {
        dayOfWeek: 4, dayName: 'Quinta-feira', enabled: true,
        shifts: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '20:00' }]
      },
      {
        dayOfWeek: 5, dayName: 'Sexta-feira', enabled: true,
        shifts: [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '20:30' }]
      },
      {
        dayOfWeek: 6, dayName: 'Sábado', enabled: true,
        shifts: [{ start: '08:00', end: '13:00' }, { start: '14:00', end: '19:00' }]
      }
    ],
    periodOverrides: [
      {
        id: 'override-carnaval',
        professionalId: 'user-marcos-barber-leader',
        startDate: '2026-02-16',
        endDate: '2026-02-18',
        shifts: [{ start: '10:00', end: '15:00' }],
        reason: 'Horário Especial de Carnaval'
      }
    ]
  },
  {
    professionalId: 'user-felipe-barber',
    weeklySchedule: [
      { dayOfWeek: 0, dayName: 'Domingo', enabled: false, shifts: [] },
      { dayOfWeek: 1, dayName: 'Segunda-feira', enabled: false, shifts: [] }, // Folga segunda
      {
        dayOfWeek: 2, dayName: 'Terça-feira', enabled: true,
        shifts: [{ start: '10:00', end: '14:00' }, { start: '15:00', end: '20:00' }]
      },
      {
        dayOfWeek: 3, dayName: 'Quarta-feira', enabled: true,
        shifts: [{ start: '10:00', end: '14:00' }, { start: '15:00', end: '20:00' }]
      },
      {
        dayOfWeek: 4, dayName: 'Quinta-feira', enabled: true,
        shifts: [{ start: '10:00', end: '14:00' }, { start: '15:00', end: '20:00' }]
      },
      {
        dayOfWeek: 5, dayName: 'Sexta-feira', enabled: true,
        shifts: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '20:00' }]
      },
      {
        dayOfWeek: 6, dayName: 'Sábado', enabled: true,
        shifts: [{ start: '08:30', end: '13:00' }, { start: '14:00', end: '18:30' }]
      }
    ],
    periodOverrides: []
  },
  {
    professionalId: 'user-lucas-barber',
    weeklySchedule: [
      { dayOfWeek: 0, dayName: 'Domingo', enabled: false, shifts: [] },
      {
        dayOfWeek: 1, dayName: 'Segunda-feira', enabled: true,
        shifts: [{ start: '11:00', end: '20:00' }]
      },
      {
        dayOfWeek: 2, dayName: 'Terça-feira', enabled: true,
        shifts: [{ start: '11:00', end: '20:00' }]
      },
      {
        dayOfWeek: 3, dayName: 'Quarta-feira', enabled: true,
        shifts: [{ start: '11:00', end: '20:00' }]
      },
      {
        dayOfWeek: 4, dayName: 'Quinta-feira', enabled: true,
        shifts: [{ start: '11:00', end: '20:00' }]
      },
      {
        dayOfWeek: 5, dayName: 'Sexta-feira', enabled: true,
        shifts: [{ start: '10:00', end: '20:00' }]
      },
      {
        dayOfWeek: 6, dayName: 'Sábado', enabled: true,
        shifts: [{ start: '09:00', end: '19:00' }]
      }
    ],
    periodOverrides: []
  }
];

export const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-001',
    tenantId: 'tenant-barbearia-do-joao',
    serviceId: 'srv-combo-completo',
    serviceName: 'Combo Completo (Cabelo + Barba)',
    servicePrice: 85.00,
    serviceDuration: 60,
    professionalId: 'user-marcos-barber-leader',
    professionalName: 'Marcos Oliveira',
    clientId: 'user-cliente-carlos',
    clientName: 'Carlos Eduardo',
    clientWhatsApp: '(11) 99123-4567',
    date: '2026-08-10', // Hoje
    startTime: '10:00',
    endTime: '11:00',
    isEncaixe: false,
    status: 'AGENDADO',
    reminderSent: true,
    reminderSentAt: '2026-08-10T08:00:00Z',
    createdAt: '2026-08-08T15:20:00Z'
  },
  {
    id: 'apt-002',
    tenantId: 'tenant-barbearia-do-joao',
    serviceId: 'srv-corte-cabelo',
    serviceName: 'Corte Cabelo Moderno / Clássico',
    servicePrice: 50.00,
    serviceDuration: 30,
    professionalId: 'user-marcos-barber-leader',
    professionalName: 'Marcos Oliveira',
    clientId: 'user-cliente-bruno',
    clientName: 'Bruno Henrique',
    clientWhatsApp: '(11) 99234-5678',
    date: '2026-08-10',
    startTime: '11:30',
    endTime: '12:00',
    isEncaixe: false,
    status: 'AGENDADO',
    reminderSent: true,
    reminderSentAt: '2026-08-10T09:30:00Z',
    createdAt: '2026-08-09T11:00:00Z'
  },
  {
    id: 'apt-003',
    tenantId: 'tenant-barbearia-do-joao',
    serviceId: 'srv-barboterapia',
    serviceName: 'Barboterapia & Toalha Quente',
    servicePrice: 45.00,
    serviceDuration: 35,
    professionalId: 'user-felipe-barber',
    professionalName: 'Felipe Santana',
    clientId: 'user-cliente-gustavo',
    clientName: 'Gustavo Santos',
    clientWhatsApp: '(11) 99345-6789',
    date: '2026-08-10',
    startTime: '14:00',
    endTime: '14:35',
    isEncaixe: false,
    status: 'AGENDADO',
    reminderSent: false,
    createdAt: '2026-08-09T18:00:00Z'
  },
  {
    id: 'apt-004-encaixe',
    tenantId: 'tenant-barbearia-do-joao',
    serviceId: 'srv-sobrancelha',
    serviceName: 'Design de Sobrancelha na Navalha',
    servicePrice: 20.00,
    serviceDuration: 15,
    professionalId: 'user-marcos-barber-leader',
    professionalName: 'Marcos Oliveira',
    clientId: 'user-cliente-carlos',
    clientName: 'Carlos Eduardo',
    clientWhatsApp: '(11) 99123-4567',
    date: '2026-08-10',
    startTime: '12:05',
    endTime: '12:20',
    isEncaixe: true, // SEÇÃO 14: Encaixe
    notes: 'Encaixe de emergência antes de viagem',
    status: 'AGENDADO',
    reminderSent: false,
    createdAt: '2026-08-10T09:15:00Z'
  },
  // Histórico anterior para validar elegibilidade do sorteio (últimos 2 meses)
  {
    id: 'apt-past-001',
    tenantId: 'tenant-barbearia-do-joao',
    serviceId: 'srv-corte-cabelo',
    serviceName: 'Corte Cabelo Moderno / Clássico',
    servicePrice: 50.00,
    serviceDuration: 30,
    professionalId: 'user-marcos-barber-leader',
    professionalName: 'Marcos Oliveira',
    clientId: 'user-cliente-carlos',
    clientName: 'Carlos Eduardo',
    clientWhatsApp: '(11) 99123-4567',
    date: '2026-07-15', // No mês passado (elegível para sorteio)
    startTime: '15:00',
    endTime: '15:30',
    isEncaixe: false,
    status: 'CONCLUIDO',
    reminderSent: true,
    createdAt: '2026-07-12T10:00:00Z'
  },
  {
    id: 'apt-past-002',
    tenantId: 'tenant-barbearia-do-joao',
    serviceId: 'srv-combo-completo',
    serviceName: 'Combo Completo (Cabelo + Barba)',
    servicePrice: 85.00,
    serviceDuration: 60,
    professionalId: 'user-felipe-barber',
    professionalName: 'Felipe Santana',
    clientId: 'user-cliente-bruno',
    clientName: 'Bruno Henrique',
    clientWhatsApp: '(11) 99234-5678',
    date: '2026-07-28', // No mês passado (elegível para sorteio)
    startTime: '16:00',
    endTime: '17:00',
    isEncaixe: false,
    status: 'CONCLUIDO',
    reminderSent: true,
    createdAt: '2026-07-25T14:00:00Z'
  }
];

export const INITIAL_PACKAGES: ServicePackage[] = [
  {
    id: 'pkg-clube-mensal-cabelo',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Pacote 4 Cortes de Cabelo (Mensal)',
    description: 'Garanta seu visual impecável o mês todo com desconto especial e prioridade de horário.',
    price: 160.00, // Preço avulso seria 200,00
    items: [
      {
        id: 'pkg-item-1',
        type: 'SERVICO',
        itemId: 'srv-corte-cabelo',
        name: 'Corte Cabelo Moderno / Clássico',
        totalQuantity: 4
      }
    ],
    active: true,
    createdAt: '2026-01-20T10:00:00Z'
  },
  {
    id: 'pkg-combo-vip-cuidado',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Combo VIP: 5 Barboterapias + 1 Pomada Modeladora',
    description: 'Cuidado contínuo para sua barba com produto profissional incluso.',
    price: 210.00,
    items: [
      {
        id: 'pkg-item-2',
        type: 'SERVICO',
        itemId: 'srv-barboterapia',
        name: 'Barboterapia & Toalha Quente',
        totalQuantity: 5
      },
      {
        id: 'pkg-item-3',
        type: 'PRODUTO',
        itemId: 'prod-pomada-matte',
        name: 'Pomada Matte Efeito Seco Premium',
        totalQuantity: 1
      }
    ],
    active: true,
    createdAt: '2026-02-05T14:00:00Z'
  }
];

export const INITIAL_CUSTOMER_PACKAGES: CustomerPackage[] = [
  {
    id: 'cust-pkg-001',
    tenantId: 'tenant-barbearia-do-joao',
    packageId: 'pkg-clube-mensal-cabelo',
    packageTitle: 'Pacote 4 Cortes de Cabelo (Mensal)',
    clientId: 'user-cliente-carlos',
    clientName: 'Carlos Eduardo',
    clientWhatsApp: '(11) 99123-4567',
    purchaseDate: '2026-07-20',
    items: [
      {
        itemId: 'srv-corte-cabelo',
        name: 'Corte Cabelo Moderno / Clássico',
        type: 'SERVICO',
        totalQuantity: 4,
        usedQuantity: 1 // 3 restantes
      }
    ]
  }
];

export const INITIAL_WAITLIST: WaitlistEntry[] = [
  {
    id: 'wait-001',
    tenantId: 'tenant-barbearia-do-joao',
    clientId: 'user-cliente-bruno',
    clientName: 'Bruno Henrique',
    clientWhatsApp: '(11) 99234-5678',
    serviceId: 'srv-combo-completo',
    serviceName: 'Combo Completo (Cabelo + Barba)',
    preferredProfessionalId: 'user-marcos-barber-leader',
    preferredDate: '2026-08-15',
    preferredTimeOfDay: 'TARDE',
    notes: 'Preferência após as 16h se liberar horário',
    status: 'AGUARDANDO',
    createdAt: '2026-08-09T14:00:00Z'
  }
];

export const INITIAL_RAFFLES: Raffle[] = [
  {
    id: 'raffle-001',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Sorteio Trimestral de Dia dos Pais VIP',
    description: 'Participe do nosso sorteio exclusivo! Válido apenas para clientes que realizaram agendamento nos últimos 2 meses.',
    prize: '1 Ano de Cortes Gratuitos (12 cortes) + Kit de Produtos Premium Barber',
    drawDate: '2026-08-30',
    imageUrl: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=800&auto=format&fit=crop&q=80',
    status: 'ATIVO',
    participants: [
      {
        clientId: 'user-cliente-carlos',
        clientName: 'Carlos Eduardo',
        clientWhatsApp: '(11) 99123-4567',
        registeredAt: '2026-08-05T11:20:00Z',
        eligibleAppointmentDate: '2026-07-15'
      }
    ],
    createdAt: '2026-08-01T08:00:00Z'
  },
  {
    id: 'raffle-002',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Sorteio Mensal de Julho - Kit Barber Pro',
    description: 'Sorteio realizado entre os clientes fidelizados com atendimento no período.',
    prize: 'Kit Completo Pomada + Óleo de Barba + Shampoo Mentolado',
    drawDate: '2026-07-31',
    imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80',
    status: 'REALIZADO',
    participants: [
      {
        clientId: 'user-cliente-carlos',
        clientName: 'Carlos Eduardo',
        clientWhatsApp: '(11) 99123-4567',
        registeredAt: '2026-07-25T15:00:00Z',
        eligibleAppointmentDate: '2026-07-15'
      },
      {
        clientId: 'user-cliente-bruno',
        clientName: 'Bruno Henrique',
        clientWhatsApp: '(11) 99234-5678',
        registeredAt: '2026-07-28T10:00:00Z',
        eligibleAppointmentDate: '2026-07-02'
      }
    ],
    winnerClientId: 'user-cliente-bruno',
    winnerClientName: 'Bruno Henrique',
    winnerDrawnAt: '2026-07-31T18:00:00Z',
    showInHighlights: true,
    createdAt: '2026-07-01T08:00:00Z'
  }
];

export const INITIAL_PROMOTIONS: Promotion[] = [
  {
    id: 'promo-001',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Terça Maluca: 20% OFF no Corte Degradê',
    description: 'Agende seu corte degradê navalhado em qualquer horário das terças-feiras e ganhe 20% de desconto direto!',
    discountPercentage: 20,
    serviceId: 'srv-corte-cabelo',
    serviceName: 'Corte Cabelo Moderno / Clássico',
    code: 'TERCA20',
    validUntil: '2026-08-31',
    active: true,
    showInHighlights: true,
    highlightTag: 'PROMOÇÃO',
    imageUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800&auto=format&fit=crop&q=80',
    createdAt: '2026-08-01T09:00:00Z'
  },
  {
    id: 'promo-002',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Combo Barba VIP + Cerveja Artesanal',
    description: 'Faça seu serviço de Barboterapia e ganhe 1 cerveja IPA artesanal trincando na faixa!',
    discountPercentage: 15,
    serviceId: 'srv-barboterapia',
    serviceName: 'Barboterapia & Toalha Quente',
    code: 'BEERBARBER',
    validUntil: '2026-08-25',
    active: true,
    showInHighlights: true,
    highlightTag: 'EXPERIÊNCIA VIP',
    imageUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&auto=format&fit=crop&q=80',
    createdAt: '2026-08-02T10:00:00Z'
  },
  {
    id: 'promo-003',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Pai & Filho: Estilo em Dobro',
    description: 'Agende para você e seu filho no mesmo dia e ganhe 25% de desconto no valor total dos cortes.',
    discountPercentage: 25,
    code: 'PAIEFILHO',
    validUntil: '2026-08-30',
    active: true,
    imageUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&auto=format&fit=crop&q=80',
    createdAt: '2026-08-03T11:00:00Z'
  }
];

export const INITIAL_COMMUNICATIONS: CommunicationMessage[] = [
  {
    id: 'msg-promo-agosto',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Mês dos Pais na Barbearia do João 💈',
    content: 'Traga seu pai ou venha celebrar conosco! No combo pai e filho ou combo completo você ganha uma cerveja artesanal e brinde surpresa.',
    type: 'PROMOCAO',
    channel: 'AMBOS',
    target: 'TODOS',
    sentAt: '2026-08-05T09:00:00Z',
    logs: [
      {
        clientId: 'user-cliente-carlos',
        clientName: 'Carlos Eduardo',
        clientWhatsApp: '(11) 99123-4567',
        channel: 'APP',
        received: true,
        receivedAt: '2026-08-05T09:01:00Z',
        read: true,
        readAt: '2026-08-05T10:14:00Z'
      },
      {
        clientId: 'user-cliente-bruno',
        clientName: 'Bruno Henrique',
        clientWhatsApp: '(11) 99234-5678',
        channel: 'SMS',
        received: true,
        receivedAt: '2026-08-05T09:02:00Z',
        read: false
      }
    ]
  }
];

export const INITIAL_STOCK: StockItem[] = [
  {
    id: 'prod-pomada-matte',
    tenantId: 'tenant-barbearia-do-joao',
    name: 'Pomada Matte Efeito Seco Premium 100g',
    category: 'Finalizadores',
    quantity: 24,
    minQuantity: 8,
    costPrice: 22.00,
    salePrice: 55.00,
    unit: 'un',
    imageUrl: 'https://images.unsplash.com/photo-1597354984706-aec992b7d0d1?w=400&auto=format&fit=crop&q=80',
    lastRestockedAt: '2026-08-01'
  },
  {
    id: 'prod-oleo-barba',
    tenantId: 'tenant-barbearia-do-joao',
    name: 'Óleo para Barba Essência Amadeirada 30ml',
    category: 'Barba',
    quantity: 14,
    minQuantity: 5,
    costPrice: 18.00,
    salePrice: 48.00,
    unit: 'un',
    imageUrl: 'https://images.unsplash.com/photo-1608248597359-002d287bfba5?w=400&auto=format&fit=crop&q=80',
    lastRestockedAt: '2026-07-20'
  },
  {
    id: 'prod-shampoo-anticaspa',
    tenantId: 'tenant-barbearia-do-joao',
    name: 'Shampoo Mentolado Fortalecedor 250ml',
    category: 'Lavatório',
    quantity: 4,
    minQuantity: 6, // Alerta de estoque baixo!
    costPrice: 25.00,
    salePrice: 60.00,
    unit: 'un',
    imageUrl: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=400&auto=format&fit=crop&q=80',
    lastRestockedAt: '2026-07-10'
  },
  {
    id: 'prod-lamina-navalhete',
    tenantId: 'tenant-barbearia-do-joao',
    name: 'Caixa de Lâminas de Barbear Platinum (100 un)',
    category: 'Consumíveis',
    quantity: 12,
    minQuantity: 3,
    costPrice: 35.00,
    salePrice: 0.00, // Uso interno
    unit: 'cx',
    imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80',
    lastRestockedAt: '2026-08-02'
  }
];

export const INITIAL_RETURN_MESSAGES: ReturnMessage[] = [
  {
    id: 'ret-001',
    tenantId: 'tenant-barbearia-do-joao',
    serviceId: 'srv-corte-cabelo',
    serviceName: 'Corte Cabelo Moderno / Clássico',
    clientId: 'user-cliente-carlos',
    clientName: 'Carlos Eduardo',
    clientWhatsApp: '(11) 99123-4567',
    lastAppointmentDate: '2026-07-15',
    scheduledReturnDate: '2026-08-09', // 25 dias depois
    suggestedMessage: 'Olá Carlos! Já faz 25 dias desde o seu último corte na Barbearia do João. Que tal renovar o estilo hoje mesmo? Acesse nosso app e garanta seu horário!',
    status: 'PENDENTE'
  }
];

export const INITIAL_GALLERY_WORKS: GalleryWork[] = [
  {
    id: 'work-001',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'High Fade Degradê Navalhado',
    category: 'DEGRADE',
    imageUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800&auto=format&fit=crop&q=80',
    professionalId: 'user-marcos-barber-leader',
    professionalName: 'Marcos Oliveira',
    serviceId: 'srv-corte-cabelo',
    serviceName: 'Corte Cabelo Moderno / Clássico',
    servicePrice: 50.00,
    likesCount: 48,
    description: 'Degradê alto impecável na lâmina com acabamento de precisão no contorno frontal.',
    createdAt: '2026-08-01T14:00:00Z'
  },
  {
    id: 'work-002',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Barboterapia & Alinhamento de Barba',
    category: 'BARBA',
    imageUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&auto=format&fit=crop&q=80',
    professionalId: 'user-felipe-barber',
    professionalName: 'Felipe Santana',
    serviceId: 'srv-barboterapia',
    serviceName: 'Barboterapia & Toalha Quente',
    servicePrice: 45.00,
    likesCount: 37,
    description: 'Tratamento com toalhas quentes aromáticas, esfoliação facial e desenho na navalha.',
    createdAt: '2026-08-03T16:30:00Z'
  },
  {
    id: 'work-003',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Combo Cabelo + Barba Alinhada',
    category: 'COMBO',
    imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80',
    professionalId: 'user-marcos-barber-leader',
    professionalName: 'Marcos Oliveira',
    serviceId: 'srv-combo-completo',
    serviceName: 'Combo Completo (Cabelo + Barba)',
    servicePrice: 85.00,
    likesCount: 62,
    description: 'Transformação completa: corte moderno e barba desenhada com hidratação de óleos.',
    createdAt: '2026-08-05T18:00:00Z'
  },
  {
    id: 'work-004',
    tenantId: 'tenant-barbearia-do-joao',
    title: 'Corte Clássico na Tesoura & Visagismo',
    category: 'SOCIAL',
    imageUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&auto=format&fit=crop&q=80',
    professionalId: 'user-felipe-barber',
    professionalName: 'Felipe Santana',
    serviceId: 'srv-corte-cabelo',
    serviceName: 'Corte Cabelo Moderno / Clássico',
    servicePrice: 50.00,
    likesCount: 29,
    description: 'Texturização feita inteiramente na tesoura com caimento natural e elegância.',
    createdAt: '2026-08-07T11:00:00Z'
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    timestamp: '2026-02-15T14:32:00Z',
    actorUserId: 'user-super-admin',
    actorUserName: 'Super Admin (Dono My Barber)',
    actorRole: 'SUPER_ADMIN',
    action: 'CADASTRO_BARBEARIA',
    targetTenantId: 'tenant-barbearia-vintage-club',
    targetTenantName: 'Barbearia Vintage Club',
    details: 'Nova barbearia cadastrada com plano fixo R$ 49,90/mês.',
    status: 'SUCESSO'
  },
  {
    id: 'log-2',
    timestamp: '2026-02-10T10:15:00Z',
    actorUserId: 'user-super-admin',
    actorUserName: 'Super Admin (Dono My Barber)',
    actorRole: 'SUPER_ADMIN',
    action: 'CRIACAO_GERENTE',
    targetTenantId: 'tenant-barbearia-do-joao',
    targetTenantName: 'Barbearia do João',
    targetUserId: 'user-ricardo-manager',
    targetUserName: 'Ricardo Mendes',
    details: 'Criado acesso de Gerente para gestão operacional da unidade.',
    status: 'SUCESSO'
  },
  {
    id: 'log-3',
    timestamp: '2026-02-01T08:00:00Z',
    actorUserId: 'user-super-admin',
    actorUserName: 'Super Admin (Dono My Barber)',
    actorRole: 'SUPER_ADMIN',
    action: 'CONFIGURACAO_SISTEMA',
    details: 'Validação de isolamento multi-tenant e parâmetros de segurança da plataforma.',
    status: 'SUCESSO'
  }
];

export const INITIAL_SUBSCRIPTIONS: import('../types').Subscription[] = [
  {
    id: 'sub-barbearia-rodrigues',
    barbershopId: 'tenant-barbearia-do-joao',
    barbershopName: 'Barbearia Rodrigues',
    payerEmail: 'carlos.rodrigues@barbeariarodrigues.com.br',
    payerName: 'Carlos Rodrigues',
    payerPhone: '(11) 98765-4321',
    mercadopagoSubscriptionId: 'mp-sub-2c9380848a90b1',
    mercadopagoCustomerId: 'mp-cust-99881122',
    status: 'ACTIVE',
    plan: 'Plano MY BARBER',
    currentPrice: 49.90,
    billingCycle: 'MONTHLY',
    isInTrial: false,
    trialStartDate: '2026-01-01',
    trialEndDate: '2026-01-15',
    paidBillingCount: 2,
    trialOrLaunchPeriod: true,
    billingCount: 2,
    nextBillingDate: '2026-09-15',
    initPointUrl: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c9380848a90b1',
    cardValidated: true,
    cardBrand: 'Mastercard',
    cardLastFourDigits: '4242',
    toleranceDays: 7,
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-02-15T10:00:00Z'
  },
  {
    id: 'sub-barbearia-vintage',
    barbershopId: 'tenant-barbearia-vintage-club',
    barbershopName: 'Barbearia Vintage Club',
    payerEmail: 'marcos.vintage@vintageclub.com.br',
    payerName: 'Marcos Vinicius',
    payerPhone: '(21) 99887-7665',
    mercadopagoSubscriptionId: 'mp-sub-2c9380848a90b2',
    mercadopagoCustomerId: 'mp-cust-44556677',
    status: 'ACTIVE',
    plan: 'Plano MY BARBER',
    currentPrice: 69.90,
    billingCycle: 'MONTHLY',
    isInTrial: false,
    trialStartDate: '2025-11-06',
    trialEndDate: '2025-11-20',
    paidBillingCount: 4,
    trialOrLaunchPeriod: false,
    billingCount: 4,
    nextBillingDate: '2026-09-20',
    initPointUrl: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c9380848a90b2',
    cardValidated: true,
    cardBrand: 'Visa',
    cardLastFourDigits: '8899',
    toleranceDays: 7,
    createdAt: '2025-11-06T10:00:00Z',
    updatedAt: '2026-02-20T10:00:00Z'
  }
];

export const INITIAL_SUBSCRIPTION_PAYMENTS: import('../types').SubscriptionPaymentRecord[] = [
  {
    id: 'pay-rod-1',
    subscriptionId: 'sub-barbearia-rodrigues',
    barbershopId: 'tenant-barbearia-do-joao',
    barbershopName: 'Barbearia Rodrigues',
    mercadopagoPaymentId: 'mp-pay-1001',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2026-01-15',
    billingNumber: 1,
    paymentMethod: 'Cartão de Crédito (Mastercard)',
    createdAt: '2026-01-15T10:05:00Z'
  },
  {
    id: 'pay-rod-2',
    subscriptionId: 'sub-barbearia-rodrigues',
    barbershopId: 'tenant-barbearia-do-joao',
    barbershopName: 'Barbearia Rodrigues',
    mercadopagoPaymentId: 'mp-pay-1002',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2026-02-15',
    billingNumber: 2,
    paymentMethod: 'Cartão de Crédito (Mastercard)',
    createdAt: '2026-02-15T10:00:00Z'
  },
  {
    id: 'pay-vint-1',
    subscriptionId: 'sub-barbearia-vintage',
    barbershopId: 'tenant-barbearia-vintage-club',
    barbershopName: 'Barbearia Vintage Club',
    mercadopagoPaymentId: 'mp-pay-2001',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2025-11-20',
    billingNumber: 1,
    paymentMethod: 'Cartão de Crédito (Visa)',
    createdAt: '2025-11-20T10:00:00Z'
  },
  {
    id: 'pay-vint-2',
    subscriptionId: 'sub-barbearia-vintage',
    barbershopId: 'tenant-barbearia-vintage-club',
    barbershopName: 'Barbearia Vintage Club',
    mercadopagoPaymentId: 'mp-pay-2002',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2025-12-20',
    billingNumber: 2,
    paymentMethod: 'Cartão de Crédito (Visa)',
    createdAt: '2025-12-20T10:00:00Z'
  },
  {
    id: 'pay-vint-3',
    subscriptionId: 'sub-barbearia-vintage',
    barbershopId: 'tenant-barbearia-vintage-club',
    barbershopName: 'Barbearia Vintage Club',
    mercadopagoPaymentId: 'mp-pay-2003',
    amount: 49.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2026-01-20',
    billingNumber: 3,
    paymentMethod: 'Cartão de Crédito (Visa)',
    createdAt: '2026-01-20T10:00:00Z'
  },
  {
    id: 'pay-vint-4',
    subscriptionId: 'sub-barbearia-vintage',
    barbershopId: 'tenant-barbearia-vintage-club',
    barbershopName: 'Barbearia Vintage Club',
    mercadopagoPaymentId: 'mp-pay-2004',
    amount: 69.90,
    status: 'APPROVED',
    statusDetail: 'accredited',
    paymentDate: '2026-02-20',
    billingNumber: 4,
    paymentMethod: 'Cartão de Crédito (Visa)',
    createdAt: '2026-02-20T10:00:00Z'
  }
];


