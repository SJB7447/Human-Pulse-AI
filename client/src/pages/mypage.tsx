import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'wouter';
import { User, Bookmark, Sparkles, Edit, Trash2, Eye, Settings, Heart, Lightbulb, Share2, MessageSquare, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { EMOTION_CONFIG, useEmotionStore } from '@/lib/store';
import { DBService, type UserComposedArticleRecord, type UserInsightRecord, type UserSocialConnections } from '@/services/DBService';
import { useToast } from '@/hooks/use-toast';
import { ResponsiveContainer, PieChart, Pie, Tooltip as RechartsTooltip, Cell } from 'recharts';

interface SavedArticle {
  id: number;
  title: string;
  emotion: string;
  savedAt: string;
}

const MOCK_SAVED_ARTICLES: SavedArticle[] = [
  { id: 1, title: '글로벌 경제 전망: 새로운 신호', emotion: 'vibrance', savedAt: '2024-01-15' },
  { id: 2, title: '환경 보호를 위한 청년들의 움직임', emotion: 'serenity', savedAt: '2024-01-14' },
  { id: 3, title: '혁신계의 새로운 바람', emotion: 'clarity', savedAt: '2024-01-13' },
];

const INSIGHTS_PER_PAGE = 6;
const PAGE_ELLIPSIS = 'ellipsis';
type PageToken = number | typeof PAGE_ELLIPSIS;
type InsightCategoryKey = 'all' | 'growth' | 'empathy' | 'vitality' | 'discomfort' | 'concern' | 'action' | 'untagged';

const INSIGHT_CATEGORY_LABEL: Record<InsightCategoryKey, string> = {
  all: '전체',
  growth: '성장/깨달음',
  empathy: '공감/연대',
  vitality: '활력/안도',
  discomfort: '불편/소진',
  concern: '걱정/무력감',
  action: '능동 액션',
  untagged: '태그 없음',
};

const TAG_GROUP_BY_LABEL: Record<string, Exclude<InsightCategoryKey, 'all' | 'untagged'>> = {
  '새로운 깨달음': 'growth',
  '흥미로움': 'growth',
  '영감받음': 'growth',
  '시야가 넓어짐': 'growth',
  '따뜻함': 'empathy',
  '뭉클함': 'empathy',
  '응원하고 싶음': 'empathy',
  '위로받음': 'empathy',
  '통쾌함': 'vitality',
  '뿌듯함': 'vitality',
  '희망참': 'vitality',
  '든든함': 'vitality',
  '반가움': 'vitality',
  '차분해짐': 'vitality',
  '답답함': 'discomfort',
  '화가 남': 'discomfort',
  '피로함': 'discomfort',
  '안타까움': 'concern',
  '걱정됨': 'concern',
  '허탈함': 'concern',
  '후속 이야기가 궁금함': 'action',
  '심층 기사 요청': 'action',
};

const INSIGHT_GROUP_COLOR: Record<Exclude<InsightCategoryKey, 'all' | 'untagged'>, string> = {
  growth: '#6fae63',
  empathy: '#5aa8b2',
  vitality: '#f0b24b',
  discomfort: '#de8b72',
  concern: '#8f88c8',
  action: '#4f89de',
};

const createEmptySocialConnections = (): UserSocialConnections => ({
  webUrl: '',
  instagramHandle: '',
  threadsHandle: '',
  youtubeChannelUrl: '',
  updatedAt: '',
});

export default function MyPage() {
  const { user } = useEmotionStore();
  const [currentLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'saved' | 'curated' | 'custom' | 'settings'>('saved');
  const [userInfo, setUserInfo] = useState({
    name: '김휴브리프',
    email: 'human@pulse.com',
    bio: '감정을 통해 세상을 이해하고 기록합니다.',
  });
  const [socialConnections, setSocialConnections] = useState<UserSocialConnections>(createEmptySocialConnections());
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialSaving, setSocialSaving] = useState(false);
  const [curatedInsights, setCuratedInsights] = useState<UserInsightRecord[]>([]);
  const [insightLoading, setInsightLoading] = useState(false);
  const [composedArticles, setComposedArticles] = useState<UserComposedArticleRecord[]>([]);
  const [composedLoading, setComposedLoading] = useState(false);
  const [expandedComposedArticleId, setExpandedComposedArticleId] = useState<string | null>(null);
  const [editingComposedArticleId, setEditingComposedArticleId] = useState<string | null>(null);
  const [editingComposedTitle, setEditingComposedTitle] = useState('');
  const [editingComposedContent, setEditingComposedContent] = useState('');
  const [savingComposedEdit, setSavingComposedEdit] = useState(false);
  const [insightCategoryFilter, setInsightCategoryFilter] = useState<InsightCategoryKey>('all');
  const [insightPage, setInsightPage] = useState(1);
  const [hoveredInsightTag, setHoveredInsightTag] = useState<string | null>(null);

  const socialOwnerId = String(user?.id || 'guest');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const search = window.location.search || (currentLocation.includes('?') ? currentLocation.slice(currentLocation.indexOf('?')) : '');
    const tab = new URLSearchParams(search).get('tab');
    if (tab === 'saved' || tab === 'curated' || tab === 'custom' || tab === 'settings') {
      setActiveTab(tab);
    }
  }, [currentLocation]);

  useEffect(() => {
    let mounted = true;
    const loadSocialConnections = async () => {
      setSocialLoading(true);
      try {
        const loaded = await DBService.getUserSocialConnections(socialOwnerId);
        if (!mounted) return;
        setSocialConnections(loaded);
      } catch {
        if (!mounted) return;
        setSocialConnections(createEmptySocialConnections());
      } finally {
        if (mounted) setSocialLoading(false);
      }
    };
    loadSocialConnections();
    return () => {
      mounted = false;
    };
  }, [socialOwnerId]);

  useEffect(() => {
    let mounted = true;
    const loadComposedArticles = async () => {
      setComposedLoading(true);
      try {
        const rows = await DBService.getUserComposedArticles(socialOwnerId);
        if (!mounted) return;
        setComposedArticles(rows);
      } catch {
        if (!mounted) return;
        setComposedArticles([]);
      } finally {
        if (mounted) setComposedLoading(false);
      }
    };
    loadComposedArticles();
    return () => {
      mounted = false;
    };
  }, [socialOwnerId]);

  useEffect(() => {
    let mounted = true;
    const loadInsights = async () => {
      setInsightLoading(true);
      try {
        const rows = await DBService.getUserInsights(socialOwnerId);
        if (!mounted) return;
        setCuratedInsights(rows);
      } catch {
        if (!mounted) return;
        setCuratedInsights([]);
      } finally {
        if (mounted) setInsightLoading(false);
      }
    };
    loadInsights();
    return () => {
      mounted = false;
    };
  }, [socialOwnerId]);

  const handleSaveSocialConnections = async () => {
    setSocialSaving(true);
    try {
      const saved = await DBService.updateUserSocialConnections(socialOwnerId, socialConnections);
      setSocialConnections(saved);
      toast({
        title: 'SNS 연결 설정 저장 완료',
        description: '현재는 목업 저장이며 추후 실제 연동으로 확장됩니다.',
      });
    } catch (error: any) {
      toast({
        title: 'SNS 설정 저장 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSocialSaving(false);
    }
  };

  const getEmotionColor = (emotion: string) => {
    return EMOTION_CONFIG.find((e) => e.type === emotion)?.color || '#888';
  };

  const handleDeleteInsight = async (insightId: string) => {
    const ok = await DBService.deleteUserInsight(socialOwnerId, insightId);
    if (!ok) return;
    setCuratedInsights((prev) => prev.filter((row) => row.id !== insightId));
    toast({
      title: '인사이트 삭제 완료',
    });
  };

  const handleStartEditComposed = (article: UserComposedArticleRecord) => {
    setExpandedComposedArticleId(article.id);
    setEditingComposedArticleId(article.id);
    setEditingComposedTitle(article.generatedTitle);
    setEditingComposedContent(article.generatedContent);
  };

  const handleSaveComposedEdit = async () => {
    if (!editingComposedArticleId) return;
    const nextTitle = editingComposedTitle.trim();
    const nextContent = editingComposedContent.trim();
    if (!nextTitle || !nextContent) {
      toast({
        title: '입력 필요',
        description: '제목과 본문을 모두 입력해 주세요.',
        variant: 'destructive',
      });
      return;
    }
    setSavingComposedEdit(true);
    try {
      const nextSummary = nextContent.replace(/\s+/g, ' ').slice(0, 220);
      const updated = await DBService.updateUserComposedArticle(socialOwnerId, editingComposedArticleId, {
        generatedTitle: nextTitle,
        generatedSummary: nextSummary,
        generatedContent: nextContent,
      });
      setComposedArticles((prev) => [updated, ...prev.filter((row) => row.id !== updated.id)]);
      setEditingComposedArticleId(null);
      toast({ title: '내 기사 수정 완료' });
    } catch (error: any) {
      toast({
        title: '수정 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingComposedEdit(false);
    }
  };

  const resolveInsightCategory = (row: UserInsightRecord): InsightCategoryKey => {
    const tags = Array.isArray(row.selectedTags) ? row.selectedTags : [];
    for (const tag of tags) {
      const key = TAG_GROUP_BY_LABEL[String(tag || '').trim()];
      if (key) return key;
    }
    const fallback = TAG_GROUP_BY_LABEL[String(row.userFeelingText || '').trim()];
    if (fallback) return fallback;
    return 'untagged';
  };

  const filteredInsights = useMemo(() => {
    if (insightCategoryFilter === 'all') return curatedInsights;
    return curatedInsights.filter((row) => resolveInsightCategory(row) === insightCategoryFilter);
  }, [curatedInsights, insightCategoryFilter]);

  const insightTagStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of filteredInsights) {
      const tags = Array.isArray(row.selectedTags) && row.selectedTags.length > 0
        ? row.selectedTags
        : row.userFeelingText
          ? [row.userFeelingText]
          : [];
      for (const tag of tags) {
        const label = String(tag || '').trim();
        if (!label) continue;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredInsights]);

  const insightChartData = useMemo(() => {
    return insightTagStats.map((row) => {
      const group = TAG_GROUP_BY_LABEL[row.label] || 'action';
      const safeGroup = (group in INSIGHT_GROUP_COLOR ? group : 'action') as Exclude<InsightCategoryKey, 'all' | 'untagged'>;
      return {
        tag: row.label,
        count: row.count,
        fill: INSIGHT_GROUP_COLOR[safeGroup],
        group: INSIGHT_CATEGORY_LABEL[safeGroup],
      };
    });
  }, [insightTagStats]);

  const totalTagSelections = useMemo(
    () => insightChartData.reduce((sum, row) => sum + row.count, 0),
    [insightChartData],
  );

  const totalInsightPages = Math.max(1, Math.ceil(filteredInsights.length / INSIGHTS_PER_PAGE));
  const pagedInsights = useMemo(() => {
    const start = (insightPage - 1) * INSIGHTS_PER_PAGE;
    return filteredInsights.slice(start, start + INSIGHTS_PER_PAGE);
  }, [filteredInsights, insightPage]);

  const insightPageTokens = useMemo<PageToken[]>(() => {
    if (totalInsightPages <= 7) {
      return Array.from({ length: totalInsightPages }, (_, index) => index + 1);
    }
    const start = Math.max(2, insightPage - 1);
    const end = Math.min(totalInsightPages - 1, insightPage + 1);
    const tokens: PageToken[] = [1];
    if (start > 2) tokens.push(PAGE_ELLIPSIS);
    for (let page = start; page <= end; page += 1) {
      tokens.push(page);
    }
    if (end < totalInsightPages - 1) tokens.push(PAGE_ELLIPSIS);
    tokens.push(totalInsightPages);
    return tokens;
  }, [insightPage, totalInsightPages]);

  useEffect(() => {
    setInsightPage(1);
  }, [insightCategoryFilter]);

  useEffect(() => {
    if (insightPage <= totalInsightPages) return;
    setInsightPage(totalInsightPages);
  }, [insightPage, totalInsightPages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />

      <main className="max-w-4xl mx-auto px-6 py-8 pt-24">
        <div className="mb-6 text-center md:text-left">
          <h1 className="text-2xl font-bold text-gray-800" data-testid="text-page-title">
            마이페이지
          </h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-800" data-testid="text-user-name">
                {userInfo.name}
              </h2>
              <p className="text-sm text-gray-500">{userInfo.email}</p>
              <p className="text-sm text-gray-600 mt-1">{userInfo.bio}</p>
            </div>
            <GlassButton variant="outline" size="sm" data-testid="button-edit-profile">
              <Edit className="w-4 h-4" />
              프로필 수정
            </GlassButton>
          </div>
        </motion.div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { key: 'saved', label: '저장한 기사', icon: Bookmark },
            { key: 'curated', label: '내 인사이트', icon: Lightbulb },
            { key: 'custom', label: '내가 쓴 기사', icon: Sparkles },
            { key: 'settings', label: '설정', icon: Settings },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${
                activeTab === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover-elevate'
              }`}
              data-testid={`tab-${key}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {activeTab === 'saved' && (
            <div className="space-y-3">
              {MOCK_SAVED_ARTICLES.map((article) => (
                <div
                  key={article.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between group overflow-visible hover-elevate"
                  data-testid={`saved-article-${article.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getEmotionColor(article.emotion) }} />
                    <div>
                      <h3 className="font-medium text-gray-800" data-testid={`text-saved-title-${article.id}`}>{article.title}</h3>
                      <p className="text-xs text-gray-400">{article.savedAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" data-testid={`button-view-${article.id}`}>
                      <Eye className="w-4 h-4 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid={`button-delete-${article.id}`}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'curated' && (
            <div className="space-y-4">
              {insightLoading ? (
                <div className="bg-white rounded-xl p-8 border border-gray-100 flex items-center justify-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  불러오는 중...
                </div>
              ) : curatedInsights.length === 0 ? (
                <div className="bg-white rounded-xl p-8 border border-gray-100 text-center text-gray-500">
                  저장된 인사이트가 없습니다.
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                      <div>
                        <p className="text-xs text-gray-500">내 인사이트 통계</p>
                        <h3 className="text-base font-semibold text-gray-800">감정 태그 인포그래픽</h3>
                      </div>
                      <div className="w-full md:w-56">
                        <label className="block text-xs text-gray-500 mb-1">카테고리 필터</label>
                        <select
                          value={insightCategoryFilter}
                          onChange={(e) => setInsightCategoryFilter(e.target.value as InsightCategoryKey)}
                          className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-black/10"
                          data-testid="select-insight-category-filter"
                        >
                          {(Object.keys(INSIGHT_CATEGORY_LABEL) as InsightCategoryKey[]).map((key) => (
                            <option key={key} value={key}>{INSIGHT_CATEGORY_LABEL[key]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-[11px] text-gray-500">전체 인사이트</p>
                        <p className="text-lg font-semibold text-gray-800">{curatedInsights.length}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-[11px] text-gray-500">필터 결과</p>
                        <p className="text-lg font-semibold text-gray-800">{filteredInsights.length}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-[11px] text-gray-500">페이지</p>
                        <p className="text-lg font-semibold text-gray-800">{insightPage}/{totalInsightPages}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-[11px] text-gray-500">주요 태그 수</p>
                        <p className="text-lg font-semibold text-gray-800">{insightTagStats.length}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-100 bg-[#fcfcfc] p-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">감정태그 분포</p>
                      {insightChartData.length === 0 ? (
                        <p className="text-sm text-gray-500 py-2">표시할 태그 데이터가 없습니다.</p>
                      ) : (
                        <div className="w-full flex flex-col md:flex-row md:items-center gap-4">
                          <div className="w-full md:flex-1 h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={insightChartData}
                                  dataKey="count"
                                  nameKey="tag"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={56}
                                  outerRadius={94}
                                  paddingAngle={2}
                                  onMouseEnter={(_, index) => setHoveredInsightTag(insightChartData[index]?.tag ?? null)}
                                  onMouseLeave={() => setHoveredInsightTag(null)}
                                >
                                  {insightChartData.map((entry) => {
                                    const isMuted = hoveredInsightTag && hoveredInsightTag !== entry.tag;
                                    const isActive = hoveredInsightTag === entry.tag;
                                    return (
                                      <Cell
                                        key={`cell-${entry.tag}`}
                                        fill={entry.fill}
                                        fillOpacity={isMuted ? 0.3 : 0.95}
                                        stroke={isActive ? '#2d3748' : '#ffffff'}
                                        strokeWidth={isActive ? 2 : 1}
                                      />
                                    );
                                  })}
                                </Pie>
                                <RechartsTooltip
                                  contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 20px rgba(0,0,0,0.08)' }}
                                  formatter={(value: any, _name: any, payload: any) => {
                                    const count = Number(value || 0);
                                    const percent = totalTagSelections > 0 ? Math.round((count / totalTagSelections) * 100) : 0;
                                    return [`${count}회 (${percent}%)`, payload?.payload?.group || '태그'];
                                  }}
                                  labelFormatter={(label: any) => String(label || '')}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="w-full md:w-[260px] rounded-lg bg-white border border-gray-100 p-3">
                            <p className="text-xs font-medium text-gray-600 mb-2">범례</p>
                            <div className="space-y-1.5">
                              {insightChartData.map((entry) => (
                                <button
                                  key={`legend-${entry.tag}`}
                                  type="button"
                                  onMouseEnter={() => setHoveredInsightTag(entry.tag)}
                                  onMouseLeave={() => setHoveredInsightTag(null)}
                                  className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-gray-50"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                                    <span className="text-xs text-gray-700 truncate">{entry.tag}</span>
                                  </span>
                                  <span className="text-xs text-gray-500 shrink-0">{entry.count}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {filteredInsights.length === 0 ? (
                    <div className="bg-white rounded-xl p-8 border border-gray-100 text-center text-gray-500">
                      해당 카테고리에 저장된 인사이트가 없습니다.
                    </div>
                  ) : (
                    <>
                      {pagedInsights.map((article) => (
                        <div
                          key={article.id}
                          className="bg-white rounded-xl overflow-visible shadow-sm border border-gray-100 group hover-elevate"
                          data-testid={`curated-article-${article.id}`}
                        >
                          <div className="h-1" style={{ backgroundColor: getEmotionColor(article.userEmotion) }} />
                          <div className="p-4">
                            <div className="flex items-start gap-3 mb-3">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${getEmotionColor(article.userEmotion)}20` }}
                              >
                                <Lightbulb className="w-4 h-4" style={{ color: getEmotionColor(article.userEmotion) }} />
                              </div>
                              <div className="flex-1">
                                <p className="text-xs text-gray-400 mb-1">원본 기사</p>
                                <h3 className="font-medium text-gray-800 text-sm" data-testid={`text-curated-title-${article.id}`}>{article.originalTitle}</h3>
                              </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-3 mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <MessageSquare className="w-3 h-3 text-gray-400" />
                                <span className="text-xs text-gray-500">내 인사이트</span>
                              </div>
                              <p className="text-sm text-gray-700 leading-relaxed" data-testid={`text-curated-comment-${article.id}`}>{article.userComment}</p>
                              {Array.isArray(article.selectedTags) && article.selectedTags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {article.selectedTags.map((tag) => (
                                    <span key={`${article.id}-${tag}`} className="text-[11px] px-2 py-0.5 rounded-full bg-white text-gray-600 border border-gray-200">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-xs px-2 py-1 rounded-full"
                                  style={{
                                    backgroundColor: `${getEmotionColor(article.userEmotion)}20`,
                                    color: getEmotionColor(article.userEmotion),
                                  }}
                                  data-testid={`badge-curated-emotion-${article.id}`}
                                >
                                  {article.userFeelingText || EMOTION_CONFIG.find((e) => e.type === article.userEmotion)?.labelKo || article.userEmotion}
                                </span>
                                <span className="text-xs text-gray-400">{new Date(article.createdAt).toLocaleString()}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" data-testid={`button-share-curated-${article.id}`}>
                                  <Share2 className="w-4 h-4 text-gray-400" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-delete-curated-${article.id}`}
                                  onClick={() => void handleDeleteInsight(article.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-gray-400" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      <div className="px-2 py-2">
                        <div className="w-full overflow-x-auto flex justify-center">
                          <div className="inline-flex min-w-max items-center gap-1.5 rounded-full border border-[#b7ecea] bg-[#effcfb] px-2 py-2 sm:px-3">
                            <button
                              type="button"
                              onClick={() => setInsightPage(1)}
                              disabled={insightPage <= 1}
                              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#0f9f9b] hover:bg-[#dff6f5] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ChevronsLeft className="h-4 w-4" />
                              처음
                            </button>
                            <button
                              type="button"
                              onClick={() => setInsightPage((prev) => Math.max(1, prev - 1))}
                              disabled={insightPage <= 1}
                              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#0f9f9b] hover:bg-[#dff6f5] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="h-4 w-4" />
                              이전
                            </button>
                            {insightPageTokens.map((token, index) =>
                              token === PAGE_ELLIPSIS ? (
                                <span key={`insight-page-gap-${index}`} className="inline-flex h-9 min-w-8 items-center justify-center px-1 text-sm font-bold text-[#0f9f9b]">
                                  ...
                                </span>
                              ) : (
                                <button
                                  key={`insight-page-${token}`}
                                  type="button"
                                  onClick={() => setInsightPage(token)}
                                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-bold transition-colors ${
                                    token === insightPage
                                      ? 'bg-[#1cb5b0] text-white shadow-[0_6px_14px_rgba(28,181,176,0.35)]'
                                      : 'text-[#0f9f9b] hover:bg-[#dff6f5]'
                                  }`}
                                  aria-current={token === insightPage ? 'page' : undefined}
                                >
                                  {token}
                                </button>
                              ),
                            )}
                            <button
                              type="button"
                              onClick={() => setInsightPage((prev) => Math.min(totalInsightPages, prev + 1))}
                              disabled={insightPage >= totalInsightPages}
                              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#0f9f9b] hover:bg-[#dff6f5] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              다음
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setInsightPage(totalInsightPages)}
                              disabled={insightPage >= totalInsightPages}
                              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#0f9f9b] hover:bg-[#dff6f5] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              마지막
                              <ChevronsRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="space-y-3">
              {composedLoading ? (
                <div className="bg-white rounded-xl p-8 border border-gray-100 flex items-center justify-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  불러오는 중...
                </div>
              ) : composedArticles.length === 0 ? (
                <div className="bg-white rounded-xl p-8 border border-gray-100 text-center text-gray-500">
                  저장된 생성 기사가 없습니다.
                </div>
              ) : composedArticles.map((article) => (
                <div
                  key={article.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 group overflow-visible hover-elevate"
                  data-testid={`custom-article-${article.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Sparkles className="w-5 h-5 text-purple-500 mt-0.5" />
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="font-medium text-gray-800 line-clamp-1 text-left hover:underline"
                          data-testid={`text-custom-title-${article.id}`}
                          onClick={() => setExpandedComposedArticleId((prev) => (prev === article.id ? null : article.id))}
                        >
                          {article.generatedTitle}
                        </button>
                        <button
                          type="button"
                          className="mt-1 text-xs text-gray-500 line-clamp-2 text-left hover:text-gray-700"
                          onClick={() => setExpandedComposedArticleId((prev) => (prev === article.id ? null : article.id))}
                        >
                          {article.generatedSummary}
                        </button>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="text-xs text-gray-400">{new Date(article.createdAt).toLocaleString()}</p>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {article.status === 'published' ? '공개' : '임시저장'}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              article.submissionStatus === 'approved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : article.submissionStatus === 'rejected'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {article.submissionStatus === 'approved' ? '커뮤니티 승인' : article.submissionStatus === 'rejected' ? '반려' : '검증 대기'}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {article.sourceCategory || 'General'}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">
                            {article.sourceEmotion}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] text-gray-500 line-clamp-1">원문: {article.sourceTitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-view-custom-${article.id}`}
                        onClick={() => setExpandedComposedArticleId((prev) => (prev === article.id ? null : article.id))}
                      >
                        <Eye className="w-4 h-4 text-gray-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-edit-custom-${article.id}`}
                        onClick={() => handleStartEditComposed(article)}
                      >
                        <Edit className="w-4 h-4 text-gray-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-delete-custom-${article.id}`}
                        onClick={() => void (async () => {
                          const ok = await DBService.deleteUserComposedArticle(socialOwnerId, article.id);
                          if (ok) setComposedArticles((prev) => prev.filter((row) => row.id !== article.id));
                        })()}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                  {expandedComposedArticleId === article.id && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                      {editingComposedArticleId === article.id ? (
                        <>
                          <input
                            value={editingComposedTitle}
                            onChange={(e) => setEditingComposedTitle(e.target.value)}
                            className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                            placeholder="기사 제목"
                          />
                          <textarea
                            value={editingComposedContent}
                            onChange={(e) => setEditingComposedContent(e.target.value)}
                            className="w-full min-h-[220px] rounded-md border border-gray-300 bg-white p-3 text-sm leading-relaxed"
                            placeholder="기사 본문"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingComposedArticleId(null)}
                              disabled={savingComposedEdit}
                            >
                              취소
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void handleSaveComposedEdit()}
                              disabled={savingComposedEdit}
                            >
                              저장
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500">기사 전체 보기</p>
                          <p className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                            {article.generatedContent}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">프로필 설정</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                  <input
                    type="text"
                    value={userInfo.name}
                    onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    data-testid="input-name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                  <input
                    type="email"
                    value={userInfo.email}
                    onChange={(e) => setUserInfo({ ...userInfo, email: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    data-testid="input-email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">자기소개</label>
                  <textarea
                    value={userInfo.bio}
                    onChange={(e) => setUserInfo({ ...userInfo, bio: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                    data-testid="input-bio"
                  />
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-800">SNS 계정 연결 (목업)</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setSocialLoading(true);
                        try {
                          const loaded = await DBService.getUserSocialConnections(socialOwnerId);
                          setSocialConnections(loaded);
                          toast({ title: 'SNS 연결 정보 불러오기 완료' });
                        } catch {
                          toast({ title: 'SNS 연결 정보 불러오기 실패', variant: 'destructive' });
                        } finally {
                          setSocialLoading(false);
                        }
                      }}
                      disabled={socialLoading}
                    >
                      {socialLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '불러오기'}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    현재는 저장/복원 목업 단계입니다. 실제 OAuth 연동은 추후 확장 예정입니다.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Web 프로필 URL</label>
                      <input
                        type="text"
                        value={socialConnections.webUrl}
                        onChange={(e) => setSocialConnections({ ...socialConnections, webUrl: e.target.value })}
                        placeholder="https://example.com/me"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Instagram 계정</label>
                      <input
                        type="text"
                        value={socialConnections.instagramHandle}
                        onChange={(e) => setSocialConnections({ ...socialConnections, instagramHandle: e.target.value })}
                        placeholder="@your_instagram"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Threads 계정</label>
                      <input
                        type="text"
                        value={socialConnections.threadsHandle}
                        onChange={(e) => setSocialConnections({ ...socialConnections, threadsHandle: e.target.value })}
                        placeholder="@your_threads"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">YouTube 채널 URL</label>
                      <input
                        type="text"
                        value={socialConnections.youtubeChannelUrl}
                        onChange={(e) => setSocialConnections({ ...socialConnections, youtubeChannelUrl: e.target.value })}
                        placeholder="https://youtube.com/@yourchannel"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button onClick={handleSaveSocialConnections} disabled={socialSaving}>
                      {socialSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'SNS 연결 저장'}
                    </Button>
                  </div>
                </div>
                <GlassButton variant="primary" data-testid="button-save-settings">
                  <Heart className="w-4 h-4" />
                  저장하기
                </GlassButton>
                <Link href="/settings">
                  <Button variant="outline" className="w-full" data-testid="button-open-settings-page">
                    <Settings className="w-4 h-4 mr-2" />
                    설정 페이지 열기
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}


