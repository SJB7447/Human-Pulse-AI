import type { EmotionType } from '@/lib/store';

export type EmotionNewsLink = {
  type: EmotionType;
  labelKo: string;
  labelEn: string;
  categoryKo: string;
  categoryEn: string;
  color: string;
};

export const EMOTION_NEWS_LINKS: EmotionNewsLink[] = [
  {
    type: 'spectrum',
    labelKo: '스펙트럼',
    labelEn: 'Spectrum',
    categoryKo: '전체 보기',
    categoryEn: 'All',
    color: '#00abaf',
  },
  {
    type: 'immersion',
    labelKo: '긴장· 열정',
    labelEn: 'Immersion',
    categoryKo: '빨강',
    categoryEn: 'Red',
    color: '#f4606b',
  },
  {
    type: 'clarity',
    labelKo: '냉철· 이성적',
    labelEn: 'Clarity',
    categoryKo: '파랑',
    categoryEn: 'Blue',
    color: '#3f65ef',
  },
  {
    type: 'serenity',
    labelKo: '힐링· 안정',
    labelEn: 'Serenity',
    categoryKo: '초록',
    categoryEn: 'Green',
    color: '#88d84a',
  },
  {
    type: 'vibrance',
    labelKo: '설렘· 기쁨',
    labelEn: 'Vibrance',
    categoryKo: '노랑',
    categoryEn: 'Yellow',
    color: '#ffd150',
  },
  {
    type: 'gravity',
    labelKo: '묵직함· 성찰',
    labelEn: 'Gravity',
    categoryKo: '회색',
    categoryEn: 'Gray',
    color: '#bababa',
  },
];
