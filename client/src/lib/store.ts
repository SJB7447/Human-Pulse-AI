import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type EmotionType = 'vibrance' | 'immersion' | 'clarity' | 'gravity' | 'serenity' | 'spectrum';

export interface EmotionConfig {
  type: EmotionType;
  label: string;
  labelKo: string;
  subLabel: string;
  subLabelKo: string;
  recommendedNews: string[];
  color: string;
  pastelColor: string;
  colorVariations: string[]; // Light to dark variations for card backgrounds
  gradientColor?: string; // For gradient spheres like neutral
  position: [number, number, number];
  positionDesktop: [number, number, number];
  positionMobile: [number, number, number];
  scaleDesktop: number;
  scaleMobile: number;
}

export const EMOTION_CONFIG: EmotionConfig[] = [
  {
    type: 'vibrance',
    label: 'Vibrance',
    labelKo: '설렘· 기쁨',
    subLabel: '기쁨과 활력을 주는 뉴스',
    subLabelKo: '기쁨과 활력을 주는 뉴스',
    recommendedNews: [
      '반가운 변화가 보이는 기사',
      '활력을 주는 흐름',
      '기분 좋게 읽히는 소식'
    ],
    color: '#ffd150',
    pastelColor: '#ffedc5',
    colorVariations: ['#ffedc5', '#ffe197', '#ffd150', '#e6b83f'], // LOW/MID/BASE + deeper accent
    position: [0, 5.5, 0],
    positionDesktop: [0, 5.5, 0],
    positionMobile: [-1.05, 3.65, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.42
  },
  {
    type: 'immersion',
    label: 'Immersion',
    labelKo: '긴장· 열정',
    subLabel: '긴장감과 열정이 느껴지는 뉴스',
    subLabelKo: '긴장감과 열정이 느껴지는 뉴스',
    recommendedNews: [
      '긴장감 높은 전개',
      '열기가 느껴지는 이슈',
      '강한 몰입을 만드는 기사'
    ],
    color: '#f4606b',
    pastelColor: '#ffc7ce',
    colorVariations: ['#ffc7ce', '#ff97a9', '#f4606b', '#d94a54'], // Light pink to deep coral red
    position: [5.2, 1.7, 0],
    positionDesktop: [5.2, 1.7, 0],
    positionMobile: [1.1, 2.05, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.42
  },
  {
    type: 'clarity',
    label: 'Clarity',
    labelKo: '냉철· 이성적',
    subLabel: '이성적이고 차분하게 읽히는 뉴스',
    subLabelKo: '이성적이고 차분하게 읽히는 뉴스',
    recommendedNews: [
      '맥락을 분석하며 읽는 기사',
      '차분한 해설 중심',
      '판단을 돕는 정보'
    ],
    color: '#3f65ef',
    pastelColor: '#cad8ff',
    colorVariations: ['#cad8ff', '#8dabff', '#3f65ef', '#2a4bc0'], // LOW/MID/BASE + deeper accent
    position: [3.2, -4.5, 0],
    positionDesktop: [3.2, -4.5, 0],
    positionMobile: [1.05, -4.65, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.42
  },
  {
    type: 'gravity',
    label: 'Gravity',
    labelKo: '묵직함· 성찰',
    subLabel: '무겁고 깊은 성찰을 유도하는 뉴스',
    subLabelKo: '무겁고 깊은 성찰을 유도하는 뉴스',
    recommendedNews: [
      '쉽게 넘길 수 없는 문제',
      '무게감 있는 쟁점',
      '깊은 생각을 남기는 기사'
    ],
    color: '#bababa',
    pastelColor: '#e5e5e5',
    colorVariations: ['#e5e5e5', '#d1d1d1', '#bababa', '#999898'], // LOW/MID/BASE + darker gray
    position: [-3.2, -4.5, 0],
    positionDesktop: [-3.2, -4.5, 0],
    positionMobile: [-1.1, -2.95, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.42
  },
  {
    type: 'serenity',
    label: 'Serenity',
    labelKo: '힐링· 안정',
    subLabel: '마음이 회복되고 안정되는 뉴스',
    subLabelKo: '마음이 회복되고 안정되는 뉴스',
    recommendedNews: [
      '마음을 가라앉히는 읽기',
      '회복감을 주는 이야기',
      '안정을 돕는 정보'
    ],
    color: '#88d84a',
    pastelColor: '#caf2a7',
    colorVariations: ['#caf2a7', '#adef73', '#88d84a', '#66b53a'], // LOW/MID/BASE + deeper accent
    position: [-5.2, 1.7, 0],
    positionDesktop: [-5.2, 1.7, 0],
    positionMobile: [-1.05, 0.35, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.42
  },
  {
    type: 'spectrum',
    label: 'Spectrum',
    labelKo: '스펙트럼',
    subLabel: '여러 감정 결의 뉴스를 함께 보는 모아보기',
    subLabelKo: '여러 감정 결의 뉴스를 함께 보는 모아보기',
    recommendedNews: [
      '다양한 감정 톤의 뉴스를 함께 보기'
    ],
    color: '#00abaf',
    pastelColor: '#a0e8dc',
    colorVariations: ['#a0e8dc', '#00abaf', '#a773f9', '#7c4dff'], // Teal logo to violet gradient
    gradientColor: '#a773f9',
    position: [0, 0, 0],
    positionDesktop: [0, 0, 0],
    positionMobile: [1.15, -1.3, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.42
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

export const useEmotionStore = create<EmotionState>()(persist((set) => ({
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
}), {
  name: 'emotion-store-v1',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ user: state.user }),
}));
