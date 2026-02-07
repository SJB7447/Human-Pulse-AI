// client/src/services/dbService.ts

import { supabase } from './supabaseClient'; // 같은 폴더에 있는 설정 파일 사용

export const DBService = {

    // [User] 현재 로그인한 사용자 정보 가져오기
    async getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        // profiles 테이블에서 추가 정보 가져오기
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        return { ...user, profile };
    },

    // [1] 기사 저장 (작성자 ID 포함) - Journalist 페이지용
    async saveArticle({ title, content, originalUrl, emotionLabel }: any) {
        // 로그인 체크
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("로그인이 필요합니다.");

        // 감정 ID 찾기
        const { data: emotionData, error: emoError } = await supabase
            .from('emotions')
            .select('id')
            .eq('label', emotionLabel)
            .single();

        if (emoError || !emotionData) throw new Error(`감정 카테고리를 찾을 수 없습니다: ${emotionLabel}`);

        // 기사 저장
        const { data, error } = await supabase
            .from('articles')
            .insert([
                {
                    title,
                    content,
                    original_url: originalUrl,
                    emotion_id: emotionData.id,
                    author_id: user.id // 작성자 ID 자동 입력
                }
            ])
            .select()
            .single();

        if (error) throw error;
        return data;
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

    // [3] 관리자용: 전체 데이터 조회
    async getAdminDashboardData() {
        const { data, error } = await supabase
            .from('articles')
            .select(`
        *,
        emotions ( label ),
        profiles ( email, username ),
        generated_contents ( id, generated_text, deploy_status, admin_memo )
      `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    // [4] 관리자용: 콘텐츠 수정 및 승인
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
            throw new Error('Failed to fetch admin stats');
        }
        return await response.json();
    }
};