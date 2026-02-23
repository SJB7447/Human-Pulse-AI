/**
 * Reclassify existing articles by emotion/category using keyword heuristics.
 * Usage:
 *   npx tsx server/scripts/reclassifyNews.ts --dry-run
 *   npx tsx server/scripts/reclassifyNews.ts
 */
import "dotenv/config";
import { supabase } from "../supabase";
import type { EmotionType } from "../../shared/schema";

const EMOTION_KEYWORDS: Record<EmotionType, string[]> = {
  immersion: [
    "정치", "속보", "긴급", "갈등", "충돌", "시위", "노동", "외교", "분쟁",
    "politics", "breaking", "conflict", "protest", "tension", "diplomatic",
  ],
  clarity: [
    "분석", "해설", "경제", "정책", "데이터", "지표", "산업", "기술", "리포트",
    "analysis", "economy", "policy", "data", "industry", "technology", "report",
  ],
  serenity: [
    "회복", "안정", "웰빙", "건강", "환경", "기후", "자연", "커뮤니티", "돌봄",
    "wellbeing", "wellness", "health", "recovery", "nature", "climate", "community",
  ],
  vibrance: [
    "문화", "연예", "콘텐츠", "축제", "행사", "스포츠", "미담", "선행", "여가",
    "culture", "entertainment", "festival", "sports", "highlight", "lifestyle", "positive",
  ],
  gravity: [
    "사건", "사고", "재난", "범죄", "수사", "안전", "경고", "위험", "피해", "사망",
    "incident", "accident", "disaster", "crime", "investigation", "risk", "warning", "fatal",
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

const VALID_EMOTIONS: EmotionType[] = ["vibrance", "immersion", "clarity", "gravity", "serenity", "spectrum"];

function inferEmotionFromText(title: string, summary: string, content: string): EmotionType {
  const haystack = `${title || ""} ${summary || ""} ${content || ""}`.toLowerCase();
  let best: EmotionType = "spectrum";
  let score = 0;

  for (const emotion of (["immersion", "clarity", "serenity", "vibrance", "gravity"] as EmotionType[])) {
    const hit = EMOTION_KEYWORDS[emotion].reduce((acc, keyword) => acc + (haystack.includes(keyword.toLowerCase()) ? 1 : 0), 0);
    if (hit > score) {
      score = hit;
      best = emotion;
    }
  }

  return score > 0 ? best : "spectrum";
}

function normalizeEmotion(raw: unknown): EmotionType | null {
  const text = String(raw || "").trim().toLowerCase();
  return VALID_EMOTIONS.includes(text as EmotionType) ? (text as EmotionType) : null;
}

function normalizeCategory(rawCategory: unknown, emotion: EmotionType): string {
  const text = String(rawCategory || "").trim();
  if (!text || /^(world|general)$/i.test(text)) {
    return EMOTION_DEFAULT_CATEGORY[emotion];
  }
  return text;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[reclassify] start dryRun=${dryRun}`);

  const { data: rows, error } = await supabase
    .from("news_items")
    .select("id,title,summary,content,emotion,category")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[reclassify] failed to fetch articles:", error.message || error);
    process.exitCode = 1;
    return;
  }

  const items = rows || [];
  let scanned = 0;
  let changed = 0;

  for (const row of items) {
    scanned += 1;
    const currentEmotion = normalizeEmotion(row.emotion) || "spectrum";
    const inferredEmotion = inferEmotionFromText(row.title || "", row.summary || "", row.content || "");
    const nextEmotion = currentEmotion === "serenity" && /^(world|general)?$/i.test(String(row.category || "").trim())
      ? inferredEmotion
      : currentEmotion;
    const nextCategory = normalizeCategory(row.category, nextEmotion);

    const shouldUpdate = nextEmotion !== currentEmotion || nextCategory !== String(row.category || "").trim();
    if (!shouldUpdate) continue;

    changed += 1;
    console.log(
      `[reclassify] ${row.id} emotion:${currentEmotion}->${nextEmotion} category:${String(row.category || "").trim() || "(empty)"}->${nextCategory}`,
    );

    if (dryRun) continue;

    const { error: updateError } = await supabase
      .from("news_items")
      .update({ emotion: nextEmotion, category: nextCategory })
      .eq("id", row.id);

    if (updateError) {
      console.error(`[reclassify] update failed id=${row.id}:`, updateError.message || updateError);
    }
  }

  console.log(`[reclassify] done scanned=${scanned} changed=${changed} dryRun=${dryRun}`);
}

main().catch((error) => {
  console.error("[reclassify] fatal:", error);
  process.exitCode = 1;
});
