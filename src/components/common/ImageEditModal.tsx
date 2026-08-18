import React, { useState, useEffect } from 'react';
import {
  Upload,
  Link as LinkIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import { AppImage } from './AppImage';
import { useApp } from '../../context/AppContext';

export interface ImagePreset {
  label: string;
  url: string;
  category?: string;
}

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  currentImageUrl: string;
  fallbackType?: 'gallery' | 'avatar' | 'logo' | 'banner' | 'service';
  presets?: ImagePreset[];
  onSave: (newUrl: string, additionalData?: any) => void;
  // Optional extra fields for gallery works
  extraFields?: {
    title?: string;
    description?: string;
    category?: string;
    professionalName?: string;
    servicePrice?: number;
  };
  onSaveWithExtra?: (data: {
    imageUrl: string;
    title?: string;
    description?: string;
    category?: string;
    professionalId?: string;
  }) => void;
}

export const ImageEditModal: React.FC<ImageEditModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle = 'Faça upload de uma foto do seu dispositivo, cole um link direto ou escolha uma sugestão profissional.',
  currentImageUrl,
  fallbackType = 'gallery',
  presets = [],
  onSave,
  extraFields,
  onSaveWithExtra
}) => {
  const { uploadMedia, professionals } = useApp();

  const [imageUrl, setImageUrl] = useState(currentImageUrl || '');
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'URL' | 'PRESETS'>('UPLOAD');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Extra fields state
  const [workTitle, setWorkTitle] = useState(extraFields?.title || '');
  const [workDescription, setWorkDescription] = useState(extraFields?.description || '');
  const [workCategory, setWorkCategory] = useState(extraFields?.category || 'DEGRADE');
  const [workProfId, setWorkProfId] = useState(professionals[0]?.id || '');

  useEffect(() => {
    if (isOpen) {
      setImageUrl(currentImageUrl || '');
      setWorkTitle(extraFields?.title || '');
      setWorkDescription(extraFields?.description || '');
      setWorkCategory(extraFields?.category || 'DEGRADE');
      setWorkProfId(professionals[0]?.id || '');
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, currentImageUrl, extraFields]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (< 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('A foto selecionada é muito pesada (máx 10MB). Escolha outra imagem.');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      
      // Convert to base64 preview immediately for 100% responsiveness
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImageUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);

      // Also try to upload to Firebase storage in background
      try {
        const cloudUrl = await uploadMedia(file, 'user_uploads');
        if (cloudUrl) {
          setImageUrl(cloudUrl);
        }
      } catch (cloudErr) {
        console.warn('Storage upload fallback to base64 data url:', cloudErr);
      }

      setSuccessMsg('Foto carregada com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError('Erro ao processar imagem: ' + (err.message || 'Tente novamente.'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = () => {
    if (!imageUrl.trim()) {
      setError('Por favor, faça upload de uma foto ou insira a URL da imagem.');
      return;
    }

    if (onSaveWithExtra) {
      onSaveWithExtra({
        imageUrl: imageUrl.trim(),
        title: workTitle.trim() || undefined,
        description: workDescription.trim() || undefined,
        category: workCategory,
        professionalId: workProfId
      });
    } else {
      onSave(imageUrl.trim());
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 text-neutral-100 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-black font-heading text-neutral-100 flex items-center gap-2">
              <Camera className="w-5 h-5 text-orange-400" />
              <span>{title}</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 p-1.5 rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-2xl text-xs mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3 rounded-2xl text-xs mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Live Preview Box */}
        <div className="mb-5">
          <label className="block text-xs font-bold text-neutral-300 mb-1.5">
            Pré-visualização da Imagem
          </label>
          <div className="relative rounded-2xl overflow-hidden bg-neutral-950 border-2 border-orange-500/50 aspect-video flex items-center justify-center shadow-inner">
            <AppImage
              src={imageUrl}
              alt="Prévia"
              fallbackType={fallbackType}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2.5 left-2.5 bg-neutral-950/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-extrabold text-orange-400 border border-neutral-800">
              PRÉVIA EM TEMPO REAL
            </div>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-neutral-950 border border-neutral-800 rounded-2xl mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('UPLOAD')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'UPLOAD'
                ? 'bg-orange-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Fazer Upload</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('URL')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'URL'
                ? 'bg-orange-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Link / URL</span>
          </button>

          {presets.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('PRESETS')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'PRESETS'
                  ? 'bg-orange-500 text-neutral-950 shadow-md'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sugestões</span>
            </button>
          )}
        </div>

        {/* Tab 1: Upload */}
        {activeTab === 'UPLOAD' && (
          <div className="space-y-3 mb-5">
            <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-neutral-700 hover:border-orange-500 rounded-2xl bg-neutral-950/60 cursor-pointer transition-all hover:bg-neutral-950 group">
              <div className="p-3 rounded-full bg-neutral-900 group-hover:bg-orange-500/10 text-neutral-400 group-hover:text-orange-400 transition-colors">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-neutral-200 group-hover:text-orange-400">
                  {isUploading ? 'Processando foto...' : 'Clique para selecionar foto do celular ou PC'}
                </span>
                <p className="text-[10px] text-neutral-500 mt-0.5">Formatos JPG, PNG, WEBP suportados</p>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Tab 2: URL */}
        {activeTab === 'URL' && (
          <div className="space-y-2 mb-5">
            <label className="block text-xs font-bold text-neutral-300">
              Cole a URL direta da imagem
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://exemplo.com/minha-foto.jpg"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <p className="text-[10px] text-neutral-500">
              Dica: você pode usar fotos do Unsplash, Imgur ou links do seu site.
            </p>
          </div>
        )}

        {/* Tab 3: Presets */}
        {activeTab === 'PRESETS' && (
          <div className="space-y-2 mb-5">
            <label className="block text-xs font-bold text-neutral-300">
              Escolha uma foto profissional de alta qualidade:
            </label>
            <div className="grid grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-1">
              {presets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setImageUrl(preset.url);
                    if (preset.label && onSaveWithExtra && !workTitle) {
                      setWorkTitle(preset.label);
                    }
                  }}
                  className={`p-2 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                    imageUrl === preset.url
                      ? 'bg-orange-500/10 border-orange-500 text-orange-300 ring-1 ring-orange-500'
                      : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-400'
                  }`}
                >
                  <AppImage
                    src={preset.url}
                    alt={preset.label}
                    fallbackType={fallbackType}
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                  <div className="overflow-hidden">
                    <div className="text-[11px] font-bold truncate text-neutral-200">{preset.label}</div>
                    {preset.category && (
                      <div className="text-[9px] text-orange-400 font-semibold">{preset.category}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Optional Extra Fields for Gallery / Services */}
        {onSaveWithExtra && (
          <div className="space-y-3 pt-3 border-t border-neutral-800 mb-5">
            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">
                Título do Corte / Trabalho
              </label>
              <input
                type="text"
                value={workTitle}
                onChange={e => setWorkTitle(e.target.value)}
                placeholder="Ex: High Fade Navalhado & Barboterapia"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Categoria
                </label>
                <select
                  value={workCategory}
                  onChange={e => setWorkCategory(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="DEGRADE">Degradê</option>
                  <option value="BARBA">Barba & Terapia</option>
                  <option value="COMBO">Combo VIP</option>
                  <option value="SOCIAL">Tesoura & Clássico</option>
                  <option value="PLATINADO">Platinado / Nevou</option>
                  <option value="FREESTYLE">Freestyle Art</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Barbeiro Responsável
                </label>
                <select
                  value={workProfId}
                  onChange={e => setWorkProfId(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                >
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">
                Descrição ou Dica de Estilo
              </label>
              <textarea
                rows={2}
                value={workDescription}
                onChange={e => setWorkDescription(e.target.value)}
                placeholder="Detalhes sobre a técnica, produtos utilizados e finalização."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black transition-all shadow-lg active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Salvar Alteração</span>
          </button>
        </div>
      </div>
    </div>
  );
};
