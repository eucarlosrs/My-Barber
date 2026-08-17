import React, { useState } from 'react';
import { Smartphone, Monitor, Wifi, Battery, Signal, Sparkles } from 'lucide-react';

interface PhoneFrameProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  barbershopName: string;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  title,
  subtitle,
  children,
  barbershopName
}) => {
  const [deviceMode, setDeviceMode] = useState<'MOBILE' | 'FULL'>('MOBILE');

  return (
    <div className="w-full min-h-[calc(100vh-100px)] py-2 sm:py-6 px-1 sm:px-4 flex flex-col items-center bg-neutral-950">
      {/* Top Device Viewport Switcher Toolbar */}
      <div className="w-full max-w-md sm:max-w-4xl flex items-center justify-between gap-2 mb-3 sm:mb-4 bg-neutral-900/90 border border-neutral-800/80 rounded-2xl px-3 sm:px-4 py-2 text-xs backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
          <span className="font-bold text-neutral-200 truncate text-xs">{barbershopName}</span>
          <span className="text-neutral-500 hidden md:inline">•</span>
          <span className="text-neutral-400 hidden md:inline text-[11px] truncate">{title}</span>
        </div>

        <div className="flex items-center bg-neutral-950 p-1 rounded-xl border border-neutral-800 shrink-0">
          <button
            onClick={() => setDeviceMode('MOBILE')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg font-bold text-xs transition-all ${
              deviceMode === 'MOBILE'
                ? 'bg-orange-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">App Celular</span>
            <span className="xs:hidden">App</span>
          </button>
          <button
            onClick={() => setDeviceMode('FULL')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg font-bold text-xs transition-all ${
              deviceMode === 'FULL'
                ? 'bg-orange-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Tela Cheia</span>
            <span className="xs:hidden">Cheia</span>
          </button>
        </div>
      </div>

      {/* Main Container: Mobile Chassis or Expanded View */}
      {deviceMode === 'MOBILE' ? (
        <div className="relative w-full max-w-[430px] rounded-3xl sm:rounded-[44px] bg-neutral-900 border-2 sm:border-[7px] border-neutral-800 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden transition-all duration-300 ring-1 ring-neutral-700/50">
          {/* Smartphone Hardware Notch / Dynamic Island (hidden on small mobile to maximize native screen) */}
          <div className="hidden sm:flex absolute top-0 inset-x-0 h-11 bg-neutral-950 z-40 items-center justify-between px-7 text-[11px] font-semibold text-neutral-300 select-none">
            <span>14:30</span>
            <div className="w-24 h-5 bg-neutral-900 rounded-full flex items-center justify-center border border-neutral-800/80">
              <div className="w-2.5 h-2.5 rounded-full bg-neutral-950 border border-neutral-800 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-blue-500/80"></div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-300">
              <Signal className="w-3 h-3 text-neutral-300" />
              <Wifi className="w-3 h-3 text-neutral-300" />
              <Battery className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* Smartphone Inner Screen Content */}
          <div className="pt-0 sm:pt-11 bg-neutral-950 min-h-[600px] sm:min-h-[780px] max-h-[calc(100vh-140px)] sm:max-h-[860px] overflow-y-auto custom-scrollbar flex flex-col">
            {children}
          </div>

          {/* Smartphone Home Indicator Bar */}
          <div className="hidden sm:flex absolute bottom-1 inset-x-0 h-4 items-center justify-center pointer-events-none z-40 bg-gradient-to-t from-neutral-950 to-transparent">
            <div className="w-32 h-1 bg-neutral-600/60 rounded-full"></div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-4xl bg-neutral-950 rounded-2xl sm:rounded-3xl border border-neutral-800/80 shadow-2xl overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
};
