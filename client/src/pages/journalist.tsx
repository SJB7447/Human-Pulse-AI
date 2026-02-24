import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Header } from '@/components/Header';
import {
  ArrowLeft,
  Search,
  Wand2,
  CheckCircle,
  Upload,
  Image as ImageIcon,
  Video,
  Send,
  Hash,
  AlertTriangle,
  BarChart3,
  FileText,
  Globe,
  Newspaper,
  Camera,
  Youtube,
  MessageCircle,
  Loader2,
  Type,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  ExternalLink,
  XCircle,
  Edit,
  Trash2,
  List,
  PenTool,
  RefreshCcw,
} from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EMOTION_CONFIG } from '@/lib/store';
import { GeminiService, AIServiceError, type KeywordNewsArticle } from '@/services/gemini';
import { getSupabase } from '@/services/supabaseClient';
import { DBService } from '@/services/DBService';
import { useToast } from '@/hooks/use-toast';

const PLATFORMS = [
  { id: 'interactive', label: '인터랙티브 페이지', Icon: Globe, description: 'HueBrief 서비스에 직접 발행' },
  { id: 'instagram', label: '인스타그램', Icon: Camera, description: 'AI 카드뉴스 이미지 자동 생성 (1080x1080)' },
  { id: 'youtube', label: '유튜브', Icon: Youtube, description: 'AI 숏폼 스크립트/영상 자동 생성' },
  { id: 'threads', label: '스레드', Icon: MessageCircle, description: 'AI 텍스트 스레드 요약 자동 생성' },
];

// Platform-specific deployment settings and SEO recommendations
const PLATFORM_SETTINGS: Record<string, {
  deploymentGuide: string[];
  seoTips: string[];
  bestTimes: string;
  contentFormat: string;
  characterLimit?: number;
}> = {
  interactive: {
    deploymentGuide: [
      '기사 작성 후 "발행" 버튼 클릭',
      '카테고리 및 감정 태그 자동 분류',
      '대시보드에 자동 게시',
      'SEO 메타 태그 자동 생성',
    ],
    seoTips: [
      '제목에 핵심 키워드 포함 (60자 이내)',
      '첫 문단에 핵심 정보 배치',
      '내부 링크 및 관련 기사 연결',
      '이미지 alt 텍스트 추가',
    ],
    bestTimes: '오전 8-9시, 오후 12-1시, 저녁 6-8시',
    contentFormat: 'HTML 기사 형식, 최소 500자 권장',
  },
  instagram: {
    deploymentGuide: [
      '1080x1080 카드뉴스 이미지 자동 생성',
      '캡션과 해시태그 자동 작성',
      'Instagram Graph API 연동 필요',
      '비즈니스/크리에이터 계정 필수',
    ],
    seoTips: [
      '해시태그 15~20개 사용',
      '첫 줄에 핵심 문구 배치',
      '이모지로 가독성 강화',
      '위치 태그/계정 멘션 활용',
    ],
    bestTimes: '오전 7-9시, 오후 12-2시, 저녁 7-9시',
    contentFormat: '이미지 1080x1080px, 캡션 2,200자 이내',
    characterLimit: 2200,
  },
  youtube: {
    deploymentGuide: [
      '9:16 세로 숏폼 영상(60초 이내)',
      '썸네일 및 제목 자동 생성',
      'YouTube Data API 연동 필요',
      '채널 인증 및 업로드 권한 설정',
    ],
    seoTips: [
      '제목에 검색 키워드 포함 (70자 이내)',
      '설명 첫 2줄에 핵심 내용 배치',
      '태그 10~15개 설정',
      '챕터 구분으로 시청 유지율 향상',
    ],
    bestTimes: '오후 2-4시, 저녁 8-10시',
    contentFormat: 'MP4 형식, 9:16 비율, 최대 60초',
  },
  threads: {
    deploymentGuide: [
      '텍스트 스레드 형식으로 분할',
      '각 스레드 500자 이내 요약',
      'Threads API 연동 필요',
      'Instagram 계정 연결 필수',
    ],
    seoTips: [
      '첫 스레드에 핵심 메시지 배치',
      '숫자/통계로 전달력 강화',
      '질문형 문장으로 참여 유도',
      '해시태그 3~5개 권장',
    ],
    bestTimes: '오전 8-10시, 저녁 7-9시',
    contentFormat: '텍스트 스레드, 각 500자 이내',
    characterLimit: 500,
  },
};

const TRENDING_KEYWORDS = ['AI 기술', '기후변화', '경제전망', '청년정책', '글로벌 트렌드'];

type WizardStep = 1 | 2 | 3;
const WIZARD_STEPS: Array<{ step: WizardStep; key: string; label: string }> = [
  { step: 1, key: 'topic', label: '주제' },
  { step: 2, key: 'keyword', label: '키워드' },
  { step: 3, key: 'draft', label: '초안' },
];
const WIZARD_STORAGE_KEY = 'journalist_wizard_s3_1';
const DRAFT_VERSION_STORAGE_KEY = 'journalist_draft_versions_s3_2';
const MAX_DRAFT_VERSIONS = 5;

const getArticleLinkLabel = (url?: string) => {
  if (!url) return '';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.length > 28 ? `${host.slice(0, 28)}...` : host;
  } catch {
    return '원문 링크';
  }
};

