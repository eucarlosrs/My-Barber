import React from 'react';
import { X, ShieldCheck, FileText, Lock, Clock, Calendar, CheckCircle } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  barbershopName?: string;
}

export const TermsModal: React.FC<TermsModalProps> = ({
  isOpen,
  onClose,
  barbershopName = 'MY BARBER'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col text-neutral-100 shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-black font-heading text-neutral-100">
                Termos de Uso & Privacidade
              </h3>
              <p className="text-[11px] text-neutral-400">
                {barbershopName} & Plataforma MY BARBER
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Fechar termos"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Scrollable */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs text-neutral-300 leading-relaxed font-sans scrollbar-thin">
          
          {/* Section 1 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-100">
              <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0" />
              <h4>1. Aceite dos Termos de Uso</h4>
            </div>
            <p className="text-neutral-400 pl-6">
              Ao acessar este aplicativo e conectar sua conta Google ou realizar agendamentos, você concorda expressamente com as diretrizes e regras aqui estipuladas para a unidade <strong className="text-neutral-200">{barbershopName}</strong> e a infraestrutura tecnológica <strong className="text-neutral-200">MY BARBER</strong>.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-100">
              <Calendar className="w-4 h-4 text-orange-400 shrink-0" />
              <h4>2. Regras de Agendamento e Horários</h4>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-neutral-400 pl-6">
              <li>
                <strong className="text-neutral-200">Pontualidade:</strong> Solicitamos comparecer com 5 a 10 minutos de antecedência ao horário agendado.
              </li>
              <li>
                <strong className="text-neutral-200">Tolerância de Atraso:</strong> A tolerância máxima para atrasos sem aviso prévio é de 10 minutos para não comprometer a grade dos próximos clientes.
              </li>
              <li>
                <strong className="text-neutral-200">Cancelamento ou Reagendamento:</strong> Pode ser feito diretamente pelo app na aba <em>Meus Agendamentos</em> com no mínimo 2 horas de antecedência.
              </li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-100">
              <Lock className="w-4 h-4 text-orange-400 shrink-0" />
              <h4>3. Proteção de Dados e Privacidade (LGPD)</h4>
            </div>
            <p className="text-neutral-400 pl-6">
              Seus dados de identificação (Nome, E-mail Google, WhatsApp e Data de Nascimento) são coletados exclusivamente para fins de confirmação de horários, emissão de lembretes automáticos e participação em sorteios e promoções da barbearia. Não compartilhamos suas informações com terceiros para fins comerciais.
            </p>
          </div>

          {/* Section 4 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-100">
              <Clock className="w-4 h-4 text-orange-400 shrink-0" />
              <h4>4. Sorteios, Vouchers e Promoções</h4>
            </div>
            <p className="text-neutral-400 pl-6">
              A concessão de cupons, descontos de aniversário e sorteios fica sujeita às regras de validade estabelecidas pelo estabelecimento, sendo pessoal e intransferível.
            </p>
          </div>

          <div className="p-3.5 bg-neutral-950 rounded-2xl border border-neutral-800 flex items-start gap-2.5 text-[11px] text-neutral-400">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Ao continuar conectado, você declara ter lido e estar de acordo com as diretrizes de atendimento e uso do serviço.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 font-black rounded-xl text-xs tracking-wide transition-all cursor-pointer active:scale-95"
          >
            ENTENDI E CONCORDO
          </button>
        </div>
      </div>
    </div>
  );
};
