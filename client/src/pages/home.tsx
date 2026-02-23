import { useEffect } from 'react';
import { Scene } from '@/components/three/Scene';
import { Overlay } from '@/components/Overlay';
import { IntroOverlay } from '@/components/IntroOverlay';
import { useEmotionStore } from '@/lib/store';

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
      <Scene />
      <Overlay />
      <IntroOverlay />
    </div>
  );
}
