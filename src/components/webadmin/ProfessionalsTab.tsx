import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Users,
  Plus,
  CheckCircle2,
  AlertTriangle,
  User as UserIcon,
  Trash2,
  Edit2,
  Percent,
  Phone,
  Shield,
  Sparkles,
  Camera,
  Pencil,
  Upload,
  X,
  Image as ImageIcon,
  KeyRound,
  Mail,
  Eye,
  EyeOff,
  UserCheck
} from 'lucide-react';
import { MY_BARBER_PLANS, User } from '../../types';
import { AppImage } from '../common/AppImage';
import { ImageEditModal, ImagePreset } from '../common/ImageEditModal';
import { SaveButton } from '../common/SaveButton';
import { UnsavedChangesModal } from '../common/UnsavedChangesModal';

// Curated high quality barber avatar presets
const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80'
];

export const ProfessionalsTab: React.FC = () => {
  const {
    currentBarbershop,
    tenantUsers,
    professionals,
    addProfessional,
    updateProfessional,
    deleteProfessional,
    currentUser,
    createProfessionalAccess,
    uploadMedia
  } = useApp();

  const plan = MY_BARBER_PLANS[currentBarbershop.planId] || Object.values(MY_BARBER_PLANS)[0];
  const staffMembers = tenantUsers.filter(
    u => u.role === 'PROFISSIONAL' || u.role === 'PROPRIETARIO' || u.role === 'GERENTE'
  );

  const [showModal, setShowModal] = useState(false);
  const [editingProfId, setEditingProfId] = useState<string | null>(null);
  const [initialProf, setInitialProf] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [commissionPercentage, setCommissionPercentage] = useState(45);
  const [canViewAllProfessionals, setCanViewAllProfessionals] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>(['Degradê Navalhado', 'Barboterapia']);
  const [newSpecialtyInput, setNewSpecialtyInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  const [showAvatarEditModal, setShowAvatarEditModal] = useState(false);
  const [avatarEditProf, setAvatarEditProf] = useState<User | null>(null);

  const isDirty = useMemo(() => {
    if (!showModal) return false;
    if (editingProfId && initialProf) {
      const initialSpecs = initialProf.specialties || ['Cortes em Geral'];
      const specsChanged = JSON.stringify(specialties) !== JSON.stringify(initialSpecs);
      return (
        name !== initialProf.name ||
        whatsapp !== initialProf.whatsapp ||
        email !== (initialProf.email || '') ||
        (password !== '' && password !== (initialProf.password || '')) ||
        avatarUrl !== (initialProf.avatarUrl || PRESET_AVATARS[0]) ||
        commissionPercentage !== (initialProf.commissionPercentage || 40) ||
        canViewAllProfessionals !== (!!initialProf.canViewAllProfessionals) ||
        specsChanged ||
        newSpecialtyInput.trim().length > 0
      );
    }
    return (
      name.trim().length > 0 ||
      whatsapp.trim().length > 0 ||
      email.trim().length > 0 ||
      password.trim().length > 0 ||
      newSpecialtyInput.trim().length > 0
    );
  }, [
    showModal,
    editingProfId,
    initialProf,
    name,
    whatsapp,
    email,
    password,
    avatarUrl,
    commissionPercentage,
    canViewAllProfessionals,
    specialties,
    newSpecialtyInput
  ]);

  const openAvatarEdit = (prof: User) => {
    setAvatarEditProf(prof);
    setShowAvatarEditModal(true);
  };

  const handleSaveAvatar = (newUrl: string) => {
    if (avatarEditProf) {
      updateProfessional(avatarEditProf.id, { avatarUrl: newUrl });
    }
    setShowAvatarEditModal(false);
  };

  const handleAddSpecialty = () => {
    const trimmed = newSpecialtyInput.trim();
    if (!trimmed) return;
    if (!specialties.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setSpecialties(prev => [...prev, trimmed]);
    }
    setNewSpecialtyInput('');
  };

  const handleRemoveSpecialty = (indexToRemove: number) => {
    setSpecialties(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const openAddModal = () => {
    setEditingProfId(null);
    setInitialProf(null);
    setName('');
    setWhatsapp('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setAvatarUrl(PRESET_AVATARS[0]);
    setCommissionPercentage(45);
    setCanViewAllProfessionals(false);
    setSpecialties(['Degradê Navalhado', 'Barboterapia']);
    setNewSpecialtyInput('');
    setError(null);
    setIsUploadingPhoto(false);
    setIsSaved(false);
    setShowModal(true);
  };

  const openEditModal = (prof: User) => {
    setEditingProfId(prof.id);
    setInitialProf(prof);
    setName(prof.name);
    setWhatsapp(prof.whatsapp);
    setEmail(prof.email || '');
    setPassword(prof.password || '');
    setShowPassword(false);
    setAvatarUrl(prof.avatarUrl || PRESET_AVATARS[0]);
    setCommissionPercentage(prof.commissionPercentage || 40);
    setCanViewAllProfessionals(!!prof.canViewAllProfessionals);
    setSpecialties(prof.specialties && prof.specialties.length > 0 ? [...prof.specialties] : ['Cortes em Geral']);
    setNewSpecialtyInput('');
    setError(null);
    setIsUploadingPhoto(false);
    setIsSaved(false);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    if (isDirty) {
      setShowUnsavedModal(true);
    } else {
      setShowModal(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      // If user typed something in specialty input and forgot to click +, include it
      let finalSpecialties = [...specialties];
      if (newSpecialtyInput.trim() && !finalSpecialties.some(s => s.toLowerCase() === newSpecialtyInput.trim().toLowerCase())) {
        finalSpecialties.push(newSpecialtyInput.trim());
      }

      if (finalSpecialties.length === 0) {
        finalSpecialties = ['Cortes em Geral'];
      }

      if (editingProfId) {
        updateProfessional(editingProfId, {
          name: name.trim(),
          whatsapp: whatsapp.trim(),
          email: email.trim() || undefined,
          password: password.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined,
          commissionPercentage,
          canViewAllProfessionals,
          specialties: finalSpecialties
        });
        setIsSaved(true);
        setTimeout(() => {
          setShowModal(false);
          setIsSaved(false);
        }, 600);
      } else {
        const result = createProfessionalAccess({
          tenantId: currentBarbershop.id,
          role: 'PROFISSIONAL',
          name: name.trim(),
          whatsapp: whatsapp.trim(),
          email: email.trim() || undefined,
          password: password.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined,
          commissionPercentage,
          canViewAllProfessionals,
          specialties: finalSpecialties
        });

        if (result.success) {
          setIsSaved(true);
          setTimeout(() => {
            setShowModal(false);
            setIsSaved(false);
          }, 600);
        } else {
          setError(result.error || 'Erro ao cadastrar profissional');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar profissional');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Deseja realmente remover o profissional ${name}?`)) {
      const res = deleteProfessional(id);
      if (!res.success) {
        alert(res.error);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-neutral-100 text-lg font-heading flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-500" />
            Equipe de Profissionais & Barbeiros
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Cadastre os profissionais com foto, comissões, especialidades e regras de acesso.
          </p>
        </div>

        <button
          onClick={openAddModal}
          disabled={staffMembers.length >= plan.maxProfessionals}
          className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
            staffMembers.length >= plan.maxProfessionals
              ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
              : 'bg-orange-500 hover:bg-orange-400 text-neutral-950 shadow-md active:scale-95'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Profissional</span>
        </button>
      </div>

      {/* Plan Capacity Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold">
            {staffMembers.length}/{plan.maxProfessionals}
          </div>
          <div>
            <div className="text-xs font-bold text-neutral-200">
              Vagas da Equipe no {plan.name} (R$ {plan.priceMonthly.toFixed(2).replace('.', ',')}/mês)
            </div>
            <div className="text-[11px] text-neutral-400">
              Inclui proprietário, gerente e barbeiros contratados.
            </div>
          </div>
        </div>
        <div className="w-full md:w-64 bg-neutral-950 h-2.5 rounded-full overflow-hidden border border-neutral-800">
          <div
            className="bg-orange-500 h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, (staffMembers.length / plan.maxProfessionals) * 100)}%` }}
          />
        </div>
      </div>

      {/* Access Rule Banner */}
      <div className="bg-orange-500/10 border border-orange-500/30 p-3.5 rounded-xl text-xs text-orange-200 flex items-start gap-2.5">
        <Shield className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
        <div>
          <strong>Regra de Visualização Geral:</strong> Permite que exatamente 1 barbeiro líder tenha permissão de visualizar a agenda de todos os profissionais. Os demais profissionais têm acesso restrito exclusivamente à sua própria agenda.
        </div>
      </div>

      {/* Professionals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {professionals.map(prof => (
          <div
            key={prof.id}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between hover:border-neutral-700 transition-colors shadow-lg"
          >
            {prof.canViewAllProfessionals && (
              <div className="absolute top-0 right-0 bg-orange-500 text-neutral-950 font-black text-[9px] px-3 py-0.5 rounded-bl uppercase tracking-wider">
                Visão Geral da Equipe
              </div>
            )}

            <div>
              <div className="flex items-center gap-3.5 mb-4">
                <div className="relative group/avatar cursor-pointer" onClick={() => openAvatarEdit(prof)}>
                  <AppImage
                    src={prof.avatarUrl}
                    alt={prof.name}
                    fallbackType="avatar"
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-neutral-700 ring-2 ring-orange-500/20 group-hover/avatar:border-orange-500 transition-colors"
                  />
                  <div
                    className="absolute inset-0 bg-neutral-950/70 rounded-2xl opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity"
                    title="Editar foto do profissional"
                  >
                    <Pencil className="w-4 h-4 text-orange-400" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-neutral-900 flex items-center justify-center text-[10px] text-neutral-950 font-bold">
                    ✓
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-extrabold text-neutral-100 text-sm truncate">{prof.name}</h4>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-neutral-500" />
                    {prof.whatsapp}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="inline-block text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                      Comissão: {prof.commissionPercentage || 40}%
                    </span>
                    {prof.email && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20" title={`Login: ${prof.email}`}>
                        <UserCheck className="w-3 h-3" />
                        Login Ativo
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Specialties */}
              {prof.specialties && prof.specialties.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                    Especialidades:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {prof.specialties.map((spec, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-medium bg-neutral-950 text-neutral-300 px-2 py-0.5 rounded-lg border border-neutral-800"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-2 mt-2">
              <button
                onClick={() => openEditModal(prof)}
                className="flex-1 py-1.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
              <button
                onClick={() => handleDelete(prof.id, prof.name)}
                className="p-2 bg-neutral-950 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 rounded-xl border border-neutral-800 transition-colors"
                title="Remover profissional"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Professional Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 text-neutral-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black font-heading text-neutral-100 mb-1">
              {editingProfId ? 'Editar Profissional' : 'Cadastrar Novo Profissional'}
            </h3>
            <p className="text-xs text-neutral-400 mb-3">
              Informe a foto, dados de contato, comissão e permissões do membro da equipe.
            </p>

            <div className="mb-4 p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-[11px] text-neutral-300 flex items-center justify-between">
              <span>Hierarquia: Cadastro realizado pelo Gestor ({currentUser.name})</span>
              <span className="text-[10px] text-orange-400 font-bold uppercase">Nível Profissional</span>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-xl text-xs mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Photo selector & preview */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-orange-400" />
                  <span>Foto do Profissional</span>
                </label>

                <div className="flex items-center gap-3">
                  <AppImage
                    src={avatarUrl || PRESET_AVATARS[0]}
                    alt="Preview"
                    fallbackType="avatar"
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-orange-500 shrink-0 shadow-md"
                  />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md active:scale-95">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingPhoto ? 'Enviando Foto...' : 'Upload de Foto'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isUploadingPhoto}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                setIsUploadingPhoto(true);
                                const url = await uploadMedia(file, 'professionals');
                                setAvatarUrl(url);
                              } catch (err) {
                                console.error('Erro ao enviar foto do profissional:', err);
                              } finally {
                                setIsUploadingPhoto(false);
                              }
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      {avatarUrl && (
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Foto Carregada
                        </span>
                      )}
                    </div>
                    <input
                      type="url"
                      value={avatarUrl}
                      onChange={e => setAvatarUrl(e.target.value)}
                      placeholder="Ou cole a URL direta da imagem"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Matheus Navalha"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">WhatsApp (com DDD)</label>
                  <input
                    type="text"
                    required
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value)}
                    placeholder="(11) 98888-7777"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Comissão (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={commissionPercentage}
                      onChange={e => setCommissionPercentage(Number(e.target.value))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 pr-8"
                    />
                    <Percent className="w-3.5 h-3.5 text-neutral-500 absolute right-3 top-2.5" />
                  </div>
                </div>
              </div>

              {/* Login & Acesso do Profissional */}
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800 space-y-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-orange-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-neutral-200 block">
                      Dados de Acesso à Área de Barbeiro
                    </span>
                    <span className="text-[10px] text-neutral-400 block">
                      Credenciais para o profissional acessar seu painel de agendamentos e comandas.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                      E-mail / Usuário de Login
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Ex: matheus@barbearia.com"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-8 pr-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                      />
                      <Mail className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                      Senha de Acesso
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Definir senha de acesso"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-3 pr-8 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300 transition-colors"
                        title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Especialidades com botão + */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  Especialidades do Profissional
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={newSpecialtyInput}
                    onChange={e => setNewSpecialtyInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSpecialty();
                      }
                    }}
                    placeholder="Ex: Barba, Degradê, Nevou, Pigmentação..."
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddSpecialty}
                    className="px-3.5 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all shrink-0"
                    title="Adicionar especialidade"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar</span>
                  </button>
                </div>

                {specialties.length === 0 ? (
                  <p className="text-[11px] text-neutral-500 italic">
                    Nenhuma especialidade adicionada. Digite acima e clique em "+ Adicionar".
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-950/60 rounded-xl border border-neutral-800/80">
                    {specialties.map((spec, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1.5 bg-neutral-900 border border-neutral-700 text-neutral-200 px-2.5 py-1 rounded-xl text-xs font-medium shadow-sm"
                      >
                        <span>{spec}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSpecialty(index)}
                          className="text-neutral-400 hover:text-red-400 p-0.5 rounded transition-colors"
                          title={`Remover ${spec}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* General View Permission Toggle */}
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canViewAllProfessionals}
                    onChange={e => setCanViewAllProfessionals(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-orange-500 focus:ring-orange-500 border-neutral-700 bg-neutral-900"
                  />
                  <div>
                    <div className="text-xs font-bold text-neutral-200">
                      Permitir visualizar a agenda de toda a equipe
                    </div>
                    <div className="text-[11px] text-neutral-400 leading-relaxed mt-0.5">
                      Conforme regra, apenas 1 barbeiro líder pode ter essa permissão ativa simultaneamente.
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <SaveButton
                  isDirty={isDirty}
                  isLoading={isSaving}
                  isSaved={isSaved}
                  type="submit"
                  label={editingProfId ? 'Salvar alterações' : 'Cadastrar Profissional'}
                />
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unsaved changes confirmation for professional modal */}
      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        onContinueEditing={() => setShowUnsavedModal(false)}
        onDiscard={() => {
          setShowUnsavedModal(false);
          setShowModal(false);
          setEditingProfId(null);
          setInitialProf(null);
        }}
      />

      {/* Quick Avatar Edit Modal */}
      {showAvatarEditModal && avatarEditProf && (
        <ImageEditModal
          isOpen={showAvatarEditModal}
          onClose={() => setShowAvatarEditModal(false)}
          title={`Alterar Foto de ${avatarEditProf.name}`}
          subtitle="Faça upload de uma foto do profissional, cole um link direto ou escolha um avatar estilizado."
          currentImageUrl={avatarEditProf.avatarUrl || PRESET_AVATARS[0]}
          fallbackType="avatar"
          presets={PRESET_AVATARS.map((url, i) => ({
            label: `Barbeiro Modelo ${i + 1}`,
            url
          }))}
          onSave={handleSaveAvatar}
        />
      )}
    </div>
  );
};
