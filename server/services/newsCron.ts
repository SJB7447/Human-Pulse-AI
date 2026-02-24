import Parser from 'rss-parser';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../supabase.js";
import { EmotionType } from "../../shared/schema.js";

const parser = new Parser({
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['enclosure', 'enclosure'],
        ]
    }
});

// 1. Supabase 諛?Gemini ?ㅼ젙
const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);
const FIXED_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image-002";
const GEMINI_IMAGE_MODEL_FALLBACKS = [
    FIXED_GEMINI_IMAGE_MODEL,
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-image-001",
] as const;

// 援??蹂?RSS 二쇱냼
const RSS_URLS = {
    kr: 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko',
    us: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
    jp: 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja',
    gb: 'https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en'
};

const EMOTION_KEYWORDS: Record<EmotionType, string[]> = {
    immersion: [
        '정치', '속보', '긴급', '갈등', '충돌', '시위', '노동', '외교', '분쟁',
        'politics', 'breaking', 'conflict', 'protest', 'tension', 'diplomatic',
    ],
    clarity: [
        '분석', '해설', '경제', '정책', '데이터', '지표', '산업', '기술', '리포트',
        'analysis', 'economy', 'policy', 'data', 'industry', 'technology', 'report',
    ],
    serenity: [
        '회복', '안정', '웰빙', '건강', '환경', '기후', '자연', '커뮤니티', '돌봄',
        'wellbeing', 'wellness', 'health', 'recovery', 'nature', 'climate', 'community',
    ],
    vibrance: [
        '문화', '연예', '콘텐츠', '축제', '행사', '스포츠', '미담', '선행', '여가',
        'culture', 'entertainment', 'festival', 'sports', 'highlight', 'lifestyle', 'positive',
    ],
    gravity: [
        '사건', '사고', '재난', '범죄', '수사', '안전', '경고', '위험', '피해', '사망',
        'incident', 'accident', 'disaster', 'crime', 'investigation', 'risk', 'warning', 'fatal',
    ],
    spectrum: [],
};

const EMOTION_DEFAULT_CATEGORY: Record<EmotionType, string> = {
    immersion: "정치·속보",
    clarity: "경제·분석",
    serenity: "웰빙·커뮤니티",
    vibrance: "연예·미담",
    gravity: "사건·재난",
    spectrum: "균형·다양성",
};

const EMOTION_ALIAS_MAP: Record<string, EmotionType> = {
    immersion: 'immersion',
    intense: 'immersion',
    alert: 'immersion',
    tension: 'immersion',
    clarity: 'clarity',
    analysis: 'clarity',
    serenity: 'serenity',
    calm: 'serenity',
    recovery: 'serenity',
    vibrance: 'vibrance',
    positive: 'vibrance',
    joy: 'vibrance',
    gravity: 'gravity',
    caution: 'gravity',
    risk: 'gravity',
    spectrum: 'spectrum',
    balanced: 'spectrum',
    neutral: 'spectrum',
    몰입: 'immersion',
    긴장: 'immersion',
    통찰: 'clarity',
    분석: 'clarity',
    회복: 'serenity',
    안정: 'serenity',
    설렘: 'vibrance',
    활력: 'vibrance',
    여운: 'gravity',
    성찰: 'gravity',
    균형: 'spectrum',
    중립: 'spectrum',
};

function normalizeEmotionKey(raw: unknown): EmotionType | null {
    const text = String(raw || "").trim().toLowerCase();
    if (!text) return null;
    if ((['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'] as EmotionType[]).includes(text as EmotionType)) {
        return text as EmotionType;
    }
    if (EMOTION_ALIAS_MAP[text]) {
        return EMOTION_ALIAS_MAP[text];
    }
    return null;
}

