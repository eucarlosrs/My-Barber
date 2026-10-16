/**
 * MY BARBER — Projeções Públicas de Dados
 * 
 * Regra Fundamental: Firestore Security Rules protegem DOCUMENTOS, não campos individuais.
 * Este módulo isola e sanitiza os dados públicos a partir de documentos completos/privados,
 * impedindo que informações pessoais (PII), logs internos, custos e comissões sejam expostos.
 */

import {
  Appointment,
  PublicAvailabilitySlot,
  User,
  PublicProfessionalProfile,
  CommunicationMessage,
  PublicCommunication,
  Raffle,
  PublicRaffle,
  Service,
  PublicService,
  ProfessionalScheduleConfig,
  PublicProfessionalScheduleConfig,
  Barbershop,
  PublicBarbershop,
  ServicePackage,
  PublicPackage,
  Promotion,
  PublicPromotion,
  GalleryWork,
  PublicGalleryWork
} from '../types';

/**
 * Converte um Appointment completo para um slot público de disponibilidade.
 * Expurgando: clientId, clientName, clientWhatsApp, notes, servicePrice, reminderSent, etc.
 * REGRA CRÍTICA DE INTEGRIDADE: Somente status == 'AGENDADO' compõe a projeção pública.
 * Agendamentos cancelados ou concluídos devem ser removidos e NUNCA publicados com status CANCELADO.
 */
export function toPublicAvailabilitySlot(apt: Appointment): PublicAvailabilitySlot {
  return {
    id: apt.id,
    tenantId: apt.tenantId,
    professionalId: apt.professionalId,
    date: apt.date,
    startTime: apt.startTime,
    endTime: apt.endTime,
    status: 'AGENDADO'
  };
}

/**
 * Converte um User com papel PROFISSIONAL para o perfil público de exibição.
 * Expurgando: uid, email, whatsapp, phone, username, password, canViewAllProfessionals,
 * commissionPercentage, birthDate, googleId, etc.
 */
export function toPublicProfessionalProfile(user: User): PublicProfessionalProfile {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    avatarUrl: user.avatarUrl,
    specialties: user.specialties || (user.specialty ? [user.specialty] : []),
    role: 'PROFISSIONAL'
  };
}

/**
 * Converte uma CommunicationMessage para novidade pública da barbearia.
 * Expurgando: logs[] (com nome e whatsapp de clientes), targetGroupName, etc.
 */
export function toPublicCommunication(comm: CommunicationMessage): PublicCommunication {
  return {
    id: comm.id,
    tenantId: comm.tenantId,
    title: comm.title,
    content: comm.content,
    type: comm.type,
    channel: comm.channel,
    sentAt: comm.sentAt
  };
}

/**
 * Converte um Raffle em sorteio público com contador agregado.
 * Expurgando: array participants[] com PII (nomes e celulares de participantes).
 */
export function toPublicRaffle(raffle: Raffle): PublicRaffle {
  return {
    id: raffle.id,
    tenantId: raffle.tenantId,
    title: raffle.title,
    description: raffle.description,
    prize: raffle.prize,
    drawDate: raffle.drawDate,
    imageUrl: raffle.imageUrl,
    status: raffle.status,
    showInHighlights: raffle.showInHighlights,
    highlightTag: raffle.highlightTag,
    participantsCount: Array.isArray(raffle.participants) ? raffle.participants.length : 0,
    winnerName: raffle.winnerName,
    winnerClientName: raffle.winnerClientName,
    createdAt: raffle.createdAt
  };
}

/**
 * Converte um Service para catálogo público.
 * Expurgando: commissionPercentage e returnReminderDays.
 */
export function toPublicService(service: Service): PublicService {
  return {
    id: service.id,
    tenantId: service.tenantId,
    name: service.name,
    description: service.description,
    durationMinutes: service.durationMinutes,
    price: service.price,
    category: service.category,
    imageUrl: service.imageUrl,
    active: service.active
  };
}

