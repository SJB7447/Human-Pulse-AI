import type {
    InteractiveArticle as SharedInteractiveArticle,
    InteractiveGenerationInput as SharedInteractiveGenerationInput,
} from '@shared/interactiveArticle';
import { useEmotionStore } from '@/lib/store';

export interface GeneratedNews {
    title: string;
    summary: string;
    content: string;
    source: string;
    emotion: string;
    imagePrompt?: string;
    sourceCitation: Array<{
        title: string;
        url: string;
        source: string;
    }>;
    fallbackUsed?: boolean;
    reasonCode?: string;
}

export type InteractiveArticle = SharedInteractiveArticle;
export type InteractiveGenerationInput = Partial<Omit<SharedInteractiveGenerationInput, 'keywords'>> & Pick<SharedInteractiveGenerationInput, 'keywords'>;
export interface RelatedRecommendation {
    id: string;
    title: string;
    summary: string;
    content: string;
    source: string;
    emotion: string;
    category?: string;
    image?: string;
    created_at?: string;
}

export interface KeywordAnalysisResult {
    topics: string[];
    context: string;
    fallbackUsed?: boolean;
}

export interface ShareKeywordPackResult {
    representativeKeywords: string[];
    viralHashtags: string[];
    fallbackUsed?: boolean;
}

export interface KeywordNewsArticle {
    id: string;
    title: string;
    summary: string;
    url: string;
    source: string;
    publishedAt?: string;
}

export interface KeywordNewsSearchResult {
    keyword: string;
    articles: KeywordNewsArticle[];
    fallbackUsed?: boolean;
    diagnostics?: {
        stage: 'external_fetch' | 'rss_parse' | 'unknown';
        reason: string;
        status?: number;
    };
}

export interface OutlineGenerationResult {
    outline: string;
    topics: string[];
    fallbackUsed?: boolean;
}

export interface DraftMediaSlot {
    id: string;
    type: 'image' | 'video';
    anchorLabel: 'core' | 'deepDive' | 'conclusion';
    position: 'before' | 'inline' | 'after';
    caption: string;
}

export interface DraftGenerationResult {
    title: string;
    content: string;
    sections?: {
        core: string;
        deepDive: string;
        conclusion: string;
    };
    mediaSlots?: DraftMediaSlot[];
    sourceCitation?: {
        title: string;
        url: string;
        source: string;
    };
    compliance?: {
        riskLevel: 'low' | 'medium' | 'high';
        summary: string;
        flags: Array<{
            category: 'privacy' | 'defamation' | 'medical' | 'financial' | 'violent' | 'factual';
            severity: 'low' | 'medium' | 'high';
            reason: string;
            suggestion: string;
            evidenceSnippet?: string;
        }>;
        publishBlocked?: boolean;
    };
    fallbackUsed?: boolean;
}

export interface OpinionComposeResult {
    title: string;
    summary: string;
    content: string;
    references: Array<{
        title: string;
        url: string;
        source: string;
    }>;
    fallbackUsed?: boolean;
}


export class AIServiceError extends Error {
    status?: number;
    code?: string;
    detail?: string;
    retryable?: boolean;
    retryAfterSeconds?: number;
    mode?: string;
    issues?: Array<{ field?: string; message?: string; type?: string; score?: number; threshold?: number }>;
    compliance?: {
        riskLevel: 'low' | 'medium' | 'high';
        summary: string;
        flags: Array<{
            category: 'privacy' | 'defamation' | 'medical' | 'financial' | 'violent' | 'factual';
            severity: 'low' | 'medium' | 'high';
            reason: string;
            suggestion: string;
            evidenceSnippet?: string;
        }>;
        publishBlocked?: boolean;
    };

    constructor(message: string, options?: {
        status?: number;
        code?: string;
        detail?: string;
        retryable?: boolean;
        retryAfterSeconds?: number;
        mode?: string;
        issues?: Array<{ field?: string; message?: string; type?: string; score?: number; threshold?: number }>;
        compliance?: {
            riskLevel: 'low' | 'medium' | 'high';
            summary: string;
            flags: Array<{
                category: 'privacy' | 'defamation' | 'medical' | 'financial' | 'violent' | 'factual';
                severity: 'low' | 'medium' | 'high';
                reason: string;
                suggestion: string;
                evidenceSnippet?: string;
            }>;
            publishBlocked?: boolean;
        };
    }) {
        super(message);
        this.name = 'AIServiceError';
        this.status = options?.status;
        this.code = options?.code;
        this.detail = options?.detail;
        this.retryable = options?.retryable;
        this.retryAfterSeconds = options?.retryAfterSeconds;
        this.mode = options?.mode;
        this.issues = options?.issues;
        this.compliance = options?.compliance;
    }
}