function inferEmotionFromText(title: string, snippet: string): EmotionType {
    const haystack = `${title || ""} ${snippet || ""}`.toLowerCase();
    let best: EmotionType = "spectrum";
    let score = 0;

    for (const emotion of (['immersion', 'clarity', 'serenity', 'vibrance', 'gravity'] as EmotionType[])) {
        const hit = EMOTION_KEYWORDS[emotion].reduce((acc, keyword) => acc + (haystack.includes(keyword.toLowerCase()) ? 1 : 0), 0);
        if (hit > score) {
            score = hit;
            best = emotion;
        }
    }

    return score > 0 ? best : "spectrum";
}

function resolveEmotion(rawEmotion: unknown, title: string, snippet: string): EmotionType {
    const normalized = normalizeEmotionKey(rawEmotion);
    if (normalized) return normalized;
    return inferEmotionFromText(title, snippet);
}

function resolveCategory(rawCategory: unknown, emotion: EmotionType): string {
    const text = String(rawCategory || "").trim();
    if (!text) return EMOTION_DEFAULT_CATEGORY[emotion];
    if (/^(world|general)$/i.test(text)) return EMOTION_DEFAULT_CATEGORY[emotion];
    return text.slice(0, 60);
}

// Helper: Concurrency Limiter
async function pMap<T, R>(
    array: T[],
    mapper: (item: T, index: number) => Promise<R>,
    concurrency: number
): Promise<R[]> {
    const results: R[] = new Array(array.length);
    let index = 0;
    const next = async (): Promise<void> => {
        while (index < array.length) {
            const i = index++;
            try {
                results[i] = await mapper(array[i], i);
            } catch (e) {
                console.error(`Error processing item ${i}:`, e);
                // Optionally handle error or leave result as undefined/null
            }
        }
    };
    const workers = new Array(Math.min(concurrency, array.length))
        .fill(null)
        .map(() => next());
    await Promise.all(workers);
    return results;
}

// Helper: Retry Wrapper
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (e: any) {
        if (retries === 0) throw e;
        // 503 Service Unavailable or 429 Too Many Requests -> Wait and retry
        if (e.message?.includes('503') || e.message?.includes('429')) {
            console.warn(`?좑툘 API Busy (503/429), retrying in ${delay}ms... (${retries} left)`);
            await new Promise(res => setTimeout(res, delay));
            return withRetry(fn, retries - 1, delay * 2);
        }
        throw e;
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs)),
    ]);
}

type AutoNewsUpdateOptions = {
    maxArticlesPerCountry: number;
    concurrency: number;
    aiTimeoutMs: number;
    enableImageGeneration: boolean;
    imageTimeoutMs: number;
};

type ProcessedAiArticle = {
    title?: string;
    emotion?: string;
    category?: string;
    rewrittenContent?: string;
    imageKeyword?: string;
};

