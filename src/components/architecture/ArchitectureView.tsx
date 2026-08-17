import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Layers,
  FolderTree,
  Database,
  Users,
  Building2,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Server,
  Smartphone,
  Calendar,
  DollarSign,
  MessageSquare,
  Gift,
  Clock,
  Package,
  Boxes,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { MY_BARBER_PLANS } from '../../types';

export const ArchitectureView: React.FC = () => {
  const { currentBarbershop, setViewMode } = useApp();
  const [activeSection, setActiveSection] = useState<'OVERVIEW' | 'FOLDERS' | 'MODULES' | 'DATABASE' | 'PERMISSIONS' | 'TENANTS' | 'FLOWS'>('OVERVIEW');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Title & Badge */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider">
                Etapa 1 — Arquitetura Base & Estrutura
              </span>
              <span className="text-neutral-500 text-xs">•</span>
              <span className="text-neutral-400 text-xs">Especificação Mestre My Barber</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-100 font-heading">
              Arquitetura & Especificação do Sistema
            </h1>
            <p className="text-neutral-400 text-sm mt-1 max-w-3xl">
              Estrutura fundacional do My Barber com suporte a multi-tenancy, isolamento de dados, identidade exclusiva por estabelecimento e matriz de permissões.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('WEBADMIN')}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span>Abrir WebAdmin</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('CLIENT_APP')}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <span>Abrir App do Cliente</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 mt-6 overflow-x-auto border-b border-neutral-800 pb-2">
          {[
            { id: 'OVERVIEW', label: '1. Visão Geral', icon: Layers },
            { id: 'FOLDERS', label: '2. Estrutura de Pastas', icon: FolderTree },
            { id: 'MODULES', label: '3. Estrutura dos Módulos', icon: Boxes },
            { id: 'DATABASE', label: '4. Banco de Dados', icon: Database },
            { id: 'PERMISSIONS', label: '5. Usuários e Permissões', icon: Users },
            { id: 'TENANTS', label: '6. Barbearias & Planos', icon: Building2 },
            { id: 'FLOWS', label: '7. Fluxos do Sistema', icon: GitBranch }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-amber-400 border border-neutral-700'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. VISÃO GERAL */}
      {activeSection === 'OVERVIEW' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-neutral-100 text-base mb-1">Identidade Exclusiva</h3>
              <p className="text-neutral-400 text-xs leading-relaxed">
                Cada barbearia contratante possui sua própria marca, fotos do salão, redes sociais e domínio personalizado (ex: <span className="text-amber-400 font-mono">www.barbeariadojoao.com.br</span>). O cliente sente que está no app exclusivo do local.
              </p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-neutral-100 text-base mb-1">Agendamento & Automação</h3>
              <p className="text-neutral-400 text-xs leading-relaxed">
                Foco absoluto em agendamento de horários, cálculo de disponibilidade por profissional e jornada semanal/período, encaixes de emergência e lista de espera automática.
              </p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-neutral-100 text-base mb-1">WhatsApp First & Nuvem 24/7</h3>
              <p className="text-neutral-400 text-xs leading-relaxed">
                Identificação e login de clientes direto pelo número de WhatsApp. Lembretes automáticos configuráveis e mensagens de retorno periódicas pós-serviço.
              </p>
            </div>
          </div>

          {/* Core Principles Matrix */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="text-base font-bold text-neutral-100 mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              Princípios Arquiteturais & Regras Estritas
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-neutral-950/60 rounded-lg border border-neutral-800/80 space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Isolamento Total por Tenant
                </div>
                <p className="text-neutral-400">
                  Todas as tabelas e consultas são indexadas por <code className="text-amber-300 font-mono">tenantId</code>. Uma barbearia jamais tem acesso aos dados de outra.
                </p>
              </div>

              <div className="p-3.5 bg-neutral-950/60 rounded-lg border border-neutral-800/80 space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Divisão Rigorosa em 2 Módulos
                </div>
                <p className="text-neutral-400">
                  <strong>Módulo 1: WebAdmin</strong> (Proprietário e Gerente) e <strong>Módulo 2: Aplicativo</strong> (Profissionais e Clientes).
                </p>
              </div>

              <div className="p-3.5 bg-neutral-950/60 rounded-lg border border-neutral-800/80 space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Hierarquia dos Profissionais
                </div>
                <p className="text-neutral-400">
                  Exatamente 1 profissional líder possui <code className="text-amber-300 font-mono">canViewAllProfessionals: true</code> para ver toda a agenda, enquanto os demais veem apenas a sua própria.
                </p>
              </div>

              <div className="p-3.5 bg-neutral-950/60 rounded-lg border border-neutral-800/80 space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Planos e Valores Fixos
                </div>
                <p className="text-neutral-400">
                  Apenas 3 planos: Plano 1 (1 prof - R$ 49,90), Plano 2 (2-5 profs - R$ 79,90) e Plano 3 (6-15 profs - R$ 109,90). Nenhuma outra regra comercial.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. ESTRUTURA DE PASTAS */}
      {activeSection === 'FOLDERS' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h3 className="text-base font-bold text-neutral-100 mb-4 flex items-center gap-2 font-heading">
            <FolderTree className="w-5 h-5 text-amber-500" />
            Estrutura de Pastas do Projeto
          </h3>

          <div className="bg-neutral-950 p-5 rounded-lg border border-neutral-800 font-mono text-xs text-neutral-300 leading-relaxed overflow-x-auto">
            <pre className="text-neutral-300">
{`my-barber/
├── src/
│   ├── types/
│   │   └── index.ts                 # Tipagens estritas (Barbershop, User, Service, Appointment, Package, Sorteio, etc.)
│   ├── data/
│   │   └── initialData.ts           # Dados iniciais multi-tenant (Barbearia do João, Barbearia Vintage Club)
│   ├── context/
│   │   └── AppContext.tsx           # Estado global com isolamento de tenant, autenticação e operações
│   ├── components/
│   │   ├── common/
│   │   │   ├── HeaderBar.tsx        # Barra superior de controle, seletor de tenant, perfil e módulo
│   │   │   └── Modal.tsx            # Componente base de diálogos e formulários
│   │   ├── architecture/
│   │   │   └── ArchitectureView.tsx # Visualizador interativo da arquitetura e especificações
│   │   ├── webadmin/
│   │   │   ├── WebAdminShell.tsx    # Layout e navegação do Módulo 1 (Proprietário & Gerente)
│   │   │   ├── DashboardTab.tsx     # Indicadores gerais da barbearia
│   │   │   ├── ProfessionalsTab.tsx # Gestão de profissionais (validação de limite de plano)
│   │   │   ├── ServicesTab.tsx      # Serviços, durações e jornadas de trabalho
│   │   │   ├── ClientsTab.tsx       # Histórico de clientes & Aniversariantes
│   │   │   ├── InventoryTab.tsx     # Controle de estoque de consumíveis e produtos
│   │   │   ├── FinancialTab.tsx     # Relatórios financeiros e comissões dos profissionais
│   │   │   └── SettingsTab.tsx      # Identidade visual, fotos do salão, redes sociais e plano
│   │   └── app/
│   │       ├── ClientAppShell.tsx   # Layout do Módulo 2 para Clientes (Identidade exclusiva da barbearia)
│   │       ├── BookingFlow.tsx      # Fluxo de agendamento (Serviço -> Profissional -> Data -> Horário)
│   │       ├── WhatsAppLogin.tsx    # Modal de identificação do cliente via WhatsApp
│   │       ├── MyAppointments.tsx   # Agendamentos futuros e passados do cliente
│   │       ├── PackagesView.tsx     # Visualização de pacotes (compradas vs utilizadas)
│   │       ├── RafflesView.tsx      # Sorteios (com validação de 2 meses e botão PARTICIPAR)
│   │       ├── WaitlistView.tsx     # Entrada na lista de espera para dias lotados
│   │       └── ProfessionalApp.tsx  # Área do Profissional (Agenda própria/geral e comissões)
│   ├── App.tsx                      # Roteador mestre baseado no viewMode
│   ├── main.tsx                     # Ponto de entrada React
│   └── index.css                    # Estilização Tailwind CSS
├── metadata.json                    # Metadados do My Barber
└── package.json                     # Dependências do projeto`}
            </pre>
          </div>
        </div>
      )}

      {/* 3. ESTRUTURA DOS MÓDULOS */}
      {activeSection === 'MODULES' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Módulo 1 */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-100 text-base font-heading">MÓDULO 1 — WEBADMIN</h3>
                    <p className="text-xs text-neutral-400">Área Administrativa da Barbearia</p>
                  </div>
                </div>
                <span className="text-[10px] bg-neutral-800 text-neutral-300 font-mono px-2 py-0.5 rounded border border-neutral-700">
                  Proprietário / Gerente
                </span>
              </div>

              <ul className="space-y-2.5 text-xs text-neutral-300">
                <li className="flex items-start gap-2 bg-neutral-950/50 p-2.5 rounded-lg border border-neutral-800/60">
                  <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <strong>Gestão do Estabelecimento:</strong> Personalização de nome, fotos do salão, informações e redes sociais.
                  </div>
                </li>
                <li className="flex items-start gap-2 bg-neutral-950/50 p-2.5 rounded-lg border border-neutral-800/60">
                  <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <strong>Controle dos Profissionais:</strong> Cadastro, limites do plano e configuração de visualização global.
                  </div>
                </li>
                <li className="flex items-start gap-2 bg-neutral-950/50 p-2.5 rounded-lg border border-neutral-800/60">
                  <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <strong>Histórico de Clientes & Aniversariantes:</strong> Lista completa, frequência e clientes que fazem aniversário no mês.
                  </div>
                </li>
                <li className="flex items-start gap-2 bg-neutral-950/50 p-2.5 rounded-lg border border-neutral-800/60">
                  <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <strong>Controle de Estoque:</strong> Produtos para revenda e consumíveis de bancada.
                  </div>
                </li>
                <li className="flex items-start gap-2 bg-neutral-950/50 p-2.5 rounded-lg border border-neutral-800/60">
                  <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <strong>Relatórios Financeiros & Comissões:</strong> Faturamento bruto, comissão por barbeiro e receita líquida.
                  </div>
                </li>
              </ul>
            </div>

            {/* Módulo 2 */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-100 text-base font-heading">MÓDULO 2 — APLICATIVO</h3>
                    <p className="text-xs text-neutral-400">Experiência do Cliente & Profissional</p>
                  </div>
                </div>
                <span className="text-[10px] bg-neutral-800 text-neutral-300 font-mono px-2 py-0.5 rounded border border-neutral-700">
                  Cliente / Profissional
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-blue-400 mb-2 uppercase tracking-wide">Área do Cliente:</h4>
                  <ul className="space-y-1.5 text-xs text-neutral-300">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                      Realizar agendamentos rápidos (Serviço, Profissional, Data, Horário)
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                      Receber notícias, promoções e lembretes de agendamento via WhatsApp
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                      Entrar na lista de espera para horários concorridos
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                      Acompanhar saldo de pacotes (compradas vs utilizadas)
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                      Participar dos sorteios (com validação de 2 meses)
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                      Acessar redes sociais e fotos do salão
                    </li>
                  </ul>
                </div>

                <div className="pt-2 border-t border-neutral-800">
                  <h4 className="text-xs font-semibold text-emerald-400 mb-2 uppercase tracking-wide">Área do Profissional:</h4>
                  <ul className="space-y-1.5 text-xs text-neutral-300">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Acompanhar sua própria agenda em tempo real
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Visualizar agenda geral (se tiver a permissão especial de líder)
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Acompanhar comissões e atendimentos realizados
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. BANCO DE DADOS */}
      {activeSection === 'DATABASE' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h3 className="text-base font-bold text-neutral-100 mb-2 flex items-center gap-2 font-heading">
            <Database className="w-5 h-5 text-amber-500" />
            Estrutura Inicial do Banco de Dados (Entidades & Esquema)
          </h3>
          <p className="text-neutral-400 text-xs mb-6">
            Todas as coleções incorporam chave estrangeira de partição <code className="text-amber-400 font-mono">tenantId</code> para garantia estrita de isolamento multi-inquilino.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-mono">
            {/* Barbershops */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
              <div className="text-amber-400 font-bold mb-2 pb-1 border-b border-neutral-800">
                📁 Barbershop (Tenant)
              </div>
              <ul className="space-y-1 text-neutral-300 text-[11px]">
                <li><span className="text-blue-400">id:</span> string [PK]</li>
                <li><span className="text-neutral-400">name:</span> string</li>
                <li><span className="text-neutral-400">slug:</span> string</li>
                <li><span className="text-neutral-400">customDomain:</span> string</li>
                <li><span className="text-neutral-400">salonImages:</span> string[]</li>
                <li><span className="text-neutral-400">socialMedia:</span> object</li>
                <li><span className="text-neutral-400">planId:</span> PLANO_1|2|3</li>
                <li><span className="text-neutral-400">reminderConfig:</span> object</li>
              </ul>
            </div>

            {/* Users */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
              <div className="text-amber-400 font-bold mb-2 pb-1 border-b border-neutral-800">
                📁 User
              </div>
              <ul className="space-y-1 text-neutral-300 text-[11px]">
                <li><span className="text-blue-400">id:</span> string [PK]</li>
                <li><span className="text-emerald-400">tenantId:</span> string [FK]</li>
                <li><span className="text-neutral-400">role:</span> PROPRIETARIO | GERENTE | PROFISSIONAL | CLIENTE</li>
                <li><span className="text-neutral-400">whatsapp:</span> string [UK/Index]</li>
                <li><span className="text-neutral-400">birthDate:</span> string (YYYY-MM-DD)</li>
                <li><span className="text-amber-300">canViewAllProfessionals:</span> boolean</li>
                <li><span className="text-neutral-400">commissionPercentage:</span> number</li>
              </ul>
            </div>

            {/* Appointments */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
              <div className="text-amber-400 font-bold mb-2 pb-1 border-b border-neutral-800">
                📁 Appointment
              </div>
              <ul className="space-y-1 text-neutral-300 text-[11px]">
                <li><span className="text-blue-400">id:</span> string [PK]</li>
                <li><span className="text-emerald-400">tenantId:</span> string [FK]</li>
                <li><span className="text-neutral-400">serviceId:</span> string [FK]</li>
                <li><span className="text-neutral-400">professionalId:</span> string [FK]</li>
                <li><span className="text-neutral-400">clientId:</span> string [FK]</li>
                <li><span className="text-neutral-400">date:</span> YYYY-MM-DD</li>
                <li><span className="text-neutral-400">startTime / endTime:</span> HH:MM</li>
                <li><span className="text-amber-300">isEncaixe:</span> boolean</li>
                <li><span className="text-neutral-400">status:</span> AGENDADO | CONCLUIDO...</li>
              </ul>
            </div>

            {/* Services */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
              <div className="text-amber-400 font-bold mb-2 pb-1 border-b border-neutral-800">
                📁 Service
              </div>
              <ul className="space-y-1 text-neutral-300 text-[11px]">
                <li><span className="text-blue-400">id:</span> string [PK]</li>
                <li><span className="text-emerald-400">tenantId:</span> string [FK]</li>
                <li><span className="text-neutral-400">name:</span> string</li>
                <li><span className="text-neutral-400">durationMinutes:</span> number</li>
                <li><span className="text-neutral-400">price:</span> number</li>
                <li><span className="text-neutral-400">returnReminderDays:</span> number</li>
              </ul>
            </div>

            {/* Packages & CustomerPackages */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
              <div className="text-amber-400 font-bold mb-2 pb-1 border-b border-neutral-800">
                📁 Package & CustomerPackage
              </div>
              <ul className="space-y-1 text-neutral-300 text-[11px]">
                <li><span className="text-blue-400">id:</span> string [PK]</li>
                <li><span className="text-emerald-400">tenantId:</span> string [FK]</li>
                <li><span className="text-neutral-400">clientId:</span> string [FK]</li>
                <li><span className="text-neutral-400">items:</span> Array&lt;ItemUsage&gt;</li>
                <li><span className="text-amber-300">totalQuantity:</span> number</li>
                <li><span className="text-amber-300">usedQuantity:</span> number</li>
              </ul>
            </div>

            {/* Raffles */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
              <div className="text-amber-400 font-bold mb-2 pb-1 border-b border-neutral-800">
                📁 Raffle (Sorteios)
              </div>
              <ul className="space-y-1 text-neutral-300 text-[11px]">
                <li><span className="text-blue-400">id:</span> string [PK]</li>
                <li><span className="text-emerald-400">tenantId:</span> string [FK]</li>
                <li><span className="text-neutral-400">prize:</span> string</li>
                <li><span className="text-neutral-400">drawDate:</span> YYYY-MM-DD</li>
                <li><span className="text-amber-300">participants:</span> Array&lt;Client&gt;</li>
                <li><span className="text-neutral-400">eligibleAppointmentDate:</span> string</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 5. USUÁRIOS E PERMISSÕES */}
      {activeSection === 'PERMISSIONS' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-neutral-100 mb-1 flex items-center gap-2 font-heading">
              <Users className="w-5 h-5 text-amber-500" />
              Matriz de Usuários e Permissões (Seção 7)
            </h3>
            <p className="text-neutral-400 text-xs">
              Respeito estrito à hierarquia e regras de visibilidade.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border border-neutral-800 rounded-lg overflow-hidden">
              <thead className="bg-neutral-950 text-neutral-300 font-semibold uppercase text-[11px] border-b border-neutral-800">
                <tr>
                  <th className="p-3">Perfil / Cargo</th>
                  <th className="p-3">Módulo de Acesso</th>
                  <th className="p-3">Escopo de Visibilidade da Agenda</th>
                  <th className="p-3">Acesso Financeiro & Estoque</th>
                  <th className="p-3">Método de Autenticação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 text-neutral-300">
                <tr className="hover:bg-neutral-800/30">
                  <td className="p-3 font-semibold text-amber-400">PROPRIETÁRIO</td>
                  <td className="p-3">WebAdmin Completo</td>
                  <td className="p-3">Total (todos os profissionais)</td>
                  <td className="p-3"><span className="text-emerald-400 font-semibold">Sim (Total)</span></td>
                  <td className="p-3">Credenciais Administrativas</td>
                </tr>
                <tr className="hover:bg-neutral-800/30">
                  <td className="p-3 font-semibold text-blue-400">GERENTE</td>
                  <td className="p-3">WebAdmin Operacional</td>
                  <td className="p-3">Total (gestão do dia a dia)</td>
                  <td className="p-3"><span className="text-emerald-400 font-semibold">Sim (Operacional)</span></td>
                  <td className="p-3">Credenciais Administrativas</td>
                </tr>
                <tr className="hover:bg-neutral-800/30 bg-amber-500/5">
                  <td className="p-3 font-semibold text-amber-300">
                    PROFISSIONAL LÍDER <br />
                    <span className="text-[10px] text-amber-400/80 font-mono">(canViewAllProfessionals: true)</span>
                  </td>
                  <td className="p-3">Módulo Aplicativo (Área Profissional)</td>
                  <td className="p-3 text-amber-300 font-semibold">
                    Visualiza agenda de TODOS os profissionais
                  </td>
                  <td className="p-3">Apenas suas comissões</td>
                  <td className="p-3">Login no App</td>
                </tr>
                <tr className="hover:bg-neutral-800/30">
                  <td className="p-3 font-semibold text-neutral-200">
                    PROFISSIONAL PADRÃO <br />
                    <span className="text-[10px] text-neutral-400 font-mono">(canViewAllProfessionals: false)</span>
                  </td>
                  <td className="p-3">Módulo Aplicativo (Área Profissional)</td>
                  <td className="p-3 text-neutral-400">
                    Visualiza SOMENTE sua própria agenda
                  </td>
                  <td className="p-3">Apenas suas comissões</td>
                  <td className="p-3">Login no App</td>
                </tr>
                <tr className="hover:bg-neutral-800/30">
                  <td className="p-3 font-semibold text-emerald-400">CLIENTE</td>
                  <td className="p-3">Módulo Aplicativo (Área do Cliente)</td>
                  <td className="p-3">Apenas horários disponíveis para agendar</td>
                  <td className="p-3">Não aplicável</td>
                  <td className="p-3 text-emerald-400 font-semibold">WhatsApp (Número de telefone)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. TENANTS & PLANOS */}
      {activeSection === 'TENANTS' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-neutral-100 mb-1 flex items-center gap-2 font-heading">
              <Building2 className="w-5 h-5 text-amber-500" />
              Tabela de Planos Oficiais do My Barber (Seção 8)
            </h3>
            <p className="text-neutral-400 text-xs">
              Valores e limites fixados por contrato mensal. Nenhuma regra comercial adicional.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 max-w-2xl gap-5">
            {Object.values(MY_BARBER_PLANS).map((p) => {
              const isCurrentTenantPlan = currentBarbershop.planId === p.id;
              return (
                <div
                  key={p.id}
                  className={`p-6 rounded-2xl border transition-all ${
                    isCurrentTenantPlan
                      ? 'bg-orange-500/10 border-orange-500/60 ring-1 ring-orange-500/30'
                      : 'bg-neutral-950 border-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-neutral-100 font-heading text-lg">{p.name}</h4>
                    {isCurrentTenantPlan && (
                      <span className="text-[10px] bg-orange-500 text-neutral-950 font-bold px-2 py-0.5 rounded-full">
                        PLANO ATIVO
                      </span>
                    )}
                  </div>

                  <div className="text-3xl font-extrabold text-neutral-100 mb-1 font-mono">
                    R$ {p.priceMonthly.toFixed(2).replace('.', ',')}
                    <span className="text-xs font-normal text-neutral-400 font-sans"> / mês</span>
                  </div>

                  <div className="text-xs text-orange-300 font-semibold mb-4">
                    Até {p.maxProfessionals} profissionais (incluindo proprietário, gerente e barbeiros)
                  </div>

                  <div className="pt-3 border-t border-neutral-800/80 text-xs text-neutral-400 space-y-1.5">
                    <p className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      WebAdmin Completo de Gestão
                    </p>
                    <p className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      App exclusivo com marca da barbearia
                    </p>
                    <p className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Agendamento Online 24/7 com WhatsApp
                    </p>
                    <p className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Gestão de Estoque, Caixa e Comissões
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7. FLUXOS DO SISTEMA */}
      {activeSection === 'FLOWS' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Fluxo de Agendamento */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <h3 className="font-bold text-neutral-100 text-sm mb-3 flex items-center gap-2 font-heading">
                <Calendar className="w-4 h-4 text-amber-500" />
                Fluxo de Agendamento Automatizado
              </h3>
              <ol className="space-y-3 text-xs text-neutral-300">
                <li className="flex items-start gap-3 bg-neutral-950 p-3 rounded-lg border border-neutral-800/60">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <div>
                    <strong>Escolha do Serviço:</strong> O cliente seleciona o serviço previamente cadastrado pela barbearia.
                  </div>
                </li>
                <li className="flex items-start gap-3 bg-neutral-950 p-3 rounded-lg border border-neutral-800/60">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <div>
                    <strong>Escolha do Profissional:</strong> Seleciona o barbeiro desejado ou qualquer profissional disponível.
                  </div>
                </li>
                <li className="flex items-start gap-3 bg-neutral-950 p-3 rounded-lg border border-neutral-800/60">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <div>
                    <strong>Data & Horário Dinâmico:</strong> O sistema cruza a jornada semanal e períodos especiais do profissional, bloqueando horários ocupados.
                  </div>
                </li>
                <li className="flex items-start gap-3 bg-neutral-950 p-3 rounded-lg border border-neutral-800/60">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                  <div>
                    <strong>Confirmação & Lembrete WhatsApp:</strong> O agendamento é registrado e o lembrete automático é engatilhado no tempo configurado pela barbearia.
                  </div>
                </li>
              </ol>
            </div>

            {/* Fluxo de Sorteios & Lista de Espera */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <h3 className="font-bold text-neutral-100 text-sm mb-3 flex items-center gap-2 font-heading">
                <Gift className="w-4 h-4 text-amber-500" />
                Regras Específicas: Sorteios & Lista de Espera
              </h3>
              <div className="space-y-4 text-xs text-neutral-300">
                <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800/60">
                  <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Regra dos Sorteios (Seção 23)
                  </div>
                  <p className="text-neutral-400 leading-relaxed">
                    Elegibilidade exclusiva para clientes com agendamento nos últimos <strong>2 meses</strong>. A participação não é automática: o cliente precisa acessar a área do sorteio e clicar em <strong>"PARTICIPAR DO SORTEIO"</strong> para ser registrado.
                  </p>
                </div>

                <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800/60">
                  <div className="font-semibold text-blue-400 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Lista de Espera (Seção 19)
                  </div>
                  <p className="text-neutral-400 leading-relaxed">
                    Quando a agenda do dia estiver lotada, o cliente se cadastra na lista com sua preferência (manhã, tarde, noite). Ao surgir um cancelamento ou vaga, o sistema notifica o cliente automaticamente.
                  </p>
                </div>

                <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800/60">
                  <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Controle de Pacotes (Seção 17)
                  </div>
                  <p className="text-neutral-400 leading-relaxed">
                    Rastreamento transparente de <strong>quantidade comprada</strong> versus <strong>quantidade utilizada</strong> (ex: 10 sessões compradas, 4 utilizadas, 6 restantes).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
