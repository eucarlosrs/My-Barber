import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Camera,
  Plus,
  Trash2,
  Heart,
  Scissors,
  Sparkles,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { GalleryWork } from '../../types';
import { AppImage } from '../common/AppImage';

// Curated high quality haircut & beard inspirations
const PRESET_HAIRCUTS = [
  {
    title: 'Fade Médio com Risco Navalhado',
    category: 'DEGRADE' as const,
    url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=700&auto=format&fit=crop&q=80',
    description: 'Degradê médio com transição perfeita e acabamento a laser na navalha.'
  },
  {
    title: 'Barboterapia & Alinhamento Rústico',
    category: 'BARBA' as const,
    url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=700&auto=format&fit=crop&q=80',
    description: 'Tratamento com toalha quente, óleos essenciais e contorno desenhado.'
  },
  {
    title: 'Pompadour Clássico na Tesoura',
    category: 'SOCIAL' as const,
    url: 'https://images.unsplash.com/photo-1517832606589-7629c3395909?w=700&auto=format&fit=crop&q=80',
    description: 'Corte tradicional inglês com finalização em pomada matte.'
  },
  {
    title: 'Nevou / Platinado Perolado',
    category: 'PLATINADO' as const,
    url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=700&auto=format&fit=crop&q=80',
    description: 'Descoloração global com matização sem agredir o couro cabeludo.'
  },
  {
    title: 'Combo Executivo VIP',
    category: 'COMBO' as const,
    url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=700&auto=format&fit=crop&q=80',
    description: 'Cabelo degradê navalhado + Barboterapia completa com massagem facial.'
  },
  {
    title: 'Freestyle Hair Design Geométrico',
    category: 'FREESTYLE' as const,
    url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=700&auto=format&fit=crop&q=80',
    description: 'Linhas precisas e desenhos artísticos na lateral.'
  }
];

