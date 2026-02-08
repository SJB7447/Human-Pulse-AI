import { create } from 'zustand';

export type EmotionType = 'joy' | 'anger' | 'sadness' | 'fear' | 'calm';

export interface EmotionConfig {
  type: EmotionType;
  label: string;
  labelKo: string;
  color: string;
  pastelColor: string;
  position: [number, number, number];
  positionDesktop: [number, number, number];
  positionMobile: [number, number, number];
  scaleDesktop: number;
  scaleMobile: number;
}

export const EMOTION_CONFIG: EmotionConfig[] = [
  {
    type: 'joy',
    label: 'Joy',
    labelKo: '기쁨',
    color: '#ffd150',
    pastelColor: '#f9e1a5',
    position: [0, 5.5, 0],
    positionDesktop: [0, 5.5, 0],
    positionMobile: [0, 3.2, 0],
    scaleDesktop: 0.75,
    scaleMobile: 0.5
  },
  {
    type: 'anger',
    label: 'Anger',
    labelKo: '분노',
    color: '#f4606b',
    pastelColor: '#ffc7ce',
    position: [5.2, 1.7, 0],
    positionDesktop: [5.2, 1.7, 0],
    positionMobile: [1.3, 1.0, 0],
    scaleDesktop: 0.75,
    scaleMobile: 0.5
  },
  {
    type: 'sadness',
    label: 'Sadness',
    labelKo: '슬픔',
    color: '#3f65ef',
    pastelColor: '#bdcaef',
    position: [3.2, -4.5, 0],
    positionDesktop: [3.2, -4.5, 0],
    positionMobile: [0.9, -1.8, 0],
    scaleDesktop: 0.75,
    scaleMobile: 0.5
  },
  {
    type: 'fear',
    label: 'Fear',
    labelKo: '두려움',
    color: '#bababa',
    pastelColor: '#e5e5e5',
    position: [-3.2, -4.5, 0],
    positionDesktop: [-3.2, -4.5, 0],
    positionMobile: [-0.9, -1.8, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
  },
  {
    type: 'calm',
    label: 'Calm',
    labelKo: '평온',
    color: '#88d84a',
    pastelColor: '#b8f498',
    position: [-5.2, 1.7, 0],
    positionDesktop: [-5.2, 1.7, 0],
    positionMobile: [-1.3, 1.0, 0],
    scaleDesktop: 0.75,
    scaleMobile: 0.5
  },
];

type AnimationPhase = 'intro' | 'initial' | 'splitting' | 'idle' | 'focusing' | 'focused' | 'gathering' | 'zooming' | 'transitioning' | 'merging';

export interface User {
  id: string;
  email?: string;
  name?: string;
  role?: 'admin' | 'journalist' | 'general';
}

interface EmotionState {
  activeEmotion: EmotionType | null;
  hoveredEmotion: EmotionType | null;
  animationPhase: AnimationPhase;
  isTransitioning: boolean;
  isSplit: boolean;
  showIntro: boolean;
  user: User | null;
  setActiveEmotion: (emotion: EmotionType | null) => void;
  setHoveredEmotion: (emotion: EmotionType | null) => void;
  setAnimationPhase: (phase: AnimationPhase) => void;
  setIsTransitioning: (transitioning: boolean) => void;
  setIsSplit: (split: boolean) => void;
  setShowIntro: (show: boolean) => void;
  setUser: (user: User | null) => void;
  goBackToSplit: () => void;
  goBackToInitial: () => void;
  reset: () => void;
}

export const useEmotionStore = create<EmotionState>((set) => ({
  activeEmotion: null,
  hoveredEmotion: null,
  animationPhase: 'intro',
  isTransitioning: false,
  isSplit: false,
  showIntro: true,
  user: null,
  setActiveEmotion: (emotion) => set({ activeEmotion: emotion }),
  setHoveredEmotion: (emotion) => set({ hoveredEmotion: emotion }),
  setAnimationPhase: (phase) => set({ animationPhase: phase }),
  setIsTransitioning: (transitioning) => set({ isTransitioning: transitioning }),
  setIsSplit: (split) => set({ isSplit: split }),
  setShowIntro: (show) => set({ showIntro: show }),
  setUser: (user) => set({ user }),
  goBackToSplit: () => set({ activeEmotion: null, animationPhase: 'idle', hoveredEmotion: null }),
  goBackToInitial: () => set({
    activeEmotion: null,
    hoveredEmotion: null,
    animationPhase: 'merging',
    isSplit: false
  }),
  reset: () => set({
    activeEmotion: null,
    hoveredEmotion: null,
    animationPhase: 'intro',
    isTransitioning: false,
    isSplit: false,
    showIntro: true,
    user: null,
  }),
}));