/**
 * Converte um ProfessionalScheduleConfig para grade de horários pública.
 * Expurgando: periodOverrides[].reason (motivos pessoais/médicos da ausência).
 */
export function toPublicSchedule(
  schedule: ProfessionalScheduleConfig & { id?: string; tenantId?: string },
  tenantId?: string
): PublicProfessionalScheduleConfig {
  return {
    id: schedule.id || `sched-${schedule.professionalId}`,
    professionalId: schedule.professionalId,
    tenantId: schedule.tenantId || tenantId,
    weeklySchedule: schedule.weeklySchedule,
    periodOverrides: (schedule.periodOverrides || []).map(po => ({
      id: po.id,
      professionalId: po.professionalId,
      startDate: po.startDate,
      endDate: po.endDate,
      shifts: po.shifts
    }))
  };
}

/**
 * Converte um Barbershop para vitrine pública.
 * Expurgando: planId, commercialMode, trialStartedAt, trialExpiresAt, reminderConfig.whatsappTemplate.
 */
export function toPublicBarbershop(barbershop: Barbershop): PublicBarbershop {
  return {
    id: barbershop.id,
    name: barbershop.name,
    slug: barbershop.slug,
    customDomain: barbershop.customDomain,
    logoUrl: barbershop.logoUrl,
    bannerUrl: barbershop.bannerUrl,
    salonImages: barbershop.salonImages || [],
    about: barbershop.about,
    phone: barbershop.phone,
    whatsapp: barbershop.whatsapp,
    address: barbershop.address,
    coordinates: barbershop.coordinates,
    socialMedia: barbershop.socialMedia,
    businessHours: barbershop.businessHours,
    primaryColor: barbershop.primaryColor,
    theme: barbershop.theme,
    status: barbershop.status
  };
}

/**
 * Converte um ServicePackage completo para o catálogo público de pacotes da vitrine.
 * Expurgando: comissões, custos internos, notas financeiras, IDs internos desnecessários.
 */
export function toPublicPackage(pkg: ServicePackage): PublicPackage {
  return {
    id: pkg.id,
    tenantId: pkg.tenantId,
    title: pkg.title,
    description: pkg.description,
    price: pkg.price,
    items: (pkg.items || []).map(item => ({
      id: item.id,
      type: item.type,
      itemId: item.itemId,
      name: item.name,
      totalQuantity: item.totalQuantity
    })),
    active: pkg.active
  };
}

/**
 * Converte uma Promotion para a vitrine pública de promoções.
 * Expurgando: custos internos de campanha, margens financeiras, relatórios de uso e notas gerenciais.
 */
export function toPublicPromotion(promo: Promotion): PublicPromotion {
  return {
    id: promo.id,
    tenantId: promo.tenantId,
    title: promo.title,
    description: promo.description,
    discountPercentage: promo.discountPercentage ?? promo.discountPercent,
    discountPercent: promo.discountPercent ?? promo.discountPercentage,
    promotionalPrice: promo.promotionalPrice,
    serviceId: promo.serviceId,
    serviceName: promo.serviceName,
    serviceCategory: promo.serviceCategory,
    code: promo.code,
    validUntil: promo.validUntil,
    active: promo.active,
    imageUrl: promo.imageUrl,
    bannerUrl: promo.bannerUrl,
    showInHighlights: promo.showInHighlights,
    highlightTag: promo.highlightTag
  };
}

/**
 * Converte uma GalleryWork para o portfólio público da barbearia.
 * Expurgando: dados de comissão profissional, custos de produtos e notas internas da barbearia.
 */
export function toPublicGalleryWork(work: GalleryWork): PublicGalleryWork {
  return {
    id: work.id,
    tenantId: work.tenantId,
    title: work.title,
    category: work.category,
    imageUrl: work.imageUrl,
    professionalId: work.professionalId,
    professionalName: work.professionalName,
    serviceId: work.serviceId,
    serviceName: work.serviceName,
    servicePrice: work.servicePrice,
    likesCount: work.likesCount || 0,
    description: work.description,
    createdAt: work.createdAt
  };
}
