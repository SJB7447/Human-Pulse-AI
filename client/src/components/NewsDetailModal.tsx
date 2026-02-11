import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bookmark, Share2, Sparkles, Loader2, Clock, Lightbulb, Check, RefreshCcw, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { type NewsItem } from '@/hooks/useNews';
import { EMOTION_CONFIG, EmotionType, useEmotionStore } from '@/lib/store';
import { AIServiceError, GeminiService } from '@/services/gemini';
import type { InteractiveArticle } from '@shared/interactiveArticle';
import { StoryRenderer } from '@/components/StoryRenderer';
import { EmotionTag } from '@/components/ui/EmotionTag';

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

export function NewsDetailModal({ article, emotionType, onClose, onSaveCuration, cardBackground, layoutId, relatedArticles = [], onSelectArticle }: NewsDetailModalProps) {
  const { toast } = useToast();
  const { user } = useEmotionStore();
  const [isTransforming, setIsTransforming] = useState(false);
  const [showInsightEditor, setShowInsightEditor] = useState(false);
  const [insightText, setInsightText] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>(emotionType);
  const [interactiveArticle, setInteractiveArticle] = useState<InteractiveArticle | null>(null);
  const [interactiveError, setInteractiveError] = useState<{ message: string; retryAfterSeconds?: number } | null>(null);
  const MAX_INSIGHT_LENGTH = 300;

  const emotionConfig = EMOTION_CONFIG.find(e => e.type === emotionType);
  const articleEmotionConfig = EMOTION_CONFIG.find((entry) => entry.type === article?.emotion) || emotionConfig;
  const color = articleEmotionConfig?.color || '#888888';

  useEffect(() => {
    setInteractiveArticle(null);
    setInteractiveError(null);
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

    // gravity 카테고리에서는 vibrance 또는 serenity 기사 최소 1개 노출 보장
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
  const isBrightEmotion = article?.emotion === 'vibrance' || article?.emotion === 'serenity';

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
    setInteractiveError(null);
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
        ? `AI 요청이 몰려 잠시 지연되고 있어요.${typeof retryAfterSeconds === 'number' ? ` 약 ${retryAfterSeconds}초 후` : ' 잠시 후'} 다시 시도해 주세요.`
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
      description: "마이페이지에서 확인하실 수 있습니다.",
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
      color: matched?.color || '#888888',
      label: matched?.labelKo || emotion,
    };
  };

  const glowCore = `0 0 20px ${color}60`;
  const glowMid = `0 0 60px ${color}30`;
  const glowAmbient = `0 0 120px ${color}10`;
  const fullGlow = `${glowCore}, ${glowMid}, ${glowAmbient}`;
  const currentEmotionMeta = article?.emotion ? getEmotionMeta(article.emotion) : null;

  return (
    <AnimatePresence>
      {article && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
            style={{
              WebkitBackdropFilter: 'blur(12px)',
              background: `radial-gradient(circle at 30% 20%, ${color}26 0%, rgba(255,255,255,0.75) 35%, rgba(255,255,255,0.92) 100%)`,
            }}
          />

          <motion.div
            layoutId={layoutId}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{
              duration: 0.4,
              type: "spring",
              stiffness: 300,
              damping: 25
            }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[94vw] h-[88vh] max-w-[1080px] flex flex-col overflow-hidden rounded-3xl"
            style={{
              background: cardBackground || 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.45)',
            }}
          >
            <div className="absolute inset-0 rounded-2xl pointer-events-none z-0">
              <motion.div
                className="absolute inset-0 rounded-2xl"
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

            {/* Header / Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-4 right-4 z-50 bg-white/50 text-gray-700 hover:bg-white/80 backdrop-blur-sm"
              data-testid="button-close-modal"
            >
              <X className="w-5 h-5" />
            </Button>

            {/* Image Section (Fixed at top) */}
            {article.image && (
              <div className="shrink-0 z-10 px-6 pt-6">
                <div className="rounded-2xl border border-white/70 bg-white/65 overflow-hidden shadow-sm">
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full max-h-[38vh] object-contain bg-white"
                  />
                </div>
              </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5 z-10">
              <div className="flex items-center gap-3 mb-4">
                {article.category && (
                  <EmotionTag emotion={article.category.toLowerCase() as EmotionType} showIcon={true} />
                )}
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(article.created_at)}
                </span>
              </div>

              <h2 className="text-3xl font-bold text-gray-900 mb-3 leading-tight">
                {article.title}
              </h2>

              <p className="text-sm text-gray-700 mb-6 flex items-center gap-2">
                <span className="bg-white/60 px-2 py-0.5 rounded text-xs text-gray-700">
                  {article.source?.startsWith('http') ? new URL(article.source).hostname.replace('www.', '') : article.source}
                </span>
              </p>

              <div className="text-gray-900 text-[18px] leading-8 font-normal mb-8 min-h-[100px] whitespace-pre-wrap tracking-wide max-w-3xl">
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
                        원본 보기
                      </Button>
                    </div>
                    <StoryRenderer article={interactiveArticle} />
                  </div>
                ) : (
                  <div className="space-y-4 rounded-2xl bg-white/55 border border-white/70 p-5">
                    {interactiveError && (
                      <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100 space-y-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <p>{interactiveError.message}</p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={handleMyArticle}
                          disabled={isTransforming}
                          className="h-8 border-amber-300/50 bg-transparent text-amber-100 hover:bg-amber-300/10"
                        >
                          <RefreshCcw className="w-3 h-3" />
                          다시 시도
                        </Button>
                      </div>
                    )}
                    {(article.content || article.summary).split('\n\n').map((paragraph, idx) => (
                      <p key={idx} className="text-justify opacity-95">{paragraph}</p>
                    ))}
                  </div>
                )}
              </div>

              {hasRecommendations && !interactiveArticle && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h4 className="text-sm font-semibold text-gray-700">추천 뉴스</h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      {currentEmotionMeta && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full border"
                          style={{
                            color: currentEmotionMeta.color,
                            borderColor: `${currentEmotionMeta.color}66`,
                            backgroundColor: `${currentEmotionMeta.color}18`,
                          }}
                        >
                          현재 감정 {currentEmotionMeta.label}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-500">감정 균형을 고려해 제안합니다</span>
                    </div>
                  </div>

                  {recommendationGroups.sameCategory.length > 0 && (
                    <div className="rounded-2xl border border-white/70 bg-white/55 p-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2">같은 카테고리 이어보기 ({recommendationGroups.sameCategory.length})</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {recommendationGroups.sameCategory.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectArticle?.(item)}
                            className="text-left rounded-xl border border-white/70 bg-white/70 hover:bg-white/90 transition-colors overflow-hidden"
                          >
                            {item.image && (
                              <img src={item.image} alt={item.title} className="w-full h-24 object-cover" />
                            )}
                            <div className="p-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-[11px] text-gray-500">{item.category || '일반 뉴스'}</p>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">동일 카테고리</span>
                              </div>
                              <p className="text-sm font-semibold text-gray-800 line-clamp-2">{item.title}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {recommendationGroups.balance.length > 0 && (
                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3">
                      <p className="text-xs font-semibold text-emerald-800 mb-2">감정 균형 추천 · 다른 카테고리 ({recommendationGroups.balance.length})</p>
                      <div className="grid grid-cols-1 gap-3">
                        {recommendationGroups.balance.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectArticle?.(item)}
                            className="text-left rounded-xl border border-emerald-200/80 bg-white/80 hover:bg-white transition-colors overflow-hidden"
                          >
                            {item.image && (
                              <img src={item.image} alt={item.title} className="w-full h-28 object-cover" />
                            )}
                            <div className="p-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-[11px] text-emerald-700">균형 제안 · {item.category || '일반 뉴스'}</p>
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-full border"
                                  style={{
                                    color: getEmotionMeta(item.emotion).color,
                                    borderColor: `${getEmotionMeta(item.emotion).color}66`,
                                    backgroundColor: `${getEmotionMeta(item.emotion).color}18`,
                                  }}
                                >
                                  {getEmotionMeta(item.emotion).label}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-gray-800 line-clamp-2">{item.title}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fixed Footer Buttons */}
            <div className="p-4 border-t border-white/40 bg-white/50 backdrop-blur z-20 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!user) {
                      toast({ title: "로그인 필요", description: "로그인 후 이용 가능합니다.", variant: "destructive" });
                      return;
                    }
                    handleSave();
                  }}
                  className="flex-1 min-w-[80px] text-gray-700 bg-white/60 border-white/70 hover:bg-white/85"
                  data-testid="button-save-article"
                >
                  <Bookmark className="w-4 h-4" />
                  저장
                </Button>

                <Button
                  variant="ghost"
                  onClick={handleShare}
                  className="flex-1 min-w-[80px] text-gray-700 bg-white/60 border-white/70 hover:bg-white/85"
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
                  className="flex-1 min-w-[80px] text-gray-700 bg-white/60 border-white/70 hover:bg-white/85"
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
                  disabled={isTransforming}
                  className="flex-1 min-w-[100px] border border-white/70 bg-white/60 text-gray-800 hover:bg-white/85 transition-all font-semibold"
                  variant="flowing"
                  style={{
                    backgroundColor: undefined, // Let variant handle bg
                    color: '#1f2937',
                    boxShadow: `0 4px 20px ${color}50`,
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

            {/* Insight Editor Overlay */}
            <AnimatePresence>
              {showInsightEditor && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute inset-0 z-20 flex flex-col rounded-2xl overflow-visible"
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
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowInsightEditor(false)}
                      className="bg-white/10 text-white/80"
                      data-testid="button-close-insight"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex-1 p-4 overflow-y-auto">
                    {/* Original Article Context */}
                    <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                      <p className="text-xs text-white/50 mb-1">원본 기사</p>
                      <p className="text-sm text-white/80 font-medium line-clamp-2">{article?.title}</p>
                    </div>

                    {/* User Input */}
                    <div className="mb-4">
                      <label className="block text-sm text-white/70 mb-2">
                        나의 생각 ({insightText.length}/{MAX_INSIGHT_LENGTH})
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
                      className="w-full"
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
