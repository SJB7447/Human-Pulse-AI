import { useEffect } from 'react';
import { Scene } from '@/components/three/Scene';
import { Overlay } from '@/components/Overlay';
import { IntroOverlay } from '@/components/IntroOverlay';
import { useEmotionStore } from '@/lib/store';

export default function Home() {
  const { isSplit, activeEmotion, goBackToSplit } = useEmotionStore();

  useEffect(() => {
    // If we are back at Home (root), check current state.
    // We only want to reset activeEmotion if we came from another page (navigate back),
    // NOT when we are just interacting on the page.
    // Since this runs on mount, it's safe to check activeEmotion here.
    if (activeEmotion) {
      goBackToSplit();
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