const buildActorHeaders = (): Record<string, string> => {
    const actor = useEmotionStore.getState().user;
    if (!actor) return {};
    return {
        'x-actor-id': String(actor.id || '').slice(0, 128),
        'x-actor-role': String(actor.role || 'general').slice(0, 32),
    };
};

// Helper for API calls
async function callApi(endpoint: string, body: any, options?: { withActorHeaders?: boolean }) {
    const normalizedEndpoint = endpoint.startsWith('http')
        ? endpoint
        : endpoint.startsWith('/')
            ? endpoint
            : `/${endpoint}`;

    const isHtmlLikeError = (error: unknown) =>
        /non-json:<!doctype|non-json:<html/i.test(String((error as any)?.message || ''));

    const buildCandidateUrls = () => {
        if (normalizedEndpoint.startsWith('http')) return [normalizedEndpoint];

        const urls: string[] = [normalizedEndpoint];
        if (typeof window !== 'undefined') {
            const envBase = String((import.meta as any)?.env?.VITE_API_BASE_URL || '').trim();
            const locationBase = `${window.location.protocol}//${window.location.hostname}:5000`;
            const localhostBase = 'http://localhost:5000';
            const loopbackBase = 'http://127.0.0.1:5000';

            [envBase, locationBase, localhostBase, loopbackBase]
                .filter(Boolean)
                .forEach((base) => urls.push(`${base}${normalizedEndpoint}`));
        }

        return Array.from(new Set(urls));
    };

    const fetchJson = async (url: string) => {
        const actorHeaders = options?.withActorHeaders ? buildActorHeaders() : {};
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...actorHeaders },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        const trimmed = text.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            throw new Error(`non-json:${trimmed.substring(0, 120)}`);
        }
        const data = JSON.parse(trimmed);
        if (!res.ok) {
            throw new AIServiceError(data.error || 'AI Service Error', {
                status: res.status,
                code: data.code,
                detail: data.detail,
                retryable: data.retryable,
                retryAfterSeconds: data.retryAfterSeconds,
                mode: data.mode,
                issues: data.issues,
                compliance: data.compliance,
            });
        }
        return data;
    };

    const candidates = buildCandidateUrls();
    let lastError: unknown;

    for (let i = 0; i < candidates.length; i++) {
        const url = candidates[i];
        try {
            return await fetchJson(url);
        } catch (error: any) {
            lastError = error;
            const isLastCandidate = i === candidates.length - 1;
            const retryableFallback = isHtmlLikeError(error) || /Failed to fetch/i.test(String(error?.message || ''));
            if (!retryableFallback || isLastCandidate) {
                throw error;
            }
        }
    }

    throw lastError;
}

