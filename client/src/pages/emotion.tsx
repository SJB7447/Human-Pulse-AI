import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, Heart, AlertCircle, CloudRain, Shield, Sparkles, Loader2, ArrowRight, User, Home, BookOpen, Users } from 'lucide-react';
import { EMOTION_CONFIG, EmotionType, useEmotionStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { NewsDetailModal } from '@/components/NewsDetailModal';
import { useNews, type NewsItem } from '@/hooks/useNews';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { EmotionTag } from '@/components/ui/EmotionTag';

const EMOTION_ICONS: Record<EmotionType, typeof Heart> = {
  joy: Sparkles,
  anger: AlertCircle,
  sadness: CloudRain,
  fear: Shield,
  calm: Heart,
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

function getRandomAuthor(id: number | string) {
  const numericId = typeof id === 'string' ? parseInt(id, 10) || 0 : id;
  return MOCK_AUTHORS[numericId % MOCK_AUTHORS.length];
}

import { GeminiService } from '@/services/gemini';
import { getSupabase } from '@/services/supabaseClient';
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

      const supabase = getSupabase();

      // Insert into Supabase
      const { error: insertError } = await supabase
        .from('news_items')
        .insert(generatedItems.map(item => ({
          title: item.title,
          summary: item.summary,
          content: item.content,
          source: item.source,
          emotion: type,
          image: `https://image.pollinations.ai/prompt/${encodeURIComponent(item.imagePrompt)}?nologo=true&private=true&enhance=true`,
          category: "AI Generated",
          views: 0,
          saves: 0
        })));

      if (insertError) {
        console.error("Supabase Save Error:", insertError);
        alert("뉴스 저장 실패: " + insertError.message);
      } else {
        // Invalidate query to refetch
        await queryClient.invalidateQueries({ queryKey: ['news', type] });
        alert("✨ AI가 3개의 새로운 뉴스를 도착시켰습니다!");
      }

    } catch (e) {
      console.error("News Generation Failed:", e);
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      alert(`뉴스 생성 실패: ${errorMessage}\n\n(API Key: ${import.meta.env.VITE_GEMINI_API_KEY ? 'Env Loaded' : 'Fallback Used'})`);
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
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-human-main mb-3" data-testid="text-emotion-title">
            {emotionConfig.labelKo}
          </h1>
          <p className="text-human-sub text-lg" data-testid="text-story-count">
            {emotionConfig.label} · {news.length}개의 이야기
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
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {heroArticle && (
              <motion.article
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 30 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                onClick={() => setSelectedArticle(heroArticle)}
                className="col-span-12 group cursor-pointer"
                data-testid={`card-hero-${heroArticle.id}`}
              >
                <div
                  className="rounded-xl overflow-visible hover-elevate"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    borderTop: `4px solid ${emotionConfig.color}`,
                  }}
                >
                  <div className="grid md:grid-cols-2 gap-0">
                    <div className="aspect-[3/2] md:aspect-auto overflow-hidden">
                      {heroArticle.image ? (
                        <img
                          src={heroArticle.image}
                          alt={heroArticle.title}
                          className="w-full h-full object-cover"
                          data-testid={`img-hero-${heroArticle.id}`}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = `https://placehold.co/800x600/e2e8f0/64748b?text=${encodeURIComponent(heroArticle.category || 'HueBrief')}`;
                          }}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: `${emotionConfig.color}15` }}
                        >
                          <Icon className="w-16 h-16" style={{ color: emotionConfig.color }} />
                        </div>
                      )}
                    </div>
                    <div className="p-8 flex flex-col justify-center">
                      <div className="flex items-center gap-3 mb-4">
                        <EmotionTag emotion={emotionConfig.type} />
                        <span className="text-xs text-human-sub flex items-center gap-1" data-testid={`text-time-${heroArticle.id}`}>
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(heroArticle.created_at)}
                        </span>
                      </div>

                      <h2 className="font-serif text-2xl md:text-3xl font-bold text-human-main mb-4 leading-tight" data-testid={`text-title-${heroArticle.id}`}>
                        {heroArticle.title}
                      </h2>

                      <p className="text-human-sub leading-relaxed mb-6 line-clamp-3" data-testid={`text-summary-${heroArticle.id}`}>
                        {heroArticle.summary}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center" data-testid={`avatar-author-${heroArticle.id}`}>
                            <User className="w-5 h-5 text-gray-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-human-main" data-testid={`text-author-${heroArticle.id}`}>{getRandomAuthor(heroArticle.id).name}</p>
                            <p className="text-xs text-human-sub truncate max-w-[200px]" data-testid={`text-source-${heroArticle.id}`}>
                              {heroArticle.source?.startsWith('http') ? new URL(heroArticle.source).hostname.replace('www.', '') : heroArticle.source}
                            </p>
                          </div>
                        </div>
                        <span
                          className="flex items-center gap-1 text-sm font-medium"
                          style={{ color: emotionConfig.color }}
                          data-testid={`link-read-more-${heroArticle.id}`}
                        >
                          자세히 보기 <ArrowRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.article>
            )}

            {subArticles.map((item, index) => (
              <motion.article
                key={item.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 30 }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                onClick={() => setSelectedArticle(item)}
                className="col-span-12 md:col-span-6 lg:col-span-4 group cursor-pointer"
                data-testid={`card-news-${item.id}`}
              >
                <div
                  className="h-full rounded-xl overflow-visible hover-elevate"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderTop: `3px solid ${emotionConfig.color}`,
                  }}
                >
                  <div className="aspect-[3/2] overflow-hidden">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        data-testid={`img-news-${item.id}`}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = `https://placehold.co/600x400/e2e8f0/64748b?text=${encodeURIComponent(item.category || 'HueBrief')}`;
                        }}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ backgroundColor: `${emotionConfig.color}10` }}
                      >
                        <Icon className="w-10 h-10" style={{ color: emotionConfig.color }} />
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full truncate max-w-[150px]"
                        style={{
                          backgroundColor: `${emotionConfig.color}15`,
                          color: emotionConfig.color,
                        }}
                        data-testid={`badge-source-${item.id}`}
                      >
                        {item.source?.startsWith('http') ? new URL(item.source).hostname.replace('www.', '') : item.source}
                      </span>
                      <span className="text-xs text-human-sub shrink-0" data-testid={`text-time-${item.id}`}>
                        {formatTimeAgo(item.created_at)}
                      </span>
                    </div>

                    <h3 className="font-serif text-lg font-bold text-human-main mb-2 leading-snug line-clamp-2" data-testid={`text-title-${item.id}`}>
                      {item.title}
                    </h3>

                    <p className="text-sm text-human-sub leading-relaxed line-clamp-2 mb-4" data-testid={`text-summary-${item.id}`}>
                      {item.summary}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center" data-testid={`avatar-author-${item.id}`}>
                          <User className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                        <span className="text-xs text-human-sub" data-testid={`text-author-${item.id}`}>{getRandomAuthor(item.id).name}</span>
                      </div>
                      <span
                        className="text-xs font-medium flex items-center gap-0.5"
                        style={{ color: emotionConfig.color }}
                        data-testid={`link-read-${item.id}`}
                      >
                        읽기 <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
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
            {EMOTION_CONFIG.filter(e => e.type !== type).map((emotion) => {
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

      <NewsDetailModal
        article={selectedArticle}
        emotionType={type || 'calm'}
        onClose={() => setSelectedArticle(null)}
      />
    </div>
  );
}
