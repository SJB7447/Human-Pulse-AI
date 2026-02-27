export type NewsDepthStep = 'low' | 'mid' | 'high';

export const NEWS_TEXT_TOKENS = {
  title: '#232221',
  body: {
    low: '#5f5d5c',
    mid: '#787674',
    high: 'rgba(255,255,255,0.84)',
  },
  detailBody: {
    low: '#232221',
    mid: '#ffffff',
    high: '#ffffff',
  },
} as const;

export function getNewsDepthStep(depth: number): NewsDepthStep {
  const normalizedDepth = Math.max(0, Math.min(100, Number(depth) || 0));
  if (normalizedDepth <= 60) return 'low';
  if (normalizedDepth <= 75) return 'mid';
  return 'high';
}

export function getNewsTextTokenByDepth(depth: number) {
  const step = getNewsDepthStep(depth);
  return {
    step,
    title: NEWS_TEXT_TOKENS.title,
    body: NEWS_TEXT_TOKENS.body[step],
    detailBody: NEWS_TEXT_TOKENS.detailBody[step],
    usesLightText: step !== 'low',
  };
}
