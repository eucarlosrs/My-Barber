import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  AlertCircle,
  User,
  Sparkles,
  Scissors
} from 'lucide-react';
import { triggerGooglePopupLogin } from '../../lib/googleAuth';

export const AuthLoginView: React.FC = () => {
  const { loginWithGoogle, currentBarbershop, setViewMode } = useApp();

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
      setViewMode('CLIENT_APP');
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err?.message || 'Falha ao autenticar com a Conta Google.');
    }
  };

  // Fallback rápido de demonstração do Google
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
      setViewMode('CLIENT_APP');
    }, 300);
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-neutral-100 flex flex-col justify-between selection:bg-orange-500 selection:text-neutral-950 font-sans relative">
      {/* Subtle background ambient lights */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[650px] h-[350px] bg-orange-500/10 blur-[140px] rounded-full"></div>
        <div className="absolute -bottom-40 right-10 w-[450px] h-[300px] bg-orange-600/5 blur-[120px] rounded-full"></div>
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-md mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        
        {/* Top Header */}
        <div className="text-center mb-8 flex flex-col items-center relative">
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

        {/* Error Message Banner */}
        {errorMsg && (
          <div className="mb-6 p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs flex items-start gap-2.5 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* CLIENT LOGIN VIEW */}
        <div className="space-y-6 text-center animate-fade-in bg-neutral-900/70 border border-neutral-800 p-6 sm:p-8 rounded-3xl backdrop-blur-md shadow-2xl">
          <div className="space-y-2.5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/25 mb-1">
              <Scissors className="w-6 h-6" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-neutral-100">
              Agendamento de Serviços
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed max-w-xs mx-auto">
              Conecte-se com sua <strong className="text-neutral-200 font-semibold">Conta Google</strong> para agendar horários, escolher seu barbeiro favorito e acompanhar seu histórico na {currentBarbershop?.name || 'barbearia'}.
            </p>
          </div>

          {/* Botão Oficial Exclusivo do Google */}
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
      </div>

      {/* Footer */}
      <footer className="relative z-10 w-full py-4 border-t border-[#181818] text-center text-xs text-neutral-600">
        <p>MY BARBER &copy; 2026. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};


