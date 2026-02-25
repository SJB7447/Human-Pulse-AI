import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { DBService, type ApiHealthPayload, type UserComposedArticleRecord } from '@/services/DBService';
import { GeminiService } from '@/services/gemini';
import { centerCropToAspectRatioDataUrl } from '@/lib/imageCrop';
import { useEmotionStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  AlertTriangle,
  StickyNote,
  Pencil,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type AdminArticle = {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  image?: string | null;
  source?: string;
  category?: string;
  created_at?: string;
  createdAt?: string;
  emotion?: string;
  views?: number;
  saves?: number;
  is_published?: boolean;
  isPublished?: boolean;
  authorId?: string | null;
  author_id?: string | null;
  authorName?: string | null;
  author_name?: string | null;
};

type AdminTabKey = 'ops' | 'articles';
type AdminEmotionKey = 'vibrance' | 'immersion' | 'clarity' | 'gravity' | 'serenity' | 'spectrum';

const ADMIN_EMOTION_OPTIONS: AdminEmotionKey[] = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'];
const ADMIN_CATEGORY_PRESETS: Record<AdminEmotionKey, string[]> = {
  vibrance: ['연예·미담', '문화·콘텐츠', '축제·행사', '스포츠 하이라이트'],
  immersion: ['정치·속보', '공적 논쟁', '사회 갈등', '정책 충돌'],
  clarity: ['경제·분석', '산업·기술', '정책 해설', '데이터 리포트'],
  gravity: ['사건·재난', '범죄·수사', '사회 안전', '리스크 분석'],
  serenity: ['웰빙·커뮤니티', '환경·기후', '건강·생활', '회복·돌봄'],
  spectrum: ['균형·다양성', '정책·산업·사회', '균형 브리핑'],
};
const ARTICLES_PER_PAGE = 10;
const PAGE_ELLIPSIS = 'ellipsis';
type PageToken = number | typeof PAGE_ELLIPSIS;

type AdminStatsPayload = {
  stats?: {
    totalViews?: number;
    totalSaves?: number;
    activeUsers?: number;
    articlesPublished?: number;
    publishedCount?: number;
    hiddenCount?: number;
    issueCount?: number;
    reviewCompletedCount?: number;
    reviewPendingCount?: number;
    reviewSlaTargetHours?: number;
    reviewSlaMetCount?: number;
    reviewSlaMetRate?: number;
  };
  emotionStats?: Array<{ emotion: string; count: number; percentage: number }>;
  topArticles?: Array<{ id: string; title: string; views?: number }>;
  aiDraftOps?: {
    promptVersion?: string;
    startedAt?: string;
    updatedAt?: string;
    totals?: {
      requests?: number;
      success?: number;
      retries?: number;
      fallbackRecoveries?: number;
      parseFailures?: number;
      schemaBlocks?: number;
      similarityBlocks?: number;
      complianceBlocks?: number;
      modelEmpty?: number;
    };
    byMode?: {
      draft?: {
        requests?: number;
        success?: number;
        retries?: number;
      };
      'interactive-longform'?: {
        requests?: number;
        success?: number;
        retries?: number;
      };
    };
  };
  aiNewsOps?: {
    version?: string;
    startedAt?: string;
    updatedAt?: string;
    totals?: {
      requests?: number;
      success?: number;
      fallbackRecoveries?: number;
      parseFailures?: number;
      qualityBlocks?: number;
      modelEmpty?: number;
      rssFallbacks?: number;
    };
    byEmotion?: Record<string, {
      requests?: number;
      success?: number;
      fallbackRecoveries?: number;
      qualityBlocks?: number;
    }>;
  };
  aiNewsSettings?: {
    source?: 'env' | 'admin';
    updatedAt?: string;
    hydrated?: boolean;
    values?: {
      modelTimeoutMs?: number;
    };
  };
};

type ReviewState = {
  completed: boolean;
  issues: string[];
  memo: string;
  updatedAt: string;
};

type AdminReviewPayload = {
  articleId: string;
  completed?: boolean;
  issues?: string[];
  memo?: string;
  updatedAt?: string;
};

type ReportStatus = 'reported' | 'in_review' | 'resolved' | 'rejected';
type ReportSanction = 'none' | 'hide_article' | 'delete_article' | 'warn_author';
type ExportFormat = 'excel' | 'pdf';
type ExportJob = {
  id: string;
  format: ExportFormat;
  mode: 'manual' | 'scheduled';
  status: 'success' | 'failed';
  createdAt: string;
  completedAt: string;
  summary: {
    articleCount: number;
    reviewedCount: number;
    issueCount: number;
    hiddenCount: number;
  };
  error?: string;
};
type ExportSchedule = {
  enabled: boolean;
  intervalMinutes: number;
  formats: ExportFormat[];
  lastRunAt: string | null;
  nextRunAt: string | null;
};
type OpsAlert = {
  id: string;
  type: 'failure_rate' | 'latency' | 'ai_error';
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  metric: {
    value: number;
    threshold: number;
    unit: '%' | 'ms' | 'count';
    windowMinutes: number;
  };
  createdAt: string;
};
type OpsAlertSummary = {
  windowMinutes: number;
  failureRate: number;
  p95LatencyMs: number;
  aiErrorCount: number;
  criticalCount: number;
  warningCount: number;
  alertCount: number;
};

type AdminReportPayload = {
  id: string;
  articleId: string;
  reason: string;
  details?: string | null;
  riskScore?: number;
  status?: ReportStatus;
  sanctionType?: ReportSanction;
  resolution?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
};

type ArticleIssueAnalysis = {
  severity: 'low' | 'medium' | 'high';
  issues: string[];
  suggestions: string[];
};

const ARTICLE_META_OPEN = '<!-- HUEBRIEF_META_START -->';
const ARTICLE_META_CLOSE = '<!-- HUEBRIEF_META_END -->';

function stripArticleMetaForEditor(content: string | null | undefined): string {
  return String(content || '')
    .replace(new RegExp(`${ARTICLE_META_OPEN}[\\s\\S]*?${ARTICLE_META_CLOSE}\\s*`, 'g'), '')
    .trim();
}

function extractArticleMetaBlock(content: string | null | undefined): string {
  const text = String(content || '');
  const regex = new RegExp(`${ARTICLE_META_OPEN}[\\s\\S]*?${ARTICLE_META_CLOSE}`, 'g');
  const match = text.match(regex);
  return match?.[0] || '';
}

function mergeContentWithExistingMeta(originalContent: string | null | undefined, editedPlainText: string): string {
  const plain = String(editedPlainText || '').trim();
  const metaBlock = extractArticleMetaBlock(originalContent);
  if (!metaBlock) return plain;
  return `${metaBlock}\n\n${plain}`;
}

function getEmotionColor(emotion: string): string {
  const colors: Record<string, string> = {
    vibrance: '#ffd150',
    immersion: '#f4606b',
    clarity: '#3f65ef',
    gravity: '#adadad',
    serenity: '#88d84a',
    spectrum: '#00abaf',
    default: '#999898',
  };
  return colors[(emotion || '').toLowerCase()] || colors.default;
}

function normalizeAdminEmotion(value: string | undefined): AdminEmotionKey {
  const key = String(value || '').trim().toLowerCase();
  return ADMIN_EMOTION_OPTIONS.includes(key as AdminEmotionKey) ? (key as AdminEmotionKey) : 'spectrum';
}

function getCategoryPresetForEmotion(emotion: string | undefined): string[] {
  return ADMIN_CATEGORY_PRESETS[normalizeAdminEmotion(emotion)];
}

function isAiGeneratedCategory(value: string | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('ai generated') ||
    normalized.includes('ai-generated') ||
    normalized.includes('ai 생성')
  );
}

function getCategoryFieldLabel(emotion: string | undefined, category: string | undefined): string {
  const preset = getCategoryPresetForEmotion(emotion)[0];
  if (preset) return preset;
  const label = String(category || '').trim();
  if (label && !isAiGeneratedCategory(label)) return label;
  return '분야 미지정';
}

function analyzeArticle(article: AdminArticle): ArticleIssueAnalysis {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const titleLength = (article.title || '').trim().length;
  const summaryLength = (article.summary || '').trim().length;
  const contentLength = (article.content || '').trim().length;
  const source = (article.source || '').trim();
  const views = Number(article.views || 0);
  const saves = Number(article.saves || 0);
  const saveRate = views > 0 ? saves / views : 0;
  const isPublished = getArticlePublished(article);

  if (titleLength < 12) {
    issues.push('제목 길이가 짧아 클릭 유입에 불리할 수 있습니다.');
    suggestions.push('핵심 키워드를 포함한 18~35자 제목을 권장합니다.');
  }
  if (summaryLength < 40) {
    issues.push('요약문이 짧거나 비어 있어 기사 맥락 전달이 약합니다.');
    suggestions.push('요약문을 40자 이상으로 보강해 맥락을 명확히 해주세요.');
  }
  if (contentLength > 0 && contentLength < 200) {
    issues.push('본문 분량이 짧아 검증 및 몰입 흐름이 약해질 수 있습니다.');
    suggestions.push('근거 문장과 마무리 문장을 추가해 본문을 확장해 주세요.');
  }
  if (!source || source === 'Unknown') {
    issues.push('출처 정보가 부족합니다.');
    suggestions.push('원문 URL 또는 신뢰 가능한 출처명을 입력해 주세요.');
  }
  if (!isPublished) {
    issues.push('현재 숨김 상태 기사입니다.');
    suggestions.push('검수 후 게시 상태로 전환해 주세요.');
  }
  if (views < 10) {
    issues.push('조회수가 매우 낮습니다.');
    suggestions.push('제목/감정 카테고리/요약문 개선으로 유입을 높여보세요.');
  }
  if (views > 0 && saveRate < 0.02) {
    issues.push('조회수 대비 저장 비율이 낮습니다.');
    suggestions.push('기사 말미에 핵심 인사이트와 행동 유도 문구를 강화해 보세요.');
  }

  const severity: ArticleIssueAnalysis['severity'] =
    issues.length >= 5 ? 'high' : issues.length >= 3 ? 'medium' : 'low';

  return { severity, issues, suggestions };
}

