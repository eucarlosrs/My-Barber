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

const MainContent: React.FC = () => {
  const { viewMode } = useApp();

  switch (viewMode) {
    case 'MASTER_ADMIN':
      return <MasterAdminView />;
    case 'WEBADMIN':
      return <WebAdminView />;
    case 'CLIENT_APP':
      return <ClientAppView />;
    case 'PROFISSIONAL_APP':
      return <ProfessionalAppView />;
    case 'ARCHITECTURE':
    default:
      return <ArchitectureView />;
  }
};

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-amber-500 selection:text-neutral-950">
        <HeaderBar />
        <main className="flex-1">
          <MainContent />
        </main>
      </div>
    </AppProvider>
  );
}
