import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Bookmark, Share2, Sparkles, Loader2, Clock, Lightbulb, Check, RefreshCcw, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { type NewsItem } from '@/hooks/useNews';
import { EMOTION_CONFIG, EmotionType, useEmotionStore } from '@/lib/store';
import { AIServiceError, GeminiService } from '@/services/gemini';
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

interface CuratedArticle {
  id: number;
  originalArticle: NewsItem;
  userComment: string;
  userEmotion: EmotionType;
  createdAt: string;
}

interface NewsDetailModalProps {
  article: NewsItem | null;
  emotionType: EmotionType;
  onClose: () => void;
  onSaveCuration?: (curation: CuratedArticle) => void;
  cardBackground?: string;
  layoutId?: string;
  relatedArticles?: NewsItem[];
  onSelectArticle?: (article: NewsItem) => void;
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

export function NewsDetailModal({ article, emotionType, onClose, onSaveCuration, cardBackground, layoutId, relatedArticles = [], onSelectArticle }: NewsDetailModalProps) {
  const { toast } = useToast();
  const { user } = useEmotionStore();
  const [isTransforming, setIsTransforming] = useState(false);
  const [showInsightEditor, setShowInsightEditor] = useState(false);
  const [insightText, setInsightText] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>(emotionType);
  const [interactiveArticle, setInteractiveArticle] = useState<InteractiveArticle | null>(null);
  const [interactiveError, setInteractiveError] = useState<{ message: string; retryAfterSeconds?: number } | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiActionError, setAiActionError] = useState<string | null>(null);
  const [bgTransitionProgress, setBgTransitionProgress] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const recommendationSectionRef = useRef<HTMLDivElement | null>(null);
  const dialogPanelRef = useRef<HTMLDivElement | null>(null);
  const insightPanelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const insightCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const MAX_INSIGHT_LENGTH = 300;
  const shouldReduceMotion = useReducedMotion();
  const isAiBusy = isTransforming || isSummarizing;

  const emotionConfig = EMOTION_CONFIG.find(e => e.type === emotionType);
  const articleEmotionConfig = EMOTION_CONFIG.find((entry) => entry.type === article?.emotion) || emotionConfig;
  const color = articleEmotionConfig?.color || '#999898';

  useEffect(() => {
    setInteractiveArticle(null);
    setInteractiveError(null);
    setAiSummary(null);
    setAiActionError(null);
    setBgTransitionProgress(0);
  }, [article?.id]);

