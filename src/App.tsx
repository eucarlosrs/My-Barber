/**
 * MY BARBER — Sistema de Agendamento e Gestão para Barbearias
 * Etapa 1: Arquitetura, Módulo 1 (WebAdmin) e Módulo 2 (Aplicativo Cliente & Profissional)
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { HeaderBar } from './components/common/HeaderBar';
import { ArchitectureView } from './components/architecture/ArchitectureView';
import { MasterAdminView } from './components/masteradmin/MasterAdminView';
import { WebAdminView } from './components/webadmin/WebAdminView';
import { ClientAppView } from './components/app/ClientAppView';
import { ProfessionalAppView } from './components/app/ProfessionalAppView';
import { AuthLoginView } from './components/auth/AuthLoginView';
import { BarbershopDiscoveryView } from './components/discovery/BarbershopDiscoveryView';

const MainContent: React.FC = () => {
  const { viewMode } = useApp();

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
        <HeaderBar />
        <main className="flex-1">
          <MainContent />
        </main>
      </div>
    </AppProvider>
  );
}
