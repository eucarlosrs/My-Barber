import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular' | 'card';
  height?: string | number;
  width?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  height,
  width,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full';
      case 'text':
        return 'rounded-md h-4';
      case 'card':
        return 'rounded-2xl';
      default:
        return 'rounded-xl';
    }
  };

  return (
    <div
      className={`relative overflow-hidden bg-neutral-800/60 ${getVariantStyles()} ${className}`}
      style={{
        height: height,
        width: width,
      }}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-neutral-700/30 to-transparent" />
    </div>
  );
};

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton variant="circular" className="w-10 h-10" />
            <Skeleton variant="text" className="w-20 h-4" />
          </div>
          <div className="space-y-2">
            <Skeleton variant="text" className="w-3/4 h-5" />
            <Skeleton variant="text" className="w-1/2 h-4" />
          </div>
          <div className="pt-2 flex items-center justify-between border-t border-neutral-800/80">
            <Skeleton variant="text" className="w-24 h-4" />
            <Skeleton variant="rectangular" className="w-16 h-8 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="bg-neutral-900 border border-neutral-800/80 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-2/3">
            <Skeleton variant="circular" className="w-9 h-9 shrink-0" />
            <div className="space-y-1.5 w-full">
              <Skeleton variant="text" className="w-2/5 h-4" />
              <Skeleton variant="text" className="w-3/5 h-3" />
            </div>
          </div>
          <Skeleton variant="rectangular" className="w-20 h-7 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  );
};
