import { supabase } from './supabaseClient';
import { useEmotionStore } from '@/lib/store';

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

    async getMyArticles(authorId: string) {
        const response = await fetch('/api/articles?all=true');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch articles');
        const allArticles = await response.json();
        return allArticles.filter((a: any) => a.authorId === authorId || a.author_id === authorId);
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
