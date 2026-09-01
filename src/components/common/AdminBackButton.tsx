import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface AdminBackButtonProps {
  /** Label to display next to the arrow icon (defaults to "Voltar") */
  label?: string;
  /** Custom destination or action callback */
  onClick: () => void;
  /** Additional styling classes */
  className?: string;
  /** Subtitle or context of where it returns to (e.g. "para Visão Geral") */
  contextLabel?: string;
}

/**
 * Universal Back Button for all administrative areas (Super Admin, Owner/Manager, Professionals, Submenus, Modals, Forms)
 * Follows the global rule: Never leave the user stuck without a clear way to return to the previous screen.
 */
export const AdminBackButton: React.FC<AdminBackButtonProps> = ({
  label = 'Voltar',
  onClick,
  className = '',
  contextLabel
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/80 hover:border-orange-500/50 text-neutral-300 hover:text-white text-xs font-bold transition-all duration-200 shadow-sm active:scale-95 cursor-pointer ${className}`}
      title={contextLabel ? `Voltar ${contextLabel}` : 'Voltar para a página anterior'}
      aria-label={contextLabel ? `Voltar ${contextLabel}` : 'Voltar'}
    >
      <div className="w-5 h-5 rounded-lg bg-neutral-800 group-hover:bg-orange-500/20 border border-neutral-700 group-hover:border-orange-500/40 flex items-center justify-center transition-colors">
        <ArrowLeft className="w-3.5 h-3.5 text-neutral-300 group-hover:text-orange-400 group-hover:-translate-x-0.5 transition-all" />
      </div>
      <span className="font-heading">{label}</span>
      {contextLabel && (
        <span className="text-[11px] font-normal text-neutral-400 group-hover:text-neutral-300 hidden sm:inline">
          {contextLabel}
        </span>
      )}
    </button>
  );
};
