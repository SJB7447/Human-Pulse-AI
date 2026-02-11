import { useEffect, useState } from 'react';
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
}

export function NewsDetailModal({ article, emotionType, onClose, onSaveCuration }: NewsDetailModalProps) {
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
  const color = emotionConfig?.color || '#888888';

  useEffect(() => {
    setInteractiveArticle(null);
    setInteractiveError(null);
  }, [article?.id]);

  useEffect(() => {
    setSelectedEmotion(emotionType);
  }, [emotionType]);

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

  const glowCore = `0 0 20px ${color}60`;
  const glowMid = `0 0 60px ${color}30`;
  const glowAmbient = `0 0 120px ${color}10`;
  const fullGlow = `${glowCore}, ${glowMid}, ${glowAmbient}`;

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
            className="absolute inset-0 bg-black/60"
            style={{
              WebkitBackdropFilter: 'blur(12px)',
            }}
          />

          <motion.div
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
            className="relative w-full max-w-lg h-[85vh] flex flex-col overflow-hidden rounded-2xl"
            style={{
              backgroundColor: 'rgba(20, 20, 25, 0.85)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="absolute inset-0 rounded-2xl pointer-events-none z-0">
              <motion.div
                className="absolute inset-0 rounded-2xl"
                initial={{ opacity: 0, boxShadow: 'none' }}
                animate={{
                  opacity: [0, 1, 0.7, 1, 0.7],
                  boxShadow: [
                    'none',
                    fullGlow,
                    `0 0 15px ${color}50, 0 0 45px ${color}25, 0 0 100px ${color}08`,
                    fullGlow,
                    `0 0 15px ${color}50, 0 0 45px ${color}25, 0 0 100px ${color}08`,
                  ],
                }}
                transition={{
                  opacity: { duration: 0.5, repeat: Infinity, repeatDelay: 2 },
                  boxShadow: { duration: 4, repeat: Infinity, ease: "easeInOut" },
                }}
              />
            </div>

            {/* Header / Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-4 right-4 z-50 bg-black/20 text-white/90 hover:bg-black/40 backdrop-blur-sm"
              data-testid="button-close-modal"
            >
              <X className="w-5 h-5" />
            </Button>

            {/* Image Section (Fixed at top) */}
            {article.image && (
              <div className="relative h-48 shrink-0 overflow-hidden z-10">
                <img
                  src={article.image}
                  alt={article.title}
                  className="w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(to top, rgba(20, 20, 25, 1) 0%, rgba(20, 20, 25, 0) 100%)',
                  }}
                />
              </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 z-10">
              <div className="flex items-center gap-3 mb-4">
                {article.category && (
                  <EmotionTag emotion={article.category.toLowerCase() as EmotionType} showIcon={true} />
                )}
                <span className="text-xs text-white/50 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(article.created_at)}
                </span>
              </div>

              <h2 className="text-2xl font-bold text-white mb-3 leading-tight">
                {article.title}
              </h2>

              <p className="text-sm text-white/60 mb-6 flex items-center gap-2">
                <span className="bg-white/10 px-2 py-0.5 rounded text-xs text-white/70">
                  {article.source?.startsWith('http') ? new URL(article.source).hostname.replace('www.', '') : article.source}
                </span>
              </p>

              <div className="text-white/90 text-lg leading-8 font-light mb-8 min-h-[100px] whitespace-pre-wrap tracking-wide">
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
                  <div className="space-y-4">
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
            </div>

            {/* Fixed Footer Buttons */}
            <div className="p-4 border-t border-white/10 bg-[#141419]/95 backdrop-blur z-20 shrink-0">
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
                  className="flex-1 min-w-[80px] text-white/80 bg-white/10 border-white/20 hover:bg-white/20"
                  data-testid="button-save-article"
                >
                  <Bookmark className="w-4 h-4" />
                  저장
                </Button>

                <Button
                  variant="ghost"
                  onClick={handleShare}
                  className="flex-1 min-w-[80px] text-white/80 bg-white/10 border-white/20 hover:bg-white/20"
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
                  className="flex-1 min-w-[80px] text-white/80 bg-white/10 border-white/20 hover:bg-white/20"
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
                  className="flex-1 min-w-[100px] border-0 hover:brightness-110 transition-all font-semibold"
                  variant="flowing"
                  style={{
                    backgroundColor: undefined, // Let variant handle bg
                    color: '#ffffff',
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
                        color: '#ffffff',
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
