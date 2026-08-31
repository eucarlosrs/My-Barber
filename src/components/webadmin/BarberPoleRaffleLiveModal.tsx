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
        <div className="text-center my-2.5 relative z-10 w-full">
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
        {/* VERTICAL AUTHENTIC BARBER POLE 3D CYLINDER & STAGE */}
        {/* ========================================================================= */}
        <div className="relative w-full my-2 flex flex-col items-center justify-center">
          {/* Authentic Vertical Barber Pole Structure */}
          <div className="relative flex flex-col items-center">
            
            {/* Top Glowing Glass Globe Bulb */}
            <div className="relative flex items-center justify-center -mb-1 z-20">
              <div className="w-12 h-12 rounded-full bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 shadow-[0_0_24px_rgba(251,191,36,0.85)] border border-white/60 flex items-center justify-center animate-pulse">
                <div className="w-4 h-4 rounded-full bg-white/80 blur-xs" />
              </div>
            </div>

            {/* Top Chrome Cap & Ornamental Crown */}
            <div className="w-32 h-4 bg-gradient-to-r from-neutral-400 via-neutral-100 to-neutral-500 rounded-t-xl border-t-2 border-x-2 border-white/70 shadow-md relative z-10" />
            <div className="w-40 h-3 bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-700 rounded-sm shadow-md border-y border-neutral-400 relative z-10" />

            {/* Vertical Barber Pole Glass Cylinder */}
            <div className="w-48 sm:w-52 h-64 sm:h-72 relative rounded-2xl overflow-hidden border-4 border-neutral-700/80 bg-neutral-950 shadow-[0_0_30px_rgba(0,0,0,0.9)] flex items-center justify-center">
              
              {/* Full-width Animated Barber Pole Stripes Background */}
              <div
                className={`absolute inset-0 barber-pole-vertical-cylinder opacity-90 ${
                  phase === 'SPINNING' ? 'fast brightness-125' : phase === 'DECELERATING' ? 'medium' : ''
                }`}
              />

              {/* Glass Cylinder 3D Specular Highlight and Reflections */}
              <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white/30 via-white/10 to-transparent pointer-events-none z-20" />
              <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white/20 via-white/5 to-transparent pointer-events-none z-20" />
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/25 to-transparent pointer-events-none z-20" />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-20" />

              {/* Center Medallion (Logo before starting / Participants during spin / Winner on stop) */}
              <div className="relative z-30 w-full px-3 flex flex-col items-center justify-center text-center">
                
                {/* READY PHASE: BARBERSHOP LOGO IN THE CENTER */}
                {phase === 'READY' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-neutral-950/80 backdrop-blur-md border border-amber-500/50 shadow-2xl"
                  >
                    <div className="w-20 h-20 rounded-full bg-neutral-900 border-2 border-amber-400 p-1 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.4)] overflow-hidden">
                      {barbershopLogo ? (
                        <AppImage
                          src={barbershopLogo}
                          alt={barbershopName}
                          className="w-full h-full object-cover rounded-full"
                          fallbackType="logo"
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-neutral-950 font-black text-2xl">
                          <Scissors className="w-8 h-8 stroke-[2.5]" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-black uppercase text-amber-300 tracking-wider mt-2 max-w-[130px] truncate">
                      {barbershopName}
                    </span>
                  </motion.div>
                )}

                {/* SPINNING / DECELERATING PHASE: CLIENT NAMES ROLLING */}
                {(phase === 'SPINNING' || phase === 'DECELERATING') && (
                  <motion.div
                    key={currentDisplayedParticipant.id + '-' + currentIndex}
                    initial={{ y: 24, opacity: 0.3, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -24, opacity: 0.3 }}
                    transition={{ duration: 0.05 }}
                    className="flex flex-col items-center justify-center w-full p-3 rounded-2xl bg-neutral-950/85 backdrop-blur-md border border-amber-400 shadow-2xl"
                  >
                    <div className="w-14 h-14 rounded-full bg-neutral-900 border-2 border-amber-400 flex items-center justify-center text-white font-black text-xl shadow-[0_0_16px_rgba(251,191,36,0.6)] mb-1.5 overflow-hidden">
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
                    <span className="text-base sm:text-lg font-black font-heading text-white tracking-tight truncate max-w-[150px] drop-shadow-md">
                      {currentDisplayedParticipant.name}
                    </span>
                    <span className="text-[9px] font-mono text-amber-400 font-bold tracking-widest mt-0.5">
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
                    className="flex flex-col items-center justify-center w-full p-3 rounded-2xl bg-neutral-950/90 backdrop-blur-md border-2 border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.6)]"
                  >
                    <div className="relative mb-1">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-neutral-950 font-black text-2xl flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.9)] ring-4 ring-orange-500/80 animate-bounce overflow-hidden">
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
                        <Trophy className="w-4 h-4" />
                      </div>
                    </div>

                    <span className="text-[9px] font-black uppercase bg-amber-400 text-neutral-950 px-2 py-0.5 rounded-full shadow-md tracking-wider mb-1">
                      🏆 GANHADOR(A)!
                    </span>

                    <h4 className="text-base sm:text-lg font-black font-heading text-white tracking-tight drop-shadow-lg truncate max-w-[150px]">
                      {winner.name}
                    </h4>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Bottom Chrome Cap & Ornamental Base */}
            <div className="w-40 h-3 bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-700 rounded-sm shadow-md border-y border-neutral-400 relative z-10" />
            <div className="w-32 h-4 bg-gradient-to-r from-neutral-500 via-neutral-200 to-neutral-600 rounded-b-xl border-b-2 border-x-2 border-white/50 shadow-xl relative z-10" />
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
