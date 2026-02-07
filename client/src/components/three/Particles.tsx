import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EMOTION_CONFIG, useEmotionStore, EmotionType } from '@/lib/store';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: string;
  emotionType: EmotionType;
  phase: 'hidden' | 'spawning' | 'floating' | 'flying' | 'absorbing' | 'absorbed';
  stuckOffset: THREE.Vector3;
  floatOffset: number;
  scale: number;
  baseScale: number;
  spawnDelay: number;
  opacity: number;
  absorbStartTime: number | null;
}

const PARTICLE_COUNT = 150;

export function Particles() {
  const groupRef = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const [isHovering, setIsHovering] = useState(false);
  const { activeEmotion, animationPhase, setAnimationPhase, isSplit } = useEmotionStore();

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      // Ensure even distribution of colors: 30 particles per color (for 150 count)
      const emotionConfig = EMOTION_CONFIG[i % EMOTION_CONFIG.length];
      const x = (Math.random() - 0.5) * 30;
      const y = (Math.random() - 0.5) * 20;
      const z = (Math.random() - 0.5) * 6 - 3;

      const sizeMultiplier = 0.5 + Math.random() * 1.0;
      const baseScale = 0.08 + Math.random() * 0.08;

      return {
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.01,
          (Math.random() - 0.5) * 0.01,
          (Math.random() - 0.5) * 0.005
        ),
        color: emotionConfig.color,
        emotionType: emotionConfig.type,
        phase: 'hidden' as const,
        stuckOffset: new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8
        ).normalize().multiplyScalar(0.5 + Math.random() * 0.15),
        floatOffset: Math.random() * Math.PI * 2,
        scale: baseScale * sizeMultiplier,
        baseScale: baseScale,
        spawnDelay: 0.3 + Math.random() * 1.8,
        opacity: 1,
        absorbStartTime: null,
      };
    });
  }, []);

  const meshRefs = useRef<(THREE.Group | null)[]>([]);
  const stuckCountRef = useRef(0);
  const gatheringStartedRef = useRef(false);
  const splitTimeRef = useRef<number | null>(null);
  const hasSpawnedRef = useRef(false);

  useEffect(() => {
    if (isSplit && animationPhase === 'idle' && !hasSpawnedRef.current) {
      splitTimeRef.current = Date.now();
      hasSpawnedRef.current = true;
      particles.forEach(p => {
        p.phase = 'spawning';
      });
    }

    if (!isSplit && animationPhase === 'initial') {
      hasSpawnedRef.current = false;
      splitTimeRef.current = null;
      particles.forEach(p => {
        p.phase = 'hidden';
      });
    }
  }, [isSplit, animationPhase, particles]);

  useEffect(() => {
    const handlePointerEnter = () => setIsHovering(true);
    const handlePointerLeave = () => setIsHovering(false);

    // Attach listeners to the canvas element
    const canvas = gl.domElement;
    canvas.addEventListener('pointerenter', handlePointerEnter);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      canvas.removeEventListener('pointerenter', handlePointerEnter);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [gl]);

  useEffect(() => {
    // When an emotion is selected (activeEmotion is set), trigger particles to fly to their respective spheres
    // We do NOT change the global animationPhase to 'gathering' because that might block the camera controller
    // which expects 'focusing'. We just let the particles do their thing.
    if (activeEmotion) {
      if (!gatheringStartedRef.current) {
        gatheringStartedRef.current = true;
        stuckCountRef.current = 0;
      }
      particles.forEach(p => {
        if (p.phase === 'floating') {
          p.phase = 'flying';
        }
      });
    } else if (!activeEmotion && animationPhase !== 'idle' && animationPhase !== 'initial' && animationPhase !== 'splitting' && animationPhase !== 'intro') {
      particles.forEach(p => {
        p.phase = 'hidden';
        p.opacity = 1;
        p.absorbStartTime = null;
        p.position.set(
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 6 - 3
        );
      });
      gatheringStartedRef.current = false;
      stuckCountRef.current = 0;
      splitTimeRef.current = null;
      hasSpawnedRef.current = false;
    }
  }, [activeEmotion, animationPhase, particles, setAnimationPhase]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    let newStuckCount = 0;

    particles.forEach((particle, i) => {
      const group = meshRefs.current[i];
      if (!group) return;

      if (particle.phase === 'hidden') {
        group.visible = false;
        return;
      }

      group.visible = true;

      if (particle.phase === 'spawning' && splitTimeRef.current) {
        const elapsed = (Date.now() - splitTimeRef.current) / 1000;
        if (elapsed > particle.spawnDelay) {
          particle.phase = 'floating';
        } else {
          // Smooth easing function for spawn
          const t = elapsed / particle.spawnDelay;
          const easeOut = 1 - Math.pow(1 - t, 3);
          group.scale.setScalar(particle.scale * easeOut);
          group.position.copy(particle.position);
          return;
        }
      }

      if (particle.phase === 'floating') {
        // Organic floating movement (reduced intensity)
        particle.position.x += Math.sin(time * 0.5 + particle.floatOffset) * 0.001;
        particle.position.y += Math.cos(time * 0.3 + particle.floatOffset) * 0.001;
        particle.position.z += Math.sin(time * 0.4 + particle.floatOffset) * 0.001;

        // Mouse Attraction Logic - Only active if hovering
        if (isHovering) {
          // Convert normalized mouse coordinates (-1 to 1) to world coordinates
          // Using viewport width/height to approximate world bounds at z=0
          const viewport = state.viewport;
          const targetX = (state.pointer.x * viewport.width) / 2;
          const targetY = (state.pointer.y * viewport.height) / 2;

          // Calculate vector to mouse
          const dx = targetX - particle.position.x;
          const dy = targetY - particle.position.y;

          // Apply attraction force (stronger when closer, but clamped)
          // We add to velocity to create momentum
          const force = 0.02;

          // Give each particle a slightly different reaction speed based on index/random
          const randomness = 0.8 + (i % 5) * 0.1;

          particle.velocity.x += dx * force * randomness * 0.03;
          particle.velocity.y += dy * force * randomness * 0.03;
        }

        // Add friction/damping to prevent infinite acceleration
        // This also helps them "stop" floating in place when mouse leaves
        particle.velocity.multiplyScalar(0.95);

        particle.position.add(particle.velocity);

        // Soft boundaries
        if (Math.abs(particle.position.x) > 20) particle.velocity.x *= -1;
        if (Math.abs(particle.position.y) > 15) particle.velocity.y *= -1;
        if (Math.abs(particle.position.z) > 8) particle.velocity.z *= -1;
      } else if (particle.phase === 'flying' && activeEmotion) {
        const targetEmotion = EMOTION_CONFIG.find(e => e.type === particle.emotionType);
        if (targetEmotion) {
          const target = new THREE.Vector3(...targetEmotion.position);
          const stuckPosition = target.clone().add(particle.stuckOffset);

          const direction = stuckPosition.clone().sub(particle.position);
          const distance = direction.length();

          if (distance < 0.3) {
            particle.phase = 'absorbing';
            particle.absorbStartTime = time;
            particle.position.copy(stuckPosition);
          } else {
            const speed = Math.min(0.08, distance * 0.15);
            direction.normalize().multiplyScalar(speed);
            particle.position.add(direction);
          }
        }
      } else if (particle.phase === 'absorbing') {
        const targetEmotion = EMOTION_CONFIG.find(e => e.type === particle.emotionType);
        if (targetEmotion && particle.absorbStartTime !== null) {
          const target = new THREE.Vector3(...targetEmotion.position);
          const absorbDuration = 0.8;
          const elapsed = time - particle.absorbStartTime;
          const progress = Math.min(1, elapsed / absorbDuration);

          const easeOut = 1 - Math.pow(1 - progress, 3);
          particle.opacity = 1 - easeOut;

          const shrinkScale = particle.scale * (1 - easeOut * 0.7);
          group.scale.setScalar(shrinkScale);

          const moveToCenter = particle.stuckOffset.clone().multiplyScalar(1 - easeOut * 0.8);
          particle.position.copy(target).add(moveToCenter);

          if (progress >= 1) {
            particle.phase = 'absorbed';
            particle.opacity = 0;
            newStuckCount++;
          }
        }
      } else if (particle.phase === 'absorbed') {
        newStuckCount++;
        group.visible = false;
        return;
      }

      group.position.copy(particle.position);
      const breathe = 1 + Math.sin(time * 2 + i * 0.1) * 0.2;
      group.scale.setScalar(particle.scale * breathe);
    });

    if (gatheringStartedRef.current && newStuckCount >= PARTICLE_COUNT * 0.9 && animationPhase === 'gathering') {
      setAnimationPhase('zooming');
    }
  });

  const sharedGeometry = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);

  const materialRefs = useRef<(THREE.MeshPhysicalMaterial | null)[]>([]);

  useFrame(() => {
    particles.forEach((particle, i) => {
      const material = materialRefs.current[i];
      if (material && (particle.phase === 'absorbing' || particle.phase === 'absorbed')) {
        material.opacity = particle.opacity * 0.85;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {particles.map((particle, i) => {
        const sizeRatio = particle.scale / particle.baseScale;
        const baseOpacity = Math.max(0.6, Math.min(0.9, 0.9 - sizeRatio * 0.2));

        return (
          <group
            key={i}
            ref={(el) => { meshRefs.current[i] = el; }}
            position={particle.position}
            visible={false}
          >
            <mesh geometry={sharedGeometry}>
              <meshPhysicalMaterial
                ref={(el) => { materialRefs.current[i] = el; }}
                color={particle.color}
                transparent
                opacity={baseOpacity}
                roughness={0.05}
                metalness={0.1}
                transmission={0.9}
                thickness={0.5}
                ior={1.4}
                envMapIntensity={1.2}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
