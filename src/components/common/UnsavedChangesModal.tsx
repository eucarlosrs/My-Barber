import React from 'react';
import { AlertTriangle, X, Check, ArrowLeft } from 'lucide-react';

export interface UnsavedChangesModalProps {
  isOpen: boolean;
  onCancel?: () => void; // Continue editing
  onClose?: () => void; // Alias for Continue editing
  onContinueEditing?: () => void; // Alias for Continue editing
  onDiscard: () => void; // Discard and leave
  onSave?: () => Promise<void> | void; // Optional: Save and leave
  onSaveAndContinue?: () => Promise<void> | void; // Optional: Save and leave
  title?: string;
  message?: string;
  isSaving?: boolean;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onCancel,
  onClose,
  onContinueEditing,
  onDiscard,
  onSave,
  onSaveAndContinue,
  title = 'Alterações não salvas',
  message = 'Você fez modificações nesta seção que ainda não foram salvas. Se sair agora, suas alterações serão descartadas.',
  isSaving = false
}) => {
  if (!isOpen) return null;

  const handleCancel = onCancel || onContinueEditing || onClose || (() => {});
  const handleSave = onSaveAndContinue || onSave;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="unsaved-changes-dialog"
        className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="space-y-1 flex-1">
            <h3 id="unsaved-dialog-title" className="text-base font-bold text-neutral-100 font-heading">
              {title}
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-neutral-800/80">
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="px-4 py-2.5 bg-neutral-800/80 hover:bg-red-500/15 hover:text-red-300 text-neutral-300 rounded-xl text-xs font-semibold border border-neutral-700/60 hover:border-red-500/30 transition-colors"
          >
            Descartar alterações
          </button>

          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold transition-colors"
          >
            Continuar editando
          </button>

          {handleSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Salvando...' : 'Salvar e continuar'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
