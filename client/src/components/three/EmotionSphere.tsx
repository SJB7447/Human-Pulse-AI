import { useRef, useState, useEffect, useContext } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { MeshDistortMaterial, Html } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { EmotionConfig, useEmotionStore } from '@/lib/store';
import { MobileContext } from './Scene';

interface EmotionSphereProps {
  config: EmotionConfig;
  onClick: () => void;
  index: number;
}

export function EmotionSphere({ config, onClick, index }: EmotionSphereProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const distortRef = useRef(0.4);
  const materialRef = useRef<any>(null);
  const { activeEmotion, hoveredEmotion, setHoveredEmotion, animationPhase, isSplit } = useEmotionStore();
  const isMobile = useContext(MobileContext);

  const isActive = activeEmotion === config.type;
  const isHovered = hoveredEmotion === config.type;
  const isOtherActive = activeEmotion !== null && !isActive;
  const isMerging = animationPhase === 'merging';
  const shouldShow = isSplit || animationPhase === 'splitting' || isMerging;

  const position = isMobile ? config.positionMobile : config.positionDesktop;
  const baseScale = isMobile ? config.scaleMobile : config.scaleDesktop;

  // Staggered appearance delay
  useEffect(() => {
    if (shouldShow && !isReady && !isMerging) {
      const delay = index * 120; // 120ms delay per sphere
      const timer = setTimeout(() => setIsReady(true), delay);
      return () => clearTimeout(timer);
    } else if (!shouldShow && !isMerging) {
      setIsReady(false);
    }
  }, [shouldShow, index, isReady, isMerging]);

  const isFocusing = animationPhase === 'focusing' || animationPhase === 'focused';
  const activeScale = isFocusing && isActive ? baseScale * 1.5 : isActive ? baseScale * 1.8 : baseScale;

  const { scale, positionX, positionY, positionZ, opacity } = useSpring({
    scale: isMerging ? 0 : (!shouldShow || !isReady ? 0 : isActive ? activeScale : isHovered ? baseScale * 1.15 : baseScale),
    positionX: isMerging ? 0 : (shouldShow ? position[0] : 0),
    positionY: isMerging ? 0 : (shouldShow ? position[1] : 0),
    positionZ: isMerging ? 0 : (shouldShow ? position[2] : 0),
    opacity: isMerging ? 0 : (!shouldShow || !isReady ? 0 : (isOtherActive && !isActive ? 0.25 : 0.95)),
    config: { mass: 2, tension: 80, friction: 18 },
  });

  useFrame((state) => {
    if (groupRef.current && shouldShow && materialRef.current) {
      const time = state.clock.getElapsedTime();
      const pulseScale = 1 + Math.sin(time * 2 + config.position[0]) * 0.03;
      groupRef.current.scale.setScalar(pulseScale);

      const mouse = state.pointer;
      const targetDistort = isHovered ? 0.7 + Math.abs(mouse.x) * 0.3 + Math.abs(mouse.y) * 0.3 : 0.5;
      const easingSpeed = targetDistort > distortRef.current ? 0.08 : 0.015;
      distortRef.current += (targetDistort - distortRef.current) * easingSpeed;
      materialRef.current.distort = distortRef.current;
    }
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (isSplit && (animationPhase === 'idle' || animationPhase === 'focused')) {
      setHovered(true);
      setHoveredEmotion(config.type);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    setHoveredEmotion(null);
    document.body.style.cursor = 'auto';
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Allow click whenever spheres are stably split or in focus interaction
    if (isSplit) {
      onClick();
    }
  };

  return (
    <animated.group
      ref={groupRef}
      position-x={positionX}
      position-y={positionY}
      position-z={positionZ}
    >
      <animated.mesh
        scale={scale}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        visible={shouldShow}
      >
        <sphereGeometry args={[2.4, 64, 64]} />
        <MeshDistortMaterial
          ref={materialRef}
          color={config.color}
          attach="material"
          distort={0.5}
          speed={isHovered ? 5 : 2.5}
          roughness={0.15}
          metalness={0.25}
          transparent
          opacity={isOtherActive && !isActive ? 0.3 : 0.95}
          envMapIntensity={1.8}
        />
      </animated.mesh>

      {isHovered && animationPhase === 'idle' && isSplit && (
        <Html
          position={[0, 3.5, 0]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div
            className="px-4 py-2 rounded-xl text-center whitespace-nowrap"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: `0 4px 20px ${config.color}40, 0 8px 32px rgba(0, 0, 0, 0.15)`,
            }}
          >
            <div className="text-base font-semibold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
              {config.labelKo}
            </div>
            <div className="text-xs text-white/70 mt-0.5">
              {config.label}
            </div>
          </div>
        </Html>
      )}
    </animated.group>
  );
}
