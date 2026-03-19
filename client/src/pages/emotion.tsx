import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Clock, Heart, Shield, Loader2, ArrowRight, User, Home, BookOpen, Users, Search, Video, Flame, Brain, Leaf, SunMedium, Blend } from 'lucide-react';
import { EMOTION_CONFIG, EmotionType, useEmotionStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEmotionTopics, useNews, type NewsItem } from '@/hooks/useNews';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { getNewsTextTokenByDepth } from '@/lib/newsTextTokens';
import { type ArticleTopicId, normalizeArticleTopic } from '@shared/articleTopics';
import {
  emitPeripheralNudgeEvent,
  getDwellThresholdSeconds,
  getPeripheralRecommendations,
  PERIPHERAL_NUDGE_Z_INDEX,
} from '@/lib/peripheralNudge';

const EMOTION_ICONS: Record<EmotionType, typeof Heart> = {
  vibrance: SunMedium,
  immersion: Flame,
  clarity: Brain,
  gravity: Shield,
  serenity: Leaf,
  spectrum: Blend,
};

const EMOTION_FILTER_COPY: Record<EmotionType, { label: string; hint: string }> = {
  vibrance: { label: '노랑 · 설렘· 기쁨', hint: '읽는 순간 기분이 밝아지는 결' },
  immersion: { label: '빨강 · 긴장· 열정', hint: '긴장감과 열기가 크게 느껴지는 결' },
  clarity: { label: '파랑 · 냉철· 이성적', hint: '차분하게 분석하며 읽게 되는 결' },
  gravity: { label: '회색 · 묵직함· 성찰', hint: '가볍게 넘기기 어려운 깊은 결' },
  serenity: { label: '초록 · 힐링· 안정', hint: '회복과 안정을 천천히 주는 결' },
  spectrum: { label: '민트 · 스펙트럼', hint: '다양한 감정 층위를 함께 보는 결' },
};

const MOCK_AUTHORS = [
  { name: 'Kim J.', avatar: null },
  { name: 'Lee S.', avatar: null },
  { name: 'Park H.', avatar: null },
  { name: 'Choi Y.', avatar: null },
  { name: 'Jung S.', avatar: null },
];

