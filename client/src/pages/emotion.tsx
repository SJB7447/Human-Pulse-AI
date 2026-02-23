import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Clock, Heart, AlertCircle, CloudRain, Shield, Sparkles, Loader2, ArrowRight, User, Home, BookOpen, Users, HelpCircle, Search } from 'lucide-react';
import { EMOTION_CONFIG, EmotionType, useEmotionStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { NewsDetailModal } from '@/components/NewsDetailModal';
import { useNews, type NewsItem } from '@/hooks/useNews';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { EmotionTag } from '@/components/ui/EmotionTag';

const EMOTION_ICONS: Record<EmotionType, typeof Heart> = {
  vibrance: Sparkles,
  immersion: AlertCircle,
  clarity: CloudRain,
  gravity: Shield,
  serenity: Heart,
  spectrum: HelpCircle,
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

import { AIServiceError, GeminiService } from '@/services/gemini';
import { useQueryClient } from '@tanstack/react-query';

// ... (existing imports)

const ARTICLE_META_OPEN = '<!-- HUEBRIEF_META_START -->';
const ARTICLE_META_CLOSE = '<!-- HUEBRIEF_META_END -->';

export default function EmotionPage() {
  const { type } = useParams<{ type: EmotionType }>();
  const [mounted, setMounted] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useEmotionStore();
  const { toast } = useToast();
  const [selectedCardBg, setSelectedCardBg] = useState<string>('rgba(255,255,255,0.96)');
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortKey, setSortKey] = useState<'latest' | 'oldest' | 'intensity_desc' | 'intensity_asc' | 'title_asc'>('latest');
  const [visibleCount, setVisibleCount] = useState(9);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const openArticleDetail = (item: NewsItem, cardBgColor: string) => {
    setSelectedCardBg(cardBgColor);
    setSelectedArticle(item);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [type]);

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

  const handleGenerateNewsWithAuth = async () => {
    if (!user) {
      toast({
        title: "로그인 필요",
        description: "AI 뉴스 생성은 로그인 후 이용 가능합니다.",
        variant: "destructive",
      });
      return;
    }
    if (user.role !== 'journalist' && user.role !== 'admin') {
      toast({
        title: "권한 필요",
        description: "기자 또는 관리자만 AI 뉴스를 생성할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    await handleGenerateNews();
  };

  const emotionConfig = EMOTION_CONFIG.find(e => e.type === type);
  const Icon = type ? EMOTION_ICONS[type] : Heart;
  const canGenerateAiNews = user?.role === 'journalist' || user?.role === 'admin';

  const getEmotionColor = (emotionType?: EmotionType | null) => {
    const config = EMOTION_CONFIG.find((entry) => entry.type === emotionType);
    return config?.color || emotionConfig?.color || '#999898';
  };

  const getDepthTone = (depth: number) => {
    if (depth >= 76) return { start: 0.42, end: 0.30, edge: 0.42 };
    if (depth >= 51) return { start: 0.33, end: 0.22, edge: 0.35 };
    if (depth >= 26) return { start: 0.24, end: 0.16, edge: 0.28 };
    return { start: 0.16, end: 0.10, edge: 0.22 };
  };

  const getCardDepthPalette = (_baseHex: string, depth: number, emotionType?: EmotionType | null) => {
    const paletteByEmotion: Record<EmotionType, { low: string; mid: string; base: string; deep: string }> = {
      immersion: { low: '#ffc7ce', mid: '#ff97a9', base: '#f4606b', deep: '#d94a54' },
      vibrance: { low: '#ffedc5', mid: '#ffe197', base: '#ffd150', deep: '#e6b83f' },
      serenity: { low: '#caf2a7', mid: '#adef73', base: '#88d84a', deep: '#66b53a' },
      clarity: { low: '#cad8ff', mid: '#8dabff', base: '#3f65ef', deep: '#2a4bc0' },
      gravity: { low: '#e5e5e5', mid: '#d1d1d1', base: '#adadad', deep: '#999898' },
      spectrum: { low: '#a0e8dc', mid: '#00abaf', base: '#a773f9', deep: '#7c4dff' },
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

  const { data: news = [], isLoading, error } = useNews(type);
  const { data: spectrumNews = [] } = useNews('spectrum');

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of news) {
      const source = (item.source || '').trim();
      if (source) set.add(source);
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [news]);

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

  const hasMore = visibleCount < filteredNews.length;
  const visibleNews = useMemo(() => filteredNews.slice(0, visibleCount), [filteredNews, visibleCount]);

  useEffect(() => {
    setVisibleCount(9);
  }, [type, searchTerm, sourceFilter, sortKey]);

  useEffect(() => {
    if (!hasMore) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (!first?.isIntersecting) return;
      setIsLoadingMore(true);
      window.setTimeout(() => {
        setVisibleCount((prev) => Math.min(prev + 9, filteredNews.length));
        setIsLoadingMore(false);
      }, 120);
    }, { rootMargin: '180px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredNews.length, hasMore]);

  const recommendationPool = (type === 'spectrum'
    ? news
    : [...news, ...spectrumNews.filter((item) => !news.some((current) => current.id === item.id))]
  );

  const handleGenerateNews = async () => {
    if (!type) return;

    if (!user) {
      toast({
        title: "로그인 필요",
        description: "AI 뉴스 생성은 로그인 후 이용 가능합니다.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      console.log("Generating news for:", type);
      const generatedItems = await GeminiService.generateNewsForEmotion(type);
      console.log("Generated Items:", generatedItems);

      const saveEligibleItems = generatedItems.filter((item) => {
        if (item.fallbackUsed) return false;
        const citations = Array.isArray(item.sourceCitation) ? item.sourceCitation : [];
        return citations.some((citation) => /^https?:\/\//i.test(String(citation.url || '').trim()));
      });
      const fallbackItems = generatedItems.filter((item) => item.fallbackUsed);

      if (saveEligibleItems.length === 0) {
        const reason = fallbackItems[0]?.reasonCode || 'AI_NEWS_FALLBACK';
        const reasonMessageMap: Record<string, string> = {
          AI_NEWS_KEY_MISSING: '서버 Gemini API 키가 설정되지 않았습니다. .env의 GEMINI_API_KEY를 확인하세요.',
          AI_NEWS_MODEL_TIMEOUT: 'Gemini 응답 시간이 초과되었습니다. 잠시 후 다시 시도하거나 timeout 설정을 늘려주세요.',
          AI_NEWS_MODEL_ERROR: 'Gemini 호출 오류가 발생했습니다. 모델명/키 권한 상태를 점검하세요.',
          AI_NEWS_MODEL_EMPTY: 'Gemini 응답이 비어 있어 생성하지 못했습니다.',
        };
        toast({
          title: "실시간 기사 생성 실패",
          description: `${reasonMessageMap[reason] || '생성 결과가 fallback 상태라 저장하지 않았습니다.'} (${reason})`,
          variant: "destructive",
        });
        return;
      }

      // Save through server API to avoid client-side Supabase RLS insert failure.
      const saveResults = await Promise.all(
        saveEligibleItems.map(async (item) => {
          const citations = (Array.isArray(item.sourceCitation) ? item.sourceCitation : [])
            .filter((citation) => /^https?:\/\//i.test(String(citation.url || '').trim()))
            .slice(0, 3);
          const articleMeta = {
            aiGenerated: true,
            verified: true,
            emotion: type,
            sourceCitation: citations,
            savedAt: new Date().toISOString(),
          };
          const contentWithMeta = `${item.content}\n\n${ARTICLE_META_OPEN}\n${JSON.stringify(articleMeta, null, 2)}\n${ARTICLE_META_CLOSE}`;
          const response = await fetch('/api/articles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: item.title,
              summary: item.summary,
              content: contentWithMeta,
              source: citations[0]?.source || item.source,
              emotion: type,
              image: null,
              category: 'AI Generated (Verified)',
              intensity: 50,
            }),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Failed to save article (${response.status})`);
          }

          return response.json();
        })
      );

      if (!saveResults.length) {
        throw new Error("No generated articles were saved.");
      }

      await queryClient.invalidateQueries({ queryKey: ['news', type] });
      if (fallbackItems.length > 0) {
        toast({
          title: "부분 생성 완료",
          description: `정상 생성 ${saveEligibleItems.length}건 저장, fallback ${fallbackItems.length}건은 저장하지 않았습니다.`,
        });
      } else {
        toast({
          title: "생성 완료",
          description: `AI 뉴스 ${saveEligibleItems.length}건을 생성해 목록에 반영했습니다.`,
        });
      }

    } catch (e) {
      console.error("News Generation Failed:", e);
      const aiError = e as AIServiceError;
      const rawMessage = e instanceof Error ? e.message : "Unknown error";
      const looksLikeHtmlResponse = rawMessage.includes('non-JSON response') || rawMessage.includes('<!doctype') || rawMessage.includes('<html');
      const isAuthError = aiError.status === 401 || aiError.status === 403;

      if (isAuthError || (!user && looksLikeHtmlResponse)) {
        toast({
          title: "로그인 필요",
          description: "AI 뉴스 생성은 로그인 후 이용 가능합니다.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "뉴스 생성 실패",
          description: rawMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!emotionConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800" data-testid="text-error-title">감정 카테고리를 찾을 수 없습니다</h1>
          <Link href="/">
            <Button className="mt-4" data-testid="button-go-home">
              홈으로 돌아가기
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const heroArticle = news[0];
  const subArticles = news.slice(1);

  return (
    <div
      className="min-h-screen transition-colors duration-500"
      style={{
        background: `linear-gradient(180deg, ${emotionConfig.color}08 0%, #fafafa 30%, #ffffff 100%)`,
      }}
    >
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 md:pt-28 pb-10 sm:pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
          transition={{ duration: 0.6 }}
          className="mb-8 sm:mb-12"
        >
          <div className="flex items-center gap-3 mb-2">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
                뒤로
              </Button>
            </Link>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-human-main mb-2" data-testid="text-emotion-title">
            {emotionConfig.label}
          </h1>
          <p className="text-lg sm:text-xl text-human-main/80 font-medium mb-2">
            {emotionConfig.labelKo}
          </p>
          <p className="text-human-sub text-base sm:text-lg mb-4" data-testid="text-story-count">
            {emotionConfig.subLabel}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {emotionConfig.recommendedNews.map((news, idx) => (
              <span
                key={idx}
                className="px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm leading-tight"
                style={{
                  backgroundColor: `${emotionConfig.color}24`,
                  color: emotionConfig.color,
                }}
              >
                {news}
              </span>
            ))}
          </div>
          <p className="text-human-sub text-sm">
            {filteredNews.length}/{news.length} articles
          </p>
          {canGenerateAiNews && (
            <div className="mt-4">
              <Button
                onClick={handleGenerateNewsWithAuth}
                disabled={isGenerating}
                className="w-full sm:w-auto border-0 bg-gradient-to-r from-[#a773f9] to-[#8b5cf6] hover:from-[#9564ed] hover:to-[#7c4deb] text-white transition-all duration-200"
                size="sm"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-white" />
                    AI 생성 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 text-white" />
                    AI 뉴스 생성 (Gemini)
                  </>
                )}
              </Button>
            </div>
          )}
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
            {canGenerateAiNews && (
              <Button
                onClick={handleGenerateNewsWithAuth}
                disabled={isGenerating}
                className="border-0 bg-gradient-to-r from-[#a773f9] to-[#8b5cf6] hover:from-[#9564ed] hover:to-[#7c4deb] text-white shadow-sm transform hover:scale-105 transition-all duration-200"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-white" />
                    AI 생성 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 text-white" />
                    AI 뉴스 생성 (Gemini)
                  </>
                )}
              </Button>
            )}
            <p className="text-xs text-gray-400 mt-4">DB 연결은 정상이나 현재 표시할 뉴스 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="mt-6 sm:mt-8">
            <div className="mb-8 rounded-3xl bg-white/62 p-4 sm:p-6 shadow-[0_2px_12px_rgba(35,34,33,0.06)]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search title, summary, source"
                    className="w-full h-11 rounded-xl bg-white/88 pl-9 pr-3 text-sm text-gray-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)] focus:outline-none focus:ring-2 focus:ring-black/15"
                    data-testid="input-news-search"
                  />
                </div>

                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="h-11 rounded-xl bg-white/88 px-3 text-sm text-gray-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)] focus:outline-none focus:ring-2 focus:ring-black/15"
                  data-testid="select-news-source"
                >
                  <option value="all">All sources</option>
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>

                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                  className="h-11 rounded-xl bg-white/88 px-3 text-sm text-gray-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)] focus:outline-none focus:ring-2 focus:ring-black/15"
                  data-testid="select-news-sort"
                >
                  <option value="latest">Sort: Latest</option>
                  <option value="oldest">Sort: Oldest</option>
                  <option value="intensity_desc">Sort: Intensity high</option>
                  <option value="intensity_asc">Sort: Intensity low</option>
                  <option value="title_asc">Sort: Title A-Z</option>
                </select>
              </div>
            </div>

            {filteredNews.length === 0 ? (
              <div className="text-center py-16 rounded-3xl bg-white/60 shadow-[0_2px_12px_rgba(35,34,33,0.06)]">
                <p className="text-sm text-gray-600">No articles match current search/filter options.</p>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3 bg-white/82 hover:bg-white/92"
                  onClick={() => {
                    setSearchTerm('');
                    setSourceFilter('all');
                    setSortKey('latest');
                  }}
                >
                  Reset filters
                </Button>
              </div>
            ) : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-7 lg:gap-8 pb-8">
              {visibleNews.map((item, index) => {
                const depth = Math.max(0, Math.min(100, item.intensity ?? 50));
                const cardEmotionColor = getEmotionColor(item.emotion);
                const depthTone = getDepthTone(depth);
                const cardPalette = getCardDepthPalette(cardEmotionColor, depth, item.emotion);
                const cardBgColor = cardPalette.background;
                const isLowDepthBg = depth <= 50;
                const isLightBg = depth <= 60;
                const textColor = isLightBg ? '#232221' : '#ffffff';
                const titleTextColor = '#232221';
                const subTextColor = isLowDepthBg
                  ? '#5f5d5c'
                  : (isLightBg ? '#787674' : 'rgba(255,255,255,0.84)');
                const updatedAtLabel = formatTimeAgo(item.created_at);
                const detailCategory = item.category || EMOTION_CONFIG.find((e) => e.type === item.emotion)?.labelKo || emotionConfig.labelKo;
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

                return (
                  <motion.article
                    key={item.id}
                    layoutId={`news-card-${item.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
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
                    className="w-full group cursor-pointer min-w-0 h-full"
                    data-testid={`card-news-${item.id}`}
                  >
                    <div
                      className="h-[520px] sm:h-[540px] rounded-3xl overflow-hidden shadow-[0_3px_12px_rgba(35,34,33,0.1)] hover:shadow-[0_6px_16px_rgba(35,34,33,0.12)] transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-focus-visible:ring-gray-700 flex flex-col"
                      style={{ background: cardBgColor }}
                    >
                      {/* Header with category and update time */}
                      <div className="p-4 sm:p-5 pb-0">
                        <div className="flex items-start justify-between gap-2 mb-4">
                          <span
                            className="text-xs font-semibold px-3 py-1 rounded-full max-w-[65%] truncate"
                            style={{
                              backgroundColor: isLightBg ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
                              color: textColor,
                            }}
                          >
                            {detailCategory}
                          </span>
                          <span className="text-[11px] sm:text-xs shrink-0 pt-1" style={{ color: subTextColor }}>
                            업데이트 {updatedAtLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mb-3 sm:mb-4">
                          <span
                            className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{
                              backgroundColor: hexToRgba(cardEmotionColor, depthTone.edge),
                              color: textColor,
                            }}
                          >
                            감정 깊이 {depth}
                          </span>
                        </div>

                        {/* Title */}
                        <h3
                          className="font-serif text-xl sm:text-2xl font-bold leading-tight mb-3 sm:mb-4 line-clamp-3"
                          style={{ color: titleTextColor }}
                          data-testid={`text-title-${item.id}`}
                        >
                          {item.title}
                        </h3>

                        <p
                          className="text-sm leading-7 mb-4 sm:mb-5 h-[15.5rem] sm:h-[16rem]"
                          style={{
                            color: subTextColor,
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 8,
                            overflow: 'hidden',
                          }}
                        >
                          {cardBodyText}
                        </p>
                      </div>
                      <div className="flex-1" />
                      {/* Audio/Read indicator */}
                      <div className="px-4 sm:px-5 pb-5 sm:pb-6">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center ml-auto"
                          style={{
                            backgroundColor: isLightBg ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
                          }}
                        >
                          <ArrowRight className="w-5 h-5" style={{ color: textColor }} />
                        </div>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
            {hasMore && (
              <div ref={loadMoreRef} className="py-4 text-center">
                {isLoadingMore ? (
                  <span className="text-xs text-gray-500 inline-flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading more...
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Scroll for more</span>
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
            setLocation(`/emotion/${nextArticle.emotion}`);
          }

          setSelectedArticle(nextArticle);
        }}
        onClose={() => setSelectedArticle(null)}
      />
    </div>
  );
}






