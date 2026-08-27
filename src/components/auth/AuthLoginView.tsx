import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  AlertCircle,
  LogIn,
  Shield,
  User,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  Scissors,
  Building2,
  Lock
} from 'lucide-react';
import { triggerGooglePopupLogin } from '../../lib/googleAuth';
import { ThemeModeToggle } from '../common/ThemeModeToggle';

export const AuthLoginView: React.FC = () => {
  const { loginWithCredentials, loginWithGoogle, currentBarbershop } = useApp();

  const [loginMode, setLoginMode] = useState<'CLIENT' | 'STAFF'>('CLIENT');

  // Staff / Gestão State
  const [staffIdentifier, setStaffIdentifier] = useState('carlosrs.email@gmail.com');
  const [staffPassword, setStaffPassword] = useState('Ca.753268');
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Autenticação Real do Google para Clientes
  const handleRealGoogleAuth = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = await triggerGooglePopupLogin();
      setIsLoading(false);

      if (!result.success || !result.user) {
        if (result.error) {
          setErrorMsg(result.error);
        }
        return;
      }

      const { email, displayName, photoURL, uid } = result.user;

      // Verificação se é a conta Master Carlos Silva
      if (email.trim().toLowerCase() === 'carlosrs.email@gmail.com') {
        setLoginMode('STAFF');
        setStaffIdentifier('carlosrs.email@gmail.com');
        setErrorMsg('Conta Master identificada. Por favor, confirme sua senha para acessar o Painel Carlos Silva.');
        return;
      }

      // Login direto como cliente
      loginWithGoogle({
        googleId: uid,
        email,
        name: displayName || 'Cliente Google',
        whatsapp: '(11) 99123-4567',
        birthDate: '1995-08-15',
        avatarUrl:
          photoURL ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'Cliente')}&background=ea580c&color=fff`
      });
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err?.message || 'Falha ao autenticar com a Conta Google.');
    }
  };

  // Fallback rápido de demonstração do Google (caso o navegador bloqueie pop-up do iframe)
  const handleQuickGoogleClient = (name: string, email: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    setTimeout(() => {
      loginWithGoogle({
        googleId: `google-${Date.now()}`,
        email,
        name,
        whatsapp: '(11) 98765-4321',
        birthDate: '1996-05-20',
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ea580c&color=fff`
      });
      setIsLoading(false);
    }, 300);
  };

  // Função para executar login direto pelos atalhos de teste
  const handleQuickStaffLogin = (identifier: string, pass: string) => {
    setStaffIdentifier(identifier);
    setStaffPassword(pass);
    setIsLoading(true);
    setErrorMsg(null);
    setTimeout(() => {
      const res = loginWithCredentials(identifier, pass);
      setIsLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Falha ao autenticar atalho de teste.');
      }
    }, 250);
  };

  // Autenticação por Credenciais para Dono, Gerente, Barbeiro e Master
  const handleStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffIdentifier.trim()) {
      setErrorMsg('Por favor, informe seu usuário, WhatsApp ou e-mail cadastrado.');
      return;
    }
    if (!staffPassword.trim()) {
      setErrorMsg('Por favor, digite sua senha de acesso.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      const res = loginWithCredentials(staffIdentifier.trim(), staffPassword);
      setIsLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Credenciais de acesso inválidas. Verifique seu login e senha.');
      }
    }, 350);
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-neutral-100 flex flex-col justify-between selection:bg-orange-500 selection:text-neutral-950 font-sans relative">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeModeToggle variant="pill" />
      </div>

      {/* Subtle background ambient lights */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[650px] h-[350px] bg-orange-500/10 blur-[140px] rounded-full"></div>
        <div className="absolute -bottom-40 right-10 w-[450px] h-[300px] bg-orange-600/5 blur-[120px] rounded-full"></div>
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-md mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        
        {/* Top Header without outer box, using smooth radial ambient shadow and glow */}
        <div className="text-center mb-8 flex flex-col items-center relative">
          {/* Subtle soft backdrop glow behind the logo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-28 bg-orange-500/15 blur-3xl rounded-full pointer-events-none"></div>

          <h1 className="relative text-3xl sm:text-4xl font-black text-neutral-100 tracking-tight font-heading drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
            MY <span className="text-orange-500 drop-shadow-[0_0_25px_rgba(249,115,22,0.35)]">BARBER</span>
          </h1>

          {/* White Mustache Badge with Soft Organic Shadow */}
          <div className="relative mt-2.5 flex items-center justify-center">
            <svg
              className="w-18 h-8 sm:w-22 sm:h-9 text-neutral-100 drop-shadow-[0_4px_12px_rgba(255,255,255,0.3)] filter"
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

        {/* Segmented Control / Tabs: Sou Cliente vs Equipe & Gestão (Exact Mockup Match) */}
        <div className="grid grid-cols-2 p-1.5 bg-[#121212] border border-[#242424] rounded-2xl mb-8 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setLoginMode('CLIENT');
              setErrorMsg(null);
            }}
            className={`py-3 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
              loginMode === 'CLIENT'
                ? 'bg-[#222222] text-neutral-100 shadow-md border border-[#333333]'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <User className={`w-4 h-4 ${loginMode === 'CLIENT' ? 'text-orange-500' : 'text-neutral-500'}`} />
            <span>Sou Cliente</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLoginMode('STAFF');
              setErrorMsg(null);
            }}
            className={`py-3 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
              loginMode === 'STAFF'
                ? 'bg-[#222222] text-neutral-100 shadow-md border border-[#333333]'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Shield className={`w-4 h-4 ${loginMode === 'STAFF' ? 'text-orange-500' : 'text-neutral-500'}`} />
            <span>Equipe & Gestão</span>
          </button>
        </div>

        {/* Error Message Banner */}
        {errorMsg && (
          <div className="mb-6 p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs flex items-start gap-2.5 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* TAB 1: SOU CLIENTE (EXATAMENTE COMO NO MOCKUP) */}
        {loginMode === 'CLIENT' && (
          <div className="space-y-6 text-center animate-fade-in">
            <div className="space-y-2.5">
              <h2 className="text-lg sm:text-xl font-bold text-neutral-100">
                Agendamento de Serviços
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed max-w-xs mx-auto">
                Conecte-se com sua <strong className="text-neutral-200 font-semibold">Conta Google</strong> para agendar horários, escolher seu barbeiro favorito e acompanhar seu histórico.
              </p>
            </div>

            {/* Botão Oficial Exclusivo do Google em Pílula (Formato Idêntico ao Mockup) */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={handleRealGoogleAuth}
                className="w-full py-4 px-6 bg-white hover:bg-neutral-100 active:scale-[0.98] text-neutral-900 font-bold rounded-2xl text-sm flex items-center justify-center gap-3 shadow-xl transition-all cursor-pointer disabled:opacity-50 border border-neutral-200"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>{isLoading ? 'Conectando ao Google...' : 'Continuar com o Google'}</span>
              </button>
            </div>

            {/* Teste Rápido de Demonstração */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleQuickGoogleClient('Lucas Oliveira (Cliente)', 'lucas.cliente@gmail.com')}
                className="text-xs text-neutral-500 hover:text-orange-400 transition-colors underline cursor-pointer"
              >
                Entrar com conta Google de demonstração
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: EQUIPE & GESTÃO (PROFISSIONAL / GERENTE / PROPRIETÁRIO) */}
        {loginMode === 'STAFF' && (
          <form onSubmit={handleStaffSubmit} className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-neutral-100">
                Acesso Profissional & Gestão
              </h2>
              <p className="text-xs text-neutral-400">
                Digite suas credenciais cadastradas para acessar o painel correspondente.
              </p>
            </div>

            {/* Campo Identificador */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-neutral-300">
                Usuário, WhatsApp ou E-mail
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={staffIdentifier}
                  onChange={e => setStaffIdentifier(e.target.value)}
                  placeholder="Ex: (11) 98888-7777 ou usuario"
                  className="w-full bg-[#141414] border border-[#282828] focus:border-orange-500 rounded-2xl pl-10 pr-4 py-3.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-neutral-300">
                Senha de Acesso
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showStaffPassword ? 'text' : 'password'}
                  required
                  value={staffPassword}
                  onChange={e => setStaffPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full bg-[#141414] border border-[#282828] focus:border-orange-500 rounded-2xl pl-10 pr-11 py-3.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowStaffPassword(prev => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 p-1 cursor-pointer"
                  title={showStaffPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botão Entrar no Painel */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 px-6 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-neutral-950 font-black rounded-2xl text-sm flex items-center justify-center gap-2 shadow-xl shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Entrar no Painel</span>
                </>
              )}
            </button>

            {/* Atalhos Rápidos para Teste dos Perfis */}
            <div className="pt-3 border-t border-[#222222]">
              <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block mb-2 text-center">
                Atalhos de teste:
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => handleQuickStaffLogin('carlosrs.email@gmail.com', 'Ca.753268')}
                  className="p-2 bg-[#141414] hover:bg-[#1f1f1f] border border-[#282828] hover:border-orange-500/40 rounded-xl text-neutral-300 transition-colors flex flex-col items-center text-center cursor-pointer active:scale-95"
                  title="Acessar Painel Carlos Silva (Master)"
                >
                  <Shield className="w-3.5 h-3.5 text-orange-400 mb-0.5" />
                  <span className="font-bold">Carlos Silva</span>
                  <span className="text-[9px] text-neutral-500">Painel Master</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickStaffLogin('(11) 98888-1111', '123456')}
                  className="p-2 bg-[#141414] hover:bg-[#1f1f1f] border border-[#282828] hover:border-orange-500/40 rounded-xl text-neutral-300 transition-colors flex flex-col items-center text-center cursor-pointer active:scale-95"
                  title="Acessar WebAdmin do Proprietário"
                >
                  <Building2 className="w-3.5 h-3.5 text-orange-400 mb-0.5" />
                  <span className="font-bold">Proprietário</span>
                  <span className="text-[9px] text-neutral-500">Dono da Barbearia</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickStaffLogin('(11) 98888-3333', '123456')}
                  className="p-2 bg-[#141414] hover:bg-[#1f1f1f] border border-[#282828] hover:border-orange-500/40 rounded-xl text-neutral-300 transition-colors flex flex-col items-center text-center cursor-pointer active:scale-95"
                  title="Acessar Área do Barbeiro / Profissional"
                >
                  <Scissors className="w-3.5 h-3.5 text-orange-400 mb-0.5" />
                  <span className="font-bold">Barbeiro</span>
                  <span className="text-[9px] text-neutral-500">Área do Barbeiro</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Footer (Identical to mockup) */}
      <footer className="relative z-10 w-full py-4 border-t border-[#181818] text-center text-xs text-neutral-600">
        <p>MY BARBER &copy; 2026. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

