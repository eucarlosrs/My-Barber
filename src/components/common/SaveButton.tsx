import React from 'react';
import { Save, Check, Loader2, AlertCircle } from 'lucide-react';

export interface SaveButtonProps {
  id?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit';
  isDirty?: boolean;
  isSaving?: boolean;
  isLoading?: boolean;
  isSaved?: boolean;
  errorMessage?: string | null;
  disabled?: boolean;
  label?: string;
  savingLabel?: string;
  savedLabel?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const SaveButton: React.FC<SaveButtonProps> = ({
  id = 'save-changes-button',
  onClick,
  type = 'button',
  isDirty = true,
  isSaving = false,
  isLoading = false,
  isSaved = false,
  errorMessage = null,
  disabled = false,
  label = 'Salvar alterações',
  savingLabel = 'Salvando alterações...',
  savedLabel = 'Alterações salvas!',
  className = '',
  size = 'md',
  fullWidth = false
}) => {
  const isCurrentlySaving = isSaving || isLoading;
  const isDisabled = disabled || isCurrentlySaving || (!isDirty && !isSaved);

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs rounded-xl gap-1.5',
    md: 'px-5 py-2.5 text-xs rounded-xl gap-2 font-bold',
    lg: 'px-6 py-3 text-sm rounded-2xl gap-2.5 font-extrabold'
  }[size];

  // Colors and visual feedback logic
  let stateClasses = '';

  if (isSaved) {
    stateClasses =
      'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 border border-emerald-500 cursor-default';
  } else if (isCurrentlySaving) {
    stateClasses =
      'bg-amber-600/80 text-neutral-950 border border-amber-500/50 cursor-wait opacity-90';
  } else if (isDirty && !disabled) {
    stateClasses =
      'bg-amber-500 hover:bg-amber-400 active:scale-98 text-neutral-950 shadow-lg shadow-amber-500/20 border border-amber-400/50 cursor-pointer font-black';
  } else {
    // Clean state: disabled
    stateClasses =
      'bg-neutral-800 text-neutral-500 border border-neutral-700/60 cursor-not-allowed opacity-70';
  }

  return (
    <div className={`inline-flex flex-col ${fullWidth ? 'w-full' : ''}`}>
      <button
        id={id}
        type={type}
        onClick={onClick}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center transition-all duration-200 select-none ${sizeClasses} ${stateClasses} ${
          fullWidth ? 'w-full' : ''
        } ${className}`}
        aria-live="polite"
      >
        {isSaved ? (
          <>
            <Check className="w-4 h-4 text-white stroke-[2.5] animate-in zoom-in-50 duration-200" />
            <span>{savedLabel}</span>
          </>
        ) : isCurrentlySaving ? (
          <>
            <Loader2 className="w-4 h-4 text-neutral-950 animate-spin" />
            <span>{savingLabel}</span>
          </>
        ) : (
          <>
            <Save className={`w-4 h-4 ${isDirty && !disabled ? 'text-neutral-950' : 'text-neutral-500'}`} />
            <span>{label}</span>
          </>
        )}
      </button>

      {errorMessage && (
        <span className="text-[11px] text-red-400 flex items-center gap-1 mt-1.5 font-medium animate-in fade-in-50">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </span>
      )}
    </div>
  );
};
