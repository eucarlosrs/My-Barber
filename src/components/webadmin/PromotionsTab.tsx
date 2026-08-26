import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Tag,
  Plus,
  Percent,
  Calendar,
  CheckCircle2,
  XCircle,
  Trash2,
  Edit2,
  Flame,
  ToggleLeft,
  ToggleRight,
  Camera,
  Scissors,
  Copy,
  Check
} from 'lucide-react';
import { Promotion } from '../../types';
import { AppImage } from '../common/AppImage';

const PRESET_PROMO_IMAGES = [
  'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80'
];

export const PromotionsTab: React.FC = () => {
  const {
    promotions,
    services,
    createPromotion,
    updatePromotion,
    togglePromotionActive,
    deletePromotion,
    currentBarbershop
  } = useApp();

  const [showModal, setShowModal] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState<number>(20);
  const [serviceId, setServiceId] = useState<string>('ALL');
  const [code, setCode] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [imageUrl, setImageUrl] = useState(PRESET_PROMO_IMAGES[0]);
  const [showInHighlights, setShowInHighlights] = useState(true);
  const [highlightTag, setHighlightTag] = useState('PROMOÇÃO');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingPromoId(null);
    setTitle('');
    setDescription('');
    setDiscountPercentage(20);
    setServiceId('ALL');
    setCode('PROMO' + Math.floor(10 + Math.random() * 90));
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    setValidUntil(nextMonth.toISOString().split('T')[0]);
    setImageUrl(PRESET_PROMO_IMAGES[0]);
    setShowInHighlights(true);
    setHighlightTag('PROMOÇÃO');
    setShowModal(true);
  };

  const openEditModal = (promo: Promotion) => {
    setEditingPromoId(promo.id);
    setTitle(promo.title);
    setDescription(promo.description);
    setDiscountPercentage(promo.discountPercentage || 0);
    setServiceId(promo.serviceId || 'ALL');
    setCode(promo.code || '');
    setValidUntil(promo.validUntil || '');
    setImageUrl(promo.imageUrl || PRESET_PROMO_IMAGES[0]);
    setShowInHighlights(promo.showInHighlights !== false);
    setHighlightTag(promo.highlightTag || 'PROMOÇÃO');
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const matchedService = services.find(s => s.id === serviceId);

    if (editingPromoId) {
      updatePromotion(editingPromoId, {
        title: title.trim(),
        description: description.trim(),
        discountPercentage,
        serviceId: serviceId !== 'ALL' ? serviceId : undefined,
        serviceName: matchedService ? matchedService.name : undefined,
        code: code.trim().toUpperCase() || undefined,
        validUntil: validUntil || undefined,
        showInHighlights,
        highlightTag: highlightTag.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined
      });
    } else {
      createPromotion({
        tenantId: currentBarbershop.id,
        title: title.trim(),
        description: description.trim(),
        discountPercentage,
        serviceId: serviceId !== 'ALL' ? serviceId : undefined,
        serviceName: matchedService ? matchedService.name : undefined,
        code: code.trim().toUpperCase() || undefined,
        validUntil: validUntil || undefined,
        active: true,
        showInHighlights,
        highlightTag: highlightTag.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined
      });
    }

    setShowModal(false);
  };

  const handleCopyCode = (promoCode: string) => {
    navigator.clipboard?.writeText(promoCode);
    setCopiedCode(promoCode);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-neutral-100 text-lg font-heading flex items-center gap-2">
            <Tag className="w-5 h-5 text-orange-500" />
            Controle de Promoções & Cupons da Barbearia
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Crie campanhas de desconto, cupons promocionais e impulsione horários de menor movimento.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black flex items-center gap-2 shadow-md active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Nova Promoção</span>
        </button>
      </div>

      {/* Promotions List Grid */}
      {promotions.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-neutral-400">
          <Tag className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
          <p className="text-xs font-semibold">Nenhuma promoção cadastrada ainda.</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Clique no botão acima para criar sua primeira oferta e atrair mais clientes!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {promotions.map(promo => {
            const isExpired = promo.validUntil && new Date(promo.validUntil) < new Date();

            return (
              <div
                key={promo.id}
                className={`bg-neutral-900 border rounded-2xl overflow-hidden flex flex-col justify-between transition-all shadow-lg ${
                  promo.active && !isExpired
                    ? 'border-neutral-800 hover:border-neutral-700'
                    : 'border-neutral-800/60 opacity-70'
                }`}
              >
                {/* Promo Image */}
                <div className="h-36 relative bg-neutral-950">
                  <AppImage
                    src={promo.imageUrl || PRESET_PROMO_IMAGES[0]}
                    alt={promo.title}
                    fallbackType="banner"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/30 to-transparent" />

                  {/* Status Badge & Highlight Tag */}
                  <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                    {promo.active && !isExpired ? (
                      <span className="bg-emerald-500 text-neutral-950 font-black text-[9px] px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow">
                        ATIVA NO APP
                      </span>
                    ) : isExpired ? (
                      <span className="bg-red-500 text-white font-black text-[9px] px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow">
                        EXPIRADA
                      </span>
                    ) : (
                      <span className="bg-neutral-800 text-neutral-400 font-black text-[9px] px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow">
                        PAUSADA
                      </span>
                    )}

                    {promo.showInHighlights && (
                      <span className="bg-amber-400 text-neutral-950 font-black text-[9px] px-2 py-0.5 rounded-lg flex items-center gap-0.5 shadow">
                        <Flame className="w-2.5 h-2.5" />
                        NO DESTAQUE
                      </span>
                    )}
                  </div>

                  {/* Discount pill */}
                  {promo.discountPercentage && (
                    <div className="absolute top-3 right-3 bg-orange-500 text-neutral-950 font-black text-xs px-2.5 py-1 rounded-xl shadow-lg flex items-center gap-1">
                      <Percent className="w-3.5 h-3.5" />
                      <span>{promo.discountPercentage}% OFF</span>
                    </div>
                  )}

                  <div className="absolute bottom-2 left-4 right-4">
                    <h4 className="font-extrabold text-white text-sm truncate drop-shadow-md">
                      {promo.title}
                    </h4>
                  </div>
                </div>

                {/* Promo Content */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-300 leading-relaxed line-clamp-2">
                      {promo.description}
                    </p>

                    {promo.serviceName && (
                      <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                        <Scissors className="w-3.5 h-3.5 text-orange-400" />
                        <span>Válido para: <strong>{promo.serviceName}</strong></span>
                      </div>
                    )}

                    {/* Direct Booking Rule */}
                    <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                          <Tag className="w-3 h-3" />
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-neutral-500 block">Aplicação:</span>
                          <span className="text-xs font-bold text-neutral-200">Desconto Direto no App</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        Automático
                      </span>
                    </div>

                    {promo.validUntil && (
                      <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-neutral-500" />
                        <span>Válido até: <strong className="text-neutral-200">{promo.validUntil.split('-').reverse().join('/')}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Actions & Switch */}
                  <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => togglePromotionActive(promo.id)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          promo.active
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                        }`}
                      >
                        {promo.active ? 'Ativa' : 'Pausada'}
                      </button>

                      <button
                        onClick={() => updatePromotion(promo.id, { showInHighlights: !promo.showInHighlights })}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          promo.showInHighlights
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-neutral-950 text-neutral-500 border border-neutral-800 hover:text-neutral-300'
                        }`}
                        title="Alternar se esta promoção aparece na vitrine de destaques no topo do app do cliente"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{promo.showInHighlights ? 'No Destaque' : '+ Destaque'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(promo)}
                        className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs transition-colors"
                        title="Editar Promoção"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          if (window.confirm('Deseja excluir esta promoção?')) {
                            deletePromotion(promo.id);
                          }
                        }}
                        className="p-2 bg-neutral-950 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 rounded-xl border border-neutral-800 transition-colors"
                        title="Excluir Promoção"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 text-neutral-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black font-heading text-neutral-100 mb-1">
              {editingPromoId ? 'Editar Promoção' : 'Criar Nova Promoção'}
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              Configure os detalhes da oferta que aparecerão para os clientes na área logada.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Título da Promoção</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Quarta do Bigode: 20% OFF"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Agende seu corte ou barba e aproveite o desconto especial do dia!"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Desconto (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={discountPercentage}
                    onChange={e => setDiscountPercentage(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Código do Cupom</label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    placeholder="Ex: TERCA20"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Serviço Aplicável</label>
                  <select
                    value={serviceId}
                    onChange={e => setServiceId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  >
                    <option value="ALL">Todos os Serviços</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (R$ {s.price.toFixed(2).replace('.', ',')})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Data de Validade</label>
                  <input
                    type="date"
                    required
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
              </div>

              {/* Image selector */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-orange-400" />
                  Imagem da Promoção
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="URL da foto da promoção"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 mb-2"
                />
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {PRESET_PROMO_IMAGES.map((url, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setImageUrl(url)}
                      className={`w-16 h-12 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                        imageUrl === url ? 'border-orange-500 ring-2 ring-orange-500/40 scale-105' : 'border-neutral-800 opacity-60'
                      }`}
                    >
                      <AppImage src={url} alt="Preset" fallbackType="banner" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Destaque no App do Cliente */}
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800/90 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="text-xs font-bold text-neutral-200">Exibir nos Destaques do App</div>
                      <div className="text-[11px] text-neutral-400">Aparecer na vitrine superior para todos os clientes</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showInHighlights}
                    onChange={e => setShowInHighlights(e.target.checked)}
                    className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
                  />
                </label>

                {showInHighlights && (
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                      Etiqueta do Destaque
                    </label>
                    <input
                      type="text"
                      value={highlightTag}
                      onChange={e => setHighlightTag(e.target.value.toUpperCase())}
                      placeholder="Ex: PROMOÇÃO, OFERTA VIP, NOVIDADE"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-400 uppercase font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black shadow-md"
                >
                  {editingPromoId ? 'Salvar Alterações' : 'Publicar Promoção'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
