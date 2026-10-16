/**
 * MY BARBER — Sistema de Agendamento e Gestão para Barbearias
 * Etapa 1: Arquitetura, Módulo 1 (WebAdmin) e Módulo 2 (Aplicativo Cliente & Profissional)
 */

import React, { Suspense, lazy } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ClientAppView } from './components/app/ClientAppView';
import { AuthLoginView } from './components/auth/AuthLoginView';
import { StaffLoginView } from './components/auth/StaffLoginView';
import { BarbershopDiscoveryView } from './components/discovery/BarbershopDiscoveryView';
import { Scissors } from 'lucide-react';

const ArchitectureView = lazy(() =>
  import('./components/architecture/ArchitectureView').then((m) => ({ default: m.ArchitectureView }))
);
const MasterAdminView = lazy(() =>
  import('./components/masteradmin/MasterAdminView').then((m) => ({ default: m.MasterAdminView }))
);
const WebAdminView = lazy(() =>
  import('./components/webadmin/WebAdminView').then((m) => ({ default: m.WebAdminView }))
);
const ProfessionalAppView = lazy(() =>
  import('./components/app/ProfessionalAppView').then((m) => ({ default: m.ProfessionalAppView }))
);

const InitialLoadingSplash: React.FC = () => {
  return (
    <div className="flex-1 min-h-[80vh] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-2xl shadow-orange-500/20 animate-pulse">
          <Scissors className="w-8 h-8 text-neutral-950 stroke-[2.5]" />
        </div>
        <div className="absolute -inset-2 bg-orange-500/20 rounded-3xl blur-xl -z-10 animate-pulse" />
      </div>

      <div className="mt-6 space-y-2">
        <h2 className="text-xl font-black tracking-wider text-neutral-100 font-heading uppercase">
          MY BARBER
        </h2>
        <div className="flex items-center justify-center gap-1.5 text-xs text-orange-400 font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping" />
          <span>Sincronizando dados em tempo real...</span>
        </div>
      </div>
    </div>
  );
};

const LazyLoadingFallback: React.FC = () => {
  return (
    <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-fade-in bg-[#0D0D0D]">
      <div className="relative">
        <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center shadow-lg shadow-orange-500/10">
          <Scissors className="w-6 h-6 text-orange-500 stroke-[2] animate-pulse" />
        </div>
        <div className="absolute -inset-1.5 bg-orange-500/10 rounded-2xl blur-md -z-10 animate-pulse" />
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-400 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping" />
        <span>Carregando módulo...</span>
      </div>
    </div>
  );
};

const MainContent: React.FC = () => {
  const { viewMode, isInitialLoading, currentUser, authClaims } = useApp();

  if (isInitialLoading) {
    return <InitialLoadingSplash />;
  }

  // A autoridade de role decorre estritamente dos Custom Claims criptográficos do Firebase Auth
  const isSuperAdmin = Boolean(authClaims?.isSuperAdmin || authClaims?.role === 'super_admin');
  const effectiveRole = authClaims ? authClaims.legacyRole : currentUser.role;

  switch (viewMode) {
    case 'LOGIN':
      return <AuthLoginView />;
    case 'STAFF_LOGIN':
      return <StaffLoginView />;
    case 'DISCOVERY':
      return <BarbershopDiscoveryView />;
    case 'MASTER_ADMIN':
      // Barreira de segurança: Acesso estrito a super administradores validado por Custom Claims
      if (!isSuperAdmin) {
        return <StaffLoginView />;
      }
      return (
        <Suspense fallback={<LazyLoadingFallback />}>
          <MasterAdminView />
        </Suspense>
      );
    case 'WEBADMIN':
      // Barreira de segurança: Acesso restrito a gestores da barbearia ou Super Admin
      if (effectiveRole !== 'PROPRIETARIO' && effectiveRole !== 'GERENTE' && !isSuperAdmin) {
        return <StaffLoginView />;
      }
      return (
        <Suspense fallback={<LazyLoadingFallback />}>
          <WebAdminView />
        </Suspense>
      );
    case 'PROFISSIONAL_APP':
      // Barreira de segurança: Acesso restrito a profissionais cadastrados ou Super Admin
      if (effectiveRole !== 'PROFISSIONAL' && !isSuperAdmin) {
        return <StaffLoginView />;
      }
      return (
        <Suspense fallback={<LazyLoadingFallback />}>
          <ProfessionalAppView />
        </Suspense>
      );
    case 'CLIENT_APP':
      return <ClientAppView />;
    case 'ARCHITECTURE':
      return (
        <Suspense fallback={<LazyLoadingFallback />}>
          <ArchitectureView />
        </Suspense>
      );
    default:
      return <AuthLoginView />;
  }
};

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-[#0D0D0D] text-[#F5F5F5] flex flex-col font-sans selection:bg-[#FF6B00] selection:text-[#0D0D0D]">
        <main className="flex-1">
          <Suspense fallback={<LazyLoadingFallback />}>
            <MainContent />
          </Suspense>
        </main>
      </div>
    </AppProvider>
  );
}
