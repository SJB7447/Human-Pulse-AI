import { Suspense, useEffect, useState, createContext } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useLocation } from 'wouter';
import { MainSphere } from './MainSphere';
import { EmotionSphere } from './EmotionSphere';
import { Particles } from './Particles';
import { EMOTION_CONFIG, useEmotionStore, EmotionType } from '@/lib/store';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const MobileContext = createContext<boolean>(false);

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function CameraController({ isMobile }: { isMobile: boolean }) {
  const { camera } = useThree();
  const { activeEmotion, animationPhase, setAnimationPhase } = useEmotionStore();
  const startPositionRef = { current: new THREE.Vector3(0, 0, isMobile ? 13 : 18) };
  const [transitionStartTime, setTransitionStartTime] = useState<number | null>(null);
  const defaultCameraZ = isMobile ? 13 : 18;
  const focusDistance = isMobile ? 8 : 10;

  useEffect(() => {
    if (animationPhase === 'focusing' && activeEmotion) {
      startPositionRef.current.copy(camera.position);
      setTransitionStartTime(Date.now());
    }
  }, [animationPhase, activeEmotion, camera.position]);

  useFrame(() => {
    if (animationPhase === 'focusing' && activeEmotion && transitionStartTime) {
      const emotionConfig = EMOTION_CONFIG.find(e => e.type === activeEmotion);
      if (emotionConfig) {
        const elapsed = (Date.now() - transitionStartTime) / 1000;
        const duration = 0.8;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);

        const position = isMobile ? emotionConfig.positionMobile : emotionConfig.positionDesktop;
        const targetPos = new THREE.Vector3(
          position[0] * 0.3,
          position[1] * 0.3,
          focusDistance
        );

        camera.position.lerpVectors(startPositionRef.current, targetPos, eased);

        const lookAtTarget = new THREE.Vector3(position[0] * 0.5, position[1] * 0.5, 0);
        camera.lookAt(lookAtTarget);

        if (progress >= 1) {
          setAnimationPhase('focused');
          setTransitionStartTime(null);
        }
      }
    } else if (animationPhase === 'focused' && activeEmotion) {
      const emotionConfig = EMOTION_CONFIG.find(e => e.type === activeEmotion);
      if (emotionConfig) {
        const position = isMobile ? emotionConfig.positionMobile : emotionConfig.positionDesktop;
        const targetPos = new THREE.Vector3(
          position[0] * 0.3,
          position[1] * 0.3,
          focusDistance
        );
        camera.position.lerp(targetPos, 0.1);
        const lookAtTarget = new THREE.Vector3(position[0] * 0.5, position[1] * 0.5, 0);
        camera.lookAt(lookAtTarget);
      }
    } else if (animationPhase === 'idle' || animationPhase === 'initial' || animationPhase === 'splitting') {
      camera.position.lerp(new THREE.Vector3(0, 0, defaultCameraZ), 0.05);
      camera.lookAt(0, 0, 0);
    }
  });

  return null;
}

function SceneContent({ isMobile }: { isMobile: boolean }) {
  const [, setLocation] = useLocation();
  const { setActiveEmotion, animationPhase, isSplit, setAnimationPhase } = useEmotionStore();
  const { goBackToSplit, goBackToInitial, activeEmotion } = useEmotionStore();
  const defaultCameraZ = isMobile ? 13 : 18;

  const handleEmotionClick = (emotionType: EmotionType) => {
    if (!isSplit) return;

    // 1st Click: Zoom/Focus
    if (activeEmotion !== emotionType) {
      console.log("First click - Focusing on:", emotionType);
      setActiveEmotion(emotionType);
      setAnimationPhase('focusing');
    }
    // 2nd Click (Same Sphere): Navigate
    else if (activeEmotion === emotionType) {
      console.log(`🚀 Navigating to /emotion/${emotionType}`);
      setLocation(`/emotion/${emotionType}`);
    }
  };

  const handleBackgroundClick = () => {
    // Background Click: Reset to Idle
    if (activeEmotion) {
      goBackToSplit(); // Resets activeEmotion to null and phase to idle
    } else if (isSplit && animationPhase === 'idle') {
      goBackToInitial();
    }
  };

  return (
    <MobileContext.Provider value={isMobile}>
      <PerspectiveCamera makeDefault position={[0, 0, defaultCameraZ]} fov={50} />
      <CameraController isMobile={isMobile} />

      {/* Background click plane */}
      <mesh position={[0, 0, -10]} onClick={handleBackgroundClick}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1.2} castShadow />
      <pointLight position={[10, 10, 10]} intensity={1.5} />
      <pointLight position={[-10, -10, -10]} intensity={0.7} color="#4D96FF" />
      <pointLight position={[0, 10, -5]} intensity={0.5} color="#FFD700" />
      <spotLight position={[0, 15, 0]} angle={0.3} penumbra={1} intensity={0.8} color="#ffffff" />

      <MainSphere />

      <Particles />

      {EMOTION_CONFIG.map((config, index) => (
        <EmotionSphere
          key={config.type}
          config={config}
          index={index}
          onClick={() => handleEmotionClick(config.type)}
        />
      ))}

      <Environment preset="warehouse" background={false} />
    </MobileContext.Provider>
  );
}

function FallbackScene() {
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: '#f8f9fa' }}>
      <div className="text-center p-8">
        <div className="text-6xl mb-4">🌐</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">WebGL Not Supported</h2>
        <p className="text-gray-500 max-w-sm">
          Your browser doesn't support WebGL, which is required for the 3D experience.
          Please try using a modern browser like Chrome, Firefox, or Safari.
        </p>
      </div>
    </div>
  );
}

function checkWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch (e) {
    return false;
  }
}

export function Scene() {
  const { activeEmotion, animationPhase } = useEmotionStore();
  const activeConfig = EMOTION_CONFIG.find(e => e.type === activeEmotion);
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setWebglSupported(checkWebGLSupport());

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (webglSupported === null) {
    return (
      <div className="fixed inset-0 w-full h-full flex items-center justify-center" style={{ backgroundColor: '#f8f9fa' }}>
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full" style={{ backgroundColor: '#f8f9fa', zIndex: 0 }}>
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          backgroundColor: activeConfig?.color || 'transparent',
          opacity: animationPhase === 'transitioning' ? 1 : 0,
          zIndex: animationPhase === 'transitioning' ? 50 : -1,
        }}
      />
      {webglSupported ? (
        <ErrorBoundary fallback={<FallbackScene />}>
          <Canvas
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent', zIndex: 1 }}
          >
            <Suspense fallback={null}>
              <SceneContent isMobile={isMobile} />
            </Suspense>
          </Canvas>
        </ErrorBoundary>
      ) : (
        <FallbackScene />
      )}
    </div>
  );
}