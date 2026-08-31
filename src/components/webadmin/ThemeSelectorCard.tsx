import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BarbershopThemeId } from '../../types';
import { BARBERSHOP_THEMES, THEME_LIST, getThemeConfig } from '../../utils/theme';
import { Palette, CheckCircle2, ShieldCheck, Check } from 'lucide-react';
import { ThemeModeToggle } from '../common/ThemeModeToggle';

export const ThemeSelectorCard: React.FC = () => {
  const { currentBarbershop, updateBarbershop } = useApp();
  const [savingThemeId, setSavingThemeId] = useState<BarbershopThemeId | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const activeThemeId: BarbershopThemeId = currentBarbershop.theme || 'CURRENT';
  const activeConfig = getThemeConfig(activeThemeId);

  const handleSelectTheme = (themeId: BarbershopThemeId) => {
    if (themeId === activeThemeId) return;

    setSavingThemeId(themeId);
    updateBarbershop({ theme: themeId });

    setTimeout(() => {
      setSavingThemeId(null);
      setSuccessNotice(`Tema "${BARBERSHOP_THEMES[themeId].name}" aplicado com sucesso!`);
      setTimeout(() => setSuccessNotice(null), 3000);
    }, 200);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
      {/* Header Compacto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
            style={{
              backgroundColor: activeConfig.lightBgColor,
              color: activeConfig.primaryColor,
              border: `1px solid ${activeConfig.borderColor}`
            }}
          >
            <Palette className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-neutral-100 font-heading">
              Tema & Paleta de Cores
            </h2>
            <p className="text-[11px] text-neutral-400">
              Personalize o tom visual do aplicativo exclusivo da sua barbearia.
            </p>
          </div>
        </div>

        {/* Controls: Theme Mode + Active Theme Pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ThemeModeToggle variant="pill" />

          <div
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border"
            style={{
              backgroundColor: activeConfig.lightBgColor,
              color: activeConfig.primaryColor,
              borderColor: activeConfig.borderColor
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: activeConfig.primaryColor }}
            />
            <span>{activeConfig.badgeLabel}</span>
          </div>
        </div>
      </div>

      {/* Success Notice Alert */}
      {successNotice && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-3 py-2 rounded-xl text-xs flex items-center gap-2 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{successNotice}</span>
        </div>
      )}

      {/* Grid de Seleção de Temas Compacto e Elegante */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {THEME_LIST.map(theme => {
          const isSelected = theme.id === activeThemeId;
          const isSaving = savingThemeId === theme.id;

          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleSelectTheme(theme.id)}
              disabled={isSaving}
              className={`relative text-left rounded-xl p-3 border transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 group ${
                isSelected
                  ? 'bg-neutral-950/90 shadow-md ring-1'
                  : 'bg-neutral-950/40 hover:bg-neutral-950/70 border-neutral-800/80 hover:border-neutral-700'
              }`}
              style={{
                borderColor: isSelected ? theme.primaryColor : undefined,
                boxShadow: isSelected ? `0 0 16px ${theme.glowColor}` : undefined
              }}
            >
              {/* Top Row: Swatch + Title */}
              <div className="flex items-center gap-2.5 w-full">
                {/* Visual Palette Gradient Circle */}
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm border transition-transform group-hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.hoverColor})`,
                    borderColor: theme.borderColor
                  }}
                >
                  {isSelected ? (
                    <Check
                      className="w-3.5 h-3.5 stroke-[3]"
                      style={{ color: theme.contrastTextColor }}
                    />
                  ) : (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: theme.contrastTextColor }}
                    />
                  )}
                </div>

                {/* Title and Tag */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="text-xs font-bold text-neutral-100 truncate font-heading">
                      {theme.name.replace(/^\d+\.\s*/, '')}
                    </h3>
                  </div>
                  <p
                    className="text-[10px] font-medium truncate"
                    style={{ color: theme.primaryColor }}
                  >
                    {theme.tagline}
                  </p>
                </div>
              </div>

              {/* Bottom Row: Hex Swatches + Action Indicator */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-900 w-full text-[10px]">
                <div className="flex items-center gap-1 font-mono text-neutral-400">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: theme.primaryColor }}
                  />
                  <span>{theme.primaryColor}</span>
                </div>

                <div>
                  {isSaving ? (
                    <div className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                  ) : isSelected ? (
                    <span
                      className="px-2 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1"
                      style={{
                        backgroundColor: theme.lightBgColor,
                        color: theme.primaryColor,
                        border: `1px solid ${theme.borderColor}`
                      }}
                    >
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                      Ativo
                    </span>
                  ) : (
                    <span className="text-neutral-400 group-hover:text-neutral-200 font-medium transition-colors">
                      Selecionar
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Micro Footer com Informação de Isolamento */}
      <div className="flex items-center gap-2 pt-2 text-[11px] text-neutral-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>
          Tema salvo por barbearia no Firebase e isolado exclusivamente para a <strong className="text-neutral-300">{currentBarbershop.name}</strong>.
        </span>
      </div>
    </div>
  );
};

