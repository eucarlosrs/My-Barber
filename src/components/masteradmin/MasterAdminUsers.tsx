import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Users,
  Search,
  Shield,
  Crown,
  Scissors,
  Phone,
  Mail,
  Calendar,
  Building2,
  Plus,
  Filter,
  CheckCircle,
  X
} from 'lucide-react';
import { User, UserRole } from '../../types';
import { AppImage } from '../common/AppImage';

export const MasterAdminUsers: React.FC = () => {
  const { users, barbershops } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [shopFilter, setShopFilter] = useState<string>('ALL');

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.whatsapp && u.whatsapp.includes(searchTerm));

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesShop = shopFilter === 'ALL' || u.tenantId === shopFilter;

    return matchesSearch && matchesRole && matchesShop;
  });

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-orange-500/10 text-orange-400 border border-orange-500/40 uppercase">
            <Crown className="w-3 h-3" />
            Painel Carlos Silva
          </span>
        );
      case 'PROPRIETARIO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase">
            <Shield className="w-3 h-3" />
            Proprietário
          </span>
        );
      case 'GERENTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/10 text-blue-300 border border-blue-500/30 uppercase">
            Gerente
          </span>
        );
      case 'PROFISSIONAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 uppercase">
            <Scissors className="w-3 h-3" />
            Profissional
          </span>
        );
      case 'CLIENTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-300 border border-purple-500/30 uppercase">
            Cliente
          </span>
        );
      default:
        return null;
    }
  };

  const getShopName = (tenantId: string) => {
    if (tenantId === 'platform-global' || tenantId === 'system-global') {
      return 'Plataforma Global (My Barber)';
    }
    const shop = barbershops.find(b => b.id === tenantId);
    return shop ? shop.name : tenantId;
  };

  return (
    <div className="space-y-4">
      {/* Top action header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-black mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>DIRETÓRIO GLOBAL DE USUÁRIOS E PERMISSÕES</span>
          </div>
          <h2 className="text-xl font-black text-neutral-100 font-heading">
            Gestão Unificada de Usuários da Plataforma
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Supervisione todos os perfis registrados: Donos de Salão, Gerentes, Barbeiros e Clientes em cada barbearia cadastrada.
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, email ou WhatsApp..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
          />
        </div>

        {/* Filter Cargo */}
        <div className="relative">
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="ALL">Todos os Cargos</option>
            <option value="SUPER_ADMIN">Painel Carlos Silva (Dono da Plataforma)</option>
            <option value="PROPRIETARIO">Proprietários (Donos de Salão)</option>
            <option value="GERENTE">Gerentes</option>
            <option value="PROFISSIONAL">Profissionais / Barbeiros</option>
            <option value="CLIENTE">Clientes Finais</option>
          </select>
        </div>

        {/* Filter Barbearia */}
        <div className="relative">
          <select
            value={shopFilter}
            onChange={e => setShopFilter(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="ALL">Todas as Barbearias</option>
            <option value="platform-global">Global (Sem Barbearia Específica)</option>
            {barbershops.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            Nenhum usuário encontrado para os critérios selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-950 text-[11px] font-black uppercase text-neutral-400 tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-3.5">Usuário</th>
                  <th className="px-4 py-3.5">Cargo / Papel</th>
                  <th className="px-4 py-3.5">Barbearia Vinculada</th>
                  <th className="px-4 py-3.5">Contato</th>
                  <th className="px-4 py-3.5">Permissões Especiais</th>
                  <th className="px-4 py-3.5 text-center">Cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-neutral-850/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <AppImage
                          src={user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120'}
                          alt={user.name}
                          fallbackType="avatar"
                          className="w-9 h-9 rounded-xl object-cover border border-neutral-800"
                        />
                        <div>
                          <div className="font-bold text-neutral-100">{user.name}</div>
                          <div className="text-[10px] text-neutral-500 font-mono">{user.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        <span className="font-semibold">{getShopName(user.tenantId)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="space-y-0.5">
                        <div className="font-mono text-emerald-400 text-[11px]">{user.whatsapp || '—'}</div>
                        {user.email && <div className="font-mono text-neutral-400 text-[10px]">{user.email}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {user.role === 'SUPER_ADMIN' ? (
                        <span className="text-[10px] text-orange-400 font-bold">Acesso Total Irrestrito</span>
                      ) : user.role === 'PROPRIETARIO' ? (
                        <span className="text-[10px] text-amber-300 font-bold">Gestão Completa do Salão</span>
                      ) : user.role === 'PROFISSIONAL' ? (
                        <span className="text-[10px] text-neutral-400">
                          {user.canViewAllProfessionals ? 'Visão da Equipe (Líder)' : 'Agenda Individual'} • {user.commissionPercentage || 50}% comissão
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-500">Padrão</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap text-[11px] text-neutral-400 font-mono">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : 'Inicial'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
