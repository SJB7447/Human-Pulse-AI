import "dotenv/config";
import Parser from "rss-parser";
import { randomUUID } from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../server/supabase";
import { emotionTypes, type EmotionType } from "../shared/schema";

type FeedSpec = {
  url: string;
  category: string;
};

type FeedItem = {
  title?: string;
  link?: string;
  contentSnippet?: string;
  content?: string;
  enclosure?: { url?: string };
  mediaContent?: { $?: { url?: string } };
};

type SeedArticle = {
  title: string;
  summary: string;
  content: string;
  source: string;
  image: string;
  category: string;
  emotion: EmotionType;
  intensity: number;
};

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["enclosure", "enclosure"],
    ],
  },
});

const FEEDS_BY_EMOTION: Record<EmotionType, FeedSpec[]> = {
  vibrance: [
    { url: "https://rss.donga.com/culture.xml", category: "문화·연예" },
    { url: "https://rss.donga.com/sports.xml", category: "스포츠" },
    { url: "https://rss.donga.com/leisure.xml", category: "레저" },
    { url: "https://rss.donga.com/show.xml", category: "공연" },
    { url: "https://rss.donga.com/book.xml", category: "도서" },
  ],
  immersion: [
    { url: "https://rss.donga.com/politics.xml", category: "정치" },
    { url: "https://rss.donga.com/national.xml", category: "사회" },
    { url: "https://rss.donga.com/international.xml", category: "국제" },
  ],
  clarity: [
    { url: "https://rss.donga.com/economy.xml", category: "경제" },
    { url: "https://rss.donga.com/science.xml", category: "의학·과학" },
    { url: "https://rss.donga.com/editorials.xml", category: "사설·칼럼" },
  ],
  gravity: [
    { url: "https://rss.donga.com/national.xml", category: "사회" },
    { url: "https://rss.donga.com/international.xml", category: "국제" },
    { url: "https://rss.donga.com/politics.xml", category: "정치" },
  ],
  serenity: [
    { url: "https://rss.donga.com/health.xml", category: "건강" },
    { url: "https://rss.donga.com/travel.xml", category: "여행" },
    { url: "https://rss.donga.com/woman.xml", category: "여성" },
    { url: "https://rss.donga.com/inmul.xml", category: "사람속으로" },
  ],
  spectrum: [
    { url: "https://rss.donga.com/total.xml", category: "전체" },
    { url: "https://rss.donga.com/editorials.xml", category: "사설·칼럼" },
  ],
};

const DEFAULT_INTENSITY: Record<EmotionType, number> = {
  vibrance: 82,
  immersion: 88,
  clarity: 72,
  gravity: 84,
  serenity: 58,
  spectrum: 64,
};

const FALLBACK_TAGLINE: Record<EmotionType, string> = {
  vibrance: "분위기의 온도를 올리는 장면과 기대감을 중심으로 재구성했습니다.",
  immersion: "현장의 긴장감과 충돌 지점을 따라 핵심 쟁점을 정리했습니다.",
  clarity: "복잡한 사실 관계를 한 번에 파악할 수 있도록 맥락을 정리했습니다.",
  gravity: "사안의 무게와 파장을 중심으로 차분하게 다시 풀어냈습니다.",
  serenity: "일상 회복과 안정의 관점에서 읽을 수 있도록 톤을 낮춰 정리했습니다.",
  spectrum: "여러 시선을 함께 볼 수 있도록 균형 있게 다시 구성했습니다.",
};

const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const gemini = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const AI_ENABLED = Boolean(gemini) && !process.argv.includes("--no-ai");

function canonicalizeUrl(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "rss", "ref"].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    return parsed.toString();
  } catch {
    return value;
  }
}

