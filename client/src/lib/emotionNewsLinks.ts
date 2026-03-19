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
    labelKo: '전체보기',
    labelEn: 'Spectrum',
    categoryKo: '다양함',
    categoryEn: 'All',
    color: '#00ABAF',
  },
  {
    type: 'immersion',
    labelKo: '긴장· 열정',
    labelEn: 'Immersion',
    categoryKo: '',
    categoryEn: 'Red',
    color: '#F4606B',
  },
  {
    type: 'clarity',
    labelKo: '냉철· 이성적',
    labelEn: 'Clarity',
    categoryKo: '',
    categoryEn: 'Blue',
    color: '#4275E5',
  },
  {
    type: 'serenity',
    labelKo: '힐링· 안정',
    labelEn: 'Serenity',
    categoryKo: '',
    categoryEn: 'Green',
    color: '#4FA86A',
  },
  {
    type: 'vibrance',
    labelKo: '설렘· 기쁨',
    labelEn: 'Vibrance',
    categoryKo: '',
    categoryEn: 'Yellow',
    color: '#FFB052',
  },
  {
    type: 'gravity',
    labelKo: '묵직함· 성찰',
    labelEn: 'Gravity',
    categoryKo: '',
    categoryEn: 'Gray',
    color: '#898989',
  },
];
