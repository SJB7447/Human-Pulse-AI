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
    labelEn: 'Spectrum (Balanced)',
    categoryKo: '균형·다양성',
    categoryEn: 'Balance · Diversity',
    color: '#00abaf',
  },
  {
    type: 'immersion',
    labelKo: '격렬한 몰입',
    labelEn: 'Immersion',
    categoryKo: '정치·속보',
    categoryEn: 'Politics · Breaking',
    color: '#f4606b',
  },
  {
    type: 'clarity',
    labelKo: '맑은 통찰',
    labelEn: 'Clarity',
    categoryKo: '경제·분석',
    categoryEn: 'Economy · Analysis',
    color: '#3f65ef',
  },
  {
    type: 'serenity',
    labelKo: '편안한 숨결',
    labelEn: 'Serenity',
    categoryKo: '웰빙·커뮤니티',
    categoryEn: 'Well-being · Community',
    color: '#88d84a',
  },
  {
    type: 'vibrance',
    labelKo: '설레는 파동',
    labelEn: 'Vibrance',
    categoryKo: '연예·미담',
    categoryEn: 'Culture · Positive',
    color: '#ffd150',
  },
  {
    type: 'gravity',
    labelKo: '침잠한 여운',
    labelEn: 'Gravity',
    categoryKo: '사건·재난',
    categoryEn: 'Incident · Disaster',
    color: '#adadad',
  },
];

