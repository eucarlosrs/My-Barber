import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
import { Raffle } from '../../types';
import { AppImage } from '../common/AppImage';
import { BarbershopCelebration } from '../common/BarbershopCelebration';

// ============================================================================
// 3D HELICAL CYLINDER BARBER POLE CANVAS COMPONENT
// ============================================================================
interface BarberPoleCanvasProps {
  speedMultiplier: number;
  width?: number;
  height?: number;
}

const BarberPoleCanvas: React.FC<BarberPoleCanvasProps> = ({
  speedMultiplier,
  width = 150,
  height = 290
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const rotationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina display support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const W = width;
    const H = height;
    const radius = W / 2;
    const numHelixes = 3.5; // Number of complete spiral turns along vertical height

    // Pre-allocate buffer
    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    // Precalculate cylinder X mapping to avoid Math.asin in inner loop
    const xToAngle = new Float32Array(W);
    const xShade = new Float32Array(W);
    const xValid = new Uint8Array(W);

    for (let x = 0; x < W; x++) {
      const u = (x - radius) / radius;
      if (Math.abs(u) <= 0.999) {
        xValid[x] = 1;
        const angle = Math.asin(u);
        xToAngle[x] = angle;
        // 3D cylindrical lighting (diffuse + specular + edge falloff)
        const cosAngle = Math.cos(angle);
        const diffuse = cosAngle * 0.75;
        const spec = Math.pow(Math.max(0, Math.cos(angle - 0.35)), 10) * 0.45;
        const edgeShadow = Math.pow(cosAngle, 0.4);
        xShade[x] = Math.min(1.2, Math.max(0.15, (0.28 + diffuse + spec) * edgeShadow));
      } else {
        xValid[x] = 0;
      }
    }

    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Update rotation
      rotationRef.current += dt * speedMultiplier * 4.5;
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
          // Each band occupies 90 degrees (PI / 2 radians)
          const band = (totalAngle / (Math.PI / 2)) % 4;
          let r = 255;
          let g = 255;
          let b = 255;

          if (band < 1) {
            // RED BAND (Vibrant Classic Barber Red)
            r = 220;
            g = 35;
            b = 35;
          } else if (band < 2) {
            // WHITE BAND
            r = 248;
            g = 250;
            b = 252;
          } else if (band < 3) {
            // BLUE BAND (Deep Classic Barber Blue)
            r = 30;
            g = 95;
            b = 225;
          } else {
            // WHITE BAND
            r = 248;
            g = 250;
            b = 252;
          }

          const shade = xShade[x];

          data[p] = Math.min(255, r * shade);
          data[p + 1] = Math.min(255, g * shade);
          data[p + 2] = Math.min(255, b * shade);
          data[p + 3] = 255; // fully opaque cylinder
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
  }, [speedMultiplier, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="rounded-xl shadow-inner pointer-events-none block"
    />
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
  onCompleteRaffle: (winnerId: string, winnerName: string, shouldHighlight: boolean) => void;
}

export const BarberPoleRaffleLiveModal: React.FC<BarberPoleRaffleLiveModalProps> = ({
  isOpen,
  onClose,
  raffle,
  eligibleClients,
  barbershopName,
  barbershopLogo,
  onCompleteRaffle,
}) => {
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

      <div className="bg-gradient-to-b from-neutral-900 via-neutral-950 to-black border-2 border-orange-500/70 rounded-3xl max-w-md w-full p-5 sm:p-6 text-neutral-100 shadow-2xl relative overflow-hidden flex flex-col items-center">
        {/* Decorative Ambient Glows */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-gradient-to-b from-orange-500/20 to-amber-500/0 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-gradient-to-t from-red-500/20 to-blue-500/0 rounded-full blur-3xl pointer-events-none" />

        {/* Top Controls: Sound & Close */}
        <div className="w-full flex items-center justify-between pb-2 border-b border-neutral-800/80 relative z-10">
          <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-400">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-white">{barbershopName}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1 transition-colors cursor-pointer"
              title={soundEnabled ? 'Desativar Sons' : 'Ativar Sons'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-orange-400" /> : <VolumeX className="w-4 h-4 text-neutral-500" />}
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

        {/* Header Title & Prize */}
        <div className="text-center my-2 relative z-10 w-full">
          <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/40 text-orange-400 text-[10px] font-black uppercase tracking-wider mb-1">
            {raffle.title}
          </span>
          <h2 className="text-xl sm:text-2xl font-black font-heading text-white tracking-tight">
            Sorteador Barber Pole
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Prêmio: <strong className="text-amber-400">{raffle.prize}</strong>
          </p>
        </div>

        {/* ========================================================================= */}
        {/* VERTICAL AUTHENTIC 3D CYLINDRICAL BARBER POLE */}
        {/* ========================================================================= */}
        <div className="relative w-full my-2 flex flex-col items-center justify-center">
          {/* Authentic Vertical Barber Pole Structure */}
          <div className="relative flex flex-col items-center">
            
            {/* Top Glowing Glass Globe Bulb */}
            <div className="relative flex items-center justify-center -mb-1 z-20">
              <div className="w-11 h-11 rounded-full bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 shadow-[0_0_24px_rgba(251,191,36,0.9)] border border-white/60 flex items-center justify-center animate-pulse">
                <div className="w-3.5 h-3.5 rounded-full bg-white/90 blur-xs" />
              </div>
            </div>

            {/* Top Chrome Cap & Ornamental Crown */}
            <div className="w-28 h-3.5 bg-gradient-to-r from-neutral-400 via-neutral-100 to-neutral-500 rounded-t-xl border-t-2 border-x-2 border-white/70 shadow-md relative z-10" />
            <div className="w-36 h-3 bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-700 rounded-sm shadow-md border-y border-neutral-400 relative z-10" />

            {/* Vertical Barber Pole Glass Cylinder Enclosure */}
            <div className="w-36 sm:w-40 h-64 sm:h-72 relative rounded-2xl overflow-hidden border-2 border-neutral-600 bg-neutral-950 shadow-[0_0_25px_rgba(0,0,0,0.85)] flex items-center justify-center p-0.5">
              
              {/* 3D Photorealistic Canvas Helical Barber Pole */}
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                <BarberPoleCanvas
                  speedMultiplier={canvasSpeed}
                  width={160}
                  height={290}
                />
              </div>

              {/* Glass Cylinder Surface Reflections and Specular Highlights */}
              <div className="absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white/35 via-white/10 to-transparent pointer-events-none z-20" />
              <div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white/25 via-white/5 to-transparent pointer-events-none z-20" />
              <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/30 to-transparent pointer-events-none z-20" />
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-20" />

              {/* Center Medallion (Logo before starting / Participants during spin / Winner on stop) */}
              <div className="relative z-30 w-full px-2 flex flex-col items-center justify-center text-center">
                
                {/* READY PHASE: BARBERSHOP LOGO IN THE CENTER */}
                {phase === 'READY' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-neutral-950/85 backdrop-blur-md border border-amber-500/60 shadow-2xl"
                  >
                    <div className="w-16 h-16 rounded-full bg-neutral-900 border-2 border-amber-400 p-0.5 flex items-center justify-center shadow-[0_0_18px_rgba(251,191,36,0.5)] overflow-hidden">
                      {barbershopLogo ? (
                        <AppImage
                          src={barbershopLogo}
                          alt={barbershopName}
                          className="w-full h-full object-cover rounded-full"
                          fallbackType="logo"
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-neutral-950 font-black text-xl">
                          <Scissors className="w-7 h-7 stroke-[2.5]" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-black uppercase text-amber-300 tracking-wider mt-1.5 max-w-[110px] truncate">
                      {barbershopName}
                    </span>
                  </motion.div>
                )}

                {/* SPINNING / DECELERATING PHASE: CLIENT NAMES ROLLING */}
                {(phase === 'SPINNING' || phase === 'DECELERATING') && (
                  <motion.div
                    key={currentDisplayedParticipant.id + '-' + currentIndex}
                    initial={{ y: 20, opacity: 0.3, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -20, opacity: 0.3 }}
                    transition={{ duration: 0.05 }}
                    className="flex flex-col items-center justify-center w-full p-2.5 rounded-2xl bg-neutral-950/90 backdrop-blur-md border border-amber-400 shadow-2xl"
                  >
                    <div className="w-12 h-12 rounded-full bg-neutral-900 border-2 border-amber-400 flex items-center justify-center text-white font-black text-lg shadow-[0_0_15px_rgba(251,191,36,0.6)] mb-1 overflow-hidden">
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
                    <span className="text-sm font-black font-heading text-white tracking-tight truncate max-w-[120px] drop-shadow-md">
                      {currentDisplayedParticipant.name}
                    </span>
                    <span className="text-[8px] font-mono text-amber-400 font-bold tracking-widest mt-0.5">
                      SORTEANDO...
                    </span>
                  </motion.div>
                )}

                {/* WINNER PHASE: GRAND REVEAL WITH TROPHY */}
                {phase === 'WINNER' && winner && (
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 12, stiffness: 180 }}
                    className="flex flex-col items-center justify-center w-full p-2.5 rounded-2xl bg-neutral-950/90 backdrop-blur-md border-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.7)]"
                  >
                    <div className="relative mb-1">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-neutral-950 font-black text-xl flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.9)] ring-4 ring-orange-500/80 animate-bounce overflow-hidden">
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
                      <div className="absolute -top-2 -right-1 bg-red-500 text-white rounded-full p-1 shadow-md">
                        <Trophy className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <span className="text-[8px] font-black uppercase bg-amber-400 text-neutral-950 px-2 py-0.5 rounded-full shadow-md tracking-wider mb-1">
                      🏆 GANHADOR(A)!
                    </span>

                    <h4 className="text-sm font-black font-heading text-white tracking-tight drop-shadow-lg truncate max-w-[120px]">
                      {winner.name}
                    </h4>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Bottom Chrome Cap & Ornamental Base */}
            <div className="w-36 h-3 bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-700 rounded-sm shadow-md border-y border-neutral-400 relative z-10" />
            <div className="w-28 h-3.5 bg-gradient-to-r from-neutral-500 via-neutral-200 to-neutral-600 rounded-b-xl border-b-2 border-x-2 border-white/50 shadow-xl relative z-10" />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ACTION BUTTONS: START / STOP / FINISH */}
        {/* ========================================================================= */}
        <div className="w-full mt-2.5 space-y-2.5 relative z-10">
          {phase === 'READY' && (
            <button
              type="button"
              onClick={startSpinning}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-400 hover:to-amber-400 text-neutral-950 font-black text-sm rounded-2xl shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all tracking-wide animate-pulse"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Iniciar Sorteio</span>
            </button>
          )}

          {phase === 'SPINNING' && (
            <button
              type="button"
              onClick={stopSpinning}
              className="w-full py-3.5 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 hover:from-red-500 hover:to-rose-400 text-white font-black text-sm rounded-2xl shadow-xl shadow-red-500/40 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all tracking-wider animate-bounce"
            >
              <Trophy className="w-5 h-5" />
              <span>🛑 PARAR E REVELAR GANHADOR!</span>
            </button>
          )}

          {phase === 'DECELERATING' && (
            <div className="w-full py-3.5 bg-neutral-900/90 border border-amber-500/50 text-amber-300 font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-inner">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>PARANDO O BARBER POLE...</span>
            </div>
          )}

          {phase === 'WINNER' && winner && (
            <div className="space-y-2.5 animate-fade-in">
              {/* Option to Pin to Highlights */}
              <div className="bg-neutral-900 border border-amber-500/40 p-3 rounded-2xl flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-white">
                      Fixar no "Destaques & Novidades"
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      Exibe o card do ganhador na tela inicial do App do Cliente
                    </div>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={shouldPinToHighlights}
                    onChange={(e) => setShouldPinToHighlights(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
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
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  <Phone className="w-4 h-4" />
                  <span>Notificar {winner.name.split(' ')[0]} no WhatsApp</span>
                </a>
              )}

              {/* Final Confirm Button */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhase('READY');
                    setWinner(null);
                  }}
                  className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-2xl text-xs transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Girar Novamente</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
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