function formatTimeAgo(date: Date | string | null | undefined): string {
  if (!date) return 'just now';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function buildCardExcerpt(text: string, maxChars: number): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '...';

  const withoutEllipsis = normalized.replace(/(\.{3}|…)+$/, '').trim();
  if (!withoutEllipsis) return '...';

  if (withoutEllipsis.length <= maxChars) {
    return `${withoutEllipsis}...`;
  }

  const sliced = withoutEllipsis.slice(0, maxChars);
  const boundary = Math.max(
    sliced.lastIndexOf(' '),
    sliced.lastIndexOf('.'),
    sliced.lastIndexOf('!'),
    sliced.lastIndexOf('?'),
    sliced.lastIndexOf('。'),
    sliced.lastIndexOf('！'),
    sliced.lastIndexOf('？'),
  );

  const cutoff = boundary >= Math.floor(maxChars * 0.6) ? boundary : maxChars;
  const preview = sliced.slice(0, cutoff).trim();
  return `${preview || sliced.trim()}...`;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = hex.replace('#', '');
  const fullHex = normalized.length === 3
    ? normalized.split('').map((ch) => `${ch}${ch}`).join('')
    : normalized;

  const r = parseInt(fullHex.slice(0, 2), 16) / 255;
  const g = parseInt(fullHex.slice(2, 4), 16) / 255;
  const b = parseInt(fullHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function getRandomAuthor(id: number | string) {
  const numericId = typeof id === 'string' ? parseInt(id, 10) || 0 : id;
  return MOCK_AUTHORS[numericId % MOCK_AUTHORS.length];
}


const NewsDetailModal = lazy(() =>
  import('@/components/NewsDetailModal').then((module) => ({ default: module.NewsDetailModal }))
);

const ARTICLE_META_OPEN = '<!-- HUEBRIEF_META_START -->';
const ARTICLE_META_CLOSE = '<!-- HUEBRIEF_META_END -->';
const GUEST_SESSION_STORAGE_KEY = 'huebrief_guest_id_v1';

function extractVideoPreviewFromMeta(content: string | null | undefined): { hasVideo: boolean; previewUrl: string | null } {
  const text = String(content || '');
  if (!text.includes(ARTICLE_META_OPEN) || !text.includes(ARTICLE_META_CLOSE)) {
    return { hasVideo: false, previewUrl: null };
  }

  const regex = new RegExp(`${ARTICLE_META_OPEN}\\s*([\\s\\S]*?)\\s*${ARTICLE_META_CLOSE}`);
  const match = text.match(regex);
  if (!match?.[1]) return { hasVideo: false, previewUrl: null };

  try {
    const parsed = JSON.parse(match[1]);
    const mediaSlots = Array.isArray(parsed?.mediaSlots) ? parsed.mediaSlots : [];
    const videoSlot = mediaSlots.find((slot: any) => String(slot?.type || '').toLowerCase() === 'video' && String(slot?.sourceUrl || '').trim());
    if (!videoSlot) return { hasVideo: false, previewUrl: null };
    return { hasVideo: true, previewUrl: String(videoSlot.sourceUrl || '').trim() || null };
  } catch {
    return { hasVideo: false, previewUrl: null };
  }
}

export default function EmotionPage() {
  const ARTICLES_PER_PAGE = 15;
  const { type } = useParams<{ type: EmotionType }>();
  const [mounted, setMounted] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [, setLocation] = useLocation();
  const { user } = useEmotionStore();
  const { toast } = useToast();
  const [selectedCardBg, setSelectedCardBg] = useState<string>('rgba(255,255,255,0.96)');
  const [searchTerm, setSearchTerm] = useState('');
  const [topicFilter, setTopicFilter] = useState<ArticleTopicId | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortKey, setSortKey] = useState<'latest' | 'oldest' | 'intensity_desc' | 'intensity_asc' | 'title_asc'>('latest');
  const [visibleCount, setVisibleCount] = useState(ARTICLES_PER_PAGE);
  const [showPeripheralNudge, setShowPeripheralNudge] = useState(false);
  const [expandPeripheralNudge, setExpandPeripheralNudge] = useState(false);
  const [suppressPeripheralNudge, setSuppressPeripheralNudge] = useState(false);
  const [sameEmotionConsumeCount, setSameEmotionConsumeCount] = useState(0);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  const dwellVisibleSecRef = useRef(0);
  const sameEmotionConsumeRef = useRef(0);
  const consumedArticleIdsRef = useRef<Set<string>>(new Set());
  const triggeredPeripheralNudgeRef = useRef(false);
  const detailConsumeTimerRef = useRef<number | null>(null);
  const detailQuickConsumeTimerRef = useRef<number | null>(null);
  const crossCategorySelectionRef = useRef<NewsItem | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existingGuestId = String(window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY) || '').trim();
    fetch('/api/guest/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId: existingGuestId || undefined }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        const guestId = String(payload?.guestId || '').trim();
        if (guestId) window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, guestId);
      })
      .catch(() => {
        // keep page flow even if guest bootstrap fails
      });
  }, []);

  const openArticleDetail = (item: NewsItem, cardBgColor: string) => {
    setSelectedCardBg(cardBgColor);
    setSelectedArticle(item);
    if (typeof window !== 'undefined') {
      const guestId = String(window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY) || '').trim();
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.id ? { 'x-actor-id': String(user.id), 'x-actor-role': String(user.role || 'general') } : {}),
          ...(guestId ? { 'x-guest-id': guestId } : {}),
        },
        body: JSON.stringify({
          event: 'news_card_open',
          page: '/emotion',
          payload: { articleId: item.id, emotion: item.emotion },
        }),
      }).catch(() => {
        // non-blocking analytics
      });
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    const carriedSelection = crossCategorySelectionRef.current;
    if (carriedSelection && carriedSelection.emotion === type) {
      setSelectedArticle(carriedSelection);
    } else {
      setSelectedArticle(null);
    }
    crossCategorySelectionRef.current = null;
    dwellVisibleSecRef.current = 0;
    sameEmotionConsumeRef.current = 0;
    consumedArticleIdsRef.current = new Set();
    triggeredPeripheralNudgeRef.current = false;
    setSameEmotionConsumeCount(0);
    setShowPeripheralNudge(false);
    setExpandPeripheralNudge(false);
    setSuppressPeripheralNudge(false);
  }, [type]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  useEffect(() => {
    if (!type || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const searchFromQuery = params.get('search');
    const topicFromQuery = normalizeArticleTopic(params.get('topic')) || normalizeArticleTopic(params.get('category'));
    setSearchTerm(searchFromQuery ? searchFromQuery.trim() : '');
    setTopicFilter(topicFromQuery || 'all');
    if (params.get('nudge') === '1') {
      triggeredPeripheralNudgeRef.current = true;
      setSuppressPeripheralNudge(false);
      setShowPeripheralNudge(true);
      emitPeripheralNudgeEvent('peripheral_nudge_shown', {
        emotion: type,
        reason: 'query_force',
      });
    }
  }, [type]);

  useEffect(() => {
    if (!selectedArticle || !type) return;
    const articleId = String(selectedArticle.id || '');
    if (!articleId) return;

    if (selectedArticle.emotion !== type) {
      sameEmotionConsumeRef.current = 0;
      consumedArticleIdsRef.current = new Set();
      setSameEmotionConsumeCount(0);
      return;
    }

    const markConsumed = (reason: 'quick_open' | 'dwell_6s') => {
      if (consumedArticleIdsRef.current.has(articleId)) return;
      consumedArticleIdsRef.current.add(articleId);
      sameEmotionConsumeRef.current = consumedArticleIdsRef.current.size;
      setSameEmotionConsumeCount(sameEmotionConsumeRef.current);
    };

    if (detailQuickConsumeTimerRef.current) {
      window.clearTimeout(detailQuickConsumeTimerRef.current);
    }
    if (detailConsumeTimerRef.current) {
      window.clearTimeout(detailConsumeTimerRef.current);
    }
    detailQuickConsumeTimerRef.current = window.setTimeout(() => {
      markConsumed('quick_open');
    }, 400);
    detailConsumeTimerRef.current = window.setTimeout(() => {
      markConsumed('dwell_6s');
    }, 6000);

    return () => {
      if (detailQuickConsumeTimerRef.current) {
        window.clearTimeout(detailQuickConsumeTimerRef.current);
        detailQuickConsumeTimerRef.current = null;
      }
      if (detailConsumeTimerRef.current) {
        window.clearTimeout(detailConsumeTimerRef.current);
        detailConsumeTimerRef.current = null;
      }
    };
  }, [selectedArticle?.id, type]);

  const handleArticleConsumeEvidence = (articleId: string, evidence: 'scroll20') => {
    if (!type) return;
    if (!selectedArticle || String(selectedArticle.id || '') !== String(articleId || '')) return;
    if (selectedArticle.emotion !== type) return;
    if (consumedArticleIdsRef.current.has(articleId)) return;
    consumedArticleIdsRef.current.add(articleId);
    sameEmotionConsumeRef.current = consumedArticleIdsRef.current.size;
    setSameEmotionConsumeCount(sameEmotionConsumeRef.current);
  };

  useEffect(() => {
    if (!type || suppressPeripheralNudge) return;
    const targetEmotion = type === 'immersion' || type === 'gravity';
    if (!targetEmotion || triggeredPeripheralNudgeRef.current) return;
    if (sameEmotionConsumeCount < 6) return;

    triggeredPeripheralNudgeRef.current = true;
    setShowPeripheralNudge(true);
    emitPeripheralNudgeEvent('peripheral_nudge_triggered', {
      emotion: type,
      dwellVisibleSec: dwellVisibleSecRef.current,
      sameEmotionConsumeCount,
      reason: 'consume',
    });
    emitPeripheralNudgeEvent('peripheral_nudge_shown', {
      emotion: type,
    });
  }, [type, suppressPeripheralNudge, sameEmotionConsumeCount]);

  useEffect(() => {
    if (!type || suppressPeripheralNudge) return;
    const threshold = getDwellThresholdSeconds(type);
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      dwellVisibleSecRef.current += 1;

      if (dwellVisibleSecRef.current >= threshold && !triggeredPeripheralNudgeRef.current) {
        triggeredPeripheralNudgeRef.current = true;
        setShowPeripheralNudge(true);
        emitPeripheralNudgeEvent('peripheral_nudge_triggered', {
          emotion: type,
          dwellVisibleSec: dwellVisibleSecRef.current,
          sameEmotionConsumeCount,
          reason: 'dwell',
        });
        emitPeripheralNudgeEvent('peripheral_nudge_shown', {
          emotion: type,
        });
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [type, suppressPeripheralNudge, sameEmotionConsumeCount]);

  useEffect(() => {
    const onNavigateEmotion = (event: Event) => {
      const custom = event as CustomEvent<{ emotion?: string; searchQuery?: string; searchCategory?: string }>;
      const nextEmotion = String(custom?.detail?.emotion || '').trim().toLowerCase();
      const nextSearchQuery = String(custom?.detail?.searchQuery || '').trim();
      const nextSearchCategory = normalizeArticleTopic(custom?.detail?.searchCategory);
      setSelectedArticle(null);
      setShowPeripheralNudge(false);
      if (nextEmotion && nextEmotion !== type) {
        const params = new URLSearchParams();
        if (nextSearchQuery) params.set('search', nextSearchQuery);
        if (nextSearchCategory) params.set('topic', nextSearchCategory);
        const nextPath = `/emotion/${nextEmotion}${params.toString() ? `?${params.toString()}` : ''}`;
        setLocation(nextPath);
        return;
      }
      if (nextSearchQuery) {
        setSearchTerm(nextSearchQuery);
      }
      if (nextSearchCategory) {
        setTopicFilter(nextSearchCategory);
      }
    };

    window.addEventListener('huebrief:navigate-emotion', onNavigateEmotion as EventListener);
    return () => window.removeEventListener('huebrief:navigate-emotion', onNavigateEmotion as EventListener);
  }, [type, setLocation]);

  const handleRestrictedNavigation = (path: string) => {
    if (!user) {
      toast({
        title: "로그인 필요",
        description: "로그인 후 이용 가능한 기능입니다.",
        variant: "destructive",
      });
      return;
    }
    setLocation(path);
  };

  const handleEmotionCategorySelect = (emotionType: EmotionType) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setLocation(`/emotion/${emotionType}`);
  };

  const emotionConfig = EMOTION_CONFIG.find(e => e.type === type);
  const { data: topicSummaries = [], isLoading: isTopicsLoading } = useEmotionTopics(type);

  const getEmotionColor = (emotionType?: EmotionType | null) => {
    const config = EMOTION_CONFIG.find((entry) => entry.type === emotionType);
    return config?.color || emotionConfig?.color || '#898989';
  };

  const getCardDepthPalette = (_baseHex: string, depth: number, emotionType?: EmotionType | null) => {
    const paletteByEmotion: Record<EmotionType, { low: string; mid: string; base: string; deep: string }> = {
      immersion: { low: '#F7DADE', mid: '#F4A4A9', base: '#F4606B', deep: '#D94A54' },
      vibrance: { low: '#FFE7C0', mid: '#F9CE80', base: '#FFB052', deep: '#D98B34' },
      serenity: { low: '#C1EAD1', mid: '#8ECBA0', base: '#4FA86A', deep: '#3D8553' },
      clarity: { low: '#CBD8F4', mid: '#88A3EF', base: '#4275E5', deep: '#2F56B8' },
      gravity: { low: '#E0E0E0', mid: '#B5B5B5', base: '#898989', deep: '#6E6E6E' },
      spectrum: { low: '#A0E8DC', mid: '#00ABAF', base: '#A773F9', deep: '#7C4DFF' },
    };
    const safeEmotion = (emotionType && paletteByEmotion[emotionType]) ? emotionType : 'gravity';
    const tone = paletteByEmotion[safeEmotion];
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
  };

  const { data: news = [], isLoading, isFetching: isNewsFetching, error } = useNews(type, topicFilter);
  const shouldLoadSpectrumRecommendations = Boolean(selectedArticle) && type !== 'spectrum';
  const { data: spectrumNews = [] } = useNews(shouldLoadSpectrumRecommendations ? 'spectrum' : undefined, 'all');

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of news) {
      const source = (item.source || '').trim();
      if (source) set.add(source);
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [news]);

  const totalEmotionArticleCount = useMemo(() => {
    const summed = topicSummaries.reduce((acc, topic) => acc + topic.count, 0);
    return summed > 0 ? summed : news.length;
  }, [topicSummaries, news.length]);

  const emotionQuickLinks = useMemo(() => {
    return EMOTION_CONFIG.map((emotion) => {
      const copy = EMOTION_FILTER_COPY[emotion.type];
      const { h, s } = hexToHsl(emotion.color);
      const isGravity = emotion.type === 'gravity';

      return {
        ...emotion,
        copy,
        chipColor: isGravity ? '#898989' : emotion.color,
        labelColor: isGravity ? '#3A3A3A' : emotion.color,
        hintColor: isGravity ? '#787674' : undefined,
        baseBackground: isGravity
          ? 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(243,243,243,0.98) 42%, rgba(229,229,229,0.96) 100%)'
          : `linear-gradient(135deg, hsla(${h}, ${Math.max(42, s - 12)}%, 97%, 0.98) 0%, hsla(${h}, ${Math.max(48, s - 6)}%, 92%, 0.94) 100%)`,
        activeBackground: isGravity
          ? 'linear-gradient(135deg, rgba(250,250,250,0.99) 0%, rgba(229,229,229,0.98) 55%, rgba(209,209,209,0.96) 100%)'
          : `linear-gradient(135deg, hsla(${h}, ${Math.min(94, s)}%, 94%, 0.98) 0%, hsla(${h}, ${Math.min(96, s + 4)}%, 84%, 0.96) 100%)`,
      };
    });
  }, []);

  const filteredNews = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    let rows = [...news];

    if (keyword) {
      rows = rows.filter((item) => {
        const haystack = [item.title, item.summary, item.source, item.category || '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      });
    }

    if (sourceFilter !== 'all') {
      rows = rows.filter((item) => (item.source || '').trim() === sourceFilter);
    }

    rows.sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      const aIntensity = Number(a.intensity || 0);
      const bIntensity = Number(b.intensity || 0);
      const aTitle = (a.title || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();

      switch (sortKey) {
        case 'oldest':
          return aTime - bTime;
        case 'intensity_desc':
          return bIntensity - aIntensity;
        case 'intensity_asc':
          return aIntensity - bIntensity;
        case 'title_asc':
          return aTitle.localeCompare(bTitle);
        case 'latest':
        default:
          return bTime - aTime;
      }
    });

    return rows;
  }, [news, searchTerm, sourceFilter, sortKey]);

  const canLoadMore = visibleCount < filteredNews.length;
  const visibleNews = useMemo(() => {
    return filteredNews.slice(0, visibleCount);
  }, [filteredNews, visibleCount]);

  useEffect(() => {
    setVisibleCount(ARTICLES_PER_PAGE);
  }, [type, searchTerm, sourceFilter, topicFilter, sortKey]);

  useEffect(() => {
    if (!type || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (topicFilter === 'all') {
      params.delete('topic');
      params.delete('category');
    } else {
      params.set('topic', topicFilter);
      params.delete('category');
    }
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, [type, topicFilter]);

  useEffect(() => {
    if (topicFilter === 'all') return;
    if (isTopicsLoading) return;
    if (topicSummaries.some((topic) => topic.id === topicFilter)) return;
    setTopicFilter('all');
  }, [isTopicsLoading, topicFilter, topicSummaries]);

  const recommendationPool = (type === 'spectrum'
    ? news
    : [...news, ...spectrumNews.filter((item) => !news.some((current) => current.id === item.id))]
  );
  const peripheralRecommendations = type ? getPeripheralRecommendations(type) : [];

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!emotionConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800" data-testid="text-error-title">감정 카테고리를 찾을 수 없습니다</h1>
          <Button className="mt-4" data-testid="button-go-home" onClick={() => setLocation('/')}>
            홈으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const heroArticle = news[0];
  const subArticles = news.slice(1);
  const selectedEmotionSurfaceTextColor = type === 'vibrance' ? '#3A3A3A' : '#FFFFFF';

  return (
    <div
      className="min-h-screen transition-colors duration-500"
      style={{
        background: `linear-gradient(180deg, ${emotionConfig.color}08 0%, #fafafa 30%, #ffffff 100%)`,
      }}
    >
      <Header />

      <LayoutGroup id={`emotion-news-${type || 'default'}`}>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 md:pt-28 pb-10 sm:pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
          transition={{ duration: 0.6 }}
          className="mb-8 sm:mb-12"
        >
          <section className="rounded-[36px] bg-white/74 px-6 py-8 shadow-[0_24px_60px_rgba(35,34,33,0.08)] ring-1 ring-white/70 backdrop-blur-[6px] sm:px-8 md:px-10 md:py-10">
            <div className="mb-10 flex flex-col items-center">
              <span className="mb-5 inline-flex items-center rounded-full bg-white/92 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500 shadow-[0_10px_24px_rgba(35,34,33,0.06)]">
                Emotional News Flow
              </span>
              <div className="flex w-full max-w-5xl flex-wrap items-stretch justify-center gap-3">
                {emotionQuickLinks.map((emotion) => {
                  const isActive = emotion.type === type;
                  const EmotionIcon = EMOTION_ICONS[emotion.type];

                  return (
                    <button
                      key={emotion.type}
                      type="button"
                      onClick={() => handleEmotionCategorySelect(emotion.type)}
                      className="group min-w-[126px] rounded-[26px] px-4 py-4 text-left transition-all duration-200 sm:min-w-[138px]"
                      style={{
                        background: isActive
                          ? `linear-gradient(180deg, ${hexToRgba(emotion.chipColor, 0.14)} 0%, ${hexToRgba(emotion.chipColor, 0.22)} 100%)`
                          : 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,248,248,0.92) 100%)',
                        color: emotion.labelColor,
                        boxShadow: isActive
                          ? `0 14px 30px ${hexToRgba(emotion.chipColor, 0.16)}`
                          : '0 10px 24px rgba(35,34,33,0.06)',
                        border: isActive
                          ? `1px solid ${hexToRgba(emotion.chipColor, 0.24)}`
                          : '1px solid rgba(255,255,255,0.92)',
                      }}
                      data-testid={`button-emotion-quick-${emotion.type}`}
                    >
                      <span className="mb-2 inline-flex items-center gap-2">
                        <span
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: hexToRgba(emotion.chipColor, isActive ? 0.16 : 0.1),
                            boxShadow: `inset 0 0 0 1px ${hexToRgba(emotion.chipColor, isActive ? 0.14 : 0.08)}`,
                          }}
                        >
                          <EmotionIcon className="h-3 w-3" strokeWidth={2.1} style={{ color: emotion.chipColor }} />
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.01em] sm:text-[14px]">
                          <span
                            aria-hidden="true"
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: emotion.chipColor }}
                          />
                          {emotion.copy.label}
                        </span>
                      </span>
                      <p className="text-[14px] font-semibold leading-tight opacity-95 sm:text-[15px]" style={{ color: emotion.labelColor }}>
                        {emotion.copy.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mx-auto max-w-4xl text-center">
              <h1 className="mb-3 font-serif text-2xl font-bold tracking-[-0.03em] text-human-main sm:text-3xl md:text-4xl" data-testid="text-emotion-title">
                {emotionConfig.label} · {emotionConfig.labelKo}
              </h1>
              <p className="mx-auto mb-6 max-w-2xl text-xs text-human-sub sm:text-sm" data-testid="text-story-count">
                {emotionConfig.subLabel}
              </p>
              <div className="mb-8">
                <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {isTopicsLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <span
                        key={`topic-skeleton-${index}`}
                        className="h-10 min-w-[96px] animate-pulse rounded-full bg-white/75 shadow-[0_8px_20px_rgba(35,34,33,0.05)]"
                      />
                    ))
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setTopicFilter('all')}
                        className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition"
                        style={{
                          backgroundColor: topicFilter === 'all' ? emotionConfig.color : 'rgba(255,255,255,0.92)',
                          color: topicFilter === 'all' ? selectedEmotionSurfaceTextColor : '#4b5563',
                          boxShadow: '0 8px 20px rgba(35,34,33,0.06)',
                        }}
                        data-testid="topic-filter-all"
                      >
                        전체 ({totalEmotionArticleCount})
                      </button>
                      {topicSummaries.map((topic) => (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => setTopicFilter(topic.id)}
                          className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition"
                          style={{
                            backgroundColor: topicFilter === topic.id ? emotionConfig.color : 'rgba(255,255,255,0.92)',
                            color: topicFilter === topic.id ? selectedEmotionSurfaceTextColor : '#4b5563',
                            boxShadow: '0 8px 20px rgba(35,34,33,0.06)',
                          }}
                          data-testid={`topic-filter-${topic.id}`}
                        >
                          {topic.label} ({topic.count})
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-6 flex justify-center">
              <div className="relative w-full max-w-3xl">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="기사 제목, 요약, 출처를 검색해 보세요"
                  className="h-14 w-full rounded-[22px] bg-white/92 pl-11 pr-5 text-sm text-gray-800 shadow-[0_14px_30px_rgba(35,34,33,0.06)] ring-1 ring-black/4 focus:outline-none focus:ring-2 focus:ring-black/10"
                  data-testid="input-news-search-top"
                />
              </div>
            </div>

            <div className="mx-auto mb-5 max-w-5xl space-y-4 rounded-[30px] bg-white/86 p-5 shadow-[0_18px_40px_rgba(35,34,33,0.06)] ring-1 ring-white/80">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="h-14 rounded-[20px] bg-white/94 px-4 text-sm text-gray-800 shadow-[0_10px_22px_rgba(35,34,33,0.05)] focus:outline-none focus:ring-2 focus:ring-black/10"
                data-testid="select-news-source"
              >
                <option value="all">모든 출처</option>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                className="h-14 rounded-[20px] bg-white/94 px-4 text-sm text-gray-800 shadow-[0_10px_22px_rgba(35,34,33,0.05)] focus:outline-none focus:ring-2 focus:ring-black/10"
                data-testid="select-news-sort"
              >
                <option value="latest">최신순</option>
                <option value="oldest">오래된순</option>
                <option value="intensity_desc">강도 높은순</option>
                <option value="intensity_asc">강도 낮은순</option>
                <option value="title_asc">제목순</option>
              </select>
            </div>
          </div>
          <p className="pt-2 text-center text-sm font-medium text-human-sub">
            {filteredNews.length}/{topicFilter === 'all' ? totalEmotionArticleCount : news.length}개의 기사
          </p>
          </section>
        </motion.div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
            <p className="mt-4 text-human-sub" data-testid="text-loading">뉴스를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500">
            <p className="text-xl font-bold">오류 발생</p>
            <p>{(error as any).message}</p>
            <div className="mt-4 text-sm text-gray-500 p-4 bg-gray-100 rounded text-left mx-auto max-w-lg">
              <p>`.env` 설정, API 서버 상태, Supabase RLS 정책을 확인해 주세요.</p>
              <p className="mt-2 text-xs font-mono break-all text-blue-600 font-bold">
                연결 URL: {import.meta.env.VITE_SUPABASE_URL || 'UNDEFINED'}
              </p>
            </div>
          </div>
        ) : news.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-human-sub mb-4" data-testid="text-empty">해당 감정에 등록된 뉴스가 없습니다. (데이터 0건)</p>
            <p className="text-xs text-gray-400 mt-4">DB 연결은 정상이나 현재 표시할 뉴스 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="mt-6 sm:mt-8">
            {filteredNews.length === 0 ? (
              <div className="text-center py-16 rounded-3xl bg-white/60 shadow-[0_2px_12px_rgba(35,34,33,0.06)]">
                <p className="text-sm text-gray-600">현재 검색/필터 조건에 맞는 기사가 없습니다.</p>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3 bg-white/82 hover:bg-white/92"
                  onClick={() => {
                    setSearchTerm('');
                    setTopicFilter('all');
                    setSourceFilter('all');
                    setSortKey('latest');
                  }}
                >
                  필터 초기화
                </Button>
              </div>
            ) : (
            <>
            <div className="relative">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 justify-items-center gap-6 sm:gap-7 lg:gap-8 pb-8">
              {visibleNews.map((item, index) => {
                const depth = Math.max(0, Math.min(100, item.intensity ?? 50));
                const cardEmotionColor = getEmotionColor(item.emotion);
                const cardPalette = getCardDepthPalette(cardEmotionColor, depth, item.emotion);
                const cardBgColor = cardPalette.background;
                const textToken = getNewsTextTokenByDepth(depth, item.emotion);
                const isLightBg = !textToken.usesLightText;
                const textColor = textToken.usesLightText ? '#ffffff' : '#232221';
                const titleTextColor = textToken.title;
                const subTextColor = textToken.body;
                const updatedAtLabel = formatTimeAgo(item.created_at);
                const detailCategory = item.category || EMOTION_CONFIG.find((e) => e.type === item.emotion)?.labelKo || emotionConfig.labelKo;
                const cardImage = String(item.image || '').trim();
                const hasCardImage = cardImage.length > 0;
                const videoPreview = extractVideoPreviewFromMeta(item.content);
                const hasCardVideo = videoPreview.hasVideo;
                const cardVideoUrl = String(videoPreview.previewUrl || '').trim();
                const hasCardVisual = hasCardImage || (hasCardVideo && cardVideoUrl.length > 0);
                const plainContent = String(item.content || '')
                  .replace(/<!-- HUEBRIEF_META_START -->[\s\S]*?<!-- HUEBRIEF_META_END -->\s*/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                const summaryPlain = String(item.summary || '').replace(/\s+/g, ' ').trim();
                let continuationFlow = plainContent;
                if (summaryPlain && continuationFlow) {
                  const summaryLower = summaryPlain.toLowerCase();
                  const contentLower = continuationFlow.toLowerCase();
                  if (contentLower.startsWith(summaryLower)) {
                    continuationFlow = continuationFlow.slice(summaryPlain.length).trim();
                  } else {
                    const overlapIndex = contentLower.indexOf(summaryLower);
                    if (overlapIndex >= 0 && overlapIndex < 40) {
                      continuationFlow = continuationFlow.slice(overlapIndex + summaryPlain.length).trim();
                    }
                  }
                }
                const cardBodyText = [summaryPlain, continuationFlow].filter(Boolean).join(' ');
                const cardBodyPreview = buildCardExcerpt(cardBodyText, hasCardVisual ? 118 : 208);

                return (
                  <motion.article
                    key={item.id}
                    layout
                    layoutId={`news-card-${item.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
                    transition={{
                      layout: shouldReduceMotion
                        ? { duration: 0.18 }
                        : { type: 'spring', stiffness: 240, damping: 30, mass: 0.92 },
                      opacity: { duration: 0.24, delay: index * 0.06 },
                      y: { duration: 0.28, delay: index * 0.06 },
                    }}
                    whileHover={shouldReduceMotion ? undefined : { y: -3, scale: 1.005 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
                    onClick={() => openArticleDetail(item, cardBgColor)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openArticleDetail(item, cardBgColor);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${item.title} 상세 보기`}
                    className="group cursor-pointer h-[540px] w-full max-w-[342px]"
                    data-testid={`card-news-${item.id}`}
                  >
                    <div
                      className="relative h-[540px] w-full rounded-3xl overflow-hidden shadow-[0_3px_12px_rgba(35,34,33,0.1)] hover:shadow-[0_6px_16px_rgba(35,34,33,0.12)] transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-focus-visible:ring-gray-700"
                      style={{ background: cardBgColor }}
                    >
                      {hasCardImage && (
                        <div className="absolute inset-x-0 top-[340px] bottom-0 z-0">
                          <img
                            src={cardImage}
                            alt={item.title}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-black/10 to-transparent" />
                        </div>
                      )}
                      {!hasCardImage && hasCardVideo && cardVideoUrl && (
                        <div className="absolute inset-x-0 top-[340px] bottom-0 z-0">
                          <video
                            src={cardVideoUrl}
                            muted
                            playsInline
                            autoPlay
                            loop
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/20 to-black/5" />
                        </div>
                      )}

                      <div className="absolute left-5 right-5 top-5 z-10 flex items-start justify-between gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="text-xs font-semibold px-3 py-1 rounded-full max-w-[64%] truncate"
                              style={{
                                backgroundColor: isLightBg ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
                                color: textColor,
                              }}
                            >
                              {detailCategory}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="border-transparent text-white bg-gray-900">
                            {detailCategory}
                          </TooltipContent>
                        </Tooltip>
                        <span className="text-[11px] shrink-0 pt-1" style={{ color: subTextColor }}>
                          업로드 {updatedAtLabel}
                        </span>
                      </div>

                      <div className="absolute left-5 right-5 top-[66px] z-10">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{
                              backgroundColor: hexToRgba(cardEmotionColor, 0.22),
                              color: textColor,
                            }}
                          >
                            감정 깊이 {depth}
                          </span>
                          {hasCardVideo && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                              style={{
                                backgroundColor: isLightBg ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.2)',
                                color: textColor,
                              }}
                            >
                              <Video className="w-3.5 h-3.5" />
                              영상 포함
                            </span>
                          )}
                        </div>
                      </div>

                      <h3
                        className="absolute left-5 right-5 top-[104px] z-10 h-[64px] font-serif text-[20px] font-bold leading-[1.35] line-clamp-2"
                        style={{ color: titleTextColor }}
                        data-testid={`text-title-${item.id}`}
                      >
                        {item.title}
                      </h3>

                      <p
                        className={`absolute left-5 right-5 top-[184px] z-10 overflow-hidden break-words text-sm ${hasCardVisual ? 'h-[116px] leading-6' : 'h-[270px] leading-7'}`}
                        style={{
                          color: subTextColor,
                        }}
                      >
                        {cardBodyPreview}
                      </p>

                      <div
                        className="absolute right-5 top-[476px] z-20 h-10 w-10 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: hasCardVisual
                            ? 'rgba(255,255,255,0.88)'
                            : (isLightBg ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)'),
                        }}
                      >
                        <ArrowRight className="w-5 h-5" style={{ color: hasCardVisual ? '#1f2937' : textColor }} />
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
            {isNewsFetching && !isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-white/55 backdrop-blur-[1px]">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/92 px-4 py-2 text-sm font-medium text-gray-700 shadow-[0_8px_20px_rgba(35,34,33,0.08)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  기사를 불러오는 중...
                </div>
              </div>
            ) : null}
            </div>
            {filteredNews.length > ARTICLES_PER_PAGE && (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-gray-500">
                  현재 {visibleNews.length} / {filteredNews.length}개의 기사
                </p>
                {canLoadMore ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="bg-white/86 px-5 text-gray-800 shadow-[0_10px_24px_rgba(35,34,33,0.08)] hover:bg-white"
                    onClick={() => setVisibleCount((prev) => Math.min(filteredNews.length, prev + ARTICLES_PER_PAGE))}
                  >
                    기사 {Math.min(ARTICLES_PER_PAGE, filteredNews.length - visibleCount)}개 더보기
                  </Button>
                ) : (
                  <span className="text-xs font-medium text-gray-400">모든 기사를 확인했습니다.</span>
                )}
              </div>
            )}
            </>
            )}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: mounted ? 1 : 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16 sm:mt-20 pt-12 sm:pt-14"
        >
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-base md:text-lg text-human-sub mb-8 text-center font-medium" data-testid="text-explore-other">
              Explore another emotion category
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 md:gap-5 justify-items-center">
            {EMOTION_CONFIG.filter(e => e.type !== type).map((emotion) => {
              const EmotionIcon = EMOTION_ICONS[emotion.type];
              return (
                <button
                  key={emotion.type}
                  type="button"
                  onClick={() => handleEmotionCategorySelect(emotion.type)}
                  className="w-full max-w-[144px] h-[112px] sm:h-[122px] rounded-2xl p-4 sm:p-4 flex flex-col justify-between text-left transition-colors shadow-[0_2px_10px_rgba(35,34,33,0.08)]"
                  style={{
                    backgroundColor: `${emotion.color}1d`,
                    color: emotion.color,
                  }}
                  data-testid={`button-emotion-${emotion.type}`}
                >
                  <span className="inline-flex w-9 h-9 rounded-xl items-center justify-center mb-3" style={{ backgroundColor: `${emotion.color}1f` }}>
                    <EmotionIcon className="w-5 h-5" />
                  </span>
                  <p className="text-sm font-semibold leading-tight">{emotion.labelKo}</p>
                  <p className="text-[10px] opacity-80 mt-1 leading-tight line-clamp-1">{emotion.label}</p>
                </button>
              );
            })}
            </div>
          </div>
        </motion.div>
      </main>

        <Suspense fallback={null}>
          <NewsDetailModal
            article={selectedArticle}
            emotionType={selectedArticle?.emotion || type || 'serenity'}
            cardBackground={selectedCardBg}
            layoutId={selectedArticle ? `news-card-${selectedArticle.id}` : undefined}
            relatedArticles={recommendationPool}
            onSelectArticle={(nextArticle) => {
              const depth = Math.max(0, Math.min(100, nextArticle.intensity ?? 50));
              const cardEmotionColor = getEmotionColor(nextArticle.emotion);
              const cardPalette = getCardDepthPalette(cardEmotionColor, depth, nextArticle.emotion);
              setSelectedCardBg(cardPalette.background);

              if (nextArticle.emotion !== type) {
                crossCategorySelectionRef.current = nextArticle;
                setLocation(`/emotion/${nextArticle.emotion}`);
              }

              setSelectedArticle(nextArticle);
            }}
            onClose={() => {
              crossCategorySelectionRef.current = null;
              setSelectedArticle(null);
            }}
            onConsumeEvidence={handleArticleConsumeEvidence}
          />
        </Suspense>
      </LayoutGroup>
      {mounted && typeof document !== 'undefined' && type && showPeripheralNudge && !suppressPeripheralNudge ? (
        createPortal(
        <>
          <div
            className="fixed inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: PERIPHERAL_NUDGE_Z_INDEX + 2 }}
          >
            {peripheralRecommendations.map((emotion, index) => {
              const config = EMOTION_CONFIG.find((entry) => entry.type === emotion);
              const color = config?.color || '#00ABAF';
              const side: 'left' | 'right' = emotion === 'spectrum' ? 'right' : 'left';
              const seed = index;
              const driftClass =
                seed % 3 === 0
                  ? 'peripheral-bubble-drift-a'
                  : seed % 3 === 1
                    ? 'peripheral-bubble-drift-b'
                    : 'peripheral-bubble-drift-c';
              const baseStyle: CSSProperties = {
                bottom: `${(viewportWidth <= 767 ? -136 : viewportWidth >= 1920 ? -188 : -160) - (seed % 3) * 26}px`,
                animationDelay: `${seed * 460}ms`,
                animationDuration: `${13600 + (seed % 3) * 1000}ms`,
              };
              const laneOffset = index % 2 === 0 ? 0 : 1;
              const edgeInset = viewportWidth <= 767
                ? 8 + laneOffset * 8
                : viewportWidth <= 1279
                  ? 16 + laneOffset * 10
                  : viewportWidth >= 1920
                    ? 44 + laneOffset * 12
                    : 24 + laneOffset * 10;
              const sideStyle: CSSProperties = side === 'right'
                ? { right: `${edgeInset}px` }
                : { left: `${edgeInset}px` };
              const bubbleStyle: CSSProperties = { ...baseStyle, ...sideStyle };

              return (
                <div
                  key={`peripheral-sphere-${emotion}-${side}`}
                  className={`absolute pointer-events-auto ${shouldReduceMotion ? '' : 'peripheral-bubble-rise'}`}
                  style={bubbleStyle}
                >
                  <button
                    type="button"
                    title={`${emotion.toUpperCase()} 카테고리로 이동`}
                    aria-label={`${emotion} 카테고리로 이동`}
                    className={`relative h-16 w-16 rounded-full inline-flex items-center justify-center transition-transform hover:scale-[1.06] ${shouldReduceMotion ? '' : `peripheral-bubble-orb ${driftClass}`}`}
                    style={{
                      opacity: 0.8,
                      background: `radial-gradient(circle at 28% 22%, rgba(255,255,255,0.98) 0%, ${color} 36%, ${color} 78%, rgba(8,12,18,0.06) 100%)`,
                      boxShadow: `0 20px 36px ${color}66, inset 0 -10px 18px rgba(0,0,0,0.10), inset 0 8px 18px rgba(255,255,255,0.26)`,
                    }}
                    onClick={() => {
                      emitPeripheralNudgeEvent('peripheral_nudge_click', { from: type, to: emotion, source: 'edge_sphere' });
                      handleEmotionCategorySelect(emotion);
                    }}
                  >
                    <span className="absolute left-[10px] top-[9px] h-5 w-8 rounded-full bg-white/58 blur-[1.2px]" aria-hidden="true" />
                    <span className="absolute right-[10px] bottom-[11px] h-4 w-4 rounded-full bg-black/8 blur-[2px]" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          <div
            className="fixed rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-[0_8px_24px_rgba(35,34,33,0.14)] p-3 w-[min(320px,calc(100vw-150px))]"
            style={{
              zIndex: PERIPHERAL_NUDGE_Z_INDEX,
              bottom: '1.5rem',
              right: 'calc(1.5rem + 56px + 30px)',
            }}
          >
            <p className="text-sm font-semibold text-gray-900">다른 색을 추천해 드릴까요?</p>
            <p className="text-xs text-gray-600 mt-1">
              같은 감정 뉴스를 오래 읽고 있어요. 다른 관점도 함께 보면 균형에 도움이 됩니다.
            </p>
            {expandPeripheralNudge ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {peripheralRecommendations.map((emotion) => (
                  <button
                    key={`peripheral-nudge-${emotion}`}
                    type="button"
                    className="h-7 px-2.5 rounded-full text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200"
                    onClick={() => {
                      emitPeripheralNudgeEvent('peripheral_nudge_click', { from: type, to: emotion });
                      handleEmotionCategorySelect(emotion);
                    }}
                  >
                    {emotion.toUpperCase()}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex items-center gap-2 justify-end">
              <button
                type="button"
                className="h-8 px-2.5 rounded-md text-xs bg-slate-100 text-slate-700 hover:bg-slate-200"
                onClick={() => {
                  setSuppressPeripheralNudge(true);
                  setShowPeripheralNudge(false);
                  emitPeripheralNudgeEvent('peripheral_nudge_suppressed', { emotion: type });
                }}
              >
                오늘은 숨기기
              </button>
              <button
                type="button"
                className="h-8 px-2.5 rounded-md text-xs bg-[#00ABAF] text-white hover:bg-[#01979A]"
                onClick={() => {
                  setExpandPeripheralNudge(false);
                  setShowPeripheralNudge(false);
                  emitPeripheralNudgeEvent('peripheral_nudge_click', {
                    emotion: type,
                    action: 'open_huebot',
                  });
                  emitPeripheralNudgeEvent('huebot_nudge_opened', {
                    fromEmotion: type,
                    recommendations: peripheralRecommendations,
                  });
                }}
              >
                다른 색 보러가기
              </button>
            </div>
          </div>
        </>,
        document.body,
        )
      ) : null}
    </div>
  );
}








