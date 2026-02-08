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
    '기쁨': 'joy',
    '슬픔': 'sadness',
    '분노': 'anger',
    '공포': 'fear',
    '중립': 'calm'
};

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
    1. **Emotion Analysis**: Choose one dominant emotion ('기쁨', '슬픔', '분노', '공포', '중립').
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
        const result = await model.generateContent(prompt);
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

    console.log("🌍 Starting Auto News Update (Batch: 4 per country)...");

    for (const country of countries) {
        try {
            // RSS 피드 가져오기
            const feed = await parser.parseURL(RSS_URLS[country as keyof typeof RSS_URLS]);

            // ✅ 요청사항: 국가별 4개씩 수집
            const targetArticles = feed.items.slice(0, 4);

            for (const item of targetArticles) {
                if (!item.title || !item.link) continue;
                stats.total++;

                // ✅ 1단계: 중복 기사 체크 (news_items.source = original_url)
                const { data: existing } = await supabase
                    .from('news_items')
                    .select('id')
                    .eq('source', item.link)
                    .maybeSingle();

                if (existing) {
                    stats.skipped++;
                    continue;
                }

                // ✅ 2단계: AI에게 기사 작성 요청
                const aiResult = await processWithAI(item.title, item.contentSnippet || item.content || "", country);

                if (!aiResult) {
                    stats.failed++;
                    continue;
                }

                // ✅ 3단계: 감정 매핑
                const mappedEmotion: EmotionType = EMOTION_MAP[aiResult.emotion] || 'calm';

                // ✅ 4단계: 이미지 결정 (RSS Enclosure -> Unsplash Keyword -> AI Generation)
                let imageUrl = "";

                // Revised Logic for User Request "Make it if you can't get it":
                // Priority: 1. RSS (Real photo) 2. AI Generation (Custom made) 3. Unsplash/Placeholder (Last, but safe)

                if (!item.enclosure?.url && !item['mediaContent']?.['$']?.url) {
                    try {
                        // console.log("🎨 Generating AI Image for:", aiResult.title);
                        const imageModel = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
                        const imagePrompt = `Editorial news photo for: ${aiResult.imageKeyword || "Global News"}. ${aiResult.emotion} atmosphere. High quality, realistic, cinematic lighting.`;

                        // Create a timeout promise to skip if taking too long (e.g., 5 seconds) to save cron time
                        const genPromise = imageModel.generateContent({ contents: [{ role: "user", parts: [{ text: imagePrompt }] }] });
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));

                        const imageRes: any = await Promise.race([genPromise, timeoutPromise]);

                        const imgData = imageRes.response.candidates?.[0]?.content?.parts?.[0];
                        if (imgData?.inlineData) {
                            imageUrl = `data:${imgData.inlineData.mimeType};base64,${imgData.inlineData.data}`;
                        }
                    } catch (e) {
                        // console.warn("⚠️ Image Gen Skipped/Failed, using Unsplash:", e);
                        imageUrl = `https://source.unsplash.com/1600x900/?${encodeURIComponent(aiResult.imageKeyword || 'news')}`;
                    }
                } else {
                    imageUrl = item.enclosure?.url || item['mediaContent']?.['$']?.url;
                }

                // ✅ 5단계: DB에 최종 저장
                const newItem = {
                    title: aiResult.title || `[${country.toUpperCase()}] ${item.title}`,
                    content: aiResult.rewrittenContent,
                    summary: item.contentSnippet || aiResult.rewrittenContent.substring(0, 100),
                    source: item.link, // ✅ 출처 정확히 포함
                    emotion: mappedEmotion,
                    image: imageUrl,
                    category: "World",
                    platforms: ["interactive"],
                    views: 0,
                    saves: 0,
                    intensity: 50 + Math.floor(Math.random() * 40),
                    is_published: true, // ✅ 배포(공개) 상태로 저장
                };

                const { error } = await supabase.from('news_items').insert(newItem);

                if (!error) {
                    console.log(`✅ Saved: ${newItem.title}`);
                    logs.push(`[${country}] ${newItem.title}`);
                    stats.saved++;
                } else {
                    console.error("❌ DB Insert Error:", error);
                    stats.failed++;
                }
            }
        } catch (e) {
            console.error(`${country} RSS Parse Failed:`, e);
        }
    }

    return { status: 'completed', stats, logs };
}
