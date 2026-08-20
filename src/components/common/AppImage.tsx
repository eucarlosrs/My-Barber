import React, { useState, useEffect } from 'react';
import { APP_ASSETS } from '../../data/assets';

interface AppImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackType?: 'avatar' | 'logo' | 'banner' | 'service' | 'product' | 'story' | 'gallery';
  customFallback?: string;
}

// Local authentic photo assets that render 100% reliably without external requests
const LOCAL_PHOTO_FALLBACKS: Record<string, string> = {
  logo: APP_ASSETS.logo,
  banner: APP_ASSETS.banner,
  avatar: APP_ASSETS.barberFelipe,
  service: APP_ASSETS.haircutFade,
  product: APP_ASSETS.products,
  story: APP_ASSETS.haircutFade,
  gallery: APP_ASSETS.haircutFade
};

// Crisp inline SVG fallbacks that render reliably if everything fails
const DEFAULT_SVG_FALLBACKS: Record<string, string> = {
  logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none"><rect width="200" height="200" rx="32" fill="%23171717"/><circle cx="100" cy="100" r="70" stroke="%23F97316" stroke-width="4" fill="%23262626"/><circle cx="100" cy="85" r="28" fill="%23F97316"/><path d="M55 150C55 125 75 115 100 115C125 115 145 125 145 150" fill="%23F97316"/><text x="100" y="180" fill="%23F97316" font-family="sans-serif" font-size="13" font-weight="900" text-anchor="middle">MY BARBER</text></svg>',
  banner: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" viewBox="0 0 800 300" fill="none"><rect width="800" height="300" fill="%23171717"/><rect width="800" height="300" fill="url(%23g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="800" y2="300" gradientUnits="userSpaceOnUse"><stop stop-color="%23262626"/><stop offset="1" stop-color="%23121212"/></linearGradient></defs><circle cx="400" cy="130" r="50" fill="%23262626" stroke="%23F97316" stroke-width="3"/><circle cx="400" cy="115" r="20" fill="%23F97316"/><path d="M370 160C370 145 385 138 400 138C415 138 430 145 430 160" fill="%23F97316"/><text x="400" y="225" fill="%23D4D4D4" font-family="sans-serif" font-size="16" font-weight="800" text-anchor="middle">BARBEARIA PREMIUM</text><text x="400" y="250" fill="%23737373" font-family="sans-serif" font-size="12" font-weight="600" text-anchor="middle">AMBIENTE EXCLUSIVO</text></svg>',
  avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none"><rect width="200" height="200" rx="36" fill="%231E1E1E"/><circle cx="100" cy="80" r="38" fill="%23F97316"/><path d="M40 170C40 132 68 118 100 118C132 118 160 132 160 170" fill="%23F97316"/><rect x="2" y="2" width="196" height="196" rx="34" stroke="%23333333" stroke-width="3"/></svg>',
  service: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" fill="none"><rect width="400" height="300" fill="%231E1E1E"/><circle cx="200" cy="130" r="45" fill="%232A2A2A" stroke="%23F97316" stroke-width="3"/><circle cx="200" cy="115" r="18" fill="%23F97316"/><path d="M175 155C175 142 188 136 200 136C212 136 225 142 225 155" fill="%23F97316"/><text x="200" y="225" fill="%23E5E5E5" font-family="sans-serif" font-size="16" font-weight="800" text-anchor="middle">SERVIÇO ESPECIALIZADO</text></svg>',
  product: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" fill="none"><rect width="400" height="300" fill="%231E1E1E"/><rect x="150" y="75" width="100" height="130" rx="16" fill="%232A2A2A" stroke="%23F97316" stroke-width="3"/><text x="200" y="145" fill="%23F97316" font-family="sans-serif" font-size="14" font-weight="900" text-anchor="middle">PRODUTO</text><text x="200" y="240" fill="%23E5E5E5" font-family="sans-serif" font-size="15" font-weight="800" text-anchor="middle">COSMÉTICO PREMIUM</text></svg>',
  story: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none"><rect width="200" height="200" rx="100" fill="%231E1E1E"/><circle cx="100" cy="100" r="45" fill="%232A2A2A" stroke="%23F97316" stroke-width="3"/><circle cx="100" cy="90" r="16" fill="%23F97316"/><path d="M78 128C78 116 88 110 100 110C112 110 122 116 122 128" fill="%23F97316"/></svg>',
  gallery: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" fill="none"><rect width="400" height="400" fill="%231E1E1E"/><circle cx="200" cy="170" r="65" fill="%232A2A2A" stroke="%23F97316" stroke-width="3"/><circle cx="200" cy="150" r="26" fill="%23F97316"/><path d="M165 210C165 192 180 184 200 184C220 184 235 192 235 210" fill="%23F97316"/><text x="200" y="280" fill="%23E5E5E5" font-family="sans-serif" font-size="16" font-weight="800" text-anchor="middle">CORTE EXCLUSIVO</text></svg>'
};

export const AppImage: React.FC<AppImageProps> = ({
  src,
  alt,
  fallbackType = 'avatar',
  customFallback,
  className = '',
  onError,
  onLoad,
  ...props
}) => {
  const [errorCount, setErrorCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setErrorCount(0);
    setIsLoaded(false);
  }, [src]);

  // Determine current active source based on error stage
  let activeSrc = src;
  if (!activeSrc) {
    activeSrc = customFallback || LOCAL_PHOTO_FALLBACKS[fallbackType] || DEFAULT_SVG_FALLBACKS[fallbackType] || DEFAULT_SVG_FALLBACKS.avatar;
  } else if (errorCount === 1) {
    activeSrc = LOCAL_PHOTO_FALLBACKS[fallbackType] || customFallback || DEFAULT_SVG_FALLBACKS[fallbackType] || DEFAULT_SVG_FALLBACKS.avatar;
  } else if (errorCount >= 2) {
    activeSrc = customFallback || DEFAULT_SVG_FALLBACKS[fallbackType] || DEFAULT_SVG_FALLBACKS.avatar;
  }

  return (
    <img
      src={activeSrc}
      alt={alt || 'Imagem'}
      referrerPolicy="no-referrer"
      loading="lazy"
      onLoad={(e) => {
        setIsLoaded(true);
        if (onLoad) {
          onLoad(e);
        }
      }}
      onError={(e) => {
        setErrorCount(prev => prev + 1);
        if (onError) {
          onError(e);
        }
      }}
      className={`${className} transition-opacity duration-300 ${isLoaded || errorCount > 0 ? 'opacity-100' : 'opacity-90'}`}
      {...props}
    />
  );
};
