import { supabase } from './supabaseClient';
import { useEmotionStore } from '@/lib/store';
import type { EmotionType } from '@/lib/store';

type ApiError = Error & { status?: number };

type AdminReviewPayload = {
    articleId: string;
    completed: boolean;
    issues: string[];
    memo: string;
    updatedAt: string;
};

type ReportStatus = 'reported' | 'in_review' | 'resolved' | 'rejected';
type ReportSanction = 'none' | 'hide_article' | 'delete_article' | 'warn_author';
type ExportFormat = 'excel' | 'pdf';
export type ApiHealthPayload = {
    status?: string;
    mode?: 'full' | 'fallback' | 'lightweight';
    routeBootstrapError?: string | null;
    timestamp?: string;
};

export type UserSocialConnections = {
    webUrl: string;
    instagramHandle: string;
    threadsHandle: string;
    youtubeChannelUrl: string;
    updatedAt: string;
};

export type UserInsightRecord = {
    id: string;
    articleId: string;
    originalTitle: string;
    userComment: string;
    userEmotion: EmotionType;
    userFeelingText: string;
    selectedTags: string[];
    createdAt: string;
};

export type UserComposedArticleRecord = {
    id: string;
    userId: string;
    sourceArticleId: string;
    sourceTitle: string;
    sourceUrl: string;
    sourceEmotion: EmotionType;
    sourceCategory: string;
    userOpinion: string;
    extraRequest: string;
    requestedReferences: string[];
    generatedTitle: string;
    generatedSummary: string;
    generatedContent: string;
    referenceLinks: string[];
    status: 'draft' | 'published';
    submissionStatus: 'pending' | 'approved' | 'rejected';
    moderationMemo: string;
    reviewedBy: string;
    reviewedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type CommunityCommentRecord = {
    id: string;
    postId: string;
    userId: string;
    username: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    likeCount: number;
    likedByMe: boolean;
};

const SOCIAL_CONNECTIONS_STORAGE_PREFIX = 'huebrief.socialConnections.v1';
const USER_INSIGHTS_STORAGE_PREFIX = 'huebrief.userInsights.v1';
const USER_COMPOSED_ARTICLES_STORAGE_PREFIX = 'huebrief.userComposedArticles.v1';

const createDefaultSocialConnections = (): UserSocialConnections => ({
    webUrl: '',
    instagramHandle: '',
    threadsHandle: '',
    youtubeChannelUrl: '',
    updatedAt: new Date(0).toISOString(),
});

const normalizeInsightEmotion = (value: unknown): EmotionType => {
    const raw = String(value || '').trim().toLowerCase();
    const valid: EmotionType[] = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'];
    return valid.includes(raw as EmotionType) ? (raw as EmotionType) : 'spectrum';
};

const createInsightStorageKey = (userId: string): string =>
    `${USER_INSIGHTS_STORAGE_PREFIX}:${String(userId || '').trim()}`;

const createComposedStorageKey = (userId: string): string =>
    `${USER_COMPOSED_ARTICLES_STORAGE_PREFIX}:${String(userId || '').trim()}`;

const parseInsightRows = (raw: string | null): UserInsightRecord[] => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((row: any): UserInsightRecord | null => {
                const id = String(row?.id || '').trim();
                const articleId = String(row?.articleId || '').trim();
                const originalTitle = String(row?.originalTitle || '').trim();
                const userComment = String(row?.userComment || '').trim();
                const userFeelingText = String(row?.userFeelingText || '').trim();
                const selectedTags = Array.isArray(row?.selectedTags)
                    ? row.selectedTags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean).slice(0, 3)
                    : [];
                if (!id || !articleId || !originalTitle || !userComment) return null;
                return {
                    id,
                    articleId,
                    originalTitle,
                    userComment,
                    userFeelingText,
                    selectedTags,
                    userEmotion: normalizeInsightEmotion(row?.userEmotion),
                    createdAt: new Date(row?.createdAt || Date.now()).toISOString(),
                };
            })
            .filter((row): row is UserInsightRecord => Boolean(row))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
        return [];
    }
};

