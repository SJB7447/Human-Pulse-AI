/**
 * 기존 뉴스 기사 감정 재분류 스크립트
 * 실행: npx tsx server/scripts/reclassifyNews.ts
 */
import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../supabase";
import type { EmotionType } from "../../shared/schema";

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

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

async function reclassifyArticle(title: string, content: string): Promise<EmotionType> {
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `
    You are an emotion classifier for news articles.
    Analyze the following article and choose the ONE most dominant emotion.

    [Article]
    Title: ${title}
    Content: ${(content || '').substring(0, 800)}

    [Emotion Choices - pick exactly ONE Korean keyword]
    - 열정 (passion/intensity - for articles about heated debates, strong actions, urgent matters)
    - 긴장 (tension - for conflict, confrontation, political tension)
    - 이성 (reason - for analytical, factual, scientific, objective reporting)
    - 분석 (analysis - for data-driven, investigative, research articles)
    - 평온 (calm - for peaceful, healing, wellness, nature topics)
    - 힐링 (healing - for heartwarming, relaxing, feel-good stories)
    - 기쁨 (joy - for celebrations, achievements, positive breakthroughs)
    - 긍정 (positive - for hopeful, optimistic, uplifting news)
    - 우울 (gloomy - for sad, unfortunate, loss-related news)
    - 조심 (caution - for warnings, risks, concerns, fear-inducing news)
    - 중립 (neutral - ONLY for truly balanced, mixed-emotion articles)

    Return ONLY the Korean keyword, nothing else.
  `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const emotionKo = response.text().trim();
        return EMOTION_MAP[emotionKo] || 'spectrum';
    } catch (e) {
        console.error("  ❌ AI Error:", e);
        return 'spectrum';
    }
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("🔄 Starting news reclassification...\n");

    // Fetch all articles
    const { data: articles, error } = await supabase
        .from('news_items')
        .select('id, title, content, emotion')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("❌ Failed to fetch articles:", error);
        return;
    }

    console.log(`📊 Found ${articles.length} articles to reclassify\n`);

    let updated = 0;
    let unchanged = 0;
    let failed = 0;

    for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const oldEmotion = article.emotion;

        process.stdout.write(`[${i + 1}/${articles.length}] "${article.title?.substring(0, 40)}..." `);

        try {
            const newEmotion = await reclassifyArticle(article.title, article.content);

            if (newEmotion !== oldEmotion) {
                const { error: updateError } = await supabase
                    .from('news_items')
                    .update({ emotion: newEmotion })
                    .eq('id', article.id);

                if (updateError) {
                    console.log(`❌ DB Error`);
                    failed++;
                } else {
                    console.log(`${oldEmotion} → ${newEmotion} ✅`);
                    updated++;
                }
            } else {
                console.log(`${oldEmotion} (unchanged)`);
                unchanged++;
            }

            // Rate limit: 500ms between requests
            await sleep(500);
        } catch (e) {
            console.log(`❌ Error`);
            failed++;
        }
    }

    console.log(`\n📊 Reclassification Complete:`);
    console.log(`   ✅ Updated:   ${updated}`);
    console.log(`   ⏸️  Unchanged: ${unchanged}`);
    console.log(`   ❌ Failed:    ${failed}`);
    console.log(`   📰 Total:     ${articles.length}`);

    // Show final distribution
    const { data: stats } = await supabase
        .from('news_items')
        .select('emotion');

    if (stats) {
        const dist: Record<string, number> = {};
        stats.forEach((s: any) => { dist[s.emotion] = (dist[s.emotion] || 0) + 1; });
        console.log(`\n📈 New Distribution:`);
        Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
            console.log(`   ${k}: ${v}`);
        });
    }
}

main().catch(console.error);
