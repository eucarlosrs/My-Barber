/**
 * MY BARBER — Sistema de Agendamento e Gestão para Barbearias
 * Etapa 1: Arquitetura, Módulo 1 (WebAdmin) e Módulo 2 (Aplicativo Cliente & Profissional)
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ArchitectureView } from './components/architecture/ArchitectureView';
import { MasterAdminView } from './components/masteradmin/MasterAdminView';
import { WebAdminView } from './components/webadmin/WebAdminView';
import { ClientAppView } from './components/app/ClientAppView';
import { ProfessionalAppView } from './components/app/ProfessionalAppView';
import { AuthLoginView } from './components/auth/AuthLoginView';
import { BarbershopDiscoveryView } from './components/discovery/BarbershopDiscoveryView';
import { Scissors } from 'lucide-react';

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

const MainContent: React.FC = () => {
  const { viewMode, isInitialLoading } = useApp();

  if (isInitialLoading) {
    return <InitialLoadingSplash />;
  }

  switch (viewMode) {
    case 'LOGIN':
      return <AuthLoginView />;
    case 'DISCOVERY':
      return <BarbershopDiscoveryView />;
    case 'MASTER_ADMIN':
      return <MasterAdminView />;
    case 'WEBADMIN':
      return <WebAdminView />;
    case 'CLIENT_APP':
      return <ClientAppView />;
    case 'PROFISSIONAL_APP':
      return <ProfessionalAppView />;
    case 'ARCHITECTURE':
      return <ArchitectureView />;
    default:
      return <AuthLoginView />;
  }
};

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-[#0D0D0D] text-[#F5F5F5] flex flex-col font-sans selection:bg-[#FF6B00] selection:text-[#0D0D0D]">
        <main className="flex-1">
          <MainContent />
        </main>
      </div>
    </AppProvider>
  );
}
