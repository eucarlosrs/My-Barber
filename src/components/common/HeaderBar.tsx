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
  ChevronDown,
  Crown,
  Eye,
  ArrowLeft,
  LogOut,
  User as UserIcon
} from 'lucide-react';
import { MY_BARBER_PLANS } from '../../types';
import { AppImage } from './AppImage';
import { ThemeModeToggle } from './ThemeModeToggle';

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

  // If in client app view and current user is a normal client, hide header for 100% full screen client experience
  if (viewMode === 'CLIENT_APP' && currentUser.role === 'CLIENTE' && !isImpersonating) {
    return null;
  }

  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN' || isImpersonating;
  const isOwnerOrManager = currentUser.role === 'PROPRIETARIO' || currentUser.role === 'GERENTE';
  const isProfessional = currentUser.role === 'PROFISSIONAL';

  return (
    <header id="main-header" className="sticky top-0 z-50 bg-[#151515]/95 backdrop-blur-md border-b border-[#2D2D2D] text-[#F5F5F5]">
      {/* Master Admin Impersonation Notice Banner */}
      {isImpersonating && (
        <div className="bg-gradient-to-r from-[#D95400] via-[#FF6B00] to-[#D95400] text-[#0D0D0D] px-4 py-2 text-xs font-bold shadow-lg flex items-center justify-between border-b border-[#FF6B00]/40">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-[#0D0D0D] text-[#FF6B00] text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-black flex items-center gap-1.5 shadow-sm">
                <Eye className="w-3.5 h-3.5 text-[#FF6B00]" />
                MODO DE VISUALIZAÇÃO — PAINEL CARLOS SILVA
              </span>
              <span className="hidden sm:inline text-[#0D0D0D] font-semibold">
                Simulando experiência como <strong className="underline decoration-[#0D0D0D]">{currentUser.name} ({currentUser.role})</strong> na barbearia <strong className="underline decoration-[#0D0D0D]">{currentBarbershop.name}</strong>
              </span>
            </div>

            <button
              onClick={stopImpersonation}
              className="bg-[#0D0D0D] hover:bg-[#1C1C1C] text-[#FF6B00] hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition-all active:scale-95 border border-[#2D2D2D] shrink-0 cursor-pointer"
              title="Encerrar visualização e voltar para o Painel Carlos Silva"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Painel Carlos Silva</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-2 sm:py-2.5 gap-2 text-xs">
          
          {/* Logo & Establishment Info */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-bold tracking-wider text-[#FF6B00] uppercase flex items-center gap-1 font-heading text-xs sm:text-sm">
                <Scissors className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FF6B00] shrink-0" />
                <span className="font-black">MY BARBER</span>
              </span>
            </div>

            {/* Super Admin Tenant Switcher vs Owner/Prof Fixed Barbershop Name */}
            {isSuperAdmin ? (
              <div className="flex items-center gap-1 bg-[#0D0D0D] px-2 py-1 rounded-xl border border-[#2D2D2D] min-w-0 max-w-[120px] xs:max-w-[160px] sm:max-w-xs">
                <Building2 className="w-3.5 h-3.5 text-[#FF6B00] shrink-0" />
                <label htmlFor="tenant-select" className="text-[#A3A3A3] sr-only">Estabelecimento Ativo</label>
                <select
                  id="tenant-select"
                  value={activeTenantId}
                  onChange={(e) => setActiveTenantId(e.target.value)}
                  className="bg-transparent text-[#F5F5F5] font-semibold focus:outline-none cursor-pointer pr-1 text-[11px] sm:text-xs truncate w-full"
                >
                  {barbershops.map((b) => (
                    <option key={b.id} value={b.id} className="bg-[#1C1C1C] text-[#F5F5F5]">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-[#0D0D0D] px-2.5 py-1 rounded-xl border border-[#2D2D2D] text-[#A3A3A3] min-w-0 max-w-[120px] xs:max-w-[160px] sm:max-w-xs">
                <Building2 className="w-3.5 h-3.5 text-[#FF6B00] shrink-0" />
                <span className="font-bold text-[#F5F5F5] truncate text-[11px] sm:text-xs">{currentBarbershop.name}</span>
              </div>
            )}

            {/* Barbershop domain for Owners/Managers */}
            {isOwnerOrManager && (
              <div className="hidden md:flex items-center gap-1.5 text-[#A3A3A3] bg-[#0D0D0D] px-2.5 py-1 rounded-xl border border-[#2D2D2D] text-[11px]" title="Endereço exclusivo no My Barber">
                <Globe className="w-3 h-3 text-[#FF6B00] shrink-0" />
                <span className="font-mono text-orange-400 font-bold">{currentBarbershop.slug}.mybarberbr.com.br</span>
              </div>
            )}
          </div>

          {/* Right Area: Theme Toggle, User Badge & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Dark / Light Toggle */}
            <ThemeModeToggle />

            {/* User Info Badge */}
            <div className="flex items-center gap-2 bg-[#0D0D0D] p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-[#2D2D2D]">
              <div className="w-6 h-6 rounded-full bg-[#1C1C1C] flex items-center justify-center overflow-hidden shrink-0 border border-[#2D2D2D]">
                {currentUser.avatarUrl ? (
                  <AppImage
                    src={currentUser.avatarUrl}
                    alt={currentUser.name}
                    fallbackType="userAvatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserIcon className="w-3.5 h-3.5 text-[#A3A3A3]" />
                )}
              </div>
              <div className="hidden sm:block text-left">
                <div className="font-bold text-[#F5F5F5] text-xs truncate max-w-[140px]">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-[#FF6B00] font-semibold uppercase tracking-wider">
                  {currentUser.role === 'SUPER_ADMIN' ? '👑 Painel Carlos Silva' :
                   currentUser.role === 'PROPRIETARIO' ? '🏢 Proprietário' :
                   currentUser.role === 'GERENTE' ? '💼 Gerente' :
                   currentUser.role === 'PROFISSIONAL' ? '✂️ Profissional' : '👤 Cliente'}
                </div>
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 bg-[#1C1C1C] hover:bg-[#EF4444]/20 text-[#A3A3A3] hover:text-[#EF4444] border border-[#2D2D2D] hover:border-[#EF4444]/40 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
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
                    ? 'bg-[#FF6B00] text-[#0D0D0D] font-black shadow-sm shadow-[#FF6B00]/20'
                    : 'text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#1C1C1C]'
                }`}
              >
                <Crown className="w-4 h-4" />
                <span>Painel Carlos Silva</span>
              </button>

              <button
                id="tab-webadmin"
                onClick={() => setViewMode('WEBADMIN')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'WEBADMIN'
                    ? 'bg-[#FF6B00] text-[#0D0D0D] font-black shadow-sm shadow-[#FF6B00]/20'
                    : 'text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#1C1C1C]'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Proprietário / Gerente ({currentBarbershop.name})</span>
              </button>

              <button
                id="tab-client-app"
                onClick={() => setViewMode('CLIENT_APP')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'CLIENT_APP'
                    ? 'bg-[#FF6B00] text-[#0D0D0D] font-black shadow-sm shadow-[#FF6B00]/20'
                    : 'text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#1C1C1C]'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Área do Cliente ({currentBarbershop.name})</span>
              </button>

              <button
                id="tab-prof-app"
                onClick={() => setViewMode('PROFISSIONAL_APP')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'PROFISSIONAL_APP'
                    ? 'bg-[#FF6B00] text-[#0D0D0D] font-black shadow-sm shadow-[#FF6B00]/20'
                    : 'text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#1C1C1C]'
                }`}
              >
                <Scissors className="w-4 h-4" />
                <span>Barbeiros / Profissionais</span>
              </button>

              <button
                id="tab-architecture"
                onClick={() => setViewMode('ARCHITECTURE')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'ARCHITECTURE'
                    ? 'bg-[#FF6B00] text-[#0D0D0D] font-black shadow-sm shadow-[#FF6B00]/20'
                    : 'text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#1C1C1C]'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Arquitetura & Estrutura</span>
              </button>
            </nav>

            <div className="hidden md:flex items-center gap-2 text-xs text-[#A3A3A3]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#22C55E]"></span>
              <span>Online Master 24/7</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
