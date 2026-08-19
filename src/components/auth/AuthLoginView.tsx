import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Scissors,
  Crown,
  Building2,
  Lock,
  Mail,
  Phone,
  ArrowRight,
  Sparkles,
  AlertCircle,
  KeyRound,
  LogIn,
  ChevronDown,
  ChevronUp,
  User,
  Shield
} from 'lucide-react';
import { UserRole } from '../../types';

export const AuthLoginView: React.FC = () => {
  const { loginWithCredentials, loginWithGoogle, setViewMode, currentBarbershop, users } = useApp();

  const [whatsappPhone, setWhatsappPhone] = useState('(11) 99123-4567');
  const [googleEmail, setGoogleEmail] = useState('carlosrs.email@gmail.com');
  const [googleName, setGoogleName] = useState('Carlos Eduardo');
  const [useCustomGoogleAccount, setUseCustomGoogleAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Admin collapsible login
  const [showAdminSection, setShowAdminSection] = useState(false);
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Quick Demo Accounts to test each hierarchy immediately
  const demoAccounts = [
    {
      role: 'SUPER_ADMIN' as UserRole,
      title: 'Painel Carlos Silva (Dono da Plataforma)',
      name: 'Carlos Silva (Painel Exclusivo)',
      identifier: 'carlosrs.email@gmail.com',
      badge: '👑 Painel Carlos Silva',
      badgeColor: 'bg-[#FF6B00]/10 text-[#FF6B00] border-[#FF6B00]/30',
      description: 'Controle geral da plataforma My Barber, barbearias, planos, usuários e auditoria.',
      targetView: 'Painel Carlos Silva'
    },
    {
      role: 'PROPRIETARIO' as UserRole,
      title: 'Proprietário da Barbearia',
      name: 'Barbearia Rodrigues',
      identifier: 'contato@barbeariarodrigues.com.br',
      badge: '🏢 Barbearia Rodrigues',
      badgeColor: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      description: 'Gerenciamento operacional: agendamentos, serviços, barbeiros, clientes e fotos.',
      targetView: 'WebAdmin da Barbearia'
    },
    {
      role: 'PROFISSIONAL' as UserRole,
      title: 'Profissional / Barbeiro',
      name: 'Marcos Oliveira (Mestre)',
      identifier: 'marcos@barbeariadojoao.com.br',
      badge: '✂️ Equipe Barbearia Rodrigues',
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      description: 'Rotina de atendimentos, agenda de horários, comissões e encaixes.',
      targetView: 'App Profissional'
    },
    {
      role: 'CLIENTE' as UserRole,
      title: 'Cliente da Barbearia',
      name: 'Carlos Eduardo',
      identifier: '(11) 99123-4567',
      badge: '👤 Cliente Final',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      description: 'Experiência de agendamento em tela cheia, serviços, fotos, fidelidade e cupons.',
      targetView: 'App da Barbearia (Tela Cheia)'
    }
  ];

  const handleGoogleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDigits = whatsappPhone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setErrorMsg('Por favor, informe seu número de WhatsApp com DDD para prosseguir com o login Google.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      loginWithGoogle({
        email: googleEmail.trim().toLowerCase(),
        name: googleName.trim() || 'Cliente Google',
        whatsapp: whatsappPhone.trim(),
        birthDate: '1995-08-15',
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(googleName.trim() || 'Cliente')}&background=ea580c&color=fff`
      });
      setIsLoading(false);
    }, 400);
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminIdentifier.trim()) {
      setErrorMsg('Informe o e-mail ou WhatsApp de acesso.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      const result = loginWithCredentials(adminIdentifier.trim(), adminPassword);
      setIsLoading(false);
      if (!result.success) {
        setErrorMsg(result.error || 'Credenciais não encontradas.');
      }
    }, 400);
  };

  const handleQuickLogin = (emailOrPhone: string) => {
    setIsLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      loginWithCredentials(emailOrPhone);
      setIsLoading(false);
    }, 300);
  };

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex flex-col justify-between selection:bg-orange-500 selection:text-neutral-950">
      {/* Subtle background ambient lights */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[650px] h-[350px] bg-[#FF6B00]/10 blur-[140px] rounded-full"></div>
        <div className="absolute -bottom-40 right-10 w-[450px] h-[300px] bg-[#D95400]/5 blur-[120px] rounded-full"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        
        {/* Top Header - Clean and Direct */}
        <div className="text-center max-w-2xl mx-auto mb-8 flex flex-col items-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#F5F5F5] tracking-tight font-heading">
            MY <span className="text-[#FF6B00]">BARBER</span>
          </h1>

          {/* White Mustache Badge (Identical to reference image) */}
          <div className="mt-2.5 flex items-center justify-center">
            <svg
              className="w-20 h-9 sm:w-24 sm:h-11 text-[#F5F5F5] drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]"
              viewBox="0 0 200 80"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M 100 32 C 86 16, 66 16, 52 24 C 38 32, 28 42, 21 44 C 17 35, 20 25, 30 25 C 35 25, 39 31, 39 36 C 33 19, 20 17, 10 28 C 4 37, 5 54, 15 64 C 25 74, 40 76, 58 74 C 74 72, 90 62, 100 48 C 110 62, 126 72, 142 74 C 160 76, 175 74, 185 64 C 195 54, 196 37, 190 28 C 180 17, 167 19, 161 36 C 161 31, 165 25, 170 25 C 180 25, 183 35, 179 44 C 172 42, 162 32, 148 24 C 134 16, 114 16, 100 32 Z"
              />
            </svg>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-4xl mx-auto w-full">
          
          {/* Main Column: Google + WhatsApp Login Form */}
          <div className="lg:col-span-7 bg-[#1C1C1C] border border-[#2D2D2D] rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
            {/* Error Message Banner */}
            {errorMsg && (
              <div className="mb-5 p-3.5 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl text-[#EF4444] text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Google + WhatsApp Form */}
            <form onSubmit={handleGoogleSubmit} className="space-y-4">
              
              {/* WhatsApp Input (Required for Google Login) */}
              <div>
                <label className="block text-xs font-bold text-[#F5F5F5] mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#22C55E]" />
                  <span>WhatsApp (Obrigatório para agendamento)</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={whatsappPhone}
                    onChange={e => setWhatsappPhone(e.target.value)}
                    placeholder="(11) 99123-4567"
                    className="w-full bg-[#0D0D0D] border border-[#2D2D2D] focus:border-[#FF6B00] rounded-2xl px-4 py-3 text-sm text-[#F5F5F5] placeholder-[#A3A3A3]/60 focus:outline-none transition-colors font-mono"
                  />
                </div>
                <p className="text-[11px] text-[#A3A3A3] mt-1">
                  Seu WhatsApp será vinculado à sua conta Google para lembretes e confirmações.
                </p>
              </div>

              {/* Google Account Card */}
              <div className="p-4 bg-[#0D0D0D] border border-[#2D2D2D] rounded-2xl">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-[#A3A3A3] flex items-center gap-1.5">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Conta Google</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setUseCustomGoogleAccount(!useCustomGoogleAccount)}
                    className="text-[11px] text-[#FF6B00] hover:underline cursor-pointer font-semibold"
                  >
                    {useCustomGoogleAccount ? 'Usar Conta Padrão' : 'Personalizar'}
                  </button>
                </div>

                {!useCustomGoogleAccount ? (
                  <div className="flex items-center gap-3 bg-[#1C1C1C] p-2.5 rounded-xl border border-[#2D2D2D]">
                    <div className="w-8 h-8 rounded-full bg-[#FF6B00] text-[#0D0D0D] font-black flex items-center justify-center text-xs shadow">
                      {googleName.charAt(0)}
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#F5F5F5] truncate">{googleName}</div>
                      <div className="text-[11px] text-[#A3A3A3] truncate">{googleEmail}</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      value={googleName}
                      onChange={e => setGoogleName(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full bg-[#1C1C1C] border border-[#2D2D2D] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#FF6B00]"
                    />
                    <input
                      type="email"
                      value={googleEmail}
                      onChange={e => setGoogleEmail(e.target.value)}
                      placeholder="seu.email@gmail.com"
                      className="w-full bg-[#1C1C1C] border border-[#2D2D2D] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#FF6B00]"
                    />
                  </div>
                )}
              </div>

              {/* Main Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-3 bg-[#FF6B00] hover:bg-[#D95400] text-[#0D0D0D] font-black py-3.5 px-4 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/20 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-[#0D0D0D] border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Entrar no MY BARBER</span>
                  </>
                )}
              </button>
            </form>

            {/* Direct Client Access Link */}
            <div className="mt-5 pt-4 border-t border-[#2D2D2D] flex items-center justify-between text-xs">
              <span className="text-[#A3A3A3]">Quer apenas ver os serviços?</span>
              <button
                type="button"
                onClick={() => setViewMode('CLIENT_APP')}
                className="font-bold text-[#FF6B00] hover:text-[#D95400] flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>Acessar {currentBarbershop.name}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right Column: Fast Demo Access & Administrative Expandable */}
          <div className="lg:col-span-5 space-y-3.5">
            
            {/* Quick Demo Accounts for fast testing */}
            <div className="bg-[#1C1C1C] border border-[#2D2D2D] rounded-3xl p-5 backdrop-blur-md">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-[#FF6B00]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5F5F5]">
                  Acesso Rápido para Demonstração
                </h3>
              </div>
              <p className="text-xs text-[#A3A3A3] mb-3 leading-relaxed">
                Clique em qualquer perfil para testar o direcionamento automático:
              </p>

              <div className="space-y-2">
                {demoAccounts.map((acc, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleQuickLogin(acc.identifier)}
                    className="w-full text-left p-3 rounded-2xl bg-[#0D0D0D] hover:bg-[#151515] border border-[#2D2D2D] hover:border-[#FF6B00]/50 transition-all group flex items-center justify-between gap-2.5 cursor-pointer shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${acc.badgeColor}`}>
                          {acc.badge}
                        </span>
                        <span className="text-xs font-bold text-[#F5F5F5] group-hover:text-[#FF6B00] transition-colors truncate">
                          {acc.name}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-[#FF6B00] bg-[#FF6B00]/10 px-2 py-1 rounded-lg border border-[#FF6B00]/20">
                      <span>Entrar</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Admin Accordion (For Master / Proprietário e-mail login) */}
            <div className="bg-[#1C1C1C] border border-[#2D2D2D] rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdminSection(!showAdminSection)}
                className="w-full p-3.5 flex items-center justify-between text-xs text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#A3A3A3]" />
                  <span className="font-semibold">Área Administrativa (E-mail e Senha)</span>
                </div>
                {showAdminSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showAdminSection && (
                <form onSubmit={handleAdminSubmit} className="p-4 pt-0 space-y-3 border-t border-[#2D2D2D] mt-1">
                  <div>
                    <label className="block text-[11px] text-[#A3A3A3] mb-1">E-mail administrativo</label>
                    <input
                      type="email"
                      value={adminIdentifier}
                      onChange={e => setAdminIdentifier(e.target.value)}
                      placeholder="ex: joao@barbeariadojoao.com.br"
                      className="w-full bg-[#0D0D0D] border border-[#2D2D2D] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#FF6B00]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#A3A3A3] mb-1">Senha</label>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#0D0D0D] border border-[#2D2D2D] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#FF6B00]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-[#242424] hover:bg-[#2D2D2D] text-[#F5F5F5] font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Entrar como Administrador
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 w-full py-4 border-t border-[#2D2D2D] text-center text-xs text-[#A3A3A3]">
        <p>MY BARBER. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};
