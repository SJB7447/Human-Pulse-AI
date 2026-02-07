import { motion, AnimatePresence } from 'framer-motion';
import { useEmotionStore } from '@/lib/store';
import { Header } from './Header';

export function Overlay() {
  const { animationPhase, isTransitioning, showIntro } = useEmotionStore();

  const isHidden = animationPhase === 'transitioning' || isTransitioning || showIntro || animationPhase === 'intro';

  return (
    <AnimatePresence>
      {!isHidden && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 pointer-events-none z-20"
        >
          {/* Use Shared Header with transparent prop since this is an overlay */}
          <div className="pointer-events-auto">
            <Header transparent={true} />
          </div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-center"
            >
              <h1
                className="text-6xl md:text-8xl font-bold tracking-tight text-gray-800"
                style={{
                  textShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
                }}
                data-testid="text-title"
              >
                HUEBRIEF
              </h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="mt-4 text-lg text-gray-500 font-light tracking-wide"
              >
                Experience news through emotion
              </motion.p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
