import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Building2,
  Users,
  Scissors,
  Calendar,
  Package,
  DollarSign,
  Settings,
  Plus,
  Clock,
  Cake,
  AlertTriangle,
  CheckCircle2,
  Send,
  Globe,
  Share2,
  Phone,
  Eye,
  EyeOff,
  Percent,
  FileText,
  Boxes,
  CalendarCheck,
  Gift,
  Tag,
  Camera,
  Upload,
  Pencil,
  Image as ImageIcon
} from 'lucide-react';
import { MY_BARBER_PLANS, UserRole, Service } from '../../types';
import { ProfessionalsTab } from './ProfessionalsTab';
import { AppointmentsTab } from './AppointmentsTab';
import { RafflesTab } from './RafflesTab';
import { PromotionsTab } from './PromotionsTab';
import { GalleryTab } from './GalleryTab';
import { AppImage } from '../common/AppImage';
import { ImageEditModal, ImagePreset } from '../common/ImageEditModal';

export const WebAdminView: React.FC = () => {
  const {
    currentBarbershop,
    updateBarbershop,
    tenantUsers,
    professionals,
    clients,
    services,
    appointments,
    raffles,
    promotions,
    communications,
    returnMessages,
    addService,
    updateService,
    sendReturnMessage,
    createCommunication,
    currentUser,
    galleryWorks,
    uploadMedia,
    getBarbershopDirectUrl,
    setViewMode
  } = useApp();

  const [activeTab, setActiveTab] = useState<
    'DASHBOARD' | 'APPOINTMENTS' | 'GALLERY' | 'PROFESSIONALS' | 'RAFFLES' | 'PROMOTIONS' | 'SERVICES' | 'CLIENTS' | 'FINANCIAL' | 'SETTINGS'
  >('DASHBOARD');

  const [copiedLink, setCopiedLink] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Quick Image Edit Modal States
  const [showLogoEditModal, setShowLogoEditModal] = useState(false);
  const [showBannerEditModal, setShowBannerEditModal] = useState(false);
  const [editingSalonImageIdx, setEditingSalonImageIdx] = useState<number | null>(null);
  const [isAddingSalonImage, setIsAddingSalonImage] = useState(false);
  const [editingServiceForImage, setEditingServiceForImage] = useState<Service | null>(null);

  // Form states
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState(50);
  const [newServiceDuration, setNewServiceDuration] = useState(30);
  const [newServiceCategory, setNewServiceCategory] = useState('Cabelo');
  const [newServiceReturnDays, setNewServiceReturnDays] = useState(25);
  const [newServiceImageUrl, setNewServiceImageUrl] = useState('https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600');

  const plan = MY_BARBER_PLANS[currentBarbershop.planId] || Object.values(MY_BARBER_PLANS)[0];
  const staffMembers = tenantUsers.filter(
    u => u.role === 'PROFISSIONAL' || u.role === 'PROPRIETARIO' || u.role === 'GERENTE'
  );

  // Financial calculations
  const totalRevenue = appointments
    .filter(a => a.status === 'AGENDADO' || a.status === 'CONCLUIDO')
    .reduce((sum, a) => sum + a.servicePrice, 0);

  const totalCommissions = appointments
    .filter(a => a.status === 'AGENDADO' || a.status === 'CONCLUIDO')
    .reduce((sum, a) => {
      const prof = professionals.find(p => p.id === a.professionalId);
      const rate = prof?.commissionPercentage || 40;
      return sum + (a.servicePrice * rate) / 100;
    }, 0);

  const netIncome = totalRevenue - totalCommissions;

  // Birthday clients for current month (August)
  const currentMonth = 8;
  const birthdayClients = clients.filter(c => {
    if (!c.birthDate) return false;
    const birthMonth = parseInt(c.birthDate.split('-')[1], 10);
    return birthMonth === currentMonth;
  });

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    addService({
      tenantId: currentBarbershop.id,
      name: newServiceName,
      description: 'Serviço profissional de barbearia',
      price: newServicePrice,
      durationMinutes: newServiceDuration,
      category: newServiceCategory,
      imageUrl: newServiceImageUrl,
      returnReminderDays: newServiceReturnDays,
      active: true
    });
    setShowAddServiceModal(false);
    setNewServiceName('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header bar of WebAdmin */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              WebAdmin • Gestão da Barbearia
            </span>
            <span className="text-xs text-neutral-400">Usuário: <strong>{currentUser.name}</strong> ({currentUser.role})</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-100 font-heading mt-1">
            {currentBarbershop.name}
          </h1>
          <p className="text-xs text-neutral-400">
            Painel administrativo exclusivo | Plano: <strong className="text-amber-400">{plan.name}</strong> ({plan.priceMonthly.toFixed(2).replace('.', ',')}/mês)
          </p>
        </div>

        {/* Plan Limit badge */}
        <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-2xl flex items-center gap-3">
          <Users className="w-5 h-5 text-orange-400" />
          <div>
            <div className="text-xs font-semibold text-neutral-200">
              Equipe: {staffMembers.length} / {plan.maxProfessionals}
            </div>
            <div className="text-[10px] text-neutral-400">
              (proprietário, gerente e barbeiros)
            </div>
            <div className="w-28 bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-orange-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, (staffMembers.length / plan.maxProfessionals) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Link de Divulgação da Barbearia (Instagram Bio & WhatsApp) */}
      <div className="my-4 bg-gradient-to-r from-orange-500/15 via-neutral-900 to-neutral-900 border border-orange-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0">
            <Share2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-neutral-100 uppercase tracking-wider font-heading">
                Link Oficial da Barbearia
              </span>
              <span className="bg-orange-500 text-neutral-950 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                Divulgação
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5 truncate">
              Compartilhe no seu Instagram, bio, WhatsApp e redes sociais para seus clientes agendarem direto:
            </p>
            <div className="text-xs font-mono text-orange-400 font-bold mt-1 truncate select-all">
              {getBarbershopDirectUrl(currentBarbershop)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            onClick={() => {
              const url = getBarbershopDirectUrl(currentBarbershop);
              navigator.clipboard.writeText(url);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 3000);
            }}
            className="flex-1 sm:flex-initial px-4 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md cursor-pointer"
          >
            {copiedLink ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Link Copiado!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>Copiar Link</span>
              </>
            )}
          </button>

          <button
            onClick={() => setViewMode('CLIENT_APP')}
            className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Visualizar a página pública como o cliente vê"
          >
            <Eye className="w-4 h-4 text-neutral-400" />
            <span className="hidden md:inline">Ver Página Pública</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 my-6 overflow-x-auto border-b border-neutral-800 pb-2">
        {[
          { id: 'DASHBOARD', label: 'Visão Geral', icon: Building2 },
          { id: 'SETTINGS', label: 'Identidade & Fotos', icon: Settings },
          { id: 'APPOINTMENTS', label: `Agendamentos (${appointments.length})`, icon: CalendarCheck },
          { id: 'GALLERY', label: `Galeria & Portfólio (${galleryWorks.length})`, icon: Camera },
          { id: 'PROFESSIONALS', label: `Profissionais (${professionals.length})`, icon: Users },
          { id: 'RAFFLES', label: `Sorteios (${raffles.filter(r => r.status === 'ATIVO').length})`, icon: Gift },
          { id: 'PROMOTIONS', label: `Promoções (${promotions.filter(p => p.active).length})`, icon: Tag },
          { id: 'SERVICES', label: `Serviços (${services.length})`, icon: Scissors },
          { id: 'CLIENTS', label: `Clientes (${clients.length})`, icon: Calendar },
          { id: 'FINANCIAL', label: 'Relatórios & Comissões', icon: DollarSign }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
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

      {/* 1. DASHBOARD */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => setActiveTab('APPOINTMENTS')}
              className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-amber-500/40 rounded-2xl p-4 transition-all cursor-pointer shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-semibold">Agendamentos</span>
                <CalendarCheck className="w-5 h-5 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-neutral-100 mt-2 font-mono">
                {appointments.filter(a => a.status === 'AGENDADO').length}
              </div>
              <div className="flex items-center gap-1 text-xs text-amber-400 mt-1 font-medium">
                <span>Ver agenda de hoje</span>
                <span>→</span>
              </div>
            </div>

            <div
              onClick={() => setActiveTab('FINANCIAL')}
              className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-emerald-500/40 rounded-2xl p-4 transition-all cursor-pointer shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-semibold">Faturamento</span>
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">
                R$ {totalRevenue.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-xs text-neutral-400 mt-1 font-normal">
                Líquido: <strong className="text-emerald-300 font-semibold font-mono">R$ {netIncome.toFixed(2).replace('.', ',')}</strong>
              </div>
            </div>

            <div
              onClick={() => setActiveTab('CLIENTS')}
              className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-purple-500/40 rounded-2xl p-4 transition-all cursor-pointer shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-semibold">Aniversariantes</span>
                <Cake className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-purple-400 mt-2 font-mono">
                {birthdayClients.length}
              </div>
              <div className="text-xs text-purple-300 mt-1 font-medium">
                Fidelização & WhatsApp →
              </div>
            </div>
          </div>

          {/* Quick Visual Agenda Preview */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-500" />
                <h3 className="font-semibold text-neutral-100 text-sm">
                  Próximos Horários & Atendimentos
                </h3>
              </div>
              <button
                onClick={() => setActiveTab('APPOINTMENTS')}
                className="text-xs text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1 bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/20"
              >
                <span>Abrir Agenda Completa</span>
                <span>→</span>
              </button>
            </div>

            {appointments.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-xs">
                Nenhum agendamento registrado ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {appointments.slice(0, 6).map(apt => (
                  <div
                    key={apt.id}
                    onClick={() => setActiveTab('APPOINTMENTS')}
                    className="bg-neutral-950 hover:bg-neutral-850 p-3.5 rounded-2xl border border-neutral-800 hover:border-neutral-700 transition-all flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col items-center justify-center text-center">
                        <span className="text-xs font-bold text-orange-400 font-mono">{apt.startTime}</span>
                        <span className="text-[9px] text-neutral-500">{apt.date.split('-').reverse().slice(0, 2).join('/')}</span>
                      </div>
                      <div>
                        <div className="font-extrabold text-neutral-100 text-xs">{apt.clientName}</div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5">
                          <Scissors className="w-3 h-3 text-orange-400" />
                          <span>{apt.serviceName}</span>
                          <span>•</span>
                          <span className="text-neutral-300">{apt.professionalName}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-400 font-mono block">
                        R$ {apt.servicePrice.toFixed(2).replace('.', ',')}
                      </span>
                      <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded mt-1 ${
                        apt.status === 'CONCLUIDO'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : apt.status === 'CANCELADO'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {apt.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. AGENDAMENTOS DOS PROFISSIONAIS */}
      {activeTab === 'APPOINTMENTS' && <AppointmentsTab />}

      {/* 3. GALERIA & PORTFÓLIO DE CORTES */}
      {activeTab === 'GALLERY' && <GalleryTab />}

      {/* 4. PROFISSIONAIS */}
      {activeTab === 'PROFESSIONALS' && <ProfessionalsTab />}

      {/* 4. SORTEIOS */}
      {activeTab === 'RAFFLES' && <RafflesTab />}

      {/* 5. PROMOÇÕES */}
      {activeTab === 'PROMOTIONS' && <PromotionsTab />}

      {/* 3. SERVIÇOS & JORNADAS */}
      {activeTab === 'SERVICES' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-neutral-100 text-lg font-heading">
                Serviços Cadastrados
              </h3>
              <p className="text-xs text-neutral-400">
                Durações, valores e período para mensagens de retorno automáticas
              </p>
            </div>

            <button
              onClick={() => setShowAddServiceModal(true)}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Serviço</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map(srv => (
              <div key={srv.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col justify-between group">
                <div className="relative h-36 bg-neutral-950 overflow-hidden">
                  <AppImage
                    src={srv.imageUrl || 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400'}
                    alt={srv.name}
                    fallbackType="service"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-black/40"></div>
                  
                  <div className="absolute top-2.5 left-2.5">
                    <span className="text-[10px] font-bold bg-neutral-950/80 backdrop-blur-sm text-neutral-200 px-2 py-0.5 rounded-full border border-neutral-700">
                      {srv.category}
                    </span>
                  </div>

                  <div className="absolute top-2.5 right-2.5">
                    <span className="text-xs font-black bg-emerald-500/90 text-neutral-950 px-2 py-0.5 rounded-full shadow">
                      R$ {srv.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  {/* Edit Photo Button with Pencil */}
                  <button
                    type="button"
                    onClick={() => setEditingServiceForImage(srv)}
                    className="absolute bottom-2 right-2 bg-neutral-900/90 hover:bg-orange-500 hover:text-neutral-950 text-neutral-200 border border-neutral-700 hover:border-orange-500 p-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer shadow-md backdrop-blur-sm opacity-90 group-hover:opacity-100 transition-all"
                    title="Editar foto do serviço (upload ou link)"
                  >
                    <Pencil className="w-3 h-3 text-orange-400 group-hover:text-neutral-950" />
                    <span>Alterar Foto</span>
                  </button>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-neutral-100 text-sm mb-1">{srv.name}</h4>
                    <p className="text-xs text-neutral-400 leading-relaxed mb-3">{srv.description}</p>
                  </div>

                  <div className="pt-3 border-t border-neutral-800/80 text-xs text-neutral-300 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Duração:
                      </span>
                      <strong>{srv.durationMinutes} minutos</strong>
                    </div>
                    {srv.returnReminderDays && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Retorno sugerido:</span>
                        <strong className="text-blue-400">{srv.returnReminderDays} dias</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Service Modal */}
          {showAddServiceModal && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 text-neutral-100">
                <h3 className="text-lg font-bold mb-1 font-heading">Cadastrar Novo Serviço</h3>
                <form onSubmit={handleAddService} className="space-y-4 mt-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Nome do Serviço</label>
                    <input
                      type="text"
                      required
                      value={newServiceName}
                      onChange={e => setNewServiceName(e.target.value)}
                      placeholder="Ex: Barba Terapia & Hidratação"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Foto Ilustrativa do Serviço</label>
                    <div className="flex items-center gap-2">
                      <AppImage
                        src={newServiceImageUrl}
                        alt="Preview"
                        fallbackType="service"
                        className="w-12 h-12 rounded-lg object-cover border border-neutral-700 bg-neutral-950 shrink-0"
                      />
                      <div className="flex-1 space-y-1">
                        <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-bold cursor-pointer border border-neutral-700">
                          <Upload className="w-3 h-3 text-amber-400" />
                          <span>Upload Imagem</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                try {
                                  const url = await uploadMedia(file, 'services');
                                  setNewServiceImageUrl(url);
                                } catch (err) {
                                  console.error(err);
                                }
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        <input
                          type="text"
                          value={newServiceImageUrl}
                          onChange={e => setNewServiceImageUrl(e.target.value)}
                          placeholder="Ou cole a URL da foto"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">Preço (R$)</label>
                      <input
                        type="number"
                        step="0.5"
                        required
                        value={newServicePrice}
                        onChange={e => setNewServicePrice(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">Duração (min)</label>
                      <input
                        type="number"
                        step="5"
                        required
                        value={newServiceDuration}
                        onChange={e => setNewServiceDuration(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">Categoria</label>
                      <select
                        value={newServiceCategory}
                        onChange={e => setNewServiceCategory(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="Cabelo">Cabelo</option>
                        <option value="Barba">Barba</option>
                        <option value="Combos">Combos</option>
                        <option value="Estética">Estética</option>
                        <option value="Química">Química</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">Retorno (dias)</label>
                      <input
                        type="number"
                        value={newServiceReturnDays}
                        onChange={e => setNewServiceReturnDays(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAddServiceModal(false)}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-lg text-xs font-bold"
                    >
                      Salvar Serviço
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. CLIENTES & ANIVERSARIANTES */}
      {activeTab === 'CLIENTS' && (
        <div className="space-y-6">
          {/* Birthday special area (Seção 21) */}
          <div className="bg-purple-950/30 border border-purple-800/40 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Cake className="w-5 h-5 text-purple-400" />
              <h3 className="font-bold text-purple-200 text-base font-heading">
                Aniversariantes do Mês de Agosto (Seção 21)
              </h3>
            </div>
            <p className="text-xs text-purple-300/80 mb-4">
              Identifique clientes aniversariantes para enviar mensagens de felicitações e promoções exclusivas.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {birthdayClients.map(c => (
                <div key={c.id} className="bg-neutral-900/90 border border-purple-500/30 p-3.5 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-neutral-100 text-xs">{c.name}</div>
                    <div className="text-neutral-400 font-mono text-[11px]">{c.whatsapp}</div>
                    <div className="text-purple-400 font-semibold text-[11px] mt-0.5">
                      Nascimento: {c.birthDate?.split('-').reverse().join('/')}
                    </div>
                  </div>
                  <button
                    onClick={() => alert(`Mensagem de aniversário preparada para ${c.name} via WhatsApp (${c.whatsapp})!`)}
                    className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded-lg text-xs"
                    title="Enviar Mensagem de Aniversário"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Full Client List */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="font-bold text-neutral-100 font-heading text-base mb-4">
              Histórico & Lista Geral de Clientes (Login WhatsApp)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800 uppercase text-[11px]">
                  <tr>
                    <th className="p-3">Nome</th>
                    <th className="p-3">WhatsApp</th>
                    <th className="p-3">Aniversário</th>
                    <th className="p-3">Total de Atendimentos</th>
                    <th className="p-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 text-neutral-300">
                  {clients.map(c => {
                    const aptCount = appointments.filter(a => a.clientId === c.id).length;
                    return (
                      <tr key={c.id} className="hover:bg-neutral-800/40">
                        <td className="p-3 font-semibold text-neutral-100">{c.name}</td>
                        <td className="p-3 font-mono text-neutral-300">{c.whatsapp}</td>
                        <td className="p-3 text-neutral-400">
                          {c.birthDate ? c.birthDate.split('-').reverse().join('/') : '-'}
                        </td>
                        <td className="p-3">
                          <span className="px-2.5 py-0.5 rounded-full bg-neutral-800 font-bold text-neutral-200">
                            {aptCount}
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => alert(`Histórico de ${c.name}: ${aptCount} agendamentos registrados no sistema.`)}
                            className="text-amber-400 hover:underline font-semibold"
                          >
                            Ver Ficha
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. RELATÓRIOS FINANCEIROS & COMISSÕES */}
      {activeTab === 'FINANCIAL' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="text-xs text-neutral-400 font-medium">Faturamento Bruto Total</div>
              <div className="text-2xl font-bold text-neutral-100 mt-1">
                R$ {totalRevenue.toFixed(2).replace('.', ',')}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">Serviços agendados e concluídos</p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="text-xs text-neutral-400 font-medium">Total de Comissões a Pagar</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                R$ {totalCommissions.toFixed(2).replace('.', ',')}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">Calculado conforme % de cada profissional</p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="text-xs text-neutral-400 font-medium">Resultado Líquido do Estabelecimento</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                R$ {netIncome.toFixed(2).replace('.', ',')}
              </div>
              <p className="text-[11px] text-emerald-300 mt-1">Margem operacional da barbearia</p>
            </div>
          </div>

          {/* Commission by Professional */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="font-bold text-neutral-100 font-heading text-base mb-4">
              Demonstrativo de Comissões por Profissional
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800 uppercase text-[11px]">
                  <tr>
                    <th className="p-3">Profissional</th>
                    <th className="p-3">Atendimentos</th>
                    <th className="p-3">Faturamento Gerado</th>
                    <th className="p-3">Taxa (%)</th>
                    <th className="p-3">Comissão Líquida a Receber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 text-neutral-300">
                  {professionals.map(prof => {
                    const profAppointments = appointments.filter(a => a.professionalId === prof.id);
                    const gross = profAppointments.reduce((sum, a) => sum + a.servicePrice, 0);
                    const rate = prof.commissionPercentage || 40;
                    const commission = (gross * rate) / 100;

                    return (
                      <tr key={prof.id} className="hover:bg-neutral-800/40">
                        <td className="p-3 font-semibold text-neutral-100">{prof.name}</td>
                        <td className="p-3">{profAppointments.length} cortes</td>
                        <td className="p-3 font-mono">R$ {gross.toFixed(2).replace('.', ',')}</td>
                        <td className="p-3 font-bold text-neutral-300">{rate}%</td>
                        <td className="p-3 font-bold text-amber-400 font-mono text-sm">
                          R$ {commission.toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. IDENTIDADE DA BARBEARIA & CONFIGURAÇÕES */}
      {activeTab === 'SETTINGS' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="font-bold text-neutral-100 font-heading text-lg">
              Identidade Visual & Informações do Estabelecimento (Seções 4 e 25)
            </h3>
            <p className="text-xs text-neutral-400">
              Esses dados personalizam todo o aplicativo que o seu cliente visualiza.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Nome da Barbearia</label>
                <input
                  type="text"
                  value={currentBarbershop.name}
                  onChange={e => updateBarbershop({ name: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Domínio Próprio Exclusivo</label>
                <input
                  type="text"
                  value={currentBarbershop.customDomain}
                  onChange={e => updateBarbershop({ customDomain: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Sobre a Barbearia</label>
                <textarea
                  rows={3}
                  value={currentBarbershop.about}
                  onChange={e => updateBarbershop({ about: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">WhatsApp de Atendimento</label>
                <input
                  type="text"
                  value={currentBarbershop.whatsapp}
                  onChange={e => updateBarbershop({ whatsapp: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Social Media & Salon Images */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Logo da Barbearia</label>
                <div className="flex items-center gap-3">
                  <div
                    onClick={() => setShowLogoEditModal(true)}
                    className="relative group cursor-pointer w-14 h-14 rounded-2xl overflow-hidden border-2 border-neutral-700 hover:border-orange-500 bg-neutral-950 shrink-0 transition-colors shadow-md"
                  >
                    <AppImage
                      src={currentBarbershop.logoUrl}
                      alt="Logo"
                      fallbackType="logo"
                      className="w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0 bg-neutral-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      title="Editar Logo"
                    >
                      <Pencil className="w-4 h-4 text-orange-400" />
                    </div>
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setShowLogoEditModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-orange-500 hover:text-neutral-950 text-neutral-200 rounded-xl text-xs font-bold transition-all border border-neutral-700 hover:border-orange-500 shadow-sm"
                    >
                      <Pencil className="w-3.5 h-3.5 text-orange-400" />
                      <span>Alterar Logo (Upload ou Link)</span>
                    </button>
                    <p className="text-[10px] text-neutral-500">
                      Recomendado formato quadrado (PNG com fundo transparente ou JPG).
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Banner de Capa</label>
                <div className="flex items-center gap-3">
                  <div
                    onClick={() => setShowBannerEditModal(true)}
                    className="relative group cursor-pointer w-24 h-14 rounded-2xl overflow-hidden border-2 border-neutral-700 hover:border-orange-500 bg-neutral-950 shrink-0 transition-colors shadow-md"
                  >
                    <AppImage
                      src={currentBarbershop.bannerUrl}
                      alt="Banner"
                      fallbackType="banner"
                      className="w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0 bg-neutral-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      title="Editar Capa"
                    >
                      <Pencil className="w-4 h-4 text-orange-400" />
                    </div>
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setShowBannerEditModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-orange-500 hover:text-neutral-950 text-neutral-200 rounded-xl text-xs font-bold transition-all border border-neutral-700 hover:border-orange-500 shadow-sm"
                    >
                      <Pencil className="w-3.5 h-3.5 text-orange-400" />
                      <span>Alterar Capa (Upload ou Link)</span>
                    </button>
                    <p className="text-[10px] text-neutral-500">
                      Exibido no topo do aplicativo e página de agendamentos.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Instagram da Barbearia</label>
                <input
                  type="text"
                  value={currentBarbershop.socialMedia.instagram || ''}
                  onChange={e => updateBarbershop({
                    socialMedia: { ...currentBarbershop.socialMedia, instagram: e.target.value }
                  })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-semibold text-neutral-300">
                      Fotos do Salão & Fachada ({Math.min(3, currentBarbershop.salonImages.length)}/3)
                    </label>
                    {currentBarbershop.salonImages.length >= 3 && (
                      <span className="text-[10px] bg-neutral-800 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-neutral-700">
                        Máximo de 3 fotos atingido
                      </span>
                    )}
                  </div>
                  {currentBarbershop.salonImages.length < 3 && (
                    <button
                      type="button"
                      onClick={() => setIsAddingSalonImage(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-orange-400 font-bold bg-orange-500/10 hover:bg-orange-500 hover:text-neutral-950 px-3 py-1.5 rounded-xl border border-orange-500/30 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Foto do Salão</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {currentBarbershop.salonImages.slice(0, 3).map((img, i) => (
                    <div key={i} className="relative group rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 shadow-md">
                      <AppImage
                        src={img}
                        alt={`Salão ${i + 1}`}
                        fallbackType="gallery"
                        className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      
                      {/* Pencil Edit Overlay Button */}
                      <button
                        type="button"
                        onClick={() => setEditingSalonImageIdx(i)}
                        className="absolute bottom-2 left-2 bg-neutral-950/85 hover:bg-orange-500 hover:text-neutral-950 text-neutral-200 p-1.5 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition-all border border-neutral-700 hover:border-orange-500 flex items-center gap-1"
                        title="Trocar esta foto"
                      >
                        <Pencil className="w-3 h-3 text-orange-400 group-hover:text-neutral-950" />
                        <span>Editar</span>
                      </button>

                      {currentBarbershop.salonImages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            updateBarbershop({
                              salonImages: currentBarbershop.salonImages.filter((_, idx) => idx !== i)
                            });
                          }}
                          className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-600 text-white p-1.5 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                          title="Remover foto"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* WhatsApp Reminders config (Seção 11) */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                <div className="font-semibold text-xs text-amber-400">Configuração de Lembretes WhatsApp</div>
                <div className="flex items-center justify-between text-xs text-neutral-300">
                  <span>Antecedência do envio:</span>
                  <strong className="font-mono text-amber-300">
                    {currentBarbershop.reminderConfig.advanceMinutes} minutos antes
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Image Edit Modals */}
      {showLogoEditModal && (
        <ImageEditModal
          isOpen={showLogoEditModal}
          onClose={() => setShowLogoEditModal(false)}
          title="Editar Logo da Barbearia"
          subtitle="Faça upload de uma foto da sua logomarca ou cole uma URL direta."
          currentImageUrl={currentBarbershop.logoUrl}
          fallbackType="logo"
          presets={[
            { label: 'Logo Barber Vintage', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400' },
            { label: 'Logo Premium Gold', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400' }
          ]}
          onSave={(newUrl) => updateBarbershop({ logoUrl: newUrl })}
        />
      )}

      {showBannerEditModal && (
        <ImageEditModal
          isOpen={showBannerEditModal}
          onClose={() => setShowBannerEditModal(false)}
          title="Editar Capa / Banner da Barbearia"
          subtitle="Faça upload do banner de capa ou cole uma URL de alta resolução."
          currentImageUrl={currentBarbershop.bannerUrl}
          fallbackType="banner"
          presets={[
            { label: 'Salão Rústico Madeira', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200' },
            { label: 'Cadeiras Clássicas de Barbeiro', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200' },
            { label: 'Bancada Moderna com Espelhos', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=1200' }
          ]}
          onSave={(newUrl) => updateBarbershop({ bannerUrl: newUrl })}
        />
      )}

      {isAddingSalonImage && (
        <ImageEditModal
          isOpen={isAddingSalonImage}
          onClose={() => setIsAddingSalonImage(false)}
          title="Adicionar Foto do Salão"
          subtitle="Faça upload de foto do interior ou fachada da barbearia."
          currentImageUrl="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800"
          fallbackType="gallery"
          presets={[
            { label: 'Cadeiras de Couro & Espelhos', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800' },
            { label: 'Bancada de Ferramentas & Navalhas', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800' },
            { label: 'Fachada & Recepção VIP', url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800' }
          ]}
          onSave={(newUrl) => {
            const current = currentBarbershop.salonImages.slice(0, 2);
            updateBarbershop({
              salonImages: [...current, newUrl]
            });
            setIsAddingSalonImage(false);
          }}
        />
      )}

      {editingSalonImageIdx !== null && (
        <ImageEditModal
          isOpen={editingSalonImageIdx !== null}
          onClose={() => setEditingSalonImageIdx(null)}
          title={`Alterar Foto do Salão #${editingSalonImageIdx + 1}`}
          subtitle="Substitua esta foto por um novo arquivo ou link."
          currentImageUrl={currentBarbershop.salonImages[editingSalonImageIdx] || ''}
          fallbackType="gallery"
          presets={[
            { label: 'Cadeiras de Couro & Espelhos', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800' },
            { label: 'Bancada de Ferramentas', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800' }
          ]}
          onSave={(newUrl) => {
            const updated = [...currentBarbershop.salonImages];
            updated[editingSalonImageIdx] = newUrl;
            updateBarbershop({ salonImages: updated });
            setEditingSalonImageIdx(null);
          }}
        />
      )}

      {editingServiceForImage && (
        <ImageEditModal
          isOpen={!!editingServiceForImage}
          onClose={() => setEditingServiceForImage(null)}
          title={`Alterar Foto de "${editingServiceForImage.name}"`}
          subtitle="Faça upload ou cole o link da imagem ilustrativa deste serviço."
          currentImageUrl={editingServiceForImage.imageUrl || 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600'}
          fallbackType="service"
          presets={[
            { label: 'Corte Degradê na Máquina', url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600' },
            { label: 'Barba Terapia com Toalha Quente', url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600' },
            { label: 'Combo Cabelo + Barba', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600' },
            { label: 'Corte na Tesoura', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600' }
          ]}
          onSave={(newUrl) => {
            updateService(editingServiceForImage.id, { imageUrl: newUrl });
            setEditingServiceForImage(null);
          }}
        />
      )}
    </div>
  );
};
