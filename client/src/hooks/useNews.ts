import { useQuery } from '@tanstack/react-query';
import type { EmotionType } from '@/lib/store';
import type { ArticleTopicId, ArticleTopicSummary } from '@shared/articleTopics';

export interface NewsItem {
    id: string;
    title: string;
    summary: string;
    content: string | null;
    source: string;
    image: string | null;
    category: string | null;
    topic?: ArticleTopicId | null;
    emotion: EmotionType;
    intensity: number;
    created_at: string | null;
    updated_at?: string | null;
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

function normalizeAppMediaUrl(value: unknown): string | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\/api\/media\/object\?/i.test(raw)) return raw;

    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            if (parsed.pathname === '/api/media/object') {
                return `${parsed.pathname}${parsed.search}`;
            }
        } catch {
            return raw;
        }
    }

    return raw;
}

function toNewsItem(item: any): NewsItem {
    const resolvedImage = normalizeAppMediaUrl(item.image || item.image_url || item.thumbnail_url || null);
    return {
        id: String(item.id),
        title: item.title,
        summary: item.summary,
        content: item.content,
        source: item.source || 'Unknown Source',
        image: resolvedImage,
        category: item.category || null,
        topic: item.topic || null,
        emotion: item.emotion as EmotionType,
        intensity: item.intensity || 50,
        created_at: item.created_at || item.createdAt || null,
        updated_at: item.updated_at || item.updatedAt || null,
    };
}

async function safeFetchJson(url: string): Promise<any[]> {
    try {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
        });

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

async function fetchFilteredArticles(emotion: EmotionType, topic: ArticleTopicId | 'all' = 'all'): Promise<NewsItem[]> {
    const params = new URLSearchParams({
        emotion,
        page: '1',
        limit: '200',
    });
    if (topic !== 'all') {
        params.set('topic', topic);
    }
    const data = await safeFetchJson(`/api/articles?${params.toString()}`);
    return (data || []).map(toNewsItem);
}

async function fetchEmotionTopics(emotion: EmotionType): Promise<ArticleTopicSummary[]> {
    const response = await fetch(`/api/articles/topics?emotion=${encodeURIComponent(emotion)}`, {
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`API ${response.status}: /api/articles/topics?emotion=${emotion}`);
    }

    const payload = await response.json().catch(() => ({ topics: [] }));
    const rows = Array.isArray(payload?.topics) ? payload.topics : [];
    return rows
        .map((row: any) => ({
            id: row?.id as ArticleTopicId,
            label: String(row?.label || ''),
            count: Number(row?.count || 0),
        }))
        .filter((row: { id: ArticleTopicId; label: string; count: number }) => Boolean(row.id) && row.count > 0);
}

export function useNews(emotion: EmotionType | undefined, topic: ArticleTopicId | 'all' = 'all') {
    return useQuery<NewsItem[]>({
        queryKey: ['news', emotion, topic],
        queryFn: async () => {
            if (!emotion) {
                return [];
            }

            try {
                return await fetchFilteredArticles(emotion, topic);
            } catch (error) {
                console.error('[useNews] fetch failed:', error);
                return [];
            }
        },
        enabled: !!emotion,
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
    });
}

export function useEmotionTopics(emotion: EmotionType | undefined) {
    return useQuery<ArticleTopicSummary[]>({
        queryKey: ['news-topics', emotion],
        queryFn: async () => {
            if (!emotion) return [];

            try {
                return await fetchEmotionTopics(emotion);
            } catch (error) {
                console.error('[useEmotionTopics] fetch failed:', error);
                return [];
            }
        },
        enabled: !!emotion,
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
    });
}
