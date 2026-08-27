import { BarbershopThemeId } from '../types';

export interface BarbershopThemeOption {
  id: BarbershopThemeId;
  name: string;
  badgeLabel: string;
  tagline: string;
  description: string;
  primaryColor: string;
  hoverColor: string;
  glowColor: string;
  contrastTextColor: string;
  lightBgColor: string;
  borderColor: string;
  previewTags: string[];
  gradient: string;
}

export const BARBERSHOP_THEMES: Record<BarbershopThemeId, BarbershopThemeOption> = {
  CURRENT: {
    id: 'CURRENT',
    name: '1. Tema Atual (Original)',
    badgeLabel: 'Padrão My Barber',
    tagline: 'Laranja Clássico & Âmbar Quente',
    description: 'Mantém exatamente a paleta atual consagrada do aplicativo com tons quentes e marcantes.',
    primaryColor: '#FF6B00',
    hoverColor: '#E05A00',
    glowColor: 'rgba(255, 107, 0, 0.35)',
    contrastTextColor: '#0D0D0D',
    lightBgColor: 'rgba(255, 107, 0, 0.12)',
    borderColor: 'rgba(255, 107, 0, 0.35)',
    previewTags: ['#FF6B00', 'Âmbar Quente', 'Original'],
    gradient: 'from-[#FF6B00] to-[#D95400]'
  },
  GOLD: {
    id: 'GOLD',
    name: '2. Tema Dourado (Premium)',
    badgeLabel: 'Gold Metálico',
    tagline: 'Dourado Nobre & Sofisticação',
    description: 'Inspirado em acabamentos metálicos dourados (#D4AF37 / #E5B83B), transmitindo luxo e alto padrão.',
    primaryColor: '#E5B83B',
    hoverColor: '#CA9A24',
    glowColor: 'rgba(229, 184, 59, 0.35)',
    contrastTextColor: '#0D0D0D',
    lightBgColor: 'rgba(229, 184, 59, 0.12)',
    borderColor: 'rgba(229, 184, 59, 0.35)',
    previewTags: ['#D4AF37', '#E5B83B', 'Luxury'],
    gradient: 'from-[#F5D061] via-[#E5B83B] to-[#B8871E]'
  },
  BLUE: {
    id: 'BLUE',
    name: '3. Tema Azul (Moderno)',
    badgeLabel: 'Cyan Profissional',
    tagline: 'Azul #00BFFF & Tecnologia',
    description: 'Visual moderno, equilibrado e dinâmico com destaque em azul elétrico e ciano profundo.',
    primaryColor: '#00BFFF',
    hoverColor: '#009ED1',
    glowColor: 'rgba(0, 191, 255, 0.35)',
    contrastTextColor: '#0D0D0D',
    lightBgColor: 'rgba(0, 191, 255, 0.12)',
    borderColor: 'rgba(0, 191, 255, 0.35)',
    previewTags: ['#00BFFF', 'Azul Elétrico', 'Moderno'],
    gradient: 'from-[#00BFFF] via-[#0284C7] to-[#0369A1]'
  },
  NEON_GREEN: {
    id: 'NEON_GREEN',
    name: '4. Tema Verde Neon (Destaque)',
    badgeLabel: 'Alto Impacto',
    tagline: 'Verde Neon #A3FF00 Eletrizante',
    description: 'Máximo contraste e destaque em botões de ação, agendamentos, estados ativos e indicadores.',
    primaryColor: '#A3FF00',
    hoverColor: '#8FE000',
    glowColor: 'rgba(163, 255, 0, 0.45)',
    contrastTextColor: '#0A0A0A',
    lightBgColor: 'rgba(163, 255, 0, 0.14)',
    borderColor: 'rgba(163, 255, 0, 0.40)',
    previewTags: ['#A3FF00', '#AFFF00', 'Verde Neon'],
    gradient: 'from-[#AFFF00] via-[#A3FF00] to-[#7BC600]'
  }
};

export const THEME_LIST = Object.values(BARBERSHOP_THEMES);

export function getThemeConfig(themeId?: BarbershopThemeId): BarbershopThemeOption {
  if (themeId && BARBERSHOP_THEMES[themeId]) {
    return BARBERSHOP_THEMES[themeId];
  }
  return BARBERSHOP_THEMES.CURRENT;
}

export function getThemeCssVariables(themeId?: BarbershopThemeId): React.CSSProperties {
  const cfg = getThemeConfig(themeId);
  return {
    ['--theme-primary' as any]: cfg.primaryColor,
    ['--theme-hover' as any]: cfg.hoverColor,
    ['--theme-glow' as any]: cfg.glowColor,
    ['--theme-contrast' as any]: cfg.contrastTextColor,
    ['--theme-light-bg' as any]: cfg.lightBgColor,
    ['--theme-border' as any]: cfg.borderColor,
  };
}
