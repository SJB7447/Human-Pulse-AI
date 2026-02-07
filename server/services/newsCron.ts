import Parser from 'rss-parser';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../supabase";
import { EmotionType } from "../../shared/schema";
import { randomUUID } from "crypto";

const parser = new Parser();

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
    너는 국제부 베테랑 기자야. 아래 팩트를 기반으로 새로운 뉴스 기사를 작성해.
    
    [입력 정보]
    - 국가: ${country}
    - 제목: ${title}
    - 내용요약: ${snippet}

    [작성 지침]
    1. 이 사건의 핵심 감정을 하나 선택해: '기쁨', '슬픔', '분노', '공포', '중립'.
    2. 입력된 '내용요약'이 짧더라도, 문맥을 추론하여 **3~4문단의 풍성한 한국어 기사 본문**으로 확장해서 작성해. (중요: 독자가 읽을 실제 기사 내용이어야 함)
    3. 문체는 객관적이지만 몰입감 있는 뉴스 어조를 사용해.
    4. 결과는 오직 JSON 형식으로만 출력해.

    [JSON 출력 예시]
    {
      "emotion": "중립",
      "rewrittenContent": "런던 현지 시각 5일, 영국 왕실은 공식 성명을 통해..."
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

    console.log("🌍 Starting Auto News Update...");

    for (const country of countries) {
        try {
            // RSS 피드 가져오기
            const feed = await parser.parseURL(RSS_URLS[country as keyof typeof RSS_URLS]);

            // ✅ 최신 1개만 처리 (Vercel Timeout 방지: 10초 제한)
            const targetArticles = feed.items.slice(0, 1);

            for (const item of targetArticles) {
                if (!item.title || !item.link) continue;
                stats.total++;

                // ✅ 1단계: 중복 기사 체크 (news_items.source = original_url)
                const { data: existing } = await supabase
                    .from('news_items') // Project table name
                    .select('id')
                    .eq('source', item.link) // Check against 'source' column
                    .maybeSingle();

                if (existing) {
                    // console.log(`PASS (Duplicate): ${item.title}`);
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

                // ✅ 4단계: DB에 최종 저장 (news_items Table)
                const newItem = {
                    title: `[${country.toUpperCase()}] ${item.title}`,
                    content: aiResult.rewrittenContent, // AI generated content
                    summary: item.contentSnippet || aiResult.rewrittenContent.substring(0, 100), // Fallback summary
                    source: item.link, // Original URL
                    emotion: mappedEmotion, // Mapped enum
                    image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80", // Placeholder
                    category: "World",
                    platforms: ["interactive"],
                    views: 0,
                    saves: 0,
                    intensity: 50 + Math.floor(Math.random() * 40),
                    is_published: true, // Auto-publish
                    // createdAt is auto-handled by DB default
                };

                const { error } = await supabase.from('news_items').insert(newItem);

                if (!error) {
                    console.log(`✅ Saved: ${item.title}`);
                    logs.push(`[${country}] ${item.title}`);
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
