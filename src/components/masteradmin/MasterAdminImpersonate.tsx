import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Eye,
  Building2,
  ArrowRight,
  Shield,
  Smartphone,
  Scissors,
  Users,
  CheckCircle2,
  Info
} from 'lucide-react';
import { UserRole } from '../../types';

export const MasterAdminImpersonate: React.FC = () => {
  const {
    barbershops,
    users,
    startImpersonation
  } = useApp();

  const [selectedShopId, setSelectedShopId] = useState<string>(barbershops[0]?.id || '');

  const targetShop = barbershops.find(b => b.id === selectedShopId) || barbershops[0];
  const targetUsers = users.filter(u => u.tenantId === targetShop?.id);

  const ownersCount = targetUsers.filter(u => u.role === 'PROPRIETARIO').length;
  const managersCount = targetUsers.filter(u => u.role === 'GERENTE').length;
  const profsCount = targetUsers.filter(u => u.role === 'PROFISSIONAL').length;
  const clientsCount = targetUsers.filter(u => u.role === 'CLIENTE').length;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-amber-950/30 border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-inner shrink-0">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-neutral-100 text-lg sm:text-xl font-heading">
                  Visualizar como Usuário (Auditoria de Experiência)
                </h2>
                <span className="bg-[#FF6B00] text-neutral-950 font-black text-[10px] uppercase px-2 py-0.5 rounded-md tracking-wider">
                  Exclusivo Painel Carlos Silva
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
                Selecione uma barbearia e vivencie exatamente o que cada nível hierárquico (Proprietário, Gerente, Barbeiro ou Cliente) enxerga na prática, sem alterar sua conta.
              </p>
            </div>
          </div>

          {/* Barbershop Target Selector */}
          <div className="flex items-center gap-2 bg-neutral-950 border border-amber-500/30 px-3.5 py-2 rounded-2xl shrink-0">
            <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex flex-col">
              <label htmlFor="impersonate-shop-select" className="text-[10px] font-bold text-neutral-400">Barbearia Alvo:</label>
              <select
                id="impersonate-shop-select"
                value={selectedShopId}
                onChange={e => setSelectedShopId(e.target.value)}
                className="bg-transparent text-neutral-100 text-xs font-black focus:outline-none cursor-pointer pr-1"
              >
                {barbershops.map(b => (
                  <option key={b.id} value={b.id} className="bg-neutral-900 text-neutral-100">
                    {b.name} ({b.address.city}/{b.address.state})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Selected shop quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80">
            <span className="text-[10px] text-neutral-500 block">Proprietários</span>
            <span className="text-sm font-bold text-amber-400">{ownersCount} cadastrado(s)</span>
          </div>
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80">
            <span className="text-[10px] text-neutral-500 block">Gerentes</span>
            <span className="text-sm font-bold text-blue-400">{managersCount} cadastrado(s)</span>
          </div>
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80">
            <span className="text-[10px] text-neutral-500 block">Barbeiros / Profissionais</span>
            <span className="text-sm font-bold text-emerald-400">{profsCount} cadastrado(s)</span>
          </div>
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80">
            <span className="text-[10px] text-neutral-500 block">Clientes na base</span>
            <span className="text-sm font-bold text-purple-400">{clientsCount} cadastrado(s)</span>
          </div>
        </div>

        {/* Role impersonation cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* Card 1: Proprietário */}
          <button
            onClick={() => startImpersonation('PROPRIETARIO', selectedShopId)}
            className="group text-left bg-neutral-950/90 hover:bg-neutral-900 border border-neutral-800 hover:border-amber-500/70 rounded-2xl p-4 transition-all duration-200 shadow-md hover:shadow-amber-500/10 flex flex-col justify-between cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">🏢</span>
                <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  Dono do Salão
                </span>
              </div>
              <div className="text-sm font-black text-neutral-100 group-hover:text-amber-400 transition-colors">
                Proprietário
              </div>
              <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">
                Painel Proprietário / Gerente: relatórios de faturamento, comissões, gestão de equipe, serviços, combos e estoque do salão.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between text-xs font-bold text-amber-400 group-hover:translate-x-0.5 transition-transform">
              <span>Visualizar como Dono</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* Card 2: Gerente */}
          <button
            onClick={() => startImpersonation('GERENTE', selectedShopId)}
            className="group text-left bg-neutral-950/90 hover:bg-neutral-900 border border-neutral-800 hover:border-blue-500/70 rounded-2xl p-4 transition-all duration-200 shadow-md hover:shadow-blue-500/10 flex flex-col justify-between cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">👨‍💼</span>
                <span className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                  Gestão Operacional
                </span>
              </div>
              <div className="text-sm font-black text-neutral-100 group-hover:text-blue-400 transition-colors">
                Gerente
              </div>
              <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">
                Operação do dia: agenda geral dos profissionais, confirmação de horários, fila de espera e encaixes.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between text-xs font-bold text-blue-400 group-hover:translate-x-0.5 transition-transform">
              <span>Visualizar como Gerente</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* Card 3: Profissional */}
          <button
            onClick={() => startImpersonation('PROFISSIONAL', selectedShopId)}
            className="group text-left bg-neutral-950/90 hover:bg-neutral-900 border border-neutral-800 hover:border-emerald-500/70 rounded-2xl p-4 transition-all duration-200 shadow-md hover:shadow-emerald-500/10 flex flex-col justify-between cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">✂️</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  App do Barbeiro
                </span>
              </div>
              <div className="text-sm font-black text-neutral-100 group-hover:text-emerald-400 transition-colors">
                Profissional / Barbeiro
              </div>
              <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">
                Aplicativo do profissional: comanda digital individual, agendamentos do dia, comissão acumulada e bloqueio de horários.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:translate-x-0.5 transition-transform">
              <span>Visualizar como Barbeiro</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* Card 4: Cliente */}
          <button
            onClick={() => startImpersonation('CLIENTE', selectedShopId)}
            className="group text-left bg-neutral-950/90 hover:bg-neutral-900 border border-neutral-800 hover:border-purple-500/70 rounded-2xl p-4 transition-all duration-200 shadow-md hover:shadow-purple-500/10 flex flex-col justify-between cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">📱</span>
                <span className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold">
                  App do Cliente
                </span>
              </div>
              <div className="text-sm font-black text-neutral-100 group-hover:text-purple-400 transition-colors">
                Cliente Final
              </div>
              <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">
                Experiência mobile do cliente: catálogo de serviços, escolha de barbeiro preferido, agendamento de horário e clube de fidelidade.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between text-xs font-bold text-purple-400 group-hover:translate-x-0.5 transition-transform">
              <span>Visualizar como Cliente</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
