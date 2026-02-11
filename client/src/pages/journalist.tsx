import { useState, useEffect, useCallback, useRef } from 'react';
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
  ExternalLink,
  XCircle,
  Edit,
  Trash2,
  List,
  PenTool,
  RefreshCcw,
  Languages
} from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EMOTION_CONFIG } from '@/lib/store';
import { GeminiService } from '@/services/gemini';
import { getSupabase } from '@/services/supabaseClient';
import { DBService } from '@/services/DBService';
import { useToast } from '@/hooks/use-toast';

const PLATFORMS = [
  { id: 'interactive', label: 'Interactive Page', Icon: Globe, description: 'HueBrief 서비스에 직접 발행' },
  { id: 'instagram', label: 'Instagram', Icon: Camera, description: 'AI 카드뉴스 이미지 자동 생성 (1080x1080)' },
  { id: 'youtube', label: 'YouTube', Icon: Youtube, description: 'AI 숏폼 스크립트/영상 자동 생성' },
  { id: 'threads', label: 'Threads', Icon: MessageCircle, description: 'AI 텍스트 스레드 요약 자동 생성' },
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
      '실시간 뉴스피드에 자동 게시',
      'SEO 메타 태그 자동 생성'
    ],
    seoTips: [
      '제목에 핵심 키워드 포함 (60자 이내)',
      '첫 문단에 중요 정보 배치 (역피라미드 구조)',
      '내부 링크 및 관련 기사 연결',
      '이미지 alt 태그에 설명 추가'
    ],
    bestTimes: '오전 8-9시, 점심 12-1시, 저녁 6-8시',
    contentFormat: 'HTML 기사 형식, 최소 500자 권장'
  },
  instagram: {
    deploymentGuide: [
      '1080x1080 카드뉴스 이미지 자동 생성',
      '캡션과 해시태그 자동 작성',
      'Instagram Graph API 연동 필요',
      '비즈니스/크리에이터 계정 필수'
    ],
    seoTips: [
      '해시태그 15-20개 (첫 댓글에 추가)',
      '첫 줄에 후킹 문구 배치',
      '이모지로 가독성 향상 🎯',
      '위치 태그 및 계정 멘션 활용'
    ],
    bestTimes: '오전 7-9시, 점심 12-2시, 저녁 7-9시',
    contentFormat: '이미지 1080x1080px, 캡션 2,200자 이내',
    characterLimit: 2200
  },
  youtube: {
    deploymentGuide: [
      '9:16 세로형 숏폼 영상 (60초 이내)',
      '자막 및 썸네일 자동 생성',
      'YouTube Data API 연동 필요',
      '채널 인증 및 업로드 권한 설정'
    ],
    seoTips: [
      '제목에 검색 키워드 포함 (70자 이내)',
      '설명란 첫 2줄에 핵심 내용',
      '태그 10-15개 (관련 키워드)',
      '챕터 구분으로 시청 유지율 향상'
    ],
    bestTimes: '오후 2-4시, 저녁 8-10시 (주말 오전 포함)',
    contentFormat: 'MP4 형식, 9:16 비율, 최대 60초'
  },
  threads: {
    deploymentGuide: [
      '텍스트 스레드 형식으로 분할',
      '각 스레드 500자 이내로 요약',
      'Threads API (Meta) 연동 필요',
      'Instagram 계정 연결 필수'
    ],
    seoTips: [
      '첫 스레드에 핵심 메시지 담기',
      '숫자와 통계로 신뢰도 향상',
      '질문형 문장으로 참여 유도',
      '해시태그 3-5개 적정'
    ],
    bestTimes: '오전 8-10시, 저녁 7-9시',
    contentFormat: '텍스트 스레드, 각 500자 이내',
    characterLimit: 500
  }
};

const TRENDING_KEYWORDS = ['AI 기술', '기후변화', '경제전망', '청년정책', '글로벌 트렌드'];

