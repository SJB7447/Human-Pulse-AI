import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Bookmark, Share2, Sparkles, Loader2, Clock, Lightbulb, Check, RefreshCcw, AlertCircle, Link2, Copy, Globe, Instagram, MessageCircle, Youtube, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { type NewsItem } from '@/hooks/useNews';
import { EMOTION_CONFIG, EmotionType, useEmotionStore } from '@/lib/store';
import { DBService } from '@/services/DBService';
import { AIServiceError, GeminiService, type OpinionComposeResult } from '@/services/gemini';
import type { InteractiveArticle } from '@shared/interactiveArticle';

const LazyStoryRenderer = lazy(() =>
  import('@/components/StoryRenderer').then((module) => ({ default: module.StoryRenderer }))
);

const ARTICLE_META_OPEN = '<!-- HUEBRIEF_META_START -->';
const ARTICLE_META_CLOSE = '<!-- HUEBRIEF_META_END -->';

function stripArticleMeta(content: string | null | undefined): string {
  const text = String(content || '');
  return text
    .replace(new RegExp(`${ARTICLE_META_OPEN}[\\s\\S]*?${ARTICLE_META_CLOSE}\\s*`, 'g'), '')
    .trim();
}

function isDarkHexColor(hex: string): boolean {
  const normalized = hex.replace('#', '');
  const fullHex = normalized.length === 3
    ? normalized.split('').map((ch) => `${ch}${ch}`).join('')
    : normalized;
  const r = parseInt(fullHex.slice(0, 2), 16);
  const g = parseInt(fullHex.slice(2, 4), 16);
  const b = parseInt(fullHex.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
}

function getDepthPalette(emotion: EmotionType, depth: number): { background: string; border: string } {
  const paletteByEmotion: Record<EmotionType, { low: string; mid: string; base: string; deep: string }> = {
    immersion: { low: '#ffc7ce', mid: '#ff97a9', base: '#f4606b', deep: '#d94a54' },
    vibrance: { low: '#ffedc5', mid: '#ffe197', base: '#ffd150', deep: '#e6b83f' },
    serenity: { low: '#caf2a7', mid: '#adef73', base: '#88d84a', deep: '#66b53a' },
    clarity: { low: '#cad8ff', mid: '#8dabff', base: '#3f65ef', deep: '#2a4bc0' },
    gravity: { low: '#e5e5e5', mid: '#d1d1d1', base: '#adadad', deep: '#999898' },
    spectrum: { low: '#a0e8dc', mid: '#00abaf', base: '#a773f9', deep: '#7c4dff' },
  };
  const tone = paletteByEmotion[emotion] || paletteByEmotion.gravity;
  const normalizedDepth = Math.max(0, Math.min(100, depth));

  if (normalizedDepth <= 60) {
    return {
      background: `linear-gradient(165deg, ${tone.low} 0%, ${tone.mid} 100%)`,
      border: tone.mid,
    };
  }
  if (normalizedDepth <= 75) {
    return {
      background: `linear-gradient(165deg, ${tone.mid} 0%, ${tone.base} 100%)`,
      border: tone.base,
    };
  }
  return {
    background: `linear-gradient(165deg, ${tone.base} 0%, ${tone.deep} 100%)`,
    border: tone.deep,
  };
}

function formatRecommendationCategory(raw: string | null | undefined, fallback: string): string {
  const source = String(raw || '').trim();
  if (!source) return fallback;

  const hashtags = source.match(/#[^\s#]+/g) || [];
  if (hashtags.length > 0) {
    const compact = hashtags.slice(0, 2).join(' ');
    return hashtags.length > 2 ? `${compact} …` : compact;
  }

  const cleaned = source.replace(/\s+/g, ' ');
  return cleaned.length > 26 ? `${cleaned.slice(0, 26)}…` : cleaned;
}

function isSourceLikeParagraph(text: string): boolean {
  const value = text.trim().toLowerCase();
  if (!value) return false;
  if (value.includes('[출처]') || value.startsWith('출처')) return true;
  if (value.includes('http://') || value.includes('https://')) return true;
  if (/([a-z0-9-]+\.)+[a-z]{2,}/i.test(value)) return true;
  if (value.startsWith('- ') && value.length < 220) return true;
  return false;
}

type SharePlatform = 'web' | 'instagram' | 'threads' | 'youtube';

type SeoTitleMode = 'default' | 'recommended' | 'custom';

type ShareDraft = {
  platform: SharePlatform;
  shareText: string;
  sourceLink: string;
  seoTitleDefault: string;
  seoTitleRecommended: string;
  seoTitleCustom: string;
  seoTitleMode: SeoTitleMode;
  seoDescription: string;
  tagText: string;
};

type ShareOpenTarget = {
  url: string;
  supportsPrefill: boolean;
};

type SharePackage = {
  platform: SharePlatform;
  platformLabel: string;
  shareText: string;
  sourceLink: string;
  seoTitle: string;
  seoDescription: string;
  tagText: string;
};

const SHARE_PLATFORM_LABEL: Record<SharePlatform, string> = {
  web: 'Web',
  instagram: 'Instagram',
  threads: 'Threads',
  youtube: 'YouTube',
};

function clampText(input: string | null | undefined, maxLength: number): string {
  const plain = String(input || '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function ensureSentenceEnd(input: string): string {
  const text = String(input || '').trim();
  if (!text) return '';
  if (/[.!?。！？]$/.test(text)) return text;
  return `${text}.`;
}

function parseSentences(input: string): string[] {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function buildThreeSentenceDescription(input: string, title: string): string {
  const sentences = parseSentences(input);
  const picked = sentences.slice(0, 3).map(ensureSentenceEnd);
  if (picked.length >= 3) return picked.join(' ');

  const fallback = [
    ensureSentenceEnd(clampText(title, 80) || '이 기사는 핵심 이슈를 정리합니다'),
    '주요 배경과 쟁점을 간결하게 요약합니다.',
    '출처 링크를 통해 원문 맥락을 추가로 확인할 수 있습니다.',
  ];

  while (picked.length < 3) {
    picked.push(fallback[picked.length]);
  }
  return picked.join(' ');
}

function buildRecommendedSeoTitle(title: string): string {
  const trimmed = String(title || '').trim();
  if (!trimmed) return '핵심 쟁점 브리핑 | HueBrief';
  return `${trimmed} 핵심 쟁점 브리핑 | HueBrief`;
}

function extractUrl(value: string): string | null {
  const match = String(value || '').match(/https?:\/\/[^\s)]+/i);
  if (!match) return null;
  return match[0];
}

function normalizeUrl(value: string | null | undefined): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return `https://${text}`;
  return null;
}

function detectSourceUrl(article: NewsItem): string | null {
  const direct = normalizeUrl(article.source || '');
  if (direct) return direct;

  const contentUrl = extractUrl(String(article.content || ''));
  if (contentUrl) return contentUrl;

  const summaryUrl = extractUrl(String(article.summary || ''));
  if (summaryUrl) return summaryUrl;
  return null;
}

type ShareKeywordPack = {
  representativeKeywords: string[];
  viralHashtags: string[];
};

const SHARE_TOKEN_STOPWORDS = new Set([
  '그리고', '그러나', '하지만', '또한', '이번', '지난', '현재', '최근', '오늘', '내일', '오전', '오후',
  '대한', '통해', '관련', '경우', '때문', '대한민국', '서울', '기자', '뉴스', '기사', '보도', '사진',
  '있다', '했다', '된다', '위해', '에서', '에게', '으로', '하다', '위한', '가장', '정도', '대해',
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'about', 'news', 'report',
  'www', 'http', 'https', 'com', 'net', 'org',
]);

function normalizeShareToken(token: string): string {
  return String(token || '')
    .trim()
    .toLowerCase()
    .replace(/^[^0-9a-z가-힣]+|[^0-9a-z가-힣]+$/gi, '')
    .replace(/(?:은|는|이|가|을|를|의|에|로|으로|와|과|도|만|에서|에게|부터|까지)$/, '');
}

function sanitizeShareTokenList(values: string[], min: number, max: number): string[] {
  const normalized = values
    .map((value) => normalizeShareToken(value))
    .filter((token) => token.length >= 2 && token.length <= 20)
    .filter((token) => !SHARE_TOKEN_STOPWORDS.has(token))
    .filter((token) => !/^\d+$/.test(token));
  const deduped = Array.from(new Set(normalized));
  return deduped.slice(0, Math.max(min, max));
}

function buildFallbackShareKeywordPack(article: NewsItem, emotionLabel: string): ShareKeywordPack {
  const plainContent = stripArticleMeta(article.content);
  const body = String(plainContent || article.summary || '').replace(/\s+/g, ' ').trim();
  const paragraphs = body.split(/\n{2,}/).map((line) => line.trim()).filter(Boolean);
  const blocks = paragraphs.length > 0 ? paragraphs : [body];
  const scoreMap = new Map<string, number>();

  blocks.forEach((block, blockIdx) => {
    const tokens = (block.match(/[0-9a-zA-Z가-힣]{2,}/g) || [])
      .map((token) => normalizeShareToken(token))
      .filter((token) => token.length >= 2 && token.length <= 20)
      .filter((token) => !SHARE_TOKEN_STOPWORDS.has(token))
      .filter((token) => !/^\d+$/.test(token));
    const weight = blockIdx < 2 ? 1.4 : 1.0;
    tokens.forEach((token) => scoreMap.set(token, (scoreMap.get(token) || 0) + weight));
  });

  const summaryTokens = (String(article.summary || '').match(/[0-9a-zA-Z가-힣]{2,}/g) || [])
    .map((token) => normalizeShareToken(token))
    .filter((token) => token.length >= 2 && token.length <= 20)
    .filter((token) => !SHARE_TOKEN_STOPWORDS.has(token))
    .slice(0, 10);
  summaryTokens.forEach((token) => scoreMap.set(token, (scoreMap.get(token) || 0) + 1.2));

  const titleTokens = (String(article.title || '').match(/[0-9a-zA-Z가-힣]{2,}/g) || [])
    .map((token) => normalizeShareToken(token))
    .filter((token) => token.length >= 2 && token.length <= 20)
    .filter((token) => !SHARE_TOKEN_STOPWORDS.has(token))
    .slice(0, 6);
  titleTokens.forEach((token) => scoreMap.set(token, (scoreMap.get(token) || 0) + 0.35));

  const representativeKeywords = Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .slice(0, 8);
  const safeKeywords = representativeKeywords.length >= 5
    ? representativeKeywords
    : Array.from(new Set([...representativeKeywords, '핵심쟁점', '정책변화', '시장반응', '이해관계', '영향분석'])).slice(0, 8);

  const categoryToken = normalizeShareToken(String(article.category || article.emotion || ''));
  const emotionToken = normalizeShareToken(emotionLabel);
  const viralCandidates = [
    ...safeKeywords.slice(0, 6),
    categoryToken,
    emotionToken,
    '핵심이슈',
    '이슈브리핑',
    '뉴스요약',
    '트렌드체크',
    '지금주목',
    '심층분석',
  ].filter(Boolean);

  const viralHashtags = sanitizeShareTokenList(viralCandidates, 7, 10);
  const safeViral = viralHashtags.length >= 7
    ? viralHashtags
    : Array.from(new Set([...viralHashtags, '핵심이슈', '뉴스요약', '지금주목', '트렌드체크', '브리핑'])).slice(0, 10);

  return {
    representativeKeywords: safeKeywords.slice(0, 8),
    viralHashtags: safeViral.slice(0, 10),
  };
}

function normalizeShareKeywordPack(input: Partial<ShareKeywordPack> | null | undefined, fallback: ShareKeywordPack): ShareKeywordPack {
  const representativeKeywords = sanitizeShareTokenList(input?.representativeKeywords || [], 5, 8);
  const viralHashtags = sanitizeShareTokenList(input?.viralHashtags || [], 7, 10);

  return {
    representativeKeywords: representativeKeywords.length >= 5 ? representativeKeywords.slice(0, 8) : fallback.representativeKeywords,
    viralHashtags: viralHashtags.length >= 7 ? viralHashtags.slice(0, 10) : fallback.viralHashtags,
  };
}

function getTagTokensForPlatform(platform: SharePlatform, pack: ShareKeywordPack): string[] {
  if (platform === 'instagram' || platform === 'threads') {
    return pack.viralHashtags.slice(0, 10);
  }
  if (platform === 'youtube') {
    return Array.from(new Set([...pack.representativeKeywords, ...pack.viralHashtags])).slice(0, 10);
  }
  return pack.representativeKeywords.slice(0, 8);
}

function parseTagTokens(input: string): string[] {
  const tokens = String(input || '')
    .replace(/[#\n]/g, ' ')
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.replace(/[^0-9a-zA-Z가-힣_]/g, ''))
    .filter(Boolean);

  return Array.from(new Set(tokens)).slice(0, 10);
}

function formatTagText(platform: SharePlatform, tokens: string[]): string {
  if (platform === 'instagram' || platform === 'threads') {
    return tokens.map((token) => `#${token}`).join(' ');
  }
  if (platform === 'youtube') {
    return tokens.join(', ');
  }
  return tokens.join(', ');
}

function getSelectedSeoTitle(draft: ShareDraft): string {
  if (draft.seoTitleMode === 'recommended') return draft.seoTitleRecommended;
  if (draft.seoTitleMode === 'custom') return draft.seoTitleCustom || draft.seoTitleDefault;
  return draft.seoTitleDefault;
}

function toSharePackage(draft: ShareDraft): SharePackage {
  return {
    platform: draft.platform,
    platformLabel: SHARE_PLATFORM_LABEL[draft.platform],
    shareText: draft.shareText,
    sourceLink: draft.sourceLink,
    seoTitle: getSelectedSeoTitle(draft),
    seoDescription: draft.seoDescription,
    tagText: draft.tagText,
  };
}

function buildSharePackageText(pkg: SharePackage): string {
  return [
    `[${pkg.platformLabel}] 공유 패키지`,
    '',
    '공유 문구:',
    pkg.shareText,
    '',
    `Source Link: ${pkg.sourceLink}`,
    `SEO Title: ${pkg.seoTitle}`,
    `SEO Description: ${pkg.seoDescription}`,
    `Keywords/Tags: ${pkg.tagText}`,
  ].join('\n');
}

function buildShareOpenTarget(pkg: SharePackage): ShareOpenTarget {
  const encodedText = encodeURIComponent([pkg.shareText, '', `SEO Title: ${pkg.seoTitle}`].join('\n'));
  const encodedUrl = encodeURIComponent(pkg.sourceLink);

  switch (pkg.platform) {
    case 'web':
      return {
        url: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        supportsPrefill: true,
      };
    case 'threads':
      return {
        url: `https://www.threads.net/intent/post?text=${encodedText}&url=${encodedUrl}`,
        supportsPrefill: true,
      };
    case 'instagram':
      return {
        url: 'https://www.instagram.com/',
        supportsPrefill: false,
      };
    case 'youtube':
      return {
        url: 'https://studio.youtube.com/',
        supportsPrefill: false,
      };
    default:
      return {
        url: 'https://www.instagram.com/',
        supportsPrefill: false,
      };
  }
}

function createEmptyShareDraft(platform: SharePlatform): ShareDraft {
  return {
    platform,
    shareText: '',
    sourceLink: '',
    seoTitleDefault: '',
    seoTitleRecommended: '',
    seoTitleCustom: '',
    seoTitleMode: 'default',
    seoDescription: '',
    tagText: '',
  };
}

type InsightTag = {
  label: string;
  tone: 'positive' | 'negative' | 'action';
};

const INSIGHT_TAGS: InsightTag[] = [
  { label: '새로운 깨달음', tone: 'positive' },
  { label: '흥미로움', tone: 'positive' },
  { label: '영감받음', tone: 'positive' },
  { label: '시야가 넓어짐', tone: 'positive' },
  { label: '따뜻함', tone: 'positive' },
  { label: '뭉클함', tone: 'positive' },
  { label: '응원하고 싶음', tone: 'positive' },
  { label: '위로받음', tone: 'positive' },
  { label: '통쾌함', tone: 'positive' },
  { label: '뿌듯함', tone: 'positive' },
  { label: '희망참', tone: 'positive' },
  { label: '든든함', tone: 'positive' },
  { label: '반가움', tone: 'positive' },
  { label: '차분해짐', tone: 'positive' },
  { label: '답답함', tone: 'negative' },
  { label: '화가 남', tone: 'negative' },
  { label: '피로함', tone: 'negative' },
  { label: '안타까움', tone: 'negative' },
  { label: '걱정됨', tone: 'negative' },
  { label: '허탈함', tone: 'negative' },
  { label: '후속 이야기가 궁금함', tone: 'action' },
  { label: '심층 기사 요청', tone: 'action' },
];

const RECOMMENDED_INSIGHT_TAGS: Record<EmotionType, string[]> = {
  vibrance: ['흥미로움', '영감받음', '희망참', '통쾌함', '뿌듯함', '후속 이야기가 궁금함', '심층 기사 요청'],
  immersion: ['답답함', '화가 남', '피로함', '안타까움', '걱정됨', '후속 이야기가 궁금함', '심층 기사 요청'],
  clarity: ['새로운 깨달음', '시야가 넓어짐', '차분해짐', '든든함', '심층 기사 요청', '후속 이야기가 궁금함'],
  gravity: ['걱정됨', '답답함', '든든함', '차분해짐', '새로운 깨달음', '심층 기사 요청', '후속 이야기가 궁금함'],
  serenity: ['따뜻함', '위로받음', '반가움', '차분해짐', '뭉클함', '후속 이야기가 궁금함'],
  spectrum: ['새로운 깨달음', '흥미로움', '따뜻함', '답답함', '걱정됨', '심층 기사 요청', '후속 이야기가 궁금함'],
};

const INSIGHT_TAG_TONE_STYLE: Record<InsightTag['tone'], { bg: string; text: string; selectedBg: string; selectedText: string }> = {
  positive: { bg: '#eef4e8', text: '#4d6a3a', selectedBg: '#8db26a', selectedText: '#ffffff' },
  negative: { bg: '#f8ecea', text: '#8a4f4a', selectedBg: '#d07a6f', selectedText: '#ffffff' },
  action: { bg: '#ebeef8', text: '#4d5f8a', selectedBg: '#748cd5', selectedText: '#ffffff' },
};

function buildInsightPlaceholder(selectedTags: string[]): string {
  if (!Array.isArray(selectedTags) || selectedTags.length === 0) {
    return '기사를 읽고 난 후의 생각이나 느낌을 자유롭게 남겨주세요. (태그를 먼저 선택하시면 질문을 띄워드릴게요!)';
  }

  const has = (tag: string) => selectedTags.includes(tag);

  if (has('화가 남') && has('답답함')) {
    return '마음이 많이 무거우셨겠어요. 어떤 대목이 가장 답답하고 화가 나셨나요? 이곳에 편하게 털어놓아 보세요.';
  }
  if (has('화가 남') && has('심층 기사 요청')) {
    return '분노에서 그치지 않고 더 깊은 진실을 원하시는군요! 어떤 부분에 대한 후속 분석을 기대하시나요?';
  }
  if (has('피로함') && has('차분해짐')) {
    return '피로한 이슈 속에서도 차분함을 잃지 않으셨네요. 지금 머릿속에 드는 생각을 짧게 정리해 볼까요?';
  }
  if (has('답답함') && has('희망참')) {
    return '답답한 현실 속에서도 작은 희망을 발견하셨군요. 그 희망의 씨앗은 무엇이었나요?';
  }

  // Priority: action > negative > positive
  const actionTags = new Set(['후속 이야기가 궁금함', '심층 기사 요청']);
  const negativeTags = new Set(['답답함', '화가 남', '피로함', '안타까움', '걱정됨', '허탈함']);
  const growthTags = new Set(['새로운 깨달음', '흥미로움', '영감받음', '시야가 넓어짐']);
  const empathyTags = new Set(['따뜻함', '뭉클함', '응원하고 싶음', '위로받음']);
  const vitalityTags = new Set(['통쾌함', '뿌듯함', '희망참', '든든함', '반가움', '차분해짐']);

  if (selectedTags.some((tag) => actionTags.has(tag))) {
    return '어떤 점이 더 알고 싶으신가요? 궁금한 질문이나 배경 지식을 남겨주시면 다음 큐레이션에 참고할게요.';
  }
  if (selectedTags.some((tag) => ['답답함', '피로함'].includes(tag))) {
    return '잠시 숨을 고르셔도 좋아요. 기사를 읽으며 어떤 점이 가장 피로하게 다가왔나요?';
  }
  if (selectedTags.some((tag) => ['안타까움', '걱정됨', '허탈함'].includes(tag))) {
    return '안타까운 마음이 드셨군요. 이 이슈에서 어떤 부분이 가장 걱정되시나요?';
  }
  if (selectedTags.some((tag) => growthTags.has(tag))) {
    return '이 기사에서 어떤 점을 새롭게 발견하셨나요? 인상 깊었던 문장이나 생각을 기록해 보세요.';
  }
  if (selectedTags.some((tag) => empathyTags.has(tag))) {
    return '마음이 따뜻해지셨군요. 기사를 읽으며 어떤 대목이 가장 와닿으셨나요?';
  }
  if (selectedTags.some((tag) => vitalityTags.has(tag))) {
    return '기분 좋은 에너지가 느껴지네요! 속 시원했거나 든든하게 느껴진 부분을 적어주세요.';
  }
  return '이 기사에 대한 당신의 해석, 근거, 관점을 적어주세요.';
}

function buildDefaultShareDraft(
  platform: SharePlatform,
  article: NewsItem,
  emotionLabel: string,
  sourceLink: string,
  keywordPack: ShareKeywordPack,
): ShareDraft {
  const plainContent = stripArticleMeta(article.content);
  const summary = clampText(article.summary || plainContent || article.title, 220);
  const seoDescription = buildThreeSentenceDescription(plainContent || article.summary || article.title, article.title);
  const tags = getTagTokensForPlatform(platform, keywordPack);
  const seoTitleDefault = clampText(`${article.title} | HueBrief`, 68);
  const seoTitleRecommended = clampText(buildRecommendedSeoTitle(article.title), 68);

  const baseShareLines = [
    article.title,
    summary,
    `출처: ${sourceLink}`,
  ];

  const shareByPlatform: Record<SharePlatform, string> = {
    web: baseShareLines.join('\n'),
    instagram: `${baseShareLines.join('\n')}\n${formatTagText('instagram', tags)}`,
    threads: `${baseShareLines.join('\n')}\n${formatTagText('threads', tags)}`,
    youtube: `${baseShareLines.join('\n')}\n태그: ${formatTagText('youtube', tags)}`,
  };

  return {
    platform,
    shareText: shareByPlatform[platform],
    sourceLink,
    seoTitleDefault,
    seoTitleRecommended,
    seoTitleCustom: '',
    seoTitleMode: 'default',
    seoDescription,
    tagText: formatTagText(platform, tags),
  };
}

function sanitizeComposedContentForEditor(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const lines = text.split('\n');
  const sourceSummaryIdx = lines.findIndex((line) => /^##\s*원문\s*요약/i.test(line.trim()));
  if (sourceSummaryIdx < 0) return text;
  const nextSectionIdx = lines.findIndex((line, idx) => idx > sourceSummaryIdx && /^##\s+/.test(line.trim()));
  const trimmed = nextSectionIdx > sourceSummaryIdx ? lines.slice(nextSectionIdx).join('\n').trim() : '';
  return trimmed || text;
}

interface CuratedArticle {
  id: number;
  originalArticle: NewsItem;
  userComment: string;
  userEmotion: EmotionType;
  userFeelingText?: string;
  selectedTags?: string[];
  createdAt: string;
}

type OpinionComposeDraft = OpinionComposeResult & {
  sourceArticleId: string;
  sourceTitle: string;
  sourceUrl: string;
  userOpinion: string;
  extraRequest: string;
  requestedReferences: string[];
};

interface NewsDetailModalProps {
  article: NewsItem | null;
  emotionType: EmotionType;
  onClose: () => void;
  onSaveCuration?: (curation: CuratedArticle) => void;
  cardBackground?: string;
  layoutId?: string;
  relatedArticles?: NewsItem[];
  onSelectArticle?: (article: NewsItem) => void;
  onConsumeEvidence?: (articleId: string, evidence: 'scroll20') => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
}

export function NewsDetailModal({ article, emotionType, onClose, onSaveCuration, cardBackground, layoutId, relatedArticles = [], onSelectArticle, onConsumeEvidence }: NewsDetailModalProps) {
  const { toast } = useToast();
  const { user } = useEmotionStore();
  const [, setLocation] = useLocation();
  const [isTransforming, setIsTransforming] = useState(false);
  const [showOpinionComposer, setShowOpinionComposer] = useState(false);
  const [opinionText, setOpinionText] = useState('');
  const [opinionExtraRequest, setOpinionExtraRequest] = useState('');
  const [opinionReferenceText, setOpinionReferenceText] = useState('');
  const [composedDraft, setComposedDraft] = useState<OpinionComposeDraft | null>(null);
  const [editableComposedTitle, setEditableComposedTitle] = useState('');
  const [editableComposedContent, setEditableComposedContent] = useState('');
  const [isSavingComposedDraft, setIsSavingComposedDraft] = useState(false);
  const [showInsightEditor, setShowInsightEditor] = useState(false);
  const [insightText, setInsightText] = useState('');
  const [selectedInsightTags, setSelectedInsightTags] = useState<string[]>([]);
  const [showAllInsightTags, setShowAllInsightTags] = useState(false);
  const [showInsightReward, setShowInsightReward] = useState(false);
  const [isSavingInsight, setIsSavingInsight] = useState(false);
  const [interactiveArticle, setInteractiveArticle] = useState<InteractiveArticle | null>(null);
  const [interactiveError, setInteractiveError] = useState<{ message: string; retryAfterSeconds?: number } | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiActionError, setAiActionError] = useState<string | null>(null);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [sharePlatform, setSharePlatform] = useState<SharePlatform>('web');
  const [shareLink, setShareLink] = useState('');
  const [shareLinkDisplay, setShareLinkDisplay] = useState('');
  const [sourceShortLink, setSourceShortLink] = useState('');
  const [isPreparingShareLink, setIsPreparingShareLink] = useState(false);
  const [shareDrafts, setShareDrafts] = useState<Record<SharePlatform, ShareDraft>>({
    web: createEmptyShareDraft('web'),
    instagram: createEmptyShareDraft('instagram'),
    threads: createEmptyShareDraft('threads'),
    youtube: createEmptyShareDraft('youtube'),
  });
  const [bgTransitionProgress, setBgTransitionProgress] = useState(0);
  const [revealedParagraphCount, setRevealedParagraphCount] = useState(1);
  const [hasStartedScrollReveal, setHasStartedScrollReveal] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const recommendationSectionRef = useRef<HTMLDivElement | null>(null);
  const dialogPanelRef = useRef<HTMLDivElement | null>(null);
  const insightPanelRef = useRef<HTMLDivElement | null>(null);
  const opinionComposerPanelRef = useRef<HTMLDivElement | null>(null);
  const shareSheetRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const insightCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const opinionCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const rewardPrimaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const MAX_INSIGHT_LENGTH = 300;
  const MAX_OPINION_LENGTH = 1000;
  const MAX_INSIGHT_TAG_SELECTION = 3;
  const shouldReduceMotion = useReducedMotion();
  const isAiBusy = isTransforming || isSummarizing;
  const consumeEvidenceSentRef = useRef(false);

  const emotionConfig = EMOTION_CONFIG.find(e => e.type === emotionType);
  const articleEmotionConfig = EMOTION_CONFIG.find((entry) => entry.type === article?.emotion) || emotionConfig;
  const color = articleEmotionConfig?.color || '#999898';

  useEffect(() => {
    setInteractiveArticle(null);
    setInteractiveError(null);
    setAiSummary(null);
    setAiActionError(null);
    setInsightText('');
    setSelectedInsightTags([]);
    setShowAllInsightTags(false);
    setShowInsightReward(false);
    setShowInsightEditor(false);
    setShowOpinionComposer(false);
    setOpinionText('');
    setOpinionExtraRequest('');
    setOpinionReferenceText('');
    setComposedDraft(null);
    setEditableComposedTitle('');
    setEditableComposedContent('');
    setIsSavingComposedDraft(false);
    setShowShareSheet(false);
    setSharePlatform('web');
    setShareLink('');
    setShareLinkDisplay('');
    setSourceShortLink('');
    setIsPreparingShareLink(false);
    setShareDrafts({
      web: createEmptyShareDraft('web'),
      instagram: createEmptyShareDraft('instagram'),
      threads: createEmptyShareDraft('threads'),
      youtube: createEmptyShareDraft('youtube'),
    });
    setBgTransitionProgress(0);
    setRevealedParagraphCount(1);
    setHasStartedScrollReveal(false);
  }, [article?.id]);

  useEffect(() => {
    if (!article) return;
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [article]);

  useEffect(() => {
    if (!article) return;
    const focusTarget = showInsightEditor
      ? insightCloseButtonRef.current
      : showOpinionComposer
        ? opinionCloseButtonRef.current
      : showInsightReward
        ? rewardPrimaryButtonRef.current
      : showShareSheet
        ? shareCloseButtonRef.current
        : closeButtonRef.current;
    focusTarget?.focus();
  }, [article, showInsightEditor, showOpinionComposer, showShareSheet, showInsightReward]);

  useEffect(() => {
    if (!article) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (showInsightEditor) {
          setShowInsightEditor(false);
        } else if (showOpinionComposer) {
          setShowOpinionComposer(false);
        } else if (showInsightReward) {
          setShowInsightReward(false);
        } else if (showShareSheet) {
          setShowShareSheet(false);
        } else {
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const activeContainer = (
        showInsightEditor
          ? insightPanelRef.current
          : showOpinionComposer
            ? opinionComposerPanelRef.current
          : showInsightReward
            ? dialogPanelRef.current
          : showShareSheet
            ? shareSheetRef.current
            : dialogPanelRef.current
      ) as HTMLElement | null;
      const focusable = getFocusableElements(activeContainer);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !activeContainer?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !activeContainer?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [article, onClose, showInsightEditor, showOpinionComposer, showShareSheet, showInsightReward]);

  const recommendationGroups = useMemo(() => {
    if (!article) {
      return { sameCategory: [] as NewsItem[], balance: [] as NewsItem[] };
    }

    const candidates = relatedArticles.filter((item) => item.id !== article.id);
    const normalizedCurrentCategory = article.category?.trim().toLowerCase();

    const sameCategory = candidates
      .filter((item) => {
        if (!normalizedCurrentCategory || !item.category) return false;
        return item.category.trim().toLowerCase() === normalizedCurrentCategory;
      })
      .slice(0, 2);

    const selectedIds = new Set(sameCategory.map((item) => item.id));

    let balanceCandidate = candidates.find(
      (item) => !selectedIds.has(item.id) && item.emotion !== article.emotion
    ) || null;

    // gravity 카테고리에서는 vibrance 또는 serenity 기사를 최소 1개 노출 보장
    if (normalizedCurrentCategory === 'gravity' || article.emotion === 'gravity') {
      const needsGravityBalance = !balanceCandidate || (balanceCandidate.emotion !== 'vibrance' && balanceCandidate.emotion !== 'serenity');
      if (needsGravityBalance) {
        const gravityFallback = candidates.find(
          (item) => !selectedIds.has(item.id) && (item.emotion === 'vibrance' || item.emotion === 'serenity')
        );
        if (gravityFallback) {
          balanceCandidate = gravityFallback;
        }
      }
    }

    if (!balanceCandidate) {
      balanceCandidate = candidates.find(
        (item) => !selectedIds.has(item.id) && item.category?.trim().toLowerCase() !== normalizedCurrentCategory
      ) || null;
    }

    return {
      sameCategory,
      balance: balanceCandidate ? [balanceCandidate] : [],
    };
  }, [article, relatedArticles]);

  const hasRecommendations = recommendationGroups.sameCategory.length > 0 || recommendationGroups.balance.length > 0;
  const flattenedRecommendations = [...recommendationGroups.sameCategory, ...recommendationGroups.balance].slice(0, 3);
  const displayedRecommendations = flattenedRecommendations.slice(0, 3);
  const isBrightEmotion = article?.emotion === 'vibrance' || article?.emotion === 'serenity';
  const showNextHandoffCue = hasRecommendations && !interactiveArticle && bgTransitionProgress >= 0.72;
  const recommendedInsightTags = RECOMMENDED_INSIGHT_TAGS[emotionType] || RECOMMENDED_INSIGHT_TAGS.spectrum;
  const visibleInsightTags = (showAllInsightTags
    ? INSIGHT_TAGS
    : INSIGHT_TAGS.filter((tag) => recommendedInsightTags.includes(tag.label))
  ).slice(0, showAllInsightTags ? INSIGHT_TAGS.length : 8);
  const insightPlaceholder = buildInsightPlaceholder(selectedInsightTags);

  const toggleInsightTag = (tagLabel: string) => {
    const isSelected = selectedInsightTags.includes(tagLabel);
    if (isSelected) {
      setSelectedInsightTags((prev) => prev.filter((tag) => tag !== tagLabel));
      return;
    }
    if (selectedInsightTags.length >= MAX_INSIGHT_TAG_SELECTION) {
      toast({
        title: '최대 3개 선택',
        description: '감정 태그는 최대 3개까지 선택할 수 있습니다.',
      });
      return;
    }
    setSelectedInsightTags((prev) => [...prev, tagLabel]);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(8);
    }
  };

  const handleContentScroll = () => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const maxScroll = Math.max(node.scrollHeight - node.clientHeight, 1);
    const progress = Math.max(0, Math.min(1, node.scrollTop / maxScroll));
    setBgTransitionProgress(progress);
    if (!consumeEvidenceSentRef.current && progress >= 0.2 && article?.id) {
      consumeEvidenceSentRef.current = true;
      onConsumeEvidence?.(String(article.id), 'scroll20');
    }

    const totalParagraphs = proseBlocks.length;
    if (totalParagraphs <= 1) {
      setRevealedParagraphCount(Math.max(totalParagraphs, 1));
      setHasStartedScrollReveal(true);
      return;
    }

    if (node.scrollHeight <= node.clientHeight + 8) {
      setRevealedParagraphCount(totalParagraphs);
      setHasStartedScrollReveal(true);
      return;
    }

    if (node.scrollTop > 12) {
      setHasStartedScrollReveal(true);
    }

    const targetReveal = 1 + Math.ceil(progress * (totalParagraphs - 1));
    setRevealedParagraphCount((prev) => Math.max(prev, Math.min(totalParagraphs, targetReveal)));
  };

  useEffect(() => {
    consumeEvidenceSentRef.current = false;
  }, [article?.id]);

  const handleSave = () => {
    toast({
      title: "저장 완료",
      description: "보관함에 저장되었습니다.",
    });
  };

  const handleShare = () => {
    setShowShareSheet(true);
  };

  const handleMyArticle = async () => {
    if (!article) return;
    setAiActionError(null);
    setShowOpinionComposer(true);
  };

  const parseRequestedReferences = (raw: string): string[] =>
    String(raw || '')
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8);

  const handleGenerateOpinionArticle = async () => {
    if (!article) return;
    if (!opinionText.trim()) {
      toast({ title: "의견 입력 필요", description: "먼저 나의 의견을 입력해 주세요.", variant: "destructive" });
      return;
    }
    if (isAiBusy && !isTransforming) {
      toast({ title: "AI 작업 진행 중", description: "현재 작업 완료 후 다시 시도해주세요." });
      return;
    }

    setInteractiveError(null);
    setAiActionError(null);
    setIsTransforming(true);
    const requestedReferences = parseRequestedReferences(opinionReferenceText);
    const sourceUrl = detectSourceUrl(article) || '';
    const sourceSummary = stripArticleMeta(article.content || article.summary || '').slice(0, 900) || article.summary || '';
    try {
      const generated = await GeminiService.composeArticleWithOpinion({
        sourceArticleId: String(article.id),
        sourceTitle: article.title,
        sourceSummary,
        sourceUrl,
        opinionText: opinionText.trim(),
        extraRequest: opinionExtraRequest.trim(),
        requestedReferences,
      });
      const sanitizedGeneratedContent = sanitizeComposedContentForEditor(generated.content);
      const initialEditableContent = [
        `## 독자 의견`,
        opinionText.trim(),
        ``,
        sanitizedGeneratedContent || generated.content,
      ].join('\n').trim();
      setComposedDraft({
        ...generated,
        sourceArticleId: String(article.id),
        sourceTitle: article.title,
        sourceUrl,
        userOpinion: opinionText.trim(),
        extraRequest: opinionExtraRequest.trim(),
        requestedReferences,
      });
      setEditableComposedTitle(generated.title);
      setEditableComposedContent(initialEditableContent);
      toast({
        title: generated.fallbackUsed ? "기사 초안 생성 완료(안정 모드)" : "기사 초안 생성 완료",
        description: "원문을 수정하지 않고 의견 기반 신규 기사 초안을 만들었습니다.",
      });
    } catch (e: any) {
      const aiError = e as AIServiceError;
      const isOverloaded = aiError.retryable || aiError.status === 503 || aiError.status === 504;
      const message = isOverloaded
        ? `AI 요청이 지연되고 있습니다.${typeof aiError.retryAfterSeconds === 'number' ? ` 약 ${aiError.retryAfterSeconds}초 후` : ' 잠시 후'} 다시 시도해 주세요.`
        : (aiError.message || "의견 기반 기사 생성 중 오류가 발생했습니다.");
      setAiActionError(message);
      toast({ title: "생성 실패", description: message, variant: "destructive" });
    } finally {
      setIsTransforming(false);
    }
  };

  const handleSaveComposedArticle = async () => {
    if (!article || !user || !composedDraft) return;
    const nextTitle = editableComposedTitle.trim();
    const nextContent = editableComposedContent.trim();
    if (!nextTitle || !nextContent) {
      toast({
        title: "입력 필요",
        description: "기사 제목과 본문을 확인해 주세요.",
        variant: "destructive",
      });
      return;
    }
    const nextSummary = nextContent.replace(/\s+/g, ' ').slice(0, 220);
    setIsSavingComposedDraft(true);
    try {
      await DBService.saveUserComposedArticle(String(user.id), {
        sourceArticleId: composedDraft.sourceArticleId,
        sourceTitle: composedDraft.sourceTitle,
        sourceUrl: composedDraft.sourceUrl,
        sourceEmotion: article.emotion,
        sourceCategory: String(article.category || 'General'),
        userOpinion: composedDraft.userOpinion,
        extraRequest: composedDraft.extraRequest,
        requestedReferences: composedDraft.requestedReferences,
        generatedTitle: nextTitle,
        generatedSummary: nextSummary,
        generatedContent: nextContent,
        referenceLinks: (composedDraft.references || []).map((ref) => ref.url).filter(Boolean),
        status: 'published',
        submissionStatus: 'pending',
      });
      toast({
        title: "내가 쓴 기사 저장 완료",
        description: "마이페이지에 저장되었고, 커뮤니티 검증 대기열에도 등록되었습니다.",
      });
      setShowOpinionComposer(false);
      setComposedDraft(null);
      setLocation('/mypage?tab=custom');
      onClose();
    } catch (error: any) {
      toast({
        title: "기사 저장 실패",
        description: error?.message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsSavingComposedDraft(false);
    }
  };

  const handleSummarizeArticle = async () => {
    if (!article) return;
    if (isAiBusy && !isSummarizing) {
      toast({ title: "AI 작업 진행 중", description: "현재 작업 완료 후 다시 시도해주세요." });
      return;
    }
    setAiActionError(null);
    setIsSummarizing(true);
    try {
      const plainContent = stripArticleMeta(article.content);
      const result = await GeminiService.summarizeArticle(article.title, plainContent || article.summary || "");
      setAiSummary(result.summary);
      toast({ title: "AI 요약 완료" });
    } catch (error: any) {
      const message = error?.message || "요약 생성 실패";
      setAiActionError(message);
      toast({ title: "요약 실패", description: message, variant: "destructive" });
    } finally {
      setIsSummarizing(false);
    }
  };
  const handleSaveInsight = async () => {
    const trimmedInsight = insightText.trim();
    const hasSelectedTags = selectedInsightTags.length > 0;
    if (!article || (!trimmedInsight && !hasSelectedTags)) {
      toast({
        title: "입력 필요",
        description: "인사이트 내용을 입력하거나 감정 태그를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (!user) {
      toast({
        title: "로그인 필요",
        description: "인사이트는 로그인 후 저장됩니다.",
        variant: "destructive",
      });
      return;
    }

    const normalizedInsightComment = trimmedInsight || `[태그 인사이트] ${selectedInsightTags.join(', ')}`;

    const curation: CuratedArticle = {
      id: Date.now(),
      originalArticle: article,
      userComment: normalizedInsightComment,
      userEmotion: emotionType,
      userFeelingText: selectedInsightTags[0] || '',
      selectedTags: selectedInsightTags,
      createdAt: new Date().toISOString(),
    };

    setIsSavingInsight(true);
    try {
      await DBService.saveUserInsight(String(user.id), {
        articleId: String(article.id),
        originalTitle: article.title,
        userComment: normalizedInsightComment,
        userEmotion: emotionType,
        userFeelingText: selectedInsightTags[0] || '',
        selectedTags: selectedInsightTags,
      });

      if (onSaveCuration) {
        onSaveCuration(curation);
      }

      toast({
        title: "인사이트 저장 완료",
        description: "마이페이지 > 내 인사이트에 저장되었습니다.",
      });

      setShowInsightEditor(false);
      setShowInsightReward(true);
      setInsightText('');
      setSelectedInsightTags([]);
      setShowAllInsightTags(false);
    } catch (error: any) {
      toast({
        title: "인사이트 저장 실패",
        description: error?.message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsSavingInsight(false);
    }
  };

  const formatTimeAgo = (date: Date | string | null | undefined): string => {
    if (!date) return 'recently';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getEmotionMeta = (emotion: EmotionType) => {
    const matched = EMOTION_CONFIG.find((entry) => entry.type === emotion);
    return {
      color: matched?.color || '#999898',
      label: matched?.labelKo || emotion,
    };
  };


  const proseBlocks = useMemo(() => {
    const plainContent = stripArticleMeta(article?.content);
    const raw = (plainContent || article?.summary || '').trim();
    if (!raw) return [] as string[];

    const paragraphs = raw
      .split('\n\n')
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    return paragraphs.flatMap((paragraph) => {
      if (paragraph.length <= 220) {
        return [paragraph];
      }

      const segments = paragraph
        .split(/(?<=[.!?])\s+/)
        .map((segment) => segment.trim())
        .filter(Boolean);

      const chunks: string[] = [];
      let current = '';

      segments.forEach((segment) => {
        const candidate = current ? `${current} ${segment}` : segment;
        if (candidate.length > 200 && current) {
          chunks.push(current);
          current = segment;
          return;
        }
        current = candidate;
      });

      if (current) {
        chunks.push(current);
      }

      return chunks.length > 0 ? chunks : [paragraph];
    });
  }, [article?.content, article?.summary]);

  useEffect(() => {
    if (!article) return;
    const frame = requestAnimationFrame(() => {
      const node = scrollContainerRef.current;
      if (!node) return;
      if (proseBlocks.length <= 1) {
        setRevealedParagraphCount(Math.max(1, proseBlocks.length));
        setHasStartedScrollReveal(true);
        return;
      }
      if (node.scrollHeight <= node.clientHeight + 8) {
        setRevealedParagraphCount(proseBlocks.length);
        setHasStartedScrollReveal(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [article, proseBlocks.length]);

  useEffect(() => {
    if (!article) return;

    let cancelled = false;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const emotionPath = article.emotion || emotionType;
    const longShareLink = `${origin}/emotion/${emotionPath}?id=${encodeURIComponent(String(article.id))}`;
    const sourceCandidate = detectSourceUrl(article) || longShareLink;
    const emotionLabel = article.emotion ? getEmotionMeta(article.emotion).label : '뉴스';

    const fallbackKeywordPack = buildFallbackShareKeywordPack(article, emotionLabel);

    const applyDrafts = (resolvedSourceLink: string, keywordPack: ShareKeywordPack) => {
      const next: Record<SharePlatform, ShareDraft> = {
        web: buildDefaultShareDraft('web', article, emotionLabel, resolvedSourceLink, keywordPack),
        instagram: buildDefaultShareDraft('instagram', article, emotionLabel, resolvedSourceLink, keywordPack),
        threads: buildDefaultShareDraft('threads', article, emotionLabel, resolvedSourceLink, keywordPack),
        youtube: buildDefaultShareDraft('youtube', article, emotionLabel, resolvedSourceLink, keywordPack),
      };
      setShareDrafts(next);
    };

    setShareLink(longShareLink);
    setShareLinkDisplay(longShareLink.replace(/^https?:\/\//i, ''));
    setSourceShortLink(sourceCandidate);
    applyDrafts(sourceCandidate, fallbackKeywordPack);
    setIsPreparingShareLink(true);

    (async () => {
      let resolvedShareLink = longShareLink;
      let resolvedSourceLink = sourceCandidate;
      let resolvedDisplay = longShareLink.replace(/^https?:\/\//i, '');
      let resolvedKeywordPack = fallbackKeywordPack;

      try {
        const aiPack = await GeminiService.generateShareKeywordPack({
          title: article.title,
          summary: article.summary || '',
          content: stripArticleMeta(article.content),
          category: article.category || '',
          emotion: article.emotion || emotionLabel,
        });
        resolvedKeywordPack = normalizeShareKeywordPack(aiPack, fallbackKeywordPack);
      } catch {
        resolvedKeywordPack = fallbackKeywordPack;
      }

      try {
        const mainShort = await DBService.createShortLink(longShareLink);
        resolvedShareLink = mainShort?.shortUrl || longShareLink;
        resolvedDisplay = mainShort?.shortDisplay || resolvedShareLink.replace(/^https?:\/\//i, '');
      } catch {
        resolvedShareLink = longShareLink;
        resolvedDisplay = resolvedShareLink.replace(/^https?:\/\//i, '');
      }

      try {
        if (sourceCandidate === longShareLink) {
          resolvedSourceLink = resolvedShareLink;
        } else {
          const sourceShort = await DBService.createShortLink(sourceCandidate);
          resolvedSourceLink = sourceShort?.shortUrl || sourceCandidate;
        }
      } catch {
        resolvedSourceLink = sourceCandidate;
      }

      if (cancelled) return;
      setShareLink(resolvedShareLink);
      setShareLinkDisplay(resolvedDisplay);
      setSourceShortLink(resolvedSourceLink);
      applyDrafts(resolvedSourceLink, resolvedKeywordPack);
      setIsPreparingShareLink(false);
    })().catch(() => {
      if (cancelled) return;
      setIsPreparingShareLink(false);
    });

    return () => {
      cancelled = true;
    };
  }, [article?.id, emotionType]);

  const activeShareDraft = shareDrafts[sharePlatform];
  const activeSharePackage = activeShareDraft ? toSharePackage(activeShareDraft) : null;
  const activeTagTokens = useMemo(() => parseTagTokens(activeShareDraft?.tagText || ''), [activeShareDraft?.tagText]);

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }

      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const succeeded = document.execCommand('copy');
      document.body.removeChild(textArea);
      return succeeded;
    } catch {
      return false;
    }
  };

  const updateActiveShareDraft = (patch: Partial<ShareDraft>) => {
    setShareDrafts((prev) => ({
      ...prev,
      [sharePlatform]: {
        ...prev[sharePlatform],
        ...patch,
      },
    }));
  };

  const handleCopyLink = async () => {
    const copied = await copyToClipboard(shareLink);
    if (copied) {
      toast({ title: '링크 복사 완료', description: '공유 링크를 클립보드에 복사했습니다.' });
      return;
    }
    toast({ title: '복사 실패', description: '링크 복사에 실패했습니다.', variant: 'destructive' });
  };

  const handleCopySourceLink = async () => {
    const source = activeShareDraft?.sourceLink || sourceShortLink || shareLink;
    const copied = await copyToClipboard(source);
    if (copied) {
      toast({ title: '출처 링크 복사 완료', description: '출처 링크를 클립보드에 복사했습니다.' });
      return;
    }
    toast({ title: '복사 실패', description: '출처 링크 복사에 실패했습니다.', variant: 'destructive' });
  };

  const handleSelectSharePlatform = (platform: SharePlatform) => {
    setSharePlatform(platform);
  };

  const handleCopyTagSet = async () => {
    if (!activeShareDraft) return;
    const copied = await copyToClipboard(activeShareDraft.tagText);
    if (copied) {
      toast({ title: '키워드/해시태그 복사 완료', description: `${sharePlatform.toUpperCase()} 포맷으로 복사했습니다.` });
      return;
    }
    toast({ title: '복사 실패', description: '키워드/해시태그 복사에 실패했습니다.', variant: 'destructive' });
  };

  const handleNormalizeTags = () => {
    if (!activeShareDraft) return;
    const normalizedTokens = parseTagTokens(activeShareDraft.tagText);
    const safeTokens = normalizedTokens.slice(0, 10);
    while (safeTokens.length < 5) {
      safeTokens.push(`태그${safeTokens.length + 1}`);
    }
    updateActiveShareDraft({ tagText: formatTagText(sharePlatform, safeTokens) });
  };

  const handleCopySharePackage = async () => {
    if (!activeSharePackage) return;
    const copied = await copyToClipboard(buildSharePackageText(activeSharePackage));
    if (copied) {
      toast({ title: '패키지 복사 완료', description: `${activeSharePackage.platformLabel}용 공유 패키지를 복사했습니다.` });
      return;
    }
    toast({ title: '복사 실패', description: '공유 패키지 복사에 실패했습니다.', variant: 'destructive' });
  };

  const handleOpenPlatformPage = async () => {
    if (!activeSharePackage) return;

    const target = buildShareOpenTarget(activeSharePackage);
    if (!target.supportsPrefill) {
      await handleCopySharePackage();
      toast({
        title: `${activeSharePackage.platformLabel} 자동 입력 제한`,
        description: '플랫폼 정책상 글쓰기 필드 자동 입력이 제한되어 패키지를 복사해 두었습니다.',
      });
    }
    window.open(target.url, '_blank', 'noopener,noreferrer');
  };

  const glowCore = `0 0 20px ${color}60`;
  const glowMid = `0 0 60px ${color}30`;
  const glowAmbient = `0 0 120px ${color}10`;
  const fullGlow = `${glowCore}, ${glowMid}, ${glowAmbient}`;
  const currentEmotionMeta = article?.emotion ? getEmotionMeta(article.emotion) : null;
  const isBackdropDark = isDarkHexColor(color);
  const readingProgress = Math.round(bgTransitionProgress * 100);
  const articleDepth = Math.max(0, Math.min(100, Number(article?.intensity ?? 50)));
  const useLightBodyText = articleDepth > 60;

  return (
    <AnimatePresence>
      {article && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50"
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
            style={{
              WebkitBackdropFilter: 'blur(12px)',
              background: 'transparent',
            }}
          />

          <motion.div
            ref={dialogPanelRef}
            layoutId={layoutId}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 16 }}
            animate={{
              opacity: 1,
              scale: shouldReduceMotion ? 1 : 1,
              y: shouldReduceMotion ? 0 : 0,
            }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 12 }}
            transition={{
              duration: shouldReduceMotion ? 0.2 : 0.35,
              type: shouldReduceMotion ? 'tween' : 'spring',
              stiffness: 300,
              damping: 25,
            }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[calc(100vw-12px)] sm:w-[calc(100vw-48px)] max-w-[860px] h-[100dvh] sm:h-[96dvh] sm:my-[2dvh] mx-auto flex flex-col overflow-hidden rounded-none sm:rounded-[28px] shadow-[0_28px_80px_rgba(20,20,24,0.30)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="news-detail-title"
            aria-describedby="news-detail-content"
            style={{
              background: cardBackground || `linear-gradient(180deg, ${color}20 0%, rgba(250,250,252,0.98) 35%, rgba(248,248,250,0.98) 100%)`,
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.36)',
            }}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-white/30 z-30">
              <div
                className="h-full transition-[width] duration-150 ease-out"
                style={{ width: `${readingProgress}%`, backgroundColor: color }}
                aria-hidden="true"
              />
            </div>

            <div className="absolute inset-0 pointer-events-none z-0">
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0, boxShadow: 'none' }}
                animate={{
                  opacity: isBrightEmotion ? [0.35, 0.95, 0.55, 1, 0.6] : [0, 1, 0.7, 1, 0.7],
                  boxShadow: [
                    'none',
                    isBrightEmotion ? `0 0 26px ${color}80, 0 0 90px ${color}4d, 0 0 180px ${color}2e` : fullGlow,
                    `0 0 15px ${color}50, 0 0 45px ${color}25, 0 0 100px ${color}08`,
                    isBrightEmotion ? `0 0 26px ${color}80, 0 0 90px ${color}4d, 0 0 180px ${color}2e` : fullGlow,
                    `0 0 15px ${color}50, 0 0 45px ${color}25, 0 0 100px ${color}08`,
                  ],
                }}
                transition={{
                  opacity: { duration: isBrightEmotion ? 0.8 : 0.5, repeat: Infinity, repeatDelay: isBrightEmotion ? 1 : 2 },
                  boxShadow: { duration: isBrightEmotion ? 3 : 4, repeat: Infinity, ease: "easeInOut" },
                }}
              />
            </div>

            {/* Scrollable Content */}
            <div
              ref={scrollContainerRef}
              onScroll={handleContentScroll}
              className="flex-1 overflow-y-auto minimal-scrollbar px-0 pb-20 sm:pb-20 md:pb-20 pt-10 z-10"
            >
              <div className="w-full px-[30px] py-5 md:py-7">
                <div className="flex justify-end mb-4">
                  <Button
                    ref={closeButtonRef}
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="bg-white/72 text-gray-700 hover:bg-white border border-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2"
                    aria-label="Close detail modal"
                    data-testid="button-close-modal"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                <div className="w-full">
                  {article.image && (
                    <div className="mb-8">
                      <div className="w-full rounded-2xl overflow-hidden bg-white/55 border border-black/10 aspect-video">
                        <img
                          src={article.image}
                          alt={article.title}
                          className="w-full h-full object-contain bg-white"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <span className="text-xs font-medium text-gray-800 bg-white/70 px-3 py-1 rounded-full inline-flex items-center">
                      {article.category || currentEmotionMeta?.label || '일반 뉴스'}
                    </span>
                    <span className="text-xs text-white/85 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimeAgo(article.created_at)}
                    </span>
                  </div>

                  <motion.h2
                    id="news-detail-title"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: shouldReduceMotion ? 0 : 0.08 }}
                    className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight"
                  >
                    {article.title}
                  </motion.h2>

                  <div className="mb-6 rounded-2xl border border-black/10 bg-white/55 p-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={handleSummarizeArticle}
                        disabled={isAiBusy && !isSummarizing}
                        className="h-8 text-xs border-0 bg-gradient-to-r from-[#a773f9] to-[#8b5cf6] hover:from-[#9564ed] hover:to-[#7c4deb] text-white"
                      >
                        {isSummarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        AI 요약
                      </Button>
                    </div>
                    {aiActionError && (
                      <p className="mt-2 text-xs text-red-600">{aiActionError}</p>
                    )}
                    {aiSummary && (
                      <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2">
                        <p className="text-[11px] font-semibold text-sky-700 mb-1">AI Summary</p>
                        <p className="text-xs text-sky-900 whitespace-pre-wrap">{aiSummary}</p>
                      </div>
                    )}
                  </div>

                  <div id="news-detail-content" className={`${useLightBodyText ? 'text-white font-normal' : 'text-gray-900 font-normal'} text-[17px] md:text-[18px] leading-8 md:leading-9 mb-12 min-h-[120px] whitespace-pre-wrap tracking-wide`}>
                {interactiveArticle ? (
                  <div className="bg-white/5 p-6 rounded-xl border border-white/10 shadow-inner">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-bold text-purple-400 flex items-center gap-2 bg-purple-500/10 px-2 py-1 rounded">
                        <Sparkles className="w-3 h-3" /> INTERACTIVE JSON
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                      className="h-7 text-xs text-white/40 hover:text-white hover:bg-white/10"
                      onClick={() => setInteractiveArticle(null)}
                    >
                      원문 보기
                    </Button>
                  </div>
                    <Suspense fallback={<div className="text-sm text-white/60">로딩 중...</div>}>
                      <LazyStoryRenderer article={interactiveArticle} />
                    </Suspense>
                  </div>
                ) : (
                  <div className="space-y-5 md:space-y-6">
                    {interactiveError && (
                      <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100 space-y-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <p>{interactiveError.message}</p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={handleMyArticle}
                          disabled={isAiBusy && !isTransforming}
                          className="h-8 border-amber-300/50 bg-transparent text-amber-100 hover:bg-amber-300/10"
                        >
                          <RefreshCcw className="w-3 h-3" />
                          다시 시도
                        </Button>
                      </div>
                    )}
                    {proseBlocks.slice(0, Math.max(1, Math.min(revealedParagraphCount, proseBlocks.length))).map((paragraph, idx) => {
                      const sourceLike = isSourceLikeParagraph(paragraph);
                      const previewOnly = idx === 0 && !hasStartedScrollReveal && proseBlocks.length > 1;
                      return (
                      <motion.p
                        key={`${article.id}-${idx}`}
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        transition={{ duration: shouldReduceMotion ? 0.1 : 0.28, ease: 'easeOut', delay: shouldReduceMotion ? 0 : Math.min(idx * 0.04, 0.18) }}
                        className={[
                          sourceLike
                            ? 'text-left text-[10px] md:text-xs leading-5 md:leading-6 opacity-50 break-all'
                            : 'text-left opacity-95 leading-8 md:leading-9',
                          previewOnly ? 'line-clamp-2' : '',
                        ].join(' ').trim()}
                      >
                        {paragraph}
                      </motion.p>
                    )})}
                    {!hasStartedScrollReveal && proseBlocks.length > 1 && (
                      <p className="text-xs text-gray-500/90">스크롤하면 본문이 이어서 표시됩니다.</p>
                    )}
                  </div>
                )}
              </div>

                  {showNextHandoffCue && (
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0.1 : 0.25 }}
                  className="mb-10 pt-16 pb-14 text-center"
                >
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-lg md:text-2xl font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2 rounded-md"
                    style={{
                      color: isBackdropDark ? '#ffffff' : '#1f2937',
                      textShadow: isBackdropDark ? '0 1px 14px rgba(15,23,42,0.55)' : '0 1px 8px rgba(255,255,255,0.65)',
                    }}
                  >
                    목록으로 돌아가기
                  </button>
                </motion.div>
                  )}

                  {(displayedRecommendations.length > 0) && !interactiveArticle && (
                    <div ref={recommendationSectionRef} className="mt-12 bg-white/55 rounded-3xl p-5 md:p-6">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <h4 className="text-sm font-semibold" style={{ color: isBackdropDark ? '#f8fafc' : '#111827' }}>추천 뉴스</h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      {currentEmotionMeta && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full border"
                          style={{
                            color: '#374151',
                            borderColor: '#d1d5db',
                            backgroundColor: '#f9fafb',
                          }}
                        >
                          현재 감정 {currentEmotionMeta.label}
                        </span>
                      )}
                      <span className="text-[11px]" style={{ color: isBackdropDark ? 'rgba(255,255,255,0.9)' : '#4b5563' }}>감정 균형을 고려한 제안입니다.</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    {displayedRecommendations.map((item) => {
                      const isBalanceItem = recommendationGroups.balance.some((balance) => balance.id === item.id);
                      const itemEmotionMeta = getEmotionMeta(item.emotion);
                      const recommendationDepth = Math.max(0, Math.min(100, item.intensity ?? 50));
                      const palette = getDepthPalette(item.emotion as EmotionType, recommendationDepth);
                      const recommendationTextColor = recommendationDepth <= 60 ? '#232221' : '#ffffff';
                      const recommendationSubTextColor = recommendationDepth <= 60 ? '#5f5d5c' : 'rgba(255,255,255,0.82)';
                      const compactCategory = formatRecommendationCategory(item.category, itemEmotionMeta.label);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onSelectArticle?.(item);
                            scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="flex items-stretch gap-3 md:block md:gap-0 text-left rounded-2xl overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2 h-full"
                          style={{
                            background: palette.background,
                            color: recommendationTextColor,
                          }}
                        >
                          <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-full md:aspect-[4/3] shrink-0 rounded-none overflow-hidden bg-white/20">
                            {item.image && (
                              <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="p-3 flex-1 min-w-0 flex flex-col">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <p className="text-[11px] leading-4 min-w-0 line-clamp-2 break-all pr-1" style={{ color: recommendationSubTextColor }}>{compactCategory}</p>
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full border shrink-0"
                                style={isBalanceItem
                                  ? {
                                    color: recommendationTextColor,
                                      borderColor: recommendationTextColor,
                                      backgroundColor: 'transparent',
                                    }
                                  : {
                                    color: recommendationSubTextColor,
                                      borderColor: recommendationSubTextColor,
                                      backgroundColor: 'transparent',
                                    }}
                              >
                                {isBalanceItem ? '균형 추천' : '연결 추천'}
                              </span>
                            </div>
                            <p className="text-sm font-semibold line-clamp-1 md:line-clamp-2" style={{ color: recommendationTextColor }}>{item.title}</p>
                            <p className="mt-1 text-xs line-clamp-1" style={{ color: recommendationSubTextColor }}>{item.summary}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                    </div>
                  )}

                  {/* Footer Action Buttons */}
                  <div className="mt-6 max-w-3xl mx-auto p-2 border border-black/10 bg-white/58 backdrop-blur rounded-2xl">
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (!user) {
                            toast({ title: "로그인 필요", description: "로그인 후 이용 가능합니다.", variant: "destructive" });
                            return;
                          }
                          handleSave();
                        }}
                        className="w-full sm:w-auto h-9 px-2.5 sm:px-3 text-xs sm:text-sm text-gray-700 bg-white/75 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2"
                        data-testid="button-save-article"
                      >
                        <Bookmark className="w-4 h-4" />
                        저장
                      </Button>

                      <Button
                        variant="ghost"
                        onClick={handleShare}
                        className="w-full sm:w-auto h-9 px-2.5 sm:px-3 text-xs sm:text-sm text-gray-700 bg-white/75 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2"
                        data-testid="button-share-article"
                      >
                        <Share2 className="w-4 h-4" />
                        공유
                      </Button>

                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (!user) {
                            toast({ title: "로그인 필요", description: "인사이트는 로그인 후 작성 가능합니다.", variant: "destructive" });
                            return;
                          }
                          setShowInsightEditor(true);
                        }}
                        className="w-full sm:w-auto h-9 px-2.5 sm:px-3 text-xs sm:text-sm text-gray-700 bg-white/75 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2"
                        data-testid="button-add-insight"
                      >
                        <Lightbulb className="w-4 h-4" />
                        인사이트
                      </Button>

                      <Button
                        onClick={() => {
                          if (!user) {
                            toast({ title: "로그인 필요", description: "의견 기반 기사 작성은 로그인 후 이용 가능합니다.", variant: "destructive" });
                            return;
                          }
                          void handleMyArticle();
                        }}
                        disabled={isAiBusy && !isTransforming}
                        className="w-full sm:w-auto h-9 px-2.5 sm:px-3 text-xs sm:text-sm bg-white/75 text-white hover:bg-white transition-all font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2"
                        variant="flowing"
                        style={{
                          backgroundColor: undefined,
                          color: '#ffffff',
                        }}
                        data-testid="button-my-article"
                      >
                        {isTransforming ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            생성 중...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            내 의견으로 기사 만들기
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* Share Sheet Overlay */}
            <AnimatePresence>
              {showShareSheet && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 bg-black/35 backdrop-blur-[1px] p-3 sm:p-6 flex items-end sm:items-center justify-center"
                  onWheel={(event) => {
                    event.preventDefault();
                  }}
                  onTouchMove={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => setShowShareSheet(false)}
                  role="presentation"
                >
                  <motion.div
                    ref={shareSheetRef}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
                    transition={{ duration: shouldReduceMotion ? 0.15 : 0.22 }}
                    onClick={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                    onTouchMove={(event) => event.stopPropagation()}
                    className="w-full max-w-2xl max-h-[88dvh] sm:max-h-[82dvh] rounded-2xl border border-black/10 bg-white shadow-2xl flex flex-col overflow-hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="공유 시트"
                  >
                    <div className="flex items-center justify-between p-4 border-b border-gray-100">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">공유 시트</p>
                        <p className="text-xs text-gray-500">Copy link + 플랫폼별 공유 문구/SEO 패키지(빠른 버전)</p>
                      </div>
                      <Button
                        ref={shareCloseButtonRef}
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowShareSheet(false)}
                        className="h-8 w-8 text-gray-600 hover:bg-gray-100"
                        aria-label="공유 시트 닫기"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="p-4 space-y-4 overflow-y-auto overscroll-contain min-h-0">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          variant="outline"
                          onClick={handleCopyLink}
                          className="h-9 sm:h-10 text-sm justify-start sm:justify-center"
                        >
                          <Link2 className="w-4 h-4" />
                          Copy link
                        </Button>
                        <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 break-all">
                          <span title={shareLink}>{shareLinkDisplay || shareLink}</span>
                        </div>
                      </div>
                      {isPreparingShareLink && (
                        <div className="text-xs text-gray-500 inline-flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          짧은 링크 생성 중...
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {([
                          { key: 'web' as SharePlatform, label: 'Web', Icon: Globe },
                          { key: 'instagram' as SharePlatform, label: 'Instagram', Icon: Instagram },
                          { key: 'threads' as SharePlatform, label: 'Threads', Icon: MessageCircle },
                          { key: 'youtube' as SharePlatform, label: 'YouTube', Icon: Youtube },
                        ]).map(({ key, label, Icon }) => {
                          const active = sharePlatform === key;
                          return (
                            <Button
                              key={key}
                              type="button"
                              variant={active ? 'default' : 'outline'}
                              onClick={() => handleSelectSharePlatform(key)}
                              className="h-10 text-sm"
                            >
                              <Icon className="w-4 h-4" />
                              {label}
                            </Button>
                          );
                        })}
                      </div>

                      {activeSharePackage && (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-gray-700">
                              {activeSharePackage.platformLabel} 공유 패키지 (수정 가능)
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCopySharePackage}
                              className="h-7 px-2 text-xs"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              패키지 복사
                            </Button>
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-1.5">
                            <p className="text-[11px] font-medium text-gray-600">공유 문구</p>
                            <textarea
                              value={activeShareDraft.shareText}
                              onChange={(event) => updateActiveShareDraft({ shareText: event.target.value })}
                              rows={4}
                              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
                            />
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-medium text-gray-600">출처 링크</p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopySourceLink}
                                className="h-7 px-2 text-[11px]"
                              >
                                <Copy className="w-3 h-3" />
                                출처 복사
                              </Button>
                            </div>
                            <div
                              className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-900 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                              title={activeShareDraft.sourceLink || sourceShortLink || shareLink}
                            >
                              {activeShareDraft.sourceLink || sourceShortLink || shareLink}
                            </div>
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-2">
                            <p className="text-[11px] font-medium text-gray-600">SEO Title 선택</p>
                            <label className="flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="radio"
                                name={`seo-title-mode-${activeSharePackage.platform}`}
                                checked={activeShareDraft.seoTitleMode === 'default'}
                                onChange={() => updateActiveShareDraft({ seoTitleMode: 'default' })}
                              />
                              기본 제목
                            </label>
                            <input
                              value={activeShareDraft.seoTitleDefault}
                              onChange={(event) => updateActiveShareDraft({ seoTitleDefault: event.target.value })}
                              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
                            />
                            <label className="flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="radio"
                                name={`seo-title-mode-${activeSharePackage.platform}`}
                                checked={activeShareDraft.seoTitleMode === 'recommended'}
                                onChange={() => updateActiveShareDraft({ seoTitleMode: 'recommended' })}
                              />
                              추천 제목
                            </label>
                            <input
                              value={activeShareDraft.seoTitleRecommended}
                              onChange={(event) => updateActiveShareDraft({ seoTitleRecommended: event.target.value })}
                              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
                            />
                            <label className="flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="radio"
                                name={`seo-title-mode-${activeSharePackage.platform}`}
                                checked={activeShareDraft.seoTitleMode === 'custom'}
                                onChange={() => updateActiveShareDraft({ seoTitleMode: 'custom' })}
                              />
                              직접 입력
                            </label>
                            <input
                              value={activeShareDraft.seoTitleCustom}
                              onChange={(event) => updateActiveShareDraft({ seoTitleCustom: event.target.value, seoTitleMode: 'custom' })}
                              placeholder="직접 입력한 SEO 제목"
                              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
                            />
                            <p className="text-[10px] text-gray-500">선택된 SEO Title: {activeSharePackage.seoTitle}</p>
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-1.5">
                            <p className="text-[11px] font-medium text-gray-600">SEO Description (3문장 기본 생성)</p>
                            <textarea
                              value={activeShareDraft.seoDescription}
                              onChange={(event) => updateActiveShareDraft({ seoDescription: event.target.value })}
                              rows={4}
                              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
                            />
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-medium text-gray-600">키워드/해시태그</p>
                              <div className="inline-flex gap-1">
                                <Button variant="outline" size="sm" onClick={handleNormalizeTags} className="h-7 px-2 text-[11px]">
                                  5~10개 정규화
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleCopyTagSet} className="h-7 px-2 text-[11px]">
                                  <Copy className="w-3 h-3" />
                                  태그 복사
                                </Button>
                              </div>
                            </div>
                            <textarea
                              value={activeShareDraft.tagText}
                              onChange={(event) => updateActiveShareDraft({ tagText: event.target.value })}
                              rows={3}
                              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
                            />
                            <p className={`text-[10px] ${activeTagTokens.length < 5 || activeTagTokens.length > 10 ? 'text-amber-600' : 'text-gray-500'}`}>
                              현재 태그 수: {activeTagTokens.length}개 (권장 5~10개) | Instagram/Threads는 `#`, YouTube는 `,` 포맷 권장
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="rounded-lg border border-gray-200 bg-white p-2.5">
                              <p className="text-[11px] font-medium text-gray-600 mb-1">현재 플랫폼</p>
                              <p className="text-xs text-gray-900">{activeSharePackage.platformLabel}</p>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-white p-2.5">
                              <p className="text-[11px] font-medium text-gray-600 mb-1">자동 주입 가능 여부</p>
                              <p className="text-xs text-gray-900">
                                {buildShareOpenTarget(activeSharePackage).supportsPrefill ? '가능(텍스트 사전 주입)' : '제한됨(복사 후 수동 붙여넣기)'}
                              </p>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleOpenPlatformPage}
                              className="h-8 text-xs"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              플랫폼 열기
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Opinion Article Composer Overlay */}
            <AnimatePresence>
              {showOpinionComposer && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex items-center justify-center px-4 py-6"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Opinion article composer"
                >
                  <div className="absolute inset-0 bg-[#f4efe4]/78 backdrop-blur-sm" onClick={() => setShowOpinionComposer(false)} />
                  <motion.div
                    ref={opinionComposerPanelRef}
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 14, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="relative z-10 w-full max-w-[760px] max-h-[82vh] overflow-hidden rounded-2xl border border-[#dfd4bf] bg-[#fbf7ef] shadow-[0_20px_50px_rgba(64,48,28,0.18)] flex flex-col"
                  >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#e6dcc8]">
                      <h3 className="text-lg font-semibold text-[#2d2a25] flex items-center gap-2">
                        <Sparkles className="w-5 h-5" style={{ color }} />
                        내 의견으로 기사 만들기
                      </h3>
                      <Button
                        ref={opinionCloseButtonRef}
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowOpinionComposer(false)}
                        className="text-[#4b4439] hover:bg-[#efe6d4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a7758]"
                        aria-label="Close opinion composer"
                        data-testid="button-close-opinion-composer"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="p-5 overflow-y-auto space-y-4 flex-1 min-h-0">
                      <div className="rounded-xl bg-[#f6efdf] border border-[#e6dcc8] p-3">
                        <p className="text-xs text-[#6b6254] mb-1">원문 기사 (읽기 전용)</p>
                        <p className="text-sm text-[#2f2a23] font-medium line-clamp-2">{article?.title}</p>
                        <p className="mt-2 text-[11px] text-[#7a6f61]">
                          원문은 수정되지 않으며, 독립된 신규 기사로 저장됩니다.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm text-[#4a4338] mb-2">
                          나의 의견 ({opinionText.length}/{MAX_OPINION_LENGTH})
                        </label>
                        <textarea
                          value={opinionText}
                          onChange={(e) => setOpinionText(e.target.value.slice(0, MAX_OPINION_LENGTH))}
                          placeholder="예: 이 기사에서 정책 실행 시점과 현장 체감의 간극이 가장 중요하다고 봅니다. 어떤 지표로 실제 변화를 검증할지 함께 다뤄주세요."
                          rows={4}
                          className="w-full px-4 py-3 rounded-lg border border-[#dacfb9] bg-[#fffdfa] text-[#292521] placeholder-[#9a8f7f] focus:outline-none focus:ring-2 focus:ring-[#bda885] resize-none"
                          data-testid="textarea-opinion-input"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-[#4a4338] mb-2">추가 요청 (선택)</label>
                        <textarea
                          value={opinionExtraRequest}
                          onChange={(e) => setOpinionExtraRequest(e.target.value.slice(0, 600))}
                          placeholder="예: 국내외 유사 사례 비교, 최근 3년 추세 데이터, 반대 관점의 근거도 함께 포함"
                          rows={2}
                          className="w-full px-4 py-3 rounded-lg border border-[#dacfb9] bg-[#fffdfa] text-[#292521] placeholder-[#9a8f7f] focus:outline-none focus:ring-2 focus:ring-[#bda885] resize-none"
                          data-testid="textarea-opinion-extra-request"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-[#4a4338] mb-2">요청 출처/데이터 (선택, 줄바꿈 또는 쉼표 구분)</label>
                        <textarea
                          value={opinionReferenceText}
                          onChange={(e) => setOpinionReferenceText(e.target.value.slice(0, 1000))}
                          placeholder={`예:\n통계청 가계동향조사\n고용노동부 월간 고용동향\nOECD 관련 보고서`}
                          rows={3}
                          className="w-full px-4 py-3 rounded-lg border border-[#dacfb9] bg-[#fffdfa] text-[#292521] placeholder-[#9a8f7f] focus:outline-none focus:ring-2 focus:ring-[#bda885] resize-none"
                          data-testid="textarea-opinion-references"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          onClick={handleGenerateOpinionArticle}
                          disabled={isTransforming}
                          className="sm:flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a7758]"
                          style={{ backgroundColor: color, color: '#1f2937' }}
                          data-testid="button-generate-opinion-article"
                        >
                          {isTransforming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          기사 초안 생성
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-[#d8ccb5] text-[#4e463b]"
                          onClick={() => setShowOpinionComposer(false)}
                        >
                          닫기
                        </Button>
                      </div>

                      {aiActionError && (
                        <p className="text-xs text-red-600">{aiActionError}</p>
                      )}

                      {composedDraft && (
                        <div className="rounded-xl border border-[#dfd4bf] bg-[#fffaf1] p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#2d2a25]">생성된 기사 편집</p>
                            {composedDraft.fallbackUsed && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f3ead7] text-[#7a6444]">안정 모드</span>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-[#6b6254] mb-1">기사 제목</label>
                            <input
                              value={editableComposedTitle}
                              onChange={(e) => setEditableComposedTitle(e.target.value.slice(0, 220))}
                              className="w-full px-3 py-2 rounded-lg border border-[#dacfb9] bg-white text-[#292521] focus:outline-none focus:ring-2 focus:ring-[#bda885]"
                              data-testid="input-composed-title"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#6b6254] mb-1">기사 본문(수정 가능)</label>
                            <textarea
                              value={editableComposedContent}
                              onChange={(e) => setEditableComposedContent(e.target.value.slice(0, 24000))}
                              rows={12}
                              className="w-full max-h-64 overflow-y-auto px-3 py-2 rounded-lg border border-[#dacfb9] bg-white text-[#292521] whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-[#bda885] resize-y"
                              data-testid="textarea-composed-content"
                            />
                          </div>
                          {Array.isArray(composedDraft.references) && composedDraft.references.length > 0 && (
                            <div>
                              <p className="text-xs text-[#6b6254] mb-1">참고 출처</p>
                              <ul className="space-y-1">
                                {composedDraft.references.map((ref, idx) => (
                                  <li key={`${ref.title}-${idx}`} className="text-xs text-[#4e463b]">
                                    - {ref.title || ref.source || '출처'} {ref.url ? `(${ref.url})` : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <Button
                            onClick={handleSaveComposedArticle}
                            disabled={isSavingComposedDraft}
                            className="w-full bg-[#2f2a24] text-white hover:bg-[#221e1a]"
                            data-testid="button-save-opinion-article"
                          >
                            {isSavingComposedDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            내가 쓴 기사에 저장
                          </Button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Insight Editor Overlay */}
            <AnimatePresence>
              {showInsightEditor && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex items-center justify-center px-4 py-6"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Insight editor"
                >
                  <div className="absolute inset-0 bg-[#f4efe4]/78 backdrop-blur-sm" onClick={() => setShowInsightEditor(false)} />
                  <motion.div
                    ref={insightPanelRef}
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 14, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="relative z-10 w-full max-w-[640px] max-h-[78vh] overflow-hidden rounded-2xl border border-[#dfd4bf] bg-[#fbf7ef] shadow-[0_20px_50px_rgba(64,48,28,0.18)]"
                  >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#e6dcc8]">
                      <h3 className="text-lg font-semibold text-[#2d2a25] flex items-center gap-2">
                        <Lightbulb className="w-5 h-5" style={{ color }} />
                        인사이트 추가
                      </h3>
                      <Button
                        ref={insightCloseButtonRef}
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowInsightEditor(false)}
                        className="text-[#4b4439] hover:bg-[#efe6d4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a7758]"
                        aria-label="Close insight editor"
                        data-testid="button-close-insight"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="p-5 overflow-y-auto">
                      <div className="mb-4 p-3 rounded-xl bg-[#f6efdf] border border-[#e6dcc8]">
                        <p className="text-xs text-[#6b6254] mb-1">원문 기사</p>
                        <p className="text-sm text-[#2f2a23] font-medium line-clamp-2">{article?.title}</p>
                      </div>

                      <div className="mt-1">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <label className="block text-sm text-[#4a4338]">
                            감정 구름 태그 (최대 {MAX_INSIGHT_TAG_SELECTION}개)
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowAllInsightTags((prev) => !prev)}
                            className="text-xs px-2 py-1 rounded-md bg-[#efe6d4] text-[#5f5649] hover:bg-[#e6dbc5]"
                            data-testid="button-toggle-insight-tag-more"
                          >
                            {showAllInsightTags ? '핵심 태그만 보기' : '+ 내 감정 더 찾기'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {visibleInsightTags.map((tag, idx) => {
                            const toneStyle = INSIGHT_TAG_TONE_STYLE[tag.tone];
                            const selected = selectedInsightTags.includes(tag.label);
                            return (
                              <button
                                key={tag.label}
                                type="button"
                                onClick={() => toggleInsightTag(tag.label)}
                                className="text-xs sm:text-sm px-3 py-1.5 rounded-full transition-all duration-200"
                                style={{
                                  backgroundColor: selected ? toneStyle.selectedBg : toneStyle.bg,
                                  color: selected ? toneStyle.selectedText : toneStyle.text,
                                  transform: `rotate(${(idx % 3) - 1}deg)`,
                                  boxShadow: selected ? '0 6px 14px rgba(93, 74, 42, 0.18)' : 'none',
                                }}
                                data-testid={`insight-tag-${tag.label}`}
                              >
                                {tag.label}
                              </button>
                            );
                          })}
                        </div>
                        {selectedInsightTags.length === 0 && (
                          <p className="mt-2 text-xs text-[#8f826f]">태그를 선택하면 질문 문구가 감정에 맞게 바뀝니다.</p>
                        )}
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm text-[#4a4338] mb-2">
                          나의 시선 ({insightText.length}/{MAX_INSIGHT_LENGTH})
                        </label>
                        <textarea
                          value={insightText}
                          onChange={(e) => setInsightText(e.target.value.slice(0, MAX_INSIGHT_LENGTH))}
                          placeholder={insightPlaceholder}
                          rows={5}
                          className="w-full px-4 py-3 rounded-lg border border-[#dacfb9] bg-[#fffdfa] text-[#292521] placeholder-[#9a8f7f] focus:outline-none focus:ring-2 focus:ring-[#bda885] resize-none"
                          data-testid="textarea-insight"
                        />
                      </div>
                    </div>

                    <div className="px-5 py-4 border-t border-[#e6dcc8]">
                      <Button
                        onClick={handleSaveInsight}
                        disabled={isSavingInsight}
                        className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a7758]"
                        style={{
                          backgroundColor: color,
                          color: '#1f2937',
                        }}
                        data-testid="button-save-insight"
                      >
                        {isSavingInsight ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        인사이트 저장
                      </Button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showInsightReward && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 flex items-center justify-center px-4"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Insight reward"
                >
                  <div className="absolute inset-0 bg-[#f4efe4]/84 backdrop-blur-[2px]" />
                  <motion.div
                    initial={{ opacity: 0, y: 18, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 14, scale: 0.98 }}
                    className="relative z-10 w-full max-w-[520px] rounded-2xl bg-[#fffaf1] border border-[#dfd4bf] p-6 text-center shadow-[0_22px_55px_rgba(85,67,41,0.24)]"
                    style={{
                      boxShadow: `0 0 0 2px ${color}22, 0 0 42px ${color}44, 0 22px 55px rgba(85,67,41,0.24)`,
                    }}
                  >
                    <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${color}2e` }}>
                      <Check className="w-6 h-6" style={{ color }} />
                    </div>
                    <p className="text-lg font-semibold text-[#2d2a25]">오늘 하루, 세상을 바라본 당신의 색깔이 하나 더 채워졌어요.</p>
                    <p className="mt-2 text-sm text-[#6f6658]">인사이트가 내 기록 보드에 저장되었습니다.</p>
                    <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
                      <Button
                        type="button"
                        ref={rewardPrimaryButtonRef}
                        className="bg-[#2f2a24] text-white hover:bg-[#221e1a]"
                        onClick={() => {
                          setShowInsightReward(false);
                          onClose();
                          setLocation('/mypage?tab=curated');
                        }}
                        data-testid="button-go-mypage-insight"
                      >
                        나의 인사이트 보러가기
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-[#d8ccb5] text-[#4e463b]"
                        onClick={() => setShowInsightReward(false)}
                      >
                        계속 읽기
                      </Button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )
      }
    </AnimatePresence >
  );
}

