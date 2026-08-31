import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Sparkles, Star, Crown, CheckCircle2 } from 'lucide-react';

interface Particle {
  id: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  rotation: number;
  targetRotation: number;
  scale: number;
  color: string;
  type: 'scissor' | 'barber_pole' | 'sparkle' | 'star' | 'crown' | 'ribbon' | 'dot';
  size: number;
  duration: number;
  delay: number;
}

const COLORS = [
  '#FF6B00', // Barber Orange
  '#F59E0B', // Amber Gold
  '#EAB308', // Yellow
  '#3B82F6', // Barber Blue
  '#EF4444', // Barber Red
  '#FFFFFF', // Pure White
  '#10B981', // Emerald Success
];

export const BarbershopCelebration: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 400,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Generate 45 barbershop-themed particles bursting outwards
  const particles: Particle[] = useMemo(() => {
    const types: Particle['type'][] = [
      'scissor',
      'barber_pole',
      'sparkle',
      'star',
      'crown',
      'ribbon',
      'dot',
      'scissor',
      'barber_pole',
      'sparkle',
    ];

    const centerX = windowSize.width / 2;
    const centerY = windowSize.height / 2.2;

    return Array.from({ length: 48 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 48 + (Math.random() - 0.5) * 0.4;
      const velocity = 150 + Math.random() * 320;
      const targetX = Math.cos(angle) * velocity + (Math.random() - 0.5) * 80;
      const targetY = Math.sin(angle) * velocity + Math.random() * 120 + 80; // slight gravity pull down
      const type = types[i % types.length];
      const color = COLORS[i % COLORS.length];

      return {
        id: i,
        x: centerX + (Math.random() - 0.5) * 40,
        y: centerY + (Math.random() - 0.5) * 40,
        targetX,
        targetY,
        rotation: (Math.random() - 0.5) * 60,
        targetRotation: (Math.random() - 0.5) * 720,
        scale: 0.6 + Math.random() * 0.7,
        color,
        type,
        size: type === 'scissor' || type === 'crown' || type === 'barber_pole' ? 22 : 14,
        duration: 1.8 + Math.random() * 1.2,
        delay: Math.random() * 0.18,
      };
    });
  }, [windowSize.width, windowSize.height]);

  if (!active) return null;

  return (
    <div
      id="barbershop-celebration-canvas"
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden select-none"
    >
      {/* Shockwave Radial Glow */}
      <motion.div
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0.45, 0], scale: [0.2, 1.8, 2.4] }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-gradient-to-r from-orange-500/30 via-amber-400/20 to-transparent blur-3xl pointer-events-none"
      />

      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{
              x: p.x,
              y: p.y,
              scale: 0,
              rotate: p.rotation,
              opacity: 1,
            }}
            animate={{
              x: p.x + p.targetX,
              y: p.y + p.targetY,
              scale: [0, p.scale, p.scale * 0.8, 0],
              rotate: p.rotation + p.targetRotation,
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: [0.12, 0.8, 0.32, 1], // explosive burst deceleration
            }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              color: p.color,
            }}
            className="flex items-center justify-center filter drop-shadow-md"
          >
            {p.type === 'scissor' && (
              <div className="p-1 rounded-full bg-black/40 backdrop-blur-xs border border-orange-500/40">
                <Scissors className="w-5 h-5 text-orange-400 stroke-[2.5]" />
              </div>
            )}

            {p.type === 'barber_pole' && (
              <div
                className="w-3.5 h-6 rounded-full border border-white/40 overflow-hidden shadow-lg"
                style={{
                  background:
                    'repeating-linear-gradient(45deg, #EF4444, #EF4444 4px, #FFFFFF 4px, #FFFFFF 8px, #3B82F6 8px, #3B82F6 12px)',
                }}
              />
            )}

            {p.type === 'sparkle' && (
              <Sparkles className="w-4 h-4 text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            )}

            {p.type === 'star' && (
              <Star className="w-4 h-4 fill-amber-400 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
            )}

            {p.type === 'crown' && (
              <Crown className="w-5 h-5 text-yellow-400 fill-yellow-500/30 drop-shadow-[0_0_8px_rgba(234,179,8,0.7)]" />
            )}

            {p.type === 'ribbon' && (
              <div
                className="w-4 h-1.5 rounded-full shadow-sm"
                style={{ backgroundColor: p.color }}
              />
            )}

            {p.type === 'dot' && (
              <div
                className="w-2.5 h-2.5 rounded-full shadow-sm"
                style={{ backgroundColor: p.color }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