const parseComposedRows = (raw: string | null): UserComposedArticleRecord[] => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((row: any): UserComposedArticleRecord | null => {
                const id = String(row?.id || '').trim();
                const userId = String(row?.userId || row?.user_id || '').trim();
                const sourceArticleId = String(row?.sourceArticleId || row?.source_article_id || '').trim();
                const sourceTitle = String(row?.sourceTitle || row?.source_title || '').trim();
                const userOpinion = String(row?.userOpinion || row?.user_opinion || '').trim();
                const generatedTitle = String(row?.generatedTitle || row?.generated_title || '').trim();
                const generatedSummary = String(row?.generatedSummary || row?.generated_summary || '').trim();
                const generatedContent = String(row?.generatedContent || row?.generated_content || '').trim();
                if (!id || !userId || !sourceArticleId || !sourceTitle || !userOpinion || !generatedTitle || !generatedSummary || !generatedContent) {
                    return null;
                }

                const requestedReferences = Array.isArray(row?.requestedReferences ?? row?.requested_references)
                    ? (row?.requestedReferences ?? row?.requested_references).map((v: unknown) => String(v || '').trim()).filter(Boolean).slice(0, 8)
                    : [];
                const referenceLinks = Array.isArray(row?.referenceLinks ?? row?.reference_links)
                    ? (row?.referenceLinks ?? row?.reference_links).map((v: unknown) => String(v || '').trim()).filter(Boolean).slice(0, 12)
                    : [];

                return {
                    id,
                    userId,
                    sourceArticleId,
                    sourceTitle,
                    sourceUrl: String(row?.sourceUrl ?? row?.source_url ?? '').trim(),
                    sourceEmotion: normalizeInsightEmotion(row?.sourceEmotion ?? row?.source_emotion),
                    sourceCategory: String(row?.sourceCategory ?? row?.source_category ?? '').trim() || 'General',
                    userOpinion,
                    extraRequest: String(row?.extraRequest ?? row?.extra_request ?? '').trim(),
                    requestedReferences,
                    generatedTitle,
                    generatedSummary,
                    generatedContent,
                    referenceLinks,
                    status: String(row?.status || 'draft') === 'published' ? 'published' : 'draft',
                    submissionStatus: String(row?.submissionStatus ?? row?.submission_status ?? 'pending') === 'approved'
                        ? 'approved'
                        : String(row?.submissionStatus ?? row?.submission_status ?? 'pending') === 'rejected'
                            ? 'rejected'
                            : 'pending',
                    moderationMemo: String(row?.moderationMemo ?? row?.moderation_memo ?? '').trim(),
                    reviewedBy: String(row?.reviewedBy ?? row?.reviewed_by ?? '').trim(),
                    reviewedAt: String(row?.reviewedAt ?? row?.reviewed_at ?? '').trim(),
                    createdAt: new Date(row?.createdAt ?? row?.created_at ?? Date.now()).toISOString(),
                    updatedAt: new Date(row?.updatedAt ?? row?.updated_at ?? Date.now()).toISOString(),
                };
            })
            .filter((row): row is UserComposedArticleRecord => Boolean(row))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
        return [];
    }
};

const createApiError = async (response: Response, fallbackMessage: string): Promise<ApiError> => {
    let message = fallbackMessage;

    try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const payload = await response.json();
            message = payload?.error || payload?.message || fallbackMessage;
        } else {
            const text = await response.text();
            if (text?.trim()) {
                message = text.slice(0, 200);
            }
        }
    } catch {
        // keep fallback message
    }

    const error: ApiError = new Error(message);
    error.status = response.status;
    return error;
};

const buildActorHeaders = (): Record<string, string> => {
    const actor = useEmotionStore.getState().user;
    if (!actor) return {};
    return {
        'x-actor-id': String(actor.id || '').slice(0, 128),
        'x-actor-role': String(actor.role || 'admin').slice(0, 32),
    };
};

const normalizeOwnerToken = (value: unknown): string =>
    String(value || '').trim().toLowerCase();

const uniqueNormalized = (values: unknown[]): Set<string> => {
    const out = new Set<string>();
    for (const value of values || []) {
        const normalized = normalizeOwnerToken(value);
        if (normalized) out.add(normalized);
    }
    return out;
};

