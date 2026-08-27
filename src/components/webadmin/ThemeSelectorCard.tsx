import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BarbershopThemeId } from '../../types';
import { BARBERSHOP_THEMES, THEME_LIST, getThemeConfig } from '../../utils/theme';
import { Palette, CheckCircle2, Sparkles, Scissors, ShieldCheck, Check } from 'lucide-react';
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
      setSuccessNotice(`Tema "${BARBERSHOP_THEMES[themeId].name}" aplicado com sucesso e salvo no Firebase!`);
      setTimeout(() => setSuccessNotice(null), 4000);
    }, 250);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shadow-md transition-colors"
              style={{
                backgroundColor: activeConfig.lightBgColor,
                color: activeConfig.primaryColor,
                border: `1px solid ${activeConfig.borderColor}`
              }}
            >
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-neutral-100 font-heading">
                Identidade Visual & Tema da Barbearia
              </h2>
              <p className="text-xs text-neutral-400">
                Selecione o tema de cores exclusivo para a sua barbearia. Salvo no Firebase por barbearia.
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Theme Mode + Current Active Badge */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <ThemeModeToggle variant="pill" />

          <div
            className="px-3.5 py-1.5 rounded-2xl text-xs font-black flex items-center gap-2 border shadow-sm"
            style={{
              backgroundColor: activeConfig.lightBgColor,
              color: activeConfig.primaryColor,
              borderColor: activeConfig.borderColor
            }}
          >
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: activeConfig.primaryColor }}
            />
            <span>Ativo: {activeConfig.badgeLabel}</span>
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successNotice && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 p-3.5 rounded-2xl text-xs flex items-center gap-3 shadow-lg animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-semibold">{successNotice}</span>
        </div>
      )}

      {/* Multi-tenant Isolation Rule Info */}
      <div className="bg-neutral-950/80 border border-neutral-800/90 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-neutral-400">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold text-neutral-200">Isolamento Multi-Tenant Garantido</p>
          <p className="text-[11px] leading-relaxed">
            O tema escolhido é aplicado <strong>exclusivamente para a {currentBarbershop.name}</strong> e seus clientes, sem afetar nenhuma outra barbearia do sistema. A preferência é sincronizada no Firestore e mantida mesmo após sair.
          </p>
        </div>
      </div>

      {/* 4 Theme Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {THEME_LIST.map(theme => {
          const isSelected = theme.id === activeThemeId;
          const isSaving = savingThemeId === theme.id;

          return (
            <div
              key={theme.id}
              onClick={() => handleSelectTheme(theme.id)}
              className={`relative rounded-3xl p-5 border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden group ${
                isSelected
                  ? 'bg-neutral-950/90 shadow-2xl scale-[1.01]'
                  : 'bg-neutral-950/40 hover:bg-neutral-950/70 border-neutral-800 hover:border-neutral-700'
              }`}
              style={{
                borderColor: isSelected ? theme.primaryColor : undefined,
                boxShadow: isSelected ? `0 0 25px ${theme.glowColor}` : undefined
              }}
            >
              {/* Active Selection Pin */}
              {isSelected && (
                <div
                  className="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md z-10"
                  style={{
                    backgroundColor: theme.primaryColor,
                    color: theme.contrastTextColor
                  }}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                  <span>Em Uso</span>
                </div>
              )}

              {/* Theme Header & Palette Dot */}
              <div>
                <div className="flex items-center gap-3 mb-2.5 pr-20">
                  {/* Visual Color Swatch */}
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border shrink-0 transition-transform group-hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.hoverColor})`,
                      borderColor: theme.borderColor
                    }}
                  >
                    <Scissors
                      className="w-5 h-5 stroke-[2.5]"
                      style={{ color: theme.contrastTextColor }}
                    />
                  </div>

                  <div>
                    <h3 className="text-sm sm:text-base font-black text-neutral-100 font-heading leading-tight">
                      {theme.name}
                    </h3>
                    <p
                      className="text-[11px] font-bold mt-0.5"
                      style={{ color: theme.primaryColor }}
                    >
                      {theme.tagline}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                  {theme.description}
                </p>

                {/* Preview Mini Mockup Component */}
                <div className="my-4 p-3.5 bg-neutral-900/90 rounded-2xl border border-neutral-800/80 space-y-2.5">
                  <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                    Demonstração dos Componentes:
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Sample Button */}
                    <div
                      className="px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all"
                      style={{
                        backgroundColor: theme.primaryColor,
                        color: theme.contrastTextColor,
                        boxShadow: `0 2px 10px ${theme.glowColor}`
                      }}
                    >
                      <Scissors className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Agendar Horário</span>
                    </div>

                    {/* Sample Badge */}
                    <div
                      className="px-2.5 py-1 rounded-xl text-[11px] font-bold border flex items-center gap-1"
                      style={{
                        backgroundColor: theme.lightBgColor,
                        color: theme.primaryColor,
                        borderColor: theme.borderColor
                      }}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{theme.badgeLabel}</span>
                    </div>
                  </div>

                  {/* Preview Color Tags */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {theme.previewTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] font-mono font-bold bg-neutral-950 text-neutral-400 px-2 py-0.5 rounded-md border border-neutral-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isSelected || isSaving}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectTheme(theme.id);
                  }}
                  className={`w-full py-2.5 px-4 rounded-2xl text-xs font-black tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-neutral-800/50 text-neutral-400 border border-neutral-700/50 cursor-default'
                      : 'hover:brightness-110 active:scale-98'
                  }`}
                  style={
                    !isSelected
                      ? {
                          backgroundColor: theme.primaryColor,
                          color: theme.contrastTextColor,
                          boxShadow: `0 4px 15px ${theme.glowColor}`
                        }
                      : undefined
                  }
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                  ) : isSelected ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Tema Ativo Nesta Barbearia</span>
                    </>
                  ) : (
                    <>
                      <Palette className="w-4 h-4" />
                      <span>Ativar Este Tema</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
