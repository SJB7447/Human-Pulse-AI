import "dotenv/config";
import Parser from "rss-parser";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser();
const EMOTIONS = ["vibrance", "immersion", "clarity", "gravity", "serenity", "spectrum"];
const TAKE_PER_EMOTION = 5;
const RSS_URL = "https://rss.donga.com/total.xml";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
);

const KEYWORDS = {
  vibrance: ["문화", "연예", "축제", "스포츠", "공연", "영화", "콘서트", "전시", "스타", "팬"],
  immersion: ["정치", "대통령", "국회", "외교", "시위", "갈등", "대치", "논란", "총리", "선거"],
  clarity: ["경제", "분석", "시장", "반도체", "산업", "데이터", "증시", "금리", "수출", "기술"],
  gravity: ["사고", "재난", "범죄", "수사", "화재", "피해", "사망", "붕괴", "경고", "위기"],
  serenity: ["건강", "휴식", "치유", "회복", "돌봄", "환경", "여행", "자연", "웰빙", "마음"],
  spectrum: [],
};

const CATEGORIES = {
  vibrance: "문화·활력",
  immersion: "정치·현안",
  clarity: "경제·분석",
  gravity: "사건·위기",
  serenity: "회복·웰빙",
  spectrum: "균형·다양성",
};

const INTENSITY = {
  vibrance: 82,
  immersion: 88,
  clarity: 74,
  gravity: 86,
  serenity: 58,
  spectrum: 66,
};

function cleanText(raw = "") {
  return String(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeUrl(raw = "") {
  try {
    const url = new URL(String(raw).trim());
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "rss", "ref"].forEach((key) => {
      url.searchParams.delete(key);
    });
    return url.toString();
  } catch {
    return String(raw).trim();
  }
}

function scoreEmotion(title, snippet, emotion) {
  if (emotion === "spectrum") return 0;
  const haystack = `${title} ${snippet}`.toLowerCase();
  return KEYWORDS[emotion].reduce((acc, keyword) => acc + (haystack.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function inferEmotion(title, snippet) {
  let best = "spectrum";
  let maxScore = 0;
  for (const emotion of EMOTIONS) {
    const score = scoreEmotion(title, snippet, emotion);
    if (score > maxScore) {
      maxScore = score;
      best = emotion;
    }
  }
  return maxScore > 0 ? best : "spectrum";
}

function buildSummary(title, snippet, emotion) {
  const safeSnippet = cleanText(snippet);
  if (safeSnippet.length >= 42) return safeSnippet.slice(0, 150);
  return `${title} 이슈를 ${CATEGORIES[emotion]} 관점에서 빠르게 정리한 동아일보 기반 브리핑입니다.`;
}

function buildContent(title, snippet, emotion, sourceUrl) {
  const safeSnippet = cleanText(snippet);
  const lines = [
    `${title}`,
    "",
    safeSnippet || "동아일보 RSS에 노출된 기사 정보를 바탕으로 핵심 내용을 재구성했습니다.",
    "",
    `${CATEGORIES[emotion]} 흐름에서 읽히는 포인트를 중심으로 재정리한 데모 기사입니다.`,
    "",
    `원문 링크: ${sourceUrl}`,
  ];
  return lines.join("\n");
}

async function main() {
  console.log(`[seed_donga_emotions_fast] fetching ${RSS_URL}`);
  const feed = await parser.parseURL(RSS_URL);
  const items = Array.isArray(feed.items) ? feed.items : [];
  const pickedByEmotion = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, []]));
  const usedLinks = new Set();

  for (const item of items) {
    const title = cleanText(item.title);
    const link = canonicalizeUrl(item.link);
    const snippet = cleanText(item.contentSnippet || item.content || "");
    if (!title || !link || usedLinks.has(link)) continue;

    const emotion = inferEmotion(title, snippet);
    if (pickedByEmotion[emotion].length >= TAKE_PER_EMOTION) continue;

    pickedByEmotion[emotion].push({ title, link, snippet });
    usedLinks.add(link);

    const done = EMOTIONS.every((key) => pickedByEmotion[key].length >= TAKE_PER_EMOTION);
    if (done) break;
  }

  const leftovers = items
    .map((item) => ({
      title: cleanText(item.title),
      link: canonicalizeUrl(item.link),
      snippet: cleanText(item.contentSnippet || item.content || ""),
    }))
    .filter((item) => item.title && item.link && !usedLinks.has(item.link));

  for (const emotion of EMOTIONS) {
    for (const row of leftovers) {
      if (pickedByEmotion[emotion].length >= TAKE_PER_EMOTION) break;
      pickedByEmotion[emotion].push(row);
      usedLinks.add(row.link);
    }
  }

  const sourceList = Array.from(usedLinks);
  const { data: existingRows, error: existingError } = await supabase
    .from("news_items")
    .select("source")
    .in("source", sourceList);
  if (existingError) {
    throw new Error(`existing lookup failed: ${existingError.message}`);
  }
  const existingSources = new Set((existingRows || []).map((row) => canonicalizeUrl(row.source)));

  const payload = [];
  for (const emotion of EMOTIONS) {
    for (const row of pickedByEmotion[emotion].slice(0, TAKE_PER_EMOTION)) {
      if (existingSources.has(row.link)) continue;
      payload.push({
        id: randomUUID(),
        title: row.title,
        summary: buildSummary(row.title, row.snippet, emotion),
        content: buildContent(row.title, row.snippet, emotion, row.link),
        source: row.link,
        image: `https://source.unsplash.com/1600x900/?${encodeURIComponent(`korea news ${emotion}`)}`,
        category: CATEGORIES[emotion],
        emotion,
        intensity: INTENSITY[emotion],
        views: Math.floor(Math.random() * 1200) + 50,
        saves: Math.floor(Math.random() * 120) + 3,
        platforms: ["interactive"],
        is_published: true,
        author_name: "Donga AI Seed",
      });
    }
  }

  if (payload.length === 0) {
    console.log("[seed_donga_emotions_fast] no new articles to insert");
    return;
  }

  console.log(`[seed_donga_emotions_fast] inserting ${payload.length} articles`);
  const { error: insertError } = await supabase.from("news_items").insert(payload);
  if (insertError) {
    throw new Error(`insert failed: ${insertError.message}`);
  }

  const counts = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, payload.filter((row) => row.emotion === emotion).length]));
  console.log(`[seed_donga_emotions_fast] complete ${JSON.stringify(counts)}`);
}

main().catch((error) => {
  console.error("[seed_donga_emotions_fast] failed:", error);
  process.exit(1);
});
