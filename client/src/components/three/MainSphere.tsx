import { useRef, useState, useEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere, Html } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { useEmotionStore } from '@/lib/store';

export function MainSphere() {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [mergeReady, setMergeReady] = useState(false);
  const distortRef = useRef(0.3);
  const materialRef = useRef<any>(null);
  const { animationPhase, setAnimationPhase, setIsSplit } = useEmotionStore();
  
  const isVisible = animationPhase === 'initial' || animationPhase === 'merging' || animationPhase === 'intro';

  const opacityRef = useRef(1);
  const sizeRef = useRef(1);

  // Delay MainSphere appearance during merging to let emotion spheres converge first
  useEffect(() => {
    if (animationPhase === 'merging') {
      setMergeReady(false);
      opacityRef.current = 0;
      sizeRef.current = 0.3;
      const timer = setTimeout(() => setMergeReady(true), 400);
      return () => clearTimeout(timer);
    } else {
      setMergeReady(false);
    }
  }, [animationPhase]);

  const { scale, opacity } = useSpring({
    scale: animationPhase === 'splitting' ? 0 : (animationPhase === 'merging' && mergeReady) ? 1 : (animationPhase === 'initial' || animationPhase === 'intro') ? (hovered ? 1.1 : 1) : 0,
    opacity: animationPhase === 'splitting' ? 0 : (animationPhase === 'merging' && mergeReady) ? 1 : (animationPhase === 'initial' || animationPhase === 'intro') ? 1 : 0,
    config: { mass: 2, tension: 100, friction: 18 },
    onRest: () => {
      if (animationPhase === 'splitting') {
        setIsSplit(true);
        setAnimationPhase('idle');
      } else if (animationPhase === 'merging' && mergeReady) {
        setAnimationPhase('initial');
      }
    },
  });

  useFrame((state) => {
    if (meshRef.current && isVisible && materialRef.current) {
      const time = state.clock.getElapsedTime();
      
      // Smooth opacity transition
      const targetOpacity = (animationPhase === 'merging' && mergeReady) ? 1 : (animationPhase === 'initial' || animationPhase === 'intro') ? 1 : 0;
      opacityRef.current += (targetOpacity - opacityRef.current) * 0.04;
      materialRef.current.opacity = opacityRef.current;
      
      // Smooth size transition from small to large
      const targetSize = (animationPhase === 'merging' && mergeReady) ? 1 : (animationPhase === 'initial' || animationPhase === 'intro') ? 1 : 0.3;
      sizeRef.current += (targetSize - sizeRef.current) * 0.04;
      const pulseScale = 1 + Math.sin(time * 1.5) * 0.05;
      meshRef.current.scale.setScalar(sizeRef.current * pulseScale);
      
      const mouse = state.pointer;
      const targetDistort = hovered ? 0.6 + Math.abs(mouse.x) * 0.35 + Math.abs(mouse.y) * 0.35 : 0.4;
      const easingSpeed = targetDistort > distortRef.current ? 0.08 : 0.015;
      distortRef.current += (targetDistort - distortRef.current) * easingSpeed;
      materialRef.current.distort = distortRef.current;
    }
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (animationPhase === 'initial') {
      setHovered(true);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = 'auto';
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (animationPhase === 'initial') {
      setAnimationPhase('splitting');
    }
  };

  if (!isVisible && animationPhase !== 'splitting') {
    return null;
  }

  return (
    <group position={[0, 0, 0]}>
      <animated.mesh
        ref={meshRef}
        scale={scale}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[3.2, 64, 64]} />
        <MeshDistortMaterial
          ref={materialRef}
          color="#9CA3AF"
          attach="material"
          distort={0.4}
          speed={hovered ? 4 : 2}
          roughness={0.15}
          metalness={0.3}
          transparent
          opacity={0}
          envMapIntensity={1.5}
        />
      </animated.mesh>
      
      {hovered && animationPhase === 'initial' && (
        <Html
          position={[0, 4.5, 0]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div
            className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#374151',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            }}
          >
            Click to explore emotions
          </div>
        </Html>
      )}
    </group>
  );
}