export const DBService = {
    async getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            return { ...user, profile };
        }

        const storeUser = useEmotionStore.getState().user;
        if (storeUser && storeUser.id.startsWith('demo-')) {
            return {
                ...storeUser,
                profile: {
                    username: storeUser.name,
                    email: storeUser.email,
                    role: storeUser.role,
                },
                user_metadata: {
                    name: storeUser.name,
                },
            };
        }

        return null;
    },

    async saveArticle({ title, content, summary, source, image, category, emotionLabel }: {
        title: string;
        content: string;
        summary?: string;
        source?: string;
        image?: string;
        category?: string;
        emotionLabel: string;
    }) {
        const user = await this.getCurrentUser();
        if (!user) throw new Error('Login required');

        const validEmotions = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'];
        const emotion = validEmotions.includes(emotionLabel) ? emotionLabel : 'serenity';

        const response = await fetch('/api/articles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                content,
                summary: summary || content.slice(0, 100) + '...',
                source: source || 'HueBrief Journalist',
                image: image || null,
                category: category || 'General',
                emotion,
                authorId: user.id || 'anonymous',
                authorName: user.user_metadata?.name || user.email || 'Anonymous',
            }),
        });

        if (!response.ok) {
            throw await createApiError(response, 'Failed to save article');
        }

        return await response.json();
    },

    async updateArticle(id: string, updates: any) {
        const normalizedUpdates = {
            ...updates,
            ...(updates?.is_published !== undefined ? { isPublished: updates.is_published } : {}),
            ...(updates?.author_id !== undefined ? { authorId: updates.author_id } : {}),
            ...(updates?.author_name !== undefined ? { authorName: updates.author_name } : {}),
        };

        const response = await fetch(`/api/articles/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify(normalizedUpdates),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to update article');
        return await response.json();
    },

    async deleteArticle(id: string) {
        const response = await fetch(`/api/articles/${id}`, {
            method: 'DELETE',
            headers: buildActorHeaders(),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to delete article');
        return true;
    },

    async getMyArticles(authorId: string, options?: { authorNames?: string[]; authorEmails?: string[] }) {
        const response = await fetch('/api/articles?all=true');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch articles');
        const allArticles = await response.json();

        const normalizedAuthorId = normalizeOwnerToken(authorId);
        const nameCandidates = uniqueNormalized(options?.authorNames || []);
        const emailCandidates = uniqueNormalized(options?.authorEmails || []);
        const emailLocalParts = uniqueNormalized(Array.from(emailCandidates).map((email) => email.split('@')[0]));

        return allArticles.filter((a: any) => {
            const articleAuthorId = normalizeOwnerToken(a.authorId || a.author_id);
            if (articleAuthorId && normalizedAuthorId && articleAuthorId === normalizedAuthorId) {
                return true;
            }

            // Backward compatibility for rows created when author_id was stored as null.
            if (!articleAuthorId) {
                const articleAuthorName = normalizeOwnerToken(a.authorName || a.author_name);
                if (
                    articleAuthorName &&
                    (nameCandidates.has(articleAuthorName) ||
                        emailCandidates.has(articleAuthorName) ||
                        emailLocalParts.has(articleAuthorName))
                ) {
                    return true;
                }
            }

            return false;
        });
    },

    async saveGeneratedContent(articleId: number, generatedText: string) {
        const { data, error } = await supabase
            .from('generated_contents')
            .insert([{ article_id: articleId, generated_text: generatedText, deploy_status: 'ready' }])
            .select();

        if (error) throw error;
        return data;
    },

    async getAdminDashboardData() {
        const response = await fetch('/api/articles?all=true');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch admin data');
        return await response.json();
    },

    async updateGeneratedContent(generatedId: number, generatedText: string, status: string) {
        const { error } = await supabase
            .from('generated_contents')
            .update({ generated_text: generatedText, deploy_status: status })
            .eq('id', generatedId);
        if (error) throw error;
    },

    async getAdminStats() {
        const response = await fetch('/api/admin/stats');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch admin stats');
        return await response.json();
    },

    async getApiHealth(): Promise<ApiHealthPayload> {
        const response = await fetch('/api/health', { cache: 'no-store' });
        if (!response.ok) throw await createApiError(response, 'Failed to fetch API health');
        return await response.json();
    },

    async createShortLink(targetUrl: string) {
        const normalized = String(targetUrl || '').trim();
        if (!normalized) throw new Error('targetUrl is required');

        const response = await fetch('/api/share/short-links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl: normalized }),
        });

        if (!response.ok) throw await createApiError(response, 'Failed to create short link');
        return await response.json() as {
            slug: string;
            shortUrl: string;
            shortDisplay?: string;
            targetUrl: string;
            createdAt: string;
            hits: number;
        };
    },

    async createAdminReport(articleId: string, reason: string) {
        const response = await fetch('/api/admin/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify({ articleId, reason }),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to register report');
        return await response.json();
    },

    async getAdminReports() {
        const response = await fetch('/api/admin/reports');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch admin reports');
        return await response.json();
    },

    async getAdminReaderArticles(status?: 'pending' | 'approved' | 'rejected') {
        const search = status ? `?status=${encodeURIComponent(status)}` : '';
        const response = await fetch(`/api/admin/reader-articles${search}`);
        if (!response.ok) throw await createApiError(response, 'Failed to fetch reader articles');
        return parseComposedRows(JSON.stringify(await response.json()));
    },

    async decideAdminReaderArticle(
        articleId: string,
        payload: { submissionStatus: 'pending' | 'approved' | 'rejected'; moderationMemo?: string },
    ) {
        const response = await fetch(`/api/admin/reader-articles/${encodeURIComponent(articleId)}/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to update reader article decision');
        return parseComposedRows(JSON.stringify([await response.json()]))[0];
    },

    async deleteAdminReaderArticle(articleId: string): Promise<boolean> {
        const response = await fetch(`/api/admin/reader-articles/${encodeURIComponent(articleId)}`, {
            method: 'DELETE',
            headers: buildActorHeaders(),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to delete reader article');
        return true;
    },

    async updateAdminReportStatus(
        reportId: string,
        payload: { status: ReportStatus; resolution?: string; sanctionType?: ReportSanction },
    ) {
        const response = await fetch(`/api/admin/reports/${reportId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to update admin report status');
        return await response.json();
    },

    async getAdminReviews(): Promise<AdminReviewPayload[]> {
        const response = await fetch('/api/admin/reviews');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch admin reviews');
        return await response.json();
    },

    async upsertAdminReview(articleId: string, updates: {
        completed?: boolean;
        memo?: string;
        issues?: string[];
    }): Promise<AdminReviewPayload> {
        const response = await fetch(`/api/admin/reviews/${articleId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify(updates),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to update admin review');
        return await response.json();
    },

    async addAdminReviewIssue(articleId: string, issue: string): Promise<AdminReviewPayload> {
        const response = await fetch(`/api/admin/reviews/${articleId}/issues`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify({ issue }),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to add review issue');
        return await response.json();
    },

    async getAdminActionLogs(limit = 100) {
        const response = await fetch(`/api/admin/action-logs?limit=${Math.max(1, Math.min(limit, 500))}`);
        if (!response.ok) throw await createApiError(response, 'Failed to fetch admin action logs');
        return await response.json();
    },

    async getAdminExportHistory(limit = 20) {
        const response = await fetch(`/api/admin/exports/history?limit=${Math.max(1, Math.min(limit, 100))}`);
        if (!response.ok) throw await createApiError(response, 'Failed to fetch export history');
        return await response.json();
    },

    async getAdminExportSchedule() {
        const response = await fetch('/api/admin/exports/schedule');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch export schedule');
        return await response.json();
    },

    async updateAdminExportSchedule(payload: { enabled: boolean; intervalMinutes: number; formats: ExportFormat[] }) {
        const response = await fetch('/api/admin/exports/schedule', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to update export schedule');
        return await response.json();
    },

    async runAdminExport(format: ExportFormat) {
        const response = await fetch('/api/admin/exports/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify({ format }),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to run export');
        return await response.json();
    },

    async getAdminAlerts(limit = 20) {
        const response = await fetch(`/api/admin/alerts?limit=${Math.max(1, Math.min(limit, 100))}`);
        if (!response.ok) throw await createApiError(response, 'Failed to fetch admin alerts');
        return await response.json();
    },

    async getAdminAlertSummary() {
        const response = await fetch('/api/admin/alerts/summary');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch admin alert summary');
        return await response.json();
    },

    async triggerAdminAlertTest(type: 'failure_rate' | 'latency' | 'ai_error') {
        const response = await fetch('/api/admin/alerts/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify({ type }),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to trigger alert test');
        return await response.json();
    },

    async getAdminAiNewsSettings() {
        const response = await fetch('/api/admin/ai/news/settings');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch AI news settings');
        return await response.json();
    },

    async updateAdminAiNewsSettings(payload: { modelTimeoutMs: number }) {
        const response = await fetch('/api/admin/ai/news/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to update AI news settings');
        return await response.json();
    },

    async getAuthContext() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            const storeUser = useEmotionStore.getState().user;
            if (storeUser) {
                return {
                    userId: storeUser.id,
                    email: storeUser.email || '',
                    username: storeUser.name || storeUser.email?.split('@')[0] || 'user',
                    role: storeUser.role || 'general',
                };
            }
            return null;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        return {
            userId: user.id,
            email: user.email || '',
            username: profile?.username || user.user_metadata?.name || user.email?.split('@')[0] || 'user',
            role: profile?.role || user.user_metadata?.role || 'general',
        };
    },

    async getUserSocialConnections(userId: string): Promise<UserSocialConnections> {
        if (!userId || typeof window === 'undefined') {
            return createDefaultSocialConnections();
        }

        const storageKey = `${SOCIAL_CONNECTIONS_STORAGE_PREFIX}:${String(userId).trim()}`;
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return createDefaultSocialConnections();

        try {
            const parsed = JSON.parse(raw) as Partial<UserSocialConnections>;
            return {
                ...createDefaultSocialConnections(),
                ...parsed,
                updatedAt: parsed?.updatedAt || createDefaultSocialConnections().updatedAt,
            };
        } catch {
            return createDefaultSocialConnections();
        }
    },

    async updateUserSocialConnections(
        userId: string,
        patch: Partial<UserSocialConnections>,
    ): Promise<UserSocialConnections> {
        if (!userId || typeof window === 'undefined') {
            return { ...createDefaultSocialConnections(), ...patch, updatedAt: new Date().toISOString() };
        }

        const storageKey = `${SOCIAL_CONNECTIONS_STORAGE_PREFIX}:${String(userId).trim()}`;
        const current = await this.getUserSocialConnections(userId);
        const next: UserSocialConnections = {
            ...current,
            ...patch,
            updatedAt: new Date().toISOString(),
        };

        window.localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
    },

    async getUserInsights(userId: string): Promise<UserInsightRecord[]> {
        if (!userId || typeof window === 'undefined') return [];
        try {
            const response = await fetch(`/api/mypage/insights?userId=${encodeURIComponent(String(userId).trim())}`, {
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) throw await createApiError(response, 'Failed to fetch user insights');
            const payload = await response.json();
            const rows = parseInsightRows(JSON.stringify(payload));
            window.localStorage.setItem(createInsightStorageKey(userId), JSON.stringify(rows));
            return rows;
        } catch {
            const raw = window.localStorage.getItem(createInsightStorageKey(userId));
            return parseInsightRows(raw);
        }
    },

    async saveUserInsight(
        userId: string,
        payload: Omit<UserInsightRecord, 'id' | 'createdAt'>,
    ): Promise<UserInsightRecord> {
        if (!userId || typeof window === 'undefined') {
            throw new Error('로그인이 필요합니다.');
        }
        const normalizedPayload = {
            userId: String(userId).trim(),
            articleId: String(payload.articleId || '').trim(),
            originalTitle: String(payload.originalTitle || '').trim(),
            userComment: String(payload.userComment || '').trim(),
            userEmotion: normalizeInsightEmotion(payload.userEmotion),
            userFeelingText: String(payload.userFeelingText || '').trim(),
            selectedTags: Array.isArray(payload.selectedTags)
                ? payload.selectedTags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 3)
                : [],
        };

        if (!normalizedPayload.articleId || !normalizedPayload.originalTitle || !normalizedPayload.userComment) {
            throw new Error('인사이트 저장 형식이 올바르지 않습니다.');
        }

        try {
            const response = await fetch('/api/mypage/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(normalizedPayload),
            });
            if (!response.ok) throw await createApiError(response, 'Failed to save insight');
            const saved = await response.json() as UserInsightRecord;
            const current = await this.getUserInsights(userId);
            const next = [saved, ...current.filter((row) => row.id !== saved.id)].slice(0, 200);
            window.localStorage.setItem(createInsightStorageKey(userId), JSON.stringify(next));
            return saved;
        } catch {
            const current = await this.getUserInsights(userId);
            const nextRow: UserInsightRecord = {
                id: `insight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                articleId: normalizedPayload.articleId,
                originalTitle: normalizedPayload.originalTitle,
                userComment: normalizedPayload.userComment,
                userFeelingText: normalizedPayload.userFeelingText,
                selectedTags: normalizedPayload.selectedTags,
                userEmotion: normalizedPayload.userEmotion,
                createdAt: new Date().toISOString(),
            };
            const next = [nextRow, ...current].slice(0, 200);
            window.localStorage.setItem(createInsightStorageKey(userId), JSON.stringify(next));
            return nextRow;
        }
    },

    async deleteUserInsight(userId: string, insightId: string): Promise<boolean> {
        if (!userId || typeof window === 'undefined') return false;
        try {
            const response = await fetch(`/api/mypage/insights/${encodeURIComponent(insightId)}?userId=${encodeURIComponent(String(userId).trim())}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw await createApiError(response, 'Failed to delete insight');
        } catch {
            // fallback to local delete
        }

        const current = await this.getUserInsights(userId);
        const next = current.filter((row) => row.id !== insightId);
        window.localStorage.setItem(createInsightStorageKey(userId), JSON.stringify(next));
        return next.length !== current.length;
    },

    async getUserComposedArticles(userId: string): Promise<UserComposedArticleRecord[]> {
        if (!userId || typeof window === 'undefined') return [];
        try {
            const response = await fetch(`/api/mypage/composed-articles?userId=${encodeURIComponent(String(userId).trim())}`, {
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) throw await createApiError(response, 'Failed to fetch composed articles');
            const payload = await response.json();
            const rows = parseComposedRows(JSON.stringify(payload));
            window.localStorage.setItem(createComposedStorageKey(userId), JSON.stringify(rows));
            return rows;
        } catch {
            const raw = window.localStorage.getItem(createComposedStorageKey(userId));
            return parseComposedRows(raw);
        }
    },

    async saveUserComposedArticle(
        userId: string,
        payload: Omit<UserComposedArticleRecord, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'moderationMemo' | 'reviewedBy' | 'reviewedAt'> & {
            moderationMemo?: string;
            reviewedBy?: string;
            reviewedAt?: string;
        },
    ): Promise<UserComposedArticleRecord> {
        if (!userId || typeof window === 'undefined') {
            throw new Error('로그인이 필요합니다.');
        }

        const normalizedPayload = {
            userId: String(userId).trim(),
            sourceArticleId: String(payload.sourceArticleId || '').trim(),
            sourceTitle: String(payload.sourceTitle || '').trim(),
            sourceUrl: String(payload.sourceUrl || '').trim(),
            sourceEmotion: normalizeInsightEmotion(payload.sourceEmotion),
            sourceCategory: String(payload.sourceCategory || '').trim().slice(0, 120) || 'General',
            userOpinion: String(payload.userOpinion || '').trim(),
            extraRequest: String(payload.extraRequest || '').trim(),
            requestedReferences: Array.isArray(payload.requestedReferences)
                ? payload.requestedReferences.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 8)
                : [],
            generatedTitle: String(payload.generatedTitle || '').trim(),
            generatedSummary: String(payload.generatedSummary || '').trim(),
            generatedContent: String(payload.generatedContent || '').trim(),
            referenceLinks: Array.isArray(payload.referenceLinks)
                ? payload.referenceLinks.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 12)
                : [],
            status: payload.status === 'published' ? 'published' : 'draft',
            submissionStatus: payload.submissionStatus === 'approved'
                ? 'approved'
                : payload.submissionStatus === 'rejected'
                    ? 'rejected'
                    : 'pending',
            moderationMemo: String(payload.moderationMemo || '').trim(),
            reviewedBy: String(payload.reviewedBy || '').trim(),
            reviewedAt: String(payload.reviewedAt || '').trim(),
        } as const;

        if (!normalizedPayload.sourceArticleId || !normalizedPayload.sourceTitle || !normalizedPayload.userOpinion || !normalizedPayload.generatedTitle || !normalizedPayload.generatedSummary || !normalizedPayload.generatedContent) {
            throw new Error('생성 기사 저장 형식이 올바르지 않습니다.');
        }

        try {
            const response = await fetch('/api/mypage/composed-articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(normalizedPayload),
            });
            if (!response.ok) throw await createApiError(response, 'Failed to save composed article');
            const savedPayload = await response.json();
            const parsed = parseComposedRows(JSON.stringify([savedPayload]));
            const saved = parsed[0];
            if (!saved) throw new Error('Invalid saved composed article payload');
            const current = await this.getUserComposedArticles(userId);
            const next = [saved, ...current.filter((row) => row.id !== saved.id)].slice(0, 200);
            window.localStorage.setItem(createComposedStorageKey(userId), JSON.stringify(next));
            return saved;
        } catch {
            const current = await this.getUserComposedArticles(userId);
            const nextRow: UserComposedArticleRecord = {
                id: `composed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                userId: normalizedPayload.userId,
                sourceArticleId: normalizedPayload.sourceArticleId,
                sourceTitle: normalizedPayload.sourceTitle,
                sourceUrl: normalizedPayload.sourceUrl,
                sourceEmotion: normalizedPayload.sourceEmotion,
                sourceCategory: normalizedPayload.sourceCategory,
                userOpinion: normalizedPayload.userOpinion,
                extraRequest: normalizedPayload.extraRequest,
                requestedReferences: normalizedPayload.requestedReferences,
                generatedTitle: normalizedPayload.generatedTitle,
                generatedSummary: normalizedPayload.generatedSummary,
                generatedContent: normalizedPayload.generatedContent,
                referenceLinks: normalizedPayload.referenceLinks,
                status: normalizedPayload.status,
                submissionStatus: normalizedPayload.submissionStatus,
                moderationMemo: normalizedPayload.moderationMemo,
                reviewedBy: normalizedPayload.reviewedBy,
                reviewedAt: normalizedPayload.reviewedAt,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            const next = [nextRow, ...current].slice(0, 200);
            window.localStorage.setItem(createComposedStorageKey(userId), JSON.stringify(next));
            return nextRow;
        }
    },

    async deleteUserComposedArticle(userId: string, articleId: string): Promise<boolean> {
        if (!userId || typeof window === 'undefined') return false;
        try {
            const response = await fetch(`/api/mypage/composed-articles/${encodeURIComponent(articleId)}?userId=${encodeURIComponent(String(userId).trim())}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw await createApiError(response, 'Failed to delete composed article');
        } catch {
            // fallback to local delete
        }

        const current = await this.getUserComposedArticles(userId);
        const next = current.filter((row) => row.id !== articleId);
        window.localStorage.setItem(createComposedStorageKey(userId), JSON.stringify(next));
        return next.length !== current.length;
    },

    async updateUserComposedArticle(
        userId: string,
        articleId: string,
        updates: Partial<Pick<
            UserComposedArticleRecord,
            | 'sourceTitle'
            | 'sourceUrl'
            | 'sourceEmotion'
            | 'sourceCategory'
            | 'userOpinion'
            | 'extraRequest'
            | 'requestedReferences'
            | 'generatedTitle'
            | 'generatedSummary'
            | 'generatedContent'
            | 'referenceLinks'
            | 'status'
        >>,
    ): Promise<UserComposedArticleRecord> {
        if (!userId || !articleId || typeof window === 'undefined') {
            throw new Error('유효한 사용자/기사가 필요합니다.');
        }
        const payload: Record<string, unknown> = {};
        if (typeof updates.sourceTitle === 'string') payload.sourceTitle = updates.sourceTitle.trim();
        if (typeof updates.sourceUrl === 'string') payload.sourceUrl = updates.sourceUrl.trim();
        if (typeof updates.sourceEmotion === 'string') payload.sourceEmotion = normalizeInsightEmotion(updates.sourceEmotion);
        if (typeof updates.sourceCategory === 'string') payload.sourceCategory = updates.sourceCategory.trim().slice(0, 120);
        if (typeof updates.userOpinion === 'string') payload.userOpinion = updates.userOpinion.trim();
        if (typeof updates.extraRequest === 'string') payload.extraRequest = updates.extraRequest.trim();
        if (Array.isArray(updates.requestedReferences)) payload.requestedReferences = updates.requestedReferences.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 8);
        if (typeof updates.generatedTitle === 'string') payload.generatedTitle = updates.generatedTitle.trim();
        if (typeof updates.generatedSummary === 'string') payload.generatedSummary = updates.generatedSummary.trim();
        if (typeof updates.generatedContent === 'string') payload.generatedContent = updates.generatedContent.trim();
        if (Array.isArray(updates.referenceLinks)) payload.referenceLinks = updates.referenceLinks.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 12);
        if (typeof updates.status === 'string') payload.status = updates.status === 'published' ? 'published' : 'draft';

        const response = await fetch(`/api/mypage/composed-articles/${encodeURIComponent(articleId)}?userId=${encodeURIComponent(String(userId).trim())}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const apiError = await createApiError(response, 'Failed to update composed article');
            const message = String(apiError?.message || '');
            if (response.status === 404 && /cannot put/i.test(message)) {
                throw new Error('서버에 수정 API가 아직 반영되지 않았습니다. 테스트 서버를 재기동하거나 최신 배포를 반영해 주세요.');
            }
            throw apiError;
        }
        const parsed = parseComposedRows(JSON.stringify([await response.json()]));
        const updated = parsed[0];
        if (!updated) throw new Error('Invalid updated composed article payload');

        const current = await this.getUserComposedArticles(userId);
        const next = [updated, ...current.filter((row) => row.id !== updated.id)].slice(0, 200);
        window.localStorage.setItem(createComposedStorageKey(userId), JSON.stringify(next));
        return updated;
    },

    async resubmitUserComposedArticle(userId: string, articleId: string): Promise<UserComposedArticleRecord> {
        if (!userId || !articleId || typeof window === 'undefined') {
            throw new Error('유효한 사용자/기사가 필요합니다.');
        }

        const response = await fetch(`/api/mypage/composed-articles/${encodeURIComponent(articleId)}/resubmit?userId=${encodeURIComponent(String(userId).trim())}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: String(userId).trim() }),
        });
        if (!response.ok) throw await createApiError(response, 'Failed to request resubmission');

        const parsed = parseComposedRows(JSON.stringify([await response.json()]));
        const updated = parsed[0];
        if (!updated) throw new Error('Invalid resubmitted composed article payload');

        const current = await this.getUserComposedArticles(userId);
        const next = [updated, ...current.filter((row) => row.id !== updated.id)].slice(0, 200);
        window.localStorage.setItem(createComposedStorageKey(userId), JSON.stringify(next));
        return updated;
    },

    async getCommunityFeed(limit = 24) {
        const response = await fetch(`/api/community?limit=${limit}`);
        if (!response.ok) throw await createApiError(response, '커뮤니티 피드를 불러오지 못했습니다.');
        return await response.json();
    },

    async createCommunityPost(payload: {
        emotion: string;
        userOpinion: string;
        articleId?: string;
        isPublic?: boolean;
    }) {
        const auth = await this.getAuthContext();
        if (!auth) throw new Error('로그인이 필요합니다.');

        const response = await fetch('/api/community', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: auth.userId,
                username: auth.username,
                emotion: payload.emotion,
                userOpinion: payload.userOpinion,
                articleId: payload.articleId,
                isPublic: payload.isPublic ?? true,
            }),
        });

        if (!response.ok) throw await createApiError(response, '커뮤니티 글 등록에 실패했습니다.');
        return await response.json();
    },

    async updateCommunityPost(
        postId: string,
        payload: { summary?: string; content?: string },
    ) {
        const auth = await this.getAuthContext();
        if (!auth) throw new Error('로그인이 필요합니다.');

        const response = await fetch(`/api/community/${encodeURIComponent(postId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify({
                userId: auth.userId,
                summary: typeof payload.summary === 'string' ? payload.summary : undefined,
                content: typeof payload.content === 'string' ? payload.content : undefined,
            }),
        });

        if (!response.ok) throw await createApiError(response, '커뮤니티 글 수정에 실패했습니다.');
        return await response.json();
    },

    async getCommunityComments(postId: string, limit = 80): Promise<CommunityCommentRecord[]> {
        const auth = await this.getAuthContext().catch(() => null);
        const userQuery = auth?.userId ? `&userId=${encodeURIComponent(auth.userId)}` : '';
        const response = await fetch(`/api/community/${encodeURIComponent(postId)}/comments?limit=${limit}${userQuery}`);
        if (!response.ok) throw await createApiError(response, '커뮤니티 댓글을 불러오지 못했습니다.');
        return await response.json();
    },

    async createCommunityComment(postId: string, content: string): Promise<CommunityCommentRecord> {
        const auth = await this.getAuthContext();
        if (!auth) throw new Error('로그인이 필요합니다.');
        const response = await fetch(`/api/community/${encodeURIComponent(postId)}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify({
                userId: auth.userId,
                username: auth.username,
                content,
            }),
        });
        if (!response.ok) throw await createApiError(response, '커뮤니티 댓글 등록에 실패했습니다.');
        return await response.json();
    },

    async updateCommunityComment(postId: string, commentId: string, content: string): Promise<CommunityCommentRecord> {
        const auth = await this.getAuthContext();
        if (!auth) throw new Error('로그인이 필요합니다.');
        const response = await fetch(`/api/community/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify({
                userId: auth.userId,
                content,
            }),
        });
        if (!response.ok) throw await createApiError(response, '커뮤니티 댓글 수정에 실패했습니다.');
        return await response.json();
    },

    async deleteCommunityComment(postId: string, commentId: string): Promise<boolean> {
        const auth = await this.getAuthContext();
        if (!auth) throw new Error('로그인이 필요합니다.');
        const response = await fetch(`/api/community/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}?userId=${encodeURIComponent(auth.userId)}`, {
            method: 'DELETE',
            headers: buildActorHeaders(),
        });
        if (!response.ok) throw await createApiError(response, '커뮤니티 댓글 삭제에 실패했습니다.');
        return true;
    },

    async toggleCommunityCommentLike(postId: string, commentId: string): Promise<CommunityCommentRecord> {
        const auth = await this.getAuthContext();
        if (!auth) throw new Error('로그인이 필요합니다.');
        const response = await fetch(`/api/community/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildActorHeaders() },
            body: JSON.stringify({
                userId: auth.userId,
            }),
        });
        if (!response.ok) throw await createApiError(response, '댓글 공감 처리에 실패했습니다.');
        return await response.json();
    },

    async getSubscription(userId: string) {
        const response = await fetch(`/api/billing/subscription/${userId}`);
        if (!response.ok) throw await createApiError(response, '구독 정보를 불러오지 못했습니다.');
        return await response.json();
    },

    async subscribePremium(userId: string) {
        const response = await fetch('/api/billing/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, plan: 'premium' }),
        });
        if (!response.ok) throw await createApiError(response, '프리미엄 구독 처리에 실패했습니다.');
        return await response.json();
    },

    async cancelPremium(userId: string) {
        const response = await fetch('/api/billing/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, plan: 'free' }),
        });
        if (!response.ok) throw await createApiError(response, '프리미엄 해지 처리에 실패했습니다.');
        return await response.json();
    },

    async submitRoleRequest(userId: string, email: string, requestedRole: 'journalist' | 'admin', reason: string) {
        const response = await fetch('/api/role-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, email, requestedRole, reason }),
        });
        if (!response.ok) throw await createApiError(response, '역할 권한 요청에 실패했습니다.');
        return await response.json();
    },

    async getRoleRequests(status?: 'pending' | 'approved' | 'rejected') {
        const query = status ? `?status=${status}` : '';
        const response = await fetch(`/api/role-requests${query}`);
        if (!response.ok) throw await createApiError(response, '역할 요청 목록을 불러오지 못했습니다.');
        return await response.json();
    },

    async decideRoleRequest(id: string, status: 'approved' | 'rejected', userId: string) {
        const response = await fetch(`/api/role-requests/${id}/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, userId }),
        });
        if (!response.ok) throw await createApiError(response, '역할 요청 처리에 실패했습니다.');
        return await response.json();
    },
};
