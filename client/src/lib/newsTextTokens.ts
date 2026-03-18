import type { EmotionType } from '@/lib/store';

export type NewsDepthStep = 'low' | 'mid' | 'high';

export const NEWS_TEXT_TOKENS = {
  detailBody: {
    low: '#232221',
    mid: '#ffffff',
    high: '#ffffff',
  },
} as const;

const CARD_TEXT_TONE_BY_EMOTION: Record<EmotionType, { low: 'dark' | 'light'; mid: 'dark' | 'light'; high: 'dark' | 'light' }> = {
  vibrance: { low: 'dark', mid: 'dark', high: 'dark' },
  immersion: { low: 'dark', mid: 'dark', high: 'light' },
  clarity: { low: 'dark', mid: 'dark', high: 'light' },
  gravity: { low: 'dark', mid: 'dark', high: 'light' },
  serenity: { low: 'dark', mid: 'dark', high: 'light' },
  spectrum: { low: 'dark', mid: 'light', high: 'light' },
};

const CARD_TEXT_COLOR = {
  dark: {
    title: '#3A3A3A',
    body: 'rgba(58,58,58,0.84)',
  },
  light: {
    title: '#FFFFFF',
    body: 'rgba(255,255,255,0.92)',
  },
} as const;

export function getNewsDepthStep(depth: number): NewsDepthStep {
  const normalizedDepth = Math.max(0, Math.min(100, Number(depth) || 0));
  if (normalizedDepth <= 60) return 'low';
  if (normalizedDepth <= 75) return 'mid';
  return 'high';
}

export function getNewsTextTokenByDepth(depth: number, emotion?: EmotionType | null) {
  const step = getNewsDepthStep(depth);
  const tone = emotion
    ? CARD_TEXT_TONE_BY_EMOTION[emotion]?.[step] || (step !== 'low' ? 'light' : 'dark')
    : (step !== 'low' ? 'light' : 'dark');
  const cardTone = CARD_TEXT_COLOR[tone];

  return {
    step,
    title: cardTone.title,
    body: cardTone.body,
    detailBody: NEWS_TEXT_TOKENS.detailBody[step],
    usesLightText: tone === 'light',
  };
}
