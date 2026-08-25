import { Barbershop, User, Service } from '../types';
import { APP_ASSETS } from './assets';

export interface CommercialDemoPreset {
  id: string;
  badge: string;
  name: string;
  subtitle: string;
  description: string;
  themeColor: string;
  barbershop: Partial<Barbershop>;
  professionals: Array<Omit<User, 'id' | 'createdAt'> & { id?: string }>;
  services: Array<Omit<Service, 'id'> & { id?: string }>;
}

export const DEMO_LOGO_PRESETS = [
  { id: 'logo-1', label: 'Vintage Razor', url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&auto=format&fit=crop&q=80' },
  { id: 'logo-2', label: 'Barber Classic', url: APP_ASSETS.logo },
  { id: 'logo-3', label: 'Gold Barber Club', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80' },
  { id: 'logo-4', label: 'Executive Beard', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400&auto=format&fit=crop&q=80' },
  { id: 'logo-5', label: 'Urban Studio', url: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=400&auto=format&fit=crop&q=80' },
  { id: 'logo-6', label: 'Black Crown', url: 'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=400&auto=format&fit=crop&q=80' },
];

export const DEMO_BANNER_PRESETS = [
  { id: 'banner-1', label: 'Salão Retrô Couro & Madeira', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1400&auto=format&fit=crop&q=85' },
  { id: 'banner-2', label: 'Ambiente Moderno Iluminado', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1400&auto=format&fit=crop&q=85' },
  { id: 'banner-3', label: 'Clássico Tradicional Preto', url: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1400&auto=format&fit=crop&q=85' },
  { id: 'banner-4', label: 'Lounge VIP com Bar & Sinuca', url: 'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=1400&auto=format&fit=crop&q=85' },
  { id: 'banner-5', label: 'Bancadas & Espelhos Espaçosos', url: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?w=1400&auto=format&fit=crop&q=85' },
  { id: 'banner-6', label: 'Studio Minimalista Industrial', url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1400&auto=format&fit=crop&q=85' }
];

export const DEMO_SALON_GALLERY_PRESETS = [
  'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1000&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1000&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1000&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=1000&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?w=1000&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=1000&auto=format&fit=crop&q=80'
];

export const DEMO_AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
];

export const DEMO_COMMERCIAL_PRESETS: CommercialDemoPreset[] = [
  {
    id: 'joao_moderno',
    badge: '⚡ Mais Popular',
    name: 'Barbearia do João',
    subtitle: 'Urbana, Degradê & Fade',
    description: 'Estilo moderno, focado em agilidade, degrade navalhado, visagismo facial e chopp artesanal de boas-vindas.',
    themeColor: '#FF6B00',
    barbershop: {
      id: 'barbershop-commercial-demo',
      name: 'Barbearia do João',
      slug: 'barbearia-do-joao',
      customDomain: 'app.barbeariadojoao.com.br',
      logoUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&auto=format&fit=crop&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1400&auto=format&fit=crop&q=85',
      salonImages: [
        'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1000&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1000&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1000&auto=format&fit=crop&q=80'
      ],
      about: 'A Barbearia do João é referência em cortes modernos, degradê navalhado perfeito e barboterapia com toalha quente. Venha relaxar com ar condicionado, TV com futebol e chopp gelado.',
      phone: '(11) 3456-7890',
      whatsapp: '(11) 99999-8888',
      address: {
        street: 'Av. Paulista',
        number: '1200',
        complement: 'Loja 4',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100'
      },
      coordinates: {
        latitude: -23.5615,
        longitude: -46.6560
      },
      socialMedia: {
        instagram: '@barbeariadojoao.oficial',
        facebook: 'fb.com/barbeariadojoao',
        tiktok: '@barbeariadojoao'
      },
      planId: 'PLANO_UNICO',
      reminderConfig: {
        advanceMinutes: 60,
        enabled: true,
        whatsappTemplate: 'Olá {cliente}! Tudo pronto para seu atendimento na {barbearia} às {horario} com {profissional}.'
      },
      primaryColor: '#FF6B00',
      status: 'ATIVA',
      isCommercialDemo: true,
      createdAt: '2026-01-01T00:00:00Z'
    },
    professionals: [
      {
        id: 'demo-prof-joao',
        tenantId: 'barbershop-commercial-demo',
        role: 'PROPRIETARIO',
        name: 'João Silva (Fundador & Master)',
        email: 'joao@barbeariadojoao.com.br',
        whatsapp: '(11) 99999-8888',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
        specialties: ['Corte Degradê', 'Visagismo', 'Barboterapia'],
        canViewAllProfessionals: true,
        commissionPercentage: 50,
        birthDate: '1988-05-10'
      },
      {
        id: 'demo-prof-carlos-fade',
        tenantId: 'barbershop-commercial-demo',
        role: 'PROFISSIONAL',
        name: 'Carlos "Navalha de Ouro"',
        email: 'carlos@barbeariadojoao.com.br',
        whatsapp: '(11) 98888-1111',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
        specialties: ['Degradê Americano', 'Freestyle', 'Pigmentação'],
        canViewAllProfessionals: false,
        commissionPercentage: 50,
        birthDate: '1995-09-18'
      },
      {
        id: 'demo-prof-matheus-barba',
        tenantId: 'barbershop-commercial-demo',
        role: 'PROFISSIONAL',
        name: 'Matheus Santos (Barba Terapia)',
        email: 'matheus@barbeariadojoao.com.br',
        whatsapp: '(11) 97777-2222',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&auto=format&fit=crop&q=80',
        specialties: ['Barba Terapia', 'Toalha Quente', 'Corte Clássico'],
        canViewAllProfessionals: false,
        commissionPercentage: 50,
        birthDate: '1992-12-04'
      }
    ],
    services: [
      {
        id: 'demo-srv-1',
        tenantId: 'barbershop-commercial-demo',
        name: 'Corte Degradê Navalhado',
        description: 'Fade com transição perfeita, acabamento preciso na navalha e finalização com pomada modeladora.',
        durationMinutes: 40,
        price: 55.00,
        category: 'Cabelo',
        imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 20,
        active: true
      },
      {
        id: 'demo-srv-2',
        tenantId: 'barbershop-commercial-demo',
        name: 'Barba Terapia com Toalha Quente',
        description: 'Vapor de ozônio, óleos essenciais, massagem facial relaxante e navalhete esterilizado.',
        durationMinutes: 35,
        price: 45.00,
        category: 'Barba',
        imageUrl: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 15,
        active: true
      },
      {
        id: 'demo-srv-3',
        tenantId: 'barbershop-commercial-demo',
        name: 'Combo Cabelo + Barba + Chopp',
        description: 'Serviço completo de corte e barba com direito a 1 Chopp artesanal trincando cortesia da casa.',
        durationMinutes: 65,
        price: 90.00,
        category: 'Combos',
        imageUrl: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 21,
        active: true
      },
      {
        id: 'demo-srv-4',
        tenantId: 'barbershop-commercial-demo',
        name: 'Pigmentação de Barba & Alinhamento',
        description: 'Preenchimento de falhas e realce de linhas com tinta especial de alta durabilidade.',
        durationMinutes: 25,
        price: 35.00,
        category: 'Barba',
        imageUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 15,
        active: true
      },
      {
        id: 'demo-srv-5',
        tenantId: 'barbershop-commercial-demo',
        name: 'Design de Sobrancelha Masculina',
        description: 'Limpeza e alinhamento do desenho na navalha ou pinça sem perder a naturalidade.',
        durationMinutes: 15,
        price: 20.00,
        category: 'Estética',
        imageUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 20,
        active: true
      },
      {
        id: 'demo-srv-6',
        tenantId: 'barbershop-commercial-demo',
        name: 'Platinado / Nevou Global',
        description: 'Descoloração global profissional com matização ultra branca e hidratação restauradora.',
        durationMinutes: 120,
        price: 160.00,
        category: 'Química',
        imageUrl: 'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 45,
        active: true
      }
    ]
  },
  {
    id: 'corleone_vip',
    badge: '👑 Luxo & Executivo',
    name: 'Don Corleone Barber Club',
    subtitle: 'VIP, Whisky & Tradição',
    description: 'Atmosfera de clube exclusivo para cavalheiros, corte na tesoura, massagem capilar e whisky single malt.',
    themeColor: '#D97706',
    barbershop: {
      id: 'barbershop-commercial-demo',
      name: 'Don Corleone Barber Club',
      slug: 'don-corleone-barber',
      customDomain: 'app.doncorleoneclub.com.br',
      logoUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=1400&auto=format&fit=crop&q=85',
      salonImages: [
        'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=1000&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?w=1000&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1000&auto=format&fit=crop&q=80'
      ],
      about: 'Clube exclusivo para cavalheiros. Uma experiência imersiva com poltronas artesanais, barbearia clássica, whisky selecionado e atendimento impecável com horário rigorosamente pontual.',
      phone: '(11) 3088-9900',
      whatsapp: '(11) 98888-0000',
      address: {
        street: 'Rua Oscar Freire',
        number: '850',
        complement: 'Loja Principal',
        neighborhood: 'Jardins',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01426-000'
      },
      coordinates: {
        latitude: -23.5630,
        longitude: -46.6690
      },
      socialMedia: {
        instagram: '@doncorleonebarberclub',
        facebook: 'fb.com/doncorleonebarber',
        tiktok: '@doncorleonebarber'
      },
      planId: 'PLANO_UNICO',
      reminderConfig: {
        advanceMinutes: 90,
        enabled: true,
        whatsappTemplate: 'Prezado {cliente}, seu momento de bem-estar na {barbearia} está reservado para hoje às {horario}. Aguardamos você!'
      },
      primaryColor: '#D97706',
      status: 'ATIVA',
      isCommercialDemo: true,
      createdAt: '2026-01-01T00:00:00Z'
    },
    professionals: [
      {
        id: 'demo-prof-corleone',
        tenantId: 'barbershop-commercial-demo',
        role: 'PROPRIETARIO',
        name: 'Vito Corleone (Fundador)',
        email: 'vito@doncorleoneclub.com.br',
        whatsapp: '(11) 98888-0000',
        avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&auto=format&fit=crop&q=80',
        specialties: ['Corte Executivo na Tesoura', 'Visagismo Facial', 'Barboterapia Real'],
        canViewAllProfessionals: true,
        commissionPercentage: 60,
        birthDate: '1980-08-20'
      },
      {
        id: 'demo-prof-enzo',
        tenantId: 'barbershop-commercial-demo',
        role: 'PROFISSIONAL',
        name: 'Enzo Rossi (Master Barber)',
        email: 'enzo@doncorleoneclub.com.br',
        whatsapp: '(11) 97777-1111',
        avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
        specialties: ['Corte Clássico', 'Barba Terapia VIP', 'Tratamento Capilar'],
        canViewAllProfessionals: false,
        commissionPercentage: 55,
        birthDate: '1990-03-12'
      }
    ],
    services: [
      {
        id: 'demo-srv-vip-1',
        tenantId: 'barbershop-commercial-demo',
        name: 'Corte Executivo na Tesoura & Visagismo',
        description: 'Consultoria de imagem personalizada, lavagem com shampoo importado e corte detalhado na tesoura.',
        durationMinutes: 50,
        price: 85.00,
        category: 'Cabelo',
        imageUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 25,
        active: true
      },
      {
        id: 'demo-srv-vip-2',
        tenantId: 'barbershop-commercial-demo',
        name: 'Ritual de Barboterapia Don Corleone',
        description: 'Esfoliação, toalhas com essência de eucalipto, navalha clássica e massagem facial relaxante.',
        durationMinutes: 45,
        price: 70.00,
        category: 'Barba',
        imageUrl: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 15,
        active: true
      },
      {
        id: 'demo-srv-vip-3',
        tenantId: 'barbershop-commercial-demo',
        name: 'Experiência Completa Don Corleone + Single Malt',
        description: 'Corte completo, barboterapia, tratamento do couro cabeludo e degustação de whisky single malt.',
        durationMinutes: 80,
        price: 145.00,
        category: 'Combos',
        imageUrl: 'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 25,
        active: true
      }
    ]
  },
  {
    id: 'vintage_oldschool',
    badge: '💈 Clássica Retrô',
    name: 'The Old School Vintage Barber',
    subtitle: 'Tradição & Navalha Fina',
    description: 'Ambiente nostálgico com cadeiras antigas de ferro fundido, jazz ambiente e navalha tradicional afiada.',
    themeColor: '#10B981',
    barbershop: {
      id: 'barbershop-commercial-demo',
      name: 'The Old School Vintage Barber',
      slug: 'the-old-school-vintage',
      customDomain: 'app.oldschoolbarber.com.br',
      logoUrl: APP_ASSETS.logo,
      bannerUrl: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1400&auto=format&fit=crop&q=85',
      salonImages: [
        'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1000&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1000&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1000&auto=format&fit=crop&q=80'
      ],
      about: 'A verdadeira arte da barbearia clássica. Pomadas tradicionais à base de água e óleo, navalhas esterilizadas e corte no pente e tesoura.',
      phone: '(11) 3214-5566',
      whatsapp: '(11) 97766-5544',
      address: {
        street: 'Rua dos Pinheiros',
        number: '420',
        neighborhood: 'Pinheiros',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '05422-000'
      },
      coordinates: {
        latitude: -23.5680,
        longitude: -46.6850
      },
      socialMedia: {
        instagram: '@oldschoolbarber.br',
        facebook: 'fb.com/oldschoolbarber'
      },
      planId: 'PLANO_UNICO',
      reminderConfig: {
        advanceMinutes: 60,
        enabled: true,
        whatsappTemplate: 'Olá {cliente}! Seu horário clássico na {barbearia} está agendado para {horario}. Esperamos você!'
      },
      primaryColor: '#10B981',
      status: 'ATIVA',
      isCommercialDemo: true,
      createdAt: '2026-01-01T00:00:00Z'
    },
    professionals: [
      {
        id: 'demo-prof-alberto',
        tenantId: 'barbershop-commercial-demo',
        role: 'PROPRIETARIO',
        name: 'Mestre Alberto (Tradicional)',
        email: 'alberto@oldschool.com.br',
        whatsapp: '(11) 97766-5544',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
        specialties: ['Corte Retrô', 'Barba Tradicional', 'Navalha'],
        canViewAllProfessionals: true,
        commissionPercentage: 50,
        birthDate: '1975-11-25'
      }
    ],
    services: [
      {
        id: 'demo-srv-vint-1',
        tenantId: 'barbershop-commercial-demo',
        name: 'Corte Retrô Tradicional',
        description: 'Pompadour, Slick Back, Side Part ou Buzz Cut executado no estilo clássico.',
        durationMinutes: 45,
        price: 50.00,
        category: 'Cabelo',
        imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 20,
        active: true
      },
      {
        id: 'demo-srv-vint-2',
        tenantId: 'barbershop-commercial-demo',
        name: 'Barba Clássica com Espuma Quente',
        description: 'Pincel de cerdas naturais, massagem calmante e pós-barba mentolado.',
        durationMinutes: 30,
        price: 40.00,
        category: 'Barba',
        imageUrl: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=400&auto=format&fit=crop&q=80',
        returnReminderDays: 15,
        active: true
      }
    ]
  }
];