  useEffect(() => {
    setSelectedEmotion(emotionType);
  }, [emotionType]);

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
    const focusTarget = showInsightEditor ? insightCloseButtonRef.current : closeButtonRef.current;
    focusTarget?.focus();
  }, [article, showInsightEditor]);

  useEffect(() => {
    if (!article) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (showInsightEditor) {
          setShowInsightEditor(false);
        } else {
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const activeContainer = (showInsightEditor ? insightPanelRef.current : dialogPanelRef.current) as HTMLElement | null;
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
  }, [article, onClose, showInsightEditor]);

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

  const handleContentScroll = () => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const maxScroll = Math.max(node.scrollHeight - node.clientHeight, 1);
    const progress = Math.max(0, Math.min(1, node.scrollTop / maxScroll));
    setBgTransitionProgress(progress);
  };

  const handleSave = () => {
    toast({
      title: "저장 완료",
      description: "보관함에 저장되었습니다.",
    });
  };

  const handleShare = async () => {
    if (navigator.share && article) {
      try {
        await navigator.share({
          title: article.title,
          text: article.summary,
        });
        toast({
          title: "공유 완료",
          description: "기사가 공유되었습니다.",
        });
      } catch {
        toast({
          title: "공유하기",
          description: "링크가 복사되었습니다.",
        });
      }
    } else {
      toast({
        title: "공유하기",
        description: "링크가 복사되었습니다.",
      });
    }
  };

  const handleMyArticle = async () => {
    if (!article) return;
    if (isAiBusy && !isTransforming) {
      toast({ title: "AI 작업 진행 중", description: "현재 작업 완료 후 다시 시도해주세요." });
      return;
    }
    setInteractiveError(null);
    setAiActionError(null);
    setIsTransforming(true);
    try {
      const keywords = [article.title, article.summary, article.category || article.emotion || 'interactive']
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

      const generated = await GeminiService.generateInteractiveArticle({
        keywords,
        tone: 'analytical',
        targetAudience: 'digital news readers',
        platform: 'web',
        interactionIntensity: 'medium',
        language: 'ko-KR',
        constraints: {
          minBlocks: 5,
          maxCharsPerBlock: 280,
        },
      });
      setInteractiveArticle(generated);
      toast({
        title: "인터랙티브 기사 생성 완료",
        description: "스토리 블록 기반 렌더링으로 전환되었습니다.",
      });
    } catch (e: any) {
      const aiError = e as AIServiceError;
      const isOverloaded = aiError.retryable || aiError.status === 503 || aiError.status === 504;
      const retryAfterSeconds = aiError.retryAfterSeconds;
      const friendlyMessage = isOverloaded
        ? `AI 요청이 지연되고 있습니다.${typeof retryAfterSeconds === 'number' ? ` 약 ${retryAfterSeconds}초 후` : ' 잠시 후'} 다시 시도해 주세요.`
        : (aiError.message || "인터랙티브 기사 생성 중 오류가 발생했습니다.");

      setInteractiveError({
        message: friendlyMessage,
        retryAfterSeconds,
      });

      toast({
        title: "생성 실패",
        description: friendlyMessage,
        variant: "destructive",
      });
    } finally {
      setIsTransforming(false);
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
  const handleSaveInsight = () => {
    if (!article || !insightText.trim()) {
      toast({
        title: "입력 필요",
        description: "인사이트 내용을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const curation: CuratedArticle = {
      id: Date.now(),
      originalArticle: article,
      userComment: insightText.trim(),
      userEmotion: selectedEmotion,
      createdAt: new Date().toISOString(),
    };

    if (onSaveCuration) {
      onSaveCuration(curation);
    }

    toast({
      title: "인사이트 저장 완료",
      description: "마이페이지에서 확인할 수 있습니다.",
    });

    setShowInsightEditor(false);
    setInsightText('');
    setSelectedEmotion(emotionType);
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

  const emotionTintAlpha = 0.12 + bgTransitionProgress * 0.16;
  const neutralTintAlpha = 0.74 + bgTransitionProgress * 0.2;
  const settleTintAlpha = 0.9 + bgTransitionProgress * 0.08;
  const backdropBackground = shouldReduceMotion
    ? `radial-gradient(circle at 30% 20%, ${color}26 0%, rgba(255,255,255,0.78) 35%, rgba(255,255,255,0.94) 100%)`
    : `radial-gradient(circle at ${30 + bgTransitionProgress * 18}% ${20 + bgTransitionProgress * 26}%, ${color}${Math.round(emotionTintAlpha * 255).toString(16).padStart(2, '0')} 0%, rgba(255,255,255,${neutralTintAlpha.toFixed(2)}) 35%, rgba(255,255,255,${settleTintAlpha.toFixed(2)}) 100%)`;

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

  const glowCore = `0 0 20px ${color}60`;
  const glowMid = `0 0 60px ${color}30`;
  const glowAmbient = `0 0 120px ${color}10`;
  const fullGlow = `${glowCore}, ${glowMid}, ${glowAmbient}`;
  const currentEmotionMeta = article?.emotion ? getEmotionMeta(article.emotion) : null;
  const isBackdropDark = isDarkHexColor(color);
  const readingProgress = Math.round(bgTransitionProgress * 100);

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
              background: backdropBackground,
              transition: 'background 260ms ease-out',
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
            className="relative w-full h-[100dvh] flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="news-detail-title"
            aria-describedby="news-detail-content"
            style={{
              background: cardBackground || `linear-gradient(180deg, ${color}20 0%, rgba(250,250,252,0.98) 35%, rgba(248,248,250,0.98) 100%)`,
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
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
              className="flex-1 overflow-y-auto px-5 sm:px-7 md:px-10 pb-20 sm:pb-20 md:pb-20 pt-10 z-10"
            >
              <div className="max-w-4xl w-full mx-auto bg-white/72 rounded-[28px] px-5 sm:px-6 md:px-8 py-5 md:py-7">
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

                <div className="max-w-3xl mx-auto">
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

                  <div id="news-detail-content" className="text-gray-900 text-[17px] md:text-[18px] leading-8 md:leading-9 font-normal mb-12 min-h-[120px] whitespace-pre-wrap tracking-wide">
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
                    {proseBlocks.map((paragraph, idx) => {
                      const sourceLike = isSourceLikeParagraph(paragraph);
                      return (
                      <motion.p
                        key={`${article.id}-${idx}`}
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                        whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.7, margin: '-8% 0px -8% 0px' }}
                        transition={{ duration: shouldReduceMotion ? 0.1 : 0.28, ease: 'easeOut', delay: shouldReduceMotion ? 0 : Math.min(idx * 0.04, 0.18) }}
                        className={sourceLike ? 'text-left text-[10px] md:text-xs leading-5 md:leading-6 opacity-50 break-all' : 'text-left opacity-95 leading-8 md:leading-9'}
                      >
                        {paragraph}
                      </motion.p>
                    )})}
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
                            toast({ title: "로그인 필요", description: "AI 변환은 로그인 후 이용 가능합니다.", variant: "destructive" });
                            return;
                          }
                          handleMyArticle();
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
                            변환 중...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            AI 변환
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* Insight Editor Overlay */}
            <AnimatePresence>
              {showInsightEditor && (
                <motion.div
                  ref={insightPanelRef}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute inset-0 z-20 flex flex-col rounded-2xl overflow-visible"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Insight editor"
                  style={{
                    backgroundColor: 'rgba(20, 20, 25, 0.95)',
                    backdropFilter: 'blur(24px)',
                  }}
                >
                  <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Lightbulb className="w-5 h-5" style={{ color }} />
                      인사이트 추가
                    </h3>
                    <Button
                      ref={insightCloseButtonRef}
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowInsightEditor(false)}
                      className="bg-white/10 text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                      aria-label="Close insight editor"
                      data-testid="button-close-insight"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex-1 p-4 overflow-y-auto">
                    {/* Original Article Context */}
                    <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                      <p className="text-xs text-white/50 mb-1">원문 기사</p>
                      <p className="text-sm text-white/80 font-medium line-clamp-2">{article?.title}</p>
                    </div>

                    {/* User Input */}
                    <div className="mb-4">
                      <label className="block text-sm text-white/70 mb-2">
                        나의 시선 ({insightText.length}/{MAX_INSIGHT_LENGTH})
                      </label>
                      <textarea
                        value={insightText}
                        onChange={(e) => setInsightText(e.target.value.slice(0, MAX_INSIGHT_LENGTH))}
                        placeholder="이 기사에 대한 당신의 생각, 감정, 요약을 적어주세요..."
                        rows={5}
                        className="w-full px-4 py-3 rounded-lg border border-white/20 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
                        data-testid="textarea-insight"
                      />
                    </div>

                    {/* Emotion Selection */}
                    <div>
                      <label className="block text-sm text-white/70 mb-2">
                        나의 해석 감정
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {EMOTION_CONFIG.map((emotion) => (
                          <button
                            key={emotion.type}
                            type="button"
                            onClick={() => setSelectedEmotion(emotion.type)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${selectedEmotion === emotion.type
                              ? 'ring-2 ring-offset-2 ring-offset-gray-900 opacity-100'
                              : 'opacity-70'
                              }`}
                            style={{
                              backgroundColor: `${emotion.color}30`,
                              color: emotion.color,
                              ...(selectedEmotion === emotion.type && { ringColor: emotion.color }),
                            }}
                            data-testid={`emotion-stamp-${emotion.type}`}
                          >
                            {selectedEmotion === emotion.type && <Check className="w-3 h-3" />}
                            {emotion.labelKo}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-t border-white/10">
                    <Button
                      onClick={handleSaveInsight}
                      className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                      style={{
                        backgroundColor: EMOTION_CONFIG.find(e => e.type === selectedEmotion)?.color || color,
                        color: '#1f2937',
                      }}
                      data-testid="button-save-insight"
                    >
                      <Check className="w-4 h-4" />
                      인사이트 저장
                    </Button>
                  </div>
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

