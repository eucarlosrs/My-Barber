import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Shield,
  Lock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  LogIn,
  Building2,
  Scissors,
  Crown,
  ChevronRight,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { ThemeModeToggle } from '../common/ThemeModeToggle';

export const StaffLoginView: React.FC = () => {
  const { loginWithCredentials, currentBarbershop, setViewMode } = useApp();

  const [identifier, setIdentifier] = useState('carlosrs.email@gmail.com');
  const [password, setPassword] = useState('Ca.753268');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setErrorMsg('Informe seu e-mail, usuário ou WhatsApp de cadastro.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      const res = loginWithCredentials(identifier, password);
      setIsLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Credenciais inválidas. Verifique seu login e senha.');
      }
    }, 400);
  };

  const handleQuickLogin = (userLogin: string, userPass: string) => {
    setIdentifier(userLogin);
    setPassword(userPass);
    setIsLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      const res = loginWithCredentials(userLogin, userPass);
      setIsLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Falha ao autenticar.');
      }
    }, 350);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans selection:bg-orange-500 selection:text-neutral-950">
      {/* Top Header */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between py-2 border-b border-neutral-850">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Shield className="w-5 h-5 text-neutral-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-sm font-black tracking-wider text-neutral-100 font-heading uppercase flex items-center gap-2">
              <span>MY BARBER</span>
              <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/25 px-2 py-0.5 rounded-md font-mono">
                ÁREA RESTRITA
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">Portal de Gestão & Equipe</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeModeToggle />
          <button
            type="button"
            onClick={() => setViewMode('CLIENT_APP')}
            className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Voltar ao App Público</span>
          </button>
        </div>
      </div>

      {/* Main Form Center */}
      <div className="max-w-md w-full mx-auto my-8">
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Top subtle glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/25 mb-3 shadow-inner">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-neutral-100 font-heading">
                Acesso Administrativo
              </h2>
              <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                Exclusivo para Super Admin, Proprietários, Gerentes e Profissionais cadastrados.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-400 text-xs animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase tracking-wider">
                  Usuário, E-mail ou WhatsApp
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="carlosrs.email@gmail.com ou usuario"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl pl-10 pr-3.5 py-3 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider">
                    Senha de Acesso
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl pl-10 pr-10 py-3 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-500 hover:text-neutral-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-neutral-950 font-black rounded-2xl text-xs sm:text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50 active:scale-98 mt-2"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4 stroke-[2.5]" />
                    <span>ENTRAR NO PAINEL</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick test credentials box */}
            <div className="mt-6 pt-5 border-t border-neutral-800">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                  Atalhos de Acesso Rápido (Demonstração)
                </span>
                <span className="text-[9px] bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full font-mono">
                  1-Clique
                </span>
              </div>

              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('carlosrs.email@gmail.com', 'Ca.753268')}
                  className="w-full bg-neutral-950 hover:bg-neutral-850 border border-amber-500/30 hover:border-amber-500/60 p-2.5 rounded-xl flex items-center justify-between text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <Crown className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-amber-300 group-hover:text-amber-200 truncate">
                        Carlos Silva (Super Admin Master)
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono">carlosrs.email@gmail.com</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-amber-400 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('joao.silva@navalhaouro.com.br', 'senha123')}
                  className="w-full bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 hover:border-orange-500/50 p-2.5 rounded-xl flex items-center justify-between text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-neutral-100 group-hover:text-orange-400 truncate">
                        João Silva (Proprietário - Navalha de Ouro)
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono">joao.silva@navalhaouro.com.br</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-orange-400 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('pedro.barbeiro@navalhaouro.com.br', 'senha123')}
                  className="w-full bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 hover:border-orange-500/50 p-2.5 rounded-xl flex items-center justify-between text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-neutral-800 text-neutral-300 flex items-center justify-center shrink-0">
                      <Scissors className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-neutral-100 group-hover:text-orange-400 truncate">
                        Pedro Barbeiro (Profissional)
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono">pedro.barbeiro@navalhaouro.com.br</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-orange-400 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="max-w-md w-full mx-auto text-center text-neutral-500 text-[11px] space-y-1">
        <p className="flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-neutral-400" />
          <span>Isolamento Multi-Tenant e Autenticação Protegida</span>
        </p>
        <p>© 2026 MY BARBER. Todos os direitos reservados.</p>
      </div>
    </div>
  );
};
