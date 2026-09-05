/**
 * Utilitário de Exportação de Dados do Ecossistema My Barber (Exclusivo Super Admin)
 * Gera planilhas em formato compatível com Excel (.xlsx XML Spreadsheet / CSV com BOM UTF-8)
 * Operação 100% segura, estritamente de leitura (não altera dados do Firebase).
 */

import { Barbershop, User, Appointment, Service, CustomPlan, MY_BARBER_PLANS } from '../types';
import { getBarbershopEffectiveStatus, getTrialStatusInfo, formatPhoneNumber } from './formatters';

/**
 * Escapa valores para CSV compatível com Excel brasileiro (delimitador ';')
 */
function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Dispara o download no navegador de um arquivo gerado em memória
 */
function triggerDownload(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 1. EXPORTAÇÃO DOS DADOS DOS CLIENTES
 * Relação clara: Cliente -> Barbearia Pertencente
 */
export function exportClientsData(params: {
  users: User[];
  barbershops: Barbershop[];
  allAppointments?: Appointment[];
}) {
  const { users, barbershops, allAppointments = [] } = params;

  // Filtrar apenas usuários com perfil de CLIENTE
  const clients = users.filter(u => u.role === 'CLIENTE');

  // Mapa rápido de barbearias por ID
  const shopMap = new Map<string, Barbershop>();
  barbershops.forEach(shop => shopMap.set(shop.id, shop));

  // Mapa de agendamentos por cliente (para totalizar histórico)
  const appointmentCountMap = new Map<string, number>();
  const lastAppointmentMap = new Map<string, string>();

  allAppointments.forEach(apt => {
    if (apt.clientId) {
      const currentCount = appointmentCountMap.get(apt.clientId) || 0;
      appointmentCountMap.set(apt.clientId, currentCount + 1);

      const existingLastDate = lastAppointmentMap.get(apt.clientId);
      if (!existingLastDate || apt.date > existingLastDate) {
        lastAppointmentMap.set(apt.clientId, apt.date);
      }
    }
  });

  // Cabeçalhos das colunas
  const headers = [
    'ID do Cliente',
    'Nome Completo / Apelido',
    'WhatsApp / Telefone',
    'WhatsApp Formatado',
    'Data de Nascimento',
    'E-mail',
    'Barbearia Pertencente',
    'ID da Barbearia (Tenant ID)',
    'Slug / Domínio da Barbearia',
    'Cidade da Barbearia',
    'Estado da Barbearia',
    'Total de Agendamentos Realizados',
    'Último Agendamento',
    'Provedor de Login (Auth)',
    'Data de Cadastro no App'
  ];

  const rows: string[] = [];
  rows.push(headers.map(escapeCsvValue).join(';'));

  clients.forEach(client => {
    const shop = shopMap.get(client.tenantId);
    const shopName = shop ? shop.name : (client.tenantId === 'platform-global' ? 'Plataforma Global' : client.tenantId);
    const shopSlug = shop ? (shop.slug || shop.customDomain || '') : '';
    const shopCity = shop?.address?.city || '';
    const shopState = shop?.address?.state || '';

    const totalAppointments = appointmentCountMap.get(client.id) || 0;
    const lastAppointmentDate = lastAppointmentMap.get(client.id) || 'Sem agendamentos registrados';

    const row = [
      client.id,
      client.name || 'Não informado',
      client.whatsapp || '',
      formatPhoneNumber(client.whatsapp || ''),
      client.birthDate || 'Não informada',
      client.email || 'Não informado',
      shopName,
      client.tenantId,
      shopSlug,
      shopCity,
      shopState,
      totalAppointments,
      lastAppointmentDate,
      client.authProvider || 'SYSTEM',
      client.createdAt ? new Date(client.createdAt).toLocaleDateString('pt-BR') : 'Data não registrada'
    ];

    rows.push(row.map(escapeCsvValue).join(';'));
  });

  // Prefixo BOM UTF-8 (\uFEFF) para garantir abertura com acentuação perfeita no Excel
  const csvContent = '\uFEFF' + rows.join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerDownload(csvContent, `mybarber_clientes_todas_barbearias_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * 2. EXPORTAÇÃO DOS DADOS DAS BARBEARIAS
 * Contém dados cadastrais, plano, assinaturas, contatos, trial e links exclusivos
 */
export function exportBarbershopsData(params: {
  barbershops: Barbershop[];
  users: User[];
  allServices?: Service[];
  allAppointments?: Appointment[];
  customPlans?: CustomPlan[];
  getBarbershopDirectUrl?: (barbershop?: Barbershop | string) => string;
}) {
  const {
    barbershops,
    users,
    allServices = [],
    allAppointments = [],
    customPlans = [],
    getBarbershopDirectUrl
  } = params;

  // Mapear proprietários por barbearia
  const ownerMap = new Map<string, User>();
  const professionalsCountMap = new Map<string, number>();
  const clientsCountMap = new Map<string, number>();

  users.forEach(u => {
    if (u.role === 'PROPRIETARIO' && !ownerMap.has(u.tenantId)) {
      ownerMap.set(u.tenantId, u);
    }
    if (u.role === 'PROFISSIONAL' || u.role === 'PROPRIETARIO') {
      const current = professionalsCountMap.get(u.tenantId) || 0;
      professionalsCountMap.set(u.tenantId, current + 1);
    }
    if (u.role === 'CLIENTE') {
      const current = clientsCountMap.get(u.tenantId) || 0;
      clientsCountMap.set(u.tenantId, current + 1);
    }
  });

  // Contagem de serviços por barbearia
  const servicesCountMap = new Map<string, number>();
  allServices.forEach(s => {
    const current = servicesCountMap.get(s.tenantId) || 0;
    servicesCountMap.set(s.tenantId, current + 1);
  });

  // Contagem de agendamentos por barbearia
  const appointmentsCountMap = new Map<string, number>();
  allAppointments.forEach(a => {
    const current = appointmentsCountMap.get(a.tenantId) || 0;
    appointmentsCountMap.set(a.tenantId, current + 1);
  });

  // Cabeçalhos
  const headers = [
    'ID da Barbearia (Tenant ID)',
    'Nome da Barbearia',
    'Slug / Identificador de URL',
    'Link Exclusivo de Agendamento',
    'Status Efetivo',
    'Modalidade Comercial',
    'Plano Contratado',
    'Valor Mensal do Plano (R$)',
    'Proprietário / Responsável',
    'WhatsApp do Proprietário',
    'E-mail do Proprietário',
    'Telefone da Barbearia',
    'WhatsApp da Barbearia',
    'Data de Cadastro',
    'Início do Teste Grátis (Trial)',
    'Término do Teste Grátis (Trial)',
    'Situação do Teste Grátis',
    'Endereço Completo',
    'Bairro',
    'Cidade',
    'Estado (UF)',
    'CEP',
    'Qtd. Profissionais / Barbeiros',
    'Qtd. Clientes Registrados',
    'Qtd. Serviços Cadastrados',
    'Total de Agendamentos'
  ];

  const rows: string[] = [];
  rows.push(headers.map(escapeCsvValue).join(';'));

  barbershops.forEach(shop => {
    const effectiveStatus = getBarbershopEffectiveStatus(shop);
    const trialInfo = getTrialStatusInfo(shop);
    const owner = ownerMap.get(shop.id);

    // Identificar Plano
    const customPlan = customPlans.find(p => p.id === shop.planId);
    const defaultPlan = MY_BARBER_PLANS[shop.planId];
    const planName = customPlan ? customPlan.name : (defaultPlan ? defaultPlan.name : (shop.planId || 'Plano Único & Fixo'));
    const planPrice = customPlan ? customPlan.priceMonthly : (defaultPlan ? defaultPlan.priceMonthly : 49.90);

    // Link exclusivo
    const directUrl = getBarbershopDirectUrl
      ? getBarbershopDirectUrl(shop)
      : `https://${shop.slug || 'barbearia'}.mybarberbr.com.br`;

    // Endereço
    const street = shop.address?.street || '';
    const number = shop.address?.number || '';
    const complement = shop.address?.complement ? ` (${shop.address.complement})` : '';
    const fullStreet = street ? `${street}, ${number}${complement}` : 'Não informado';

    const row = [
      shop.id,
      shop.name || 'Sem nome',
      shop.slug || '',
      directUrl,
      effectiveStatus,
      shop.commercialMode || (effectiveStatus === 'TESTE' ? 'TESTE_GRATIS' : 'PAGO'),
      planName,
      planPrice.toFixed(2).replace('.', ','),
      owner ? owner.name : 'Não cadastrado',
      owner ? formatPhoneNumber(owner.whatsapp || '') : '',
      owner ? (owner.email || '') : '',
      formatPhoneNumber(shop.phone || ''),
      formatPhoneNumber(shop.whatsapp || ''),
      shop.createdAt ? new Date(shop.createdAt).toLocaleDateString('pt-BR') : 'Não informada',
      shop.trialStartedAt ? new Date(shop.trialStartedAt).toLocaleString('pt-BR') : 'Não aplicável',
      shop.trialExpiresAt ? new Date(shop.trialExpiresAt).toLocaleString('pt-BR') : 'Não aplicável',
      trialInfo.isTrial ? trialInfo.remainingText : (trialInfo.isExpired ? (trialInfo.expiredText || 'Expirado') : 'Período regular / Plano Ativo'),
      fullStreet,
      shop.address?.neighborhood || '',
      shop.address?.city || '',
      shop.address?.state || '',
      shop.address?.zipCode || '',
      professionalsCountMap.get(shop.id) || 0,
      clientsCountMap.get(shop.id) || 0,
      servicesCountMap.get(shop.id) || 0,
      appointmentsCountMap.get(shop.id) || 0
    ];

    rows.push(row.map(escapeCsvValue).join(';'));
  });

  const csvContent = '\uFEFF' + rows.join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerDownload(csvContent, `mybarber_barbearias_cadastradas_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}
