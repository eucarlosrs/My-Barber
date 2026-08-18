import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Camera,
  Pencil,
  Plus,
  Trash2,
  Heart,
  Scissors,
  Sparkles,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon
} from 'lucide-react';
import { GalleryWork } from '../../types';
import { AppImage } from '../common/AppImage';
import { ImageEditModal, ImagePreset } from '../common/ImageEditModal';

// Curated high quality haircut & beard inspirations for presets
const PRESET_HAIRCUTS: ImagePreset[] = [
  {
    label: 'Fade Médio com Risco Navalhado',
    category: 'DEGRADE',
    url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=700&auto=format&fit=crop&q=80'
  },
  {
    label: 'Barboterapia & Alinhamento Rústico',
    category: 'BARBA',
    url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=700&auto=format&fit=crop&q=80'
  },
  {
    label: 'Combo Executivo VIP (Cabelo + Barba)',
    category: 'COMBO',
    url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=700&auto=format&fit=crop&q=80'
  },
  {
    label: 'Pompadour Clássico na Tesoura',
    category: 'SOCIAL',
    url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=700&auto=format&fit=crop&q=80'
  },
  {
    label: 'Nevou / Platinado Perolado',
    category: 'PLATINADO',
    url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=700&auto=format&fit=crop&q=80'
  },
  {
    label: 'Freestyle Hair Design Geométrico',
    category: 'FREESTYLE',
    url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=700&auto=format&fit=crop&q=80'
  }
];

const MAX_GALLERY_PHOTOS = 4;

