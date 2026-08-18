import React from 'react';
import { useApp, AppViewMode } from '../../context/AppContext';
import {
  Building2,
  Shield,
  Smartphone,
  Scissors,
  Layers,
  UserCheck,
  Globe,
  Sparkles,
  ChevronDown,
  Crown,
  Eye,
  ArrowLeft,
  LogOut,
  User as UserIcon
} from 'lucide-react';
import { MY_BARBER_PLANS } from '../../types';

export const HeaderBar: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    activeTenantId,
    setActiveTenantId,
    barbershops,
    currentBarbershop,
    currentUser,
    setCurrentUserIdWithRoute,
    users,
    tenantUsers,
    isImpersonating,
    stopImpersonation,
    logout
  } = useApp();

  // If on login view, completely hide header
  if (viewMode === 'LOGIN') {
    return null;
  }

  // If in client app view and not impersonating, completely hide header (client sees 100% full screen app)
  if (viewMode === 'CLIENT_APP' && !isImpersonating) {
    return null;
  }

  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN' || isImpersonating;
  const isOwnerOrManager = currentUser.role === 'PROPRIETARIO' || currentUser.role === 'GERENTE';
  const isProfessional = currentUser.role === 'PROFISSIONAL';

  return (
    <header id="main-header" className="sticky top-0 z-50 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800 text-neutral-100">
      {/* Master Admin Impersonation Notice Banner */}
      {isImpersonating && (
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-neutral-950 px-4 py-2 text-xs font-bold shadow-lg flex items-center justify-between border-b border-amber-400/40">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-neutral-950 text-amber-300 text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-black flex items-center gap-1.5 shadow-sm">
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                MODO DE VISUALIZAÇÃO — MASTER ADMIN
              </span>
              <span className="hidden sm:inline text-neutral-950 font-semibold">
                Simulando experiência como <strong className="underline decoration-neutral-950">{currentUser.name} ({currentUser.role})</strong> na barbearia <strong className="underline decoration-neutral-950">{currentBarbershop.name}</strong>
              </span>
            </div>

            <button
              onClick={stopImpersonation}
              className="bg-neutral-950 hover:bg-neutral-900 text-amber-300 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition-all active:scale-95 border border-neutral-800 shrink-0 cursor-pointer"
              title="Encerrar visualização e voltar para o Painel Master Admin"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Master Admin</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-2.5 gap-3 border-b border-neutral-800/80 text-xs">
          
          {/* Logo & Establishment Info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-bold tracking-wider text-orange-500 uppercase flex items-center gap-1.5 font-heading text-sm">
                <Scissors className="w-4 h-4 text-orange-500 shrink-0" />
                MY BARBER
              </span>
            </div>

            {/* Super Admin Tenant Switcher vs Owner/Prof Fixed Barbershop Name */}
            {isSuperAdmin ? (
              <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-xl border border-neutral-800 max-w-full sm:max-w-xs">
                <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <label htmlFor="tenant-select" className="text-neutral-400 sr-only">Estabelecimento Ativo</label>
                <select
                  id="tenant-select"
                  value={activeTenantId}
                  onChange={(e) => setActiveTenantId(e.target.value)}
                  className="bg-transparent text-neutral-200 font-semibold focus:outline-none cursor-pointer pr-2 text-xs truncate max-w-[150px] sm:max-w-[200px]"
                >
                  {barbershops.map((b) => (
                    <option key={b.id} value={b.id} className="bg-neutral-900 text-neutral-100">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-neutral-950/80 px-3 py-1 rounded-xl border border-neutral-800 text-neutral-300">
                <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="font-bold text-neutral-100 truncate text-xs">{currentBarbershop.name}</span>
              </div>
            )}

            {/* Barbershop domain for Owners/Managers */}
            {isOwnerOrManager && (
              <div className="hidden md:flex items-center gap-1.5 text-neutral-400 bg-neutral-950/60 px-2.5 py-1 rounded-xl border border-neutral-800/50 text-[11px]">
                <Globe className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="font-mono text-neutral-300">{currentBarbershop.customDomain}</span>
              </div>
            )}
          </div>

          {/* Right Area: User Badge & Logout */}
          <div className="flex items-center gap-3 shrink-0">
            {/* User Info Badge */}
            <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800">
              <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden shrink-0 border border-neutral-700">
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-3.5 h-3.5 text-neutral-400" />
                )}
              </div>
              <div className="hidden sm:block text-left">
                <div className="font-bold text-neutral-200 text-xs truncate max-w-[140px]">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider">
                  {currentUser.role === 'SUPER_ADMIN' ? '👑 Master Admin' :
                   currentUser.role === 'PROPRIETARIO' ? '🏢 Proprietário' :
                   currentUser.role === 'GERENTE' ? '💼 Gerente' :
                   currentUser.role === 'PROFISSIONAL' ? '✂️ Profissional' : '👤 Cliente'}
                </div>
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 bg-neutral-800/80 hover:bg-red-500/20 text-neutral-300 hover:text-red-400 border border-neutral-700/60 hover:border-red-500/40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              title="Encerrar sessão e voltar para a tela de login inicial"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Master Admin / Internal Navigation Tabs (ONLY for Super Admin) */}
        {isSuperAdmin && (
          <div className="flex items-center justify-between py-2 overflow-x-auto">
            <nav className="flex items-center gap-1.5 sm:gap-2">
              <button
                id="tab-master-admin"
                onClick={() => setViewMode('MASTER_ADMIN')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'MASTER_ADMIN'
                    ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                    : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
                }`}
              >
                <Crown className="w-4 h-4" />
                <span>Painel Master Admin</span>
              </button>

              <button
                id="tab-webadmin"
                onClick={() => setViewMode('WEBADMIN')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'WEBADMIN'
                    ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                    : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>WebAdmin ({currentBarbershop.name})</span>
              </button>

              <button
                id="tab-client-app"
                onClick={() => setViewMode('CLIENT_APP')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'CLIENT_APP'
                    ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                    : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>App Cliente ({currentBarbershop.name})</span>
              </button>

              <button
                id="tab-prof-app"
                onClick={() => setViewMode('PROFISSIONAL_APP')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'PROFISSIONAL_APP'
                    ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                    : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
                }`}
              >
                <Scissors className="w-4 h-4" />
                <span>App Profissional</span>
              </button>

              <button
                id="tab-architecture"
                onClick={() => setViewMode('ARCHITECTURE')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'ARCHITECTURE'
                    ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                    : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Arquitetura & Estrutura</span>
              </button>
            </nav>

            <div className="hidden md:flex items-center gap-2 text-xs text-neutral-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Online Master 24/7</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
