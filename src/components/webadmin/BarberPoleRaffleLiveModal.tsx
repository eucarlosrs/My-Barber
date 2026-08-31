import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Trophy,
  Scissors,
  Sparkles,
  Phone,
  CheckCircle2,
  X,
  Volume2,
  VolumeX,
  RefreshCw,
  Play
} from 'lucide-react';
import { Raffle, BarbershopThemeId } from '../../types';
import { AppImage } from '../common/AppImage';
import { BarbershopCelebration } from '../common/BarbershopCelebration';

// ============================================================================
// 3D HELICAL CYLINDER BARBER POLE CANVAS COMPONENT (FULL RESPONSIVE FIT)
// ============================================================================
interface BarberPoleCanvasProps {
  speedMultiplier: number;
}

const BarberPoleCanvas: React.FC<BarberPoleCanvasProps> = ({
  speedMultiplier,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const rotationRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let width = container.clientWidth || 150;
    let height = container.clientHeight || 250;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina support
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const W = canvas.width;
    const H = canvas.height;
    const radius = W / 2;
    const numHelixes = 2.8;

    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    // Precalculate cylinder X mapping and 3D lighting for all pixels across width
    const xToAngle = new Float32Array(W);
    const xShade = new Float32Array(W);
    const xValid = new Uint8Array(W);

    for (let x = 0; x < W; x++) {
      const u = (x - radius) / radius;
      if (Math.abs(u) <= 0.999) {
        xValid[x] = 1;
        const angle = Math.asin(u);
        xToAngle[x] = angle;
        // 3D cylindrical lighting (diffuse + specular highlight + soft cylindrical falloff)
        const cosAngle = Math.cos(angle);
        const diffuse = cosAngle * 0.72;
        const spec = Math.pow(Math.max(0, Math.cos(angle - 0.35)), 8) * 0.4;
        const edgeShadow = Math.pow(cosAngle, 0.45);
        xShade[x] = Math.min(1.2, Math.max(0.18, (0.3 + diffuse + spec) * edgeShadow));
      } else {
        xValid[x] = 0;
      }
    }

    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Update vertical spin
      rotationRef.current += dt * speedMultiplier * 4.0;
      const rotation = rotationRef.current;
      const twoPi = Math.PI * 2;

      let p = 0;
      for (let y = 0; y < H; y++) {
        // Helical pitch offset based on vertical Y
        const yOffset = (y / H) * (numHelixes * twoPi) - rotation;

        for (let x = 0; x < W; x++) {
          if (xValid[x] === 0) {
            data[p] = 0;
            data[p + 1] = 0;
            data[p + 2] = 0;
            data[p + 3] = 0;
            p += 4;
            continue;
          }

          const angle = xToAngle[x];
          let totalAngle = (angle + yOffset) % twoPi;
          if (totalAngle < 0) totalAngle += twoPi;

          // Standard 4-band Barber Pole sequence: RED -> WHITE -> BLUE -> WHITE
          const band = (totalAngle / (Math.PI / 2)) % 4;
          let r = 255;
          let g = 255;
          let b = 255;

          if (band < 1) {
            // CLASSIC VIBRANT BARBER RED
            r = 225;
            g = 30;
            b = 30;
          } else if (band < 2) {
            // CLEAN CRISP WHITE
            r = 250;
            g = 252;
            b = 255;
          } else if (band < 3) {
            // CLASSIC DEEP ROYAL BARBER BLUE
            r = 28;
            g = 90;
            b = 220;
          } else {
            // CLEAN CRISP WHITE
            r = 250;
            g = 252;
            b = 255;
          }

          const shade = xShade[x];

          data[p] = Math.min(255, r * shade);
          data[p + 1] = Math.min(255, g * shade);
          data[p + 2] = Math.min(255, b * shade);
          data[p + 3] = 255;
          p += 4;
        }
      }

      ctx.putImageData(imgData, 0, 0);

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [speedMultiplier]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none rounded-xl"
      />
    </div>
  );
};

// ============================================================================
// MODAL COMPONENT
// ============================================================================
interface BarberPoleRaffleLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  raffle: Raffle;
  eligibleClients: Array<{ id: string; name: string; whatsapp?: string; avatarUrl?: string }>;
  barbershopName: string;
  barbershopLogo?: string;
  barbershopTheme?: BarbershopThemeId;
  barbershopPrimaryColor?: string;
  onCompleteRaffle: (winnerId: string, winnerName: string, shouldHighlight: boolean) => void;
}

