import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEmotionStore } from '@/lib/store';

export function IntroOverlay() {
  const { showIntro, setShowIntro, setAnimationPhase } = useEmotionStore();
  const [textPhase, setTextPhase] = useState<'hidden' | 'visible' | 'fading'>('hidden');

  useEffect(() => {
    if (!showIntro) return;

    const showTimer = setTimeout(() => {
      setTextPhase('visible');
    }, 300);

    const fadeTimer = setTimeout(() => {
      setTextPhase('fading');
    }, 2500);

    const hideTimer = setTimeout(() => {
      setShowIntro(false);
      setAnimationPhase('initial');
    }, 3500);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [showIntro, setShowIntro, setAnimationPhase]);

  return (
    <AnimatePresence>
      {showIntro && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #f8f9fa 100%)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ 
              opacity: textPhase === 'visible' ? 1 : textPhase === 'fading' ? 0 : 0,
              y: textPhase === 'visible' ? 0 : textPhase === 'fading' ? -20 : 20,
            }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="text-center px-6"
          >
            <h1 
              className="text-2xl md:text-4xl lg:text-5xl font-light text-gray-700 tracking-wide"
              style={{
                fontFamily: "'Noto Sans KR', sans-serif",
                textShadow: '0 2px 16px rgba(0, 0, 0, 0.05)',
              }}
            >
              오늘 당신의 색은 어떤 색인가요?
            </h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: textPhase === 'visible' ? 0.6 : 0,
              }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-4 text-sm md:text-base text-gray-500 font-light tracking-wider"
            >
              What is your color today?
            </motion.p>
          </motion.div>

          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: textPhase === 'visible' ? 0.4 : 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="flex gap-2"
            >
              {['#ffd150', '#f4606b', '#3f65ef', '#bababa', '#88d84a'].map((color, i) => (
                <motion.div
                  key={color}
                  initial={{ scale: 0 }}
                  animate={{ scale: textPhase === 'visible' ? 1 : 0 }}
                  transition={{ duration: 0.3, delay: 0.6 + i * 0.1 }}
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ))}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