// 2. AI 湲곗궗 ?묒꽦 ?⑥닔 (?붿빟蹂?-> ?꾩껜 湲곗궗 蹂??
async function processWithAI(title: string, snippet: string, country: string, aiTimeoutMs: number) {
    if (!apiKey) {
        console.error("??AI Error: Missing API Key");
        return null;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `
    Role: Veteran International Journalist.
    Task: Rewrite the following news into a engaging Korean article.
    
    [Input Data]
    - Country: ${country}
    - Title: ${title}
    - Summary: ${snippet}

    [Requirements]
    1. **Emotion Analysis**: Choose one dominant emotion key from:
       - immersion, clarity, serenity, vibrance, gravity, spectrum
    2. **Category Mapping**: Assign one category label that matches the emotion tone.
    3. **Content Generation**: Rewrite the facts into a rich 3-4 paragraph article in **Korean**.
       - Tone: Professional, objective, yet immersive (News style).
       - **Language: MUST BE KOREAN.**
       - Ensure the content flows naturally as a standalone article.
    4. **Headline**: Write a compelling Korean headline (translate or adapt the original).
    5. **Image Keyword**: Extract ONE English keyword that best represents the specific subject (e.g., "Galaxy S24", "White House", "Climate Change") for image searching.
    6. **Source Citation**: Explicitly mention the source context in the text if necessary (e.g., "According to local reports..."), but the URL is handled separately.
    
    [JSON Output Format]
    {
      "title": "Korean Headline",
      "emotion": "clarity",
      "category": "경제·분석",
      "rewrittenContent": "Full Korean article content...",
      "imageKeyword": "EnglishKeyword"
    }
  `;

    try {
        const result = await withTimeout(
            withRetry(() => model.generateContent(prompt), 2, 800),
            aiTimeoutMs,
            "gemini_text",
        );
        const response = await result.response;
        const text = response.text().replace(/```json|```/g, "").trim();
        return JSON.parse(text) as ProcessedAiArticle;
    } catch (e) {
        console.error("??AI Processing Failed:", e);
        return null;
    }
}

// 3. 硫붿씤 ?ㅽ뻾 ?⑥닔 (?щ·留?-> AI?묒꽦 -> DB???
export async function runAutoNewsUpdate(options: Partial<AutoNewsUpdateOptions> = {}) {
    const opts: AutoNewsUpdateOptions = {
        maxArticlesPerCountry: 2,
        concurrency: 2,
        aiTimeoutMs: 9000,
        enableImageGeneration: false,
        imageTimeoutMs: 5000,
    };
    if (Number.isFinite(Number(options.maxArticlesPerCountry))) {
        opts.maxArticlesPerCountry = Math.max(1, Math.min(5, Number(options.maxArticlesPerCountry)));
    }
    if (Number.isFinite(Number(options.concurrency))) {
        opts.concurrency = Math.max(1, Math.min(5, Number(options.concurrency)));
    }
    if (Number.isFinite(Number(options.aiTimeoutMs))) {
        opts.aiTimeoutMs = Math.max(3000, Math.min(20000, Number(options.aiTimeoutMs)));
    }
    if (typeof options.enableImageGeneration === "boolean") {
        opts.enableImageGeneration = options.enableImageGeneration;
    }
    if (Number.isFinite(Number(options.imageTimeoutMs))) {
        opts.imageTimeoutMs = Math.max(2000, Math.min(15000, Number(options.imageTimeoutMs)));
    }

    const countries = ['kr', 'us', 'jp', 'gb'];

    // Execution result stats
    let stats = { total: 0, saved: 0, skipped: 0, failed: 0 };
    let logs: string[] = [];

    console.log("?뙇 Starting Auto News Update (Parallel Fetching)...");

    // 1. Collect all candidates first
    const allCandidates: any[] = [];

    for (const country of countries) {
        try {
            const feed = await withTimeout(
                parser.parseURL(RSS_URLS[country as keyof typeof RSS_URLS]),
                8000,
                `rss_${country}`,
            );
            const targetArticles = feed.items.slice(0, opts.maxArticlesPerCountry);

            for (const item of targetArticles) {
                if (!item.title || !item.link) continue;
                allCandidates.push({ ...item, country });
            }
        } catch (e) {
            console.error(`${country} RSS Parse Failed:`, e);
        }
    }

    stats.total = allCandidates.length;
    console.log(`?뱤 Found ${stats.total} candidates. Processing with concurrency limit ${opts.concurrency}...`);

    // 2. Process in parallel (Concurrency: 3)
    await pMap(allCandidates, async (item) => {
        try {
            // ??1?④퀎: 以묐났 湲곗궗 泥댄겕
            const { data: existing } = await supabase
                .from('news_items')
                .select('id')
                .eq('source', item.link)
                .maybeSingle();

            if (existing) {
                stats.skipped++;
                return;
            }

            // ??2?④퀎: AI?먭쾶 湲곗궗 ?묒꽦 ?붿껌 (w/ Retry)
            const aiResult = await processWithAI(
                item.title,
                item.contentSnippet || item.content || "",
                item.country,
                opts.aiTimeoutMs,
            );

            if (!aiResult) {
                stats.failed++;
                return;
            }

            // ??3?④퀎: 媛먯젙/移댄뀒怨좊━ 留ㅽ븨 (invalid emotion prevents serenity bias)
            const mappedEmotion = resolveEmotion(
                aiResult.emotion,
                aiResult.title || item.title || "",
                item.contentSnippet || item.content || "",
            );
            const mappedCategory = resolveCategory(aiResult.category, mappedEmotion);

            // ??4?④퀎: ?대?吏 寃곗젙
            let imageUrl = "";

            if (!item.enclosure?.url && !item['mediaContent']?.['$']?.url && opts.enableImageGeneration) {
                try {
                    // Try to generate image, but fail fast (5s timeout)
                    const imagePrompt = `Editorial news photo for: ${aiResult.imageKeyword || "Global News"}. ${aiResult.emotion} atmosphere. High quality, realistic, cinematic lighting.`;
                    let imageGenerated = false;
                    let lastImageError: unknown = null;
                    for (const modelName of GEMINI_IMAGE_MODEL_FALLBACKS) {
                        try {
                            const model = genAI.getGenerativeModel({ model: modelName });
                            const genPromise = (model as any).generateContent({
                                contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
                                generationConfig: {
                                    responseModalities: ["TEXT", "IMAGE"],
                                    imageConfig: {
                                        aspectRatio: "16:9",
                                        imageSize: "1K",
                                    },
                                },
                            } as any);
                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), opts.imageTimeoutMs));
                            const imageRes: any = await Promise.race([genPromise, timeoutPromise]);
                            const imgData = imageRes.response.candidates?.[0]?.content?.parts?.[0];
                            if (!imgData?.inlineData?.data) {
                                throw new Error(`No inline image data (${modelName})`);
                            }
                            imageUrl = `data:${imgData.inlineData.mimeType};base64,${imgData.inlineData.data}`;
                            imageGenerated = true;
                            break;
                        } catch (e) {
                            lastImageError = e;
                        }
                    }
                    if (!imageGenerated) {
                        throw lastImageError || new Error(`Image generation failed (${FIXED_GEMINI_IMAGE_MODEL})`);
                    }
                } catch (e) {
                    // Fallback instantly
                    imageUrl = `https://source.unsplash.com/1600x900/?${encodeURIComponent(aiResult.imageKeyword || 'news')}`;
                }
            } else {
                imageUrl = item.enclosure?.url || item['mediaContent']?.['$']?.url || `https://source.unsplash.com/1600x900/?${encodeURIComponent(aiResult.imageKeyword || 'news')}`;
            }

            // Step 5: final DB insert payload
            const rewrittenContent = String(aiResult.rewrittenContent || "").trim();
            const safeContent = rewrittenContent || `${item.title}\n\n${item.contentSnippet || item.content || ""}`.trim();

            const newItem = {
                title: aiResult.title || `[${item.country.toUpperCase()}] ${item.title}`,
                content: safeContent,
                summary: item.contentSnippet || safeContent.substring(0, 100),
                source: item.link,
                emotion: mappedEmotion,
                image: imageUrl,
                category: mappedCategory,
                platforms: ["interactive"],
                views: 0,
                saves: 0,
                intensity: 50 + Math.floor(Math.random() * 40),
                is_published: true,
            };

            const { error } = await supabase.from('news_items').insert(newItem);

            if (!error) {
                console.log(`??Saved: ${newItem.title}`);
                logs.push(`[${item.country}] ${newItem.title}`);
                stats.saved++;
            } else {
                console.error("??DB Insert Error:", error);
                stats.failed++;
            }

        } catch (e) {
            console.error("Process Error for item:", item.title, e);
            stats.failed++;
        }
    }, opts.concurrency);

    return { status: 'completed', stats, logs };
}