function cleanText(raw: string): string {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackSummary(title: string, snippet: string, emotion: EmotionType): string {
  const safeSnippet = cleanText(snippet);
  if (safeSnippet.length >= 48) return safeSnippet.slice(0, 160);
  return `${title} 관련 핵심 사실을 ${emotion} 관점으로 짧게 정리한 브리핑입니다.`;
}

function fallbackContent(title: string, snippet: string, emotion: EmotionType, sourceUrl: string): string {
  const safeSnippet = cleanText(snippet);
  const body = safeSnippet || `${title} 관련 세부 내용은 동아일보 원문을 바탕으로 요약 정리했습니다.`;
  return [
    `${title}`,
    "",
    `${body}`,
    "",
    `${FALLBACK_TAGLINE[emotion]}`,
    "",
    `원문 링크: ${sourceUrl}`,
  ].join("\n");
}

async function rewriteWithAI(
  title: string,
  snippet: string,
  emotion: EmotionType,
  category: string,
  sourceUrl: string,
): Promise<Pick<SeedArticle, "title" | "summary" | "content" | "category"> | null> {
  if (!gemini || !AI_ENABLED) return null;

  const prompt = [
    "Role: Korean news editor.",
    "Task: Rewrite a Donga Ilbo article teaser into an original Korean briefing for an emotion-based news service.",
    "Do not copy the source text verbatim.",
    "Keep factual uncertainty explicit when details are limited.",
    `Emotion key: ${emotion}`,
    `Preferred category: ${category}`,
    "Return strict JSON only with keys: title, summary, content, category.",
    `Source headline: ${title}`,
    `Source snippet: ${cleanText(snippet)}`,
    `Source url: ${sourceUrl}`,
    "Content requirements:",
    "- Korean language only",
    "- 2 to 3 short paragraphs",
    "- mention that it is based on Donga Ilbo reporting in a natural way",
    "- keep summary under 140 characters",
  ].join("\n");

  try {
    const model = gemini.getGenerativeModel({ model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = String(result.response.text() || "").trim();
    const matched = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(matched ? matched[0] : text);
    const nextTitle = cleanText(String(parsed?.title || ""));
    const nextSummary = cleanText(String(parsed?.summary || ""));
    const nextContent = cleanText(String(parsed?.content || ""));
    const nextCategory = cleanText(String(parsed?.category || category));
    if (!nextTitle || !nextSummary || !nextContent) return null;
    return {
      title: nextTitle,
      summary: nextSummary.slice(0, 160),
      content: `${nextContent}\n\n원문 링크: ${sourceUrl}`,
      category: nextCategory || category,
    };
  } catch (error) {
    console.warn("[seed_donga_emotions] AI rewrite failed:", error);
    return null;
  }
}

async function fetchEmotionCandidates(emotion: EmotionType, take: number): Promise<Array<{ item: FeedItem; category: string }>> {
  const feedSpecs = FEEDS_BY_EMOTION[emotion];
  const rows: Array<{ item: FeedItem; category: string }> = [];
  const seen = new Set<string>();

  for (const spec of feedSpecs) {
    try {
      const feed = await parser.parseURL(spec.url);
      for (const item of feed.items as FeedItem[]) {
        const link = canonicalizeUrl(String(item.link || ""));
        const title = cleanText(String(item.title || ""));
        if (!link || !title || seen.has(link)) continue;
        seen.add(link);
        rows.push({ item: { ...item, link }, category: spec.category });
      }
    } catch (error) {
      console.warn(`[seed_donga_emotions] RSS fetch failed for ${spec.url}:`, error);
    }
    if (rows.length >= take * 3) break;
  }

  return rows.slice(0, take * 3);
}

async function buildEmotionArticles(emotion: EmotionType, take: number): Promise<SeedArticle[]> {
  const candidates = await fetchEmotionCandidates(emotion, take);
  const built: SeedArticle[] = [];
  const sourceCandidates = candidates
    .map((row) => canonicalizeUrl(String(row.item.link || "")))
    .filter(Boolean);
  const existingSourceSet = new Set<string>();

  if (sourceCandidates.length > 0) {
    const { data: existingRows } = await supabase
      .from("news_items")
      .select("source")
      .in("source", Array.from(new Set(sourceCandidates)));
    for (const row of existingRows || []) {
      const source = canonicalizeUrl(String((row as any)?.source || ""));
      if (source) existingSourceSet.add(source);
    }
  }

  for (const row of candidates) {
    const title = cleanText(String(row.item.title || ""));
    const link = canonicalizeUrl(String(row.item.link || ""));
    const snippet = cleanText(String(row.item.contentSnippet || row.item.content || ""));
    if (!title || !link) continue;

    if (existingSourceSet.has(link)) continue;

    const aiDraft = await rewriteWithAI(title, snippet, emotion, row.category, link);
    const image = String(
      row.item.enclosure?.url ||
      row.item.mediaContent?.$?.url ||
      `https://source.unsplash.com/1600x900/?${encodeURIComponent(`${emotion} news korea`)}`,
    ).trim();

    built.push({
      title: aiDraft?.title || title,
      summary: aiDraft?.summary || fallbackSummary(title, snippet, emotion),
      content: aiDraft?.content || fallbackContent(title, snippet, emotion, link),
      source: link,
      image,
      category: aiDraft?.category || row.category,
      emotion,
      intensity: DEFAULT_INTENSITY[emotion] + Math.floor(Math.random() * 9) - 4,
    });

    if (built.length >= take) break;
  }

  return built;
}

async function insertArticles(rows: SeedArticle[]) {
  if (rows.length === 0) return;
  const payload = rows.map((row) => ({
      id: randomUUID(),
      title: row.title,
      summary: row.summary,
      content: row.content,
      source: row.source,
      image: row.image,
      category: row.category,
      emotion: row.emotion,
      intensity: Math.max(35, Math.min(95, row.intensity)),
      views: Math.floor(Math.random() * 1400) + 50,
      saves: Math.floor(Math.random() * 120),
      platforms: ["interactive"],
      is_published: true,
      author_name: "Donga AI Seed",
    }));

  const { error } = await supabase.from("news_items").insert(payload);
  if (error) {
    throw new Error(`[seed_donga_emotions] batch insert failed: ${error.message}`);
  }

  rows.forEach((row) => {
    console.log(`[seed_donga_emotions] inserted: ${row.emotion} :: ${row.title}`);
  });
}

async function main() {
  const takePerEmotion = 5;
  const emotions = [...emotionTypes];
  const payload: SeedArticle[] = [];

  console.log(`[seed_donga_emotions] start: ${emotions.join(", ")} x ${takePerEmotion} / ai=${AI_ENABLED ? "on" : "off"}`);

  for (const emotion of emotions) {
    const rows = await buildEmotionArticles(emotion, takePerEmotion);
    console.log(`[seed_donga_emotions] prepared ${rows.length} for ${emotion}`);
    payload.push(...rows);
  }

  if (payload.length === 0) {
    throw new Error("No articles prepared from Donga RSS feeds.");
  }

  await insertArticles(payload);
  console.log(`[seed_donga_emotions] complete: prepared ${payload.length}`);
}

main().catch((error) => {
  console.error("[seed_donga_emotions] failed:", error);
  process.exit(1);
});
