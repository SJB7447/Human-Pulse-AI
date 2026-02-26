import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Header } from '@/components/Header';
import { EMOTION_CONFIG, type EmotionType, useEmotionStore } from '@/lib/store';
import { Heart, Loader2, Pencil, Send } from 'lucide-react';
import { DBService, type CommunityCommentRecord } from '@/services/DBService';
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
  ownerId?: string;
  sourceType?: 'community_post' | 'reader_article';
  createdAt: string | null;
  updatedAt?: string | null;
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
  const [comments, setComments] = useState<CommunityCommentRecord[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentPosting, setCommentPosting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [likingCommentId, setLikingCommentId] = useState<string | null>(null);
  const [commentSort, setCommentSort] = useState<'latest' | 'popular'>('latest');
  const [editingPost, setEditingPost] = useState<CommunityItem | null>(null);
  const [editSummary, setEditSummary] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [lastPublishedLink, setLastPublishedLink] = useState('');
  const canPublish = Boolean(user);
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';

  const loadComments = async (postId: string) => {
    setCommentsLoading(true);
    try {
      const rows = await DBService.getCommunityComments(postId, 80);
      setComments(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      toast({
        title: '댓글 불러오기 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

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
  const sortedComments = useMemo(() => {
    const rows = [...comments];
    if (commentSort === 'popular') {
      return rows.sort((a, b) => {
        const likeGap = Number(b.likeCount || 0) - Number(a.likeCount || 0);
        if (likeGap !== 0) return likeGap;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
    }
    return rows.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );
  }, [comments, commentSort]);
  const canEditItem = (item: CommunityItem): boolean => {
    if (!user) return false;
    const ownerId = String(item.ownerId || '').trim();
    const currentUserId = String(user.id || '').trim();
    return (ownerId && ownerId === currentUserId) || isAdmin;
  };

  const openEditDialog = (item: CommunityItem) => {
    setEditingPost(item);
    setEditSummary(String(item.excerpt || '').trim());
    setEditContent(String(item.content || item.excerpt || '').trim());
  };

  const handleSavePostEdit = async () => {
    if (!editingPost) return;
    if (!editSummary.trim() && !editContent.trim()) {
      toast({
        title: '수정 실패',
        description: '요약 또는 본문을 입력해 주세요.',
        variant: 'destructive',
      });
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await DBService.updateCommunityPost(editingPost.id, {
        summary: editSummary.trim(),
        content: editContent.trim(),
      });
      setItems((prev) => prev.map((row) => (row.id === editingPost.id ? { ...row, ...(updated as CommunityItem) } : row)));
      setSelectedPost((prev) => (prev?.id === editingPost.id ? ({ ...prev, ...(updated as CommunityItem) }) : prev));
      setEditingPost(null);
      toast({
        title: '수정 완료',
        description: '본문/요약/수정시각이 반영되었습니다.',
      });
    } catch (e: any) {
      toast({
        title: '수정 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const canEditComment = (comment: CommunityCommentRecord): boolean => {
    if (!user) return false;
    return String(comment.userId || '').trim() === String(user.id || '').trim() || isAdmin;
  };

  const handleCreateComment = async () => {
    const postId = String(selectedPost?.id || '').trim();
    if (!postId) return;
    if (!commentInput.trim()) return;
    setCommentPosting(true);
    try {
      const created = await DBService.createCommunityComment(postId, commentInput.trim());
      setComments((prev) => [...prev, created]);
      setCommentInput('');
      toast({
        title: '댓글 등록 완료',
      });
    } catch (e: any) {
      toast({
        title: '댓글 등록 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setCommentPosting(false);
    }
  };

  const startEditComment = (comment: CommunityCommentRecord) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.content);
  };

  const handleSaveCommentEdit = async (comment: CommunityCommentRecord) => {
    const postId = String(selectedPost?.id || '').trim();
    if (!postId) return;
    if (!editingCommentText.trim()) return;
    setSavingCommentEdit(true);
    try {
      const updated = await DBService.updateCommunityComment(postId, comment.id, editingCommentText.trim());
      setComments((prev) => prev.map((row) => (row.id === comment.id ? updated : row)));
      setEditingCommentId(null);
      setEditingCommentText('');
      toast({
        title: '댓글 수정 완료',
      });
    } catch (e: any) {
      toast({
        title: '댓글 수정 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingCommentEdit(false);
    }
  };

  const handleDeleteComment = async (comment: CommunityCommentRecord) => {
    const postId = String(selectedPost?.id || '').trim();
    if (!postId) return;
    if (!confirm('이 댓글을 삭제하시겠습니까?')) return;
    setDeletingCommentId(comment.id);
    try {
      await DBService.deleteCommunityComment(postId, comment.id);
      setComments((prev) => prev.filter((row) => row.id !== comment.id));
      if (editingCommentId === comment.id) {
        setEditingCommentId(null);
        setEditingCommentText('');
      }
    } catch (e: any) {
      toast({
        title: '댓글 삭제 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleToggleCommentLike = async (comment: CommunityCommentRecord) => {
    const postId = String(selectedPost?.id || '').trim();
    if (!postId) return;
    if (!user) {
      toast({
        title: '로그인 필요',
        description: '공감은 로그인 후 사용할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }
    setLikingCommentId(comment.id);
    try {
      const updated = await DBService.toggleCommunityCommentLike(postId, comment.id);
      setComments((prev) => prev.map((row) => (row.id === comment.id ? updated : row)));
    } catch (e: any) {
      toast({
        title: '공감 처리 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setLikingCommentId(null);
    }
  };

  useEffect(() => {
    if (!selectedPost?.id) return;
    void loadComments(selectedPost.id);
    setCommentInput('');
    setEditingCommentId(null);
    setEditingCommentText('');
  }, [selectedPost?.id]);

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
                    {item.updatedAt && item.updatedAt !== item.createdAt ? (
                      <span className="text-[10px] text-gray-400">수정됨</span>
                    ) : null}
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
                    <div className="flex items-center justify-between gap-2">
                      <span>작성자: {item.author}</span>
                      {canEditItem(item) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => openEditDialog(item)}
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          수정
                        </Button>
                      ) : null}
                    </div>
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
          <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden bg-[#fffdf7] border border-[#ece4d4]">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-gray-900 break-words">
                {selectedPost?.title || ''}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>{selectedPost?.createdAt ? new Date(selectedPost.createdAt).toLocaleString() : '-'}</span>
              {selectedPost?.updatedAt && selectedPost.updatedAt !== selectedPost.createdAt ? (
                <>
                  <span>·</span>
                  <span>수정: {new Date(selectedPost.updatedAt).toLocaleString()}</span>
                </>
              ) : null}
              <span>·</span>
              <span>{selectedPost?.author || '-'}</span>
              {selectedPost?.category ? (
                <>
                  <span>·</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{selectedPost.category}</span>
                </>
              ) : null}
            </div>
            <div className="mt-3 space-y-4 overflow-y-auto pr-1 max-h-[calc(88vh-11rem)]">
              <div className="rounded-lg border border-[#ebe3d3] bg-white/90 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                  {String(selectedPost?.content || selectedPost?.excerpt || '')}
                </p>
              </div>
              <div className="rounded-lg border border-[#ebe3d3] bg-white/90 p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-800">댓글</h3>
                    <span className="text-xs text-gray-500">{comments.length}개</span>
                  </div>
                  <div className="inline-flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setCommentSort('latest')}
                      className={`h-6 px-2.5 rounded text-[11px] ${commentSort === 'latest' ? 'bg-slate-100 text-slate-800' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      최신순
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommentSort('popular')}
                      className={`h-6 px-2.5 rounded text-[11px] ${commentSort === 'popular' ? 'bg-slate-100 text-slate-800' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      인기순
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    maxLength={800}
                    placeholder={user ? '댓글을 입력하세요.' : '로그인 후 댓글 작성이 가능합니다.'}
                    disabled={!user || commentPosting}
                    className="h-9 flex-1 rounded-md border border-gray-300 px-3 text-sm"
                  />
                  <Button size="sm" onClick={() => void handleCreateComment()} disabled={!user || commentPosting || !commentInput.trim()}>
                    {commentPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : '등록'}
                  </Button>
                </div>
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                  AI+규칙 기반 댓글 감시자가 욕설/악성비난/혐오/스팸 표현을 자동 필터링하고 있습니다.
                </p>

                <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto">
                  {commentsLoading ? (
                    <div className="text-xs text-gray-500 py-3">댓글을 불러오는 중...</div>
                  ) : sortedComments.length === 0 ? (
                    <div className="text-xs text-gray-500 py-3">첫 댓글을 남겨보세요.</div>
                  ) : sortedComments.map((comment) => (
                    <div key={comment.id} className="rounded-md border border-gray-200 bg-white p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-gray-500">
                          {comment.username} · {new Date(comment.createdAt).toLocaleString()}
                          {comment.updatedAt !== comment.createdAt ? ` · 수정 ${new Date(comment.updatedAt).toLocaleString()}` : ''}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className={`h-6 inline-flex items-center justify-center rounded px-1.5 gap-1 ${
                              comment.likedByMe ? 'text-rose-600 bg-rose-50' : 'text-gray-500 hover:bg-rose-50 hover:text-rose-500'
                            }`}
                            title={`공감 ${comment.likeCount}개`}
                            aria-label="공감"
                            onClick={() => void handleToggleCommentLike(comment)}
                            disabled={likingCommentId === comment.id}
                          >
                            <Heart className={`w-3.5 h-3.5 ${comment.likedByMe ? 'fill-current' : ''}`} />
                            <span className="text-[11px] leading-none">{Number(comment.likeCount || 0)}</span>
                          </button>
                          {canEditComment(comment) ? (
                            editingCommentId === comment.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => void handleSaveCommentEdit(comment)}
                                  disabled={savingCommentEdit || !editingCommentText.trim()}
                                >
                                  저장
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => {
                                    setEditingCommentId(null);
                                    setEditingCommentText('');
                                  }}
                                >
                                  취소
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => startEditComment(comment)}>
                                  수정
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px] text-rose-700 hover:text-rose-800"
                                  onClick={() => void handleDeleteComment(comment)}
                                  disabled={deletingCommentId === comment.id}
                                >
                                  삭제
                                </Button>
                              </>
                            )
                          ) : null}
                        </div>
                      </div>
                      {editingCommentId === comment.id ? (
                        <textarea
                          value={editingCommentText}
                          onChange={(e) => setEditingCommentText(e.target.value)}
                          className="mt-2 min-h-[72px] w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                          maxLength={800}
                        />
                      ) : (
                        <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {selectedPost && canEditItem(selectedPost) ? (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(selectedPost)}>
                    <Pencil className="w-3 h-3 mr-1" />
                    이 글 수정
                  </Button>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={Boolean(editingPost)} onOpenChange={(open) => { if (!open) setEditingPost(null); }}>
          <DialogContent className="max-w-2xl max-h-[84vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>커뮤니티 글 수정</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">요약</label>
                <textarea
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="mt-1 min-h-[88px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  maxLength={1000}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">본문</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="mt-1 min-h-[220px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  maxLength={24000}
                />
              </div>
              <p className="text-[11px] text-gray-500">
                정책: 본인 글만 수정 가능하며, 관리자 역할은 override 수정이 가능합니다.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingPost(null)} disabled={savingEdit}>
                  취소
                </Button>
                <Button onClick={() => void handleSavePostEdit()} disabled={savingEdit}>
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : '수정 저장'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
