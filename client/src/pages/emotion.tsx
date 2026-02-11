import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Heart, AlertCircle, CloudRain, Shield, Sparkles, Loader2, ArrowRight, User, Home, BookOpen, Users, HelpCircle, ArrowUp } from 'lucide-react';
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
  { name: '김지현', avatar: null },
  { name: '이서준', avatar: null },
  { name: '박민서', avatar: null },
  { name: '최유진', avatar: null },
  { name: '정수아', avatar: null },
];

function formatTimeAgo(date: Date | string | null | undefined): string {
  if (!date) return '방금 전';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return '방금 전';
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
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

function getRandomAuthor(id: number | string) {
  const numericId = typeof id === 'string' ? parseInt(id, 10) || 0 : id;
  return MOCK_AUTHORS[numericId % MOCK_AUTHORS.length];
}

import { GeminiService } from '@/services/gemini';
import { useQueryClient } from '@tanstack/react-query';

// ... (existing imports)

export default function EmotionPage() {
  const { type } = useParams<{ type: EmotionType }>();
  const [mounted, setMounted] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useEmotionStore();
  const { toast } = useToast();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [selectedCardBg, setSelectedCardBg] = useState<string>('rgba(255,255,255,0.96)');

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRestrictedNavigation = (path: string) => {
    if (!user) {
      toast({
        title: "로그인 필요",
        description: "로그인 후 이용할 수 있는 기능입니다.",
        variant: "destructive",
      });
      return;
    }
    setLocation(path);
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
    handleGenerateNews();
  };

  const emotionConfig = EMOTION_CONFIG.find(e => e.type === type);
  const Icon = type ? EMOTION_ICONS[type] : Heart;

  const { data: news = [], isLoading, error } = useNews(type);

  const handleGenerateNews = async () => {
    if (!type) return;

    setIsGenerating(true);
    try {
      console.log("Generating news for:", type);
      const generatedItems = await GeminiService.generateNewsForEmotion(type);
      console.log("Generated Items:", generatedItems);

      // Save through server API to avoid client-side Supabase RLS insert failure.
      const saveResults = await Promise.all(
        generatedItems.map(async (item) => {
          const response = await fetch('/api/articles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: item.title,
              summary: item.summary,
              content: item.content,
              source: item.source,
              emotion: type,
              image: `https://image.pollinations.ai/prompt/${encodeURIComponent(item.imagePrompt)}?nologo=true&private=true&enhance=true`,
              category: 'AI Generated',
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
      alert("✨ AI가 3개의 새로운 뉴스를 도착시켰습니다!");

    } catch (e) {
      console.error("News Generation Failed:", e);
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      alert(`뉴스 생성 실패: ${errorMessage}`);
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
          <h1 className="text-2xl font-bold text-gray-800" data-testid="text-error-title">감정을 찾을 수 없습니다</h1>
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

      <main className="max-w-6xl mx-auto px-6 py-12 pt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-2">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
                뒤로
              </Button>
            </Link>
          </div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-human-main mb-2" data-testid="text-emotion-title">
            {emotionConfig.label}
          </h1>
          <p className="text-xl text-human-main/80 font-medium mb-2">
            {emotionConfig.labelKo}
          </p>
          <p className="text-human-sub text-lg mb-4" data-testid="text-story-count">
            {emotionConfig.subLabel}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {emotionConfig.recommendedNews.map((news, idx) => (
              <span
                key={idx}
                className="px-3 py-1 rounded-full text-sm"
                style={{
                  backgroundColor: `${emotionConfig.color}20`,
                  color: emotionConfig.color,
                  border: `1px solid ${emotionConfig.color}40`,
                }}
              >
                {news}
              </span>
            ))}
          </div>
          <p className="text-human-sub text-sm">
            {news.length}개의 이야기
          </p>
          <div className="mt-4">
            <Button
              onClick={handleGenerateNews}
              disabled={isGenerating}
              className="bg-white/50 backdrop-blur-sm border border-human-main/10 hover:bg-white/80 text-human-main shadow-sm transition-all duration-200"
              size="sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin text-purple-600" />
                  AI 작성 중...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
                  AI 뉴스 생성 (Gemini)
                </>
              )}
            </Button>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
            <p className="mt-4 text-human-sub" data-testid="text-loading">이야기를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500">
            <p className="text-xl font-bold">오류 발생</p>
            <p>{(error as any).message}</p>
            <div className="mt-4 text-sm text-gray-500 p-4 bg-gray-100 rounded text-left mx-auto max-w-lg">
              <p>팁: .env 파일이 올바른지, Supabase RLS 정책이 설정되었는지 확인하세요.</p>
              <p className="mt-2 text-xs font-mono break-all text-blue-600 font-bold">
                연결 URL: {import.meta.env.VITE_SUPABASE_URL || 'UNDEFINED'}
              </p>
            </div>
          </div>
        ) : news.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-human-sub mb-4" data-testid="text-empty">이 감정에 해당하는 이야기가 없습니다. (데이터: 0개)</p>
            <Button
              onClick={handleGenerateNews}
              disabled={isGenerating}
              className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg transform hover:scale-105 transition-all duration-200"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  AI가 뉴스를 작성 중입니다...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  AI로 뉴스 생성하기 (Gemini)
                </>
              )}
            </Button>
            <p className="text-xs text-gray-400 mt-4">DB 연결은 성공했으나 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6">
              {news.map((item, index) => {
                const depth = Math.max(0, Math.min(100, item.intensity ?? 50));
                const cardBgStart = hexToRgba(emotionConfig.color, 0.14 + depth / 220);
                const cardBgEnd = hexToRgba(emotionConfig.color, 0.10 + depth / 300);
                const cardBgColor = `linear-gradient(165deg, ${cardBgStart} 0%, ${cardBgEnd} 100%)`;
                const isLightBg = true;
                const textColor = isLightBg ? '#232221' : '#ffffff';
                const subTextColor = isLightBg ? '#666666' : 'rgba(255,255,255,0.8)';
                const updatedAtLabel = formatTimeAgo(item.created_at);
                const detailCategory = item.category || emotionConfig.labelKo;

                return (
                  <motion.article
                    key={item.id}
                    layoutId={`news-card-${item.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    onClick={() => {
                      setSelectedCardBg(cardBgColor);
                      setSelectedArticle(item);
                    }}
                    className="w-full group cursor-pointer"
                    data-testid={`card-news-${item.id}`}
                  >
                    <div
                      className="h-full rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col"
                      style={{ background: cardBgColor }}
                    >
                      {/* Header with category and update time */}
                      <div className="p-5 pb-0">
                        <div className="flex items-center justify-between mb-3">
                          <span
                            className="text-xs font-semibold px-3 py-1 rounded-full"
                            style={{
                              backgroundColor: isLightBg ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
                              color: textColor,
                            }}
                          >
                            {detailCategory}
                          </span>
                          <span className="text-xs" style={{ color: subTextColor }}>
                            업데이트 {updatedAtLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <span
                            className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{
                              backgroundColor: hexToRgba(emotionConfig.color, 0.22),
                              color: textColor,
                            }}
                          >
                            감정 깊이 {depth}
                          </span>
                        </div>

                        {/* Title */}
                        <h3
                          className="font-serif text-xl font-bold leading-tight mb-3 line-clamp-3"
                          style={{ color: textColor }}
                          data-testid={`text-title-${item.id}`}
                        >
                          {item.title}
                        </h3>

                        <p className="text-sm leading-relaxed line-clamp-3 mb-4" style={{ color: subTextColor }}>
                          {item.summary}
                        </p>
                      </div>

                      {/* Image or Icon area */}
                      <div className="flex-grow px-5 pb-5">
                        {item.image ? (
                          <div className="rounded-xl overflow-hidden aspect-[4/3]">
                            <img
                              src={item.image}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              data-testid={`img-news-${item.id}`}
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = `https://placehold.co/400x300/${emotionConfig.color.replace('#', '')}/1f1f1f?text=${encodeURIComponent(item.category || 'HueBrief')}`;
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            className="rounded-xl aspect-[4/3] flex items-center justify-center"
                            style={{ backgroundColor: isLightBg ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)' }}
                          >
                            <Icon className="w-16 h-16" style={{ color: textColor, opacity: 0.6 }} />
                          </div>
                        )}
                      </div>

                      {/* Audio/Read indicator */}
                      <div className="px-5 pb-5 mt-auto">
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
          </div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: mounted ? 1 : 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16 pt-12 border-t border-gray-100"
        >
          <p className="text-sm text-human-sub mb-6 text-center" data-testid="text-explore-other">다른 감정 탐색하기</p>
          <div className="flex justify-center gap-3 flex-wrap">
            {EMOTION_CONFIG.filter(e => e.type !== type && e.type !== 'spectrum').map((emotion) => {
              const EmotionIcon = EMOTION_ICONS[emotion.type];
              return (
                <Link key={emotion.type} href={`/emotion/${emotion.type}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    style={{
                      backgroundColor: `${emotion.color}10`,
                      borderColor: `${emotion.color}30`,
                      color: emotion.color,
                    }}
                    data-testid={`button-emotion-${emotion.type}`}
                  >
                    <EmotionIcon className="w-4 h-4" />
                    {emotion.labelKo}
                  </Button>
                </Link>
              );
            })}
          </div>
        </motion.div>
      </main>

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={scrollToTop}
            className="fixed bottom-24 right-6 z-[90] w-14 h-14 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 shadow-xl flex items-center justify-center hover:bg-white transition-all duration-300 hover:scale-105 group"
            style={{ marginBottom: '1rem' }}
          >
            <ArrowUp className="w-6 h-6 text-gray-600 group-hover:text-human-main" />
          </motion.button>
        )}
      </AnimatePresence>

      <NewsDetailModal
        article={selectedArticle}
        emotionType={type || 'serenity'}
        cardBackground={selectedCardBg}
        layoutId={selectedArticle ? `news-card-${selectedArticle.id}` : undefined}
        relatedArticles={news}
        onSelectArticle={(nextArticle) => {
          const depth = Math.max(0, Math.min(100, nextArticle.intensity ?? 50));
          const cardBgStart = hexToRgba(emotionConfig?.color || '#888888', 0.14 + depth / 220);
          const cardBgEnd = hexToRgba(emotionConfig?.color || '#888888', 0.10 + depth / 300);
          setSelectedCardBg(`linear-gradient(165deg, ${cardBgStart} 0%, ${cardBgEnd} 100%)`);
          setSelectedArticle(nextArticle);
        }}
        onClose={() => setSelectedArticle(null)}
      />
    </div>
  );
}
