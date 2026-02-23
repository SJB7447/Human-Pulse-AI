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
    label: '설레는 파동',
    labelKo: '기쁨/활력/긍정',
    subLabel: '기분 좋게 번지는 긍정의 리듬',
    subLabelKo: '기분 좋게 번지는 긍정의 리듬',
    recommendedNews: [
      '미담·선행·긍정 뉴스',
      '연예·문화·콘텐츠 소식',
      '축제·행사·라이프스타일',
      '스포츠 하이라이트(긍정 톤)'
    ],
    color: '#ffd150',
    pastelColor: '#ffedc5',
    colorVariations: ['#ffedc5', '#ffe197', '#ffd150', '#e6b83f'], // LOW/MID/BASE + deeper accent
    position: [0, 5.5, 0],
    positionDesktop: [0, 5.5, 0],
    positionMobile: [0, 3.2, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
  },
  {
    type: 'immersion',
    label: '격렬한 몰입',
    labelKo: '열정/주의/긴장',
    subLabel: '변화를 만들어내는 강렬한 에너지',
    subLabelKo: '변화를 만들어내는 강렬한 에너지',
    recommendedNews: [
      '정치 이슈',
      '속보·긴급 이슈',
      '사회 갈등·공적 논쟁',
      '노동·시위·정책 충돌'
    ],
    color: '#f4606b',
    pastelColor: '#ffc7ce',
    colorVariations: ['#ffc7ce', '#ff97a9', '#f4606b', '#d94a54'], // Light pink to deep coral red
    position: [5.2, 1.7, 0],
    positionDesktop: [5.2, 1.7, 0],
    positionMobile: [1.3, 1.0, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
  },
  {
    type: 'clarity',
    label: '차분한 명료함',
    labelKo: '집중/차분/이성',
    subLabel: '복잡한 현상을 꿰뚫어 보는 이성의 시선',
    subLabelKo: '복잡한 현상을 꿰뚫어 보는 이성의 시선',
    recommendedNews: [
      '심층 분석·해설',
      '경제·정책 분석',
      '데이터 기반 리포트',
      '산업·기술 동향'
    ],
    color: '#3f65ef',
    pastelColor: '#cad8ff',
    colorVariations: ['#cad8ff', '#8dabff', '#3f65ef', '#2a4bc0'], // LOW/MID/BASE + deeper accent
    position: [3.2, -4.5, 0],
    positionDesktop: [3.2, -4.5, 0],
    positionMobile: [0.9, -1.8, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
  },
  {
    type: 'gravity',
    label: '깊은 무게감',
    labelKo: '여운/차분/성찰',
    subLabel: '감정을 차분히 정돈하게 만드는 성찰의 시간',
    subLabelKo: '감정을 차분히 정돈하게 만드는 성찰의 시간',
    recommendedNews: [
      '사건사고·재난',
      '범죄·수사·사회 안전',
      '심층 리포트·원인 분석'
    ],
    color: '#adadad',
    pastelColor: '#e5e5e5',
    colorVariations: ['#e5e5e5', '#d1d1d1', '#adadad', '#999898'], // LOW/MID/BASE + darker gray
    position: [-3.2, -4.5, 0],
    positionDesktop: [-3.2, -4.5, 0],
    positionMobile: [-0.9, -1.8, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
  },
  {
    type: 'serenity',
    label: '고요한 쉼표',
    labelKo: '회복/안정/여유',
    subLabel: '잠시 숨을 고르는 편안한 휴식',
    subLabelKo: '잠시 숨을 고르는 편안한 휴식',
    recommendedNews: [
      '환경·기후·자연',
      '건강·웰빙·생활 안정',
      '지역·커뮤니티·휴먼 스토리',
      '스트레스 완화형 정보'
    ],
    color: '#88d84a',
    pastelColor: '#caf2a7',
    colorVariations: ['#caf2a7', '#adef73', '#88d84a', '#66b53a'], // LOW/MID/BASE + deeper accent
    position: [-5.2, 1.7, 0],
    positionDesktop: [-5.2, 1.7, 0],
    positionMobile: [-1.3, 1.0, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
  },
  {
    type: 'spectrum',
    label: '열린 스펙트럼',
    labelKo: '중립/다양성',
    subLabel: '무엇이든 읽을 수 있는 유연한 마음',
    subLabelKo: '무엇이든 읽을 수 있는 유연한 마음',
    recommendedNews: [
      '5가지 카테고리의 균형 잡힌 뉴스'
    ],
    color: '#00abaf',
    pastelColor: '#a0e8dc',
    colorVariations: ['#a0e8dc', '#00abaf', '#a773f9', '#7c4dff'], // Teal logo to violet gradient
    gradientColor: '#a773f9',
    position: [0, 0, 0],
    positionDesktop: [0, 0, 0],
    positionMobile: [0, 0, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
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
