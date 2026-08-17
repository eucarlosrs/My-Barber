import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ShieldAlert,
  Search,
  Filter,
  Clock,
  UserCheck,
  Building2,
  AlertTriangle,
  CheckCircle,
  Info,
  Layers
} from 'lucide-react';
import { AuditLog } from '../../types';

export const MasterAdminAuditLogs: React.FC = () => {
  const { auditLogs, barbershops } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [shopFilter, setShopFilter] = useState<string>('ALL');

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch =
      log.actorUserName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.targetTenantName && log.targetTenantName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    const matchesShop = shopFilter === 'ALL' || log.targetTenantId === shopFilter;

    return matchesSearch && matchesAction && matchesShop;
  });

  const uniqueActions = Array.from(new Set(auditLogs.map(l => l.action)));

  const getStatusBadge = (status: AuditLog['status']) => {
    switch (status) {
      case 'SUCESSO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-3 h-3" />
            Sucesso
          </span>
        );
      case 'AVISO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            Aviso
          </span>
        );
      case 'ERRO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/10 text-red-400 border border-red-500/30">
            <AlertTriangle className="w-3 h-3" />
            Erro
          </span>
        );
      default:
        return null;
    }
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black mb-2">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>TRILHA DE AUDITORIA IMUTÁVEL DA PLATAFORMA</span>
          </div>
          <h2 className="text-xl font-black text-neutral-100 font-heading">
            Histórico Completo de Ações Administrativas
          </h2>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
            Todas as operações sensíveis do ecossistema My Barber (cadastros, ativações/desativações, criação de acessos e simulações) são registradas com data/hora e autor.
          </p>
        </div>

        <div className="bg-neutral-950 px-4 py-2.5 rounded-2xl border border-neutral-800 text-right shrink-0">
          <div className="text-[11px] text-neutral-500">Total de Eventos</div>
          <div className="text-xl font-black text-amber-400 font-mono">{auditLogs.length}</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search text */}
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por ator, ação ou detalhes..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Filter Action */}
        <div className="relative">
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="ALL">Todas as Ações ({uniqueActions.length})</option>
            {uniqueActions.map(action => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </div>

        {/* Filter Barbearia */}
        <div className="relative">
          <select
            value={shopFilter}
            onChange={e => setShopFilter(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="ALL">Todas as Barbearias</option>
            {barbershops.map(shop => (
              <option key={shop.id} value={shop.id}>{shop.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Logs Table / Feed */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            Nenhum registro de auditoria encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-950 text-[11px] font-black uppercase text-neutral-400 tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-3.5">Data / Hora</th>
                  <th className="px-4 py-3.5">Ator (Executor)</th>
                  <th className="px-4 py-3.5">Ação Realizada</th>
                  <th className="px-4 py-3.5">Alvo / Barbearia</th>
                  <th className="px-4 py-3.5">Detalhes da Operação</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-neutral-850/50 transition-colors">
                    <td className="px-4 py-3 text-neutral-400 font-mono whitespace-nowrap text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span>{formatTimestamp(log.timestamp)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-bold text-neutral-200">{log.actorUserName}</div>
                      <div className="text-[10px] text-amber-400 uppercase font-mono">{log.actorRole}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-neutral-200 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 text-[11px] font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {log.targetTenantName ? (
                        <div className="flex items-center gap-1.5 text-neutral-300">
                          <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span className="font-semibold">{log.targetTenantName}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                      {log.targetUserName && (
                        <div className="text-[10px] text-neutral-400">Usuário: {log.targetUserName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-300 text-xs max-w-md">
                      {log.details}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {getStatusBadge(log.status)}
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