export const GalleryTab: React.FC = () => {
  const {
    galleryWorks,
    addGalleryWork,
    updateGalleryWork,
    deleteGalleryWork,
    professionals,
    services
  } = useApp();

  // Limit to exactly 4 works
  const currentWorks = galleryWorks.slice(0, MAX_GALLERY_PHOTOS);

  // Modal states
  const [editingWork, setEditingWork] = useState<GalleryWork | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleOpenEdit = (work: GalleryWork) => {
    setEditingWork(work);
    setIsCreatingNew(false);
    setShowEditModal(true);
  };

  const handleOpenCreate = () => {
    setEditingWork(null);
    setIsCreatingNew(true);
    setShowEditModal(true);
  };

  const handleSaveModal = (data: {
    imageUrl: string;
    title?: string;
    description?: string;
    category?: string;
    professionalId?: string;
  }) => {
    const prof = professionals.find(p => p.id === data.professionalId) || professionals[0];
    const srv = services.find(s => s.name.toLowerCase().includes(data.category?.toLowerCase() || ''));

    if (isCreatingNew) {
      addGalleryWork({
        title: data.title || 'Corte & Estilo Personalizado',
        category: (data.category as any) || 'DEGRADE',
        imageUrl: data.imageUrl,
        description: data.description || 'Corte executado com excelência e acabamento profissional.',
        professionalId: prof?.id || 'prof-1',
        professionalName: prof?.name || 'Mestre Barbeiro',
        serviceId: srv?.id,
        servicePrice: srv?.price || 50
      });
      setFeedback('Nova foto adicionada à galeria com sucesso!');
    } else if (editingWork) {
      updateGalleryWork(editingWork.id, {
        imageUrl: data.imageUrl,
        ...(data.title ? { title: data.title } : {}),
        ...(data.description ? { description: data.description } : {}),
        ...(data.category ? { category: data.category as any } : {}),
        ...(prof ? { professionalId: prof.id, professionalName: prof.name } : {})
      });
      setFeedback('Foto da galeria atualizada com sucesso!');
    }

    setShowEditModal(false);
    setTimeout(() => setFeedback(null), 3500);
  };

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
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black font-heading text-neutral-100">
                  Galeria & Portfólio de Destaques
                </h2>
                <span className="bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-black px-2.5 py-0.5 rounded-full">
                  {currentWorks.length} / {MAX_GALLERY_PHOTOS} Fotos
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Exibição de exatamente 4 fotos principais no aplicativo do cliente. Você pode alterar a foto, título e categoria a qualquer momento usando o botão de lápis (upload ou link).
              </p>
            </div>
          </div>
        </div>

        {currentWorks.length < MAX_GALLERY_PHOTOS && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl font-bold text-xs transition-all shadow-md active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Foto ({currentWorks.length + 1} de {MAX_GALLERY_PHOTOS})</span>
          </button>
        )}
      </div>

      {feedback && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 p-3.5 rounded-2xl text-xs flex items-center gap-2.5 shadow-lg animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-bold">{feedback}</span>
        </div>
      )}

      {/* Grid with exactly 4 slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Render existing works */}
        {currentWorks.map((work, index) => (
          <div
            key={work.id}
            className="bg-neutral-900 border border-neutral-800 hover:border-orange-500/50 rounded-2xl overflow-hidden flex flex-col group transition-all shadow-md relative"
          >
            {/* Slot indicator badge */}
            <div className="absolute top-2.5 left-2.5 z-10 bg-neutral-950/85 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-extrabold text-orange-400 border border-neutral-800 shadow-md flex items-center gap-1">
              <span>Foto {index + 1} de 4</span>
            </div>

            {/* Quick Edit Pencil Overlay on Image */}
            <div className="aspect-square relative bg-neutral-950 overflow-hidden">
              <AppImage
                src={work.imageUrl}
                alt={work.title}
                fallbackType="gallery"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />

              {/* Likes counter */}
              <div className="absolute top-2.5 right-2.5 bg-neutral-950/85 backdrop-blur-md px-2.5 py-1 rounded-full text-rose-400 flex items-center gap-1.5 text-xs font-bold border border-neutral-800">
                <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
                <span>{work.likesCount}</span>
              </div>

              {/* Direct Pencil Action Button Overlay */}
              <button
                onClick={() => handleOpenEdit(work)}
                className="absolute inset-0 bg-neutral-950/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 transition-all backdrop-blur-[2px] cursor-pointer"
                title="Clique para alterar a foto"
              >
                <div className="p-3 rounded-full bg-orange-500 text-neutral-950 shadow-xl hover:scale-110 transition-transform">
                  <Pencil className="w-5 h-5" />
                </div>
                <span className="text-xs font-black text-white bg-neutral-900/90 px-3 py-1 rounded-full border border-neutral-700">
                  Alterar Foto / Dados
                </span>
              </button>

              <div className="absolute bottom-2.5 left-2.5">
                <span className="bg-neutral-950/85 backdrop-blur-md text-orange-400 text-[10px] font-extrabold px-2 py-0.5 rounded border border-neutral-800 uppercase">
                  {work.category}
                </span>
              </div>
            </div>

            {/* Info Body */}
            <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
              <div>
                <h4 className="font-bold text-neutral-100 text-sm line-clamp-1">{work.title}</h4>
                <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{work.description}</p>
              </div>

              <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                <div className="text-[11px] text-neutral-300 truncate">
                  <span className="text-neutral-500">Barbeiro: </span>
                  <strong className="font-semibold text-neutral-200">{work.professionalName}</strong>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(work)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-neutral-950 rounded-lg text-xs font-bold transition-colors border border-orange-500/20"
                    title="Editar foto e informações"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Editar</span>
                  </button>

                  <button
                    onClick={() => deleteGalleryWork(work.id)}
                    className="text-neutral-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
                    title="Excluir este corte"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Empty slots if less than 4 */}
        {Array.from({ length: Math.max(0, MAX_GALLERY_PHOTOS - currentWorks.length) }).map((_, i) => {
          const slotNumber = currentWorks.length + i + 1;
          return (
            <button
              key={`empty-slot-${i}`}
              onClick={handleOpenCreate}
              className="bg-neutral-950/60 border-2 border-dashed border-neutral-800 hover:border-orange-500 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-all group min-h-[300px] text-center"
            >
              <div className="p-4 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-500 group-hover:text-orange-400 group-hover:border-orange-500/40 group-hover:scale-110 transition-all">
                <Plus className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-neutral-300 group-hover:text-orange-400">
                  Preencher Foto {slotNumber} de 4
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5 max-w-[150px]">
                  Upload de foto do corte ou link direto
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Edit / Create Image Modal */}
      {showEditModal && (
        <ImageEditModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title={isCreatingNew ? `Adicionar Foto (${currentWorks.length + 1} de 4)` : 'Editar Foto do Portfólio'}
          subtitle="Faça upload de foto do seu aparelho, cole um link direto ou escolha uma sugestão profissional."
          currentImageUrl={editingWork?.imageUrl || PRESET_HAIRCUTS[0].url}
          fallbackType="gallery"
          presets={PRESET_HAIRCUTS}
          onSave={() => {}}
          extraFields={{
            title: editingWork?.title || '',
            description: editingWork?.description || '',
            category: editingWork?.category || 'DEGRADE'
          }}
          onSaveWithExtra={handleSaveModal}
        />
      )}
    </div>
  );
};