export const BarberPoleRaffleLiveModal: React.FC<BarberPoleRaffleLiveModalProps> = ({
  isOpen,
  onClose,
  raffle,
  eligibleClients,
  barbershopName,
  barbershopLogo,
  barbershopTheme,
  barbershopPrimaryColor,
  onCompleteRaffle,
}) => {
  // Theme & Primary Color Resolution
  const primaryColor = useMemo(() => {
    if (barbershopPrimaryColor) return barbershopPrimaryColor;
    if (barbershopTheme === 'GOLD') return '#eab308';
    if (barbershopTheme === 'BLUE') return '#3b82f6';
    if (barbershopTheme === 'NEON_GREEN') return '#22c55e';
    return '#f97316'; // Standard Barber Amber / Warm Orange
  }, [barbershopPrimaryColor, barbershopTheme]);

  // States: 'READY' -> 'SPINNING' -> 'DECELERATING' -> 'WINNER'
  const [phase, setPhase] = useState<'READY' | 'SPINNING' | 'DECELERATING' | 'WINNER'>('READY');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [winner, setWinner] = useState<{ id: string; name: string; whatsapp?: string; avatarUrl?: string } | null>(null);
  const [shouldPinToHighlights, setShouldPinToHighlights] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Dynamic animation speed for the 3D canvas
  const canvasSpeed = useMemo(() => {
    if (phase === 'SPINNING') return 4.5;
    if (phase === 'DECELERATING') return 1.8;
    return 0.8; // Relaxed elegant ambient rotation on READY and WINNER
  }, [phase]);

  // Audio synthesis for realistic slot-machine / roulette ticking
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playTickSound = (highPitch = false) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          audioCtxRef.current = new AudioCtxClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      if (audioCtxRef.current) {
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.type = highPitch ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(highPitch ? 880 : 380 + Math.random() * 120, audioCtxRef.current.currentTime);
        gain.gain.setValueAtTime(0.12, audioCtxRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.start();
        osc.stop(audioCtxRef.current.currentTime + 0.09);
      }
    } catch {
      // Audio context might be restricted by browser policy before first gesture
    }
  };

  const playWinFanfare = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          audioCtxRef.current = new AudioCtxClass();
        }
      }
      if (audioCtxRef.current) {
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
          if (!audioCtxRef.current) return;
          const osc = audioCtxRef.current.createOscillator();
          const gain = audioCtxRef.current.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, audioCtxRef.current.currentTime + i * 0.12);
          gain.gain.setValueAtTime(0.2, audioCtxRef.current.currentTime + i * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + i * 0.12 + 0.4);
          osc.connect(gain);
          gain.connect(audioCtxRef.current.destination);
          osc.start(audioCtxRef.current.currentTime + i * 0.12);
          osc.stop(audioCtxRef.current.currentTime + i * 0.12 + 0.45);
        });
      }
    } catch {
      // ignore
    }
  };

  // Safe fallback if eligible list is empty
  const participants = useMemo(() => {
    if (eligibleClients.length > 0) return eligibleClients;
    return [
      { id: '1', name: 'Carlos Eduardo', whatsapp: '11999990001' },
      { id: '2', name: 'Matheus Pereira', whatsapp: '11999990002' },
      { id: '3', name: 'Rodrigo Santana', whatsapp: '11999990003' },
      { id: '4', name: 'Felipe Alcantara', whatsapp: '11999990004' },
      { id: '5', name: 'Lucas Silva', whatsapp: '11999990005' },
    ];
  }, [eligibleClients]);

  // Handle spin interval logic
  const spinIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startSpinning = () => {
    if (phase !== 'READY') return;
    setPhase('SPINNING');

    let currentSpeed = 60; // ms per tick
    let idx = Math.floor(Math.random() * participants.length);

    if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);

    spinIntervalRef.current = setInterval(() => {
      idx = (idx + 1) % participants.length;
      setCurrentIndex(idx);
      playTickSound();
    }, currentSpeed);
  };

  const stopSpinning = () => {
    if (phase !== 'SPINNING') return;
    setPhase('DECELERATING');

    if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);

    // Pick random target winner from participants
    const chosenWinnerIndex = Math.floor(Math.random() * participants.length);
    const chosenWinner = participants[chosenWinnerIndex];

    let currentIdx = currentIndex;
    let delay = 70;
    let stepsLeft = 24 + Math.floor(Math.random() * 8);

    const step = () => {
      currentIdx = (currentIdx + 1) % participants.length;
      setCurrentIndex(currentIdx);
      playTickSound(stepsLeft <= 3);

      stepsLeft--;
      delay += 25; // Gradual slowing down

      if (stepsLeft > 0) {
        setTimeout(step, delay);
      } else {
        // Stop on the final chosen winner
        setCurrentIndex(chosenWinnerIndex);
        setWinner(chosenWinner);
        setPhase('WINNER');
        playWinFanfare();
      }
    };

    setTimeout(step, delay);
  };

  const handleSaveAndClose = () => {
    if (winner) {
      onCompleteRaffle(winner.id, winner.name, shouldPinToHighlights);
    }
    onClose();
  };

  // Reset when modal closes or opens
  useEffect(() => {
    if (isOpen) {
      setPhase('READY');
      setWinner(null);
      setCurrentIndex(0);
      setShouldPinToHighlights(true);
    } else {
      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentDisplayedParticipant = participants[currentIndex] || participants[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Visual Celebration Confetti on Winner */}
      {phase === 'WINNER' && <BarbershopCelebration active={true} />}

      <div
        style={{ borderColor: primaryColor }}
        className="bg-gradient-to-b from-neutral-900 via-neutral-950 to-black border-2 rounded-3xl max-w-sm w-full p-4 sm:p-5 text-neutral-100 shadow-2xl relative overflow-hidden flex flex-col items-center max-h-[92vh]"
      >
        {/* Decorative Ambient Glows with Barbershop Primary Color */}
        <div
          style={{ backgroundColor: primaryColor }}
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none"
        />
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-gradient-to-t from-red-500/15 to-blue-500/0 rounded-full blur-3xl pointer-events-none" />

        {/* Top Controls: Sound & Close */}
        <div className="w-full flex items-center justify-between pb-2 border-b border-neutral-800/80 relative z-10">
          <div className="flex items-center gap-2">
            <div
              style={{ borderColor: primaryColor }}
              className="w-6 h-6 rounded-full bg-neutral-900 border p-0.5 flex items-center justify-center shadow-sm overflow-hidden shrink-0"
            >
              {barbershopLogo ? (
                <AppImage
                  src={barbershopLogo}
                  alt={barbershopName}
                  className="w-full h-full object-cover rounded-full"
                  fallbackType="logo"
                />
              ) : (
                <Scissors style={{ color: primaryColor }} className="w-3 h-3 stroke-[2.5]" />
              )}
            </div>
            <span className="text-xs font-black tracking-wide text-neutral-200 uppercase font-heading truncate max-w-[190px]">
              {barbershopName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1 transition-colors cursor-pointer"
              title={soundEnabled ? 'Desativar Sons' : 'Ativar Sons'}
            >
              {soundEnabled ? <Volume2 style={{ color: primaryColor }} className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-neutral-500" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Header Title & Prize - Vintage / Premium Barber Aesthetic */}
        <div className="text-center my-2 relative z-10 w-full px-2">
          <div
            style={{ borderColor: primaryColor }}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-0.5 rounded-full bg-neutral-900/80 border text-[10px] font-black uppercase tracking-[0.2em] shadow-sm mb-1"
          >
            <span style={{ color: primaryColor }}>✦</span>
            <span className="text-neutral-200">{raffle.title}</span>
            <span style={{ color: primaryColor }}>✦</span>
          </div>

          <div className="flex flex-col items-center justify-center">
            <span className="text-[9px] font-black tracking-[0.25em] text-neutral-400 uppercase">
              PRÊMIO EM DISPUTA
            </span>
            <h2
              style={{ color: primaryColor }}
              className="text-sm sm:text-base font-black font-heading tracking-tight leading-snug max-w-xs drop-shadow-md truncate w-full"
            >
              {raffle.prize}
            </h2>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VERTICAL AUTHENTIC 3D CYLINDRICAL BARBER POLE */}
        {/* ========================================================================= */}
        <div className="relative w-full my-1.5 flex flex-col items-center justify-center">
          {/* Authentic Vertical Barber Pole Structure */}
          <div className="relative flex flex-col items-center">
            
            {/* Top Glowing Glass Globe Bulb */}
            <div className="relative flex items-center justify-center -mb-1 z-20">
              <div
                style={{
                  boxShadow: `0 0 20px ${primaryColor}aa`
                }}
                className="w-10 h-10 rounded-full bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 border border-white/60 flex items-center justify-center animate-pulse"
              >
                <div className="w-3 h-3 rounded-full bg-white/90 blur-xs" />
              </div>
            </div>

            {/* Top Chrome Cap & Ornamental Crown */}
            <div className="w-24 h-3 bg-gradient-to-r from-neutral-400 via-neutral-100 to-neutral-500 rounded-t-xl border-t-2 border-x-2 border-white/70 shadow-md relative z-10" />
            <div className="w-32 h-2.5 bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-700 rounded-sm shadow-md border-y border-neutral-400 relative z-10" />

            {/* Vertical Barber Pole Glass Cylinder Enclosure (Stably sized to avoid modal expansion) */}
            <div className="w-32 sm:w-36 h-48 sm:h-52 relative rounded-2xl overflow-hidden border-2 border-neutral-600 bg-neutral-950 shadow-[0_0_25px_rgba(0,0,0,0.85)] flex items-center justify-center p-0">
              
              {/* 3D Photorealistic Canvas Helical Barber Pole */}
              <div className="absolute inset-0 w-full h-full">
                <BarberPoleCanvas
                  speedMultiplier={canvasSpeed}
                />
              </div>

              {/* Glass Cylinder Surface Reflections and Specular Highlights */}
              <div className="absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-white/35 via-white/10 to-transparent pointer-events-none z-20" />
              <div className="absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-white/25 via-white/5 to-transparent pointer-events-none z-20" />
              <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/30 to-transparent pointer-events-none z-20" />
              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-20" />

              {/* Center Medallion (Logo before starting / Participants during spin / Winner on stop) */}
              <div className="relative z-30 w-full px-2 flex flex-col items-center justify-center text-center">
                
                {/* READY PHASE: BARBERSHOP LOGO IN THE CENTER */}
                {phase === 'READY' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    style={{ borderColor: primaryColor }}
                    className="flex flex-col items-center justify-center p-1.5 rounded-2xl bg-neutral-950/90 backdrop-blur-md border shadow-2xl"
                  >
                    <div
                      style={{ borderColor: primaryColor }}
                      className="w-12 h-12 rounded-full bg-neutral-900 border p-0.5 flex items-center justify-center shadow-lg overflow-hidden"
                    >
                      {barbershopLogo ? (
                        <AppImage
                          src={barbershopLogo}
                          alt={barbershopName}
                          className="w-full h-full object-cover rounded-full"
                          fallbackType="logo"
                        />
                      ) : (
                        <div
                          style={{ backgroundColor: primaryColor }}
                          className="w-full h-full rounded-full flex items-center justify-center text-neutral-950 font-black text-xl"
                        >
                          <Scissors className="w-5 h-5 stroke-[2.5]" />
                        </div>
                      )}
                    </div>
                    <span
                      style={{ color: primaryColor }}
                      className="text-[8px] font-black uppercase tracking-wider mt-1 max-w-[90px] truncate font-heading"
                    >
                      {barbershopName}
                    </span>
                  </motion.div>
                )}

                {/* SPINNING / DECELERATING PHASE: CLIENT NAMES ROLLING */}
                {(phase === 'SPINNING' || phase === 'DECELERATING') && (
                  <motion.div
                    key={currentDisplayedParticipant.id + '-' + currentIndex}
                    initial={{ y: 15, opacity: 0.4, scale: 0.92 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -15, opacity: 0.4 }}
                    transition={{ duration: 0.05 }}
                    style={{ borderColor: primaryColor }}
                    className="flex flex-col items-center justify-center w-full p-2 rounded-2xl bg-neutral-950/90 backdrop-blur-md border shadow-2xl"
                  >
                    <div
                      style={{ borderColor: primaryColor }}
                      className="w-10 h-10 rounded-full bg-neutral-900 border flex items-center justify-center text-white font-black text-sm shadow-md mb-0.5 overflow-hidden"
                    >
                      {currentDisplayedParticipant.avatarUrl ? (
                        <AppImage
                          src={currentDisplayedParticipant.avatarUrl}
                          alt={currentDisplayedParticipant.name}
                          className="w-full h-full object-cover"
                          fallbackType="avatar"
                        />
                      ) : (
                        currentDisplayedParticipant.name.charAt(0)
                      )}
                    </div>
                    <span className="text-xs font-black font-heading text-white tracking-tight truncate max-w-[110px] drop-shadow-md">
                      {currentDisplayedParticipant.name}
                    </span>
                    <span
                      style={{ color: primaryColor }}
                      className="text-[7px] font-mono font-bold tracking-widest mt-0.5"
                    >
                      SORTEANDO...
                    </span>
                  </motion.div>
                )}

                {/* WINNER PHASE: GRAND REVEAL WITH TROPHY */}
                {phase === 'WINNER' && winner && (
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 12, stiffness: 180 }}
                    style={{ borderColor: primaryColor }}
                    className="flex flex-col items-center justify-center w-full p-2 rounded-2xl bg-neutral-950/95 backdrop-blur-md border-2 shadow-2xl"
                  >
                    <div className="relative mb-0.5">
                      <div
                        style={{ backgroundColor: primaryColor }}
                        className="w-11 h-11 rounded-full text-neutral-950 font-black text-lg flex items-center justify-center shadow-lg ring-2 ring-white/40 animate-bounce overflow-hidden"
                      >
                        {winner.avatarUrl ? (
                          <AppImage
                            src={winner.avatarUrl}
                            alt={winner.name}
                            className="w-full h-full object-cover"
                            fallbackType="avatar"
                          />
                        ) : (
                          winner.name.charAt(0)
                        )}
                      </div>
                      <div className="absolute -top-1.5 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md">
                        <Trophy className="w-3 h-3" />
                      </div>
                    </div>

                    <span
                      style={{ backgroundColor: primaryColor }}
                      className="text-[7px] font-black uppercase text-neutral-950 px-1.5 py-0.5 rounded-full shadow-md tracking-wider mb-0.5"
                    >
                      🏆 GANHADOR(A)!
                    </span>

                    <h4 className="text-xs font-black font-heading text-white tracking-tight drop-shadow-lg truncate max-w-[110px]">
                      {winner.name}
                    </h4>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Bottom Chrome Cap & Ornamental Base */}
            <div className="w-32 h-2.5 bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-700 rounded-sm shadow-md border-y border-neutral-400 relative z-10" />
            <div className="w-24 h-3 bg-gradient-to-r from-neutral-500 via-neutral-200 to-neutral-600 rounded-b-xl border-b-2 border-x-2 border-white/50 shadow-xl relative z-10" />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ACTION BUTTONS & CONTROLS: FIXED STABLE HEIGHT WITHOUT SCREEN EXPANSION */}
        {/* ========================================================================= */}
        <div className="w-full mt-1.5 min-h-[110px] flex flex-col justify-center relative z-10">
          {phase === 'READY' && (
            <button
              type="button"
              onClick={startSpinning}
              style={{
                backgroundColor: primaryColor,
              }}
              className="w-full py-3 text-neutral-950 font-black text-sm rounded-2xl shadow-xl hover:opacity-90 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all tracking-wide animate-pulse"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Iniciar Sorteio</span>
            </button>
          )}

          {phase === 'SPINNING' && (
            <button
              type="button"
              onClick={stopSpinning}
              className="w-full py-3 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 hover:from-red-500 hover:to-rose-400 text-white font-black text-sm rounded-2xl shadow-xl shadow-red-500/40 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all tracking-wider animate-bounce"
            >
              <Trophy className="w-5 h-5" />
              <span>🛑 PARAR E REVELAR GANHADOR!</span>
            </button>
          )}

          {phase === 'DECELERATING' && (
            <div
              style={{ borderColor: primaryColor }}
              className="w-full py-3 bg-neutral-900/90 border text-neutral-200 font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-inner"
            >
              <RefreshCw style={{ color: primaryColor }} className="w-4 h-4 animate-spin" />
              <span>PARANDO O BARBER POLE...</span>
            </div>
          )}

          {phase === 'WINNER' && winner && (
            <div className="space-y-1.5 animate-fade-in w-full">
              {/* Compact Option to Pin to Highlights */}
              <div className="bg-neutral-900/90 border border-neutral-800 px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 shadow-inner">
                <div className="flex items-center gap-1.5 truncate">
                  <Sparkles style={{ color: primaryColor }} className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-bold text-neutral-200 truncate">
                    Fixar no "Destaques & Novidades"
                  </span>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={shouldPinToHighlights}
                    onChange={(e) => setShouldPinToHighlights(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div
                    style={{
                      backgroundColor: shouldPinToHighlights ? primaryColor : undefined
                    }}
                    className="w-8 h-4.5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"
                  />
                </label>
              </div>

              {/* WhatsApp Notification Button */}
              {winner.whatsapp && (
                <a
                  href={`https://wa.me/55${winner.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `🏆 Parabéns ${winner.name}! Você acaba de ser o grande sorteado(a) no ${raffle.title} da ${barbershopName} e ganhou: ${raffle.prize}! Entre em contato para resgatar seu prêmio!`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black rounded-xl text-[11px] flex items-center justify-center gap-1.5 shadow-md transition-all"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Notificar {winner.name.split(' ')[0]} no WhatsApp</span>
                </a>
              )}

              {/* Final Actions Row */}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPhase('READY');
                    setWinner(null);
                  }}
                  className="px-2.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl text-[11px] transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Girar</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  style={{ backgroundColor: primaryColor }}
                  className="flex-1 py-2 text-neutral-950 font-black rounded-xl text-[11px] flex items-center justify-center gap-1.5 shadow-md hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Salvar & Concluir</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
