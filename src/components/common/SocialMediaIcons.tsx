import React from 'react';

interface SocialIconProps {
  className?: string;
  size?: number;
}

export const InstagramIcon: React.FC<SocialIconProps> = ({ className = '', size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

export const FacebookIcon: React.FC<SocialIconProps> = ({ className = '', size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

export const TikTokIcon: React.FC<SocialIconProps> = ({ className = '', size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.46 6.27 6.27 0 0 0 1.88-4.48V7.95a8.28 8.28 0 0 0 4.85 1.56v-3.5a4.84 4.84 0 0 1-1-.02z" />
  </svg>
);

export const formatSocialUrl = (url: string, platform: 'instagram' | 'facebook' | 'tiktok'): string => {
  if (!url || !url.trim()) return '';
  const clean = url.trim();
  
  // If it's already a full URL, return it
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }
  
  // Clean handle without '@'
  const handle = clean.startsWith('@') ? clean.slice(1) : clean;
  
  if (platform === 'instagram') {
    return `https://instagram.com/${handle}`;
  }
  if (platform === 'facebook') {
    return `https://facebook.com/${handle}`;
  }
  if (platform === 'tiktok') {
    return `https://tiktok.com/@${handle}`;
  }
  
  return `https://${clean}`;
};
