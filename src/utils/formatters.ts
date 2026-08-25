import { Barbershop, BarbershopStatus } from '../types';

/**
 * Masks a phone number string to Brazilian format: (XX) XXXXX-XXXX or (XX) XXXX-XXXX
 */
export function formatPhoneNumber(value: string): string {
  // Remove non-digit characters
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Retorna o status efetivo da barbearia considerando a expiração automática de 3 dias do teste grátis
 */
export function getBarbershopEffectiveStatus(shop: Barbershop): BarbershopStatus {
  if (shop.status === 'INATIVA' || shop.status === 'INACTIVE') {
    return 'INATIVA';
  }

  // Se explicitamente marcada como ativa no plano pago
  if (shop.status === 'ATIVA' || shop.status === 'ACTIVE') {
    return 'ATIVA';
  }

  // Se marcada como teste ou em modalidade de teste grátis
  if (shop.status === 'TESTE' || shop.commercialMode === 'TESTE_GRATIS') {
    if (shop.trialExpiresAt) {
      const now = new Date().getTime();
      const expiresAt = new Date(shop.trialExpiresAt).getTime();
      if (now > expiresAt) {
        return 'TESTE_EXPIRADO';
      }
    }
    return 'TESTE';
  }

  if (shop.status === 'TESTE_EXPIRADO') {
    return 'TESTE_EXPIRADO';
  }

  return 'ATIVA';
}

/**
 * Retorna informações detalhadas e amigáveis sobre o período de teste de uma barbearia
 */
export function getTrialStatusInfo(shop: Barbershop): {
  isTrial: boolean;
  isExpired: boolean;
  remainingText: string;
  expiredText?: string;
  daysLeft: number;
  hoursLeft: number;
} {
  const effectiveStatus = getBarbershopEffectiveStatus(shop);
  const isTrial = effectiveStatus === 'TESTE';
  const isExpired = effectiveStatus === 'TESTE_EXPIRADO';

  if (!shop.trialExpiresAt) {
    return {
      isTrial,
      isExpired,
      remainingText: isTrial ? '3 dias de teste' : '',
      daysLeft: isTrial ? 3 : 0,
      hoursLeft: 0
    };
  }

  const now = new Date().getTime();
  const expiresAt = new Date(shop.trialExpiresAt).getTime();
  const diffMs = expiresAt - now;

  if (diffMs <= 0) {
    const expiredHoursAgo = Math.max(1, Math.round(Math.abs(diffMs) / (1000 * 60 * 60)));
    const expiredDaysAgo = Math.floor(expiredHoursAgo / 24);
    const expiredText = expiredDaysAgo > 0 
      ? `Expirou há ${expiredDaysAgo} dia(s)`
      : `Expirou há ${expiredHoursAgo} hora(s)`;

    return {
      isTrial: false,
      isExpired: true,
      remainingText: 'Período de teste finalizado',
      expiredText,
      daysLeft: 0,
      hoursLeft: 0
    };
  }

  const totalHoursLeft = Math.ceil(diffMs / (1000 * 60 * 60));
  const daysLeft = Math.floor(totalHoursLeft / 24);
  const hoursLeft = totalHoursLeft % 24;

  let remainingText = '';
  if (daysLeft > 0) {
    remainingText = `${daysLeft} dia${daysLeft > 1 ? 's' : ''} e ${hoursLeft}h`;
  } else {
    remainingText = `${totalHoursLeft} hora${totalHoursLeft > 1 ? 's' : ''}`;
  }

  return {
    isTrial: true,
    isExpired: false,
    remainingText: `Restam ${remainingText}`,
    daysLeft,
    hoursLeft
  };
}

