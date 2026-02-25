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

function coerceArrayPayload(payload: unknown, url: string): any[] {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
        const envelope = payload as Record<string, unknown>;
        for (const key of ['data', 'items', 'articles', 'news', 'results']) {
            if (Array.isArray(envelope[key])) {
                return envelope[key] as any[];
            }
        }
    }
    throw new Error(`API payload is not an array for ${url}`);
}

function toNewsItem(item: any): NewsItem {
    const resolvedImage = item.image || item.image_url || item.thumbnail_url || null;
    return {
        id: String(item.id),
        title: item.title,
        summary: item.summary,
        content: item.content,
        source: item.source || 'Unknown Source',
        image: resolvedImage,
        category: item.category || null,
        emotion: item.emotion as EmotionType,
        intensity: item.intensity || 50,
        created_at: item.created_at || null,
    };
}

async function safeFetchJson(url: string): Promise<any[]> {
    try {
        let response = await fetch(url, {
            cache: 'no-cache',
            headers: { Accept: 'application/json' },
        });

        // Some CDNs/proxies can respond 304 to conditional GET; retry once with cache-busting.
        if (response.status === 304) {
            const separator = url.includes('?') ? '&' : '?';
            response = await fetch(`${url}${separator}_=${Date.now()}`, {
                cache: 'no-store',
                headers: { Accept: 'application/json' },
            });
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        const bodyText = await response.text();

        if (!response.ok) {
            throw new Error(`API ${response.status}: ${url}`);
        }

        const looksLikeJson = contentType.includes('application/json') || /^[\s]*[\[{]/.test(bodyText);
        if (!looksLikeJson) {
            const preview = bodyText.slice(0, 120).replace(/\s+/g, ' ').trim();
            throw new Error(`API returned non-JSON for ${url}: ${preview}`);
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(bodyText);
        } catch {
            throw new Error(`API returned invalid JSON for ${url}`);
        }

        return coerceArrayPayload(parsed, url);
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
    try {
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
    } catch {
        return [];
    }
}

async function fetchEmotionFromNewsAllApi(emotion: EmotionType): Promise<NewsItem[]> {
    try {
        const rows = await safeFetchJson('/api/news?all=true');
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
    } catch {
        return [];
    }
}

async function fetchEmotionNewsResilient(emotion: EmotionType): Promise<NewsItem[]> {
    try {
        const data = await safeFetchJson(`/api/news/${emotion}`);
        const direct = (data || []).map(toNewsItem);
        if (direct.length > 0) return direct;
    } catch {
        // continue with fallback chain
    }
    const fromNewsAll = await fetchEmotionFromNewsAllApi(emotion);
    if (fromNewsAll.length > 0) return fromNewsAll;
    return fetchEmotionFromArticlesApi(emotion);
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
            } catch (error) {
                console.error('[useNews] all fetch paths failed:', error);
                return [];
            }
        },
        enabled: !!emotion,
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnReconnect: true,
        retry: 1,
    });
}
