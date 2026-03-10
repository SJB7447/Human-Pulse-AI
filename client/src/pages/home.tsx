import { lazy, Suspense, useEffect } from 'react';
import { Overlay } from '@/components/Overlay';
import { IntroOverlay } from '@/components/IntroOverlay';
import { useEmotionStore } from '@/lib/store';

const Scene = lazy(() => import('@/components/three/Scene').then((module) => ({ default: module.Scene })));

export default function Home() {
  const {
    isSplit,
    activeEmotion,
    animationPhase,
    goBackToSplit,
    setIsSplit,
    setAnimationPhase,
  } = useEmotionStore();

  useEffect(() => {
    // Home should always be recoverable to split/idle scene even if in-memory state got out of sync.
    if (activeEmotion) goBackToSplit();
    if (!isSplit) setIsSplit(true);
    if (animationPhase === 'intro' || animationPhase === 'initial' || animationPhase === 'merging') {
      setAnimationPhase('idle');
    }
  }, []); // Empty dependency array: run once on mount

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <Suspense fallback={<div className="fixed inset-0 bg-[#f8f9fa]" aria-hidden="true" />}>
        <Scene />
      </Suspense>
      <Overlay />
      <IntroOverlay />
    </div>
  );
}