function toReviewState(payload: AdminReviewPayload): ReviewState {
  return {
    completed: Boolean(payload.completed),
    issues: Array.isArray(payload.issues) ? payload.issues.filter((v) => typeof v === 'string') : [],
    memo: typeof payload.memo === 'string' ? payload.memo : '',
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

function buildReviewMap(rows: AdminReviewPayload[]): Record<string, ReviewState> {
  const map: Record<string, ReviewState> = {};
  for (const row of rows || []) {
    if (!row?.articleId) continue;
    map[row.articleId] = toReviewState(row);
  }
  return map;
}

function getArticlePublished(article: AdminArticle): boolean {
  if (typeof article.isPublished === 'boolean') return article.isPublished;
  if (typeof article.is_published === 'boolean') return article.is_published;
  return true;
}

function getArticleCreatedAt(article: AdminArticle): string | undefined {
  return article.created_at || article.createdAt;
}

function normalizeAdminArticle(raw: any): AdminArticle {
  const normalizedPublished =
    typeof raw?.isPublished === 'boolean'
      ? raw.isPublished
      : typeof raw?.is_published === 'boolean'
        ? raw.is_published
        : true;

  return {
    ...raw,
    created_at: raw?.created_at || raw?.createdAt,
    is_published: normalizedPublished,
    isPublished: normalizedPublished,
  } as AdminArticle;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('ops');
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [stats, setStats] = useState<AdminStatsPayload | null>(null);
  const [reviewMap, setReviewMap] = useState<Record<string, ReviewState>>({});
  const [reports, setReports] = useState<AdminReportPayload[]>([]);
  const [readerArticles, setReaderArticles] = useState<UserComposedArticleRecord[]>([]);
  const [expandedReaderArticleId, setExpandedReaderArticleId] = useState<string | null>(null);
  const [exportHistory, setExportHistory] = useState<ExportJob[]>([]);
  const [exportSchedule, setExportSchedule] = useState<ExportSchedule>({
    enabled: false,
    intervalMinutes: 60,
    formats: ['excel', 'pdf'],
    lastRunAt: null,
    nextRunAt: null,
  });
  const [opsAlerts, setOpsAlerts] = useState<OpsAlert[]>([]);
  const [opsAlertSummary, setOpsAlertSummary] = useState<OpsAlertSummary | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealthPayload | null>(null);
  const [triggeringAlertTest, setTriggeringAlertTest] = useState(false);
  const [aiNewsTimeoutMs, setAiNewsTimeoutMs] = useState<number>(24000);
  const [savingAiNewsSettings, setSavingAiNewsSettings] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<AdminArticle | null>(null);
  const [editingEmotion, setEditingEmotion] = useState<AdminEmotionKey>('spectrum');
  const [editingCategory, setEditingCategory] = useState<string>('');
  const [savingClassification, setSavingClassification] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingSummary, setEditingSummary] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [editingSource, setEditingSource] = useState('');
  const [editingImage, setEditingImage] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [isGeneratingEditImage, setIsGeneratingEditImage] = useState(false);
  const [savingArticleContent, setSavingArticleContent] = useState(false);
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());
  const [articleEmotionFilter, setArticleEmotionFilter] = useState<string>('all');
  const [articleSearchQuery, setArticleSearchQuery] = useState('');
  const [articlePage, setArticlePage] = useState(1);
  const [headerHeightPx, setHeaderHeightPx] = useState(87);
  const [opsAnchorHeightPx, setOpsAnchorHeightPx] = useState(96);
  const showOpsTab = activeTab === 'ops';
  const showArticlesTab = activeTab === 'articles';
  const opsKpiRef = useRef<HTMLDivElement | null>(null);
  const opsChartRef = useRef<HTMLDivElement | null>(null);
  const opsOpsRef = useRef<HTMLDivElement | null>(null);
  const opsAiRef = useRef<HTMLDivElement | null>(null);
  const opsAnchorBarRef = useRef<HTMLDivElement | null>(null);
  const editImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useEmotionStore();

  const fetchData = async () => {
    try {
      setLoading(true);
      const baseHealth = await DBService.getApiHealth().catch(() => null);
      setApiHealth((baseHealth || null) as ApiHealthPayload | null);

      const settled = await Promise.allSettled([
        DBService.getAdminDashboardData(),
        DBService.getAdminStats(),
        DBService.getAdminReviews(),
        DBService.getAdminReports(),
        DBService.getAdminReaderArticles(),
        DBService.getAdminExportHistory(10),
        DBService.getAdminExportSchedule(),
        DBService.getAdminAlerts(8),
        DBService.getAdminAlertSummary(),
      ]);
      const [
        articlesResult,
        statsResult,
        reviewsResult,
        reportsResult,
        readerArticlesResult,
        exportHistoryResult,
        exportScheduleResult,
        opsAlertsResult,
        opsAlertSummaryResult,
      ] = settled;

      const rejected = settled.filter((entry): entry is PromiseRejectedResult => entry.status === 'rejected');
      const authRejection = rejected.find((entry) => {
        const status = (entry.reason as any)?.status;
        return status === 401 || status === 403;
      });

      if (authRejection) {
        toast({
          title: '로그인이 필요합니다',
          description: '관리자 화면 접근을 위해 로그인해 주세요.',
          variant: 'destructive',
        });
        setLocation(`/login?redirect=${encodeURIComponent('/admin')}`);
        return;
      }

      const articlesData = articlesResult.status === 'fulfilled' ? articlesResult.value : [];
      const statsData = statsResult.status === 'fulfilled' ? statsResult.value : null;
      const reviewsData = reviewsResult.status === 'fulfilled' ? reviewsResult.value : [];
      const reportsData = reportsResult.status === 'fulfilled' ? reportsResult.value : [];
      const readerArticlesData = readerArticlesResult.status === 'fulfilled' ? readerArticlesResult.value : [];
      const exportHistoryData = exportHistoryResult.status === 'fulfilled' ? exportHistoryResult.value : [];
      const exportScheduleData = exportScheduleResult.status === 'fulfilled' ? exportScheduleResult.value : exportSchedule;
      const opsAlertsData = opsAlertsResult.status === 'fulfilled' ? opsAlertsResult.value : [];
      const opsAlertSummaryData = opsAlertSummaryResult.status === 'fulfilled' ? opsAlertSummaryResult.value : null;

      setArticles(((articlesData || []) as any[]).map(normalizeAdminArticle));
      setStats((statsData || null) as AdminStatsPayload | null);
      setReviewMap(buildReviewMap((reviewsData || []) as AdminReviewPayload[]));
      setReports(((reportsData || []) as AdminReportPayload[]).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
      setReaderArticles(((readerArticlesData || []) as UserComposedArticleRecord[]).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
      setExportHistory((exportHistoryData || []) as ExportJob[]);
      setExportSchedule((exportScheduleData || exportSchedule) as ExportSchedule);
      setOpsAlerts((opsAlertsData || []) as OpsAlert[]);
      setOpsAlertSummary((opsAlertSummaryData || null) as OpsAlertSummary | null);
      const timeoutFromStats = Number((statsData as AdminStatsPayload | null)?.aiNewsSettings?.values?.modelTimeoutMs ?? 24000);
      setAiNewsTimeoutMs(Number.isFinite(timeoutFromStats) ? timeoutFromStats : 24000);

      if (rejected.length > 0) {
        const healthAfterFailure = await DBService.getApiHealth().catch(() => null);
        setApiHealth((healthAfterFailure || baseHealth || null) as ApiHealthPayload | null);
        if ((healthAfterFailure as ApiHealthPayload | null)?.mode === 'fallback') {
          toast({
            title: 'Fallback 모드 감지',
            description: '일부 관리자 API가 제한되어 기본 데이터만 표시됩니다. 상단 API 상태를 확인해 주세요.',
          });
        } else {
          toast({
            title: '일부 데이터 로딩 실패',
            description: '일부 운영 패널이 비어 있을 수 있습니다. 새로고침 후 다시 확인해 주세요.',
          });
        }
      }
    } catch (error: any) {
      toast({
        title: '오류',
        description: error?.message || '관리자 데이터를 불러오지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setLocation(`/login?redirect=${encodeURIComponent('/admin')}`);
      return;
    }
    fetchData();
  }, [user]);

  useEffect(() => {
    setSelectedArticleIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(articles.map((article) => article.id));
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [articles]);

  const articleEmotionOptions = useMemo(() => {
    const options = new Set<string>();
    for (const article of articles) {
      const emotion = (article.emotion || '').trim().toLowerCase();
      if (emotion) options.add(emotion);
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [articles]);

  const filteredArticles = useMemo(() => {
    const keyword = articleSearchQuery.trim().toLowerCase();
    return articles.filter((article) => {
      const emotion = (article.emotion || '').trim().toLowerCase();
      if (articleEmotionFilter !== 'all' && emotion !== articleEmotionFilter) return false;

      if (!keyword) return true;
      const haystack = [
        article.title || '',
        article.summary || '',
        article.source || '',
        article.id || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [articles, articleEmotionFilter, articleSearchQuery]);

  const filteredArticleIdSet = useMemo(() => new Set(filteredArticles.map((article) => article.id)), [filteredArticles]);
  const pagedArticles = useMemo(() => {
    const start = (articlePage - 1) * ARTICLES_PER_PAGE;
    return filteredArticles.slice(start, start + ARTICLES_PER_PAGE);
  }, [filteredArticles, articlePage]);
  const totalArticlePages = Math.max(1, Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE));
  const articlePageTokens = useMemo<PageToken[]>(() => {
    if (totalArticlePages <= 7) {
      return Array.from({ length: totalArticlePages }, (_, index) => index + 1);
    }
    const start = Math.max(2, articlePage - 1);
    const end = Math.min(totalArticlePages - 1, articlePage + 1);
    const tokens: PageToken[] = [1];
    if (start > 2) tokens.push(PAGE_ELLIPSIS);
    for (let page = start; page <= end; page += 1) {
      tokens.push(page);
    }
    if (end < totalArticlePages - 1) tokens.push(PAGE_ELLIPSIS);
    tokens.push(totalArticlePages);
    return tokens;
  }, [articlePage, totalArticlePages]);
  const currentPageIdSet = useMemo(() => new Set(pagedArticles.map((article) => article.id)), [pagedArticles]);

  useEffect(() => {
    if (!selectedArticle) return;
    setEditingEmotion(normalizeAdminEmotion(selectedArticle.emotion));
    setEditingCategory(String(selectedArticle.category || '').trim());
    setEditingTitle(String(selectedArticle.title || ''));
    setEditingSummary(String(selectedArticle.summary || ''));
    setEditingContent(stripArticleMetaForEditor(selectedArticle.content));
    setEditingSource(String(selectedArticle.source || ''));
    setEditingImage(String(selectedArticle.image || ''));
  }, [selectedArticle]);

  useEffect(() => {
    setArticlePage(1);
  }, [articleEmotionFilter, articleSearchQuery]);

  useEffect(() => {
    if (articlePage <= totalArticlePages) return;
    setArticlePage(totalArticlePages);
  }, [articlePage, totalArticlePages]);

  useEffect(() => {
    let observer: ResizeObserver | null = null;
    let headerElement: HTMLElement | null = null;
    const fallbackHeight = () => (window.innerWidth >= 768 ? 67 : 99);

    const updateHeaderHeight = () => {
      if (!headerElement) {
        headerElement = document.getElementById('app-header') as HTMLElement | null;
      }
      if (!headerElement) {
        setHeaderHeightPx(fallbackHeight());
        return;
      }
      const measured = Math.ceil(headerElement.getBoundingClientRect().height || 0);
      setHeaderHeightPx(measured > 0 ? measured : fallbackHeight());
    };

    const connectObserver = () => {
      headerElement = document.getElementById('app-header') as HTMLElement | null;
      if (!headerElement || typeof ResizeObserver === 'undefined') return;
      observer = new ResizeObserver(updateHeaderHeight);
      observer.observe(headerElement);
    };

    const rafId = window.requestAnimationFrame(() => {
      updateHeaderHeight();
      connectObserver();
    });

    window.addEventListener('resize', updateHeaderHeight);
    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, [loading]);

  useEffect(() => {
    const anchorElement = opsAnchorBarRef.current;
    if (!anchorElement || !showOpsTab) return;

    const updateAnchorHeight = () => {
      const measured = Math.ceil(anchorElement.getBoundingClientRect().height || 0);
      setOpsAnchorHeightPx(measured > 0 ? measured : 96);
    };

    updateAnchorHeight();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateAnchorHeight);
      observer.observe(anchorElement);
    }
    window.addEventListener('resize', updateAnchorHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateAnchorHeight);
    };
  }, [showOpsTab]);

  const applyLocalArticlePatch = (articleId: string, patch: Partial<AdminArticle>) => {
    setArticles((prev) => prev.map((article) => (article.id === articleId ? normalizeAdminArticle({ ...article, ...patch }) : article)));
    setSelectedArticle((prev) => (prev && prev.id === articleId ? normalizeAdminArticle({ ...prev, ...patch }) : prev));
  };

  const handleSaveArticleClassification = async () => {
    if (!selectedArticle) return;
    const nextEmotion = normalizeAdminEmotion(editingEmotion);
    const nextCategory = String(editingCategory || '').trim() || getCategoryPresetForEmotion(nextEmotion)[0] || 'General';

    try {
      setSavingClassification(true);
      await DBService.updateArticle(selectedArticle.id, {
        emotion: nextEmotion,
        category: nextCategory,
      });
      applyLocalArticlePatch(selectedArticle.id, { emotion: nextEmotion, category: nextCategory });
      toast({
        title: '카테고리 업데이트 완료',
        description: `감정 ${nextEmotion.toUpperCase()} / 카테고리 ${nextCategory}로 저장했습니다.`,
      });
    } catch (error: any) {
      toast({
        title: '카테고리 업데이트 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingClassification(false);
    }
  };

  const handleSaveArticleContent = async () => {
    if (!selectedArticle) return;
    const nextTitle = String(editingTitle || '').trim();
    const nextSummary = String(editingSummary || '').trim();
    const nextContent = String(editingContent || '').trim();
    const nextContentWithMeta = mergeContentWithExistingMeta(selectedArticle.content, nextContent);
    const nextSource = String(editingSource || '').trim();
    const nextImage = String(editingImage || '').trim();

    if (!nextTitle) {
      toast({
        title: '기사 수정 실패',
        description: '제목은 비워둘 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSavingArticleContent(true);
      const updated = await DBService.updateArticle(selectedArticle.id, {
        title: nextTitle,
        summary: nextSummary || nextTitle,
        content: nextContentWithMeta,
        source: nextSource || 'Unknown',
        image: nextImage || null,
      });
      applyLocalArticlePatch(selectedArticle.id, normalizeAdminArticle(updated));
      toast({
        title: '기사 수정 완료',
        description: '제목/요약/본문/출처/이미지가 저장되었습니다.',
      });
    } catch (error: any) {
      toast({
        title: '기사 수정 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingArticleContent(false);
    }
  };

  const handleSelectEditImageFile = () => {
    editImageFileInputRef.current?.click();
  };

  const handleEditImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: '이미지 파일만 업로드할 수 있습니다.', variant: 'destructive' });
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) {
        toast({ title: '이미지 읽기에 실패했습니다.', variant: 'destructive' });
        return;
      }
      setEditingImage(dataUrl);
      toast({ title: '이미지 업로드 완료' });
    };
    reader.onerror = () => {
      toast({ title: '이미지 업로드 실패', description: '파일을 다시 선택해 주세요.', variant: 'destructive' });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleGenerateEditImage = async () => {
    const articleSeed = String(editingContent || editingSummary || editingTitle || '').trim();
    if (!articleSeed) {
      toast({ title: '기사 내용이 필요합니다.', description: '제목 또는 본문을 먼저 입력해 주세요.', variant: 'destructive' });
      return;
    }

    setIsGeneratingEditImage(true);
    try {
      const promptSpec = JSON.stringify({
        language: 'en',
        task: 'news_editorial_image',
        directive: `Generate a representative editorial image for: ${editingTitle || 'news article'}`,
        hard_constraints: [
          'No text overlay',
          'No watermark',
          'No logo',
          '16:9 composition',
        ],
        output: {
          aspect_ratio: '16:9',
          style: 'photorealistic editorial',
        },
      }, null, 2);

      const result = await GeminiService.generateImage(articleSeed, 1, promptSpec);
      const nextImageRaw = String(result?.images?.[0]?.url || '').trim();
      if (!nextImageRaw) {
        toast({ title: 'AI 이미지 생성 실패', description: '생성된 이미지가 없습니다.', variant: 'destructive' });
        return;
      }
      const croppedImage = await centerCropToAspectRatioDataUrl(nextImageRaw, 16, 9);
      setEditingImage(croppedImage || nextImageRaw);
      const observed = String(result?.images?.[0]?.aspectRatioObserved || '').trim();
      const model = String(result?.model || '').trim();
      toast({
        title: 'AI 이미지 생성 완료',
        description: observed ? `모델: ${model || 'unknown'} · 실제 비율: ${observed}` : undefined,
      });
    } catch (error: any) {
      const detail = String(error?.detail || '').trim();
      const retryAfter = Number(error?.retryAfterSeconds || 0);
      const extra = retryAfter > 0 ? ` ${retryAfter}초 후 재시도해 주세요.` : '';
      toast({
        title: 'AI 이미지 생성 실패',
        description: detail || `${error?.message || '잠시 후 다시 시도해 주세요.'}${extra}`,
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingEditImage(false);
    }
  };

  const handleRemoveEditImage = () => {
    setEditingImage('');
    toast({ title: '이미지를 제거했습니다.', description: '기사 수정 저장 시 이미지가 삭제됩니다.' });
  };

  const handleScrollToOpsSection = (section: 'kpi' | 'chart' | 'ops' | 'ai') => {
    setActiveTab('ops');
    const targetRef =
      section === 'kpi'
        ? opsKpiRef
        : section === 'chart'
          ? opsChartRef
          : section === 'ops'
            ? opsOpsRef
            : opsAiRef;
    window.setTimeout(() => {
      const targetElement = targetRef.current;
      if (!targetElement) return;
      const stickyOffset = headerHeightPx + opsAnchorHeightPx + 10;
      const top = targetElement.getBoundingClientRect().top + window.scrollY - stickyOffset;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 50);
  };

  const handleHide = async (id: string, currentStatus: boolean) => {
    const confirmMsg = currentStatus
      ? '이 기사를 숨김 처리하시겠습니까?'
      : '이 기사를 다시 공개 처리하시겠습니까?';
    if (!confirm(confirmMsg)) return;

    try {
      await DBService.updateArticle(id, { isPublished: !currentStatus });
      toast({
        title: '상태 변경 완료',
        description: !currentStatus ? '기사가 공개 상태로 변경되었습니다.' : '기사가 숨김 상태로 변경되었습니다.',
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: '상태 변경 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 기사를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.')) return;
    try {
      await DBService.deleteArticle(id);
      toast({ title: '삭제 완료', description: '기사가 삭제되었습니다.' });
      fetchData();
    } catch (error: any) {
      toast({
        title: '삭제 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const toggleArticleSelection = (articleId: string) => {
    setSelectedArticleIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  };

  const toggleSelectAllArticles = (checked: boolean) => {
    setSelectedArticleIds((prev) => {
      const next = new Set(prev);
      for (const article of pagedArticles) {
        if (checked) next.add(article.id);
        else next.delete(article.id);
      }
      return next;
    });
  };

  const handleBatchAction = async (action: 'hide' | 'publish' | 'review_complete' | 'delete') => {
    const ids = Array.from(selectedArticleIds).filter((id) => filteredArticleIdSet.has(id));
    if (ids.length === 0) return;

    const actionLabel =
      action === 'hide'
        ? '숨김 처리'
        : action === 'publish'
          ? '게시 처리'
          : action === 'review_complete'
            ? '검수 완료'
            : '삭제';
    const confirmMessage = `선택한 기사 ${ids.length}건을 일괄 ${actionLabel} 하시겠습니까?`;
    if (!confirm(confirmMessage)) return;

    try {
      if (action === 'hide') {
        await Promise.all(ids.map((id) => DBService.updateArticle(id, { isPublished: false })));
      } else if (action === 'publish') {
        await Promise.all(ids.map((id) => DBService.updateArticle(id, { isPublished: true })));
      } else if (action === 'review_complete') {
        await Promise.all(ids.map((id) => DBService.upsertAdminReview(id, { completed: true })));
      } else {
        await Promise.all(ids.map((id) => DBService.deleteArticle(id)));
      }

      toast({
        title: '일괄 처리 완료',
        description: `${ids.length}건 ${actionLabel}를 완료했습니다.`,
      });
      setSelectedArticleIds(new Set());
      await fetchData();
    } catch (error: any) {
      toast({
        title: '일괄 처리 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleManualUpdateConfirmed = async () => {
    setCrawling(true);
    try {
      const res = await fetch('/api/admin/news/fetch', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || '뉴스 수집 실패');

      toast({
        title: '수집 완료',
        description: `저장 ${result?.stats?.saved ?? 0}건 / 중복 ${result?.stats?.skipped ?? 0}건 / 실패 ${result?.stats?.failed ?? 0}건`,
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: '수집 실패',
        description: error?.message || '뉴스 수집 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setCrawling(false);
    }
  };

  const mergeReviewState = (articleId: string, payload: AdminReviewPayload) => {
    setReviewMap((prev) => ({
      ...prev,
      [articleId]: toReviewState(payload),
    }));
  };

  const handleMarkReviewComplete = async (articleId: string) => {
    const currentCompleted = Boolean(reviewMap[articleId]?.completed);
    try {
      const updated = await DBService.upsertAdminReview(articleId, { completed: !currentCompleted });
      mergeReviewState(articleId, updated);
      toast({ title: '검수 상태 업데이트', description: '검수완료 상태가 반영되었습니다.' });
    } catch (error: any) {
      toast({
        title: '검수 상태 업데이트 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleIssueRegister = async (article: AdminArticle) => {
    const reason = prompt('등록할 이슈 내용을 입력해 주세요.', '내용 검수 필요');
    if (!reason || !reason.trim()) return;

    try {
      const created = await DBService.createAdminReport(article.id, reason.trim());
      if (created) {
        setReports((prev) => [created as AdminReportPayload, ...prev]);
      }
    } catch {
      // report API 실패 시에도 리뷰 이슈 저장은 계속 진행
    }

    try {
      const updated = await DBService.addAdminReviewIssue(article.id, reason.trim());
      mergeReviewState(article.id, updated);
      toast({ title: '이슈 등록 완료', description: '해당 기사에 이슈가 추가되었습니다.' });
    } catch (error: any) {
      toast({
        title: '이슈 등록 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const persistReviewIssues = async (articleId: string, issues: string[], successMessage: string) => {
    try {
      const updated = await DBService.upsertAdminReview(articleId, { issues });
      mergeReviewState(articleId, updated);
      toast({ title: '이슈 업데이트 완료', description: successMessage });
    } catch (error: any) {
      toast({
        title: '이슈 업데이트 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleIssueEdit = async (articleId: string, issueIndex: number) => {
    const currentIssues = reviewMap[articleId]?.issues || [];
    const currentIssue = currentIssues[issueIndex];
    if (!currentIssue) return;

    const nextIssue = prompt('이슈 내용을 수정해 주세요.', currentIssue);
    if (nextIssue === null) return;

    const trimmed = nextIssue.trim();
    if (!trimmed) {
      toast({
        title: '이슈 수정 실패',
        description: '이슈 내용은 비워둘 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const updatedIssues = [...currentIssues];
    updatedIssues[issueIndex] = trimmed;
    await persistReviewIssues(articleId, updatedIssues, '이슈 내용이 수정되었습니다.');
  };

  const handleIssueDelete = async (articleId: string, issueIndex: number) => {
    const currentIssues = reviewMap[articleId]?.issues || [];
    const targetIssue = currentIssues[issueIndex];
    if (!targetIssue) return;
    if (!confirm('이 이슈를 삭제하시겠습니까?')) return;

    const updatedIssues = currentIssues.filter((_, idx) => idx !== issueIndex);
    await persistReviewIssues(articleId, updatedIssues, '이슈가 삭제되었습니다.');
  };

  const handleMemoSave = async (article: AdminArticle) => {
    const current = reviewMap[article.id]?.memo || '';
    const next = prompt('담당자 메모를 입력해 주세요.', current);
    if (next === null) return;

    try {
      const updated = await DBService.upsertAdminReview(article.id, { memo: next.trim() });
      mergeReviewState(article.id, updated);
      toast({ title: '메모 저장 완료', description: '담당자 메모가 저장되었습니다.' });
    } catch (error: any) {
      toast({
        title: '메모 저장 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const exportToExcel = async () => {
    const XLSX = await import('xlsx');
    const articleRows = articles.map((item) => {
      const review = reviewMap[item.id];
      return {
        ID: item.id,
        감정: item.emotion || '-',
        카테고리: item.category || '-',
        제목: item.title,
        출처: item.source || 'Unknown',
        날짜: getArticleCreatedAt(item) ? new Date(getArticleCreatedAt(item) as string).toLocaleDateString() : '-',
        요약: item.summary || 'N/A',
        상태: getArticlePublished(item) ? '게시중' : '숨김',
        조회수: item.views || 0,
        저장수: item.saves || 0,
        검수완료: review?.completed ? '완료' : '미완료',
        이슈수: review?.issues?.length || 0,
        담당자메모: review?.memo || '',
      };
    });

    const statsRows = [
      { 항목: '게시 기사', 값: String(topStats.publishedCount ?? topStats.articlesPublished ?? summary.publishedCount) },
      { 항목: '숨김 기사', 값: String(topStats.hiddenCount ?? summary.hiddenCount) },
      { 항목: '등록된 이슈', 값: String(topStats.issueCount ?? summary.issueCount) },
      { 항목: '검수 완료', 값: String(topStats.reviewCompletedCount ?? summary.reviewedCount) },
      { 항목: '검수 대기', 값: String(topStats.reviewPendingCount ?? summary.reviewPendingCount) },
      { 항목: '검수 SLA(%)', 값: String(topStats.reviewSlaMetRate ?? summary.reviewSlaMetRate) },
      { 항목: '전체 조회수', 값: String(topStats.totalViews ?? summary.totalViews) },
      { 항목: '전체 저장수', 값: String(topStats.totalSaves ?? summary.totalSaves) },
      { 항목: 'AI 기사 생성 요청', 값: String(draftOpsStats.requests ?? 0) },
      { 항목: 'AI 기사 생성 성공', 값: String(draftOpsStats.success ?? 0) },
      { 항목: 'AI 감정뉴스 요청', 값: String(newsOpsStats.requests ?? 0) },
      { 항목: 'AI 감정뉴스 성공', 값: String(newsOpsStats.success ?? 0) },
      { 항목: 'AI 감정뉴스 Fallback', 값: String(newsOpsStats.fallbackRecoveries ?? 0) },
    ];

    const wsArticles = XLSX.utils.json_to_sheet(articleRows);
    const wsStats = XLSX.utils.json_to_sheet(statsRows);

    const aiOpsRows = (['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'] as const).map((emotion) => {
      const row = newsOpsByEmotion?.[emotion] || {};
      return {
        감정: emotion.toUpperCase(),
        요청: row.requests ?? 0,
        성공: row.success ?? 0,
        Fallback: row.fallbackRecoveries ?? 0,
      };
    });
    const wsAiOps = XLSX.utils.json_to_sheet(aiOpsRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsArticles, 'Articles');
    XLSX.utils.book_append_sheet(wb, wsStats, 'Stats');
    XLSX.utils.book_append_sheet(wb, wsAiOps, 'AI-News-Ops');
    XLSX.writeFile(wb, 'human-pulse-admin-data.xlsx');
  };

  const exportToPDF = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Human Pulse AI - Admin Report', 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

    autoTable(doc, {
      head: [['Metric', 'Value']],
      body: [
        ['Published Articles', String(topStats.publishedCount ?? topStats.articlesPublished ?? summary.publishedCount)],
        ['Hidden Articles', String(topStats.hiddenCount ?? summary.hiddenCount)],
        ['Issue Count', String(topStats.issueCount ?? summary.issueCount)],
        ['Review Completed', String(topStats.reviewCompletedCount ?? summary.reviewedCount)],
        ['Review Pending', String(topStats.reviewPendingCount ?? summary.reviewPendingCount)],
        ['Review SLA (%)', String(topStats.reviewSlaMetRate ?? summary.reviewSlaMetRate)],
        ['Total Views', String(topStats.totalViews ?? summary.totalViews)],
        ['Total Saves', String(topStats.totalSaves ?? summary.totalSaves)],
        ['AI Draft Requests', String(draftOpsStats.requests ?? 0)],
        ['AI Draft Success', String(draftOpsStats.success ?? 0)],
        ['AI News Requests', String(newsOpsStats.requests ?? 0)],
        ['AI News Success', String(newsOpsStats.success ?? 0)],
      ],
      startY: 36,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [55, 65, 81] },
      margin: { left: 14, right: 14 },
    });

    const articleStartY = ((doc as any).lastAutoTable?.finalY || 70) + 8;

    autoTable(doc, {
      head: [['ID', 'Emotion', 'Category', 'Title', 'Status', 'Views', 'Saves', 'Review', 'Issues']],
      body: articles.map((item) => {
        const review = reviewMap[item.id];
        return [
          item.id,
          item.emotion || '-',
          item.category || '-',
          item.title,
          getArticlePublished(item) ? 'Published' : 'Hidden',
          String(item.views || 0),
          String(item.saves || 0),
          review?.completed ? 'Done' : 'Pending',
          String(review?.issues?.length || 0),
        ];
      }),
      startY: articleStartY,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 66, 66] },
    });

    doc.save('human-pulse-admin-report.pdf');
  };

  const handleRunExport = async (format: ExportFormat) => {
    try {
      const job = await DBService.runAdminExport(format);
      setExportHistory((prev) => [job as ExportJob, ...prev].slice(0, 10));
      toast({
        title: 'Export 실행 완료',
        description: `${format.toUpperCase()} 수동 실행이 기록되었습니다.`,
      });
    } catch (error: any) {
      toast({
        title: 'Export 실행 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleSchedule = async () => {
    try {
      setSavingSchedule(true);
      const updated = await DBService.updateAdminExportSchedule({
        enabled: !exportSchedule.enabled,
        intervalMinutes: exportSchedule.intervalMinutes,
        formats: exportSchedule.formats,
      });
      setExportSchedule(updated as ExportSchedule);
      toast({
        title: '스케줄 업데이트 완료',
        description: !exportSchedule.enabled ? '자동 Export가 활성화되었습니다.' : '자동 Export가 비활성화되었습니다.',
      });
    } catch (error: any) {
      toast({
        title: '스케줄 업데이트 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleIntervalChange = async (intervalMinutes: number) => {
    try {
      setSavingSchedule(true);
      const updated = await DBService.updateAdminExportSchedule({
        enabled: exportSchedule.enabled,
        intervalMinutes,
        formats: exportSchedule.formats,
      });
      setExportSchedule(updated as ExportSchedule);
    } catch (error: any) {
      toast({
        title: '주기 변경 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleTriggerAlertTest = async (type: 'failure_rate' | 'latency' | 'ai_error') => {
    try {
      setTriggeringAlertTest(true);
      await DBService.triggerAdminAlertTest(type);
      const [alertsData, summaryData] = await Promise.all([
        DBService.getAdminAlerts(8),
        DBService.getAdminAlertSummary(),
      ]);
      setOpsAlerts((alertsData || []) as OpsAlert[]);
      setOpsAlertSummary((summaryData || null) as OpsAlertSummary | null);
      toast({
        title: '알림 테스트 실행 완료',
        description: `${type} 테스트 알림이 생성되었습니다.`,
      });
    } catch (error: any) {
      toast({
        title: '알림 테스트 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setTriggeringAlertTest(false);
    }
  };

  const handleSaveAiNewsSettings = async () => {
    try {
      setSavingAiNewsSettings(true);
      const safeTimeout = Math.max(8000, Math.min(45000, Math.floor(aiNewsTimeoutMs)));
      const updated = await DBService.updateAdminAiNewsSettings({ modelTimeoutMs: safeTimeout });
      setAiNewsTimeoutMs(Number((updated as any)?.values?.modelTimeoutMs || safeTimeout));
      await fetchData();
      toast({
        title: 'AI 뉴스 설정 저장 완료',
        description: `모델 타임아웃이 ${safeTimeout}ms로 업데이트되었습니다.`,
      });
    } catch (error: any) {
      toast({
        title: 'AI 뉴스 설정 저장 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingAiNewsSettings(false);
    }
  };

  const summary = useMemo(() => {
    const reviewSlaTargetHours = 24;
    const publishedCount = articles.filter((a) => getArticlePublished(a)).length;
    const hiddenCount = articles.length - publishedCount;
    const totalViews = articles.reduce((acc, item) => acc + Number(item.views || 0), 0);
    const totalSaves = articles.reduce((acc, item) => acc + Number(item.saves || 0), 0);
    let reviewedCount = 0;
    let reviewSlaMetCount = 0;
    for (const article of articles) {
      const review = reviewMap[article.id];
      if (!review?.completed) continue;
      reviewedCount += 1;

      const createdAt = getArticleCreatedAt(article);
      const reviewedAt = review.updatedAt;
      if (!createdAt || !reviewedAt) continue;

      const createdAtMs = new Date(createdAt).getTime();
      const reviewedAtMs = new Date(reviewedAt).getTime();
      if (Number.isNaN(createdAtMs) || Number.isNaN(reviewedAtMs)) continue;

      const elapsedHours = (reviewedAtMs - createdAtMs) / (1000 * 60 * 60);
      if (elapsedHours <= reviewSlaTargetHours) reviewSlaMetCount += 1;
    }

    const reviewPendingCount = Math.max(0, articles.length - reviewedCount);
    const reviewSlaMetRate = reviewedCount > 0 ? Math.round((reviewSlaMetCount / reviewedCount) * 100) : 100;
    const issueCount = articles.reduce((acc, a) => acc + (reviewMap[a.id]?.issues.length || 0), 0);
    return {
      publishedCount,
      hiddenCount,
      totalViews,
      totalSaves,
      reviewedCount,
      issueCount,
      reviewPendingCount,
      reviewSlaTargetHours,
      reviewSlaMetCount,
      reviewSlaMetRate,
    };
  }, [articles, reviewMap]);

  const reportSummary = useMemo(() => {
    const counts = {
      reported: 0,
      in_review: 0,
      resolved: 0,
      rejected: 0,
    };
    for (const row of reports) {
      const status = (row.status || 'reported') as ReportStatus;
      if (status === 'reported') counts.reported += 1;
      if (status === 'in_review') counts.in_review += 1;
      if (status === 'resolved') counts.resolved += 1;
      if (status === 'rejected') counts.rejected += 1;
    }
    return counts;
  }, [reports]);

  const handleReportStatusChange = async (
    report: AdminReportPayload,
    status: ReportStatus,
    sanctionType?: ReportSanction,
  ) => {
    try {
      const resolution = status === 'resolved'
        ? prompt('처리 결과(해결 메모)를 입력해 주세요.', report.resolution || '조치 완료')
        : status === 'rejected'
          ? prompt('반려 사유를 입력해 주세요.', report.resolution || '근거 부족')
          : report.resolution || '';
      if (resolution === null) return;

      const updated = await DBService.updateAdminReportStatus(report.id, {
        status,
        sanctionType,
        resolution: resolution.trim(),
      });

      setReports((prev) => prev.map((row) => (row.id === report.id ? (updated as AdminReportPayload) : row)));
      toast({
        title: '신고 상태 업데이트 완료',
        description: `신고 상태가 ${status}로 변경되었습니다.`,
      });
    } catch (error: any) {
      toast({
        title: '신고 상태 업데이트 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleReaderArticleDecision = async (
    article: UserComposedArticleRecord,
    submissionStatus: 'approved' | 'rejected',
  ) => {
    try {
      const moderationMemo = submissionStatus === 'approved'
        ? '커뮤니티 노출 승인'
        : '관리자 반려';
      const updated = await DBService.decideAdminReaderArticle(article.id, {
        submissionStatus,
        moderationMemo,
      });
      if (!updated) throw new Error('업데이트된 독자 기사를 찾지 못했습니다.');
      setReaderArticles((prev) => [updated, ...prev.filter((row) => row.id !== article.id)]);
      toast({
        title: submissionStatus === 'approved' ? '독자 기사 승인 완료' : '독자 기사 반려 완료',
      });
    } catch (error: any) {
      toast({
        title: '독자 기사 상태 업데이트 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const topStats = stats?.stats || {};
  const draftOpsStats = stats?.aiDraftOps?.totals || {};
  const draftModeOps = stats?.aiDraftOps?.byMode?.draft || {};
  const longformModeOps = stats?.aiDraftOps?.byMode?.['interactive-longform'] || {};
  const newsOpsStats = stats?.aiNewsOps?.totals || {};
  const newsOpsByEmotion = stats?.aiNewsOps?.byEmotion || {};
  const pendingReaderArticles = useMemo(
    () => readerArticles.filter((row) => row.submissionStatus === 'pending'),
    [readerArticles],
  );
  const recentReaderArticleHistory = useMemo(() => {
    const now = Date.now();
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    return readerArticles
      .filter((row) => row.submissionStatus !== 'pending')
      .filter((row) => {
        const reviewedAtMs = row.reviewedAt ? new Date(row.reviewedAt).getTime() : 0;
        const updatedAtMs = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
        const createdAtMs = row.createdAt ? new Date(row.createdAt).getTime() : 0;
        const base = Math.max(reviewedAtMs || 0, updatedAtMs || 0, createdAtMs || 0);
        if (!base || Number.isNaN(base)) return false;
        return now - base <= windowMs;
      })
      .sort((a, b) => {
        const aBase = Math.max(new Date(a.reviewedAt || a.updatedAt || a.createdAt || 0).getTime(), 0);
        const bBase = Math.max(new Date(b.reviewedAt || b.updatedAt || b.createdAt || 0).getTime(), 0);
        return bBase - aBase;
      })
      .slice(0, 40);
  }, [readerArticles]);
  const selectedCount = Array.from(selectedArticleIds).filter((id) => filteredArticleIdSet.has(id)).length;
  const selectedCountOnPage = Array.from(selectedArticleIds).filter((id) => currentPageIdSet.has(id)).length;
  const allSelected = pagedArticles.length > 0 && selectedCountOnPage === pagedArticles.length;
  const emotionKoLabelMap: Record<string, string> = {
    vibrance: '설레는 파동',
    immersion: '격렬한 몰입',
    clarity: '맑은 통찰',
    gravity: '침잠한 여운',
    serenity: '편안한 숨결',
    spectrum: '스펙트럼',
  };
  const emotionChartRows = useMemo(() => {
    const rawRows = Array.isArray(stats?.emotionStats) ? stats.emotionStats : [];
    if (rawRows.length > 0) {
      return rawRows
        .map((row) => {
          const emotion = String(row?.emotion || '').trim().toLowerCase();
          const count = Number(row?.count || 0);
          const percentage = Number(row?.percentage || 0);
          return {
            emotion,
            count,
            percentage: Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : 0,
          };
        })
        .filter((row) => row.emotion)
        .sort((a, b) => b.count - a.count);
    }

    const counts = new Map<string, number>();
    for (const article of articles) {
      const emotion = String(article.emotion || '').trim().toLowerCase();
      if (!emotion) continue;
      counts.set(emotion, (counts.get(emotion) || 0) + 1);
    }
    const total = Math.max(1, articles.length);
    return Array.from(counts.entries())
      .map(([emotion, count]) => ({
        emotion,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [stats?.emotionStats, articles]);

  const aiEmotionChartRows = useMemo(() => {
    const emotionOrder = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'];
    return emotionOrder.map((emotion) => {
      const row = newsOpsByEmotion?.[emotion] || {};
      const requests = Number(row.requests || 0);
      const success = Number(row.success || 0);
      const fallback = Number(row.fallbackRecoveries || 0);
      const successRate = requests > 0 ? Math.round((success / requests) * 100) : 0;
      return { emotion, requests, success, fallback, successRate };
    });
  }, [newsOpsByEmotion]);
  const maxAiEmotionRequests = Math.max(1, ...aiEmotionChartRows.map((row) => row.requests));
  const apiMode = (apiHealth?.mode || 'lightweight') as 'full' | 'fallback' | 'lightweight';
  const apiModeLabel = apiMode === 'full' ? 'FULL' : apiMode === 'fallback' ? 'FALLBACK' : 'LIGHTWEIGHT';
  const apiModeTone: 'gray' | 'emerald' | 'amber' = apiMode === 'full' ? 'emerald' : apiMode === 'fallback' ? 'amber' : 'gray';
  const apiModeBadgeClass =
    apiMode === 'full'
      ? 'bg-emerald-50 text-emerald-700'
      : apiMode === 'fallback'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-gray-100 text-gray-700';
  const apiHealthCheckedAt = apiHealth?.timestamp ? new Date(apiHealth.timestamp).toLocaleTimeString() : '상태 미확인';
  const apiBootstrapError = String(apiHealth?.routeBootstrapError || '').trim();
  const apiBootstrapErrorPreview = apiBootstrapError ? apiBootstrapError.slice(0, 220) : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600 animate-pulse">관리자 데이터 로딩 중...</div>
      </div>
    );
  }

  const selectedAnalysis = selectedArticle ? analyzeArticle(selectedArticle) : null;
  const selectedReview = selectedArticle ? reviewMap[selectedArticle.id] : null;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <div
        ref={opsAnchorBarRef}
        className={`${showOpsTab ? '' : 'hidden'} fixed left-0 right-0 z-40 border-b border-indigo-100/70 bg-gray-50/95 backdrop-blur-md`}
        style={{ top: `${headerHeightPx}px` }}
      >
        <div className="px-4 sm:px-6 lg:px-8 py-1.5">
          <div className="rounded-2xl border border-indigo-200 bg-white px-3 sm:px-4 py-2.5 shadow-[0_4px_10px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                게시 {String(topStats.publishedCount ?? topStats.articlesPublished ?? summary.publishedCount)}
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                숨김 {String(topStats.hiddenCount ?? summary.hiddenCount)}
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
                이슈 {String(topStats.issueCount ?? summary.issueCount)}
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                검수 SLA {String(topStats.reviewSlaMetRate ?? summary.reviewSlaMetRate)}%
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-gray-50 border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700">
                조회 {String(topStats.totalViews ?? summary.totalViews)}
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-gray-50 border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700">
                저장 {String(topStats.totalSaves ?? summary.totalSaves)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => handleScrollToOpsSection('kpi')}
                className="h-7 px-3 shrink-0 rounded-full border border-indigo-200 bg-indigo-50 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                KPI
              </button>
              <button
                type="button"
                onClick={() => handleScrollToOpsSection('chart')}
                className="h-7 px-3 shrink-0 rounded-full border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                분포/성과 차트
              </button>
              <button
                type="button"
                onClick={() => handleScrollToOpsSection('ops')}
                className="h-7 px-3 shrink-0 rounded-full border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                운영 자동화/알림
              </button>
              <button
                type="button"
                onClick={() => handleScrollToOpsSection('ai')}
                className="h-7 px-3 shrink-0 rounded-full border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                AI 상세 지표
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        className={`p-4 sm:p-6 lg:p-8 ${showOpsTab ? '' : 'pt-28 sm:pt-32 lg:pt-36'} pb-[100px] space-y-8`}
        style={showOpsTab ? { paddingTop: `${headerHeightPx + opsAnchorHeightPx + 18}px` } : undefined}
      >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">관리자 대시보드</h1>
          <p className="text-gray-500 mt-2">
            {showOpsTab ? '운영 체계와 통계 지표를 관리합니다.' : '기사 상태, 분류, 검수, 이슈를 관리합니다.'}
          </p>
          <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${apiModeBadgeClass}`}>
            <span>API {apiModeLabel}</span>
            <span className="text-[11px] font-medium opacity-80">{apiHealthCheckedAt}</span>
          </div>
          {apiBootstrapErrorPreview ? (
            <p className="mt-2 max-w-[520px] text-[11px] text-amber-700 break-words">
              bootstrap: {apiBootstrapErrorPreview}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={crawling} className="bg-green-600 hover:bg-green-700 justify-center w-full">
                {crawling ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                최신 뉴스 수집
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>뉴스 수집 실행</AlertDialogTitle>
                <AlertDialogDescription>지금 최신 뉴스를 수집하시겠습니까?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleManualUpdateConfirmed}>실행</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            onClick={async () => {
              await exportToExcel();
              await handleRunExport('excel');
            }}
            className="bg-blue-600 hover:bg-blue-700 justify-center w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            통계+Excel
          </Button>
          <Button
            onClick={async () => {
              await exportToPDF();
              await handleRunExport('pdf');
            }}
            className="bg-red-600 hover:bg-red-700 justify-center w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            통계+PDF
          </Button>
        </div>
      </div>

      <div className="border-b-2 border-indigo-100">
        <div className="flex items-end gap-2 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('ops')}
            className={`h-14 min-w-[220px] px-7 rounded-t-2xl border text-base font-bold transition-colors -mb-[2px] ${
              showOpsTab
                ? 'bg-white text-indigo-700 border-indigo-200 border-b-white shadow-[0_-1px_8px_rgba(79,70,229,0.08)]'
                : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'
            }`}
          >
            운영 체계/통계
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('articles')}
            className={`h-14 min-w-[220px] px-7 rounded-t-2xl border text-base font-bold transition-colors -mb-[2px] ${
              showArticlesTab
                ? 'bg-white text-indigo-700 border-indigo-200 border-b-white shadow-[0_-1px_8px_rgba(79,70,229,0.08)]'
                : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'
            }`}
          >
            기사 관리
          </button>
        </div>
      </div>

      <div className={`${showOpsTab ? '' : 'hidden'} rounded-2xl border border-indigo-100 bg-white shadow-sm`}>
        <div className="px-5 py-4 border-b border-indigo-100 bg-indigo-50/50">
          <p className="text-sm font-semibold text-indigo-800">운영 체계/통계 탭</p>
          <p className="text-xs text-indigo-600 mt-1">핵심 지표는 상단에서 빠르게 보고, 상세 데이터는 2단 아코디언에서 확인합니다.</p>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          <div ref={opsKpiRef} className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <StatCard
              title="게시 기사"
              value={String(topStats.publishedCount ?? topStats.articlesPublished ?? summary.publishedCount)}
              icon={<FileText className="w-6 h-6 text-indigo-600" />}
              bgColor="bg-indigo-50"
            />
            <StatCard
              title="숨김 기사"
              value={String(topStats.hiddenCount ?? summary.hiddenCount)}
              icon={<EyeOff className="w-6 h-6 text-slate-600" />}
              bgColor="bg-slate-100"
            />
            <StatCard
              title="등록된 이슈"
              value={String(topStats.issueCount ?? summary.issueCount)}
              icon={<AlertTriangle className="w-6 h-6 text-amber-600" />}
              bgColor="bg-amber-50"
            />
            <StatCard
              title="검수 SLA"
              value={`${String(topStats.reviewSlaMetRate ?? summary.reviewSlaMetRate)}%`}
              subtitle={`${String(topStats.reviewSlaTargetHours ?? summary.reviewSlaTargetHours)}시간 내 완료`}
              icon={<Clock className="w-6 h-6 text-emerald-600" />}
              bgColor="bg-emerald-50"
            />
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            <QuickInfo label="검수 완료" value={`${topStats.reviewCompletedCount ?? summary.reviewedCount}건`} tone="emerald" />
            <QuickInfo label="검수 대기" value={`${topStats.reviewPendingCount ?? summary.reviewPendingCount}건`} tone="gray" />
            <QuickInfo label="전체 조회수" value={`${topStats.totalViews ?? summary.totalViews}`} tone="gray" />
            <QuickInfo label="전체 저장수" value={`${topStats.totalSaves ?? summary.totalSaves}`} tone="gray" />
            <QuickInfo label="API 모드" value={apiModeLabel} tone={apiModeTone} />
          </div>

          <div ref={opsChartRef} className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h4 className="text-sm font-semibold text-gray-800">감정 분포 차트</h4>
                <span className="text-[11px] text-gray-500">전체 기사 기준</span>
              </div>
              <div className="space-y-2.5">
                {emotionChartRows.length === 0 ? (
                  <p className="text-xs text-gray-500">분포 데이터가 없습니다.</p>
                ) : emotionChartRows.map((row) => (
                  <div key={`emotion-chart-${row.emotion}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getEmotionColor(row.emotion) }} />
                        {emotionKoLabelMap[row.emotion] || row.emotion.toUpperCase()}
                      </span>
                      <span className="text-gray-600">{row.count}건 · {row.percentage}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(4, Math.min(100, row.percentage))}%`,
                          backgroundColor: getEmotionColor(row.emotion),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h4 className="text-sm font-semibold text-gray-800">AI 감정뉴스 성과 차트</h4>
                <span className="text-[11px] text-gray-500">요청량/성공률</span>
              </div>
              <div className="space-y-2.5">
                {aiEmotionChartRows.map((row) => {
                  const requestWidth = row.requests > 0
                    ? Math.max(6, Math.round((row.requests / maxAiEmotionRequests) * 100))
                    : 0;
                  return (
                    <div key={`ai-emotion-chart-${row.emotion}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-gray-700">
                          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getEmotionColor(row.emotion) }} />
                          {emotionKoLabelMap[row.emotion] || row.emotion.toUpperCase()}
                        </span>
                        <span className="text-gray-600">
                          요청 {row.requests} · 성공 {row.success} · Fallback {row.fallback}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${requestWidth}%`,
                            backgroundColor: getEmotionColor(row.emotion),
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-500 text-right">성공률 {row.successRate}%</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div ref={opsOpsRef} className="rounded-xl border border-gray-200 bg-gray-50/40 px-4">
              <Accordion type="multiple" defaultValue={['ops-export', 'ops-alert']} className="w-full">
                <AccordionItem value="ops-export">
                  <AccordionTrigger className="text-sm font-semibold text-gray-800 hover:no-underline">Export 자동화</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-gray-600">수동 실행 기록 + 스케줄 실행 상태를 관리합니다.</p>
                        <Button
                          size="sm"
                          onClick={handleToggleSchedule}
                          disabled={savingSchedule}
                          className={exportSchedule.enabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-700 hover:bg-gray-800'}
                        >
                          {savingSchedule ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
                          {exportSchedule.enabled ? '자동 실행 ON' : '자동 실행 OFF'}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {[15, 30, 60, 120].map((interval) => (
                          <button
                            key={`export-interval-compact-${interval}`}
                            type="button"
                            onClick={() => handleIntervalChange(interval)}
                            className={`px-2.5 py-1 rounded border ${exportSchedule.intervalMinutes === interval ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600 border-gray-200'}`}
                          >
                            {interval}분
                          </button>
                        ))}
                        <span className="ml-1 text-gray-500">
                          다음 실행: {exportSchedule.nextRunAt ? new Date(exportSchedule.nextRunAt).toLocaleString() : '-'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {exportHistory.length === 0 ? (
                          <p className="text-xs text-gray-500">실행 이력이 없습니다.</p>
                        ) : exportHistory.slice(0, 4).map((job) => (
                          <div key={`compact-export-${job.id}`} className="text-xs rounded-md border border-gray-100 px-2 py-1.5 flex items-center justify-between gap-2 bg-white">
                            <span className="text-gray-700">
                              [{job.mode === 'scheduled' ? '자동' : '수동'}] {job.format.toUpperCase()} · {new Date(job.completedAt || job.createdAt).toLocaleString()}
                            </span>
                            <span className={job.status === 'success' ? 'text-emerald-700' : 'text-red-700'}>
                              {job.status === 'success' ? `성공 (${job.summary.articleCount}건)` : `실패${job.error ? `: ${job.error}` : ''}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ops-alert">
                  <AccordionTrigger className="text-sm font-semibold text-gray-800 hover:no-underline">운영 알림 체계</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => fetchData()}>
                          새로고침
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleTriggerAlertTest('ai_error')}
                          disabled={triggeringAlertTest}
                          className="bg-amber-600 hover:bg-amber-700"
                        >
                          {triggeringAlertTest ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
                          테스트 알림
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
                        <QuickInfo label="실패율(10분)" value={`${opsAlertSummary?.failureRate ?? 0}%`} tone={(opsAlertSummary?.failureRate ?? 0) >= 20 ? 'amber' : 'gray'} />
                        <QuickInfo label="p95 지연(10분)" value={`${opsAlertSummary?.p95LatencyMs ?? 0}ms`} tone={(opsAlertSummary?.p95LatencyMs ?? 0) >= 1500 ? 'amber' : 'gray'} />
                        <QuickInfo label="AI 오류(10분)" value={`${opsAlertSummary?.aiErrorCount ?? 0}건`} tone={(opsAlertSummary?.aiErrorCount ?? 0) >= 3 ? 'amber' : 'gray'} />
                        <QuickInfo label="활성 알림" value={`${opsAlertSummary?.alertCount ?? 0}건`} tone={(opsAlertSummary?.criticalCount ?? 0) > 0 ? 'amber' : 'gray'} />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <div ref={opsAiRef} className="rounded-xl border border-gray-200 bg-gray-50/40 px-4">
              <Accordion type="multiple" defaultValue={['ops-ai-news', 'ops-ai-draft']} className="w-full">
                <AccordionItem value="ops-ai-draft">
                  <AccordionTrigger className="text-sm font-semibold text-gray-800 hover:no-underline">AI 기사 생성 운영 지표</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <p className="text-[11px] text-gray-500">
                        Prompt: {stats?.aiDraftOps?.promptVersion || '-'} · 갱신 {stats?.aiDraftOps?.updatedAt ? new Date(stats.aiDraftOps.updatedAt).toLocaleTimeString() : '-'}
                      </p>
                      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
                        <QuickInfo label="생성 요청" value={`${draftOpsStats.requests ?? 0}건`} tone="gray" />
                        <QuickInfo label="생성 성공" value={`${draftOpsStats.success ?? 0}건`} tone="emerald" />
                        <QuickInfo label="재생성(1회)" value={`${draftOpsStats.retries ?? 0}건`} tone="amber" />
                        <QuickInfo label="파싱 복구" value={`${draftOpsStats.fallbackRecoveries ?? 0}건`} tone="gray" />
                        <QuickInfo label="파싱 실패" value={`${draftOpsStats.parseFailures ?? 0}건`} tone={(draftOpsStats.parseFailures ?? 0) > 0 ? 'amber' : 'gray'} />
                        <QuickInfo label="스키마 차단" value={`${draftOpsStats.schemaBlocks ?? 0}건`} tone={(draftOpsStats.schemaBlocks ?? 0) > 0 ? 'amber' : 'gray'} />
                        <QuickInfo label="유사도 차단" value={`${draftOpsStats.similarityBlocks ?? 0}건`} tone={(draftOpsStats.similarityBlocks ?? 0) > 0 ? 'amber' : 'gray'} />
                        <QuickInfo label="컴플 차단" value={`${draftOpsStats.complianceBlocks ?? 0}건`} tone={(draftOpsStats.complianceBlocks ?? 0) > 0 ? 'amber' : 'gray'} />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ops-ai-news">
                  <AccordionTrigger className="text-sm font-semibold text-gray-800 hover:no-underline">AI 감정 뉴스 운영 지표</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <p className="text-[11px] text-gray-500">
                        Version: {stats?.aiNewsOps?.version || '-'} · 갱신 {stats?.aiNewsOps?.updatedAt ? new Date(stats.aiNewsOps.updatedAt).toLocaleTimeString() : '-'}
                      </p>
                      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
                        <QuickInfo label="요청" value={`${newsOpsStats.requests ?? 0}건`} tone="gray" />
                        <QuickInfo label="성공" value={`${newsOpsStats.success ?? 0}건`} tone="emerald" />
                        <QuickInfo label="Fallback" value={`${newsOpsStats.fallbackRecoveries ?? 0}건`} tone={(newsOpsStats.fallbackRecoveries ?? 0) > 0 ? 'amber' : 'gray'} />
                        <QuickInfo label="RSS Fallback" value={`${newsOpsStats.rssFallbacks ?? 0}건`} tone={(newsOpsStats.rssFallbacks ?? 0) > 0 ? 'amber' : 'gray'} />
                        <QuickInfo label="파싱 실패" value={`${newsOpsStats.parseFailures ?? 0}건`} tone={(newsOpsStats.parseFailures ?? 0) > 0 ? 'amber' : 'gray'} />
                        <QuickInfo label="품질 차단" value={`${newsOpsStats.qualityBlocks ?? 0}건`} tone={(newsOpsStats.qualityBlocks ?? 0) > 0 ? 'amber' : 'gray'} />
                        <QuickInfo label="모델 빈응답" value={`${newsOpsStats.modelEmpty ?? 0}건`} tone={(newsOpsStats.modelEmpty ?? 0) > 0 ? 'amber' : 'gray'} />
                        <QuickInfo label="성공률" value={`${(newsOpsStats.requests ?? 0) > 0 ? Math.round(((newsOpsStats.success ?? 0) / Math.max(1, (newsOpsStats.requests ?? 0))) * 100) : 0}%`} tone="gray" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
                        {(['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'] as const).map((emotion) => {
                          const row = newsOpsByEmotion?.[emotion] || {};
                          return (
                            <div key={`compact-news-ops-${emotion}`} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-700">
                              {emotion.toUpperCase()}: 요청 {row.requests ?? 0} · 성공 {row.success ?? 0} · Fallback {row.fallbackRecoveries ?? 0}
                            </div>
                          );
                        })}
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-gray-700">Gemini 모델 타임아웃 (ms)</p>
                            <p className="text-[11px] text-gray-500">권장 16000~30000, 허용 8000~45000</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={8000}
                              max={45000}
                              step={1000}
                              value={aiNewsTimeoutMs}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                setAiNewsTimeoutMs(Number.isFinite(next) ? next : 8000);
                              }}
                              className="h-9 w-36 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                            <Button
                              size="sm"
                              onClick={handleSaveAiNewsSettings}
                              disabled={savingAiNewsSettings}
                              className="h-9 bg-indigo-600 hover:bg-indigo-700"
                            >
                              {savingAiNewsSettings ? '저장 중...' : '설정 저장'}
                            </Button>
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          설정 출처: {(stats?.aiNewsSettings?.source || 'env').toUpperCase()} · 반영 시각: {stats?.aiNewsSettings?.updatedAt ? new Date(stats.aiNewsSettings.updatedAt).toLocaleString() : '-'}
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Export 자동화</h3>
            <p className="text-xs text-gray-500 mt-1">수동 실행 기록 + 스케줄 실행 상태를 관리합니다.</p>
          </div>
          <Button
            size="sm"
            onClick={handleToggleSchedule}
            disabled={savingSchedule}
            className={exportSchedule.enabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-700 hover:bg-gray-800'}
          >
            {savingSchedule ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
            {exportSchedule.enabled ? '자동 실행 ON' : '자동 실행 OFF'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[15, 30, 60, 120].map((interval) => (
            <button
              key={`export-interval-${interval}`}
              type="button"
              onClick={() => handleIntervalChange(interval)}
              className={`px-2.5 py-1 rounded border ${exportSchedule.intervalMinutes === interval ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              {interval}분
            </button>
          ))}
          <span className="ml-1 text-gray-500">
            다음 실행: {exportSchedule.nextRunAt ? new Date(exportSchedule.nextRunAt).toLocaleString() : '-'}
          </span>
        </div>
        <div className="space-y-1">
          {exportHistory.length === 0 ? (
            <p className="text-xs text-gray-500">실행 이력이 없습니다.</p>
          ) : exportHistory.slice(0, 5).map((job) => (
            <div key={job.id} className="text-xs rounded-md border border-gray-100 px-2 py-1.5 flex items-center justify-between gap-2">
              <span className="text-gray-700">
                [{job.mode === 'scheduled' ? '자동' : '수동'}] {job.format.toUpperCase()} · {new Date(job.completedAt || job.createdAt).toLocaleString()}
              </span>
              <span className={job.status === 'success' ? 'text-emerald-700' : 'text-red-700'}>
                {job.status === 'success' ? `성공 (${job.summary.articleCount}건)` : `실패${job.error ? `: ${job.error}` : ''}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">운영 알림 체계</h3>
            <p className="text-xs text-gray-500 mt-1">실패율/지연/AI 오류 임계치 기반 경고를 표시합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchData()}
            >
              새로고침
            </Button>
            <Button
              size="sm"
              onClick={() => handleTriggerAlertTest('ai_error')}
              disabled={triggeringAlertTest}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {triggeringAlertTest ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
              테스트 알림
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
          <QuickInfo label="실패율(10분)" value={`${opsAlertSummary?.failureRate ?? 0}%`} tone={(opsAlertSummary?.failureRate ?? 0) >= 20 ? 'amber' : 'gray'} />
          <QuickInfo label="p95 지연(10분)" value={`${opsAlertSummary?.p95LatencyMs ?? 0}ms`} tone={(opsAlertSummary?.p95LatencyMs ?? 0) >= 1500 ? 'amber' : 'gray'} />
          <QuickInfo label="AI 오류(10분)" value={`${opsAlertSummary?.aiErrorCount ?? 0}건`} tone={(opsAlertSummary?.aiErrorCount ?? 0) >= 3 ? 'amber' : 'gray'} />
          <QuickInfo label="활성 알림" value={`${opsAlertSummary?.alertCount ?? 0}건`} tone={(opsAlertSummary?.criticalCount ?? 0) > 0 ? 'amber' : 'gray'} />
        </div>
        <div className="space-y-1">
          {opsAlerts.length === 0 ? (
            <p className="text-xs text-gray-500">현재 활성 알림이 없습니다.</p>
          ) : opsAlerts.map((alert) => (
            <div key={alert.id} className="text-xs rounded-md border border-gray-100 px-2 py-1.5 flex items-center justify-between gap-2">
              <span className="text-gray-700">
                [{alert.severity === 'critical' ? 'CRITICAL' : 'WARNING'}] {alert.title} · {alert.message}
              </span>
              <span className={alert.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}>
                {new Date(alert.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          title="게시 기사"
          value={String(topStats.publishedCount ?? topStats.articlesPublished ?? summary.publishedCount)}
          icon={<FileText className="w-6 h-6 text-indigo-600" />}
          bgColor="bg-indigo-50"
        />
        <StatCard
          title="숨김 기사"
          value={String(topStats.hiddenCount ?? summary.hiddenCount)}
          icon={<EyeOff className="w-6 h-6 text-slate-600" />}
          bgColor="bg-slate-100"
        />
        <StatCard
          title="등록된 이슈"
          value={String(topStats.issueCount ?? summary.issueCount)}
          icon={<AlertTriangle className="w-6 h-6 text-amber-600" />}
          bgColor="bg-amber-50"
        />
        <StatCard
          title="검수 SLA"
          value={`${String(topStats.reviewSlaMetRate ?? summary.reviewSlaMetRate)}%`}
          subtitle={`${String(topStats.reviewSlaTargetHours ?? summary.reviewSlaTargetHours)}시간 내 완료`}
          icon={<Clock className="w-6 h-6 text-emerald-600" />}
          bgColor="bg-emerald-50"
        />
      </div>

      <div className="hidden grid grid-cols-2 xl:grid-cols-4 gap-4">
        <QuickInfo label="검수 완료" value={`${topStats.reviewCompletedCount ?? summary.reviewedCount}건`} tone="emerald" />
        <QuickInfo label="검수 대기" value={`${topStats.reviewPendingCount ?? summary.reviewPendingCount}건`} tone="gray" />
        <QuickInfo label="전체 조회수" value={`${topStats.totalViews ?? summary.totalViews}`} tone="gray" />
        <QuickInfo label="전체 저장수" value={`${topStats.totalSaves ?? summary.totalSaves}`} tone="gray" />
      </div>

      <div className="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">AI 기사 생성 운영 지표</h3>
          <span className="text-[11px] text-gray-500">
            Prompt: {stats?.aiDraftOps?.promptVersion || '-'} · 갱신 {stats?.aiDraftOps?.updatedAt ? new Date(stats.aiDraftOps.updatedAt).toLocaleTimeString() : '-'}
          </span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
          <QuickInfo label="생성 요청" value={`${draftOpsStats.requests ?? 0}건`} tone="gray" />
          <QuickInfo label="생성 성공" value={`${draftOpsStats.success ?? 0}건`} tone="emerald" />
          <QuickInfo label="재생성(1회)" value={`${draftOpsStats.retries ?? 0}건`} tone="amber" />
          <QuickInfo label="파싱 복구" value={`${draftOpsStats.fallbackRecoveries ?? 0}건`} tone="gray" />
          <QuickInfo label="파싱 실패" value={`${draftOpsStats.parseFailures ?? 0}건`} tone={(draftOpsStats.parseFailures ?? 0) > 0 ? 'amber' : 'gray'} />
          <QuickInfo label="스키마 차단" value={`${draftOpsStats.schemaBlocks ?? 0}건`} tone={(draftOpsStats.schemaBlocks ?? 0) > 0 ? 'amber' : 'gray'} />
          <QuickInfo label="유사도 차단" value={`${draftOpsStats.similarityBlocks ?? 0}건`} tone={(draftOpsStats.similarityBlocks ?? 0) > 0 ? 'amber' : 'gray'} />
          <QuickInfo label="컴플 차단" value={`${draftOpsStats.complianceBlocks ?? 0}건`} tone={(draftOpsStats.complianceBlocks ?? 0) > 0 ? 'amber' : 'gray'} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">
            빠른 기사 작성: 요청 {draftModeOps.requests ?? 0} · 성공 {draftModeOps.success ?? 0} · 재시도 {draftModeOps.retries ?? 0}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">
            인터랙티브 롱폼: 요청 {longformModeOps.requests ?? 0} · 성공 {longformModeOps.success ?? 0} · 재시도 {longformModeOps.retries ?? 0}
          </div>
        </div>
      </div>

      <div className="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">AI 감정 뉴스 운영 지표</h3>
          <span className="text-[11px] text-gray-500">
            Version: {stats?.aiNewsOps?.version || '-'} · 갱신 {stats?.aiNewsOps?.updatedAt ? new Date(stats.aiNewsOps.updatedAt).toLocaleTimeString() : '-'}
          </span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
          <QuickInfo label="요청" value={`${newsOpsStats.requests ?? 0}건`} tone="gray" />
          <QuickInfo label="성공" value={`${newsOpsStats.success ?? 0}건`} tone="emerald" />
          <QuickInfo label="Fallback" value={`${newsOpsStats.fallbackRecoveries ?? 0}건`} tone={(newsOpsStats.fallbackRecoveries ?? 0) > 0 ? 'amber' : 'gray'} />
          <QuickInfo label="RSS Fallback" value={`${newsOpsStats.rssFallbacks ?? 0}건`} tone={(newsOpsStats.rssFallbacks ?? 0) > 0 ? 'amber' : 'gray'} />
          <QuickInfo label="파싱 실패" value={`${newsOpsStats.parseFailures ?? 0}건`} tone={(newsOpsStats.parseFailures ?? 0) > 0 ? 'amber' : 'gray'} />
          <QuickInfo label="품질 차단" value={`${newsOpsStats.qualityBlocks ?? 0}건`} tone={(newsOpsStats.qualityBlocks ?? 0) > 0 ? 'amber' : 'gray'} />
          <QuickInfo label="모델 빈응답" value={`${newsOpsStats.modelEmpty ?? 0}건`} tone={(newsOpsStats.modelEmpty ?? 0) > 0 ? 'amber' : 'gray'} />
          <QuickInfo label="성공률" value={`${(newsOpsStats.requests ?? 0) > 0 ? Math.round(((newsOpsStats.success ?? 0) / Math.max(1, (newsOpsStats.requests ?? 0))) * 100) : 0}%`} tone="gray" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
          {(['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'] as const).map((emotion) => {
            const row = newsOpsByEmotion?.[emotion] || {};
            return (
              <div key={`news-ops-${emotion}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">
                {emotion.toUpperCase()}: 요청 {row.requests ?? 0} · 성공 {row.success ?? 0} · Fallback {row.fallbackRecoveries ?? 0}
              </div>
            );
          })}
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-700">Gemini 모델 타임아웃 (ms)</p>
              <p className="text-[11px] text-gray-500">권장 16000~30000, 허용 8000~45000</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={8000}
                max={45000}
                step={1000}
                value={aiNewsTimeoutMs}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setAiNewsTimeoutMs(Number.isFinite(next) ? next : 8000);
                }}
                className="h-9 w-36 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <Button
                size="sm"
                onClick={handleSaveAiNewsSettings}
                disabled={savingAiNewsSettings}
                className="h-9 bg-indigo-600 hover:bg-indigo-700"
              >
                {savingAiNewsSettings ? '저장 중...' : '설정 저장'}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-gray-500">
            설정 출처: {(stats?.aiNewsSettings?.source || 'env').toUpperCase()} · 반영 시각: {stats?.aiNewsSettings?.updatedAt ? new Date(stats.aiNewsSettings.updatedAt).toLocaleString() : '-'}
          </p>
        </div>
      </div>

      <div className="hidden bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-gray-800">신고/제재 워크플로우</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">접수 {reportSummary.reported}</span>
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">검토중 {reportSummary.in_review}</span>
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">처리완료 {reportSummary.resolved}</span>
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">반려 {reportSummary.rejected}</span>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-3">
          {reports.length === 0 ? (
            <p className="text-sm text-gray-500">등록된 신고가 없습니다.</p>
          ) : reports.slice(0, 12).map((report) => {
            const status = (report.status || 'reported') as ReportStatus;
            const badgeClass = status === 'resolved'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : status === 'in_review'
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : status === 'rejected'
                  ? 'bg-gray-100 text-gray-700 border-gray-200'
                  : 'bg-red-100 text-red-700 border-red-200';
            const articleTitle = articles.find((a) => a.id === report.articleId)?.title || `기사 ${report.articleId}`;

            return (
              <div key={report.id} className="rounded-xl border border-gray-200 p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 line-clamp-1">{articleTitle}</p>
                    <p className="text-xs text-gray-500 mt-1">신고 ID: {report.id}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${badgeClass}`}>
                    {status === 'reported' ? '접수됨' : status === 'in_review' ? '검토중' : status === 'resolved' ? '처리완료' : '반려'}
                  </span>
                </div>

                <p className="text-sm text-gray-700 mt-2">{report.reason}</p>

                {report.resolution ? (
                  <p className="text-xs text-gray-600 mt-2 rounded-md bg-gray-50 border border-gray-100 px-2 py-1 line-clamp-2">
                    처리 메모: {report.resolution}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReportStatusChange(report, 'in_review')}
                    disabled={status === 'in_review'}
                  >
                    검토중 전환
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleReportStatusChange(report, 'resolved', 'hide_article')}
                    disabled={status === 'resolved'}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    숨김 처리 완료
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleReportStatusChange(report, 'resolved', 'warn_author')}
                    disabled={status === 'resolved'}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    경고 후 완료
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleReportStatusChange(report, 'rejected', 'none')}
                    disabled={status === 'rejected'}
                  >
                    반려
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`${showArticlesTab ? '' : 'hidden'} bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4`}>
        <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50">
          <p className="text-sm font-semibold text-amber-900">독자 기사 검증 대기열</p>
          <p className="text-xs text-amber-700 mt-1">내 의견으로 생성된 기사의 커뮤니티 노출 승인/반려를 처리합니다.</p>
        </div>
        <div className="p-4 sm:p-5 space-y-3">
          {pendingReaderArticles.length === 0 ? (
            <p className="text-sm text-gray-500">검증 대기 중인 독자 기사가 없습니다.</p>
          ) : pendingReaderArticles.slice(0, 20).map((item) => (
            <div key={`reader-article-${item.id}`} className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="text-sm font-semibold text-gray-900 line-clamp-1 text-left hover:underline"
                    onClick={() => setExpandedReaderArticleId((prev) => (prev === item.id ? null : item.id))}
                  >
                    {item.generatedTitle}
                  </button>
                  <p className="text-xs text-gray-500 mt-1">원문: {item.sourceTitle}</p>
                  <p className="text-xs text-gray-500">작성자: {item.userId} · {new Date(item.createdAt).toLocaleString()}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">
                      {item.sourceCategory || 'General'}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-[11px]">
                      {item.sourceEmotion}
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">대기</span>
              </div>
              <button
                type="button"
                className="text-sm text-gray-700 line-clamp-2 text-left hover:text-gray-900"
                onClick={() => setExpandedReaderArticleId((prev) => (prev === item.id ? null : item.id))}
              >
                {item.generatedSummary}
              </button>
              {expandedReaderArticleId === item.id && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500 mb-1">기사 전체 본문</p>
                  <p className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed">{item.generatedContent}</p>
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-[11px] text-gray-500 mb-1">독자 의견</p>
                <p className="text-xs text-gray-700 line-clamp-2">{item.userOpinion}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void handleReaderArticleDecision(item, 'approved')}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  승인 후 커뮤니티 노출
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleReaderArticleDecision(item, 'rejected')}
                >
                  반려
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${showArticlesTab ? '' : 'hidden'} bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4`}>
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <p className="text-sm font-semibold text-slate-900">이전 기록 보기 (최근 7일)</p>
          <p className="text-xs text-slate-600 mt-1">승인/반려 처리된 독자 기사 이력을 확인합니다.</p>
        </div>
        <div className="p-4 sm:p-5 space-y-3">
          {recentReaderArticleHistory.length === 0 ? (
            <p className="text-sm text-gray-500">최근 7일 처리 이력이 없습니다.</p>
          ) : recentReaderArticleHistory.map((item) => (
            <div key={`reader-article-history-${item.id}`} className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="text-sm font-semibold text-gray-900 line-clamp-1 text-left hover:underline"
                    onClick={() => setExpandedReaderArticleId((prev) => (prev === item.id ? null : item.id))}
                  >
                    {item.generatedTitle}
                  </button>
                  <p className="text-xs text-gray-500 mt-1">작성자: {item.userId}</p>
                  <p className="text-xs text-gray-500">
                    처리시각: {new Date(item.reviewedAt || item.updatedAt || item.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    item.submissionStatus === 'approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {item.submissionStatus === 'approved' ? '승인' : '반려'}
                </span>
              </div>
              {item.moderationMemo ? (
                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                  메모: {item.moderationMemo}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className={`${showArticlesTab ? '' : 'hidden'} bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden`}>
        <div className="px-5 py-4 border-b border-indigo-100 bg-indigo-50/45">
          <p className="text-sm font-semibold text-indigo-800">기사 관리 탭</p>
          <p className="text-xs text-indigo-600 mt-1">기사 상태, 감정/카테고리 분류, 검수와 이슈를 이 탭에서 관리합니다.</p>
        </div>
        <div className="px-6 py-5 border-b border-gray-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-800">기사 관리</h3>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleSelectAllArticles(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              현재 페이지 선택
            </label>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={articleEmotionFilter}
              onChange={(e) => setArticleEmotionFilter(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="all">전체 카테고리</option>
              {articleEmotionOptions.map((emotion) => (
                <option key={emotion} value={emotion}>
                  {emotion.toUpperCase()}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={articleSearchQuery}
              onChange={(e) => setArticleSearchQuery(e.target.value)}
              placeholder="기사 제목/요약/출처 검색"
              className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2">
            <p className="text-xs text-gray-600">
              총 {filteredArticles.length}건 · 페이지 {articlePage}/{totalArticlePages} · 페이지당 {ARTICLES_PER_PAGE}건
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setArticlePage((prev) => Math.max(1, prev - 1))}
                disabled={articlePage <= 1}
              >
                이전
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setArticlePage((prev) => Math.min(totalArticlePages, prev + 1))}
                disabled={articlePage >= totalArticlePages}
              >
                다음
              </Button>
            </div>
          </div>
          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
              <span className="text-sm font-medium text-indigo-800">선택 {selectedCount}건</span>
              <Button size="sm" variant="outline" onClick={() => handleBatchAction('hide')}>
                일괄 숨김
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBatchAction('publish')}>
                일괄 게시
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBatchAction('review_complete')}>
                일괄 검수완료
              </Button>
              <Button size="sm" onClick={() => handleBatchAction('delete')} className="bg-red-600 hover:bg-red-700">
                일괄 삭제
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedArticleIds(new Set())}>
                선택 해제
              </Button>
            </div>
          )}
        </div>
        <div className="xl:hidden p-4 sm:p-6 space-y-4">
          {pagedArticles.map((item) => {
            const isPublished = getArticlePublished(item);
            const review = reviewMap[item.id];
            const issueCount = review?.issues?.length || 0;
            const latestIssue = issueCount > 0 ? review?.issues?.[0] : '';
            const isSelected = selectedArticleIds.has(item.id);

            return (
              <div
                key={`mobile-${item.id}`}
                className={`rounded-xl border p-4 space-y-3 ${
                  isPublished ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="flex items-center justify-end">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleArticleSelection(item.id)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    선택
                  </label>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedArticle(item)}
                    className="w-full font-semibold text-gray-900 text-left hover:underline line-clamp-2 break-words [overflow-wrap:anywhere] whitespace-normal"
                    title="기사 통계 팝업 열기"
                  >
                    {item.title}
                  </button>
                  <span className="px-2 py-1 rounded-md text-xs font-bold text-white shadow-sm shrink-0" style={{ backgroundColor: getEmotionColor(item.emotion || 'default') }}>
                    {(item.emotion || '-').toUpperCase()}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-medium ${isPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                    {isPublished ? '게시중' : '숨김 처리됨'}
                  </span>
                  {review?.completed && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800">
                      검수완료
                    </span>
                  )}
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-medium ${issueCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                    이슈 {issueCount}건
                  </span>
                  <CategoryBadge emotion={item.emotion} category={item.category} />
                </div>

                <p className="text-sm text-gray-600 line-clamp-2 break-words [overflow-wrap:anywhere] whitespace-normal">{item.summary || '요약 없음'}</p>

                {latestIssue && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 line-clamp-1">
                    최근 이슈: {latestIssue}
                  </p>
                )}

                {review?.memo?.trim() && (
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2 py-1 line-clamp-1">
                    메모: {review.memo}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <IconActionButton
                    onClick={() => handleHide(item.id, isPublished)}
                    title={isPublished ? '숨김 처리' : '게시하기'}
                    className={isPublished ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-amber-600 text-white hover:bg-amber-700'}
                    icon={isPublished ? <EyeOff size={15} /> : <Upload size={15} />}
                  />
                  <IconActionButton
                    onClick={() => handleMarkReviewComplete(item.id)}
                    title={review?.completed ? '검수 해제' : '검수 완료'}
                    className={review?.completed ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}
                    icon={<CheckCircle size={15} />}
                  />
                  <IconActionButton
                    onClick={() => handleIssueRegister(item)}
                    title="이슈 등록"
                    className="bg-amber-600 text-white hover:bg-amber-700"
                    icon={<AlertTriangle size={15} />}
                  />
                  <IconActionButton
                    onClick={() => handleMemoSave(item)}
                    title="담당자 메모"
                    className="bg-blue-600 text-white hover:bg-blue-700"
                    icon={<StickyNote size={15} />}
                  />
                  <IconActionButton
                    onClick={() => handleDelete(item.id)}
                    title="기사 삭제"
                    className="bg-red-600 text-white hover:bg-red-700 ml-auto"
                    icon={<Trash2 size={15} />}
                  />
                </div>
              </div>
            );
          })}
          {filteredArticles.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white/70 p-6 text-center text-sm text-gray-500">
              조건에 맞는 기사가 없습니다.
            </div>
          )}
        </div>

        <div className="hidden xl:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="py-4 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-[86px] min-w-[86px] whitespace-nowrap">선택</th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[180px] min-w-[170px]">상태</th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[250px] min-w-[240px]">감정</th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[30%] min-w-[300px]">콘텐츠</th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[26%] min-w-[260px]">요약/메모</th>
                <th className="py-4 px-6 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-[220px] min-w-[210px]">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedArticles.map((item) => {
                const isPublished = getArticlePublished(item);
                const source = item.source || 'Unknown';
                const review = reviewMap[item.id];
                const issueCount = review?.issues?.length || 0;
                const latestIssue = issueCount > 0 ? review?.issues?.[0] : '';
                const isSelected = selectedArticleIds.has(item.id);

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${isPublished ? 'hover:bg-gray-50/50' : 'bg-amber-50/40 hover:bg-amber-50/70 opacity-95'}`}
                  >
                    <td className="py-4 px-4 align-top text-center w-[86px] min-w-[86px] whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleArticleSelection(item.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`${item.title} 선택`}
                      />
                    </td>
                    <td className="py-4 px-6 align-top">
                      <div className="grid grid-cols-2 gap-1.5 max-w-[190px]">
                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${isPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                          {isPublished ? '게시중' : '숨김 처리됨'}
                        </span>
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${review?.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                          {review?.completed ? '검수완료' : '검수대기'}
                        </span>
                        <span className={`col-span-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${issueCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                          이슈 {issueCount}건
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 align-top">
                      <EmotionCategoryCell emotion={item.emotion} category={item.category} />
                    </td>
                    <td className="py-4 px-6 align-top">
                      <div className="flex flex-col max-w-[340px] min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedArticle(item)}
                          className="w-full font-semibold text-gray-900 text-left hover:underline line-clamp-2 break-words [overflow-wrap:anywhere] whitespace-normal"
                          title="기사 통계 팝업 열기"
                        >
                          {item.title}
                        </button>
                        {source !== 'Unknown' && source.startsWith('http') ? (
                          <a href={source} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 mt-1 w-fit group">
                            <LinkIcon className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[220px] group-hover:underline" title={source}>
                              {(() => {
                                try {
                                  return new URL(source).hostname;
                                } catch {
                                  return '링크';
                                }
                              })()}
                            </span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 mt-1 truncate" title={source}>{source}</span>
                        )}
                        <span className="text-xs text-gray-400 mt-1 flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {getArticleCreatedAt(item) ? new Date(getArticleCreatedAt(item) as string).toLocaleDateString() : '-'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 align-top">
                      {item.summary ? (
                        <p className="text-sm text-gray-600 line-clamp-2 break-words [overflow-wrap:anywhere] whitespace-normal">{item.summary}</p>
                      ) : (
                        <span className="text-gray-400 text-sm italic">요약 없음</span>
                      )}
                      {latestIssue && (
                        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 line-clamp-1">
                          최근 이슈: {latestIssue}
                        </p>
                      )}
                      {review?.memo && (
                        <p className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2 py-1 line-clamp-1">
                          메모: {review.memo}
                        </p>
                      )}
                    </td>
                    <td className="py-4 px-6 align-top">
                      <div className="flex items-center justify-center gap-2">
                        <IconActionButton
                          onClick={() => handleHide(item.id, isPublished)}
                          title={isPublished ? '숨김 처리' : '게시하기'}
                          className={isPublished ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-amber-600 text-white hover:bg-amber-700'}
                          icon={isPublished ? <EyeOff size={15} /> : <Upload size={15} />}
                        />
                        <IconActionButton
                          onClick={() => handleMarkReviewComplete(item.id)}
                          title={review?.completed ? '검수 해제' : '검수 완료'}
                          className={review?.completed ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}
                          icon={<CheckCircle size={15} />}
                        />
                        <IconActionButton
                          onClick={() => handleIssueRegister(item)}
                          title="이슈 등록"
                          className="bg-amber-600 text-white hover:bg-amber-700"
                          icon={<AlertTriangle size={15} />}
                        />
                        <IconActionButton
                          onClick={() => handleMemoSave(item)}
                          title="담당자 메모"
                          className="bg-blue-600 text-white hover:bg-blue-700"
                          icon={<StickyNote size={15} />}
                        />
                        <IconActionButton
                          onClick={() => handleDelete(item.id)}
                          title="기사 삭제"
                          className="bg-red-600 text-white hover:bg-red-700"
                          icon={<Trash2 size={15} />}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredArticles.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 px-6 text-center text-sm text-gray-500">
                    조건에 맞는 기사가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredArticles.length > 0 && (
          <div className="px-6 py-5 border-t border-gray-100 space-y-3">
            <div className="w-full overflow-x-auto flex justify-center">
              <div className="inline-flex min-w-max items-center gap-1.5 rounded-full border border-[#b7ecea] bg-[#effcfb] px-2 py-2 sm:px-3">
                <button
                  type="button"
                  onClick={() => setArticlePage(1)}
                  disabled={articlePage <= 1}
                  className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#0f9f9b] hover:bg-[#dff6f5] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronsLeft className="h-4 w-4" />
                  처음
                </button>
                <button
                  type="button"
                  onClick={() => setArticlePage((prev) => Math.max(1, prev - 1))}
                  disabled={articlePage <= 1}
                  className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#0f9f9b] hover:bg-[#dff6f5] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </button>
                {articlePageTokens.map((token, index) =>
                  token === PAGE_ELLIPSIS ? (
                    <span key={`article-page-gap-${index}`} className="inline-flex h-9 min-w-8 items-center justify-center px-1 text-sm font-bold text-[#0f9f9b]">
                      ...
                    </span>
                  ) : (
                    <button
                      key={`article-page-${token}`}
                      type="button"
                      onClick={() => setArticlePage(token)}
                      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-bold transition-colors ${
                        token === articlePage
                          ? 'bg-[#1cb5b0] text-white shadow-[0_6px_14px_rgba(28,181,176,0.35)]'
                          : 'text-[#0f9f9b] hover:bg-[#dff6f5]'
                      }`}
                      aria-current={token === articlePage ? 'page' : undefined}
                    >
                      {token}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => setArticlePage((prev) => Math.min(totalArticlePages, prev + 1))}
                  disabled={articlePage >= totalArticlePages}
                  className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#0f9f9b] hover:bg-[#dff6f5] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setArticlePage(totalArticlePages)}
                  disabled={articlePage >= totalArticlePages}
                  className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#0f9f9b] hover:bg-[#dff6f5] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  마지막
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={Boolean(selectedArticle)} onOpenChange={(open) => !open && setSelectedArticle(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-hidden overflow-x-hidden">
          {selectedArticle && selectedAnalysis && (
            <>
              <DialogHeader>
                <DialogTitle>기사 통계 팝업</DialogTitle>
                <DialogDescription>조회수, 검수 필요사항, 등록 이슈, 담당자 메모를 확인할 수 있습니다.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 overflow-y-auto overflow-x-hidden pr-1 max-h-[calc(88vh-8rem)]">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">제목</h4>
                  <p className="text-sm text-gray-700">{selectedArticle.title}</p>
                </div>

                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-800">감정/카테고리 수정</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <select
                      value={editingEmotion}
                      onChange={(e) => {
                        const nextEmotion = normalizeAdminEmotion(e.target.value);
                        const prevPresets = getCategoryPresetForEmotion(editingEmotion);
                        const nextPresets = getCategoryPresetForEmotion(nextEmotion);
                        setEditingEmotion(nextEmotion);
                        if (!editingCategory.trim() || prevPresets.includes(editingCategory)) {
                          setEditingCategory(nextPresets[0] || '');
                        }
                      }}
                      className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      {ADMIN_EMOTION_OPTIONS.map((emotion) => (
                        <option key={`modal-emotion-${emotion}`} value={emotion}>
                          {emotion.toUpperCase()}
                        </option>
                      ))}
                    </select>

                    <select
                      value={getCategoryPresetForEmotion(editingEmotion).includes(editingCategory) ? editingCategory : '__custom__'}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value !== '__custom__') {
                          setEditingCategory(value);
                        }
                      }}
                      className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      {getCategoryPresetForEmotion(editingEmotion).map((preset) => (
                        <option key={`modal-preset-${editingEmotion}-${preset}`} value={preset}>
                          {preset}
                        </option>
                      ))}
                      <option value="__custom__">직접 입력</option>
                    </select>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={editingCategory}
                      onChange={(e) => setEditingCategory(e.target.value)}
                      placeholder="카테고리 직접 입력"
                      className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <Button
                      onClick={handleSaveArticleClassification}
                      disabled={savingClassification}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      {savingClassification ? '저장 중...' : '분류 저장'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-gray-800">기사 내용 수정</h4>
                    <span className="text-[11px] text-gray-500">작성자/관리자 권한으로 저장</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600">제목</label>
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="기사 제목"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600">요약</label>
                    <textarea
                      value={editingSummary}
                      onChange={(e) => setEditingSummary(e.target.value)}
                      className="min-h-[82px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
                      placeholder="기사 요약"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600">본문</label>
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      className="min-h-[160px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
                      placeholder="기사 본문"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-gray-600">기사 이미지</label>
                      <span className="text-[11px] text-gray-500">{editingImage ? '등록됨' : '없음'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={handleSelectEditImageFile}>
                        <Upload className="w-3.5 h-3.5 mr-1" />
                        이미지 변경
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={handleGenerateEditImage} disabled={isGeneratingEditImage}>
                        <Sparkles className="w-3.5 h-3.5 mr-1" />
                        {isGeneratingEditImage ? 'AI 재생성 중...' : 'AI 이미지 재생성'}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={handleRemoveEditImage} disabled={!editingImage}>
                        <X className="w-3.5 h-3.5 mr-1" />
                        이미지 삭제
                      </Button>
                    </div>
                    <input
                      type="text"
                      value={editingImage}
                      onChange={(e) => setEditingImage(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="이미지 URL (업로드/AI 생성 시 자동 입력)"
                    />
                    {editingImage ? (
                      <button
                        type="button"
                        onClick={() => setImagePreviewUrl(editingImage)}
                        className="block w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 hover:opacity-95 transition-opacity"
                        title="이미지 전체 보기"
                      >
                        <img
                          src={editingImage}
                          alt="기사 이미지 미리보기"
                          className="h-40 w-full object-cover"
                          onError={() => toast({ title: '이미지 미리보기를 불러오지 못했습니다.', variant: 'destructive' })}
                        />
                      </button>
                    ) : (
                      <p className="text-[11px] text-gray-500">등록된 이미지가 없습니다.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600">출처</label>
                    <input
                      type="text"
                      value={editingSource}
                      onChange={(e) => setEditingSource(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="출처 URL 또는 출처명"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveArticleContent}
                      disabled={savingArticleContent}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      {savingArticleContent ? '저장 중...' : '기사 수정 저장'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard title="조회수" value={String(selectedArticle.views || 0)} icon={<Eye className="w-4 h-4 text-blue-600" />} bgColor="bg-blue-50" />
                  <StatCard title="저장수" value={String(selectedArticle.saves || 0)} icon={<CheckCircle className="w-4 h-4 text-green-600" />} bgColor="bg-green-50" />
                  <StatCard title="공개상태" value={getArticlePublished(selectedArticle) ? '게시중' : '숨김'} icon={<Clock className="w-4 h-4 text-purple-600" />} bgColor="bg-purple-50" />
                  <StatCard title="감정" value={(selectedArticle.emotion || '-').toUpperCase()} icon={<FileText className="w-4 h-4 text-indigo-600" />} bgColor="bg-indigo-50" />
                </div>

                <div className="rounded-lg border border-gray-200 p-3">
                  <p className={`text-sm font-semibold ${selectedAnalysis.severity === 'high' ? 'text-red-600' : selectedAnalysis.severity === 'medium' ? 'text-amber-600' : 'text-green-600'}`}>
                    검수 위험도: {selectedAnalysis.severity.toUpperCase()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">자동 진단 기준: 제목/요약/본문/출처/성과 지표</p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">검수 필요사항</h4>
                  {selectedAnalysis.issues.length === 0 ? (
                    <p className="text-sm text-green-700">현재 자동 진단 기준에서 특이 이슈가 없습니다.</p>
                  ) : (
                    <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                      {selectedAnalysis.issues.map((issue, idx) => (
                        <li key={`issue-${idx}`}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">등록된 이슈</h4>
                  {selectedReview?.issues?.length ? (
                    <div className="space-y-2">
                      {selectedReview.issues.map((issue, idx) => (
                        <div
                          key={`manual-issue-${idx}`}
                          className="flex items-start justify-between gap-2 rounded-md border border-amber-100 bg-amber-50/60 px-3 py-2"
                        >
                          <p className="text-sm text-gray-700 leading-relaxed">{issue}</p>
                          {selectedArticle && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleIssueEdit(selectedArticle.id, idx)}
                                className="h-7 w-7 rounded bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 inline-flex items-center justify-center"
                                title="이슈 수정"
                                aria-label="이슈 수정"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleIssueDelete(selectedArticle.id, idx)}
                                className="h-7 w-7 rounded bg-white text-red-600 border border-red-200 hover:bg-red-50 inline-flex items-center justify-center"
                                title="이슈 삭제"
                                aria-label="이슈 삭제"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">등록된 이슈가 없습니다.</p>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">개선 제안</h4>
                  {selectedAnalysis.suggestions.length === 0 ? (
                    <p className="text-sm text-gray-600">현재 추가 제안이 없습니다.</p>
                  ) : (
                    <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                      {selectedAnalysis.suggestions.map((suggestion, idx) => (
                        <li key={`suggestion-${idx}`}>{suggestion}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">담당자 메모</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedReview?.memo?.trim() ? selectedReview.memo : '저장된 메모가 없습니다.'}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(imagePreviewUrl)} onOpenChange={(open) => !open && setImagePreviewUrl('')}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>기사 이미지 전체 보기</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-auto rounded-lg bg-gray-950/95 p-2">
            {imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt="기사 이미지 전체 보기"
                className="mx-auto h-auto max-h-[78vh] w-auto max-w-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <input
        type="file"
        ref={editImageFileInputRef}
        onChange={handleEditImageFileChange}
        accept="image/*"
        className="hidden"
      />
      <div aria-hidden className="h-[100px]" />
      </div>
    </div>
  );
}

function CategoryBadge({ emotion, category }: { emotion?: string; category?: string }) {
  const label = String(category || '').trim();
  const fieldLabel = getCategoryFieldLabel(emotion, category);

  if (!label) {
    return (
      <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
        {fieldLabel}
      </span>
    );
  }

  if (isAiGeneratedCategory(label)) {
    return (
      <span
        className="inline-flex items-center justify-center h-8 min-w-8 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100"
        title="AI"
        aria-label="AI"
      >
        <Sparkles className="w-4 h-4" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
      {fieldLabel}
    </span>
  );
}

function EmotionCategoryCell({ emotion, category }: { emotion?: string; category?: string }) {
  const emotionKey = normalizeAdminEmotion(emotion);
  const emotionLabel = emotionKey.toUpperCase();
  const isAiCategory = isAiGeneratedCategory(category);
  const fieldLabel = getCategoryFieldLabel(emotion, category);

  return (
    <div className="grid grid-cols-1 gap-1.5 min-w-[220px] max-w-[230px]">
      <div className="inline-flex items-center gap-2">
        <span className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-bold text-white shadow-sm whitespace-nowrap" style={{ backgroundColor: getEmotionColor(emotionKey) }}>
          {emotionLabel}
        </span>
        {isAiCategory ? (
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 text-indigo-700"
            title="AI"
            aria-label="AI"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span aria-hidden className="inline-flex h-7 w-7" />
        )}
      </div>
      <span className="inline-flex h-7 items-center px-0 text-xs font-medium text-indigo-700 whitespace-nowrap">
        {fieldLabel}
      </span>
    </div>
  );
}

function IconActionButton({
  onClick,
  title,
  icon,
  className,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  className: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`h-9 w-9 rounded-md inline-flex items-center justify-center transition-colors ${className}`}
    >
      {icon}
    </button>
  );
}

function StatCard({
  title,
  value,
  icon,
  bgColor,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  bgColor: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-3 min-w-0">
      <div className={`p-2 rounded-xl shrink-0 ${bgColor}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 truncate">{title}</p>
        <p className="text-lg font-bold text-gray-900 break-all leading-tight">{value}</p>
        {subtitle ? <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function QuickInfo({ label, value, tone }: { label: string; value: string; tone: 'gray' | 'emerald' | 'amber' }) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
