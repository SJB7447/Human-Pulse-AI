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
          {/* Header */}
          <div className="pointer-events-auto">
            <Header transparent={true} />
          </div>

          {/* Footer tagline - fixed at bottom */}
          <div className="absolute bottom-[104px] left-0 right-0 flex justify-center px-16 pointer-events-none sm:bottom-8 sm:px-0">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="text-center text-sm text-gray-500 tracking-wide sm:text-lg"
              style={{
                fontFamily: '"Playfair Display", serif',
                fontWeight: 400,
              }}
            >
              Experience news through emotion
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