export const GalleryTab: React.FC = () => {
  const {
    galleryWorks,
    addGalleryWork,
    deleteGalleryWork,
    professionals,
    services,
    uploadMedia
  } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'DEGRADE' | 'BARBA' | 'COMBO' | 'SOCIAL' | 'PLATINADO' | 'FREESTYLE'>('DEGRADE');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id || '');
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('TODOS');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setError(null);
      const url = await uploadMedia(file, 'gallery_portfolio');
      setImageUrl(url);
      setUploadFeedback('Imagem enviada com sucesso!');
      setTimeout(() => setUploadFeedback(null), 3000);
    } catch (err: any) {
      setError('Erro ao enviar imagem: ' + (err.message || 'tente novamente'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateWork = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Informe o título do corte ou trabalho.');
      return;
    }
    if (!imageUrl.trim()) {
      setError('Adicione uma foto ou selecione uma sugestão.');
      return;
    }

    const prof = professionals.find(p => p.id === professionalId) || professionals[0];
    const srv = services.find(s => s.id === serviceId);

    addGalleryWork({
      title,
      category,
      imageUrl,
      description,
      professionalId: prof?.id || 'prof-1',
      professionalName: prof?.name || 'Mestre Barbeiro',
      serviceId: srv?.id,
      servicePrice: srv?.price
    });

    setShowAddModal(false);
    setTitle('');
    setImageUrl('');
    setDescription('');
    setError(null);
  };

  const filteredWorks = galleryWorks.filter(
    w => selectedFilterCategory === 'TODOS' || w.category === selectedFilterCategory
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-5 rounded-2xl shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-xl text-orange-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black font-heading text-neutral-100">
                Galeria & Portfólio de Cortes
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Fotos de trabalhos reais dos barbeiros exibidas no app dos clientes para inspiração e agendamento direto.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setShowAddModal(true);
            setImageUrl(PRESET_HAIRCUTS[0].url);
            setTitle(PRESET_HAIRCUTS[0].title);
            setCategory(PRESET_HAIRCUTS[0].category);
            setDescription(PRESET_HAIRCUTS[0].description);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl font-bold text-xs transition-colors shadow-md active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Publicar Novo Corte</span>
        </button>
      </div>

      {/* Categories Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        {[
          { id: 'TODOS', label: 'Todos os Trabalhos' },
          { id: 'DEGRADE', label: 'Degradês' },
          { id: 'BARBA', label: 'Barba & Terapia' },
          { id: 'COMBO', label: 'Combos VIP' },
          { id: 'SOCIAL', label: 'Tesoura & Clássicos' },
          { id: 'PLATINADO', label: 'Platinados' },
          { id: 'FREESTYLE', label: 'Freestyle' }
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedFilterCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedFilterCategory === cat.id
                ? 'bg-neutral-800 text-orange-400 border border-neutral-700 shadow-sm'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Works Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredWorks.map(work => (
          <div
            key={work.id}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col group hover:border-orange-500/40 transition-all shadow-md"
          >
            {/* Image Box */}
            <div className="aspect-square relative bg-neutral-950 overflow-hidden">
              <AppImage
                src={work.imageUrl}
                alt={work.title}
                fallbackType="gallery"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute top-2.5 right-2.5 bg-neutral-950/80 backdrop-blur-md px-2.5 py-1 rounded-full text-rose-400 flex items-center gap-1.5 text-xs font-bold border border-neutral-800">
                <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
                <span>{work.likesCount}</span>
              </div>
              <div className="absolute bottom-2.5 left-2.5">
                <span className="bg-neutral-950/80 backdrop-blur-md text-orange-400 text-[10px] font-extrabold px-2 py-0.5 rounded border border-neutral-800 uppercase">
                  {work.category}
                </span>
              </div>
            </div>

            {/* Info Body */}
            <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
              <div>
                <h4 className="font-bold text-neutral-100 text-sm line-clamp-1">{work.title}</h4>
                <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{work.description}</p>
              </div>

              <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                <div className="text-[11px] text-neutral-300">
                  <span className="text-neutral-500">Barbeiro: </span>
                  <strong className="font-semibold text-neutral-200">{work.professionalName}</strong>
                </div>

                <button
                  onClick={() => deleteGalleryWork(work.id)}
                  className="text-neutral-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
                  title="Remover foto da galeria"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal to Publish New Cut */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 text-neutral-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black font-heading text-neutral-100 flex items-center gap-2">
                <Camera className="w-5 h-5 text-orange-400" />
                <span>Publicar Foto na Galeria</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-neutral-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-xl text-xs mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {uploadFeedback && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3 rounded-xl text-xs mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{uploadFeedback}</span>
              </div>
            )}

            <form onSubmit={handleCreateWork} className="space-y-4">
              {/* Photo Upload & Preview */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  Foto do Corte / Trabalho
                </label>

                <div className="flex items-center gap-3 mb-3">
                  <div className="w-20 h-20 rounded-2xl bg-neutral-950 border-2 border-orange-500 overflow-hidden shrink-0">
                    <AppImage
                      src={imageUrl || PRESET_HAIRCUTS[0].url}
                      alt="Preview"
                      fallbackType="gallery"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="flex items-center justify-center gap-2 w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold cursor-pointer border border-neutral-700 transition-colors">
                      <Upload className="w-3.5 h-3.5 text-orange-400" />
                      <span>{isUploading ? 'Enviando ao Firebase...' : 'Fazer Upload do Arquivo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={e => setImageUrl(e.target.value)}
                      placeholder="Ou cole a URL da imagem aqui"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Suggestions Carousel */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-neutral-400 font-semibold uppercase">
                    Sugestões de Cortes & Barba em Alta Definição:
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESET_HAIRCUTS.map((preset, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => {
                          setImageUrl(preset.url);
                          setTitle(preset.title);
                          setCategory(preset.category);
                          setDescription(preset.description);
                        }}
                        className={`p-1.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                          imageUrl === preset.url
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                        }`}
                      >
                        <AppImage src={preset.url} alt="Preset" fallbackType="gallery" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        <span className="text-[10px] text-neutral-300 font-medium line-clamp-1">{preset.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Título do Trabalho</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Fade Navalhado + Alinhamento de Barba"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              {/* Category & Barber */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Categoria</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  >
                    <option value="DEGRADE">Degradê / Fade</option>
                    <option value="BARBA">Barba & Terapia</option>
                    <option value="COMBO">Combo VIP</option>
                    <option value="SOCIAL">Tesoura & Clássicos</option>
                    <option value="PLATINADO">Platinado / Nevou</option>
                    <option value="FREESTYLE">Freestyle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Barbeiro Responsável</label>
                  <select
                    value={professionalId}
                    onChange={e => setProfessionalId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  >
                    {professionals.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Linked Service */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Serviço Associado para Agendamento Direto</label>
                <select
                  value={serviceId}
                  onChange={e => setServiceId(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="">Nenhum (Apenas foto de inspiração)</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} - R$ {s.price.toFixed(2).replace('.', ',')} ({s.durationMinutes} min)
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Descrição / Detalhes da Técnica</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Ex: Realizado com técnica de pente corrido e toalha quente aromática."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 text-xs font-black rounded-xl shadow-lg active:scale-95"
                >
                  Publicar na Galeria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
