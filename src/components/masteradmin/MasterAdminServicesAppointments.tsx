import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Scissors,
  Calendar,
  Search,
  Building2,
  Clock,
  DollarSign,
  UserCheck,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { AppointmentStatus } from '../../types';

export const MasterAdminServicesAppointments: React.FC = () => {
  const { allServices, allAppointments, barbershops, users } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<'SERVICES' | 'APPOINTMENTS'>('SERVICES');
  const [searchTerm, setSearchTerm] = useState('');
  const [shopFilter, setShopFilter] = useState<string>('ALL');

  const filteredServices = allServices.filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesShop = shopFilter === 'ALL' || s.tenantId === shopFilter;
    return matchesSearch && matchesShop;
  });

  const filteredAppointments = allAppointments.filter(a => {
    const matchesSearch =
      a.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.professionalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.serviceName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesShop = shopFilter === 'ALL' || a.tenantId === shopFilter;
    return matchesSearch && matchesShop;
  });

  const getShopName = (tenantId: string) => {
    const shop = barbershops.find(b => b.id === tenantId);
    return shop ? shop.name : tenantId;
  };

  const getAppointmentStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'AGENDADO':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Agendado</span>;
      case 'CONCLUIDO':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">Concluído</span>;
      case 'CANCELADO':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30">Cancelado</span>;
      case 'NAO_COMPARECEU':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">Não compareceu</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-800 text-neutral-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black mb-2">
            <Scissors className="w-3.5 h-3.5" />
            <span>OPERAÇÕES GLOBAIS EM NUVEM</span>
          </div>
          <h2 className="text-xl font-black text-neutral-100 font-heading">
            Catálogo de Serviços & Histórico de Agendamentos
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Supervisão geral dos atendimentos realizados e serviços cadastrados em todas as barbearias parceiras.
          </p>
        </div>

        {/* Subtab Toggle */}
        <div className="flex items-center gap-1.5 bg-neutral-950 p-1.5 rounded-2xl border border-neutral-800 shrink-0">
          <button
            onClick={() => setActiveSubTab('SERVICES')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeSubTab === 'SERVICES'
                ? 'bg-orange-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Serviços ({allServices.length})
          </button>
          <button
            onClick={() => setActiveSubTab('APPOINTMENTS')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeSubTab === 'APPOINTMENTS'
                ? 'bg-orange-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Agendamentos ({allAppointments.length})
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filtrar por nome, cliente ou profissional..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="relative">
          <select
            value={shopFilter}
            onChange={e => setShopFilter(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="ALL">Todas as Barbearias</option>
            {barbershops.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content Table */}
      {activeSubTab === 'SERVICES' ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
          {filteredServices.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-xs">Nenhum serviço encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-neutral-950 text-[11px] font-black uppercase text-neutral-400 tracking-wider border-b border-neutral-800">
                  <tr>
                    <th className="px-4 py-3.5">Serviço</th>
                    <th className="px-4 py-3.5">Barbearia</th>
                    <th className="px-4 py-3.5">Categoria</th>
                    <th className="px-4 py-3.5">Duração</th>
                    <th className="px-4 py-3.5">Preço</th>
                    <th className="px-4 py-3.5">Comissão Base</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {filteredServices.map(service => (
                    <tr key={service.id} className="hover:bg-neutral-850/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-neutral-100">{service.name}</div>
                        <div className="text-[10px] text-neutral-400 line-clamp-1">{service.description}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                          <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span>{getShopName(service.tenantId)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-neutral-950 text-neutral-400 text-[10px] font-mono border border-neutral-800">
                          {service.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-300 font-mono">
                        {service.durationMinutes} min
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-emerald-400">
                        R$ {service.price.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-neutral-400">
                        {service.commissionPercentage || 50}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
          {filteredAppointments.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-xs">Nenhum agendamento encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-neutral-950 text-[11px] font-black uppercase text-neutral-400 tracking-wider border-b border-neutral-800">
                  <tr>
                    <th className="px-4 py-3.5">Data / Horário</th>
                    <th className="px-4 py-3.5">Barbearia</th>
                    <th className="px-4 py-3.5">Cliente</th>
                    <th className="px-4 py-3.5">Profissional</th>
                    <th className="px-4 py-3.5">Serviço</th>
                    <th className="px-4 py-3.5">Valor</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {filteredAppointments.map(appointment => (
                    <tr key={appointment.id} className="hover:bg-neutral-850/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-neutral-200">
                        <div className="font-bold">{appointment.date}</div>
                        <div className="text-[11px] text-orange-400">{appointment.startTime} - {appointment.endTime}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                          <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span>{getShopName(appointment.tenantId)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-neutral-100">{appointment.clientName}</div>
                        <div className="text-[10px] text-emerald-400 font-mono">{appointment.clientWhatsApp}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-200 font-semibold">
                        {appointment.professionalName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-neutral-200 font-medium">{appointment.serviceName}</span>
                        {appointment.isEncaixe && (
                          <span className="ml-1.5 text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-black">
                            ENCAIXE
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-emerald-400">
                        R$ {appointment.servicePrice.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getAppointmentStatusBadge(appointment.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
