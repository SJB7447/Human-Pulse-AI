export const ARTICLE_TOPIC_IDS = ['politics', 'economy', 'society', 'culture', 'environment'] as const;

export type ArticleTopicId = typeof ARTICLE_TOPIC_IDS[number];

export const ARTICLE_TOPIC_LABELS: Record<ArticleTopicId, string> = {
  politics: '정치',
  economy: '경제',
  society: '사회',
  culture: '문화',
  environment: '환경',
};

export type ArticleTopicSummary = {
  id: ArticleTopicId;
  label: string;
  count: number;
};

export function isArticleTopicId(value: unknown): value is ArticleTopicId {
  return ARTICLE_TOPIC_IDS.includes(String(value || '').trim().toLowerCase() as ArticleTopicId);
}

export function normalizeArticleTopic(value: unknown): ArticleTopicId | null {
  const normalized = String(value || '').trim().toLowerCase();
  return isArticleTopicId(normalized) ? normalized : null;
}

export function inferArticleTopicFromCategory(rawCategory: unknown): ArticleTopicId | null {
  const value = String(rawCategory || '').trim().toLowerCase();
  if (!value) return null;

  if (/(politic|policy|government|election|diplom|정치|정당|선거|정부|정책|외교|국회)/i.test(value)) {
    return 'politics';
  }

  if (/(econom|finance|market|industry|business|real estate|startup|tech|technology|science|경제|금융|산업|비즈니스|부동산|시장|기술|과학|반도체|ai)/i.test(value)) {
    return 'economy';
  }

  if (/(society|social|education|health|medical|security|labor|community|국제|사회|교육|의료|건강|보안|노동|커뮤니티|주거|복지|재난|안전)/i.test(value)) {
    return 'society';
  }

  if (/(culture|art|music|movie|drama|entertainment|sport|travel|lifestyle|festival|연예|문화|예술|음악|영화|드라마|공연|스포츠|여행|라이프|축제|전시|콘텐츠)/i.test(value)) {
    return 'culture';
  }

  if (/(environment|climate|weather|eco|green|wellbeing|healing|forest|환경|기후|날씨|생태|친환경|웰빙|힐링|숲|회복)/i.test(value)) {
    return 'environment';
  }

  return null;
}

export function resolveArticleTopic(row: { topic?: unknown; category?: unknown }): ArticleTopicId | null {
  return normalizeArticleTopic(row?.topic) || inferArticleTopicFromCategory(row?.category) || null;
}

export function buildArticleTopicSummaries(rows: Array<{ topic?: unknown; category?: unknown }>): ArticleTopicSummary[] {
  const counts = new Map<ArticleTopicId, number>();

  for (const row of rows) {
    const topic = resolveArticleTopic(row);
    if (!topic) continue;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([id, count]) => ({
      id,
      label: ARTICLE_TOPIC_LABELS[id],
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}
