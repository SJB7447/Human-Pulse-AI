import { create } from 'zustand';

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
      '연예, 미담, 라이프스타일',
      '혁신적인 테크/신제품 소식',
      '훈훈한 미담, 스포츠 승리 소식'
    ],
    color: '#ffd150',
    pastelColor: '#f9e1a5',
    colorVariations: ['#f9e1a5', '#ffd150', '#fc8d6b', '#e6a040'], // Light yellow to deeper orange
    position: [0, 5.5, 0],
    positionDesktop: [0, 5.5, 0],
    positionMobile: [0, 3.2, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
  },
  {
    type: 'immersion',
    label: '뜨거운 몰입',
    labelKo: '열정/주의/긴장',
    subLabel: '변화를 만드는 강렬한 에너지',
    subLabelKo: '변화를 만드는 강렬한 에너지',
    recommendedNews: [
      '정치, 속보, 사회적 갈등 뉴스',
      '환경 및 기후 행동',
      '뜨거운 토론이 필요한 쟁점'
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
    labelKo: '신뢰/차분/이성',
    subLabel: '복잡한 현상을 꿰뚫어 보는 이성의 눈',
    subLabelKo: '복잡한 현상을 꿰뚫어 보는 이성의 눈',
    recommendedNews: [
      '심층 분석, 경제, 사실',
      '깊이 있는 사설/칼럼',
      '심층 기획/탐사 보도'
    ],
    color: '#3f65ef',
    pastelColor: '#bdcaef',
    colorVariations: ['#bdcaef', '#8a9eef', '#3f65ef', '#2a4bc0'], // Light blue to deep navy
    position: [3.2, -4.5, 0],
    positionDesktop: [3.2, -4.5, 0],
    positionMobile: [0.9, -1.8, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
  },
  {
    type: 'gravity',
    label: '깊은 무게감',
    labelKo: '우울/차분/성찰',
    subLabel: '감정적 차분함을 유도하는 성찰의 시간',
    subLabelKo: '감정적 차분함을 유도하는 성찰의 시간',
    recommendedNews: [
      '사건사고, 심층 리포트',
      '애도 & 우울: 우울하거나 슬픈 뉴스',
      '감정적 차분함을 유도하는 리포트'
    ],
    color: '#999898',
    pastelColor: '#d5d5d5',
    colorVariations: ['#e5e5e5', '#bababa', '#999898', '#4a4a4a'], // Light gray to charcoal
    position: [-3.2, -4.5, 0],
    positionDesktop: [-3.2, -4.5, 0],
    positionMobile: [-0.9, -1.8, 0],
    scaleDesktop: 0.95,
    scaleMobile: 0.65
  },
  {
    type: 'serenity',
    label: '고요한 쉼표',
    labelKo: '회복/안정/힐링',
    subLabel: '잠시 숨을 고르는 편안한 휴식',
    subLabelKo: '잠시 숨을 고르는 편안한 휴식',
    recommendedNews: [
      '환경, 건강, 힐링 콘텐츠',
      '자연/다큐멘터리',
      '자극적이지 않은 슬로우 뉴스'
    ],
    color: '#88d84a',
    pastelColor: '#b8f498',
    colorVariations: ['#b8f498', '#88d84a', '#1bbca8', '#14947f'], // Light green to teal
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
    subLabel: '무엇이든 담을 수 있는 유연한 마음',
    subLabelKo: '무엇이든 담을 수 있는 유연한 마음',
    recommendedNews: [
      '5가지 카테고리의 균형 잡힌 뉴스'
    ],
    color: '#1bbca8',
    pastelColor: '#a0e8dc',
    colorVariations: ['#a0e8dc', '#1bbca8', '#a773f9', '#7c4dff'], // Teal to purple gradient
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
