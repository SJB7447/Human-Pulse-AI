import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/services/supabaseClient';
import type { EmotionType } from '@/lib/store';

export interface NewsItem {
    id: string;
    title: string;
    summary: string;
    content: string | null;
    source: string;
    image: string | null;
    category: string | null;
    emotion: EmotionType;
    intensity: number;
    created_at: string | null;
}

export function useNews(emotion: EmotionType | undefined) {
    return useQuery<NewsItem[]>({
        queryKey: ['news', emotion],
        queryFn: async () => {
            if (!emotion) {
                console.log('[useNews] No emotion provided, returning empty array');
                return [];
            }

            console.log('[useNews] Fetching news for emotion:', emotion);

            const supabase = getSupabase();
            console.log('[useNews] Supabase client:', supabase ? 'OK' : 'NULL');

            const { data, error } = await supabase
                .from('news_items')
                .select('*')
                .eq('emotion', emotion)
                .order('created_at', { ascending: false });

            console.log('[useNews] Query result:', { data, error });

            if (error) {
                console.error('[Supabase] Error fetching news:', error);
                throw error;
            }

            // Map 'news_items' schema to 'NewsItem' interface
            const mappedData: NewsItem[] = (data || []).map((item: any) => ({
                id: item.id,
                title: item.title,
                summary: item.summary,
                content: item.content,
                source: item.source || 'Unknown Source',
                image: item.image || null,
                category: item.category,
                emotion: item.emotion as EmotionType,
                intensity: item.intensity || 50,
                created_at: item.created_at,
            }));

            console.log('[useNews] Returning', mappedData.length, 'items');
            return mappedData;
        },
        enabled: !!emotion,
    });
}
