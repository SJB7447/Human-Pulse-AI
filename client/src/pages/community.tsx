import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Header } from '@/components/Header';
import { EMOTION_CONFIG, type EmotionType, useEmotionStore } from '@/lib/store';
import { Loader2, Send } from 'lucide-react';
import { DBService } from '@/services/DBService';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CommunityItem {
  id: string;
  title: string;
  emotion: EmotionType;
  category?: string;
  content?: string;
  excerpt: string;
  author: string;
  createdAt: string | null;
}

interface InsightDraft {
  id: string;
  emotion: EmotionType;
  opinion: string;
  updatedAt: string;
}

const COMMUNITY_DRAFTS_KEY = 'community_insight_drafts_v1';

const emotionColorMap = EMOTION_CONFIG.reduce<Record<string, string>>((acc, emotion) => {
  acc[emotion.type] = emotion.color;
  return acc;
}, {});

export default function CommunityPage() {
  const { toast } = useToast();
  const { user } = useEmotionStore();
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opinion, setOpinion] = useState('');
  const [emotion, setEmotion] = useState<EmotionType>('spectrum');
  const [drafts, setDrafts] = useState<InsightDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<CommunityItem | null>(null);
  const [lastPublishedLink, setLastPublishedLink] = useState('');
  const canPublish = Boolean(user);

  const loadFeed = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await DBService.getCommunityFeed(24);
      setItems((data || []) as CommunityItem[]);
    } catch (e: any) {
      setError(e?.message || '커뮤니티 피드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFeed();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COMMUNITY_DRAFTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const restored = parsed
        .filter((row) => typeof row?.id === 'string' && typeof row?.opinion === 'string')
        .map((row) => ({
          id: String(row.id),
          emotion: (row.emotion || 'spectrum') as EmotionType,
          opinion: String(row.opinion),
          updatedAt: String(row.updatedAt || new Date().toISOString()),
        })) as InsightDraft[];
      setDrafts(restored.slice(0, 20));
    } catch (restoreError) {
      console.warn('Failed to restore community drafts', restoreError);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COMMUNITY_DRAFTS_KEY, JSON.stringify(drafts.slice(0, 20)));
    } catch (persistError) {
      console.warn('Failed to persist community drafts', persistError);
    }
  }, [drafts]);

  useEffect(() => {
    if (!items.length) return;
    const targetId = (window.location.hash || '').replace('#post-', '').trim();
    if (!targetId) return;
    const element = document.getElementById(`post-${targetId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [items]);

  const handleSaveDraft = async () => {
    if (!opinion.trim()) {
      toast({
        title: '임시저장 실패',
        description: '의견을 먼저 입력해 주세요.',
        variant: 'destructive',
      });
      return;
    }

    setSavingDraft(true);
    try {
      const now = new Date().toISOString();
      const draftId = activeDraftId || `draft-${Date.now()}`;
      setDrafts((prev) => {
        const nextDraft: InsightDraft = {
          id: draftId,
          emotion,
          opinion: opinion.trim(),
          updatedAt: now,
        };
        const filtered = prev.filter((item) => item.id !== draftId);
        return [nextDraft, ...filtered].slice(0, 20);
      });
      setActiveDraftId(draftId);
      toast({
        title: '임시저장 완료',
        description: '커뮤니티 초안이 저장되었습니다.',
      });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    if (!opinion.trim()) return;
    if (!canPublish) {
      toast({
        title: '로그인 필요',
        description: '게시하려면 로그인이 필요합니다.',
        variant: 'destructive',
      });
      setLocation('/login?redirect=/community');
      return;
    }

    setPosting(true);
    try {
      const created = await DBService.createCommunityPost({
        emotion,
        userOpinion: opinion.trim(),
        isPublic: true,
      });

      const publishedId = created?.id ? String(created.id) : '';
      const publishedLink = publishedId
        ? `${window.location.origin}/community#post-${publishedId}`
        : `${window.location.origin}/community`;
      setLastPublishedLink(publishedLink);

      if (activeDraftId) {
        setDrafts((prev) => prev.filter((row) => row.id !== activeDraftId));
        setActiveDraftId(null);
      }

      setOpinion('');
      toast({
        title: '등록 완료',
        description: '커뮤니티 피드에 반영되었습니다.',
      });

      await loadFeed();
    } catch (e: any) {
      toast({
        title: '등록 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setPosting(false);
    }
  };

  const handleApplyDraft = (draft: InsightDraft) => {
    setActiveDraftId(draft.id);
    setEmotion(draft.emotion);
    setOpinion(draft.opinion);
    toast({
      title: '초안 불러오기 완료',
      description: '선택한 임시저장 글을 불러왔습니다.',
    });
  };

  const handleDeleteDraft = (draftId: string) => {
    setDrafts((prev) => prev.filter((row) => row.id !== draftId));
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
      setOpinion('');
      setEmotion('spectrum');
    }
  };

  const handleShare = async (link?: string) => {
    const target = link || lastPublishedLink || `${window.location.origin}/community`;
    setSharing(true);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'HueBrief Community Insight',
          text: '커뮤니티 인사이트를 확인해 보세요.',
          url: target,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(target);
      } else {
        throw new Error('공유를 지원하지 않는 환경입니다.');
      }

      toast({
        title: '공유 준비 완료',
        description: typeof navigator.share === 'function'
          ? '공유 시트를 열었습니다.'
          : '링크를 클립보드에 복사했습니다.',
      });
    } catch (e: any) {
      toast({
        title: '공유 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSharing(false);
    }
  };

  const renderedItems = useMemo(() => items.slice(0, 24), [items]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10 pt-24">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">커뮤니티</h1>
          <p className="text-gray-600 mt-2">감정과 의견을 공유하고, 다른 사용자 반응을 확인하세요.</p>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">의견 남기기</h2>
          <div className="grid sm:grid-cols-[180px,1fr] gap-3">
            <select
              value={emotion}
              onChange={(e) => setEmotion(e.target.value as EmotionType)}
              className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              {EMOTION_CONFIG.map((entry) => (
                <option key={entry.type} value={entry.type}>
                  {entry.type}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                value={opinion}
                onChange={(e) => setOpinion(e.target.value)}
                maxLength={200}
                placeholder="공개 의견을 200자 이내로 입력하세요."
                className="flex-1 h-10 rounded-md border border-gray-300 px-3 text-sm"
              />
              <Button variant="outline" onClick={handleSaveDraft} disabled={savingDraft || !opinion.trim()}>
                {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : '임시저장'}
              </Button>
              <Button onClick={handleSubmit} disabled={posting || !opinion.trim() || !canPublish}>
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              정책: 게스트는 임시저장만 가능하며, 게시는 로그인 사용자만 가능합니다.
            </p>
            <Button size="sm" variant="secondary" onClick={() => void handleShare()} disabled={sharing}>
              {sharing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              공유
            </Button>
          </div>
          {!canPublish && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
              현재 게스트 모드입니다. 로그인 후 커뮤니티 게시가 활성화됩니다.
            </p>
          )}
          {lastPublishedLink && (
            <p className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2 py-1 break-all">
              최근 게시 링크: {lastPublishedLink}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">임시저장 목록</h2>
          {drafts.length === 0 ? (
            <p className="text-sm text-gray-500">저장된 임시초안이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => (
                <div key={draft.id} className="rounded-lg border border-gray-200 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 line-clamp-1">{draft.opinion}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {draft.emotion} · {new Date(draft.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleApplyDraft(draft)}>불러오기</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteDraft(draft.id)}>삭제</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            불러오는 중...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && renderedItems.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-10 text-center text-gray-500">
            아직 공개된 커뮤니티 글이 없습니다.
          </div>
        )}

        {!loading && !error && renderedItems.length > 0 && (
          <div className="columns-1 md:columns-2 lg:columns-3 gap-5 space-y-5">
            {renderedItems.map((item) => {
              const emotionColor = emotionColorMap[item.emotion] || '#00abaf';
              return (
                <article
                  key={item.id}
                  id={`post-${item.id}`}
                  className="break-inside-avoid rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{
                        color: emotionColor,
                        border: `1px solid ${emotionColor}66`,
                        backgroundColor: `${emotionColor}14`,
                      }}
                    >
                      {item.emotion}
                    </span>
                    <span className="text-xs text-gray-400">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}
                    </span>
                  </div>

                  {item.category && (
                    <div className="mb-2">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {item.category}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    className="text-left w-full"
                    onClick={() => setSelectedPost(item)}
                  >
                    <h2 className="font-semibold text-gray-900 mb-2 leading-snug hover:underline">{item.title}</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">{item.excerpt}</p>
                  </button>

                  <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
                    작성자: {item.author}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-10">
          <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
            홈으로 돌아가기
          </Link>
        </div>

        <Dialog open={Boolean(selectedPost)} onOpenChange={(open) => { if (!open) setSelectedPost(null); }}>
          <DialogContent className="max-w-3xl max-h-[82vh] overflow-hidden bg-[#fffdf7] border border-[#ece4d4]">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-gray-900 break-words">
                {selectedPost?.title || ''}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>{selectedPost?.createdAt ? new Date(selectedPost.createdAt).toLocaleString() : '-'}</span>
              <span>·</span>
              <span>{selectedPost?.author || '-'}</span>
              {selectedPost?.category ? (
                <>
                  <span>·</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{selectedPost.category}</span>
                </>
              ) : null}
            </div>
            <div className="mt-3 max-h-[56vh] overflow-y-auto rounded-lg border border-[#ebe3d3] bg-white/90 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {String(selectedPost?.content || selectedPost?.excerpt || '')}
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
