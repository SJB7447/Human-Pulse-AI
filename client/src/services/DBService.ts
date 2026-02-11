// client/src/services/dbService.ts

import { supabase } from './supabaseClient'; // 같은 폴더에 있는 설정 파일 사용
import { useEmotionStore } from '@/lib/store';

type ApiError = Error & { status?: number };

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

export const DBService = {

    // [User] 현재 로그인한 사용자 정보 가져오기
    async getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();

        // Return Supabase user if exists
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            return { ...user, profile };
        }

        // Fallback to Zustand Store (Demo User)
        const storeUser = useEmotionStore.getState().user;
        if (storeUser && storeUser.id.startsWith('demo-')) {
            return {
                ...storeUser,
                profile: {
                    username: storeUser.name,
                    email: storeUser.email,
                    role: storeUser.role
                },
                user_metadata: {
                    name: storeUser.name
                }
            };
        }

        return null;
    },

    // [1] 기사 저장 (작성자 ID 포함) - Journalist 페이지용
    async saveArticle({ title, content, summary, source, image, category, emotionLabel }: {
        title: string;
        content: string;
        summary?: string;
        source?: string;
        image?: string;
        category?: string;
        emotionLabel: string;
    }) {
        // 로그인 체크 (Store User or Supabase User)
        const user = await this.getCurrentUser();
        if (!user) throw new Error("로그인이 필요합니다.");

        // Emotion Validation
        const validEmotions = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'];
        const emotion = validEmotions.includes(emotionLabel) ? emotionLabel : 'serenity';

        // 기사 저장 (/api/articles API 호출 - RLS 우회)
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
                emotion: emotion,
                authorId: user.id || 'anonymous',
                authorName: user.user_metadata?.name || user.email || 'Anonymous'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save article');
        }

        const data = await response.json();
        return data;
    },

    // [New] 기사 수정
    async updateArticle(id: string, updates: any) {
        const response = await fetch(`/api/articles/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (!response.ok) throw new Error('Failed to update article');
        return await response.json();
    },

    // [New] 기사 삭제
    async deleteArticle(id: string) {
        const response = await fetch(`/api/articles/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete article');
        return true;
    },

    // [New] 내 기사 조회 (Client-side filtering for MVP)
    async getMyArticles(authorId: string) {
        // Fetch all (including hidden)
        const response = await fetch('/api/articles?all=true');
        if (!response.ok) throw new Error('Failed to fetch articles');
        const allArticles = await response.json();

        // Filter by authorId (camelCase from API abstraction or snake_case raw row)
        return allArticles.filter((a: any) => a.authorId === authorId || a.author_id === authorId);
    },

    // [2] 생성된 콘텐츠 저장 - 상세 페이지용
    async saveGeneratedContent(articleId: number, generatedText: string) {
        const { data, error } = await supabase
            .from('generated_contents')
            .insert([
                {
                    article_id: articleId,
                    generated_text: generatedText,
                    deploy_status: 'ready' // 기본값: 배포 대기
                }
            ])
            .select();

        if (error) throw error;
        return data;
    },

    // [3] 관리자용: 전체 데이터 조회 (Hidden 포함)
    async getAdminDashboardData() {
        const response = await fetch('/api/articles?all=true');
        if (!response.ok) throw await createApiError(response, 'Failed to fetch admin data');
        return await response.json();
    },

    // [4] 관리자용: 콘텐츠 수정 및 승인 (Legacy - used for generated_contents table)
    async updateGeneratedContent(generatedId: number, generatedText: string, status: string) {
        const { error } = await supabase
            .from('generated_contents')
            .update({
                generated_text: generatedText,
                deploy_status: status
            })
            .eq('id', generatedId);
        if (error) throw error;
    },

    // [5] 관리자용: 통계 데이터 조회 (API 호출)
    async getAdminStats() {
        // server/routes.ts 에 정의된 API 엔드포인트 호출
        const response = await fetch('/api/admin/stats');
        if (!response.ok) {
            throw await createApiError(response, 'Failed to fetch admin stats');
        }
        return await response.json();
    }
};
