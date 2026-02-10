import Parser from 'rss-parser';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../supabase";
import { EmotionType } from "../../shared/schema";

const parser = new Parser({
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['enclosure', 'enclosure'],
        ]
    }
});

// 1. Supabase 및 Gemini 설정
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

// 국가별 RSS 주소
const RSS_URLS = {
    kr: 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko',
    us: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
    jp: 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja',
    gb: 'https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en'
};

// Emotion Mapping (Korean -> Schema)
const EMOTION_MAP: Record<string, EmotionType> = {
    '열정': 'immersion',
    '긴장': 'immersion',
    '이성': 'clarity',
    '분석': 'clarity',
    '평온': 'serenity',
    '힐링': 'serenity',
    '기쁨': 'vibrance',
    '긍정': 'vibrance',
    '우울': 'gravity',
    '조심': 'gravity',
    '중립': 'spectrum',
};

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
            console.warn(`⚠️ API Busy (503/429), retrying in ${delay}ms... (${retries} left)`);
            await new Promise(res => setTimeout(res, delay));
            return withRetry(fn, retries - 1, delay * 2);
        }
        throw e;
    }
}

// 2. AI 기사 작성 함수 (요약본 -> 전체 기사 변환)
async function processWithAI(title: string, snippet: string, country: string) {
    if (!apiKey) {
        console.error("❌ AI Error: Missing API Key");
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
    1. **Emotion Analysis**: Choose one dominant emotion ('열정', '긴장', '이성', '분석', '평온', '힐링', '기쁨', '긍정', '우울', '조심', '중립').
    2. **Content Generation**: Rewrite the facts into a rich 3-4 paragraph article in **Korean**.
       - Tone: Professional, objective, yet immersive (News style).
       - **Language: MUST BE KOREAN.**
       - Ensure the content flows naturally as a standalone article.
    3. **Headline**: Write a compelling Korean headline (translate or adapt the original).
    4. **Image Keyword**: Extract ONE English keyword that best represents the specific subject (e.g., "Galaxy S24", "White House", "Climate Change") for image searching.
    5. **Source Citation**: Explicitly mention the source context in the text if necessary (e.g., "According to local reports..."), but the URL is handled separately.
    
    [JSON Output Format]
    {
      "title": "Korean Headline",
      "emotion": "중립",
      "rewrittenContent": "Full Korean article content...",
      "imageKeyword": "EnglishKeyword"
    }
  `;

    try {
        const result = await withRetry(() => model.generateContent(prompt));
        const response = await result.response;
        const text = response.text().replace(/```json|```/g, "").trim();
        return JSON.parse(text);
    } catch (e) {
        console.error("❌ AI Processing Failed:", e);
        return null;
    }
}

// 3. 메인 실행 함수 (크롤링 -> AI작성 -> DB저장)
export async function runAutoNewsUpdate() {
    const countries = ['kr', 'us', 'jp', 'gb'];

    // 실행 결과 통계용 변수
    let stats = { total: 0, saved: 0, skipped: 0, failed: 0 };
    let logs: string[] = [];

    console.log("🌍 Starting Auto News Update (Parallel Fetching)...");

    // 1. Collect all candidates first
    const allCandidates: any[] = [];

    for (const country of countries) {
        try {
            const feed = await parser.parseURL(RSS_URLS[country as keyof typeof RSS_URLS]);
            const targetArticles = feed.items.slice(0, 4); // 4 items per country

            for (const item of targetArticles) {
                if (!item.title || !item.link) continue;
                allCandidates.push({ ...item, country });
            }
        } catch (e) {
            console.error(`${country} RSS Parse Failed:`, e);
        }
    }

    stats.total = allCandidates.length;
    console.log(`📊 Found ${stats.total} candidates. Processing with concurrency limit 3...`);

    // 2. Process in parallel (Concurrency: 3)
    await pMap(allCandidates, async (item) => {
        try {
            // ✅ 1단계: 중복 기사 체크
            const { data: existing } = await supabase
                .from('news_items')
                .select('id')
                .eq('source', item.link)
                .maybeSingle();

            if (existing) {
                stats.skipped++;
                return;
            }

            // ✅ 2단계: AI에게 기사 작성 요청 (w/ Retry)
            const aiResult = await processWithAI(item.title, item.contentSnippet || item.content || "", item.country);

            if (!aiResult) {
                stats.failed++;
                return;
            }

            // ✅ 3단계: 감정 매핑
            const mappedEmotion: EmotionType = EMOTION_MAP[aiResult.emotion] || 'serenity';

            // ✅ 4단계: 이미지 결정
            let imageUrl = "";

            if (!item.enclosure?.url && !item['mediaContent']?.['$']?.url) {
                try {
                    // Try to generate image, but fail fast (5s timeout)
                    const imageModel = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
                    const imagePrompt = `Editorial news photo for: ${aiResult.imageKeyword || "Global News"}. ${aiResult.emotion} atmosphere. High quality, realistic, cinematic lighting.`;

                    const genPromise = imageModel.generateContent({ contents: [{ role: "user", parts: [{ text: imagePrompt }] }] });
                    // Reduced timeout to 5000ms
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));

                    const imageRes: any = await Promise.race([genPromise, timeoutPromise]);
                    const imgData = imageRes.response.candidates?.[0]?.content?.parts?.[0];

                    if (imgData?.inlineData) {
                        imageUrl = `data:${imgData.inlineData.mimeType};base64,${imgData.inlineData.data}`;
                    }
                } catch (e) {
                    // Fallback instantly
                    imageUrl = `https://source.unsplash.com/1600x900/?${encodeURIComponent(aiResult.imageKeyword || 'news')}`;
                }
            } else {
                imageUrl = item.enclosure?.url || item['mediaContent']?.['$']?.url;
            }

            // ✅ 5단계: DB에 최종 저장
            const newItem = {
                title: aiResult.title || `[${item.country.toUpperCase()}] ${item.title}`,
                content: aiResult.rewrittenContent,
                summary: item.contentSnippet || aiResult.rewrittenContent.substring(0, 100),
                source: item.link,
                emotion: mappedEmotion,
                image: imageUrl,
                category: "World",
                platforms: ["interactive"],
                views: 0,
                saves: 0,
                intensity: 50 + Math.floor(Math.random() * 40),
                is_published: true,
            };

            const { error } = await supabase.from('news_items').insert(newItem);

            if (!error) {
                console.log(`✅ Saved: ${newItem.title}`);
                logs.push(`[${item.country}] ${newItem.title}`);
                stats.saved++;
            } else {
                console.error("❌ DB Insert Error:", error);
                stats.failed++;
            }

        } catch (e) {
            console.error("Process Error for item:", item.title, e);
            stats.failed++;
        }
    }, 3); // Concurrency Limit: 3

    return { status: 'completed', stats, logs };
}
