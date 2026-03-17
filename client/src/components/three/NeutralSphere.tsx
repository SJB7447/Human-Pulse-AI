import { useRef, useState, useEffect, useContext } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { MeshDistortMaterial, Html } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { useLocation } from 'wouter';
import { useEmotionStore, EMOTION_CONFIG } from '@/lib/store';
import { MobileContext } from './Scene';

export function NeutralSphere() {
    const groupRef = useRef<THREE.Group>(null);
    const [hovered, setHovered] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const distortRef = useRef(0.2);
    const materialRef = useRef<any>(null);
    const { activeEmotion, hoveredEmotion, setHoveredEmotion, animationPhase, isSplit, setActiveEmotion, setAnimationPhase } = useEmotionStore();
    const isMobile = useContext(MobileContext);
    const [, setLocation] = useLocation();

    const config = EMOTION_CONFIG.find(e => e.type === 'spectrum')!;
    const isActive = activeEmotion === 'spectrum';
    const isHovered = hoveredEmotion === 'spectrum';
    const isOtherActive = activeEmotion !== null && !isActive;
    const isMerging = animationPhase === 'merging';
    const shouldShow = isSplit || animationPhase === 'splitting' || isMerging;

    const position = isMobile ? config.positionMobile : config.positionDesktop;

    // Dynamic scale based on viewport - smooth transition between mobile and desktop
    const [viewportScale, setViewportScale] = useState(1);
    useEffect(() => {
        const updateScale = () => {
            const width = window.innerWidth;
            // Scale smoothly: 768px = 0.45, 1200px = 0.75, 1600px+ = 0.95
            if (width < 768) {
                setViewportScale(0.45);
            } else if (width < 1200) {
                setViewportScale(0.45 + ((width - 768) / (1200 - 768)) * 0.3);
            } else if (width < 1600) {
                setViewportScale(0.75 + ((width - 1200) / (1600 - 1200)) * 0.2);
            } else {
                setViewportScale(0.95);
            }
        };
        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    const baseScale = isMobile ? config.scaleMobile : viewportScale;

    // Staggered appearance delay (appear last, in center)
    useEffect(() => {
        if (shouldShow && !isReady && !isMerging) {
            const delay = 5 * 120 + 100;
            const timer = setTimeout(() => setIsReady(true), delay);
            return () => clearTimeout(timer);
        } else if (!shouldShow && !isMerging) {
            setIsReady(false);
        }
    }, [shouldShow, isReady, isMerging]);

    const isFocusing = animationPhase === 'focusing' || animationPhase === 'focused';
    const activeScale = isFocusing && isActive ? baseScale * 1.5 : isActive ? baseScale * 1.8 : baseScale;

    // Use different spring configs: fast for appearing, very slow for focusing animation
    const focusingConfig = { mass: 8, tension: 8, friction: 35 }; // Very slow and smooth for click transition
    const normalConfig = { mass: 2, tension: 80, friction: 18 }; // Normal speed for appearing

    const { scale, positionX, positionY, positionZ, opacity } = useSpring({
        scale: isMerging ? 0 : (!shouldShow || !isReady ? 0 : isActive ? activeScale : isHovered ? baseScale * 1.15 : baseScale),
        positionX: isMerging ? 0 : (shouldShow ? position[0] : 0),
        positionY: isMerging ? 0 : (shouldShow ? position[1] : 0),
        positionZ: isMerging ? 0 : (shouldShow ? position[2] : 0),
        opacity: isMerging ? 0 : (!shouldShow || !isReady ? 0 : (isOtherActive && !isActive ? 0.25 : 0.95)),
        config: isFocusing ? focusingConfig : normalConfig,
    });

    useFrame((state) => {
        if (groupRef.current && shouldShow && materialRef.current) {
            const time = state.clock.getElapsedTime();
            const pulseScale = 1 + Math.sin(time * 2 + config.position[0]) * 0.03;
            groupRef.current.scale.setScalar(pulseScale);

            const mouse = state.pointer;
            // Smoother, rounder distortion: lower base, higher on hover
            const targetDistort = isHovered ? 0.4 + Math.abs(mouse.x) * 0.15 + Math.abs(mouse.y) * 0.15 : 0.2;
            const easingSpeed = targetDistort > distortRef.current ? 0.08 : 0.015;
            distortRef.current += (targetDistort - distortRef.current) * easingSpeed;
            materialRef.current.distort = distortRef.current;
        }
    });

    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (isSplit && (animationPhase === 'idle' || animationPhase === 'focused')) {
            setHovered(true);
            setHoveredEmotion('spectrum');
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
        if (!isSplit) return;

        // Start focusing animation
        setActiveEmotion('spectrum');
        setAnimationPhase('focusing');

        // Navigate after 1 second delay to show particle animation
        setTimeout(() => {
            console.log('🚀 Navigating to /emotion/spectrum');
            setLocation('/emotion/spectrum');
        }, 1000);
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
                    distort={0.2}
                    speed={isHovered ? 4 : 2}
                    roughness={0.15}
                    metalness={0.25}
                    transparent
                    opacity={isOtherActive && !isActive ? 0.3 : 0.95}
                    envMapIntensity={1.8}
                />
            </animated.mesh>

            {isHovered && animationPhase === 'idle' && isSplit && (
                <Html
                    position={[0, 0, 0]}
                    center
                    style={{
                        pointerEvents: 'none',
                        userSelect: 'none',
                    }}
                >
                    <div
                        className="px-4 py-3 rounded-xl text-center whitespace-nowrap"
                        style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.94)',
                            backdropFilter: 'blur(20px) saturate(145%)',
                            WebkitBackdropFilter: 'blur(20px) saturate(145%)',
                            border: '1px solid rgba(148, 163, 184, 0.26)',
                            boxShadow: `0 14px 34px rgba(15, 23, 42, 0.18), 0 6px 20px ${config.color}24, inset 0 1px 0 rgba(255,255,255,0.86)`,
                        }}
                    >
                        <div className="text-base font-semibold tracking-tight" style={{ color: '#0f172a', textShadow: '0 1px 0 rgba(255,255,255,0.32)' }}>
                            {config.label}
                        </div>
                        <div className="mt-0.5 text-xs font-semibold" style={{ color: 'rgba(15, 23, 42, 0.86)' }}>
                            {config.labelKo}
                        </div>
                    </div>
                </Html>
            )}
        </animated.group>
    );
}
