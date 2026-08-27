import React from 'react';
import { useApp } from '../../context/AppContext';
import { Sun, Moon } from 'lucide-react';

interface ThemeModeToggleProps {
  variant?: 'compact' | 'pill' | 'button';
  className?: string;
}

export const ThemeModeToggle: React.FC<ThemeModeToggleProps> = ({
  variant = 'compact',
  className = ''
}) => {
  const { colorMode, toggleColorMode } = useApp();
  const isLight = colorMode === 'light';

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={toggleColorMode}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all duration-200 cursor-pointer select-none active:scale-95 shadow-sm ${
          isLight
            ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20'
            : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700/80 hover:text-white'
        } ${className}`}
        title={isLight ? 'Alternar para Modo Escuro' : 'Alternar para Modo Claro'}
        aria-label={isLight ? 'Modo Escuro' : 'Modo Claro'}
      >
        {isLight ? (
          <>
            <Sun className="w-3.5 h-3.5 text-amber-500 stroke-[2.5] animate-spin-slow" />
            <span className="text-[11px] font-bold">Modo Claro</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-blue-400 stroke-[2.5]" />
            <span className="text-[11px] font-bold">Modo Escuro</span>
          </>
        )}
      </button>
    );
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={toggleColorMode}
        className={`flex items-center justify-between gap-3 w-full px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
          isLight
            ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
            : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:bg-neutral-800'
        } ${className}`}
        title={isLight ? 'Mudar para Modo Escuro' : 'Mudar para Modo Claro'}
      >
        <div className="flex items-center gap-2">
          {isLight ? (
            <Sun className="w-4 h-4 text-amber-500" />
          ) : (
            <Moon className="w-4 h-4 text-blue-400" />
          )}
          <span>{isLight ? 'Tema Claro' : 'Tema Escuro'}</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/10 dark:bg-white/10">
          {isLight ? 'Claro' : 'Escuro'}
        </span>
      </button>
    );
  }

  // Compact icon button default
  return (
    <button
      type="button"
      id="btn-toggle-dark-light"
      onClick={toggleColorMode}
      className={`p-2 sm:px-2.5 sm:py-1.5 rounded-xl border flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer active:scale-95 shadow-sm group ${
        isLight
          ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 shadow-amber-500/10'
          : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border-neutral-800 hover:border-neutral-700'
      } ${className}`}
      title={isLight ? 'Alternar para Modo Escuro (Dark)' : 'Alternar para Modo Claro (Light)'}
      aria-label="Alternar modo claro e escuro"
    >
      {isLight ? (
        <>
          <Sun className="w-4 h-4 text-amber-500 stroke-[2.2] group-hover:rotate-45 transition-transform duration-300" />
          <span className="hidden sm:inline text-[11px] font-bold text-neutral-800">Claro</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-blue-400 stroke-[2.2] group-hover:-rotate-12 transition-transform duration-300" />
          <span className="hidden sm:inline text-[11px] font-bold text-neutral-300">Escuro</span>
        </>
      )}
    </button>
  );
};