export const GeminiService = {
    async generateNewsForEmotion(emotion: string): Promise<GeneratedNews[]> {
        return callApi('/api/ai/generate-news', { emotion }, { withActorHeaders: true });
    },
    async chatWithBot(message: string, clientId?: string): Promise<{
        text: string;
        recommendation?: string;
        intent?: string;
        confidence?: number;
        followUp?: string;
        fallbackUsed?: boolean;
        biasWarning?: string;
        neutralPrompt?: string;
        cooldownActive?: boolean;
        cooldownRemainingSeconds?: number;
    }> {
        try {
            return await callApi('/api/ai/chat', { message, clientId });
        } catch (e) {
            return {
                text: "Hue Bot is temporarily unstable. Starting with balanced news.",
                recommendation: "spectrum",
                intent: "balance_general",
                confidence: 0.3,
                followUp: "Please share one word for your current mood.",
                fallbackUsed: true,
                cooldownActive: false,
                cooldownRemainingSeconds: 0,
            };
        }
    },

    async searchKeywordNews(keyword: string): Promise<KeywordNewsSearchResult> {
        return callApi('/api/ai/search-keyword-news', { keyword });
    },

    async analyzeKeyword(keyword: string): Promise<KeywordAnalysisResult> {
        return callApi('/api/ai/analyze-keyword', { keyword });
    },

    async generateOutline(keyword: string, topics: string[] = []): Promise<OutlineGenerationResult> {
        return callApi('/api/ai/generate-outline', { keyword, topics });
    },

    async generateArticleDraft(input: {
        keyword: string;
        mode?: 'draft' | 'interactive-longform';
        selectedArticle?: {
            title: string;
            summary: string;
            url: string;
            source: string;
        };
    }): Promise<DraftGenerationResult> {
        return callApi('/api/ai/generate-draft', input);
    },

    async checkGrammar(content: string): Promise<{ correctedText: string; errors: { original: string; corrected: string; reason: string }[] }> {
        return callApi('/api/ai/check-grammar', { content });
    },

    async generateHashtags(content: string, platforms: string[]): Promise<{ hashtags: string[] }> {
        return callApi('/api/ai/generate-hashtags', { content, platforms });
    },

    async generateShareKeywordPack(input: {
        title?: string;
        summary?: string;
        content?: string;
        category?: string;
        emotion?: string;
    }): Promise<ShareKeywordPackResult> {
        return callApi('/api/ai/share-keyword-pack', input);
    },

    async optimizeTitles(content: string, platforms: string[]): Promise<{ titles: { platform: string; title: string }[] }> {
        return callApi('/api/ai/optimize-titles', { content, platforms });
    },

    async checkCompliance(content: string): Promise<{
        riskLevel: 'low' | 'medium' | 'high';
        summary: string;
        flags: Array<{
            category: 'privacy' | 'defamation' | 'medical' | 'financial' | 'violent' | 'factual';
            severity: 'low' | 'medium' | 'high';
            reason: string;
            suggestion: string;
            evidenceSnippet?: string;
        }>;
    }> {
        return callApi('/api/ai/compliance-check', { content });
    },

    async generateImage(articleContent: string, count: number = 4, customPrompt?: string): Promise<{
        images: { url: string; description: string; prompt?: string; width?: number | null; height?: number | null; aspectRatioObserved?: string }[];
        partial?: boolean;
        failures?: Array<{ index: number; detail: string; prompt: string }>;
        model?: string;
    }> {
        return callApi('/api/ai/generate-image', { articleContent, count, customPrompt });
    },

    async generateShortVideo(articleContent: string, imageUrl?: string, imageDescription?: string, customPrompt?: string): Promise<{ videoUrl: string; script: string; videoPrompt?: string }> {
        // 1. Get Script via AI endpoint
        const scriptJson = await callApi('/api/ai/generate-video-script', { articleContent, imageDescription, customPrompt });

        // 2. Generate Video via AI boundary endpoint
        const videoRes = await fetch('/api/ai/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: scriptJson.videoPrompt,
                image: imageUrl
            })
        });

        const videoResult = await videoRes.json();
        if (!videoRes.ok) throw new Error(videoResult.error || 'Video generation failed');

        return {
            videoUrl: videoResult.videoUrl,
            script: JSON.stringify(scriptJson, null, 2),
            videoPrompt: scriptJson.videoPrompt
        };
    },

    async analyzeSentiment(content: string): Promise<{
        vibrance: number; immersion: number; clarity: number; gravity: number; serenity: number;
        dominantEmotion: string; feedback: string;
    }> {
        if (!content.trim()) {
            return {
                vibrance: 20, immersion: 20, clarity: 20, gravity: 20, serenity: 20,
                dominantEmotion: 'spectrum',
                feedback: '기사 내용을 입력해 주세요.'
            };
        }
        return callApi('/api/ai/analyze-sentiment', { content });
    },

    async translateText(text: string, targetLang: string = 'ko'): Promise<{ translatedText: string }> {
        return callApi('/api/ai/translate', { text, targetLang });
    },

    async generateInteractiveArticle(input: InteractiveGenerationInput): Promise<InteractiveArticle> {
        return callApi('/api/ai/generate/interactive-article', input);
    },

    async composeArticleWithOpinion(input: {
        sourceArticleId: string;
        sourceTitle: string;
        sourceSummary?: string;
        sourceUrl?: string;
        opinionText: string;
        extraRequest?: string;
        requestedReferences?: string[];
    }): Promise<OpinionComposeResult> {
        return callApi('/api/ai/compose-opinion-article', input);
    },

    async summarizeArticle(title: string, content: string): Promise<{
        title: string;
        summary: string;
        bullets: string[];
    }> {
        return callApi('/api/ai/summarize-article', { title, content });
    },

    async recommendRelated(articleId: string, emotion: string, category?: string): Promise<{
        recommendations: RelatedRecommendation[];
        strategy: { sameCategoryCount: number; balanceCount: number };
    }> {
        return callApi('/api/ai/recommend-related', { articleId, emotion, category });
    }
};


