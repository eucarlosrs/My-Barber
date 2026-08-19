import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Link as LinkIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Camera,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Move,
  AlignCenter,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  RefreshCw,
  Circle,
  Square,
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
  const [localSourceData, setLocalSourceData] = useState<string | null>(null);
  const uploadedFileRef = useRef<File | null>(null);
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'URL' | 'PRESETS'>('UPLOAD');
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingAdjusted, setIsSavingAdjusted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Size and Position adjustment states
  const [zoom, setZoom] = useState<number>(1);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('contain');
  const [previewMask, setPreviewMask] = useState<'circle' | 'square' | 'wide'>(
    fallbackType === 'logo' || fallbackType === 'avatar' ? 'circle' : 'wide'
  );
  const [bgColor, setBgColor] = useState<string>('#121212');

  // Drag to pan state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; initialOffsetX: number; initialOffsetY: number }>({
    x: 0,
    y: 0,
    initialOffsetX: 0,
    initialOffsetY: 0
  });

  // Extra fields state
  const [workTitle, setWorkTitle] = useState(extraFields?.title || '');
  const [workDescription, setWorkDescription] = useState(extraFields?.description || '');
  const [workCategory, setWorkCategory] = useState(extraFields?.category || 'DEGRADE');
  const [workProfId, setWorkProfId] = useState(professionals[0]?.id || '');

  useEffect(() => {
    if (isOpen) {
      setImageUrl(currentImageUrl || '');
      setLocalSourceData(null);
      uploadedFileRef.current = null;
      setWorkTitle(extraFields?.title || '');
      setWorkDescription(extraFields?.description || '');
      setWorkCategory(extraFields?.category || 'DEGRADE');
      setWorkProfId(professionals[0]?.id || '');
      setError(null);
      setSuccessMsg(null);
      
      // Reset adjustment controls to defaults
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      setRotation(0);
      setFitMode(fallbackType === 'logo' ? 'contain' : 'cover');
      setPreviewMask(fallbackType === 'logo' || fallbackType === 'avatar' ? 'circle' : 'wide');
      setBgColor('#121212');
    }
  }, [isOpen, currentImageUrl, extraFields, fallbackType]);

  if (!isOpen) return null;

  const getTargetFolder = (): string => {
    switch (fallbackType) {
      case 'logo':
        return 'logos';
      case 'banner':
        return 'banners';
      case 'gallery':
        return 'salon_photos';
      case 'service':
        return 'services';
      case 'avatar':
        return 'avatars';
      default:
        return 'barbershop_media';
    }
  };

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
      uploadedFileRef.current = file;
      
      // Convert to base64 preview immediately so canvas never has CORS issues
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setLocalSourceData(reader.result);
          setImageUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);

      setSuccessMsg('Foto carregada com sucesso! Você pode ajustar o tamanho e posição abaixo.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError('Erro ao processar imagem: ' + (err.message || 'Tente novamente.'));
    } finally {
      setIsUploading(false);
    }
  };

  // Drag to pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: offsetX,
      initialOffsetY: offsetY
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    
    // Scale delta based on zoom level
    const factor = 0.35 / zoom;
    setOffsetX(Math.max(-100, Math.min(100, dragStartRef.current.initialOffsetX + deltaX * factor)));
    setOffsetY(Math.max(-100, Math.min(100, dragStartRef.current.initialOffsetY + deltaY * factor)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        initialOffsetX: offsetX,
        initialOffsetY: offsetY
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - dragStartRef.current.x;
    const deltaY = e.touches[0].clientY - dragStartRef.current.y;
    
    const factor = 0.4 / zoom;
    setOffsetX(Math.max(-100, Math.min(100, dragStartRef.current.initialOffsetX + deltaX * factor)));
    setOffsetY(Math.max(-100, Math.min(100, dragStartRef.current.initialOffsetY + deltaY * factor)));
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Reset adjustments
  const handleResetAdjustments = () => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setRotation(0);
    setFitMode(fallbackType === 'logo' ? 'contain' : 'cover');
  };

  // Export adjusted image using an HTML5 Canvas and upload to Firebase
  const processAndExportAdjustedImage = async (): Promise<string> => {
    const targetFolder = getTargetFolder();
    const isDefaultFit = fallbackType === 'logo' ? fitMode === 'contain' : fitMode === 'cover';
    const isUnchanged = zoom === 1 && offsetX === 0 && offsetY === 0 && rotation === 0 && isDefaultFit;

    // If no adjustments made and we have an uploaded original file, upload original directly to Firebase Storage
    if (isUnchanged && uploadedFileRef.current) {
      try {
        const cloudUrl = await uploadMedia(uploadedFileRef.current, targetFolder);
        return cloudUrl || imageUrl.trim();
      } catch {
        return imageUrl.trim();
      }
    }

    // If no adjustments and no new file, preserve current URL
    if (isUnchanged && !localSourceData) {
      return imageUrl.trim();
    }

    const sourceToRender = localSourceData || imageUrl.trim();

    return new Promise((resolve) => {
      const img = new Image();
      // If it's a remote URL, use crossOrigin
      if (!sourceToRender.startsWith('data:') && !sourceToRender.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }

      img.onload = async () => {
        try {
          const isSquare = fallbackType === 'logo' || fallbackType === 'avatar' || previewMask === 'circle' || previewMask === 'square';
          const targetWidth = isSquare ? 800 : 1200;
          const targetHeight = isSquare ? 800 : (fallbackType === 'banner' ? 675 : 800);

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(imageUrl.trim());
            return;
          }

          // Fill background color
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, targetWidth, targetHeight);

          ctx.save();
          // Translate to canvas center
          ctx.translate(targetWidth / 2, targetHeight / 2);

          // Apply rotation
          if (rotation !== 0) {
            ctx.rotate((rotation * Math.PI) / 180);
          }

          // Apply offset translation (percentage mapped to canvas)
          ctx.translate((offsetX / 100) * targetWidth, (offsetY / 100) * targetHeight);

          // Apply zoom scale
          ctx.scale(zoom, zoom);

          // Calculate draw dimensions based on fit mode
          const imgRatio = img.width / img.height;
          const canvasRatio = targetWidth / targetHeight;
          let drawW = targetWidth;
          let drawH = targetHeight;

          if (fitMode === 'contain') {
            if (imgRatio > canvasRatio) {
              drawW = targetWidth;
              drawH = targetWidth / imgRatio;
            } else {
              drawH = targetHeight;
              drawW = targetHeight * imgRatio;
            }
          } else {
            // Cover
            if (imgRatio > canvasRatio) {
              drawH = targetHeight;
              drawW = targetHeight * imgRatio;
            } else {
              drawW = targetWidth;
              drawH = targetWidth / imgRatio;
            }
          }

          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();

          // Export as high quality JPEG Blob and upload to Firebase
          canvas.toBlob(async (blob) => {
            if (!blob) {
              resolve(imageUrl.trim());
              return;
            }
            try {
              const file = new File([blob], `${fallbackType}-${Date.now()}.jpg`, { type: 'image/jpeg' });
              const uploadedUrl = await uploadMedia(file, targetFolder);
              resolve(uploadedUrl || canvas.toDataURL('image/jpeg', 0.92));
            } catch (upErr) {
              console.warn('Fallback saving canvas dataURL:', upErr);
              resolve(canvas.toDataURL('image/jpeg', 0.92));
            }
          }, 'image/jpeg', 0.92);
        } catch (canvasErr) {
          console.warn('Canvas export error:', canvasErr);
          resolve(imageUrl.trim());
        }
      };

      img.onerror = () => {
        resolve(imageUrl.trim());
      };

      img.src = sourceToRender;
    });
  };

  const handleSave = async () => {
    if (!imageUrl.trim()) {
      setError('Por favor, faça upload de uma foto ou insira a URL da imagem.');
      return;
    }

    try {
      setIsSavingAdjusted(true);
      setError(null);

      const finalUrl = await processAndExportAdjustedImage();

      if (onSaveWithExtra) {
        onSaveWithExtra({
          imageUrl: finalUrl,
          title: workTitle.trim() || undefined,
          description: workDescription.trim() || undefined,
          category: workCategory,
          professionalId: workProfId
        });
      } else {
        onSave(finalUrl);
      }

      onClose();
    } catch (err: any) {
      setError('Erro ao salvar imagem: ' + (err.message || 'Tente novamente.'));
    } finally {
      setIsSavingAdjusted(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 text-neutral-100 shadow-2xl max-h-[92vh] overflow-y-auto">
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

        {/* Live Interactive Preview Box with Drag-to-Pan */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-orange-400" />
              <span>Pré-visualização & Enquadramento Interativo</span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPreviewMask('circle')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                  previewMask === 'circle' ? 'bg-orange-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400'
                }`}
                title="Pré-visualizar como Círculo (Logo/Avatar)"
              >
                <Circle className="w-2.5 h-2.5" />
                <span>Circular</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMask('square')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                  previewMask === 'square' ? 'bg-orange-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400'
                }`}
                title="Pré-visualizar como Quadrado"
              >
                <Square className="w-2.5 h-2.5" />
                <span>Quadrado</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMask('wide')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                  previewMask === 'wide' ? 'bg-orange-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400'
                }`}
                title="Pré-visualizar em Banner Retangular"
              >
                <Maximize2 className="w-2.5 h-2.5" />
                <span>Retangular</span>
              </button>
            </div>
          </div>

          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ backgroundColor: bgColor }}
            className={`relative overflow-hidden border-2 border-orange-500/50 flex items-center justify-center select-none ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            } ${
              previewMask === 'circle'
                ? 'w-48 h-48 sm:w-56 sm:h-56 mx-auto rounded-full shadow-2xl'
                : previewMask === 'square'
                ? 'w-48 h-48 sm:w-56 sm:h-56 mx-auto rounded-3xl shadow-2xl'
                : 'w-full aspect-video rounded-2xl shadow-inner'
            }`}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Prévia"
                referrerPolicy="no-referrer"
                draggable={false}
                style={{
                  transform: `translate(${offsetX}%, ${offsetY}%) scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  objectFit: fitMode,
                  transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                }}
                className={`w-full h-full pointer-events-none transition-transform ${
                  fitMode === 'contain' ? 'object-contain' : 'object-cover'
                }`}
              />
            ) : (
              <div className="text-center p-4 text-neutral-500 text-xs">
                <Camera className="w-8 h-8 mx-auto mb-1 opacity-40" />
                Nenhuma imagem carregada
              </div>
            )}

            {/* Instruction Overlay */}
            <div className="absolute top-2 left-2 bg-neutral-950/85 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-extrabold text-orange-400 border border-neutral-800 pointer-events-none flex items-center gap-1">
              <Move className="w-2.5 h-2.5" />
              <span>ARRASTE PARA MOVER</span>
            </div>

            {/* Zoom / Scale badge */}
            {zoom !== 1 && (
              <div className="absolute bottom-2 right-2 bg-neutral-950/85 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-bold text-neutral-300 border border-neutral-800 pointer-events-none">
                Zoom: {Math.round(zoom * 100)}%
              </div>
            )}
          </div>
        </div>

        {/* Adjustment Controls Panel (Size / Zoom & Position) */}
        {imageUrl && (
          <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-neutral-200 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400" />
                <span>Ajustes de Tamanho e Posição</span>
              </span>
              <button
                type="button"
                onClick={handleResetAdjustments}
                className="text-[10px] text-neutral-400 hover:text-orange-400 flex items-center gap-1 px-2 py-1 bg-neutral-900 rounded-lg border border-neutral-800 hover:border-orange-500/40 transition-colors"
                title="Restaurar tamanho e posição original"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Resetar Ajustes</span>
              </button>
            </div>

            {/* Zoom / Size Slider */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-neutral-300 mb-1">
                <span className="flex items-center gap-1">
                  <ZoomIn className="w-3 h-3 text-orange-400" />
                  <span>Tamanho do Logo (Zoom)</span>
                </span>
                <span className="font-mono text-orange-400">{Math.round(zoom * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.max(0.4, Number((prev - 0.1).toFixed(2))))}
                  className="w-7 h-7 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-lg text-xs font-bold flex items-center justify-center border border-neutral-800 transition-colors"
                  title="Diminuir tamanho"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min="0.4"
                  max="2.5"
                  step="0.05"
                  value={zoom}
                  onChange={e => setZoom(parseFloat(e.target.value))}
                  className="flex-1 accent-orange-500 cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.min(2.5, Number((prev + 0.1).toFixed(2))))}
                  className="w-7 h-7 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-lg text-xs font-bold flex items-center justify-center border border-neutral-800 transition-colors"
                  title="Aumentar tamanho"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Position Sliders & Quick Align */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <div className="flex items-center justify-between text-[10px] font-bold text-neutral-400 mb-1">
                  <span>Posição Horizontal (X)</span>
                  <span className="font-mono text-neutral-300">{Math.round(offsetX)}%</span>
                </div>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  step="1"
                  value={offsetX}
                  onChange={e => setOffsetX(parseInt(e.target.value, 10))}
                  className="w-full accent-orange-500 cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px] font-bold text-neutral-400 mb-1">
                  <span>Posição Vertical (Y)</span>
                  <span className="font-mono text-neutral-300">{Math.round(offsetY)}%</span>
                </div>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  step="1"
                  value={offsetY}
                  onChange={e => setOffsetY(parseInt(e.target.value, 10))}
                  className="w-full accent-orange-500 cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
                />
              </div>
            </div>

            {/* Quick Action Buttons: Center, Fit Mode, Rotate, Background */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-neutral-900">
              <button
                type="button"
                onClick={() => {
                  setOffsetX(0);
                  setOffsetY(0);
                }}
                className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 rounded-lg text-[11px] font-semibold border border-neutral-800 flex items-center gap-1 transition-colors"
                title="Centralizar posição do logo"
              >
                <AlignCenter className="w-3 h-3 text-orange-400" />
                <span>Centralizar</span>
              </button>

              <button
                type="button"
                onClick={() => setFitMode(prev => prev === 'contain' ? 'cover' : 'contain')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 transition-all ${
                  fitMode === 'contain'
                    ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                }`}
                title="Alternar entre enquadrar inteiro ou preencher a tela"
              >
                {fitMode === 'contain' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                <span>{fitMode === 'contain' ? 'Logo Inteiro (Conter)' : 'Preencher (Cover)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setRotation(prev => (prev + 90) % 360)}
                className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 rounded-lg text-[11px] font-semibold border border-neutral-800 flex items-center gap-1 transition-colors"
                title="Girar 90 graus"
              >
                <RotateCw className="w-3 h-3 text-orange-400" />
                <span>Girar 90°</span>
              </button>

              {/* Background Color Quick Selector */}
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[10px] text-neutral-400 font-medium mr-1">Fundo:</span>
                {[
                  { color: '#121212', label: 'Escuro' },
                  { color: '#000000', label: 'Preto Puro' },
                  { color: '#ffffff', label: 'Branco' },
                  { color: '#262626', label: 'Grafite' }
                ].map(bg => (
                  <button
                    key={bg.color}
                    type="button"
                    onClick={() => setBgColor(bg.color)}
                    style={{ backgroundColor: bg.color }}
                    className={`w-4 h-4 rounded-full border transition-transform ${
                      bgColor === bg.color ? 'border-orange-500 scale-125 ring-1 ring-orange-500' : 'border-neutral-700'
                    }`}
                    title={`Fundo ${bg.label}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mode Selector Tabs (Upload / Link / Sugestões) */}
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
          <div className="space-y-3 mb-4">
            <label className="flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed border-neutral-700 hover:border-orange-500 rounded-2xl bg-neutral-950/60 cursor-pointer transition-all hover:bg-neutral-950 group">
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
          <div className="space-y-2 mb-4">
            <label className="block text-xs font-bold text-neutral-300">
              Cole a URL direta da imagem
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://exemplo.com/minha-foto.jpg"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 transition-colors font-mono"
            />
            <p className="text-[10px] text-neutral-500">
              Dica: você pode usar fotos do Unsplash, Imgur ou links diretos de imagem.
            </p>
          </div>
        )}

        {/* Tab 3: Presets */}
        {activeTab === 'PRESETS' && (
          <div className="space-y-2 mb-4">
            <label className="block text-xs font-bold text-neutral-300">
              Escolha uma foto profissional de alta qualidade:
            </label>
            <div className="grid grid-cols-2 gap-2.5 max-h-44 overflow-y-auto p-1">
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
          <div className="space-y-3 pt-3 border-t border-neutral-800 mb-4">
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
        <div className="flex items-center justify-between gap-3 pt-2">
          {presets && presets.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setImageUrl(presets[0].url);
                setLocalSourceData(null);
                uploadedFileRef.current = null;
                handleResetAdjustments();
                setSuccessMsg('Imagem restaurada para a demonstração padrão.');
                setTimeout(() => setSuccessMsg(null), 3000);
              }}
              disabled={isSavingAdjusted}
              className="px-3 py-2 bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-orange-400 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 border border-neutral-800 hover:border-neutral-700"
              title="Restaurar a foto padrão de demonstração"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restaurar Padrão</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSavingAdjusted}
              className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSavingAdjusted || !imageUrl}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-neutral-950 rounded-xl text-xs font-black transition-all shadow-lg active:scale-95"
            >
              {isSavingAdjusted ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>{isSavingAdjusted ? 'Processando e Salvando...' : 'Salvar Alteração'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