export default function JournalistPage() {
  const { toast } = useToast();

  const [view, setView] = useState<'write' | 'list'>('write');
  const [myArticles, setMyArticles] = useState<any[]>([]);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [articleContent, setArticleContent] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['interactive']);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [optimizedTitles, setOptimizedTitles] = useState<{ platform: string; title: string }[]>([]);
  const [showDistributionSettings, setShowDistributionSettings] = useState(false);

  // Loading states
  const [isSearching, setIsSearching] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);
  const [isGeneratingSEO, setIsGeneratingSEO] = useState(false);
  const [isOptimizingTitles, setIsOptimizingTitles] = useState(false);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);

  // Search results
  const [searchResults, setSearchResults] = useState<{ topics: string[]; context: string } | null>(null);
  // Grammar check results
  const [grammarErrors, setGrammarErrors] = useState<{ original: string; corrected: string; reason: string }[]>([]);
  // Media generation states
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{ imageUrl: string; description: string }[]>([]);
  const [selectedImageIndices, setSelectedImageIndices] = useState<number[]>([0]);
  const [generatedVideoScript, setGeneratedVideoScript] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  // File upload states
  const [showUploadModal, setShowUploadModal] = useState<'image' | 'video' | null>(null);
  const [uploadedImages, setUploadedImages] = useState<{ name: string; url: string; size: number }[]>([]);
  const [uploadedVideos, setUploadedVideos] = useState<{ name: string; url: string; size: number }[]>([]);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500MB
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Publishing states
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishingStatus, setPublishingStatus] = useState<Record<string, 'pending' | 'loading' | 'success' | 'error'>>({});
  const [publishResults, setPublishResults] = useState<Record<string, string>>({});
  const [isPublishingComplete, setIsPublishingComplete] = useState(false);
  const [isPublishingInProgress, setIsPublishingInProgress] = useState(false);

  // Sentiment analysis state
  type EmotionOption = 'vibrance' | 'immersion' | 'clarity' | 'gravity' | 'serenity' | 'spectrum';
  const [selectedPublishEmotion, setSelectedPublishEmotion] = useState<EmotionOption>('spectrum');
  const [isEmotionManuallySelected, setIsEmotionManuallySelected] = useState(false);

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
    feedback: '기사 내용을 작성하면 감정 분석이 시작됩니다.'
  });
  const [isAnalyzingSentiment, setIsAnalyzingSentiment] = useState(false);

  const hasAngerWarning = sentimentData.immersion > 40;
  const hasPublishErrors = Object.values(publishingStatus).includes('error');

  // Debounced sentiment analysis
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleAnalyzeSentiment = useCallback(async () => {
    if (!articleContent.trim() || articleContent.length < 50) return;

    setIsAnalyzingSentiment(true);
    try {
      const result = await GeminiService.analyzeSentiment(articleContent);
      const koreanFeedback = /[가-힣]/.test(result.feedback || '')
        ? result.feedback
        : '감정 분석 결과가 영문으로 반환되어 한국어 요약 안내로 대체했습니다.';
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
        description: 'AI 서비스 응답이 늦어 기본값으로 설정되었습니다.',
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
    const dominant = sentimentData.dominantEmotion as EmotionOption;
    const valid = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'] as const;
    if (!isEmotionManuallySelected && valid.includes(dominant)) {
      setSelectedPublishEmotion(dominant);
    }
  }, [sentimentData.dominantEmotion, isEmotionManuallySelected]);

  // --- Start of My Articles Handlers ---
  const fetchMyArticles = useCallback(async () => {
    setIsLoadingArticles(true);
    try {
      const user = await DBService.getCurrentUser();
      if (user) {
        const articles = await DBService.getMyArticles(user.id);
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

  const handleDeleteArticle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('정말로 이 기사를 삭제하시겠습니까?')) return;
    try {
      await DBService.deleteArticle(id);
      toast({ title: '기사가 삭제되었습니다.' });
      fetchMyArticles();
    } catch (error) {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  const handleEditArticle = (article: any) => {
    setEditingArticleId(article.id);
    setSearchKeyword(article.title);
    setArticleContent(article.content || '');
    // Restore tags if possible (simple split)
    if (article.category) {
      setGeneratedHashtags(article.category.split(' '));
    }
    setView('write');
  };

  const handleClearForm = () => {
    setEditingArticleId(null);
    setSearchKeyword('');
    setArticleContent('');
    setSelectedPlatforms(['interactive']);
    setGeneratedHashtags([]);
    setOptimizedTitles([]);
    setSentimentData({
      vibrance: 20, immersion: 20, clarity: 20, gravity: 20, serenity: 20,
      dominantEmotion: 'spectrum',
      feedback: '기사 내용을 작성하면 감정 분석이 시작됩니다.'
    });
    setSelectedPublishEmotion('spectrum');
    setIsEmotionManuallySelected(false);
  };
  // --- End of My Articles Handlers ---

  const handleSearchKeyword = async () => {
    if (!searchKeyword.trim()) {
      toast({ title: '키워드를 입력해주세요', variant: 'destructive' });
      return;
    }

    setIsSearching(true);
    setSearchResults(null);

    try {
      const result = await GeminiService.analyzeKeyword(searchKeyword);
      setSearchResults(result);
      toast({ title: '키워드 분석 완료' });
    } catch (error: any) {
      toast({ title: '분석 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleGenerateDraft = async () => {
    const keyword = searchKeyword.trim() || '최신 트렌드';
    setIsGeneratingDraft(true);

    try {
      const result = await GeminiService.generateArticleDraft(keyword);
      setArticleContent(`[${result.title}]\n\n${result.content}`);
      toast({ title: '초안 생성 완료' });
    } catch (error: any) {
      toast({ title: '생성 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const [isTranslating, setIsTranslating] = useState(false);

  const handleTranslate = async () => {
    if (!articleContent.trim()) {
      toast({ title: '번역할 내용을 입력해주세요', variant: 'destructive' });
      return;
    }

    setIsTranslating(true);

    try {
      const result = await GeminiService.translateText(articleContent);
      setArticleContent(result.translatedText);
      toast({ title: '번역 완료', description: '내용이 한글로 번역되었습니다.' });
    } catch (error: any) {
      toast({ title: '번역 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCheckGrammar = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 입력해주세요', variant: 'destructive' });
      return;
    }

    setIsCheckingGrammar(true);
    setGrammarErrors([]);

    try {
      const result = await GeminiService.checkGrammar(articleContent);
      setArticleContent(result.correctedText);
      setGrammarErrors(result.errors);

      if (result.errors.length === 0) {
        toast({ title: '검사 완료', description: '오류가 없습니다!' });
      } else {
        toast({ title: '검사 완료', description: `${result.errors.length}개의 수정 사항이 적용되었습니다.` });
      }
    } catch (error: any) {
      toast({ title: '검사 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsCheckingGrammar(false);
    }
  };

  const handleGenerateSEO = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 먼저 작성해주세요', variant: 'destructive' });
      return;
    }

    setIsGeneratingSEO(true);

    try {
      const result = await GeminiService.generateHashtags(articleContent, selectedPlatforms);
      setGeneratedHashtags(result.hashtags);
      toast({ title: '해시태그 생성 완료' });
    } catch (error: any) {
      toast({ title: '생성 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsGeneratingSEO(false);
    }
  };

  const [selectedTitleIndex, setSelectedTitleIndex] = useState<number | null>(null);

  const handleOptimizeTitles = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 먼저 작성해주세요', variant: 'destructive' });
      return;
    }

    setIsOptimizingTitles(true);
    setSelectedTitleIndex(null); // Reset selection

    try {
      const result = await GeminiService.optimizeTitles(articleContent, selectedPlatforms);
      setOptimizedTitles(result.titles);
      toast({ title: '제목 최적화 완료', description: '원하는 제목을 선택해주세요.' });
    } catch (error: any) {
      toast({ title: '최적화 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsOptimizingTitles(false);
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
      toast({ title: '동영상 업로드 완료', description: file.name });
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
      // Note: For actual implementation, use:
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
      toast({ title: '기사 내용을 먼저 작성해주세요', variant: 'destructive' });
      return;
    }

    setIsGeneratingImage(true);

    // Smart Regeneration Logic:
    // 1. Keep selected images.
    // 2. Generate new images to fill the remaining slots (up to 4).
    // 3. If all 4 are selected (or 0), perform full regeneration (count 4).
    const keptImages = generatedImages.filter((_, idx) => selectedImageIndices.includes(idx));
    // If all 4 are selected, assume user wants a fresh batch (Force 4). If 0 kept, naturally 4.
    const countToGenerate = keptImages.length === 4 ? 4 : 4 - keptImages.length;

    // If full regenerate, clear UI immediately for feedback
    if (countToGenerate === 4) {
      setGeneratedImages([]);
      setSelectedImageIndices([0]);
    }

    try {
      const result = await GeminiService.generateImage(articleContent, countToGenerate);

      const newImages = result.images.map(img => ({
        imageUrl: img.url,
        description: img.description
      }));

      let finalImages;
      if (countToGenerate === 4) {
        finalImages = newImages;
        // default selection [0] already set
      } else {
        // Merge: Kept images first, then new ones
        finalImages = [...keptImages, ...newImages];
        // Update selection: The kept images are now at indices 0, 1, ...
        setSelectedImageIndices(Array.from({ length: keptImages.length }, (_, i) => i));
      }

      setGeneratedImages(finalImages);
      toast({ title: `이미지 ${countToGenerate}장 생성 완료${keptImages.length > 0 ? ' (선택 이미지 유지)' : ''}` });
    } catch (error: any) {
      toast({ title: '이미지 생성 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateShortVideo = async () => {
    if (!articleContent.trim()) {
      toast({ title: '기사 내용을 먼저 작성해주세요', variant: 'destructive' });
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

      const result = await GeminiService.generateShortVideo(articleContent, selectedImage?.imageUrl, selectedImage?.description);
      setGeneratedVideoScript(result.script);
      if (result.videoUrl) {
        setGeneratedVideoUrl(result.videoUrl);
        toast({ title: '숏폼 영상 30초 생성 완료' });
      }
    } catch (error: any) {
      toast({ title: '영상 생성 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handlePublishClick = () => {
    if (!articleContent.trim()) {
      toast({ title: '기사를 작성해주세요', variant: 'destructive' });
      return;
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
    setIsPublishingInProgress(true);
    // Process each platform
    const promises = selectedPlatforms.map(async (platformId) => {
      setPublishingStatus(prev => ({ ...prev, [platformId]: 'loading' }));

      try {
        if (platformId === 'interactive') {
          // Use DBService for article saving

          // 1. Determine Title
          let title = searchKeyword || 'AI News Report';
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
          const emotionLabel = selectedPublishEmotion || 'serenity';

          let data;
          if (editingArticleId) {
            // Update Existing Article
            data = await DBService.updateArticle(editingArticleId, {
              title: title,
              content: articleContent,
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
              content: articleContent,
              summary: articleContent.slice(0, 150) + '...',
              source: 'Human Pulse AI Journalist',
              image: selectedImage,
              category: tags,
              emotionLabel: emotionLabel
            });
            toast({ title: "기사 발행 완료" });
          }

          setPublishingStatus(prev => ({ ...prev, [platformId]: 'success' }));
          setPublishResults(prev => ({
            ...prev,
            [platformId]: `/news?id=${data.id}` // This might need to adjust if routing implies category
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

      setShowDistributionSettings(newPlatforms.length > 0);
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
                setView('write')
              }}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'write' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <PenTool className="w-4 h-4 mr-2" />
              기사 작성
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <List className="w-4 h-4 mr-2" />
              내 기사 관리
            </button>
          </div>
        </div>

        {view === 'write' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-500" />
                  키워드 검색
                </h2>
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
                    placeholder="트렌딩 토픽 검색..."
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
                    <div className="flex flex-wrap gap-2">
                      {searchResults.topics.map((topic, i) => (
                        <button
                          key={i}
                          onClick={() => setSearchKeyword(topic)}
                          className="px-3 py-1 rounded-full text-xs bg-white text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          {topic}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-purple-500" />
                  AI 작성 도우미
                </h2>
                <div className="flex gap-2 mb-4">
                  <GlassButton
                    variant="primary"
                    onClick={handleGenerateDraft}
                    disabled={isGeneratingDraft}
                    data-testid="button-generate-draft"
                  >
                    {isGeneratingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {isGeneratingDraft ? '생성 중...' : '초안 생성'}
                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={handleCheckGrammar}
                    disabled={isCheckingGrammar}
                    data-testid="button-check-typos"
                  >
                    {isCheckingGrammar ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {isCheckingGrammar ? '검사 중...' : '맞춤법/규정 검사'}
                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    data-testid="button-translate"
                  >
                    {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                    {isTranslating ? '번역 중...' : '한글로 번역'}
                  </GlassButton>
                </div>
                <textarea
                  value={articleContent}
                  onChange={(e) => setArticleContent(e.target.value)}
                  placeholder="기사 내용을 입력하세요..."
                  rows={8}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
                  data-testid="textarea-article"
                />

                {/* Grammar Check Results */}
                {grammarErrors.length > 0 && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-100">
                    <p className="text-sm font-medium text-green-800 mb-3">✅ {grammarErrors.length}개의 수정 사항이 적용되었습니다</p>
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
                    data-testid="button-upload-image"
                  >
                    <Upload className="w-4 h-4" />
                    이미지 업로드
                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={() => setShowUploadModal('video')}
                    data-testid="button-upload-video"
                  >
                    <Video className="w-4 h-4" />
                    동영상 업로드
                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={handleGenerateAIImage}
                    disabled={isGeneratingImage}
                    data-testid="button-generate-ai-image"
                  >
                    {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {isGeneratingImage ? '생성 중...' : 'AI 이미지 생성'}
                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={handleGenerateShortVideo}
                    disabled={isGeneratingVideo}
                    data-testid="button-create-short"
                  >
                    {isGeneratingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                    {isGeneratingVideo ? '생성 중...' : '숏폼 영상 제작'}
                  </GlassButton>
                </div>

                {/* Generated Image Display (Grid) */}
                {generatedImages.length > 0 && (
                  <div className="mt-4 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-sm font-medium text-green-800">🖼️ AI 생성 이미지 (선택해주세요)</p>
                      <GlassButton
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateAIImage}
                        disabled={isGeneratingImage}
                        className="text-green-600 h-8"
                      >
                        <RefreshCcw className={`w-3 h-3 mr-1 ${isGeneratingImage ? 'animate-spin' : ''}`} />
                        재생성
                      </GlassButton>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {generatedImages.map((img, idx) => {
                        const isSelected = selectedImageIndices.includes(idx);
                        const selectionOrder = selectedImageIndices.indexOf(idx) + 1;

                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setSelectedImageIndices(prev => {
                                if (prev.includes(idx)) {
                                  const newSelection = prev.filter(i => i !== idx);
                                  return newSelection.length === 0 ? [] : newSelection;
                                } else {
                                  return [...prev, idx];
                                }
                              });
                            }}
                            className={`relative cursor-pointer group rounded-lg overflow-hidden border-2 transition-all ${isSelected
                              ? 'border-green-500 shadow-lg scale-[1.02]'
                              : 'border-transparent hover:border-green-300'
                              }`}
                          >
                            <img
                              src={img.imageUrl}
                              alt={`Generated ${idx + 1}`}
                              className="w-full aspect-video object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-green-500 text-white w-6 h-6 rounded-full shadow-md flex items-center justify-center text-xs font-bold">
                                {selectionOrder}
                              </div>
                            )}
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
                    <p className="text-sm font-medium text-indigo-800 mb-3">🎬 숏폼 영상 (9:16, 8초)</p>

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
                  </div>
                )}
              </motion.div>
            </div>

            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Send className="w-5 h-5 text-orange-500" />
                  배포 플랫폼
                </h2>
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
              {selectedPlatforms.length > 0 && (
                <motion.div
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
                      <p className="text-xs text-gray-500 mb-2">선택된 플랫폼: {selectedPlatforms.length}개</p>
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
                              <p className="text-xs font-medium text-blue-600 mb-2">📋 배포 설정</p>
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
                              <p className="text-xs font-medium text-green-600 mb-2">🎯 SEO 권장사항</p>
                              <ul className="space-y-1">
                                {settings.seoTips.map((tip, i) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                                    <span className="text-green-400 mt-0.5">✓</span>
                                    {tip}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Additional Info */}
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                              <span className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded-full">
                                🕐 최적 시간: {settings.bestTimes}
                              </span>
                              <span className="text-xs px-2 py-1 bg-cyan-50 text-cyan-600 rounded-full">
                                📄 {settings.contentFormat}
                              </span>
                              {settings.characterLimit && (
                                <span className="text-xs px-2 py-1 bg-amber-50 text-amber-600 rounded-full">
                                  ✏️ 글자 제한: {settings.characterLimit.toLocaleString()}자
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
                          ? '선택하신 플랫폼으로 기사 배포가 완료되었습니다.'
                          : '각 플랫폼으로 기사를 전송하고 있습니다.'}
                      </p>

                      {/* Emotion Category Badge */}
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200">
                        <span className="text-xs text-slate-500">발행 감정:</span>
                        <span className="text-sm font-bold text-slate-800 uppercase">
                          {selectedPublishEmotion || 'spectrum'}
                        </span>
                      </div>

                      <div className="mt-4">
                        <p className="text-xs text-slate-500 mb-2">발행 감정 직접 선택</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {EMOTION_CONFIG.map((emotion) => (
                            <button
                              key={`publish-modal-${emotion.type}`}
                              type="button"
                              onClick={() => {
                                setSelectedPublishEmotion(emotion.type as EmotionOption);
                                setIsEmotionManuallySelected(true);
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
                                  {status === 'loading' && '배포 중...'}
                                  {status === 'success' && '배포 성공'}
                                  {status === 'error' && '배포 실패'}
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
                            {isPublishingInProgress ? '배포 중...' : '배포 시작'}
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
                              실패 항목 재시도
                            </GlassButton>
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

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Hash className="w-5 h-5 text-cyan-500" />
                  AI SEO 도우미
                </h2>
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
                  감정 균형 가드
                  {isAnalyzingSentiment && (
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
                          {config?.labelKo || emotion} {isDominant && '★'}
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
                  <div className="flex flex-wrap gap-2">
                    {EMOTION_CONFIG.map((emotion) => (
                      <button
                        key={emotion.type}
                        type="button"
                        onClick={() => {
                          setSelectedPublishEmotion(emotion.type as EmotionOption);
                          setIsEmotionManuallySelected(true);
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

              <GlassButton
                variant="primary"
                className="w-full"
                data-testid="button-publish"
                onClick={handlePublishClick}
              >
                <FileText className="w-4 h-4" />
                기사 발행하기
              </GlassButton>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-800">내 기사 목록</h2>
              <button onClick={fetchMyArticles} className="text-gray-500 hover:text-blue-600">
                <RefreshCcw className={`w-4 h-4 ${isLoadingArticles ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {isLoadingArticles ? (
              <div className="p-12 text-center text-gray-500 flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p>기사 목록을 불러오는 중...</p>
              </div>
            ) : myArticles.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <p>작성된 기사가 없습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {myArticles.map(article => (
                  <div key={article.id} className="p-6 flex flex-col md:flex-row items-start justify-between hover:bg-gray-50 transition-colors group">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${article.is_published !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {article.is_published !== false ? 'Published' : 'Hidden'}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(article.created_at).toLocaleDateString()}</span>
                        {article.emotion && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                            {article.emotion}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">{article.title}</h3>
                      <p className="text-gray-600 text-sm line-clamp-2">{article.summary || article.content}</p>
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
                ))}
              </div>
            )}
          </div>
        )
        }
      </main >

      {/* Hidden file input for local uploads */}
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
                {showUploadModal === 'image' ? '📷 이미지 업로드' : '🎬 동영상 업로드'}
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

      {/* Uploaded Files Display */}
      {
        (uploadedImages.length > 0 || uploadedVideos.length > 0) && (
          <div className="fixed bottom-4 right-4 bg-white rounded-2xl p-4 shadow-lg border border-gray-200 max-w-xs z-40">
            <p className="text-sm font-medium text-gray-800 mb-2">
              📎 업로드된 파일 ({formatFileSize(getTotalUploadedSize())} / 500MB)
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {uploadedImages.map((img, i) => (
                <div key={`img-${i}`} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                  <img src={img.url} alt={img.name} className="w-10 h-10 object-cover rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 truncate">{img.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(img.size)}</p>
                  </div>
                  <button onClick={() => removeUploadedFile('image', i)} className="text-red-400 hover:text-red-600">✕</button>
                </div>
              ))}
              {uploadedVideos.map((vid, i) => (
                <div key={`vid-${i}`} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                  <Video className="w-10 h-10 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 truncate">{vid.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(vid.size)}</p>
                  </div>
                  <button onClick={() => removeUploadedFile('video', i)} className="text-red-400 hover:text-red-600">✕</button>
                </div>
              ))}
            </div>
          </div>
        )
      }
    </div >
  );
}
