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
  ArrowLeft
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
    stopImpersonation
  } = useApp();

  const plan = MY_BARBER_PLANS[currentBarbershop.planId];

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

      {/* Top Banner: Multi-tenant & System Switcher */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between py-2.5 gap-2.5 border-b border-neutral-800/80 text-xs">
          
          {/* Logo & Tenant indicator */}
          <div className="flex flex-wrap items-center gap-2 justify-between sm:justify-start">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-orange-500 uppercase flex items-center gap-1.5 font-heading text-sm">
                <Scissors className="w-4 h-4 text-orange-500 shrink-0" />
                MY BARBER
              </span>
              <span className="hidden md:inline text-neutral-500">|</span>
              <span className="text-neutral-400 font-medium hidden md:inline">Multi-Tenant</span>
            </div>

            {/* Active Barbearia Switcher */}
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
                    {b.name} ({MY_BARBER_PLANS[b.planId].name} - R$ {MY_BARBER_PLANS[b.planId].priceMonthly.toFixed(2).replace('.', ',')}/mês)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Domain preview & active user switcher */}
          <div className="flex items-center gap-2 justify-between sm:justify-end">
            <div className="hidden lg:flex items-center gap-1.5 text-neutral-400 bg-neutral-950/60 px-2.5 py-1 rounded border border-neutral-800/50">
              <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-neutral-500">Domínio:</span>
              <span className="font-mono text-neutral-300 truncate max-w-[120px]">{currentBarbershop.customDomain}</span>
            </div>

            {/* Role / User Switcher */}
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-xl border border-neutral-800 w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-1.5 min-w-0">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-neutral-400 text-[11px] shrink-0">Perfil:</span>
              </div>
              <label htmlFor="user-select" className="sr-only">Selecionar Usuário</label>
              <select
                id="user-select"
                value={currentUser.id}
                onChange={(e) => setCurrentUserIdWithRoute(e.target.value)}
                className="bg-transparent text-neutral-200 font-medium focus:outline-none cursor-pointer text-xs truncate max-w-[180px] sm:max-w-[220px]"
              >
                {/* Global Super Admin Option */}
                {users.filter(u => u.role === 'SUPER_ADMIN').map(u => (
                  <option key={u.id} value={u.id} className="bg-neutral-900 text-orange-400 font-bold">
                    👑 {u.name} [MASTER ADMIN]
                  </option>
                ))}
                {/* Tenant specific users */}
                {tenantUsers.map((u) => {
                  let roleLabel = u.role;
                  if (u.role === 'PROFISSIONAL') {
                    roleLabel = u.canViewAllProfessionals ? 'Profissional Líder' : 'Profissional Individual';
                  } else if (u.role === 'PROPRIETARIO') {
                    roleLabel = 'Proprietário';
                  } else if (u.role === 'GERENTE') {
                    roleLabel = 'Gerente';
                  } else if (u.role === 'CLIENTE') {
                    roleLabel = 'Cliente';
                  }
                  return (
                    <option key={u.id} value={u.id} className="bg-neutral-900 text-neutral-100">
                      {u.name} [{roleLabel}]
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {/* Bottom Navigation: View Mode Tabs */}
        <div className="flex items-center justify-between py-2 overflow-x-auto">
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <button
              id="tab-architecture"
              onClick={() => setViewMode('ARCHITECTURE')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                viewMode === 'ARCHITECTURE'
                  ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                  : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>1. Arquitetura & Estrutura</span>
            </button>

            <button
              id="tab-master-admin"
              onClick={() => setViewMode('MASTER_ADMIN')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                viewMode === 'MASTER_ADMIN'
                  ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                  : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
              }`}
            >
              <Crown className="w-4 h-4" />
              <span>2. Área Dono do App (Master)</span>
            </button>

            <button
              id="tab-webadmin"
              onClick={() => setViewMode('WEBADMIN')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                viewMode === 'WEBADMIN'
                  ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                  : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>3. Módulo 1 — WebAdmin</span>
            </button>

            <button
              id="tab-client-app"
              onClick={() => setViewMode('CLIENT_APP')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                viewMode === 'CLIENT_APP'
                  ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                  : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>4. Módulo 2 — App Cliente ({currentBarbershop.name})</span>
            </button>

            <button
              id="tab-prof-app"
              onClick={() => setViewMode('PROFISSIONAL_APP')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                viewMode === 'PROFISSIONAL_APP'
                  ? 'bg-orange-500 text-neutral-950 shadow-sm shadow-orange-500/20'
                  : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
              }`}
            >
              <Scissors className="w-4 h-4" />
              <span>5. Módulo 2 — App Profissional</span>
            </button>
          </nav>

          <div className="hidden md:flex items-center gap-2 text-xs text-neutral-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Online 24/7 Cloud</span>
          </div>
        </div>
      </div>
    </header>
  );
};
