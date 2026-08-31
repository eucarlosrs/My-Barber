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
  Share2,
  RefreshCw,
  Video,
  Award,
  Users
} from 'lucide-react';
import { Raffle, UserType } from '../../types';
import { AppImage } from '../common/AppImage';
import { BarbershopCelebration } from '../common/BarbershopCelebration';

interface BarberPoleRaffleLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  raffle: Raffle;
  eligibleClients: Array<{ id: string; name: string; whatsapp?: string; avatarUrl?: string }>;
  barbershopName: string;
  onCompleteRaffle: (winnerId: string, winnerName: string, shouldHighlight: boolean) => void;
}

export const BarberPoleRaffleLiveModal: React.FC<BarberPoleRaffleLiveModalProps> = ({
  isOpen,
  onClose,
  raffle,
  eligibleClients,
  barbershopName,
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

      <div className="bg-gradient-to-b from-neutral-900 via-neutral-950 to-black border-2 border-orange-500/80 rounded-3xl max-w-lg w-full p-5 sm:p-6 text-neutral-100 shadow-2xl relative overflow-hidden flex flex-col items-center">
        {/* Decorative Ambient Glows */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-gradient-to-b from-orange-500/25 to-amber-500/0 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-gradient-to-t from-red-500/20 to-blue-500/0 rounded-full blur-3xl pointer-events-none" />

        {/* Top Controls: Sound & Close */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-neutral-800 relative z-10">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-neutral-300">
              <Video className="w-3.5 h-3.5 text-red-500" />
              <span>Modo Gravação / Ao Vivo</span>
            </div>
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

        {/* Header Title */}
        <div className="text-center my-3 relative z-10 w-full">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/40 text-orange-400 text-[10px] font-black uppercase tracking-wider mb-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{raffle.title}</span>
          </span>
          <h2 className="text-xl sm:text-2xl font-black font-heading text-white tracking-tight">
            Sorteador Barber Pole
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Prêmio: <strong className="text-amber-400">{raffle.prize}</strong> • {participants.length} clientes concorrendo
          </p>
        </div>

        {/* ========================================================================= */}
        {/* BARBER POLE 3D CYLINDER & ROULETTE STAGE */}
        {/* ========================================================================= */}
        <div className="relative w-full my-3 flex flex-col items-center justify-center">
          {/* Main Pole Container */}
          <div className="relative w-72 sm:w-80 flex flex-col items-center">
            
            {/* Top Chrome Cap & Light Bulb */}
            <div className="w-28 h-6 bg-gradient-to-r from-neutral-400 via-neutral-100 to-neutral-500 rounded-t-full border-t-2 border-x-2 border-white/60 shadow-lg relative flex items-center justify-center">
              <div className="w-6 h-3 bg-amber-300 rounded-t-full shadow-[0_0_12px_rgba(251,191,36,0.9)] animate-pulse" />
            </div>
            <div className="w-36 h-4 bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-700 rounded-md shadow-md border-y border-neutral-400" />

            {/* Central Glass Tube with Rotating Stripes & Internal Participants */}
            <div className="w-full h-44 sm:h-48 relative rounded-2xl overflow-hidden border-2 border-neutral-600 bg-neutral-950/90 shadow-2xl flex items-center justify-center p-3">
              
              {/* Left Barber Pole Animated Strip */}
              <div
                className={`absolute left-0 top-0 bottom-0 w-7 sm:w-8 barber-pole-stripe opacity-90 border-r border-neutral-700 shadow-inner ${
                  phase === 'SPINNING' ? 'brightness-125' : ''
                }`}
                style={{
                  animationDuration: phase === 'SPINNING' ? '0.4s' : phase === 'DECELERATING' ? '0.9s' : '1.8s'
                }}
              />

              {/* Right Barber Pole Animated Strip */}
              <div
                className={`absolute right-0 top-0 bottom-0 w-7 sm:w-8 barber-pole-stripe opacity-90 border-l border-neutral-700 shadow-inner ${
                  phase === 'SPINNING' ? 'brightness-125' : ''
                }`}
                style={{
                  animationDuration: phase === 'SPINNING' ? '0.4s' : phase === 'DECELERATING' ? '0.9s' : '1.8s'
                }}
              />

              {/* Glass Reflection Highlight */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none z-20" />
              <div className="absolute top-0 left-8 right-8 h-1/2 bg-gradient-to-b from-white/15 to-transparent rounded-t-xl pointer-events-none z-20" />

              {/* Center Spotlight & Selection Frame */}
              <div className="relative z-10 w-full px-8 flex flex-col items-center justify-center text-center">
                {phase === 'READY' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className="w-14 h-14 rounded-full bg-orange-500/20 border-2 border-orange-500 flex items-center justify-center text-orange-400 shadow-lg shadow-orange-500/20">
                      <Scissors className="w-7 h-7 stroke-[2.5]" />
                    </div>
                    <div>
                      <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                        Barber Pole Carregado
                      </span>
                      <p className="text-[11px] text-neutral-300">
                        {participants.length} participantes com agendamento nos últimos 60 dias
                      </p>
                    </div>
                  </motion.div>
                )}

                {(phase === 'SPINNING' || phase === 'DECELERATING') && (
                  <motion.div
                    key={currentDisplayedParticipant.id + '-' + currentIndex}
                    initial={{ y: 20, opacity: 0.4, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -20, opacity: 0.4 }}
                    transition={{ duration: 0.06 }}
                    className="flex flex-col items-center justify-center w-full"
                  >
                    <div className="w-12 h-12 rounded-full bg-neutral-900 border-2 border-amber-400/80 flex items-center justify-center text-white font-black text-base shadow-[0_0_15px_rgba(251,191,36,0.4)] mb-1">
                      {currentDisplayedParticipant.name.charAt(0)}
                    </div>
                    <span className="text-lg sm:text-xl font-black font-heading text-white tracking-tight truncate max-w-[200px] drop-shadow-md">
                      {currentDisplayedParticipant.name}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400 font-bold tracking-widest mt-0.5">
                      GIRANDO NO BARBER POLE...
                    </span>
                  </motion.div>
                )}

                {phase === 'WINNER' && winner && (
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 12, stiffness: 180 }}
                    className="flex flex-col items-center justify-center w-full"
                  >
                    <div className="relative mb-1">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-neutral-950 font-black text-xl flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.8)] ring-4 ring-orange-500/60 animate-bounce">
                        {winner.name.charAt(0)}
                      </div>
                      <div className="absolute -top-2 -right-1 bg-red-500 text-white rounded-full p-1 shadow-md">
                        <Trophy className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <span className="text-[10px] font-black uppercase bg-amber-400 text-neutral-950 px-2.5 py-0.5 rounded-full shadow-md tracking-wider mb-1">
                      🏆 GANHADOR(A) OFICIAL!
                    </span>

                    <h4 className="text-xl sm:text-2xl font-black font-heading text-white tracking-tight drop-shadow-lg truncate max-w-[220px]">
                      {winner.name}
                    </h4>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Bottom Chrome Cap & Stand */}
            <div className="w-36 h-4 bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-700 rounded-md shadow-md border-y border-neutral-400" />
            <div className="w-32 h-5 bg-gradient-to-r from-neutral-500 via-neutral-200 to-neutral-600 rounded-b-full border-b-2 border-x-2 border-white/40 shadow-xl" />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ACTION BUTTONS: START / STOP / FINISH */}
        {/* ========================================================================= */}
        <div className="w-full mt-3 space-y-3 relative z-10">
          {phase === 'READY' && (
            <button
              type="button"
              onClick={startSpinning}
              className="w-full py-4 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-400 hover:to-amber-400 text-neutral-950 font-black text-sm rounded-2xl shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all tracking-wide animate-pulse"
            >
              <Scissors className="w-5 h-5 stroke-[2.5]" />
              <span>💈 INICIAR SORTEIO NO BARBER POLE</span>
            </button>
          )}

          {phase === 'SPINNING' && (
            <button
              type="button"
              onClick={stopSpinning}
              className="w-full py-4 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 hover:from-red-500 hover:to-rose-400 text-white font-black text-sm rounded-2xl shadow-xl shadow-red-500/40 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all tracking-wider animate-bounce"
            >
              <Trophy className="w-5 h-5" />
              <span>🛑 PARAR E REVELAR GANHADOR!</span>
            </button>
          )}

          {phase === 'DECELERATING' && (
            <div className="w-full py-4 bg-neutral-900/90 border border-amber-500/50 text-amber-300 font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-inner">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>PARANDO O BARBER POLE... SEGURE A GRAVAÇÃO!</span>
            </div>
          )}

          {phase === 'WINNER' && winner && (
            <div className="space-y-3 animate-fade-in">
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
                      Exibe o card do ganhador na página inicial do App do Cliente
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
                  className="px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-2xl text-xs transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Girar Novamente</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 text-neutral-950 font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Salvar & Concluir Sorteio</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
