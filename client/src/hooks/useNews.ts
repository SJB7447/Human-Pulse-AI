import { useQuery } from '@tanstack/react-query';
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

function toNewsItem(item: any): NewsItem {
    return {
        id: String(item.id),
        title: item.title,
        summary: item.summary,
        content: item.content,
        source: item.source || 'Unknown Source',
        image: item.image || null,
        category: item.category || null,
        emotion: item.emotion as EmotionType,
        intensity: item.intensity || 50,
        created_at: item.created_at || null,
    };
}

async function safeFetchJson(url: string): Promise<any[]> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API ${response.status}: ${url}`);
        }
        return response.json();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isNetworkFailure =
            error instanceof TypeError ||
            /failed to fetch|networkerror|network request failed|fetch failed/i.test(message);

        if (isNetworkFailure) {
            throw new Error(`Network error: failed request to ${url}. Check dev server status.`);
        }

        throw error;
    }
}

async function fetchEmotionFromArticlesApi(emotion: EmotionType): Promise<NewsItem[]> {
    const rows = await safeFetchJson('/api/articles?all=true');
    return (rows || [])
        .filter((item: any) => {
            const published = typeof item?.isPublished === 'boolean'
                ? item.isPublished
                : typeof item?.is_published === 'boolean'
                    ? item.is_published
                    : true;
            return item?.emotion === emotion && published;
        })
        .map(toNewsItem);
}

async function fetchEmotionNewsResilient(emotion: EmotionType): Promise<NewsItem[]> {
    try {
        const data = await safeFetchJson(`/api/news/${emotion}`);
        return (data || []).map(toNewsItem);
    } catch {
        return fetchEmotionFromArticlesApi(emotion);
    }
}

export function useNews(emotion: EmotionType | undefined) {
    return useQuery<NewsItem[]>({
        queryKey: ['news', emotion],
        queryFn: async () => {
            if (!emotion) {
                return [];
            }

            // Spectrum: fetch balanced visible articles per emotion via server policy
            if (emotion === 'spectrum') {
                const emotions: EmotionType[] = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity'];
                const allNews: NewsItem[] = [];

                for (const emo of emotions) {
                    const rows = await fetchEmotionNewsResilient(emo);
                    allNews.push(...rows.slice(0, 3));
                }

                // Shuffle and return balanced mix
                const shuffled = allNews.sort(() => Math.random() - 0.5);
                return shuffled;
            }

            try {
                return await fetchEmotionNewsResilient(emotion);
            } catch {
                throw new Error('Unable to load news data. Please try again.');
            }
        },
        enabled: !!emotion,
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnReconnect: true,
        retry: 1,
    });
}
