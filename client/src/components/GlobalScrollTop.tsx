import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type GlobalScrollTopProps = {
  adminDock?: boolean;
};

export function GlobalScrollTop({ adminDock = false }: GlobalScrollTopProps) {
  const [show, setShow] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (location === '/') return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`fixed ${adminDock ? 'bottom-6 right-6' : 'bottom-24 right-6'} z-[110] w-14 h-14 rounded-full bg-white/90 backdrop-blur-sm shadow-[0_4px_12px_rgba(35,34,33,0.16)] flex items-center justify-center p-0 hover:bg-white transition-all duration-300`}
          aria-label="Scroll to top"
          data-testid="button-global-scroll-top"
        >
          <ArrowUp className="w-6 h-6 text-gray-700" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
