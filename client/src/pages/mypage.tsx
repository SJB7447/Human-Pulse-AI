import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { User, Bookmark, Sparkles, Edit, Trash2, Eye, Settings, Heart, Lightbulb, Share2, MessageSquare, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { EMOTION_CONFIG, useEmotionStore } from '@/lib/store';
import { DBService, type UserSocialConnections } from '@/services/DBService';
import { useToast } from '@/hooks/use-toast';

interface SavedArticle {
  id: number;
  title: string;
  emotion: string;
  savedAt: string;
}

interface CustomArticle {
  id: number;
  title: string;
  createdAt: string;
  status: 'draft' | 'published';
}

interface CuratedArticle {
  id: number;
  originalTitle: string;
  userComment: string;
  userEmotion: string;
  createdAt: string;
}

const MOCK_SAVED_ARTICLES: SavedArticle[] = [
  { id: 1, title: '글로벌 경제 전망: 새로운 신호', emotion: 'vibrance', savedAt: '2024-01-15' },
  { id: 2, title: '환경 보호를 위한 청년들의 움직임', emotion: 'serenity', savedAt: '2024-01-14' },
  { id: 3, title: '혁신계의 새로운 바람', emotion: 'clarity', savedAt: '2024-01-13' },
];

const MOCK_CUSTOM_ARTICLES: CustomArticle[] = [
  { id: 1, title: '나만의 이야기: 오늘의 감정', createdAt: '2024-01-15', status: 'published' },
  { id: 2, title: '주간 감정 리포트', createdAt: '2024-01-10', status: 'draft' },
];

const MOCK_CURATED_ARTICLES: CuratedArticle[] = [
  {
    id: 1,
    originalTitle: '글로벌 경제 전망: 새로운 신호',
    userComment: '이 기사를 읽고 경제 변화에 대한 새로운 관점을 얻었습니다.',
    userEmotion: 'vibrance',
    createdAt: '2024-01-16',
  },
  {
    id: 2,
    originalTitle: '환경 보호를 위한 청년들의 움직임',
    userComment: '작은 실천부터 시작해야겠다는 생각이 들었습니다.',
    userEmotion: 'serenity',
    createdAt: '2024-01-15',
  },
];

const createEmptySocialConnections = (): UserSocialConnections => ({
  webUrl: '',
  instagramHandle: '',
  threadsHandle: '',
  youtubeChannelUrl: '',
  updatedAt: '',
});

export default function MyPage() {
  const { user } = useEmotionStore();
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

  const socialOwnerId = String(user?.id || 'guest');

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
              {MOCK_CURATED_ARTICLES.map((article) => (
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
                          {EMOTION_CONFIG.find((e) => e.type === article.userEmotion)?.labelKo || article.userEmotion}
                        </span>
                        <span className="text-xs text-gray-400">{article.createdAt}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" data-testid={`button-share-curated-${article.id}`}>
                          <Share2 className="w-4 h-4 text-gray-400" />
                        </Button>
                        <Button variant="ghost" size="icon" data-testid={`button-delete-curated-${article.id}`}>
                          <Trash2 className="w-4 h-4 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="space-y-3">
              {MOCK_CUSTOM_ARTICLES.map((article) => (
                <div
                  key={article.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between group overflow-visible hover-elevate"
                  data-testid={`custom-article-${article.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <div>
                      <h3 className="font-medium text-gray-800" data-testid={`text-custom-title-${article.id}`}>{article.title}</h3>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-400">{article.createdAt}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {article.status === 'published' ? '공개' : '임시저장'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" data-testid={`button-view-custom-${article.id}`}>
                      <Eye className="w-4 h-4 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid={`button-edit-custom-${article.id}`}>
                      <Edit className="w-4 h-4 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid={`button-delete-custom-${article.id}`}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
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