const cleanArticleText = (input?: string) =>
  String(input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeArticleSummary = (summary: string, title: string, source: string) => {
  const cleaned = cleanArticleText(summary);
  if (cleaned.length >= 24) return cleaned;
  return `${source || '외부 기사'} 보도를 바탕으로 '${cleanArticleText(title)}' 핵심 내용을 요약한 문장입니다.`;
};

const normalizeTitleForCompare = (title: string) =>
  String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const ensureGeneratedTitleDiffers = (title: string, fallbackSeed: string, index: number) => {
  const trimmed = String(title || '').trim();
  if (!trimmed) return `${fallbackSeed} | 인사이트 관점 ${index + 1}`;
  return trimmed;
};

const extractCategoryTokens = (value: unknown): string[] => {
  const text = String(value || '').trim();
  if (!text) return [];
  const tokens = text
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return Array.from(new Set(tokens));
};

const getEmotionVisual = (emotionRaw: unknown): { key: string; label: string; color: string } => {
  const key = String(emotionRaw || '').trim().toLowerCase();
  const config = EMOTION_CONFIG.find((row) => row.type === key);
  if (config) {
    return {
      key,
      label: config.labelKo || key.toUpperCase(),
      color: config.color || '#64748b',
    };
  }

  return {
    key: key || 'spectrum',
    label: key ? key.toUpperCase() : 'SPECTRUM',
    color: '#64748b',
  };
};

type WizardSnapshot = {
  searchKeyword: string;
  searchResults: { topics: string[]; context: string } | null;
  articleOutline: string;
  articleContent: string;
  wizardStep: WizardStep;
  updatedAt: number;
};

const hasRestorableWizardSnapshot = (snapshot: WizardSnapshot) =>
  Boolean(
    snapshot.searchKeyword?.trim() ||
    snapshot.articleOutline?.trim() ||
    snapshot.articleContent?.trim() ||
    snapshot.searchResults ||
    (snapshot.wizardStep && snapshot.wizardStep > 1),
  );

type DraftVersion = {
  id: string;
  createdAt: number;
  keyword: string;
  outline: string;
  content: string;
};

type AiUndoSnapshot = {
  searchKeyword: string;
  articleContent: string;
  grammarErrors: { original: string; corrected: string; reason: string }[];
  generatedHashtags: string[];
  optimizedTitles: { platform: string; title: string }[];
  selectedTitleIndex: number | null;
};

type AiStepKey =
  | 'keyword'
  | 'outline'
  | 'draft'
  | 'grammar'
  | 'translate'
  | 'hashtags'
  | 'titles'
  | 'compliance'
  | 'image'
  | 'video';

type MediaAnchor = 'core' | 'deepDive' | 'conclusion';
type MediaPosition = 'before' | 'inline' | 'after';
type MediaSlot = {
  id: string;
  type: 'image' | 'video';
  anchorLabel: MediaAnchor;
  position: MediaPosition;
  caption: string;
  sourceAssetKey: string;
  sourceUrl?: string;
};

type MediaAsset = {
  key: string;
  type: 'image' | 'video';
  label: string;
  url: string;
};

const ARTICLE_META_OPEN = '<!-- HUEBRIEF_META_START -->';
const ARTICLE_META_CLOSE = '<!-- HUEBRIEF_META_END -->';

export default function JournalistPage() {
  const { toast } = useToast();

  const [view, setView] = useState<'write' | 'list'>('write');
  const [myArticles, setMyArticles] = useState<any[]>([]);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [previewArticle, setPreviewArticle] = useState<any | null>(null);
  const [articleSearchQuery, setArticleSearchQuery] = useState('');
  const [articleCategoryFilter, setArticleCategoryFilter] = useState('all');
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());

  const [searchKeyword, setSearchKeyword] = useState('');
  const [articleOutline, setArticleOutline] = useState('');
  const [articleContent, setArticleContent] = useState('');
  const [draftSections, setDraftSections] = useState<{ core?: string; deepDive?: string; conclusion?: string } | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['interactive']);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [selectedHashtagIndices, setSelectedHashtagIndices] = useState<number[]>([]);
  const [optimizedTitles, setOptimizedTitles] = useState<{ platform: string; title: string }[]>([]);
  const [showDistributionSettings, setShowDistributionSettings] = useState(false);
  const [activeComposeStage, setActiveComposeStage] = useState<'author' | 'publish'>('author');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [aiUndoStack, setAiUndoStack] = useState<AiUndoSnapshot[]>([]);
  const [lastAiFailedStep, setLastAiFailedStep] = useState<AiStepKey | null>(null);
  const [lastAiErrorMessage, setLastAiErrorMessage] = useState('');
  const [draftBlockingError, setDraftBlockingError] = useState<string>('');
  const [draftBlockingIssues, setDraftBlockingIssues] = useState<string[]>([]);
  const [draftBlockingCode, setDraftBlockingCode] = useState<string>('');
  const [draftVersions, setDraftVersions] = useState<DraftVersion[]>([]);
  const [selectedCompareVersionId, setSelectedCompareVersionId] = useState<string | null>(null);
  const [showDraftVersions, setShowDraftVersions] = useState(false);
  const [selectedTitleIndex, setSelectedTitleIndex] = useState<number | null>(null);
  const [pendingWizardSnapshot, setPendingWizardSnapshot] = useState<WizardSnapshot | null>(null);
  const [showRestoreDraftBanner, setShowRestoreDraftBanner] = useState(false);

  // Loading states
  const [isSearching, setIsSearching] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);
  const [isGeneratingSEO, setIsGeneratingSEO] = useState(false);
  const [isOptimizingTitles, setIsOptimizingTitles] = useState(false);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);

  // Search results
  const [searchResults, setSearchResults] = useState<{ topics: string[]; context: string } | null>(null);
  const [recommendedArticles, setRecommendedArticles] = useState<KeywordNewsArticle[]>([]);
  const [selectedRecommendedArticleId, setSelectedRecommendedArticleId] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<'draft' | 'interactive-longform'>('draft');
  // Grammar check results
  const [grammarErrors, setGrammarErrors] = useState<{ original: string; corrected: string; reason: string }[]>([]);
  const [complianceResult, setComplianceResult] = useState<{
    riskLevel: 'low' | 'medium' | 'high';
    summary: string;
    flags: Array<{
      category: 'privacy' | 'defamation' | 'medical' | 'financial' | 'violent' | 'factual';
      severity: 'low' | 'medium' | 'high';
      reason: string;
      suggestion: string;
      evidenceSnippet?: string;
    }>;
  } | null>(null);
  // Media generation states
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [regeneratingImageIndex, setRegeneratingImageIndex] = useState<number | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{ imageUrl: string; description: string; prompt?: string }[]>([]);
  const [selectedImageIndices, setSelectedImageIndices] = useState<number[]>([0]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [generatedVideoScript, setGeneratedVideoScript] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [imagePromptInput, setImagePromptInput] = useState('');
  const [videoPromptInput, setVideoPromptInput] = useState('');
  const [suggestedMediaSlots, setSuggestedMediaSlots] = useState<MediaSlot[]>([]);

  // File upload states
  const [showUploadModal, setShowUploadModal] = useState<'image' | 'video' | null>(null);
  const [uploadedImages, setUploadedImages] = useState<{ name: string; url: string; size: number }[]>([]);
  const [uploadedVideos, setUploadedVideos] = useState<{ name: string; url: string; size: number }[]>([]);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500MB
  const fileInputRef = useRef<HTMLInputElement>(null);
  const keywordSectionRef = useRef<HTMLDivElement | null>(null);
  const writingSectionRef = useRef<HTMLDivElement | null>(null);
  const mediaToolSectionRef = useRef<HTMLDivElement | null>(null);
  const mediaPlacementRef = useRef<HTMLDivElement | null>(null);
  const draftVersionRef = useRef<HTMLDivElement | null>(null);
  const titleCandidateRef = useRef<HTMLDivElement | null>(null);
  const advancedToolRef = useRef<HTMLDivElement | null>(null);

  // Publishing states
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishingStatus, setPublishingStatus] = useState<Record<string, 'pending' | 'loading' | 'success' | 'error'>>({});
  const [publishResults, setPublishResults] = useState<Record<string, string>>({});
  const [isPublishingComplete, setIsPublishingComplete] = useState(false);
  const [isPublishingInProgress, setIsPublishingInProgress] = useState(false);
  const [publishGateFeedback, setPublishGateFeedback] = useState<{ errors: string[]; warnings: string[] } | null>(null);

  // Sentiment analysis state
  type EmotionOption = 'vibrance' | 'immersion' | 'clarity' | 'gravity' | 'serenity' | 'spectrum';
  const emotionOptions: EmotionOption[] = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'];
  const [selectedPublishEmotion, setSelectedPublishEmotion] = useState<EmotionOption>('spectrum');
  const [isEmotionManuallySelected, setIsEmotionManuallySelected] = useState(false);
  const [pendingAutoEmotion, setPendingAutoEmotion] = useState<EmotionOption | null>(null);

  const [sentimentData, setSentimentData] = useState<{
    vibrance: number;
    immersion: number;
    clarity: number;
    gravity: number;
    serenity: number;
    dominantEmotion: string;
    feedback: string;
  }>({
    vibrance: 20, immersion: 20, clarity: 20, gravity: 20, serenity: 20,
    dominantEmotion: 'spectrum',
    feedback: '기사 내용을 작성하면 감정 분석을 시작합니다.'
  });
  const [isAnalyzingSentiment, setIsAnalyzingSentiment] = useState(false);

  const hasAngerWarning = sentimentData.immersion > 40;
  const hasPublishErrors = Object.values(publishingStatus).includes('error');
  const autoRecommendedEmotion: EmotionOption = emotionOptions.includes(sentimentData.dominantEmotion as EmotionOption)
    ? (sentimentData.dominantEmotion as EmotionOption)
    : 'spectrum';
  const effectivePublishEmotion: EmotionOption = isEmotionManuallySelected
    ? selectedPublishEmotion
    : autoRecommendedEmotion;
  const unlockedWizardStep: WizardStep = articleContent.trim()
    ? 3
    : (recommendedArticles.length > 0 || searchResults || searchKeyword.trim())
      ? 2
      : 1;
  const selectedRecommendedArticle = selectedRecommendedArticleId
    ? recommendedArticles.find((row) => row.id === selectedRecommendedArticleId) || null
    : null;
  const publishStageRequirements: Array<{ key: 'step3' | 'step4'; label: string; done: boolean }> = [
    { key: 'step3', label: '추천 기사 선택', done: Boolean(selectedRecommendedArticle) },
    { key: 'step4', label: '본문 작성', done: Boolean(articleContent.trim()) },
  ];
  const missingPublishRequirements = publishStageRequirements.filter((item) => !item.done);
  const canEnterPublishStage = Boolean(
    selectedRecommendedArticle &&
    articleContent.trim(),
  );
  const flowCompletion = {
    step1: recommendedArticles.length > 0,
    step2: recommendedArticles.length >= 5,
    step3: Boolean(selectedRecommendedArticle),
    step4: Boolean(articleContent.trim()),
    step5: uploadedImages.length + uploadedVideos.length + generatedImages.length + (generatedVideoUrl ? 1 : 0) > 0,
    step51: Boolean(generatedImages.length > 0 || generatedVideoUrl || generatedVideoScript),
    step52: Boolean(imagePromptInput.trim() || videoPromptInput.trim()),
    step6: suggestedMediaSlots.length > 0,
    step7: draftVersions.length > 0,
    step8: optimizedTitles.length >= 3,
    step81: selectedTitleIndex !== null,
    step9: showDistributionSettings,
  };

  const authoringFlow: Array<{ key: keyof typeof flowCompletion; label: string }> = [
    { key: 'step1', label: '1. 키워드 검색' },
    { key: 'step2', label: '2. 기사 5개 추천/요약' },
    { key: 'step3', label: '3. 추천 기사 선택' },
    { key: 'step4', label: '4. 재작성 초안/롱폼 작성' },
    { key: 'step5', label: '5. 미디어 업로드/AI 생성' },
    { key: 'step51', label: '5-1. 기사 기반 프롬프트 자동생성' },
    { key: 'step52', label: '5-2. 프롬프트 수정 후 재생성' },
    { key: 'step6', label: '6. 미디어 배치' },
    { key: 'step7', label: '7. 초안 버전 접기/펼치기' },
    { key: 'step8', label: '8. 플랫폼 제목 후보 3개' },
    { key: 'step81', label: '8-1. 제목 선택 후 발행' },
    { key: 'step9', label: '9. 고급 도구 하단 표시' },
  ];

  const mediaAssets: MediaAsset[] = (() => {
    const generatedImageAssets = generatedImages.map((img, idx) => ({
      key: `gen-image-${idx}`,
      type: 'image' as const,
      label: `AI 이미지 ${idx + 1}`,
      url: img.imageUrl,
    }));
    const uploadedImageAssets = uploadedImages.map((img, idx) => ({
      key: `upload-image-${idx}`,
      type: 'image' as const,
      label: `업로드 이미지 ${idx + 1}: ${img.name}`,
      url: img.url,
    }));
    const generatedVideoAssets = generatedVideoUrl
      ? [{
        key: 'gen-video-0',
        type: 'video' as const,
        label: 'AI 숏폼 영상',
        url: generatedVideoUrl,
      }]
      : [];
    const uploadedVideoAssets = uploadedVideos.map((vid, idx) => ({
      key: `upload-video-${idx}`,
      type: 'video' as const,
      label: `업로드 영상 ${idx + 1}: ${vid.name}`,
      url: vid.url,
    }));
    return [
      ...generatedImageAssets,
      ...uploadedImageAssets,
      ...generatedVideoAssets,
      ...uploadedVideoAssets,
    ];
  })();

  const scrollToFlowSection = (key: keyof typeof flowCompletion) => {
    const sectionMap: Partial<Record<keyof typeof flowCompletion, { current: HTMLDivElement | null }>> = {
      step1: keywordSectionRef,
      step2: keywordSectionRef,
      step3: keywordSectionRef,
      step4: writingSectionRef,
      step5: mediaToolSectionRef,
      step51: mediaToolSectionRef,
      step52: mediaToolSectionRef,
      step6: mediaPlacementRef,
      step7: draftVersionRef,
      step8: titleCandidateRef,
      step81: titleCandidateRef,
      step9: advancedToolRef,
    };
    const targetRef = sectionMap[key];
    if (key === 'step9' && !showDistributionSettings) {
      setShowDistributionSettings(true);
      setTimeout(() => {
        targetRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return;
    }
    targetRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleEnterPublishStage = (scrollToMissing = false) => {
    if (!canEnterPublishStage) {
      toast({
        title: '배포 준비 단계 진입 조건 미충족',
        description: '추천 기사 선택 + 본문 작성이 필요합니다.',
        variant: 'destructive',
      });
      if (scrollToMissing && missingPublishRequirements.length > 0) {
        scrollToFlowSection(missingPublishRequirements[0].key);
      }
      return;
    }
    setActiveComposeStage('publish');
    setShowDistributionSettings(true);
  };

  // Debounced sentiment analysis
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setWizardStep((prev) => (prev < unlockedWizardStep ? unlockedWizardStep : prev));
  }, [unlockedWizardStep]);

  const goToWizardStep = (nextStep: WizardStep) => {
    if (nextStep <= unlockedWizardStep) {
      setWizardStep(nextStep);
      return;
    }

    toast({
      title: '이전 단계를 먼저 완료해 주세요',
      description: `현재 진행 가능한 단계: ${unlockedWizardStep}`,
      variant: 'destructive',
    });
  };

  const goToPreviousStep = () => {
    if (wizardStep <= 1) return;
    setWizardStep((wizardStep - 1) as WizardStep);
  };

  const goToNextStep = () => {
    const next = (wizardStep + 1) as WizardStep;
    if (wizardStep >= 3) return;
    goToWizardStep(next);
  };

  const clearWizardSnapshot = () => {
    try {
      localStorage.removeItem(WIZARD_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear wizard snapshot', error);
    }
    setLastSavedAt(null);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw) as WizardSnapshot;
      if (!snapshot || typeof snapshot !== 'object') return;
      if (!hasRestorableWizardSnapshot(snapshot)) return;
      setPendingWizardSnapshot(snapshot);
      setShowRestoreDraftBanner(true);
      if (snapshot.updatedAt) setLastSavedAt(snapshot.updatedAt);
    } catch (error) {
      console.warn('Failed to restore wizard snapshot', error);
    }
  }, []);

  useEffect(() => {
    if (view !== 'write') return;
    if (showRestoreDraftBanner) return;
    const snapshot: WizardSnapshot = {
      searchKeyword,
      searchResults,
      articleOutline,
      articleContent,
      wizardStep,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(snapshot));
      setLastSavedAt(snapshot.updatedAt);
    } catch (error) {
      console.warn('Failed to save wizard snapshot', error);
    }
  }, [view, showRestoreDraftBanner, searchKeyword, searchResults, articleOutline, articleContent, wizardStep]);

  const handleRestoreDraftSnapshot = () => {
    if (!pendingWizardSnapshot) return;
    const snapshot = pendingWizardSnapshot;
    setSearchKeyword(snapshot.searchKeyword || '');
    setSearchResults(snapshot.searchResults || null);
    setArticleOutline(snapshot.articleOutline || '');
    setArticleContent(snapshot.articleContent || '');
    setWizardStep(snapshot.wizardStep || 1);
    setLastSavedAt(snapshot.updatedAt || Date.now());
    setPendingWizardSnapshot(null);
    setShowRestoreDraftBanner(false);
    toast({ title: '작성 중이던 내용을 불러왔습니다.' });
  };

  const handleDiscardDraftSnapshot = () => {
    clearWizardSnapshot();
    setPendingWizardSnapshot(null);
    setShowRestoreDraftBanner(false);
    toast({ title: '새 문서로 시작합니다.' });
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_VERSION_STORAGE_KEY);
      if (!raw) return;
      const versions = JSON.parse(raw) as DraftVersion[];
      if (!Array.isArray(versions)) return;
      setDraftVersions(versions.slice(0, MAX_DRAFT_VERSIONS));
    } catch (error) {
      console.warn('Failed to restore draft versions', error);
    }
  }, []);

  const persistDraftVersions = (versions: DraftVersion[]) => {
    try {
      localStorage.setItem(DRAFT_VERSION_STORAGE_KEY, JSON.stringify(versions));
    } catch (error) {
      console.warn('Failed to save draft versions', error);
    }
  };

  const saveDraftVersion = (
    reason: 'manual' | 'auto' = 'manual',
    source?: Partial<Pick<DraftVersion, 'keyword' | 'outline' | 'content'>>,
  ) => {
    const keyword = source?.keyword ?? searchKeyword;
    const outline = source?.outline ?? articleOutline;
    const content = source?.content ?? articleContent;

    if (!content.trim() && !outline.trim()) {
      toast({ title: '저장할 스냅샷이 없습니다', variant: 'destructive' });
      return;
    }

    const version: DraftVersion = {
      id: `${Date.now()}`,
      createdAt: Date.now(),
      keyword,
      outline,
      content,
    };

    const next = [version, ...draftVersions].slice(0, MAX_DRAFT_VERSIONS);
    setDraftVersions(next);
    persistDraftVersions(next);

    if (reason === 'manual') {
      toast({ title: `스냅샷 저장 완료 (${next.length}/${MAX_DRAFT_VERSIONS})` });
    }
  };

  const restoreDraftVersion = (versionId: string) => {
    const version = draftVersions.find((item) => item.id === versionId);
    if (!version) return;

    setSearchKeyword(version.keyword);
    setArticleOutline(version.outline);
    setArticleContent(version.content);
    setWizardStep(3);
    toast({ title: '버전 복원이 완료되었습니다' });
  };

  const pushAiUndoSnapshot = () => {
    const snapshot: AiUndoSnapshot = {
      searchKeyword,
      articleContent,
      grammarErrors,
      generatedHashtags,
      optimizedTitles,
      selectedTitleIndex,
    };
    setAiUndoStack((prev) => [snapshot, ...prev].slice(0, 10));
  };

  const handleUndoAiResult = () => {
    if (aiUndoStack.length === 0) {
      toast({ title: '되돌릴 AI 변경 이력이 없습니다', variant: 'destructive' });
      return;
    }

    const [latest, ...rest] = aiUndoStack;
    setSearchKeyword(latest.searchKeyword);
    setArticleContent(latest.articleContent);
    setGrammarErrors(latest.grammarErrors);
    setGeneratedHashtags(latest.generatedHashtags);
    setSelectedHashtagIndices(latest.generatedHashtags.map((_, idx) => idx));
    setOptimizedTitles(latest.optimizedTitles);
    setSelectedTitleIndex(latest.selectedTitleIndex);
    setAiUndoStack(rest);
    toast({ title: '최근 AI 변경을 되돌렸습니다' });
  };

  const buildLineDiffSummary = (baseText: string, currentText: string) => {
    const baseLines = baseText.split('\n');
    const currentLines = currentText.split('\n');
    const max = Math.max(baseLines.length, currentLines.length);
    let changed = 0;

    for (let i = 0; i < max; i += 1) {
      if ((baseLines[i] ?? '') !== (currentLines[i] ?? '')) {
        changed += 1;
      }
    }

    return {
      baseLines: baseLines.length,
      currentLines: currentLines.length,
      changedLines: changed,
    };
  };

  const withArticleMeta = (
    bodyText: string,
    payload: { sections?: { core?: string; deepDive?: string; conclusion?: string }; mediaSlots?: MediaSlot[] },
  ) => {
    const plain = String(bodyText || '')
      .replace(new RegExp(`${ARTICLE_META_OPEN}[\\s\\S]*?${ARTICLE_META_CLOSE}\\s*`, 'g'), '')
      .trim();
    const metaJson = JSON.stringify(payload);
    return `${ARTICLE_META_OPEN}\n${metaJson}\n${ARTICLE_META_CLOSE}\n\n${plain}`;
  };

  const parseArticleMeta = (content: string): {
    plainText: string;
    sections?: { core?: string; deepDive?: string; conclusion?: string };
    mediaSlots?: MediaSlot[];
  } => {
    const text = String(content || '');
    const regex = new RegExp(`${ARTICLE_META_OPEN}\\s*([\\s\\S]*?)\\s*${ARTICLE_META_CLOSE}`);
    const match = text.match(regex);
    if (!match) return { plainText: text };

    try {
      const parsed = JSON.parse(match[1]);
      const plainText = text.replace(regex, '').trim();
      const mediaSlots = Array.isArray(parsed?.mediaSlots)
        ? parsed.mediaSlots
          .map((slot: any, idx: number) => ({
            id: String(slot?.id || `m${idx + 1}`),
            type: slot?.type === 'video' ? 'video' : 'image',
            anchorLabel: ['core', 'deepDive', 'conclusion'].includes(String(slot?.anchorLabel))
              ? String(slot.anchorLabel) as MediaAnchor
              : 'deepDive',
            position: ['before', 'inline', 'after'].includes(String(slot?.position))
              ? String(slot.position) as MediaPosition
              : 'inline',
            caption: String(slot?.caption || '추천 미디어 배치'),
            sourceAssetKey: String(slot?.sourceAssetKey || ''),
            sourceUrl: String(slot?.sourceUrl || ''),
          }))
          : [];
      return {
        plainText,
        sections: parsed?.sections,
        mediaSlots,
      };
    } catch {
      return { plainText: text.replace(regex, '').trim() };
    }
  };

  const handleAddMediaSlot = (type: 'image' | 'video') => {
    const candidates = mediaAssets.filter((asset) => asset.type === type);
    if (candidates.length === 0) {
      toast({
        title: type === 'image' ? '사용 가능한 이미지가 없습니다' : '사용 가능한 영상이 없습니다',
        description: '미디어 도구에서 먼저 업로드하거나 생성해 주세요.',
        variant: 'destructive',
      });
      return;
    }
    const firstAsset = candidates[0];
    setSuggestedMediaSlots((prev) => ([
      ...prev,
      {
        id: `m${Date.now()}`,
        type,
        anchorLabel: 'deepDive',
        position: 'inline',
        caption: type === 'video' ? '톤 전환용 요약 영상' : '맥락 보조 이미지',
        sourceAssetKey: firstAsset.key,
        sourceUrl: firstAsset.url,
      },
    ]));
  };

  const handleMoveMediaSlot = (id: string, direction: 'up' | 'down') => {
    setSuggestedMediaSlots((prev) => {
      const idx = prev.findIndex((slot) => slot.id === id);
      if (idx < 0) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleUpdateMediaSlot = (id: string, patch: Partial<MediaSlot>) => {
    setSuggestedMediaSlots((prev) =>
      prev.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)),
    );
  };

  const handleRemoveMediaSlot = (id: string) => {
    setSuggestedMediaSlots((prev) => prev.filter((slot) => slot.id !== id));
  };

  const buildPublishQualityGate = () => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const plain = String(articleContent || '')
      .replace(new RegExp(`${ARTICLE_META_OPEN}[\\s\\S]*?${ARTICLE_META_CLOSE}\\s*`, 'g'), '')
      .trim();

    if (!plain) {
      errors.push('기사 본문이 비어 있습니다.');
      return { errors, warnings };
    }

    const paragraphs = plain
      .split(/\n\s*\n/g)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length < 8) {
      warnings.push(`문단 수가 ${paragraphs.length}개입니다. 롱폼 기준(8문단 이상) 권장`);
    }

    const hangulCount = (plain.match(/[가-힣]/g) || []).length;
    const latinCount = (plain.match(/[A-Za-z]/g) || []).length;
    const alphaTotal = hangulCount + latinCount;
    const hangulRatio = alphaTotal > 0 ? hangulCount / alphaTotal : 1;
    if (hangulRatio < 0.7) {
      errors.push(`한글 비율이 낮습니다(${Math.round(hangulRatio * 100)}%). 한국어 중심 본문으로 보완해 주세요.`);
    }

    const inferSectionsFromPlainText = (text: string) => {
      const chunks = text
        .split(/\n\s*\n/g)
        .map((p) => p.trim())
        .filter(Boolean);

      if (chunks.length === 0) {
        return { core: '', deepDive: '', conclusion: '' };
      }

      if (chunks.length < 3) {
        const joined = chunks.join('\n\n');
        return { core: joined, deepDive: joined, conclusion: joined };
      }

      const third = Math.max(1, Math.floor(chunks.length / 3));
      const corePart = chunks.slice(0, third).join('\n\n').trim();
      const deepDivePart = chunks.slice(third, Math.max(third * 2, third + 1)).join('\n\n').trim();
      const conclusionPart = chunks.slice(Math.max(third * 2, third + 1)).join('\n\n').trim();

      return {
        core: corePart,
        deepDive: deepDivePart || corePart,
        conclusion: conclusionPart || deepDivePart || corePart,
      };
    };

    const inferredSections = inferSectionsFromPlainText(plain);
    const core = String(draftSections?.core || inferredSections.core || '').trim();
    const deepDive = String(draftSections?.deepDive || inferredSections.deepDive || '').trim();
    const conclusion = String(draftSections?.conclusion || inferredSections.conclusion || '').trim();
    if (!core || !deepDive || !conclusion) {
      errors.push('섹션 구조가 부족합니다. 핵심/심화 시사점/결론을 모두 작성해 주세요.');
    } else {
      if (core.length < 100) warnings.push('핵심 섹션 분량이 짧습니다.');
      if (deepDive.length < 140) warnings.push('심화 시사점 섹션 분량이 짧습니다.');
      if (conclusion.length < 80) warnings.push('결론 섹션 분량이 짧습니다.');
    }

    const allowedAnchors: MediaAnchor[] = ['core', 'deepDive', 'conclusion'];
    const invalidSlots = suggestedMediaSlots.filter(
      (slot) => {
        const hasValidAnchor = allowedAnchors.includes(slot.anchorLabel);
        const hasCaption = Boolean(String(slot.caption || '').trim());
        const matchedAsset = mediaAssets.find((asset) => asset.key === slot.sourceAssetKey && asset.type === slot.type);
        return !hasValidAnchor || !hasCaption || !matchedAsset || !String(slot.sourceUrl || '').trim();
      },
    );
    if (invalidSlots.length > 0) {
      errors.push('미디어 배치 정보가 유효하지 않습니다. 앵커와 캡션을 확인해 주세요.');
    }

    if (suggestedMediaSlots.length === 0) {
      warnings.push('미디어 배치가 없습니다. 이미지/영상 1개 이상 권장');
    }

    if (selectedRecommendedArticle && !/\[출처\]/.test(plain)) {
      errors.push('외부 기사 기반 작성은 출처 표기가 필수입니다. [출처] 항목을 확인해 주세요.');
    }

    return { errors, warnings };
  };

  const handleAnalyzeSentiment = useCallback(async () => {
    if (!articleContent.trim() || articleContent.length < 50) return;

    setIsAnalyzingSentiment(true);
    try {
      const result = await GeminiService.analyzeSentiment(articleContent);
      const koreanFeedback = /[가-힣]/.test(result.feedback || '')
        ? result.feedback
        : '감정 분석 결과가 영문으로 반환되어 한국어 안내 문구로 대체했습니다.';
      setSentimentData(result);
      if (koreanFeedback !== result.feedback) {
        setSentimentData(prev => ({ ...prev, feedback: koreanFeedback }));
      }
    } catch (error) {
      console.error('Sentiment analysis failed:', error);
      // Fallback to neutral if analysis fails
      setSentimentData({
        vibrance: 20, immersion: 20, clarity: 20, gravity: 20, serenity: 20,
        dominantEmotion: 'serenity',
        feedback: '감정 분석 서비스가 일시적으로 지연되고 있습니다. (기본값 적용)'
      });
      toast({
        title: '감정 분석 지연',
        description: 'AI 서비스 응답이 늦어 기본 감정값으로 설정했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzingSentiment(false);
    }
  }, [articleContent]);

  // Auto-analyze when content changes (debounced)
  useEffect(() => {
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current);
    }

    if (articleContent.trim().length >= 100) {
      analysisTimeoutRef.current = setTimeout(() => {
        handleAnalyzeSentiment();
      }, 2000); // Wait 2 seconds after typing stops
    }

    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }
    };
  }, [articleContent, handleAnalyzeSentiment]);

  useEffect(() => {
    if (!isEmotionManuallySelected) {
      setSelectedPublishEmotion(autoRecommendedEmotion);
      setPendingAutoEmotion(null);
      return;
    }

    if (selectedPublishEmotion !== autoRecommendedEmotion) {
      setPendingAutoEmotion(autoRecommendedEmotion);
    } else {
      setPendingAutoEmotion(null);
    }
  }, [autoRecommendedEmotion, isEmotionManuallySelected, selectedPublishEmotion]);

  const handleSelectPublishEmotion = (emotion: EmotionOption) => {
    setSelectedPublishEmotion(emotion);
    setIsEmotionManuallySelected(true);
    setPendingAutoEmotion(emotion === autoRecommendedEmotion ? null : autoRecommendedEmotion);
  };

  const handleResetPublishEmotionToAuto = () => {
    setSelectedPublishEmotion(autoRecommendedEmotion);
    setIsEmotionManuallySelected(false);
    setPendingAutoEmotion(null);
    toast({ title: '발행 감정 모드를 자동으로 변경했습니다' });
  };

  const updateJournalistViewHistory = (
    nextView: 'write' | 'list',
    options?: { replace?: boolean; editId?: string | null },
  ) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', nextView);
    if (nextView === 'write' && options?.editId) {
      url.searchParams.set('edit', options.editId);
    } else {
      url.searchParams.delete('edit');
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (options?.replace) {
      window.history.replaceState(window.history.state, '', nextUrl);
      return;
    }
    window.history.pushState(window.history.state, '', nextUrl);
  };

  const applyViewFromUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const nextView = params.get('view') === 'list' ? 'list' : 'write';
    setView(nextView);
    if (nextView === 'list') {
      setEditingArticleId(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    applyViewFromUrl();
    const handlePopState = () => {
      applyViewFromUrl();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyViewFromUrl]);

  // --- Start of My Articles Handlers ---
  const fetchMyArticles = useCallback(async () => {
    setIsLoadingArticles(true);
    try {
      const user = await DBService.getCurrentUser();
      if (user) {
        const profile = (user as any)?.profile || {};
        const metadata = (user as any)?.user_metadata || {};
        const email = String((user as any)?.email || profile?.email || '').trim();
        const emailLocal = email.includes('@') ? email.split('@')[0] : '';
        const authorNames = [
          profile?.username,
          metadata?.name,
          (user as any)?.name,
          emailLocal,
          email,
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean);

        const articles = await DBService.getMyArticles(String((user as any)?.id || ''), {
          authorNames,
          authorEmails: [email],
        });
        setMyArticles(articles);
      }
    } catch (error) {
      console.error("Failed to fetch articles:", error);
    } finally {
      setIsLoadingArticles(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'list') {
      fetchMyArticles();
    }
  }, [view, fetchMyArticles]);

  useEffect(() => {
    setSelectedArticleIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(myArticles.map((article) => String(article.id)));
      const next = new Set(Array.from(prev).filter((id) => validIds.has(String(id))));
      return next.size === prev.size ? prev : next;
    });
  }, [myArticles]);

  const articleCategoryOptions = useMemo(
    () =>
      EMOTION_CONFIG
        .filter((emotion) => emotion.type !== 'spectrum')
        .map((emotion) => ({
          value: emotion.type,
          label: emotion.labelKo || emotion.type.toUpperCase(),
        })),
    [],
  );

  const filteredMyArticles = useMemo(() => {
    const query = articleSearchQuery.trim().toLowerCase();
    return myArticles.filter((article) => {
      if (articleCategoryFilter !== 'all') {
        const emotion = String(article?.emotion || '').trim().toLowerCase();
        if (emotion !== articleCategoryFilter) {
          return false;
        }
      }

      if (!query) return true;
      const haystack = [
        article?.title,
        article?.summary,
        article?.content,
        article?.source,
        article?.category,
        article?.emotion,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });
  }, [myArticles, articleCategoryFilter, articleSearchQuery]);

  const selectedFilteredCount = useMemo(
    () => filteredMyArticles.filter((article) => selectedArticleIds.has(String(article.id))).length,
    [filteredMyArticles, selectedArticleIds],
  );

  const allFilteredSelected = filteredMyArticles.length > 0 && selectedFilteredCount === filteredMyArticles.length;

  const toggleSelectArticle = (articleId: string) => {
    setSelectedArticleIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedArticleIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredMyArticles.forEach((article) => next.delete(String(article.id)));
      } else {
        filteredMyArticles.forEach((article) => next.add(String(article.id)));
      }
      return next;
    });
  };

  const handleBulkDeleteSelected = async () => {
    const targetIds = filteredMyArticles
      .map((article) => String(article.id))
      .filter((id) => selectedArticleIds.has(id));

    if (targetIds.length === 0) {
      toast({ title: '선택된 기사가 없습니다.', variant: 'destructive' });
      return;
    }

    if (!confirm(`선택한 기사 ${targetIds.length}건을 삭제하시겠습니까?`)) return;

    const results = await Promise.allSettled(targetIds.map((id) => DBService.deleteArticle(id)));
    const successCount = results.filter((row) => row.status === 'fulfilled').length;
    const failedCount = results.length - successCount;

    if (successCount > 0) {
      toast({ title: '일괄 삭제 완료', description: `${successCount}건 삭제했습니다.` });
    }
    if (failedCount > 0) {
      toast({
        title: '일부 삭제 실패',
        description: `${failedCount}건 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.`,
        variant: 'destructive',
      });
    }

    setSelectedArticleIds((prev) => {
      const next = new Set(prev);
      targetIds.forEach((id) => next.delete(id));
      return next;
    });
    await fetchMyArticles();
  };

  const handleDeleteArticle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('정말로 이 기사를 삭제하시겠습니까?')) return;
    try {
      await DBService.deleteArticle(id);
      toast({ title: '기사가 삭제되었습니다' });
      fetchMyArticles();
    } catch (error) {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  const handleEditArticle = (article: any) => {
    setPendingWizardSnapshot(null);
    setShowRestoreDraftBanner(false);
    setEditingArticleId(article.id);
    setPreviewArticle(null);
    setSearchKeyword(article.title);
    setArticleOutline('');
    const parsed = parseArticleMeta(article.content || '');
    setArticleContent(parsed.plainText || '');
    setDraftSections(parsed.sections || null);
    setSuggestedMediaSlots(parsed.mediaSlots || []);
    setWizardStep(3);
    // Restore tags if possible (simple split)
    if (article.category) {
      setGeneratedHashtags(article.category.split(' '));
    }
    setActiveComposeStage('author');
    setView('write');
    updateJournalistViewHistory('write', { editId: String(article.id || '') });
  };

  const handleClearForm = () => {
    clearWizardSnapshot();
    setPendingWizardSnapshot(null);
    setShowRestoreDraftBanner(false);
    setEditingArticleId(null);
    setSearchKeyword('');
    setArticleOutline('');
    setArticleContent('');
    setDraftSections(null);
    setSearchResults(null);
    setRecommendedArticles([]);
    setSelectedRecommendedArticleId(null);
    setDraftMode('draft');
    setWizardStep(1);
    setSelectedPlatforms(['interactive']);
    setGeneratedHashtags([]);
    setSelectedHashtagIndices([]);
    setOptimizedTitles([]);
    setSuggestedMediaSlots([]);
    setImagePromptInput('');
    setVideoPromptInput('');
    setDraftBlockingError('');
    setDraftBlockingIssues([]);
    setDraftBlockingCode('');
    setPublishGateFeedback(null);
    setSentimentData({
      vibrance: 20, immersion: 20, clarity: 20, gravity: 20, serenity: 20,
      dominantEmotion: 'spectrum',
      feedback: '기사 내용을 작성하면 감정 분석을 시작합니다.'
    });
    setSelectedPublishEmotion('spectrum');
    setIsEmotionManuallySelected(false);
  };
  // --- End of My Articles Handlers ---

  const handleSearchKeyword = async () => {
    if (!searchKeyword.trim()) {
      toast({ title: '키워드를 입력해 주세요', variant: 'destructive' });
      return;
    }

    setIsSearching(true);
    setSearchResults(null);
    setRecommendedArticles([]);
    setSelectedRecommendedArticleId(null);

    try {
      const result = await GeminiService.searchKeywordNews(searchKeyword);
      const normalizedArticles = (result.articles || []).map((item, index) => ({
        ...item,
        id: item.id || `ext-${index + 1}`,
        title: cleanArticleText(item.title) || `${searchKeyword} 관련 기사 ${index + 1}`,
        summary: normalizeArticleSummary(item.summary, item.title, item.source),
      }));
      setRecommendedArticles(normalizedArticles);
      setSearchResults({
        topics: normalizedArticles.map((item) => item.title).slice(0, 5),
        context: result.fallbackUsed && result.diagnostics
          ? `'${result.keyword}' 외부 기사 연결이 불안정합니다. (${result.diagnostics.stage}: ${result.diagnostics.reason}) 임시 추천 ${normalizedArticles.length || 0}건으로 진행하세요.`
          : `'${result.keyword}' 관련 외부 기사 ${normalizedArticles.length || 0}건을 확인했습니다. 기사 선택 후 초안을 생성하세요.`,
      });
      setWizardStep((prev) => (prev < 2 ? 2 : prev));
      setLastAiFailedStep(null);
      setLastAiErrorMessage('');
      if (result.fallbackUsed) {
        const diagnosticLabel = result.diagnostics
          ? ` (${result.diagnostics.stage}: ${result.diagnostics.reason})`
          : '';
        toast({ title: '키워드 검색 완료', description: `외부 검색 실패로 기본 추천 목록이 적용되었습니다${diagnosticLabel}.` });
      } else {
        toast({ title: '키워드 검색 완료', description: '추천 기사 5개를 불러왔습니다.' });
      }
    } catch (error: any) {
      const fallbackArticles = Array.from({ length: 5 }).map((_, idx) => ({
        id: `local-fallback-${idx + 1}`,
        title: `${searchKeyword} 관련 핵심 이슈 ${idx + 1}`,
        summary: `${searchKeyword} 키워드를 중심으로 최근 쟁점을 정리한 참고 기사 요약입니다. (로컬 폴백)`,
        url: '',
        source: '로컬 폴백',
        publishedAt: new Date().toISOString(),
      }));
      setRecommendedArticles(fallbackArticles);
      setSearchResults({
        topics: fallbackArticles.map((item) => item.title),
        context: `'${searchKeyword}' 검색 서버 연결이 불안정하여 임시 추천 목록을 생성했습니다. 기사 선택 후 계속 진행할 수 있습니다.`,
      });
      setWizardStep((prev) => (prev < 2 ? 2 : prev));
      setLastAiFailedStep('keyword');
      setLastAiErrorMessage(error?.message || '키워드 분석 실패');
      toast({ title: '검색 연결 불안정', description: '임시 추천 목록으로 전환했습니다.', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (unlockedWizardStep < 2) {
      toast({
        title: '키워드 단계를 먼저 완료해 주세요',
        description: '키워드 검색 후 추천 기사 1개를 선택하면 초안을 생성할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }
    if (!selectedRecommendedArticle) {
      toast({ title: '추천 기사 선택 후 진행해 주세요', variant: 'destructive' });
      return;
    }

    const keyword = searchKeyword.trim() || '최신 이슈';
    setIsGeneratingDraft(true);
    setDraftBlockingError('');
    setDraftBlockingIssues([]);
    setDraftBlockingCode('');

    const parseDraftGateError = (error: unknown): { code: string; message: string; issues: string[] } => {
      if (!(error instanceof AIServiceError)) {
        return {
          code: 'AI_DRAFT_UNKNOWN_ERROR',
          message: (error as any)?.message || '초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
          issues: [],
        };
      }

      const issueMessages = (error.issues || [])
        .map((issue) => String(issue.message || issue.type || '').trim())
        .filter(Boolean);

      if (error.code === 'AI_DRAFT_SCHEMA_INVALID') {
        return {
          code: error.code,
          message: '초안이 모드 규칙을 충족하지 못해 차단되었습니다. 조건을 조정해 다시 생성해 주세요.',
          issues: issueMessages,
        };
      }
      if (error.code === 'AI_DRAFT_SIMILARITY_BLOCKED') {
        return {
          code: error.code,
          message: '참고 기사와 유사도가 높아 초안이 차단되었습니다. 다른 관점으로 다시 생성해 주세요.',
          issues: issueMessages,
        };
      }
      if (error.code === 'AI_DRAFT_COMPLIANCE_BLOCKED') {
        const complianceIssues = (error.compliance?.flags || [])
          .map((flag) => `${flag.category}: ${flag.suggestion}`)
          .slice(0, 4);
        return {
          code: error.code,
          message: '컴플라이언스 고위험 항목이 감지되어 초안 반영이 차단되었습니다.',
          issues: complianceIssues.length > 0 ? complianceIssues : issueMessages,
        };
      }

      return {
        code: error.code || 'AI_DRAFT_UNKNOWN_ERROR',
        message: error.message || '초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        issues: issueMessages,
      };
    };

    try {
      const result = await GeminiService.generateArticleDraft({
        keyword,
        mode: draftMode,
        selectedArticle: {
          title: selectedRecommendedArticle.title,
          summary: selectedRecommendedArticle.summary,
          url: selectedRecommendedArticle.url,
          source: selectedRecommendedArticle.source,
        },
      });
      if (result.fallbackUsed) {
        setLastAiFailedStep('draft');
        setLastAiErrorMessage('AI 응답 파싱 실패로 초안 생성을 차단했습니다.');
        setDraftBlockingError('초안 생성이 실패했습니다. 현재 결과는 임시 템플릿으로 판단되어 본문 반영을 차단했습니다. 다시 시도해 주세요.');
        return;
      }
      const generatedContent = `[${result.title}]\n\n${result.content}`;
      setArticleContent(generatedContent);
      setDraftSections(result.sections || null);
      setComplianceResult(result.compliance || null);
      setSuggestedMediaSlots(
        (result.mediaSlots || []).map((slot, idx) => ({
          id: String(slot.id || `m${idx + 1}`),
          type: slot.type === 'video' ? 'video' : 'image',
          anchorLabel: slot.anchorLabel === 'core' || slot.anchorLabel === 'deepDive' || slot.anchorLabel === 'conclusion'
            ? slot.anchorLabel
            : 'deepDive',
          position: slot.position === 'before' || slot.position === 'inline' || slot.position === 'after'
            ? slot.position
            : 'inline',
          caption: String(slot.caption || '추천 미디어 배치'),
          sourceAssetKey: '',
          sourceUrl: '',
        })),
      );
      if (!imagePromptInput.trim()) {
        setImagePromptInput(`${result.title} 기사 핵심 장면, 사실 기반 뉴스 일러스트`);
      }
      if (!videoPromptInput.trim()) {
        setVideoPromptInput(`${result.title} 핵심 내용을 30초 뉴스 숏폼으로 요약`);
      }
      setWizardStep(3);
      saveDraftVersion('auto', {
        keyword,
        outline: articleOutline,
        content: generatedContent,
      });
      setLastAiFailedStep(null);
      setLastAiErrorMessage('');
      setDraftBlockingIssues([]);
      setDraftBlockingCode('');
      toast({ title: '초안 생성 완료' });
    } catch (error: any) {
      const parsedError = parseDraftGateError(error);
      setLastAiFailedStep('draft');
      setLastAiErrorMessage(parsedError.message || '초안 생성 실패');
      setDraftBlockingError(parsedError.message);
      setDraftBlockingIssues(parsedError.issues);
      setDraftBlockingCode(parsedError.code);
      toast({ title: '초안 생성 실패', description: parsedError.message, variant: 'destructive' });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const [isTranslating, setIsTranslating] = useState(false);

  const handleTranslate = async () => {
    if (!articleContent.trim()) {
      toast({ title: '번역할 내용을 입력해 주세요', variant: 'destructive' });
      return;
    }

    pushAiUndoSnapshot();
    setIsTranslating(true);

    try {
      const result = await GeminiService.translateText(articleContent);
      setArticleContent(result.translatedText);
      setLastAiFailedStep(null);
      setLastAiErrorMessage('');
      toast({ title: '번역 완료', description: '내용을 한글로 번역했습니다.' });
    } catch (error: any) {
      setLastAiFailedStep('translate');
      setLastAiErrorMessage(error?.message || '번역 실패');
      toast({ title: '번역 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCheckGrammar = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 입력해 주세요', variant: 'destructive' });
      return;
    }

    pushAiUndoSnapshot();
    setIsCheckingGrammar(true);
    setGrammarErrors([]);

    try {
      const result = await GeminiService.checkGrammar(articleContent);
      setArticleContent(result.correctedText);
      setGrammarErrors(result.errors);
      setLastAiFailedStep(null);
      setLastAiErrorMessage('');

      if (result.errors.length === 0) {
        toast({ title: '검사 완료', description: '오류가 없습니다!' });
      } else {
        toast({ title: '검사 완료', description: `${result.errors.length}개의 수정 사항을 적용했습니다.` });
      }
    } catch (error: any) {
      setLastAiFailedStep('grammar');
      setLastAiErrorMessage(error?.message || 'Grammar check failed');
      toast({ title: '검사 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsCheckingGrammar(false);
    }
  };

  const handleGenerateSEO = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 먼저 작성해 주세요', variant: 'destructive' });
      return;
    }

    pushAiUndoSnapshot();
    setIsGeneratingSEO(true);

    try {
      const result = await GeminiService.generateHashtags(articleContent, selectedPlatforms);
      setGeneratedHashtags(result.hashtags);
      setSelectedHashtagIndices(result.hashtags.map((_, idx) => idx));
      setLastAiFailedStep(null);
      setLastAiErrorMessage('');
      toast({ title: '해시태그 생성 완료' });
    } catch (error: any) {
      setLastAiFailedStep('hashtags');
      setLastAiErrorMessage(error?.message || 'Hashtag generation failed');
      toast({ title: '생성 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsGeneratingSEO(false);
    }
  };

  const handleOptimizeTitles = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 먼저 작성해 주세요', variant: 'destructive' });
      return;
    }

    pushAiUndoSnapshot();
    setIsOptimizingTitles(true);
    setSelectedTitleIndex(null); // 초기화 selection

    try {
      const result = await GeminiService.optimizeTitles(articleContent, selectedPlatforms);
      const bracketTitleMatch = String(articleContent || '').match(/^\s*\[([^\]]+)\]/);
      const currentTitleCandidates = new Set(
        [searchKeyword, selectedRecommendedArticle?.title, bracketTitleMatch?.[1]]
          .map((item) => normalizeTitleForCompare(String(item || '')))
          .filter(Boolean),
      );
      const fallbackSeed = (searchKeyword || selectedRecommendedArticle?.title || '새로운 관점 기사').trim();
      const usedTitleSet = new Set(currentTitleCandidates);
      const patchedTitles = (result.titles || []).map((item, index) => {
        const safeTitle = ensureGeneratedTitleDiffers(item.title, fallbackSeed, index);
        const normalized = normalizeTitleForCompare(safeTitle);
        if (!usedTitleSet.has(normalized)) {
          usedTitleSet.add(normalized);
          return { ...item, title: safeTitle };
        }
        const revisedTitle = `${safeTitle} | 심층 포인트 ${index + 1}`;
        usedTitleSet.add(normalizeTitleForCompare(revisedTitle));
        return { ...item, title: revisedTitle };
      });

      setOptimizedTitles(patchedTitles);
      setLastAiFailedStep(null);
      setLastAiErrorMessage('');
      toast({ title: '제목 최적화 완료', description: '사용할 제목을 선택해 주세요.' });
    } catch (error: any) {
      setLastAiFailedStep('titles');
      setLastAiErrorMessage(error?.message || '제목 최적화 실패');
      toast({ title: '제목 최적화 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsOptimizingTitles(false);
    }
  };

  const handleCheckCompliance = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 먼저 작성해 주세요', variant: 'destructive' });
      return;
    }

    setIsCheckingCompliance(true);
    try {
      const result = await GeminiService.checkCompliance(articleContent);
      setComplianceResult(result);
      setLastAiFailedStep(null);
      setLastAiErrorMessage('');
      toast({ title: '컴플라이언스 점검 완료' });
    } catch (error: any) {
      setLastAiFailedStep('compliance');
      setLastAiErrorMessage(error?.message || '컴플라이언스 점검 실패');
      toast({ title: '컴플라이언스 점검 실패', description: error?.message, variant: 'destructive' });
    } finally {
      setIsCheckingCompliance(false);
    }
  };

  const handleApplySelectedTitle = () => {
    if (selectedTitleIndex === null || !optimizedTitles[selectedTitleIndex]) {
      toast({ title: '제목을 먼저 선택해 주세요', variant: 'destructive' });
      return;
    }

    pushAiUndoSnapshot();
    setSearchKeyword(optimizedTitles[selectedTitleIndex].title);
    toast({ title: '선택한 제목을 적용했습니다' });
  };

  const handleApplySelectedHashtags = () => {
    if (generatedHashtags.length === 0) {
      toast({ title: '선택 가능한 해시태그가 없습니다', variant: 'destructive' });
      return;
    }
    if (selectedHashtagIndices.length === 0) {
      toast({ title: '해시태그를 하나 이상 선택해 주세요', variant: 'destructive' });
      return;
    }

    pushAiUndoSnapshot();
    const selected = selectedHashtagIndices
      .map((index) => generatedHashtags[index])
      .filter((tag): tag is string => Boolean(tag));
    setGeneratedHashtags(selected);
    setSelectedHashtagIndices(selected.map((_, idx) => idx));
    toast({ title: '선택한 해시태그를 적용했습니다' });
  };

  const handleClearAiResults = () => {
    pushAiUndoSnapshot();
    setGrammarErrors([]);
    setComplianceResult(null);
    setGeneratedHashtags([]);
    setSelectedHashtagIndices([]);
    setOptimizedTitles([]);
    setSelectedTitleIndex(null);
    setDraftSections(null);
    setSuggestedMediaSlots([]);
    setDraftBlockingCode('');
    setDraftBlockingIssues([]);
    setDraftBlockingError('');
    toast({ title: 'AI 결과를 초기화했습니다' });
  };

  const getDraftBlockingLabel = (code: string) => {
    if (code === 'AI_DRAFT_SCHEMA_INVALID') return '형식 규칙 미충족';
    if (code === 'AI_DRAFT_SIMILARITY_BLOCKED') return '참고 기사 유사도 높음';
    if (code === 'AI_DRAFT_COMPLIANCE_BLOCKED') return '컴플라이언스 고위험';
    return '생성 규칙 차단';
  };

  const getDraftBlockingHint = (code: string) => {
    if (code === 'AI_DRAFT_SCHEMA_INVALID') return '모드 전환 또는 분량/섹션 조건을 확인한 뒤 다시 생성하세요.';
    if (code === 'AI_DRAFT_SIMILARITY_BLOCKED') return '같은 키워드라도 다른 시각, 다른 문장 흐름으로 재생성하세요.';
    if (code === 'AI_DRAFT_COMPLIANCE_BLOCKED') return '표현 수위를 낮추고 출처 근거를 강화한 뒤 다시 생성하세요.';
    return '잠시 후 다시 시도하거나 키워드를 조정하세요.';
  };

  const getComplianceTone = (riskLevel: 'low' | 'medium' | 'high' | undefined) => {
    if (riskLevel === 'high') {
      return {
        box: 'border-red-200 bg-red-50',
        title: 'text-red-800',
        body: 'text-red-700',
      };
    }
    if (riskLevel === 'medium') {
      return {
        box: 'border-amber-200 bg-amber-50',
        title: 'text-amber-800',
        body: 'text-amber-700',
      };
    }
    return {
      box: 'border-emerald-200 bg-emerald-50',
      title: 'text-emerald-800',
      body: 'text-emerald-700',
    };
  };

  const getStepLabel = (step: AiStepKey) => {
    const labels: Record<AiStepKey, string> = {
      keyword: '키워드 분석',
      outline: '개요 생성',
      draft: '초안 생성',
      grammar: '문법 검사',
      translate: '번역',
      hashtags: '해시태그 생성',
      titles: '제목 최적화',
      compliance: '컴플라이언스 점검',
      image: '이미지 생성',
      video: '영상 생성',
    };
    return labels[step];
  };

  const retryLastFailedAiStep = async () => {
    if (!lastAiFailedStep) return;
    switch (lastAiFailedStep) {
      case 'keyword':
        await handleSearchKeyword();
        break;
      case 'draft':
        await handleGenerateDraft();
        break;
      case 'grammar':
        await handleCheckGrammar();
        break;
      case 'translate':
        await handleTranslate();
        break;
      case 'hashtags':
        await handleGenerateSEO();
        break;
      case 'titles':
        await handleOptimizeTitles();
        break;
      case 'compliance':
        await handleCheckCompliance();
        break;
      case 'image':
        await handleGenerateAIImage();
        break;
      case 'video':
        await handleGenerateShortVideo();
        break;
      default:
        break;
    }
  };

  // File upload handlers
  const getTotalUploadedSize = () => {
    const imageSize = uploadedImages.reduce((sum, img) => sum + img.size, 0);
    const videoSize = uploadedVideos.reduce((sum, vid) => sum + vid.size, 0);
    return imageSize + videoSize;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const currentTotal = getTotalUploadedSize();

    if (currentTotal + file.size > MAX_TOTAL_SIZE) {
      toast({
        title: '용량 초과',
        description: `총 업로드 용량이 500MB를 초과합니다. (현재: ${formatFileSize(currentTotal)})`,
        variant: 'destructive'
      });
      return;
    }

    const url = URL.createObjectURL(file);
    const fileData = { name: file.name, url, size: file.size };

    if (showUploadModal === 'image') {
      setUploadedImages(prev => [...prev, fileData]);
      toast({ title: '이미지 업로드 완료', description: file.name });
    } else if (showUploadModal === 'video') {
      setUploadedVideos(prev => [...prev, fileData]);
      toast({ title: '영상 업로드 완료', description: file.name });
    }

    setShowUploadModal(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGoogleDriveUpload = async () => {
    setIsUploadingToDrive(true);
    try {
      // Simulate Google Drive picker - in production, use Google Picker API
      toast({
        title: 'Google Drive 연동',
        description: 'Google Drive API 연동이 필요합니다. 관리자에게 문의하세요.',
      });
      // 아니오te: For actual implementation, use:
      // gapi.load('picker', () => { ... }) or @react-google-drive-picker
    } catch (error) {
      toast({ title: 'Google Drive 연결 실패', variant: 'destructive' });
    } finally {
      setIsUploadingToDrive(false);
      setShowUploadModal(null);
    }
  };

  const removeUploadedFile = (type: 'image' | 'video', index: number) => {
    if (type === 'image') {
      setUploadedImages(prev => prev.filter((_, i) => i !== index));
    } else {
      setUploadedVideos(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleGenerateAIImage = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 먼저 작성해 주세요', variant: 'destructive' });
      return;
    }

    setIsGeneratingImage(true);
    const promptFromSelection = selectedImageIndices.length > 0
      ? String(generatedImages[selectedImageIndices[0]]?.prompt || '')
      : '';
    const rawDirective = (promptFromSelection || imagePromptInput).trim();
    const promptSpec = JSON.stringify({
      language: 'en',
      task: 'news_editorial_image',
      directive: rawDirective || 'Use article context for a factual editorial scene.',
      hard_constraints: [
        'No text overlay',
        'No watermark',
        'No logo',
        '16:9 composition',
        'Minimize recognizable portrait exposure',
        'Minimize trademark/brand exposure',
      ],
      output: {
        aspect_ratio: '16:9',
        style: 'photorealistic editorial',
      },
    }, null, 2);

    try {
      const result = await GeminiService.generateImage(articleContent, 4, promptSpec);

      const newImages = result.images.map(img => ({
        imageUrl: img.url,
        description: img.description,
        prompt: img.prompt,
      }));

      setGeneratedImages(newImages);
      setSelectedImageIndices(newImages.length > 0 ? [0] : []);
      if (newImages[0]?.prompt) {
        setImagePromptInput(newImages[0].prompt);
      } else if (rawDirective) {
        setImagePromptInput(rawDirective);
      }
      if (result.partial) {
        setLastAiFailedStep('image');
        setLastAiErrorMessage(result.failures?.[0]?.detail || '일부 이미지 생성에 실패했습니다.');
        toast({
          title: `이미지 ${newImages.length}개 생성 완료 (일부 실패)`,
          description: '일부 프롬프트는 실패했지만 생성 가능한 이미지는 반영했습니다.',
          variant: 'destructive'
        });
      } else {
        setLastAiFailedStep(null);
        setLastAiErrorMessage('');
        toast({ title: `이미지 ${newImages.length}개 생성 완료` });
      }
    } catch (error: any) {
      setLastAiFailedStep('image');
      setLastAiErrorMessage(error?.message || '이미지 생성 실패');
      toast({ title: '이미지 생성 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateShortVideo = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 먼저 작성해 주세요', variant: 'destructive' });
      return;
    }

    setIsGeneratingVideo(true);
    setGeneratedVideoScript(null);
    setGeneratedVideoUrl(null);

    try {
      // Pass selected image URL if available (use the first selected image)
      // Get selected image data (first selection)
      const selectedImage = generatedImages.length > 0 && selectedImageIndices.length > 0
        ? generatedImages[selectedImageIndices[0]]
        : undefined;

      const result = await GeminiService.generateShortVideo(
        articleContent,
        selectedImage?.imageUrl,
        selectedImage?.description,
        videoPromptInput.trim() || undefined,
      );
      setGeneratedVideoScript(result.script);
      if (result.videoPrompt) {
        setVideoPromptInput(result.videoPrompt);
      }
      if (result.videoUrl) {
        setGeneratedVideoUrl(result.videoUrl);
        setLastAiFailedStep(null);
        setLastAiErrorMessage('');
        toast({ title: '숏폼 영상 생성 완료' });
      }
    } catch (error: any) {
      setLastAiFailedStep('video');
      setLastAiErrorMessage(error?.message || '영상 생성 실패');
      toast({ title: '영상 생성 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleUpdateGeneratedImagePrompt = (index: number, prompt: string) => {
    setGeneratedImages((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, prompt } : item)),
    );
    if (selectedImageIndices.includes(index)) {
      setImagePromptInput(prompt);
    }
  };

  const handleRegenerateSingleImage = async (index: number) => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 먼저 작성해 주세요', variant: 'destructive' });
      return;
    }
    const target = generatedImages[index];
    if (!target) return;

    setRegeneratingImageIndex(index);
    const rawDirective = (target.prompt || imagePromptInput || '').trim();
    const promptSpec = JSON.stringify({
      language: 'en',
      task: 'news_editorial_image',
      directive: rawDirective || `Regenerate variation for image #${index + 1}`,
      hard_constraints: [
        'No text overlay',
        'No watermark',
        'No logo',
        '16:9 composition',
        'Minimize recognizable portrait exposure',
        'Minimize trademark/brand exposure',
      ],
      output: {
        aspect_ratio: '16:9',
        style: 'photorealistic editorial',
      },
    }, null, 2);

    try {
      const result = await GeminiService.generateImage(articleContent, 1, promptSpec);
      const nextImage = result.images?.[0];
      if (!nextImage) {
        throw new Error('재생성 결과가 비어 있습니다.');
      }
      setGeneratedImages((prev) =>
        prev.map((item, itemIndex) => (
          itemIndex === index
            ? { imageUrl: nextImage.url, description: nextImage.description, prompt: nextImage.prompt || rawDirective }
            : item
        )),
      );
      toast({ title: `이미지 ${index + 1} 재생성 완료` });
    } catch (error: any) {
      toast({ title: '개별 이미지 재생성 실패', description: error?.message || '재시도해 주세요.', variant: 'destructive' });
    } finally {
      setRegeneratingImageIndex(null);
    }
  };

  const handlePublishClick = () => {
    if (unlockedWizardStep < 3) {
      toast({
        title: '초안 단계를 먼저 완료해 주세요',
        description: '추천 기사 선택과 초안 생성을 완료한 뒤 발행할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!articleContent.trim()) {
      toast({ title: '기사를 작성해 주세요', variant: 'destructive' });
      return;
    }

    const gate = buildPublishQualityGate();
    setPublishGateFeedback(gate);
    if (gate.errors.length > 0) {
      toast({
        title: '발행 전 품질 게이트 실패',
        description: gate.errors[0],
        variant: 'destructive',
      });
      return;
    }
    if (gate.warnings.length > 0) {
      toast({
        title: '발행 전 확인 권장',
        description: gate.warnings[0],
      });
    }

    if (!isEmotionManuallySelected) {
      setSelectedPublishEmotion(autoRecommendedEmotion);
    }

    // Initialize status for selected platforms
    const initialStatus: Record<string, 'pending' | 'loading' | 'success' | 'error'> = {};
    selectedPlatforms.forEach(p => initialStatus[p] = 'pending');
    setPublishingStatus(initialStatus);
    setPublishResults({});
    setIsPublishingComplete(false);
    setIsPublishingInProgress(false);
    setShowPublishModal(true);
  };

  const confirmPublish = async () => {
    if (isPublishingInProgress) return;
    const finalPublishEmotion = effectivePublishEmotion;
    setIsPublishingInProgress(true);
    // Process each platform
    const promises = selectedPlatforms.map(async (platformId) => {
      setPublishingStatus(prev => ({ ...prev, [platformId]: 'loading' }));

      try {
        if (platformId === 'interactive') {
          // Use DBService for article saving

          // 1. Determine Title
          let title = searchKeyword || 'AI 뉴스 리포트';
          if (selectedTitleIndex !== null && optimizedTitles[selectedTitleIndex]) {
            title = optimizedTitles[selectedTitleIndex].title;
          } else {
            // Fallback to first optimized title if exists but none selected
            const optimized = optimizedTitles.find(t => t.platform === 'interactive');
            if (optimized) title = optimized.title;
          }

          // 2. Determine Image
          const selectedImage = generatedImages.length > 0 && selectedImageIndices.length > 0
            ? generatedImages[selectedImageIndices[0]].imageUrl
            : undefined;

          // 3. Determine Tags (Category)
          const tags = generatedHashtags.length > 0
            ? generatedHashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')
            : searchKeyword;

          // Map dominant emotion to Korean label for DB lookup (or just use key)
          // The DBService now expects the English keys: 'vibrance', 'immersion', etc.
          const emotionLabel = finalPublishEmotion || 'serenity';
          const plainForMeta = String(articleContent || '')
            .replace(new RegExp(`${ARTICLE_META_OPEN}[\\s\\S]*?${ARTICLE_META_CLOSE}\\s*`, 'g'), '')
            .trim();
          const paragraphsForMeta = plainForMeta
            .split(/\n\s*\n/g)
            .map((p) => p.trim())
            .filter(Boolean);
          const splitIdx = Math.max(1, Math.floor(paragraphsForMeta.length / 3));
          const inferredSectionsForMeta = {
            core: paragraphsForMeta.slice(0, splitIdx).join('\n\n').trim(),
            deepDive: paragraphsForMeta.slice(splitIdx, Math.max(splitIdx * 2, splitIdx + 1)).join('\n\n').trim(),
            conclusion: paragraphsForMeta.slice(Math.max(splitIdx * 2, splitIdx + 1)).join('\n\n').trim(),
          };
          const contentWithMeta = withArticleMeta(articleContent, {
            sections: draftSections || inferredSectionsForMeta,
            mediaSlots: suggestedMediaSlots,
          });

          let data;
          if (editingArticleId) {
            // Update Existing Article
            data = await DBService.updateArticle(editingArticleId, {
              title: title,
              content: contentWithMeta,
              summary: articleContent.slice(0, 150) + '...',
              category: tags,
              emotion: emotionLabel,
              ...(selectedImage ? { image: selectedImage } : {})
            });
            toast({ title: "기사 수정 완료" });
          } else {
            // Create New Article
            data = await DBService.saveArticle({
              title: title,
              content: contentWithMeta,
              summary: articleContent.slice(0, 150) + '...',
              source: '휴브리프 기자단',
              image: selectedImage,
              category: tags,
              emotionLabel: emotionLabel
            });
            toast({ title: "기사 발행 완료" });
          }

          setPublishingStatus(prev => ({ ...prev, [platformId]: 'success' }));
          setPublishResults(prev => ({
            ...prev,
            [platformId]: `/emotion/${emotionLabel}?id=${data.id}`
          }));

        } else {
          // Mock simulation for other platforms
          const delay = 700 + Math.random() * 600;
          await new Promise(resolve => setTimeout(resolve, delay));

          setPublishingStatus(prev => ({ ...prev, [platformId]: 'success' }));
          setPublishResults(prev => ({
            ...prev,
            [platformId]: `https://${platformId}.com/article/${Date.now()}`
          }));
        }
      } catch (error: any) {
        console.error(`Publishing failed for ${platformId}:`, error);
        setPublishingStatus(prev => ({ ...prev, [platformId]: 'error' }));
        setPublishResults(prev => ({
          ...prev,
          [platformId]: `오류: ${error.message}`
        }));
      }
    });

    await Promise.all(promises);
    setIsPublishingComplete(true);
    setIsPublishingInProgress(false);
  };

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms(prev => {
      const newPlatforms = prev.includes(platformId)
        ? prev.filter(p => p !== platformId)
        : [...prev, platformId];
      return newPlatforms;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Header />

      <main className="max-w-6xl mx-auto px-6 py-8 pt-24">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800" data-testid="text-page-title">
            기자 포털
          </h1>
          <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
            <button
              onClick={() => {
                handleClearForm();
                setView('write');
                updateJournalistViewHistory('write');
              }}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'write' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <PenTool className="w-4 h-4 mr-2" />
              기사 작성
            </button>
            <button
              onClick={() => {
                setView('list');
                setEditingArticleId(null);
                updateJournalistViewHistory('list');
              }}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <List className="w-4 h-4 mr-2" />
              내 기사 관리            </button>
          </div>
        </div>

        {view === 'write' && (
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {WIZARD_STEPS.map((stepItem, index) => {
                const isUnlocked = stepItem.step <= unlockedWizardStep;
                const isActive = stepItem.step === wizardStep;
                return (
                  <div key={stepItem.key} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => goToWizardStep(stepItem.step)}
                      disabled={!isUnlocked}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : isUnlocked
                            ? 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                            : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400'
                      }`}
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
                        {stepItem.step}
                      </span>
                      {stepItem.label}
                    </button>
                    {index < WIZARD_STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300" />}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">요청 기준 1~9 진행 상태</p>
              <div className="flex flex-wrap gap-2">
                {authoringFlow.map((item) => {
                  const done = flowCompletion[item.key];
                  return (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => {
                        if (!done) scrollToFlowSection(item.key);
                      }}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${
                        done
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-700'
                      }`}
                    >
                      <CheckCircle className={`h-3.5 w-3.5 ${done ? 'text-emerald-500' : 'text-slate-300'}`} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              진행 단계: {wizardStep} / {WIZARD_STEPS.length}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousStep}
                disabled={wizardStep <= 1}
              >
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextStep}
                disabled={wizardStep >= 3 || wizardStep >= unlockedWizardStep}
              >
                다음
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearForm}
              >
                초기화
              </Button>
              <span className="text-xs text-gray-500">
                {lastSavedAt ? `로컬 저장: ${new Date(lastSavedAt).toLocaleTimeString()}` : '로컬 저장: 없음'}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setActiveComposeStage('author')}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  activeComposeStage === 'author'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold">1단계: 작성</p>
                <p className="mt-1 text-xs opacity-80">키워드 검색 · 기사 작성 · 미디어 도구</p>
              </button>
              <button
                type="button"
                onClick={() => handleEnterPublishStage(true)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  activeComposeStage === 'publish'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold">2단계: 배포 준비</p>
                <p className="mt-1 text-xs opacity-80">제목 선택 · SEO · 감정 균형 · 발행</p>
              </button>
            </div>
          </div>
        )}

        {view === 'write' && showRestoreDraftBanner && pendingWizardSnapshot && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">이전 작성 내용을 찾았습니다</p>
            <p className="mt-1 text-xs text-amber-800">
              기본 화면은 빈칸으로 시작합니다. 필요할 때만 불러오세요.
              {lastSavedAt ? ` (저장 시각: ${new Date(lastSavedAt).toLocaleString()})` : ''}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleRestoreDraftSnapshot}
                data-testid="button-restore-draft"
              >
                작성중 불러오기
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleDiscardDraftSnapshot}
                data-testid="button-start-fresh"
              >
                새로 시작
              </Button>
            </div>
          </div>
        )}

        {view === 'write' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {activeComposeStage === 'author' && (
              <>
              <motion.div
                ref={keywordSectionRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-500" />
                  키워드 검색                </h2>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSearching) {
                        handleSearchKeyword();
                      }
                    }}
                    placeholder="글로벌 트렌드 검색..."
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    data-testid="input-keyword-search"
                  />
                  <GlassButton
                    variant="primary"
                    onClick={handleSearchKeyword}
                    disabled={isSearching}
                    data-testid="button-search"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </GlassButton>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TRENDING_KEYWORDS.map((keyword) => (
                    <button
                      key={keyword}
                      onClick={() => setSearchKeyword(keyword)}
                      className="px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-600 hover-elevate"
                      data-testid={`keyword-${keyword}`}
                    >
                      {keyword}
                    </button>
                  ))}
                </div>

                {/* Search Results Display */}
                {searchResults && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-sm text-gray-700 mb-3">{searchResults.context}</p>
                    {recommendedArticles.length === 0 ? (
                      <p className="text-xs text-blue-700">추천 기사를 찾지 못했습니다. 키워드를 바꿔 다시 검색해 주세요.</p>
                    ) : (
                      <div className="space-y-2">
                        {recommendedArticles.map((article, idx) => {
                          const isSelected = selectedRecommendedArticleId === article.id;
                          return (
                            <button
                              key={article.id || `${article.url}-${idx}`}
                              type="button"
                              onClick={() => {
                                setSelectedRecommendedArticleId(article.id);
                                setSearchKeyword(article.title);
                              }}
                              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                                isSelected
                                  ? 'border-blue-400 bg-white'
                                  : 'border-blue-100 bg-white/80 hover:bg-white'
                              }`}
                            >
                              <p className="break-words text-sm font-semibold text-gray-900">{idx + 1}. {article.title}</p>
                              <p className="mt-1 break-words text-xs leading-5 text-gray-600">{article.summary}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">출처: {article.source}</span>
                                {article.url && (
                                  <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-blue-700 hover:border-blue-300"
                                  >
                                    요약 링크
                                    <ExternalLink className="h-3 w-3" />
                                    <span className="max-w-[140px] truncate text-[10px] text-blue-500">
                                      {getArticleLinkLabel(article.url)}
                                    </span>
                                  </a>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>

              <motion.div
                ref={writingSectionRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-purple-500" />
                  AI 작성 도우미                </h2>
                <p className="mb-4 text-xs text-gray-500">
                  {draftMode === 'interactive-longform'
                    ? '인터랙티브 요소를 추가할 수 있는 심층 기사 작성 모드입니다.'
                    : '빠른 기사 작성은 이미지 없이 텍스트만으로 발행 가능한 500자 이내 간편 기사 작성 모드입니다.'}
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={draftMode === 'draft' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setDraftMode('draft');
                      setDraftBlockingCode('');
                      setDraftBlockingError('');
                      setDraftBlockingIssues([]);
                    }}
                  >
                    빠른 기사 작성
                  </Button>
                  <Button
                    type="button"
                    variant={draftMode === 'interactive-longform' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setDraftMode('interactive-longform');
                      setDraftBlockingCode('');
                      setDraftBlockingError('');
                      setDraftBlockingIssues([]);
                    }}
                  >
                    인터랙티브 롱폼
                  </Button>
                </div>
                <div className="flex gap-2 mb-4">
                  <GlassButton
                    variant="primary"
                    onClick={handleGenerateDraft}
                    disabled={isGeneratingDraft || unlockedWizardStep < 2}
                    data-testid="button-generate-draft"
                  >
                    {isGeneratingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {isGeneratingDraft ? '생성 중...' : '초안 생성'}
                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={handleCheckGrammar}
                    disabled={isCheckingGrammar || unlockedWizardStep < 3}
                    data-testid="button-check-typos"
                  >
                    {isCheckingGrammar ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {isCheckingGrammar ? '검사 중...' : '맞춤법/문법 검사'}
                  </GlassButton>
                </div>
                {draftBlockingError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">초안 생성 차단됨</p>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        {getDraftBlockingLabel(draftBlockingCode)}
                      </span>
                      {draftBlockingCode && (
                        <span className="text-[10px] text-red-500">{draftBlockingCode}</span>
                      )}
                    </div>
                    <p className="mt-1">{draftBlockingError}</p>
                    <p className="mt-1 text-[11px] text-red-600">{getDraftBlockingHint(draftBlockingCode)}</p>
                    {draftBlockingIssues.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-red-700">
                        {draftBlockingIssues.slice(0, 4).map((issue, idx) => (
                          <li key={`${issue}-${idx}`}>{issue}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <textarea
                  value={articleContent}
                  onChange={(e) => {
                    setArticleContent(e.target.value);
                    if (e.target.value.trim()) {
                      setWizardStep(3);
                    }
                  }}
                  placeholder="기사 내용을 입력하세요..."
                  rows={8}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
                  data-testid="textarea-article"
                />

                {/* Grammar Check Results */}
                {grammarErrors.length > 0 && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-100">
                    <p className="text-sm font-medium text-green-800 mb-3">{grammarErrors.length}개의 교정 사항을 적용했습니다.</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {grammarErrors.map((error, i) => (
                        <div key={i} className="text-xs p-2 bg-white rounded border border-green-100">
                          <div className="flex gap-2 items-center mb-1">
                            <span className="line-through text-red-500">{error.original}</span>
                            <span className="text-gray-400">→</span>
                            <span className="text-green-600 font-medium">{error.corrected}</span>
                          </div>
                          <p className="text-gray-500 italic">{error.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>

              <motion.div
                ref={mediaToolSectionRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-green-500" />
                  미디어 도구
                </h2>
                <div className="flex flex-wrap gap-2 mb-4">
                  <GlassButton
                    variant="outline"
                    onClick={() => setShowUploadModal('image')}
                    disabled={unlockedWizardStep < 3}
                    data-testid="button-upload-image"
                  >
                    <Upload className="w-4 h-4" />
                    이미지 업로드                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={() => setShowUploadModal('video')}
                    disabled={unlockedWizardStep < 3}
                    data-testid="button-upload-video"
                  >
                    <Video className="w-4 h-4" />
                    영상 업로드                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={handleGenerateAIImage}
                    disabled={isGeneratingImage || unlockedWizardStep < 3}
                    data-testid="button-generate-ai-image"
                  >
                    {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {isGeneratingImage ? '생성 중...' : 'AI 이미지 생성'}
                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={handleGenerateShortVideo}
                    disabled={isGeneratingVideo || unlockedWizardStep < 3}
                    data-testid="button-create-short"
                  >
                    {isGeneratingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                    {isGeneratingVideo ? '생성 중...' : '숏폼 영상 생성'}
                  </GlassButton>
                </div>
                {/* Generated Image Display (Grid) */}
                {generatedImages.length > 0 && (
                  <div className="mt-4 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-sm font-medium text-green-800">방금 생성된 AI 이미지 (선택하세요)</p>
                      <GlassButton
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateAIImage}
                        disabled={isGeneratingImage}
                        className="text-green-600 h-8"
                      >
                        <RefreshCcw className={`w-3 h-3 mr-1 ${isGeneratingImage ? 'animate-spin' : ''}`} />
                        전체 재생성
                      </GlassButton>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      {generatedImages.map((img, idx) => {
                        const isSelected = selectedImageIndices.includes(idx);

                        return (
                          <div
                            key={idx}
                            className={`relative group rounded-lg overflow-hidden border-2 transition-all ${isSelected
                              ? 'border-green-500 shadow-lg scale-[1.02]'
                              : 'border-transparent hover:border-green-300'
                              }`}
                          >
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(img.imageUrl)}
                              className="w-full text-left"
                            >
                              <img
                                src={img.imageUrl}
                                alt={`Generated ${idx + 1}`}
                                className="w-full aspect-video object-cover"
                              />
                            </button>
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-0.5 rounded-full shadow-md text-xs font-bold">
                                선택됨
                              </div>
                            )}
                            <div
                              className="p-2 bg-white border-t border-green-100"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <p className="mb-1 text-[11px] font-medium text-gray-600">이미지 프롬프트</p>
                              <Textarea
                                value={img.prompt || ''}
                                onChange={(event) => handleUpdateGeneratedImagePrompt(idx, event.target.value)}
                                rows={2}
                                placeholder="생성 후 프롬프트를 수정할 수 있습니다."
                                className="bg-white text-xs"
                              />
                              <div className="mt-2 flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isSelected ? 'default' : 'outline'}
                                  onClick={() => setSelectedImageIndices([idx])}
                                >
                                  선택
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRegenerateSingleImage(idx)}
                                  disabled={regeneratingImageIndex === idx}
                                >
                                  {regeneratingImageIndex === idx ? '재생성 중...' : '재생성'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-600 italic">
                      {generatedImages[selectedImageIndices[0]]?.description}
                    </p>
                  </div>
                )}

                {/* Generated Video Display */}
                {(generatedVideoUrl || generatedVideoScript) && (
                  <div className="mt-4 p-4 bg-gradient-to-br from-purple-50 to-violet-50 rounded-lg border border-purple-200">
                    <p className="text-sm font-medium text-indigo-800 mb-3">숏폼 영상 (9:16, 최대 60초)</p>

                    {generatedVideoUrl && (
                      <video
                        src={generatedVideoUrl}
                        controls
                        autoPlay
                        loop
                        className="w-full max-w-xs mx-auto rounded-lg shadow-md mb-3"
                        style={{ aspectRatio: '9/16' }}
                      />
                    )}

                    {generatedVideoScript && (
                      <details className="mt-3">
                        <summary className="text-xs text-purple-600 cursor-pointer hover:text-purple-800">스크립트 보기</summary>
                        <pre className="text-xs bg-white p-3 rounded-lg border border-purple-100 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto mt-2">
                          {generatedVideoScript}
                        </pre>
                      </details>
                    )}
                    <div className="mt-3">
                      <p className="mb-1 text-[11px] font-medium text-indigo-700">영상 프롬프트</p>
                      <Textarea
                        value={videoPromptInput}
                        onChange={(e) => setVideoPromptInput(e.target.value)}
                        rows={2}
                        placeholder="생성 후 프롬프트를 수정할 수 있습니다."
                        className="bg-white text-xs"
                      />
                    </div>
                  </div>
                )}
              </motion.div>

              <div ref={mediaPlacementRef} className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-sm font-semibold text-indigo-900">
                    미디어 배치 ({suggestedMediaSlots.length})
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddMediaSlot('image')}
                      disabled={unlockedWizardStep < 3 || mediaAssets.filter((asset) => asset.type === 'image').length === 0}
                    >
                      <ImageIcon className="w-4 h-4 mr-1" />
                      이미지 추가
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddMediaSlot('video')}
                      disabled={unlockedWizardStep < 3 || mediaAssets.filter((asset) => asset.type === 'video').length === 0}
                    >
                      <Video className="w-4 h-4 mr-1" />
                      영상 추가
                    </Button>
                  </div>
                </div>

                {suggestedMediaSlots.length === 0 ? (
                  <p className="text-xs text-indigo-700">아직 배치된 미디어가 없습니다. 기사 흐름에 맞춰 이미지/영상을 추가하세요.</p>
                ) : (
                  <div className="space-y-2">
                    {suggestedMediaSlots.map((slot, index) => (
                      <div key={slot.id} className="rounded-lg border border-indigo-100 bg-white p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-semibold text-indigo-900">
                            배치 {index + 1} · {slot.type === 'image' ? '이미지' : '영상'}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => handleMoveMediaSlot(slot.id, 'up')}
                              disabled={index === 0}
                              aria-label="슬롯 위로 이동"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => handleMoveMediaSlot(slot.id, 'down')}
                              disabled={index === suggestedMediaSlots.length - 1}
                              aria-label="슬롯 아래로 이동"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRemoveMediaSlot(slot.id)}
                              aria-label="슬롯 삭제"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                          <select
                            value={slot.type}
                            onChange={(e) => {
                              const nextType = e.target.value as 'image' | 'video';
                              const firstAsset = mediaAssets.find((asset) => asset.type === nextType);
                              handleUpdateMediaSlot(slot.id, {
                                type: nextType,
                                sourceAssetKey: firstAsset?.key || '',
                                sourceUrl: firstAsset?.url || '',
                              });
                            }}
                            className="px-2 py-2 rounded-md border border-gray-200 text-xs"
                          >
                            <option value="image">이미지</option>
                            <option value="video">영상</option>
                          </select>
                          <select
                            value={slot.sourceAssetKey}
                            onChange={(e) => {
                              const asset = mediaAssets.find((row) => row.key === e.target.value);
                              handleUpdateMediaSlot(slot.id, {
                                sourceAssetKey: e.target.value,
                                sourceUrl: asset?.url || '',
                              });
                            }}
                            className="px-2 py-2 rounded-md border border-gray-200 text-xs"
                          >
                            <option value="">소스 선택</option>
                            {mediaAssets
                              .filter((asset) => asset.type === slot.type)
                              .map((asset) => (
                                <option key={asset.key} value={asset.key}>{asset.label}</option>
                              ))}
                          </select>
                          <select
                            value={slot.anchorLabel}
                            onChange={(e) => handleUpdateMediaSlot(slot.id, { anchorLabel: e.target.value as MediaAnchor })}
                            className="px-2 py-2 rounded-md border border-gray-200 text-xs"
                          >
                            <option value="core">핵심</option>
                            <option value="deepDive">심화 시사점</option>
                            <option value="conclusion">결론</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-1 gap-2 mb-2">
                          <select
                            value={slot.position}
                            onChange={(e) => handleUpdateMediaSlot(slot.id, { position: e.target.value as MediaPosition })}
                            className="px-2 py-2 rounded-md border border-gray-200 text-xs"
                          >
                            <option value="before">앞</option>
                            <option value="inline">문단 중간</option>
                            <option value="after">뒤</option>
                          </select>
                        </div>

                        <Input
                          value={slot.caption}
                          onChange={(e) => handleUpdateMediaSlot(slot.id, { caption: e.target.value })}
                          placeholder="미디어 캡션 또는 사용 메모"
                          className="h-8 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">작성이 끝났다면 배포 준비 단계로 이동하세요</p>
                <p className="mt-1 text-xs text-blue-700">
                  추천 기사 선택과 본문 작성이 완료되면 이동할 수 있습니다.
                </p>
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={() => handleEnterPublishStage(true)}
                >
                  다음 단계: 배포 준비
                </Button>
                {!canEnterPublishStage && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {missingPublishRequirements.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => scrollToFlowSection(item.key)}
                        className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] text-blue-700 hover:border-blue-300"
                      >
                        미완료: {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              </>
              )}

              {activeComposeStage === 'publish' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
                >
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    배포 전 본문 확인
                  </h2>
                  <p className="text-xs text-gray-500 mb-3">
                    2단계에서는 제목/플랫폼/SEO/감정 균형을 점검한 뒤 발행합니다.
                  </p>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-[560px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm text-gray-800">{articleContent || '본문이 없습니다.'}</pre>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="space-y-6">
              {activeComposeStage === 'publish' && showDistributionSettings && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-violet-500" />
                  AI 결과 도구
                </h2>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Button variant="outline" size="sm" onClick={handleCheckGrammar} disabled={isCheckingGrammar || unlockedWizardStep < 3}>
                    문법 재검사
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleGenerateSEO} disabled={isGeneratingSEO || unlockedWizardStep < 3}>
                    해시태그 재생성
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleOptimizeTitles} disabled={isOptimizingTitles || unlockedWizardStep < 3}>
                    제목 재생성
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCheckCompliance} disabled={isCheckingCompliance || unlockedWizardStep < 3}>
                    {isCheckingCompliance ? '점검 중...' : '컴플라이언스 점검'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleClearAiResults}>
                    전체 초기화
                  </Button>
                </div>
                <div className="mb-3">
                  <Button variant="outline" size="sm" onClick={handleUndoAiResult} disabled={aiUndoStack.length === 0}>
                    최근 AI 적용 취소
                  </Button>
                </div>
                {lastAiFailedStep && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    <p className="font-medium">
                      마지막 실패 단계: {getStepLabel(lastAiFailedStep)}
                    </p>
                    {lastAiErrorMessage && <p className="mt-1 line-clamp-2">{lastAiErrorMessage}</p>}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={retryLastFailedAiStep}
                    >
                      실패 단계 다시 시도
                    </Button>
                  </div>
                )}

                <div className="space-y-2 text-xs text-gray-600">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                    문법 교정: <span className="font-semibold text-gray-800">{grammarErrors.length}</span>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                    해시태그: <span className="font-semibold text-gray-800">{generatedHashtags.length}</span>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                    최적화 제목: <span className="font-semibold text-gray-800">{optimizedTitles.length}</span>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                    점검 위험도: <span className="font-semibold text-gray-800">{complianceResult?.riskLevel ?? '없음'}</span>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleApplySelectedTitle} disabled={selectedTitleIndex === null}>
                    선택 제목 적용
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleApplySelectedHashtags} disabled={selectedHashtagIndices.length === 0}>
                    선택 태그 적용
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleGenerateDraft} disabled={isGeneratingDraft || unlockedWizardStep < 3}>
                    초안 다시 생성
                  </Button>
                </div>
                {generatedHashtags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {generatedHashtags.map((tag, idx) => {
                      const selected = selectedHashtagIndices.includes(idx);
                      return (
                        <button
                          key={`${tag}-${idx}`}
                          type="button"
                          onClick={() =>
                            setSelectedHashtagIndices((prev) =>
                              prev.includes(idx) ? prev.filter((item) => item !== idx) : [...prev, idx],
                            )
                          }
                          className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${
                            selected
                              ? 'border-violet-400 bg-violet-100 text-violet-800'
                              : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                )}
                {complianceResult && (
                  <div className={`mt-3 rounded-lg border p-3 ${getComplianceTone(complianceResult.riskLevel).box}`}>
                    <p className={`text-xs font-semibold ${getComplianceTone(complianceResult.riskLevel).title}`}>
                      컴플라이언스 요약 ({complianceResult.riskLevel.toUpperCase()})
                    </p>
                    <p className={`mt-1 text-xs ${getComplianceTone(complianceResult.riskLevel).body}`}>{complianceResult.summary}</p>
                    {complianceResult.flags.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {complianceResult.flags.map((flag, idx) => (
                          <div key={`${flag.category}-${idx}`} className="rounded border border-gray-200 bg-white p-2 text-xs text-gray-700">
                            <p><span className="font-semibold">{flag.category}</span> ({flag.severity})</p>
                            <p>{flag.reason}</p>
                            <p className={getComplianceTone(complianceResult.riskLevel).body}>개선 제안: {flag.suggestion}</p>
                            {flag.evidenceSnippet && (
                              <p className="text-gray-500">근거: {flag.evidenceSnippet}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
              )}

              {activeComposeStage === 'author' && (
              <motion.div
                ref={draftVersionRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-500" />
                    초안 버전
                  </h2>
                  <Button variant="outline" size="sm" onClick={() => setShowDraftVersions((prev) => !prev)}>
                    {showDraftVersions ? '접기' : '펼치기'}
                  </Button>
                </div>
                {showDraftVersions && (
                  <>
                    <div className="flex gap-2 mb-4">
                      <GlassButton variant="outline" className="flex-1" onClick={() => saveDraftVersion('manual')}>
                        스냅샷 저장
                      </GlassButton>
                    </div>
                    {draftVersions.length === 0 ? (
                      <p className="text-sm text-gray-500">저장된 버전이 없습니다.</p>
                    ) : (
                  <div className="space-y-2">
                    {draftVersions.map((version, index) => (
                      <div key={version.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-500">
                            v{draftVersions.length - index} 쨌 {new Date(version.createdAt).toLocaleString()}
                          </p>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedCompareVersionId(version.id)}
                            >
                              비교
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => restoreDraftVersion(version.id)}
                            >
                              복원
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-sm font-medium text-gray-800 line-clamp-1">
                          {version.keyword || '제목 없는 키워드'}
                        </p>
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {(version.content || version.outline || '').slice(0, 120)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {selectedCompareVersionId && (
                  <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                    {(() => {
                      const selected = draftVersions.find((item) => item.id === selectedCompareVersionId);
                      if (!selected) return <p className="text-xs text-indigo-700">선택한 버전을 찾을 수 없습니다.</p>;
                      const keywordChanged = selected.keyword !== searchKeyword;
                      const outlineChanged = selected.outline !== articleOutline;
                      const contentDelta = Math.abs((selected.content || '').length - (articleContent || '').length);
                      const outlineDiff = buildLineDiffSummary(selected.outline || '', articleOutline || '');
                      const contentDiff = buildLineDiffSummary(selected.content || '', articleContent || '');
                      return (
                        <div className="space-y-1 text-xs text-indigo-900">
                          <p>현재 초안과 비교:</p>
                          <p>키워드 변경: {keywordChanged ? '예' : '아니오'}</p>
                          <p>개요 변경: {outlineChanged ? '예' : '아니오'}</p>
                          <p>본문 길이 차이: {contentDelta}</p>
                          <p>개요 라인 차이: {outlineDiff.changedLines} 변경 / {outlineDiff.baseLines} → {outlineDiff.currentLines}</p>
                          <p>본문 라인 차이: {contentDiff.changedLines} 변경 / {contentDiff.baseLines} → {contentDiff.currentLines}</p>
                        </div>
                      );
                    })()}
                  </div>
                )}
                  </>
                )}
              </motion.div>
              )}

              {activeComposeStage === 'publish' && (
              <>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Send className="w-5 h-5 text-orange-500" />
                  배포 플랫폼                </h2>
                <div className="space-y-2">
                  {PLATFORMS.map((platform) => (
                    <label
                      key={platform.id}
                      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer ${selectedPlatforms.includes(platform.id)
                        ? 'bg-orange-50 border border-orange-200'
                        : 'bg-gray-50 border border-transparent hover-elevate'
                        }`}
                      data-testid={`platform-${platform.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlatforms.includes(platform.id)}
                        onChange={() => togglePlatform(platform.id)}
                        className="w-4 h-4 rounded text-orange-500 mt-0.5"
                      />
                      <platform.Icon className="w-5 h-5 text-gray-600 mt-0.5" />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-700 block">{platform.label}</span>
                        <span className="text-xs text-gray-500">{platform.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </motion.div>

              {/* Distribution Settings Panel */}
              {showDistributionSettings && selectedPlatforms.length > 0 && (
                <motion.div
                  ref={titleCandidateRef}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-6 shadow-sm border border-orange-100"
                >
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-orange-500" />
                    배포 설정
                  </h2>

                  <div className="space-y-4">
                    <GlassButton
                      variant="primary"
                      onClick={handleOptimizeTitles}
                      disabled={isOptimizingTitles}
                      className="w-full"
                      data-testid="button-optimize-titles"
                    >
                      {isOptimizingTitles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {isOptimizingTitles ? '최적화 중...' : 'AI 제목 최적화'}
                    </GlassButton>

                    {optimizedTitles.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 font-medium">플랫폼별 최적화 제목 (아래에서 선택)</p>
                        {optimizedTitles.map((item, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedTitleIndex(i)}
                            className={`w-full text-left rounded-lg p-3 border transition-all ${selectedTitleIndex === i
                              ? 'bg-orange-100 border-orange-400 shadow-sm'
                              : 'bg-white border-orange-100 hover:bg-orange-50'
                              }`}
                          >
                            <span className="text-xs font-medium text-orange-600 block mb-1">{item.platform}</span>
                            <p className={`text-sm ${selectedTitleIndex === i ? 'text-orange-900 font-semibold' : 'text-gray-800'}`}>{item.title}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-orange-200">
                      <p className="text-xs text-gray-500 mb-2">선택한 플랫폼 {selectedPlatforms.length}개</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedPlatforms.map(p => {
                          const platform = PLATFORMS.find(pl => pl.id === p);
                          return platform ? (
                            <span key={p} className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                              {platform.label}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>

                    {/* Platform-Specific Settings Display */}
                    <div className="space-y-4 pt-4 border-t border-orange-200">
                      <p className="text-sm font-medium text-gray-700">플랫폼별 상세 설정</p>
                      {selectedPlatforms.map(platformId => {
                        const settings = PLATFORM_SETTINGS[platformId];
                        const platform = PLATFORMS.find(p => p.id === platformId);
                        if (!settings || !platform) return null;

                        return (
                          <div key={platformId} className="bg-white rounded-xl p-4 border border-orange-100 space-y-3">
                            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                              <platform.Icon className="w-5 h-5 text-orange-500" />
                              <span className="font-medium text-gray-800">{platform.label}</span>
                            </div>

                            {/* Deployment Guide */}
                            <div>
                              <p className="text-xs font-medium text-blue-600 mb-2">배포 가이드</p>
                              <ul className="space-y-1">
                                {settings.deploymentGuide.map((item, i) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* SEO Tips */}
                            <div>
                              <p className="text-xs font-medium text-green-600 mb-2">SEO 권장사항</p>
                              <ul className="space-y-1">
                                {settings.seoTips.map((tip, i) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                                    <span className="text-green-400 mt-0.5">•</span>
                                    {tip}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Additional Info */}
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                              <span className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded-full">
                                최적 시간: {settings.bestTimes}
                              </span>
                              <span className="text-xs px-2 py-1 bg-cyan-50 text-cyan-600 rounded-full">
                                형식: {settings.contentFormat}
                              </span>
                              {settings.characterLimit && (
                                <span className="text-xs px-2 py-1 bg-amber-50 text-amber-600 rounded-full">
                                  텍스트 길이 제한: {settings.characterLimit.toLocaleString()}자
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Publish Status Modal */}
              {showPublishModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                  onClick={() => !isPublishingInProgress && !isPublishingComplete && setShowPublishModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-center mb-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {isPublishingComplete ? '기사 발행 완료!' : '기사 발행 중...'}
                      </h3>
                      <p className="text-sm text-gray-500 mb-4">
                        {isPublishingComplete
                          ? '선택한 플랫폼으로 기사 발행이 완료되었습니다.'
                          : '각 플랫폼으로 기사를 전송하고 있습니다.'}
                      </p>

                      {/* Emotion Category Badge */}
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200">
                        <span className="text-xs text-slate-500">발행 감정:</span>
                        <span className="text-sm font-bold text-slate-800 uppercase">
                          {effectivePublishEmotion || 'spectrum'}
                        </span>
                      </div>

                      <div className="mt-4">
                        <p className="text-xs text-slate-500 mb-2">발행 감정 직접 선택</p>
                        <div className="mb-2 flex items-center justify-center gap-2">
                          <span className="text-[11px] text-slate-500">
                            모드: {isEmotionManuallySelected ? '수동' : '자동(AI)'}
                          </span>
                          {isEmotionManuallySelected && (
                            <Button variant="outline" size="sm" onClick={handleResetPublishEmotionToAuto}>
                              AI 자동 추천 사용
                            </Button>
                          )}
                        </div>
                        <p className="mb-2 text-[11px] text-slate-500">
                          AI 추천 감정: <span className="font-semibold uppercase">{autoRecommendedEmotion}</span>
                        </p>
                        {isEmotionManuallySelected && pendingAutoEmotion && (
                          <p className="mb-2 text-[11px] text-amber-600">
                            수동 선택이 적용 중입니다. 현재 AI 추천 감정: {pendingAutoEmotion.toUpperCase()}.
                          </p>
                        )}
                        <div className="flex flex-wrap justify-center gap-2">
                          {EMOTION_CONFIG.map((emotion) => (
                            <button
                              key={`publish-modal-${emotion.type}`}
                              type="button"
                              onClick={() => {
                                handleSelectPublishEmotion(emotion.type as EmotionOption);
                              }}
                              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${selectedPublishEmotion === emotion.type ? 'text-white border-transparent' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
                              style={selectedPublishEmotion === emotion.type ? { backgroundColor: emotion.color } : {}}
                            >
                              {emotion.labelKo}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 mb-6">
                      {publishGateFeedback && (publishGateFeedback.errors.length > 0 || publishGateFeedback.warnings.length > 0) && (
                        <div className={`rounded-lg border p-3 text-xs ${publishGateFeedback.errors.length > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                          <p className="font-semibold mb-2">발행 전 점검 결과</p>
                          {publishGateFeedback.errors.length > 0 && (
                            <div className="mb-2">
                              {publishGateFeedback.errors.map((item, idx) => (
                                <p key={`modal-gate-err-${idx}`}>- {item}</p>
                              ))}
                            </div>
                          )}
                          {publishGateFeedback.warnings.length > 0 && (
                            <div>
                              {publishGateFeedback.warnings.map((item, idx) => (
                                <p key={`modal-gate-warn-${idx}`}>- {item}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {selectedPlatforms.map(platformId => {
                        const platform = PLATFORMS.find(p => p.id === platformId);
                        const status = publishingStatus[platformId];
                        const resultUrl = publishResults[platformId];

                        return (
                          <div key={platformId} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${status === 'success' ? 'bg-green-100 text-green-600' :
                                status === 'error' ? 'bg-red-100 text-red-600' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                {platform?.Icon && <platform.Icon className="w-4 h-4" />}
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-medium text-gray-900">{platform?.label}</p>
                                <p className="text-xs text-gray-500">
                                  {status === 'pending' && '대기 중...'}
                                  {status === 'loading' && '발행 중...'}
                                  {status === 'success' && '발행 성공'}
                                  {status === 'error' && '발행 실패'}
                                </p>
                                {status === 'error' && resultUrl && (
                                  <p className="text-[11px] text-red-500 mt-1 max-w-[210px] truncate" title={resultUrl}>
                                    {resultUrl}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div>
                              {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                              {status === 'success' && (
                                <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              {status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                              {status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-3">
                      {!isPublishingComplete ? (
                        <>
                          <button
                            onClick={() => setShowPublishModal(false)}
                            disabled={isPublishingInProgress}
                            className="flex-1 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl disabled:opacity-50"
                          >
                            취소
                          </button>
                          <GlassButton
                            variant="primary"
                            className="flex-1"
                            onClick={confirmPublish}
                            disabled={isPublishingInProgress}
                          >
                            {isPublishingInProgress ? '발행 중...' : '발행 시작'}
                          </GlassButton>
                        </>
                      ) : (
                        <div className="w-full flex gap-2">
                          {hasPublishErrors && (
                            <GlassButton
                              variant="outline"
                              className="flex-1"
                              onClick={confirmPublish}
                              disabled={isPublishingInProgress}
                            >
                              실패 항목 재시도                            </GlassButton>
                          )}
                          <GlassButton
                            variant="primary"
                            className="flex-1"
                            onClick={() => setShowPublishModal(false)}
                          >
                            닫기
                          </GlassButton>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {showDistributionSettings && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Hash className="w-5 h-5 text-cyan-500" />
                  AI SEO 도우미                </h2>
                <GlassButton
                  variant="outline"
                  onClick={handleGenerateSEO}
                  disabled={isGeneratingSEO}
                  className="w-full mb-3"
                  data-testid="button-generate-seo"
                >
                  {isGeneratingSEO ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}
                  {isGeneratingSEO ? '생성 중...' : '해시태그 생성'}
                </GlassButton>
                {generatedHashtags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {generatedHashtags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 rounded-md text-sm bg-cyan-50 text-cyan-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
              )}

              {showDistributionSettings && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className={`rounded-2xl p-6 shadow-sm border ${hasAngerWarning
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-100'
                  }`}
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  감정 균형 가이드                  {isAnalyzingSentiment && (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  )}
                </h2>
                <div className="space-y-2">
                  {(['vibrance', 'immersion', 'clarity', 'gravity', 'serenity'] as const).map((emotion) => {
                    const value = sentimentData[emotion];
                    const config = EMOTION_CONFIG.find(e => e.type === emotion);
                    const isDominant = sentimentData.dominantEmotion === emotion;
                    return (
                      <div key={emotion} className={`flex items-center gap-2 ${isDominant ? 'bg-gray-50 rounded-lg p-1 -mx-1' : ''}`}>
                        <span className={`text-sm w-16 ${isDominant ? 'font-medium text-gray-800' : 'text-gray-600'}`}>
                          {config?.labelKo || emotion} {isDominant && '✓'}
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${value}%`,
                              backgroundColor: config?.color || '#888'
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8">{value}%</span>
                      </div>
                    );
                  })}
                </div>

                {/* AI Feedback */}
                {sentimentData.feedback && (
                  <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${hasAngerWarning ? 'bg-red-100' : 'bg-indigo-50'
                    }`}>
                    {hasAngerWarning ? (
                      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <BarChart3 className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                    )}
                    <p className={`text-sm ${hasAngerWarning ? 'text-red-700' : 'text-indigo-700'}`}>
                      {sentimentData.feedback}
                    </p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">발행 감정 직접 선택</p>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      모드: {isEmotionManuallySelected ? '수동' : '자동(AI)'}
                    </span>
                    {isEmotionManuallySelected && (
                      <Button variant="outline" size="sm" onClick={handleResetPublishEmotionToAuto}>
                        AI 자동 추천 사용
                      </Button>
                    )}
                  </div>
                  <p className="mb-2 text-xs text-gray-500">
                    AI 추천 감정: <span className="font-semibold uppercase">{autoRecommendedEmotion}</span>
                  </p>
                  {isEmotionManuallySelected && pendingAutoEmotion && (
                    <p className="mb-2 text-xs text-amber-600">
                      수동 선택이 적용 중입니다. 현재 AI 추천 감정: {pendingAutoEmotion.toUpperCase()}.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {EMOTION_CONFIG.map((emotion) => (
                      <button
                        key={emotion.type}
                        type="button"
                        onClick={() => {
                          handleSelectPublishEmotion(emotion.type as EmotionOption);
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${selectedPublishEmotion === emotion.type ? 'text-white border-transparent' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
                        style={selectedPublishEmotion === emotion.type ? { backgroundColor: emotion.color } : {}}
                      >
                        {emotion.labelKo}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
              )}

              <div ref={advancedToolRef} className="mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowDistributionSettings((prev) => !prev)}
                >
                  {showDistributionSettings ? '고급 도구 접기' : '고급 도구 펼치기'}
                </Button>
              </div>
              <GlassButton
                variant="primary"
                className="w-full"
                data-testid="button-publish"
                onClick={handlePublishClick}
                disabled={unlockedWizardStep < 3}
              >
                <FileText className="w-4 h-4" />
                기사 발행하기
              </GlassButton>
              {publishGateFeedback && (publishGateFeedback.errors.length > 0 || publishGateFeedback.warnings.length > 0) && (
                <div className={`mt-3 rounded-xl border p-3 text-xs ${publishGateFeedback.errors.length > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <p className="font-semibold mb-2">발행 전 점검 결과</p>
                  {publishGateFeedback.errors.length > 0 && (
                    <div className="mb-2">
                      {publishGateFeedback.errors.map((item, idx) => (
                        <p key={`gate-err-${idx}`}>- {item}</p>
                      ))}
                    </div>
                  )}
                  {publishGateFeedback.warnings.length > 0 && (
                    <div>
                      {publishGateFeedback.warnings.map((item, idx) => (
                        <p key={`gate-warn-${idx}`}>- {item}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-800">내 기사 목록</h2>
                <button onClick={fetchMyArticles} className="text-gray-500 hover:text-blue-600" aria-label="기사 목록 새로고침">
                  <RefreshCcw className={`w-4 h-4 ${isLoadingArticles ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_auto] gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">카테고리별 보기</span>
                  <select
                    value={articleCategoryFilter}
                    onChange={(e) => setArticleCategoryFilter(e.target.value)}
                    className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="all">전체 감정</option>
                    {articleCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">검색</span>
                  <Input
                    value={articleSearchQuery}
                    onChange={(e) => setArticleSearchQuery(e.target.value)}
                    placeholder="제목, 요약, 본문, 출처 검색"
                    className="h-10"
                  />
                </label>
                <div className="flex flex-col justify-end gap-2">
                  <Button
                    type="button"
                    variant={allFilteredSelected ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={toggleSelectAllFiltered}
                    disabled={filteredMyArticles.length === 0}
                  >
                    {allFilteredSelected ? '전체 선택 해제' : '전체 선택'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDeleteSelected}
                    disabled={selectedFilteredCount === 0}
                  >
                    선택 일괄 삭제
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1">
                  필터 결과 {filteredMyArticles.length}건
                </span>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                  선택 {selectedFilteredCount}건
                </span>
              </div>
            </div>
            {isLoadingArticles ? (
              <div className="p-12 text-center text-gray-500 flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p>기사 목록을 불러오는 중...</p>
              </div>
            ) : filteredMyArticles.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <p>조건에 맞는 기사가 없습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredMyArticles.map((article) => {
                  const articleId = String(article.id || '');
                  const createdAt = article.created_at || article.createdAt;
                  const emotionVisual = getEmotionVisual(article.emotion);
                  const categoryTokens = extractCategoryTokens(article.category);
                  return (
                  <div key={article.id} className="p-6 flex flex-col md:flex-row items-start justify-between hover:bg-gray-50 transition-colors group">
                    <div className="flex w-full gap-3">
                      <label className="mt-1 inline-flex h-5 w-5 items-center justify-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedArticleIds.has(articleId)}
                          onChange={() => toggleSelectArticle(articleId)}
                          aria-label={`${article.title} 선택`}
                        />
                      </label>
                      <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${article.is_published !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {article.is_published !== false ? '발행됨' : '숨김'}
                        </span>
                        <span className="text-xs text-gray-400">{createdAt ? new Date(createdAt).toLocaleDateString() : '-'}</span>
                        {article.emotion && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="px-2 py-0.5 rounded text-xs font-medium cursor-default"
                                style={{ backgroundColor: `${emotionVisual.color}22`, color: emotionVisual.color }}
                              >
                                {emotionVisual.label}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="border-transparent text-white" style={{ backgroundColor: emotionVisual.color }}>
                              {emotionVisual.label}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewArticle(article)}
                        className="text-left text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 hover:text-blue-600 transition-colors"
                      >
                        {article.title}
                      </button>
                      {categoryTokens.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {categoryTokens.slice(0, 5).map((token) => (
                            <span key={`${articleId}-${token}`} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-medium">
                              {token}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-gray-600 text-sm line-clamp-2">{article.summary || article.content}</p>
                    </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4 md:mt-0 md:ml-4">
                      <Button variant="outline" size="sm" onClick={() => handleEditArticle(article)}>
                        <Edit className="w-4 h-4 mr-1" /> 수정
                      </Button>
                      <Button variant="destructive" size="sm" onClick={(e) => handleDeleteArticle(article.id, e)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )
        }
      </main >

      <Dialog open={Boolean(previewArticle)} onOpenChange={(open) => !open && setPreviewArticle(null)}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden">
          {previewArticle && (() => {
            const createdAt = previewArticle.created_at || previewArticle.createdAt;
            const parsed = parseArticleMeta(previewArticle.content || '');
            const plainText = String(parsed.plainText || previewArticle.content || '').trim();
            const emotionVisual = getEmotionVisual(previewArticle.emotion);
            const categoryTokens = extractCategoryTokens(previewArticle.category);
            const paragraphs = plainText
              .split(/\n\s*\n/g)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean);
            const views = Number(previewArticle.views || 0);
            const saves = Number(previewArticle.saves || 0);
            const insightRate = views > 0 ? Math.round((saves / views) * 1000) / 10 : 0;
            const intensity = Number(previewArticle.intensity || 0);
            const contentChars = plainText.replace(/\s+/g, '').length;

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="pr-8 text-xl leading-snug">{previewArticle.title}</DialogTitle>
                  <DialogDescription>
                    {createdAt ? new Date(createdAt).toLocaleString() : '-'} · {previewArticle.source || '출처 미지정'}
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[64vh] overflow-y-auto space-y-4 pr-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="px-2.5 py-1 rounded text-xs font-semibold cursor-default"
                          style={{ backgroundColor: `${emotionVisual.color}22`, color: emotionVisual.color }}
                        >
                          {emotionVisual.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="border-transparent text-white" style={{ backgroundColor: emotionVisual.color }}>
                        {emotionVisual.label}
                      </TooltipContent>
                    </Tooltip>
                    {categoryTokens.map((token) => (
                      <span key={`preview-category-${token}`} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-medium">
                        {token}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-3 text-sm leading-7 text-gray-800">
                    {(paragraphs.length > 0 ? paragraphs : [plainText]).map((paragraph, idx) => (
                      <p key={`preview-paragraph-${idx}`}>{paragraph}</p>
                    ))}
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">기사 통계</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div className="rounded-lg bg-white px-2.5 py-2 border border-gray-100">
                        <p className="text-[11px] text-gray-500">조회수</p>
                        <p className="text-sm font-bold text-gray-800">{views}</p>
                      </div>
                      <div className="rounded-lg bg-white px-2.5 py-2 border border-gray-100">
                        <p className="text-[11px] text-gray-500">저장수</p>
                        <p className="text-sm font-bold text-gray-800">{saves}</p>
                      </div>
                      <div className="rounded-lg bg-white px-2.5 py-2 border border-gray-100">
                        <p className="text-[11px] text-gray-500">인사이트</p>
                        <p className="text-sm font-bold text-gray-800">{insightRate}%</p>
                      </div>
                      <div className="rounded-lg bg-white px-2.5 py-2 border border-gray-100">
                        <p className="text-[11px] text-gray-500">감정 강도</p>
                        <p className="text-sm font-bold text-gray-800">{Math.max(0, Math.min(100, intensity))}</p>
                      </div>
                      <div className="rounded-lg bg-white px-2.5 py-2 border border-gray-100">
                        <p className="text-[11px] text-gray-500">본문 길이</p>
                        <p className="text-sm font-bold text-gray-800">{contentChars}자</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPreviewArticle(null);
                      handleEditArticle(previewArticle);
                    }}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    수정하기
                  </Button>
                  <Button variant="secondary" onClick={() => setPreviewArticle(null)}>
                    닫기
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 숨김 file input for local uploads */}
      < input
        type="file"
        ref={fileInputRef}
        onChange={handleLocalFileUpload}
        accept={showUploadModal === 'image' ? 'image/*' : 'video/*'}
        className="hidden"
      />

      {/* Upload Modal */}
      {
        showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowUploadModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                {showUploadModal === 'image' ? '이미지 업로드' : '영상 업로드'}
              </h3>

              <p className="text-xs text-gray-500 mb-4">
                총 용량 제한: 500MB (현재: {formatFileSize(getTotalUploadedSize())})
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center gap-2"
                >
                  <Upload className="w-8 h-8 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">로컬 파일 선택</span>
                  <span className="text-xs text-gray-500">컴퓨터에서 파일 선택</span>
                </button>

                <button
                  onClick={handleGoogleDriveUpload}
                  disabled={isUploadingToDrive}
                  className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors flex flex-col items-center gap-2"
                >
                  <svg className="w-8 h-8" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 13.8z" fill="#ea4335" />
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">
                    {isUploadingToDrive ? '연결 중...' : 'Google Drive'}
                  </span>
                  <span className="text-xs text-gray-500">드라이브에서 파일 선택</span>
                </button>
              </div>

              <button
                onClick={() => setShowUploadModal(null)}
                className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
              >
                취소
              </button>
            </motion.div>
          </motion.div>
        )
      }

      {previewImageUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-10 right-0 text-white text-sm hover:text-gray-200"
            >
              닫기
            </button>
            <img
              src={previewImageUrl}
              alt="미리보기 이미지"
              className="w-full max-h-[85vh] object-contain rounded-xl"
            />
          </motion.div>
        </motion.div>
      )}

      {/* Uploaded Files Display */}
      {
        (uploadedImages.length > 0 || uploadedVideos.length > 0) && (
          <div className="fixed bottom-4 right-4 bg-white rounded-2xl p-4 shadow-lg border border-gray-200 max-w-xs z-40">
            <p className="text-sm font-medium text-gray-800 mb-2">
              최근 업로드한 파일 ({formatFileSize(getTotalUploadedSize())} / 500MB)
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {uploadedImages.map((img, i) => (
                <div key={`img-${i}`} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                  <img src={img.url} alt={img.name} className="w-10 h-10 object-cover rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 truncate">{img.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(img.size)}</p>
                  </div>
                  <button onClick={() => removeUploadedFile('image', i)} className="text-red-400 hover:text-red-600">삭제</button>
                </div>
              ))}
              {uploadedVideos.map((vid, i) => (
                <div key={`vid-${i}`} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                  <Video className="w-10 h-10 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 truncate">{vid.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(vid.size)}</p>
                  </div>
                  <button onClick={() => removeUploadedFile('video', i)} className="text-red-400 hover:text-red-600">삭제</button>
                </div>
              ))}
            </div>
          </div>
        )
      }
    </div >
  );
}
