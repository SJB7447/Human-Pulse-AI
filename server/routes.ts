import type { Express } from "express";
import type { Server } from "http";
import { randomUUID } from "crypto";
import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "./storage.js";
import { runAutoNewsUpdate } from "./services/newsCron.js";
import { emotionTypes, type EmotionType } from "../shared/schema.js";
import { buildDraftGenerationPrompt, normalizeDraftMode, type DraftMode } from "./services/articlePrompt.js";
import {
  type InteractiveArticle,
  type InteractiveGenerationInput,
  type StoryBlockIntent,
  validateInteractiveArticle,
} from "../shared/interactiveArticle.js";

function getEmotionColor(emotion: EmotionType): string {
  const colors: Record<EmotionType, string> = {
    vibrance: "#ffd150",
    immersion: "#f4606b",
    clarity: "#3f65ef",
    gravity: "#999898",
    serenity: "#88d84a",
    spectrum: "#1bbca8",
  };
  return colors[emotion];
}

function toEmotion(value: unknown, fallback: EmotionType = "spectrum"): EmotionType {
  const text = String(value || "").toLowerCase();
  return emotionTypes.includes(text as EmotionType) ? (text as EmotionType) : fallback;
}

const REQUIRED_INTENTS: StoryBlockIntent[] = ["intro", "context", "tension", "interpretation", "closure"];

function buildInteractiveArticle(input: InteractiveGenerationInput): InteractiveArticle {
  const topic = input.keywords.join(", ");
  const storyBlocks = REQUIRED_INTENTS.map((intent, idx) => ({
    id: `b${idx + 1}`,
    intent,
    text: `${topic} 관련 ${intent} 블록`,
  }));

  const scrollMap = storyBlocks.map((b, idx) => ({
    blockId: b.id,
    start: idx * 20,
    end: (idx + 1) * 20,
  }));

  return {
    specVersion: "interactive-generation.v1",
    articleMeta: {
      title: `${topic} 인터랙티브 기사`,
      subtitle: "Auto generated story spec",
      topic,
      tone: input.tone,
      targetAudience: input.targetAudience,
      platform: input.platform,
      interactionIntensity: input.interactionIntensity,
    },
    storyBlocks,
    scrollMap,
    highlights: [
      {
        id: "h1",
        blockId: "b1",
        type: "issue",
        label: "핵심",
        anchorText: input.keywords[0] || "핵심",
        payload: { summary: "요약" },
      },
    ],
    interactionHints: [],
    qualityMeta: {
      intentCoverage: {
        intro: true,
        context: true,
        tension: true,
        interpretation: true,
        closure: true,
      },
      readabilitySafe: true,
      immersionSafe: true,
      highlightDensity: 0.2,
      validationPassed: true,
      notes: "mock interactive article",
    },
  };
}

const INTERACTIVE_HTML_TAG_RE = /<\s*\/?\s*[a-z][^>]*>/i;
const INTERACTIVE_HTML_BYPASS_KEYS = ["html", "rawHtml", "storyHtml", "renderedHtml"] as const;

function buildInteractiveFallbackArticle(input: InteractiveGenerationInput, reason: string): InteractiveArticle {
  const fallback = buildInteractiveArticle(input);
  fallback.qualityMeta.validationPassed = false;
  fallback.qualityMeta.notes = `fallback applied: ${reason}`;
  return fallback;
}

function parseStorySpecCandidate(raw: unknown): InteractiveArticle | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const parsed = JSON.parse(raw);
    return parsed as InteractiveArticle;
  }
  if (typeof raw === "object") {
    return raw as InteractiveArticle;
  }
  return null;
}

type StorySpecValidationIssue = {
  reason: string;
  location: string;
  recovery: string;
};

type StorySpecValidationReport = {
  valid: boolean;
  issues: StorySpecValidationIssue[];
  source: "validation" | "parse";
};

type DraftSchemaIssue = {
  field: string;
  message: string;
};

type DraftOpsCounters = {
  requests: number;
  success: number;
  retries: number;
  fallbackRecoveries: number;
  parseFailures: number;
  schemaBlocks: number;
  similarityBlocks: number;
  complianceBlocks: number;
  modelEmpty: number;
};

type DraftOpsSnapshot = {
  promptVersion: string;
  startedAt: string;
  updatedAt: string;
  persistence: {
    mode: "file";
    hydrated: boolean;
  };
  totals: DraftOpsCounters;
  byMode: Record<DraftMode, DraftOpsCounters>;
};

type AiNewsOpsCounters = {
  requests: number;
  success: number;
  fallbackRecoveries: number;
  parseFailures: number;
  qualityBlocks: number;
  modelEmpty: number;
  rssFallbacks: number;
};

type AiNewsOpsSnapshot = {
  version: string;
  startedAt: string;
  updatedAt: string;
  persistence: {
    mode: "file";
    hydrated: boolean;
  };
  totals: AiNewsOpsCounters;
  byEmotion: Record<EmotionType, AiNewsOpsCounters>;
};

const DRAFT_PROMPT_VERSION = "article_generation_contract_v1";
const AI_DRAFT_METRIC_ACTION = "ai_draft_metric_v1";
const AI_DRAFT_OPS_METRICS_PATH = path.join(process.cwd(), "server", "data", "ai_draft_ops_metrics.json");
const AI_NEWS_OPS_METRICS_PATH = path.join(process.cwd(), "server", "data", "ai_news_ops_metrics.json");
const AI_NEWS_COMPARE_LOG_PATH = path.join(process.cwd(), "server", "data", "ai_news_model_compare.jsonl");
const AI_NEWS_PARSE_FAIL_LOG_PATH = path.join(process.cwd(), "server", "data", "ai_news_parse_failures.jsonl");
const FIXED_GEMINI_NEWS_TEXT_MODEL = "gemini-3-flash-preview";
let draftOpsHydrated = false;
let draftOpsPersistScheduled = false;
let aiNewsOpsHydrated = false;
let aiNewsOpsPersistScheduled = false;

type ShareShortLinkRecord = {
  slug: string;
  targetUrl: string;
  createdAt: string;
  updatedAt: string;
  hits: number;
};

const SHARE_SHORT_LINKS_PATH = path.join(process.cwd(), "server", "data", "share_short_links_v1.json");
const shareShortLinksBySlug = new Map<string, ShareShortLinkRecord>();
const shareShortLinksByTarget = new Map<string, string>();
let shareShortLinksHydrated = false;
let shareShortLinksPersistScheduled = false;
const SHORT_LINK_PATH_PREFIX = String(process.env.SHARE_SHORT_PATH_PREFIX || "").trim().replace(/^\/+|\/+$/g, "");
const SHORT_LINK_SLUG_LENGTH = Math.max(4, Math.min(Number(process.env.SHARE_SHORT_SLUG_LENGTH || 6), 12));
const SHORT_LINK_DISPLAY_MAX_LENGTH = 20;

function normalizeShortLinkSlug(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
}

function normalizeInsightUserId(value: unknown): string {
  return String(value || "").trim().slice(0, 128);
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildOpinionArticleFromCrawledFallback(input: {
  sourceTitle: string;
  opinionText: string;
  extraRequest: string;
  crawledArticles: KeywordNewsArticle[];
}) {
  const picked = input.crawledArticles.slice(0, 4);
  const content = [
    `## 독자 의견`,
    input.opinionText,
    ``,
    `## 재구성 기사`,
    ...picked.map((row, index) => `${index + 1}. ${row.title}\n- ${row.summary}`),
    ``,
    input.extraRequest ? `## 반영한 추가 요청\n${input.extraRequest}` : "",
  ].filter(Boolean).join("\n");

  return {
    title: `[의견 기사] ${input.sourceTitle}`,
    summary: `${input.sourceTitle} 관련 최신 기사들을 교차 참고해 독자 의견 중심으로 재구성한 기사입니다.`,
    content,
    references: picked.map((row) => ({
      title: row.title,
      url: row.url,
      source: row.source,
    })),
    fallbackUsed: true,
  };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeReferenceUrl(value: string): string {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const parsed = new URL(text);
    parsed.hash = "";
    if (/news\.google\./i.test(parsed.hostname)) {
      parsed.searchParams.delete("oc");
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return text.replace(/\/+$/, "");
  }
}

function createRandomShortSlug(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const seed = randomUUID().replace(/-/g, "");
  let out = "";
  for (let i = 0; i < SHORT_LINK_SLUG_LENGTH; i += 1) {
    const pair = seed.slice((i * 2) % seed.length, ((i * 2) % seed.length) + 2);
    const value = parseInt(pair || "0", 16);
    out += alphabet[value % alphabet.length];
  }
  return out;
}

async function hydrateShareShortLinks(): Promise<void> {
  if (shareShortLinksHydrated) return;
  shareShortLinksHydrated = true;

  try {
    const raw = await readFile(SHARE_SHORT_LINKS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed?.links) ? parsed.links : [];
    for (const row of rows) {
      const slug = normalizeShortLinkSlug(row?.slug);
      const targetUrl = String(row?.targetUrl || "").trim();
      if (!slug || !targetUrl || !isValidHttpUrl(targetUrl)) continue;

      const createdAt = new Date(row?.createdAt || Date.now()).toISOString();
      const updatedAt = new Date(row?.updatedAt || createdAt).toISOString();
      const hits = Number.isFinite(Number(row?.hits)) ? Math.max(0, Number(row.hits)) : 0;

      const record: ShareShortLinkRecord = { slug, targetUrl, createdAt, updatedAt, hits };
      shareShortLinksBySlug.set(slug, record);
      if (!shareShortLinksByTarget.has(targetUrl)) {
        shareShortLinksByTarget.set(targetUrl, slug);
      }
    }
  } catch {
    // ignore hydration failures and continue with empty map
  }
}

function scheduleShareShortLinksPersistence(): void {
  if (shareShortLinksPersistScheduled) return;
  shareShortLinksPersistScheduled = true;

  setTimeout(async () => {
    shareShortLinksPersistScheduled = false;
    try {
      const links = Array.from(shareShortLinksBySlug.values()).sort((a, b) => {
        return b.updatedAt.localeCompare(a.updatedAt);
      });
      await mkdir(path.dirname(SHARE_SHORT_LINKS_PATH), { recursive: true });
      await writeFile(
        SHARE_SHORT_LINKS_PATH,
        JSON.stringify(
          {
            updatedAt: new Date().toISOString(),
            links,
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch (error) {
      console.warn("[SHARE_SHORT_LINK] persist failed:", error);
    }
  }, 80);
}

function resolveOrCreateShareShortLink(targetUrl: string): ShareShortLinkRecord {
  const existingSlug = shareShortLinksByTarget.get(targetUrl);
  if (existingSlug) {
    const existing = shareShortLinksBySlug.get(existingSlug);
    if (existing) return existing;
  }

  let slug = createRandomShortSlug();
  while (shareShortLinksBySlug.has(slug)) {
    slug = createRandomShortSlug();
  }

  const now = new Date().toISOString();
  const record: ShareShortLinkRecord = {
    slug,
    targetUrl,
    createdAt: now,
    updatedAt: now,
    hits: 0,
  };

  shareShortLinksBySlug.set(slug, record);
  shareShortLinksByTarget.set(targetUrl, slug);
  scheduleShareShortLinksPersistence();
  return record;
}

function resolveRequestBaseUrl(req: any): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.get("host") || "");
  const protocol = forwardedProto || req.protocol || "http";
  return `${protocol}://${host}`;
}

function normalizeBaseUrl(input: unknown): string {
  const text = String(input || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function resolveShortLinkBaseUrl(req: any): string {
  const custom = normalizeBaseUrl(process.env.SHARE_SHORT_BASE_URL);
  if (custom) return custom;
  return resolveRequestBaseUrl(req);
}

function buildShortLinkPath(slug: string): string {
  if (SHORT_LINK_PATH_PREFIX) {
    return `/${SHORT_LINK_PATH_PREFIX}/${slug}`;
  }
  return `/${slug}`;
}

function toShortDisplayUrl(shortUrl: string): string {
  const withoutProtocol = shortUrl.replace(/^https?:\/\//i, "");
  if (withoutProtocol.length <= SHORT_LINK_DISPLAY_MAX_LENGTH) return withoutProtocol;
  const head = withoutProtocol.slice(0, 12);
  const tail = withoutProtocol.slice(-5);
  return `${head}...${tail}`;
}

function createDraftOpsCounters(): DraftOpsCounters {
  return {
    requests: 0,
    success: 0,
    retries: 0,
    fallbackRecoveries: 0,
    parseFailures: 0,
    schemaBlocks: 0,
    similarityBlocks: 0,
    complianceBlocks: 0,
    modelEmpty: 0,
  };
}

function createAiNewsOpsCounters(): AiNewsOpsCounters {
  return {
    requests: 0,
    success: 0,
    fallbackRecoveries: 0,
    parseFailures: 0,
    qualityBlocks: 0,
    modelEmpty: 0,
    rssFallbacks: 0,
  };
}

const draftOpsMetrics: {
  promptVersion: string;
  startedAt: string;
  updatedAt: string;
  totals: DraftOpsCounters;
  byMode: Record<DraftMode, DraftOpsCounters>;
} = {
  promptVersion: DRAFT_PROMPT_VERSION,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  totals: createDraftOpsCounters(),
  byMode: {
    draft: createDraftOpsCounters(),
    "interactive-longform": createDraftOpsCounters(),
  },
};

const aiNewsOpsMetrics: {
  version: string;
  startedAt: string;
  updatedAt: string;
  totals: AiNewsOpsCounters;
  byEmotion: Record<EmotionType, AiNewsOpsCounters>;
} = {
  version: "emotion_mapping_v3_2026_02_23",
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  totals: createAiNewsOpsCounters(),
  byEmotion: {
    vibrance: createAiNewsOpsCounters(),
    immersion: createAiNewsOpsCounters(),
    clarity: createAiNewsOpsCounters(),
    gravity: createAiNewsOpsCounters(),
    serenity: createAiNewsOpsCounters(),
    spectrum: createAiNewsOpsCounters(),
  },
};

function resetDraftOpsMetricsCounters(): void {
  draftOpsMetrics.totals = createDraftOpsCounters();
  draftOpsMetrics.byMode = {
    draft: createDraftOpsCounters(),
    "interactive-longform": createDraftOpsCounters(),
  };
}

function resetAiNewsOpsMetricsCounters(): void {
  aiNewsOpsMetrics.totals = createAiNewsOpsCounters();
  aiNewsOpsMetrics.byEmotion = {
    vibrance: createAiNewsOpsCounters(),
    immersion: createAiNewsOpsCounters(),
    clarity: createAiNewsOpsCounters(),
    gravity: createAiNewsOpsCounters(),
    serenity: createAiNewsOpsCounters(),
    spectrum: createAiNewsOpsCounters(),
  };
}

function isDraftModeValue(value: unknown): value is DraftMode {
  return value === "draft" || value === "interactive-longform";
}

function isDraftCounterKey(value: unknown): value is keyof DraftOpsCounters {
  return Object.prototype.hasOwnProperty.call(createDraftOpsCounters(), String(value));
}

function persistDraftMetricEvent(mode: DraftMode, key: keyof DraftOpsCounters, meta?: Record<string, unknown>): void {
  const payload = {
    mode,
    key,
    promptVersion: DRAFT_PROMPT_VERSION,
    ts: new Date().toISOString(),
    meta: meta || {},
  };
  void storage.createAdminActionLog({
    actorId: "system",
    actorRole: "system",
    action: AI_DRAFT_METRIC_ACTION,
    targetType: "ai_draft",
    targetId: `${mode}:${key}`,
    detail: JSON.stringify(payload),
  }).catch((error) => {
    console.warn("[AI_DRAFT_METRIC] failed to persist DB log:", error);
  });
}

function trackDraftMetric(mode: DraftMode, key: keyof DraftOpsCounters, meta?: Record<string, unknown>) {
  draftOpsMetrics.totals[key] += 1;
  draftOpsMetrics.byMode[mode][key] += 1;
  draftOpsMetrics.updatedAt = new Date().toISOString();
  persistDraftMetricEvent(mode, key, meta);
  scheduleDraftOpsPersistence();
  console.info("[AI_DRAFT_METRIC]", { mode, key, ...meta });
}

function getDraftOpsSnapshot(): DraftOpsSnapshot {
  return {
    promptVersion: draftOpsMetrics.promptVersion,
    startedAt: draftOpsMetrics.startedAt,
    updatedAt: draftOpsMetrics.updatedAt,
    persistence: {
      mode: "file",
      hydrated: draftOpsHydrated,
    },
    totals: { ...draftOpsMetrics.totals },
    byMode: {
      draft: { ...draftOpsMetrics.byMode.draft },
      "interactive-longform": { ...draftOpsMetrics.byMode["interactive-longform"] },
    },
  };
}

function normalizeDraftOpsCounters(raw: any): DraftOpsCounters {
  const base = createDraftOpsCounters();
  const keys = Object.keys(base) as Array<keyof DraftOpsCounters>;
  for (const key of keys) {
    const value = Number(raw?.[key] ?? 0);
    base[key] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }
  return base;
}

function normalizeAiNewsOpsCounters(raw: any): AiNewsOpsCounters {
  const base = createAiNewsOpsCounters();
  const keys = Object.keys(base) as Array<keyof AiNewsOpsCounters>;
  for (const key of keys) {
    const value = Number(raw?.[key] ?? 0);
    base[key] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }
  return base;
}

async function persistDraftOpsMetrics(): Promise<void> {
  try {
    await mkdir(path.dirname(AI_DRAFT_OPS_METRICS_PATH), { recursive: true });
    await writeFile(AI_DRAFT_OPS_METRICS_PATH, JSON.stringify(getDraftOpsSnapshot(), null, 2), "utf8");
  } catch (error) {
    console.warn("[AI_DRAFT_METRIC] failed to persist metrics:", error);
  }
}

function scheduleDraftOpsPersistence(): void {
  if (draftOpsPersistScheduled) return;
  draftOpsPersistScheduled = true;
  setTimeout(() => {
    draftOpsPersistScheduled = false;
    void persistDraftOpsMetrics();
  }, 350);
}

async function persistAiNewsOpsMetrics(): Promise<void> {
  try {
    await mkdir(path.dirname(AI_NEWS_OPS_METRICS_PATH), { recursive: true });
    await writeFile(AI_NEWS_OPS_METRICS_PATH, JSON.stringify(getAiNewsOpsSnapshot(), null, 2), "utf8");
  } catch (error) {
    console.warn("[AI_NEWS_METRIC] failed to persist metrics:", error);
  }
}

function scheduleAiNewsOpsPersistence(): void {
  if (aiNewsOpsPersistScheduled) return;
  aiNewsOpsPersistScheduled = true;
  setTimeout(() => {
    aiNewsOpsPersistScheduled = false;
    void persistAiNewsOpsMetrics();
  }, 350);
}

type AiNewsCompareLogEntry = {
  ts: string;
  emotion: EmotionType;
  model: string;
  status: "success" | "blocked" | "fallback" | "error";
  reasonCode?: string;
  latencyMs?: number;
  keywords: string[];
  selectedIssueCount: number;
  issueFetches: Array<{
    keyword: string;
    fallbackUsed: boolean;
    diagnostics?: string;
  }>;
};

async function appendAiNewsCompareLog(entry: AiNewsCompareLogEntry): Promise<void> {
  try {
    await mkdir(path.dirname(AI_NEWS_COMPARE_LOG_PATH), { recursive: true });
    await appendFile(AI_NEWS_COMPARE_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.warn("[AI_NEWS_COMPARE_LOG] append failed:", error);
  }
}

type AiNewsParseFailLogEntry = {
  ts: string;
  emotion: EmotionType;
  model: string;
  reasonCode: string;
  latencyMs?: number;
  promptPreview: string;
  modelTextPreview: string;
  repairedTextPreview?: string;
};

async function appendAiNewsParseFailLog(entry: AiNewsParseFailLogEntry): Promise<void> {
  try {
    await mkdir(path.dirname(AI_NEWS_PARSE_FAIL_LOG_PATH), { recursive: true });
    await appendFile(AI_NEWS_PARSE_FAIL_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.warn("[AI_NEWS_PARSE_FAIL_LOG] append failed:", error);
  }
}

async function hydrateDraftOpsMetrics(): Promise<void> {
  if (draftOpsHydrated) return;
  draftOpsHydrated = true;

  let loadedFromDb = false;
  try {
    const logs = await storage.getAdminActionLogs(10000);
    const metricLogs = (logs || []).filter((log) => String(log?.action || "") === AI_DRAFT_METRIC_ACTION);
    if (metricLogs.length > 0) {
      resetDraftOpsMetricsCounters();
      const sorted = [...metricLogs].sort(
        (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      );
      for (const log of sorted) {
        let parsed: any = null;
        try {
          parsed = log?.detail ? JSON.parse(String(log.detail)) : null;
        } catch {
          parsed = null;
        }
        const mode = parsed?.mode;
        const key = parsed?.key;
        if (!isDraftModeValue(mode) || !isDraftCounterKey(key)) continue;
        draftOpsMetrics.byMode[mode][key] += 1;
        draftOpsMetrics.totals[key] += 1;
      }

      draftOpsMetrics.startedAt = new Date(sorted[0]?.createdAt || new Date()).toISOString();
      draftOpsMetrics.updatedAt = new Date(sorted[sorted.length - 1]?.createdAt || new Date()).toISOString();
      loadedFromDb = true;
      console.info("[AI_DRAFT_METRIC] hydrated from DB logs", {
        count: metricLogs.length,
        startedAt: draftOpsMetrics.startedAt,
        updatedAt: draftOpsMetrics.updatedAt,
      });
    }
  } catch (error) {
    console.warn("[AI_DRAFT_METRIC] failed DB hydration:", error);
  }

  if (loadedFromDb) return;

  try {
    const raw = await readFile(AI_DRAFT_OPS_METRICS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    draftOpsMetrics.startedAt = String(parsed?.startedAt || draftOpsMetrics.startedAt);
    draftOpsMetrics.updatedAt = String(parsed?.updatedAt || draftOpsMetrics.updatedAt);
    draftOpsMetrics.totals = normalizeDraftOpsCounters(parsed?.totals);
    draftOpsMetrics.byMode = {
      draft: normalizeDraftOpsCounters(parsed?.byMode?.draft),
      "interactive-longform": normalizeDraftOpsCounters(parsed?.byMode?.["interactive-longform"]),
    };
    console.info("[AI_DRAFT_METRIC] hydrated from file", {
      path: AI_DRAFT_OPS_METRICS_PATH,
      updatedAt: draftOpsMetrics.updatedAt,
    });
  } catch {
    // first run or unreadable file: keep defaults
  }
}

async function hydrateAiNewsOpsMetrics(): Promise<void> {
  if (aiNewsOpsHydrated) return;
  aiNewsOpsHydrated = true;
  try {
    const raw = await readFile(AI_NEWS_OPS_METRICS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    resetAiNewsOpsMetricsCounters();
    aiNewsOpsMetrics.startedAt = String(parsed?.startedAt || aiNewsOpsMetrics.startedAt);
    aiNewsOpsMetrics.updatedAt = String(parsed?.updatedAt || aiNewsOpsMetrics.updatedAt);
    aiNewsOpsMetrics.totals = normalizeAiNewsOpsCounters(parsed?.totals);
    aiNewsOpsMetrics.byEmotion = {
      vibrance: normalizeAiNewsOpsCounters(parsed?.byEmotion?.vibrance),
      immersion: normalizeAiNewsOpsCounters(parsed?.byEmotion?.immersion),
      clarity: normalizeAiNewsOpsCounters(parsed?.byEmotion?.clarity),
      gravity: normalizeAiNewsOpsCounters(parsed?.byEmotion?.gravity),
      serenity: normalizeAiNewsOpsCounters(parsed?.byEmotion?.serenity),
      spectrum: normalizeAiNewsOpsCounters(parsed?.byEmotion?.spectrum),
    };
    console.info("[AI_NEWS_METRIC] hydrated from file", {
      path: AI_NEWS_OPS_METRICS_PATH,
      updatedAt: aiNewsOpsMetrics.updatedAt,
    });
  } catch {
    // first run or unreadable file: keep defaults
  }
}

type AiDraftGateSettings = {
  titleMaxLength: number;
  draftTargetChars: number;
  draftMaxChars: number;
  draftMediaSlotsMin: number;
  draftMediaSlotsMax: number;
  longformMinSentences: number;
  longformMediaSlotsMin: number;
  longformMediaSlotsMax: number;
  similarityTitleOverlapThreshold: number;
  similarityLexicalOverlapThreshold: number;
  similarityStructureOverlapThreshold: number;
  similarityCombinedThreshold: number;
};

type AiDraftGateSettingsSnapshot = {
  promptVersion: string;
  source: "env" | "admin";
  updatedAt: string;
  hydrated: boolean;
  values: AiDraftGateSettings;
};

const AI_DRAFT_SETTINGS_ACTION = "ai_draft_settings_v1";
const AI_NEWS_SETTINGS_ACTION = "ai_news_settings_v1";

type AiNewsSettings = {
  modelTimeoutMs: number;
};

type AiNewsSettingsSnapshot = {
  source: "env" | "admin";
  updatedAt: string;
  hydrated: boolean;
  values: AiNewsSettings;
};

function readEnvNumber(name: string, fallback: number, min: number, max: number, precision: number = 0): number {
  const raw = Number(process.env[name] ?? fallback);
  const safe = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
  const factor = Math.pow(10, precision);
  return Math.round(safe * factor) / factor;
}

function normalizeAiDraftGateSettings(raw: Partial<AiDraftGateSettings>): AiDraftGateSettings {
  const merged: AiDraftGateSettings = {
    titleMaxLength: readEnvNumber("AI_DRAFT_TITLE_MAX_LENGTH", 60, 30, 140, 0),
    draftTargetChars: readEnvNumber("AI_DRAFT_DRAFT_TARGET_CHARS", 500, 120, 1200, 0),
    draftMaxChars: readEnvNumber("AI_DRAFT_DRAFT_MAX_CHARS", 650, 150, 1600, 0),
    draftMediaSlotsMin: readEnvNumber("AI_DRAFT_DRAFT_MEDIA_MIN", 1, 1, 5, 0),
    draftMediaSlotsMax: readEnvNumber("AI_DRAFT_DRAFT_MEDIA_MAX", 3, 1, 6, 0),
    longformMinSentences: readEnvNumber("AI_DRAFT_LONGFORM_MIN_SENTENCES", 15, 5, 40, 0),
    longformMediaSlotsMin: readEnvNumber("AI_DRAFT_LONGFORM_MEDIA_MIN", 3, 1, 6, 0),
    longformMediaSlotsMax: readEnvNumber("AI_DRAFT_LONGFORM_MEDIA_MAX", 5, 1, 8, 0),
    similarityTitleOverlapThreshold: readEnvNumber("AI_DRAFT_SIM_TITLE_OVERLAP_THRESHOLD", 0.52, 0.1, 1, 3),
    similarityLexicalOverlapThreshold: readEnvNumber("AI_DRAFT_SIM_LEXICAL_OVERLAP_THRESHOLD", 0.38, 0.05, 1, 3),
    similarityStructureOverlapThreshold: readEnvNumber("AI_DRAFT_SIM_STRUCTURE_OVERLAP_THRESHOLD", 0.5, 0.05, 1, 3),
    similarityCombinedThreshold: readEnvNumber("AI_DRAFT_SIM_COMBINED_THRESHOLD", 0.44, 0.05, 1, 3),
    ...raw,
  };

  merged.titleMaxLength = Math.max(30, Math.floor(merged.titleMaxLength));
  merged.draftTargetChars = Math.max(120, Math.floor(merged.draftTargetChars));
  merged.draftMaxChars = Math.max(150, Math.floor(merged.draftMaxChars));
  merged.draftMediaSlotsMin = Math.max(1, Math.floor(merged.draftMediaSlotsMin));
  merged.draftMediaSlotsMax = Math.max(merged.draftMediaSlotsMin, Math.floor(merged.draftMediaSlotsMax));
  merged.longformMinSentences = Math.max(5, Math.floor(merged.longformMinSentences));
  merged.longformMediaSlotsMin = Math.max(1, Math.floor(merged.longformMediaSlotsMin));
  merged.longformMediaSlotsMax = Math.max(merged.longformMediaSlotsMin, Math.floor(merged.longformMediaSlotsMax));
  merged.draftTargetChars = Math.min(merged.draftTargetChars, merged.draftMaxChars);

  return merged;
}

function normalizeAiNewsSettings(raw: Partial<AiNewsSettings>): AiNewsSettings {
  const merged: AiNewsSettings = {
    modelTimeoutMs: readEnvNumber("AI_NEWS_MODEL_TIMEOUT_MS", 36000, 8000, 45000, 0),
    ...raw,
  };
  merged.modelTimeoutMs = Math.max(8000, Math.min(45000, Math.floor(merged.modelTimeoutMs)));
  return merged;
}

const aiDraftGateSettingsFieldSpecs: Record<keyof AiDraftGateSettings, { min: number; max: number; precision: number }> = {
  titleMaxLength: { min: 30, max: 140, precision: 0 },
  draftTargetChars: { min: 120, max: 1200, precision: 0 },
  draftMaxChars: { min: 150, max: 1600, precision: 0 },
  draftMediaSlotsMin: { min: 1, max: 5, precision: 0 },
  draftMediaSlotsMax: { min: 1, max: 6, precision: 0 },
  longformMinSentences: { min: 5, max: 40, precision: 0 },
  longformMediaSlotsMin: { min: 1, max: 6, precision: 0 },
  longformMediaSlotsMax: { min: 1, max: 8, precision: 0 },
  similarityTitleOverlapThreshold: { min: 0.1, max: 1, precision: 3 },
  similarityLexicalOverlapThreshold: { min: 0.05, max: 1, precision: 3 },
  similarityStructureOverlapThreshold: { min: 0.05, max: 1, precision: 3 },
  similarityCombinedThreshold: { min: 0.05, max: 1, precision: 3 },
};

const aiDraftGateSettingsDefaults = normalizeAiDraftGateSettings({});
let aiDraftGateSettings: AiDraftGateSettings = { ...aiDraftGateSettingsDefaults };
let aiDraftGateSettingsSource: "env" | "admin" = "env";
let aiDraftGateSettingsUpdatedAt = new Date().toISOString();
let aiDraftGateSettingsHydrated = false;
const aiNewsSettingsDefaults = normalizeAiNewsSettings({});
let aiNewsSettings: AiNewsSettings = { ...aiNewsSettingsDefaults };
let aiNewsSettingsSource: "env" | "admin" = "env";
let aiNewsSettingsUpdatedAt = new Date().toISOString();
let aiNewsSettingsHydrated = false;

function getAiDraftGateSettingsSnapshot(): AiDraftGateSettingsSnapshot {
  return {
    promptVersion: DRAFT_PROMPT_VERSION,
    source: aiDraftGateSettingsSource,
    updatedAt: aiDraftGateSettingsUpdatedAt,
    hydrated: aiDraftGateSettingsHydrated,
    values: { ...aiDraftGateSettings },
  };
}

function getAiNewsSettingsSnapshot(): AiNewsSettingsSnapshot {
  return {
    source: aiNewsSettingsSource,
    updatedAt: aiNewsSettingsUpdatedAt,
    hydrated: aiNewsSettingsHydrated,
    values: { ...aiNewsSettings },
  };
}

function trackAiNewsMetric(
  emotion: EmotionType,
  key: keyof AiNewsOpsCounters,
  amount: number = 1,
): void {
  if (amount <= 0) return;
  aiNewsOpsMetrics.totals[key] += amount;
  aiNewsOpsMetrics.byEmotion[emotion][key] += amount;
  aiNewsOpsMetrics.updatedAt = new Date().toISOString();
  scheduleAiNewsOpsPersistence();
}

function getAiNewsOpsSnapshot(): AiNewsOpsSnapshot {
  return {
    version: aiNewsOpsMetrics.version,
    startedAt: aiNewsOpsMetrics.startedAt,
    updatedAt: aiNewsOpsMetrics.updatedAt,
    persistence: {
      mode: "file",
      hydrated: aiNewsOpsHydrated,
    },
    totals: { ...aiNewsOpsMetrics.totals },
    byEmotion: {
      vibrance: { ...aiNewsOpsMetrics.byEmotion.vibrance },
      immersion: { ...aiNewsOpsMetrics.byEmotion.immersion },
      clarity: { ...aiNewsOpsMetrics.byEmotion.clarity },
      gravity: { ...aiNewsOpsMetrics.byEmotion.gravity },
      serenity: { ...aiNewsOpsMetrics.byEmotion.serenity },
      spectrum: { ...aiNewsOpsMetrics.byEmotion.spectrum },
    },
  };
}

function parseAiDraftGateSettingsPatch(input: any): {
  patch: Partial<AiDraftGateSettings>;
  errors: string[];
} {
  const errors: string[] = [];
  const patch: Partial<AiDraftGateSettings> = {};
  const source = input && typeof input === "object" && input.settings && typeof input.settings === "object"
    ? input.settings
    : input;
  if (!source || typeof source !== "object") {
    return { patch, errors: ["settings object is required"] };
  }

  for (const key of Object.keys(aiDraftGateSettingsFieldSpecs) as Array<keyof AiDraftGateSettings>) {
    if (source[key] === undefined) continue;
    const spec = aiDraftGateSettingsFieldSpecs[key];
    const raw = Number(source[key]);
    if (!Number.isFinite(raw)) {
      errors.push(`${key} must be a finite number`);
      continue;
    }
    if (raw < spec.min || raw > spec.max) {
      errors.push(`${key} must be between ${spec.min} and ${spec.max}`);
      continue;
    }
    const factor = Math.pow(10, spec.precision);
    patch[key] = (Math.round(raw * factor) / factor) as never;
  }

  return { patch, errors };
}

function parseAiNewsSettingsPatch(input: any): {
  patch: Partial<AiNewsSettings>;
  errors: string[];
} {
  const patch: Partial<AiNewsSettings> = {};
  const errors: string[] = [];
  const source = input && typeof input === "object" && input.settings && typeof input.settings === "object"
    ? input.settings
    : input;
  if (!source || typeof source !== "object") {
    return { patch, errors: ["settings object is required"] };
  }
  if (source.modelTimeoutMs !== undefined) {
    const value = Number(source.modelTimeoutMs);
    if (!Number.isFinite(value)) {
      errors.push("modelTimeoutMs must be a finite number");
    } else if (value < 8000 || value > 45000) {
      errors.push("modelTimeoutMs must be between 8000 and 45000");
    } else {
      patch.modelTimeoutMs = Math.floor(value);
    }
  }
  return { patch, errors };
}

function applyAiDraftGateSettingsPatch(patch: Partial<AiDraftGateSettings>, source: "env" | "admin"): void {
  aiDraftGateSettings = normalizeAiDraftGateSettings({ ...aiDraftGateSettings, ...patch });
  aiDraftGateSettingsSource = source;
  aiDraftGateSettingsUpdatedAt = new Date().toISOString();
}

function applyAiNewsSettingsPatch(patch: Partial<AiNewsSettings>, source: "env" | "admin"): void {
  aiNewsSettings = normalizeAiNewsSettings({ ...aiNewsSettings, ...patch });
  aiNewsSettingsSource = source;
  aiNewsSettingsUpdatedAt = new Date().toISOString();
}

async function hydrateAiDraftGateSettings(): Promise<void> {
  if (aiDraftGateSettingsHydrated) return;
  aiDraftGateSettingsHydrated = true;
  try {
    const logs = await storage.getAdminActionLogs(500);
    const latest = (logs || [])
      .filter((log) => String(log?.action || "") === AI_DRAFT_SETTINGS_ACTION)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
    if (!latest?.detail) return;

    let parsed: any = null;
    try {
      parsed = JSON.parse(String(latest.detail || "{}"));
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object") return;

    const rawSettings = parsed?.settings && typeof parsed.settings === "object" ? parsed.settings : parsed;
    const { patch, errors } = parseAiDraftGateSettingsPatch(rawSettings);
    if (errors.length > 0) return;
    applyAiDraftGateSettingsPatch(patch, "admin");
    aiDraftGateSettingsUpdatedAt = new Date(latest.createdAt || aiDraftGateSettingsUpdatedAt).toISOString();
    console.info("[AI_DRAFT_SETTINGS] hydrated from admin logs", { updatedAt: aiDraftGateSettingsUpdatedAt });
  } catch (error) {
    console.warn("[AI_DRAFT_SETTINGS] failed hydration:", error);
  }
}

async function hydrateAiNewsSettings(): Promise<void> {
  if (aiNewsSettingsHydrated) return;
  aiNewsSettingsHydrated = true;
  try {
    const logs = await storage.getAdminActionLogs(500);
    const latest = (logs || [])
      .filter((log) => String(log?.action || "") === AI_NEWS_SETTINGS_ACTION)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
    if (!latest?.detail) return;

    let parsed: any = null;
    try {
      parsed = JSON.parse(String(latest.detail || "{}"));
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object") return;

    const rawSettings = parsed?.settings && typeof parsed.settings === "object" ? parsed.settings : parsed;
    const { patch, errors } = parseAiNewsSettingsPatch(rawSettings);
    if (errors.length > 0) return;
    applyAiNewsSettingsPatch(patch, "admin");
    aiNewsSettingsUpdatedAt = new Date(latest.createdAt || aiNewsSettingsUpdatedAt).toISOString();
    console.info("[AI_NEWS_SETTINGS] hydrated from admin logs", { updatedAt: aiNewsSettingsUpdatedAt });
  } catch (error) {
    console.warn("[AI_NEWS_SETTINGS] failed hydration:", error);
  }
}

type DraftSimilarityIssue = {
  type: "headline_overlap" | "headline_exact_match" | "structure_overlap";
  score: number;
  threshold: number;
  message: string;
};

function normalizeSimilarityText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^\w가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSimilarity(input: string): string[] {
  return normalizeSimilarityText(input)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function jaccardSimilarity(leftTokens: string[], rightTokens: string[]): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) intersection += 1;
  });
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function sentenceSignatures(input: string, limit: number): string[] {
  return String(input || "")
    .split(/[.!?。！？\n]+/)
    .map((line) => normalizeSimilarityText(line).replace(/\s+/g, ""))
    .filter((line) => line.length >= 8)
    .slice(0, limit)
    .map((line) => line.slice(0, 14));
}

function overlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  let matched = 0;
  for (const value of left) {
    if (rightSet.has(value)) matched += 1;
  }
  return matched / Math.min(left.length, right.length);
}

function evaluateDraftSimilarity(input: {
  selectedArticle: { title: string; summary: string } | null;
  generatedTitle: string;
  generatedContent: string;
}): DraftSimilarityIssue[] {
  const selected = input.selectedArticle;
  if (!selected) return [];

  const refTitle = String(selected.title || "").trim();
  const refSummary = String(selected.summary || "").trim();
  if (!refTitle && !refSummary) return [];

  const issues: DraftSimilarityIssue[] = [];
  const normalizedRefTitle = normalizeSimilarityText(refTitle);
  const normalizedGeneratedTitle = normalizeSimilarityText(input.generatedTitle);

  if (normalizedRefTitle && normalizedGeneratedTitle && normalizedRefTitle === normalizedGeneratedTitle) {
    issues.push({
      type: "headline_exact_match",
      score: 1,
      threshold: 1,
      message: "생성 제목이 참고 기사 제목과 동일합니다.",
    });
  }

  const titleOverlap = jaccardSimilarity(
    tokenizeSimilarity(input.generatedTitle),
    tokenizeSimilarity(refTitle),
  );
  if (titleOverlap >= aiDraftGateSettings.similarityTitleOverlapThreshold) {
    issues.push({
      type: "headline_overlap",
      score: Number(titleOverlap.toFixed(3)),
      threshold: aiDraftGateSettings.similarityTitleOverlapThreshold,
      message: "생성 제목의 어휘가 참고 기사 제목과 과도하게 겹칩니다.",
    });
  }

  if (hasLongCopiedSpan(refTitle, input.generatedTitle, 10)) {
    issues.push({
      type: "headline_overlap",
      score: 1,
      threshold: 1,
      message: "생성 제목이 참고 기사 제목 문구를 그대로 재사용했습니다.",
    });
  }

  const generatedLead = String(input.generatedContent || "")
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
  const refComposite = [refTitle, refSummary].filter(Boolean).join("\n");

  const lexicalOverlap = jaccardSimilarity(
    tokenizeSimilarity(generatedLead),
    tokenizeSimilarity(refComposite),
  );
  const structureOverlap = overlapRatio(
    sentenceSignatures(generatedLead, 6),
    sentenceSignatures(refComposite, 4),
  );

  const score = Number(((lexicalOverlap + structureOverlap) / 2).toFixed(3));
  if (
    lexicalOverlap >= aiDraftGateSettings.similarityLexicalOverlapThreshold &&
    structureOverlap >= aiDraftGateSettings.similarityStructureOverlapThreshold &&
    score >= aiDraftGateSettings.similarityCombinedThreshold
  ) {
    issues.push({
      type: "structure_overlap",
      score,
      threshold: aiDraftGateSettings.similarityCombinedThreshold,
      message: "도입 문단의 어휘/문장 전개가 참고 기사와 유사합니다.",
    });
  }

  if (
    hasLongCopiedSpan(refTitle, input.generatedContent, 16) ||
    hasLongCopiedSpan(refSummary, input.generatedContent, 24)
  ) {
    issues.push({
      type: "structure_overlap",
      score: 1,
      threshold: 1,
      message: "생성 본문이 참고 기사 문장을 그대로 재사용했습니다.",
    });
  }

  return issues;
}

function countKoreanSentenceUnits(content: string): number {
  return content
    .split(/[.!?。！？\n]+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function validateDraftByMode(input: {
  mode: DraftMode;
  title: string;
  content: string;
  sections: { core: string; deepDive: string; conclusion: string };
  mediaSlotsCount: number;
}): DraftSchemaIssue[] {
  const issues: DraftSchemaIssue[] = [];

  if (!input.title.trim()) issues.push({ field: "title", message: "제목이 비어 있습니다." });
  if (input.title.trim().length > aiDraftGateSettings.titleMaxLength) {
    issues.push({
      field: "title",
      message: `제목이 ${aiDraftGateSettings.titleMaxLength}자를 초과했습니다. 더 간결하게 생성하세요.`,
    });
  }
  if (!input.content.trim()) issues.push({ field: "content", message: "본문이 비어 있습니다." });

  if (!input.sections.core.trim()) issues.push({ field: "sections.core", message: "핵심 섹션이 비어 있습니다." });
  if (!input.sections.deepDive.trim()) issues.push({ field: "sections.deepDive", message: "심화 섹션이 비어 있습니다." });
  if (!input.sections.conclusion.trim()) issues.push({ field: "sections.conclusion", message: "결론 섹션이 비어 있습니다." });

  if (input.mode === "draft") {
    if (input.content.length > aiDraftGateSettings.draftMaxChars) {
      issues.push({
        field: "content",
        message: `빠른 기사 작성 모드 분량을 초과했습니다. (목표 ${aiDraftGateSettings.draftTargetChars}자, 허용 상한 ${aiDraftGateSettings.draftMaxChars}자)`,
      });
    }
    if (
      input.mediaSlotsCount < aiDraftGateSettings.draftMediaSlotsMin ||
      input.mediaSlotsCount > aiDraftGateSettings.draftMediaSlotsMax
    ) {
      issues.push({
        field: "mediaSlots",
        message: `빠른 기사 작성 모드의 미디어 슬롯은 ${aiDraftGateSettings.draftMediaSlotsMin}~${aiDraftGateSettings.draftMediaSlotsMax}개여야 합니다.`,
      });
    }
    return issues;
  }

  const sentenceUnits = countKoreanSentenceUnits(input.content);
  if (sentenceUnits < aiDraftGateSettings.longformMinSentences) {
    issues.push({
      field: "content",
      message: `인터랙티브 롱폼 모드는 최소 ${aiDraftGateSettings.longformMinSentences}문장 이상이어야 합니다.`,
    });
  }
  if (
    input.mediaSlotsCount < aiDraftGateSettings.longformMediaSlotsMin ||
    input.mediaSlotsCount > aiDraftGateSettings.longformMediaSlotsMax
  ) {
    issues.push({
      field: "mediaSlots",
      message: `인터랙티브 롱폼 모드의 미디어 슬롯은 ${aiDraftGateSettings.longformMediaSlotsMin}~${aiDraftGateSettings.longformMediaSlotsMax}개여야 합니다.`,
    });
  }
  return issues;
}

function mapValidationErrorToIssue(error: string): StorySpecValidationIssue {
  if (error.includes("specVersion")) {
    return {
      reason: error,
      location: "specVersion",
      recovery: "Set specVersion to interactive-generation.v1.",
    };
  }
  if (error.includes("storyBlocks")) {
    return {
      reason: error,
      location: "storyBlocks",
      recovery: "Provide at least 5 blocks with required intents.",
    };
  }
  if (error.includes("Missing required intent")) {
    return {
      reason: error,
      location: "storyBlocks[].intent",
      recovery: "Include intro/context/tension/interpretation/closure intents once or more.",
    };
  }
  if (error.includes("scrollMap")) {
    return {
      reason: error,
      location: "scrollMap",
      recovery: "Align scrollMap with storyBlocks and ensure contiguous 0..100 ranges without gaps/overlap.",
    };
  }
  if (error.includes("highlights")) {
    return {
      reason: error,
      location: "highlights",
      recovery: "Add at least one highlight and ensure each highlight.blockId exists in storyBlocks.",
    };
  }
  if (error.includes("interactionHints")) {
    return {
      reason: error,
      location: "interactionHints",
      recovery: "Ensure every interactionHints.blockId matches an existing story block id.",
    };
  }
  return {
    reason: error,
    location: "unknown",
    recovery: "Rebuild Story Spec JSON using story_spec_v1.json and re-submit.",
  };
}

function buildValidationReport(errors: string[], source: "validation" | "parse"): StorySpecValidationReport {
  return {
    valid: errors.length === 0,
    source,
    issues: errors.map(mapValidationErrorToIssue),
  };
}

type ChatIntent = "anxiety_relief" | "anger_release" | "sadness_lift" | "focus_clarity" | "balance_general";
type ComplianceSeverity = "low" | "medium" | "high";
type ComplianceFlag = {
  category: "privacy" | "defamation" | "medical" | "financial" | "violent" | "factual";
  severity: ComplianceSeverity;
  reason: string;
  suggestion: string;
  evidenceSnippet?: string;
};

type ComplianceAssessment = {
  riskLevel: ComplianceSeverity;
  flags: ComplianceFlag[];
  summary: string;
  publishBlocked: boolean;
};

let geminiClientCache: GoogleGenerativeAI | null | undefined = undefined;

function getGeminiClient(): GoogleGenerativeAI | null {
  if (geminiClientCache !== undefined) return geminiClientCache;
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    geminiClientCache = null;
    return null;
  }
  geminiClientCache = new GoogleGenerativeAI(apiKey);
  return geminiClientCache;
}

function parseJsonFromModelText<T>(raw: string): T | null {
  if (!raw?.trim()) return null;
  const cleaned = raw.trim();
  const candidates: string[] = [];

  // 1) Raw body
  candidates.push(cleaned);

  // 2) Fenced json block
  const fenced = cleaned.match(/```json\s*([\s\S]*?)\s*```/i) || cleaned.match(/```\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  // 3) First object-like substring
  const firstObj = cleaned.indexOf("{");
  const lastObj = cleaned.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    candidates.push(cleaned.slice(firstObj, lastObj + 1).trim());
  }

  // 4) First array-like substring
  const firstArr = cleaned.indexOf("[");
  const lastArr = cleaned.lastIndexOf("]");
  if (firstArr >= 0 && lastArr > firstArr) {
    candidates.push(cleaned.slice(firstArr, lastArr + 1).trim());
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      try {
        const repaired = candidate
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/[“”]/g, "\"")
          .replace(/[‘’]/g, "'");
        return JSON.parse(repaired) as T;
      } catch {
        // continue
      }
    }
  }

  return null;
}

const FIXED_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image-002";
const GEMINI_IMAGE_MODEL_FALLBACKS = [
  FIXED_GEMINI_IMAGE_MODEL,
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-001",
] as const;

function buildNarrativeImagePrompts(articleContent: string, count: number, customPrompt?: string): string[] {
  const cleaned = String(articleContent || "")
    .replace(/\[출처\][\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const paragraphs = String(articleContent || "")
    .split(/\n{2,}/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const lead = paragraphs[0] || cleaned.slice(0, 220) || "기사 핵심 이슈";
  const middle = paragraphs[Math.floor(paragraphs.length / 2)] || cleaned.slice(220, 460) || lead;
  const tail = paragraphs[paragraphs.length - 1] || cleaned.slice(460, 700) || middle;

  const flowAnchors = [
    { label: "도입", text: lead, guidance: "기사 첫 장면. 핵심 사건이 직관적으로 보이게" },
    { label: "배경", text: middle, guidance: "핵심 배경과 이해관계가 드러나는 맥락 장면" },
    { label: "영향", text: middle, guidance: "사회/산업/정책에 미치는 파급효과를 시각화" },
    { label: "결론", text: tail, guidance: "다음 변화와 전망을 암시하는 마무리 장면" },
  ];

  const styleDirective = customPrompt?.trim()
    ? customPrompt.trim()
    : "Editorial news visual, realistic tone, fact-based scene, no fantasy exaggeration";

  return Array.from({ length: count }).map((_, idx) => {
    const anchor = flowAnchors[Math.min(idx, flowAnchors.length - 1)];
    const promptPayload = {
      version: "news-image-v1",
      language: "en",
      task: "Generate a photorealistic editorial news image",
      scene: {
        stage: anchor.label,
        article_context: anchor.text,
        direction: anchor.guidance,
      },
      style: {
        main: styleDirective,
        camera: "cinematic wide shot",
        color: "natural editorial grade",
      },
      constraints: {
        no_text_overlay: true,
        no_watermark: true,
        no_logo: true,
        aspect_ratio: "16:9",
        minimize_recognizable_faces: true,
        minimize_brand_exposure: true,
      },
      negative_prompt: [
        "text",
        "caption",
        "subtitle",
        "watermark",
        "logo",
        "brand mark",
        "close-up identifiable face",
      ],
      compliance_note: "Must strictly follow: no text/watermark/logo, 16:9 composition, minimal portrait/brand exposure.",
    };
    return JSON.stringify(promptPayload, null, 2);
  });
}

async function generateGeminiImageFromPrompt(
  prompt: string,
  timeoutMs: number = 25000,
  model: string = FIXED_GEMINI_IMAGE_MODEL,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "1K",
          },
        },
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsed?.error?.message || `Gemini image API error (${response.status})`;
    throw new Error(message);
  }

  const parts = parsed?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part: any) => part?.inlineData?.data);
  const mimeType = imagePart?.inlineData?.mimeType || "image/png";
  const data = imagePart?.inlineData?.data;

  if (!data) {
    throw new Error("Gemini image response has no inline image data");
  }

  return `data:${mimeType};base64,${data}`;
}

function extractImageDimensionsFromDataUrl(dataUrl: string): { width: number; height: number } | null {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  const mime = String(match[1] || "").toLowerCase();
  const base64 = match[2] || "";
  if (!base64) return null;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (!bytes || bytes.length < 24) return null;

  // PNG IHDR width/height
  if (mime.includes("png")) {
    const isPngSig = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!isPngSig || bytes.length < 24) return null;
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // JPEG SOF marker scan
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const isStartOfFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if (isStartOfFrame && offset + 8 < bytes.length) {
        const height = bytes.readUInt16BE(offset + 5);
        const width = bytes.readUInt16BE(offset + 7);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if (!Number.isFinite(segmentLength) || segmentLength <= 0) break;
      offset += 2 + segmentLength;
    }
    return null;
  }

  return null;
}

function isSixteenByNineLike(dataUrl: string, tolerance: number = 0.06): boolean {
  const dims = extractImageDimensionsFromDataUrl(dataUrl);
  if (!dims) return false;
  const ratio = dims.width / Math.max(1, dims.height);
  const target = 16 / 9;
  return Math.abs(ratio - target) <= tolerance;
}

function isRetryableImageError(error: unknown): boolean {
  const message = String((error as any)?.message || "").toLowerCase();
  return (
    message.includes("429") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("overloaded") ||
    message.includes("high demand") ||
    message.includes("try again later") ||
    message.includes("resource exhausted") ||
    message.includes("quota") ||
    message.includes("timed out") ||
    message.includes("abort") ||
    message.includes("aspect ratio")
  );
}

async function generateGeminiImageWithRetry(
  prompt: string,
  maxAttempts: number = 3,
): Promise<{ dataUrl: string; model: string }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const timeoutMs = attempt === 1 ? 28000 : 42000;
      let modelError: unknown = null;
      for (const model of GEMINI_IMAGE_MODEL_FALLBACKS) {
        try {
          const imageDataUrl = await generateGeminiImageFromPrompt(prompt, timeoutMs, model);
          return { dataUrl: imageDataUrl, model };
        } catch (error) {
          modelError = error;
          const message = String((error as any)?.message || "").toLowerCase();
          const unsupported =
            message.includes("not found") ||
            message.includes("not supported for generatecontent") ||
            message.includes("model is not found");
          if (!unsupported) {
            // If this is not model-availability issue, still try the next model once.
            continue;
          }
        }
      }
      throw modelError || new Error("image model fallback exhausted");
    } catch (error) {
      lastError = error;
      const retryable = isRetryableImageError(error);
      if (!retryable || attempt === maxAttempts) break;
      const backoffMs = Math.min(2500 * attempt, 6000) + Math.floor(Math.random() * 400);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

async function generateGeminiText(prompt: string): Promise<string | null> {
  const geminiClient = getGeminiClient();
  if (!geminiClient) return null;
  try {
    const geminiTextModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
    const model = geminiClient.getGenerativeModel({ model: geminiTextModel });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const text = result.response.text();
    return text?.trim() || null;
  } catch (error) {
    console.warn("[AI] Gemini text generation failed:", error);
    try {
      const geminiTextModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
      const model = geminiClient.getGenerativeModel({ model: geminiTextModel });
      const retry = await model.generateContent(prompt);
      const text = retry.response.text();
      return text?.trim() || null;
    } catch (retryError) {
      console.warn("[AI] Gemini retry failed:", retryError);
      return null;
    }
  }
}

function normalizeKeywordSeed(raw: string): string {
  const source = String(raw || "");
  const beforeOutline = source.split(/\[outline\]/i)[0] || source;
  const firstLine = beforeOutline.split("\n")[0] || "";
  const cleaned = firstLine
    .replace(/\[.*?\]/g, " ")
    .replace(/\d+[\.\)]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "latest trend";
}

function extractOutlineItems(raw: string): string[] {
  const lines = String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const items = lines
    .filter((line) => /^\d+[\.\)]\s+/.test(line))
    .map((line) => line.replace(/^\d+[\.\)]\s+/, "").trim())
    .filter(Boolean);

  return items.slice(0, 6);
}

function buildKeywordFallback(keyword: string): { topics: string[]; context: string } {
  return {
    topics: [
      `${keyword} 최신 동향`,
      `${keyword} 정책 및 시장 영향`,
      `${keyword} 이해관계자 관점`,
      `${keyword} 위험 요인과 기회`,
      `${keyword} 다음 관전 포인트`,
    ],
    context: `${keyword} 이슈는 정책, 산업, 공공 담론 전반에서 주목받고 있습니다. 기사를 구성할 때는 검증된 사실, 이해관계자 영향, 단기 파급효과를 중심으로 정리하세요.`,
  };
}

function buildOutlineFallback(keyword: string, topics: string[] = []): { outline: string; topics: string[] } {
  const cleanedTopics = topics.filter(Boolean).slice(0, 4);
  const list = cleanedTopics.length > 0
    ? cleanedTopics
    : [
      `${keyword}: 핵심 사실`,
      `${keyword}: 심화 시사점`,
      `${keyword}: 이해관계자 관점`,
      `${keyword}: 결론 및 전망`,
    ];
  const outline = [
    `1. 핵심 쟁점: ${keyword}`,
    ...list.map((topic, idx) => `${idx + 2}. ${topic}`),
    `${list.length + 2}. 결론 및 다음 신호`,
  ].join("\n");
  return { outline, topics: list };
}

const SHARE_KEYWORD_STOPWORDS = new Set([
  "그리고", "그러나", "하지만", "또한", "이번", "지난", "현재", "최근", "오늘", "내일", "오전", "오후",
  "대한", "통해", "관련", "경우", "때문", "대한민국", "기자", "뉴스", "기사", "보도", "사진", "내용",
  "있다", "했다", "된다", "위해", "에서", "에게", "으로", "하다", "위한", "가장", "정도", "대해",
  "the", "and", "for", "with", "this", "that", "from", "into", "about", "news", "report",
  "www", "http", "https", "com", "net", "org",
]);

function normalizeShareToken(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^[^0-9a-z가-힣]+|[^0-9a-z가-힣]+$/gi, "")
    .replace(/(?:은|는|이|가|을|를|의|에|로|으로|와|과|도|만|에서|에게|부터|까지)$/, "");
}

function sanitizeShareTokens(values: unknown, min: number, max: number): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => normalizeShareToken(String(value || "")))
    .filter((token) => token.length >= 2 && token.length <= 20)
    .filter((token) => !SHARE_KEYWORD_STOPWORDS.has(token))
    .filter((token) => !/^\d+$/.test(token));
  const deduped = Array.from(new Set(normalized));
  return deduped.slice(0, Math.max(min, max));
}

function extractRepresentativeKeywords(content: string, summary: string, title: string): string[] {
  const scoreMap = new Map<string, number>();
  const body = String(content || "").replace(/\s+/g, " ").trim();
  const paragraphs = body.split(/\n{2,}/).map((line) => line.trim()).filter(Boolean);
  const analysisBlocks = paragraphs.length > 0 ? paragraphs : [body];

  analysisBlocks.forEach((block, blockIdx) => {
    const tokens = (block.match(/[0-9a-zA-Z가-힣]{2,}/g) || [])
      .map((token) => normalizeShareToken(token))
      .filter((token) => token.length >= 2 && token.length <= 20)
      .filter((token) => !SHARE_KEYWORD_STOPWORDS.has(token))
      .filter((token) => !/^\d+$/.test(token));

    const blockWeight = blockIdx < 2 ? 1.4 : 1.0;
    tokens.forEach((token) => {
      scoreMap.set(token, (scoreMap.get(token) || 0) + blockWeight);
    });
  });

  const summaryTokens = (String(summary || "").match(/[0-9a-zA-Z가-힣]{2,}/g) || [])
    .map((token) => normalizeShareToken(token))
    .filter((token) => token.length >= 2 && token.length <= 20)
    .filter((token) => !SHARE_KEYWORD_STOPWORDS.has(token))
    .slice(0, 10);
  summaryTokens.forEach((token) => scoreMap.set(token, (scoreMap.get(token) || 0) + 1.2));

  const titleTokens = (String(title || "").match(/[0-9a-zA-Z가-힣]{2,}/g) || [])
    .map((token) => normalizeShareToken(token))
    .filter((token) => token.length >= 2 && token.length <= 20)
    .filter((token) => !SHARE_KEYWORD_STOPWORDS.has(token))
    .slice(0, 8);
  titleTokens.forEach((token) => scoreMap.set(token, (scoreMap.get(token) || 0) + 0.35));

  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .slice(0, 8);
}

function buildViralHashtags(
  representativeKeywords: string[],
  category: string,
  emotion: string,
): string[] {
  const categoryToken = normalizeShareToken(category);
  const emotionToken = normalizeShareToken(emotion);
  const broad = ["핵심이슈", "이슈브리핑", "뉴스요약", "트렌드체크", "지금주목"];
  const niche = representativeKeywords.slice(0, 6).map((token) => normalizeShareToken(token));
  const contextual = [categoryToken, emotionToken, "심층분석", "쟁점정리"]
    .filter((token) => token.length >= 2);
  return Array.from(new Set([...niche, ...contextual, ...broad]))
    .filter((token) => token.length >= 2 && token.length <= 20)
    .slice(0, 10);
}

function buildShareKeywordPackFallback(input: {
  title: string;
  summary: string;
  content: string;
  category: string;
  emotion: string;
}): { representativeKeywords: string[]; viralHashtags: string[] } {
  const representativeKeywords = extractRepresentativeKeywords(input.content, input.summary, input.title);
  const fallbackKeywords = representativeKeywords.length > 0
    ? representativeKeywords
    : extractRepresentativeKeywords(input.summary, "", input.title);
  const paddedKeywords = fallbackKeywords.length >= 5
    ? fallbackKeywords
    : Array.from(new Set([...fallbackKeywords, "핵심쟁점", "정책변화", "시장반응", "이해관계", "영향분석"])).slice(0, 8);
  const viralHashtags = buildViralHashtags(paddedKeywords, input.category, input.emotion);
  const paddedViral = viralHashtags.length >= 5
    ? viralHashtags
    : Array.from(new Set([...viralHashtags, "핵심이슈", "뉴스요약", "지금주목", "트렌드체크", "브리핑"])).slice(0, 10);

  return {
    representativeKeywords: paddedKeywords.slice(0, 8),
    viralHashtags: paddedViral.slice(0, 10),
  };
}

type DraftMediaSlot = {
  id: string;
  type: "image" | "video";
  anchorLabel: string;
  position: "before" | "inline" | "after";
  caption: string;
};

function buildDraftRegressionMock(mode: DraftMode): {
  title: string;
  content: string;
  fallbackUsed: boolean;
  sections: { core: string; deepDive: string; conclusion: string };
  sourceCitation: { title: string; url: string; source: string };
  mediaSlots: DraftMediaSlot[];
} {
  if (mode === "interactive-longform") {
    const sentences = Array.from({ length: 16 }).map((_, idx) => `핵심 맥락을 설명하는 테스트 문장 ${idx + 1}입니다.`);
    const content = sentences.join(" ");
    return {
      title: "회귀 테스트 롱폼 초안",
      content,
      fallbackUsed: false,
      sections: {
        core: sentences.slice(0, 5).join(" "),
        deepDive: sentences.slice(5, 11).join(" "),
        conclusion: sentences.slice(11).join(" "),
      },
      sourceCitation: {
        title: "Regression Reference",
        url: "https://example.com/regression-reference",
        source: "Regression Runner",
      },
      mediaSlots: [
        { id: "m1", type: "image", anchorLabel: "core", position: "after", caption: "핵심 시각 자료" },
        { id: "m2", type: "image", anchorLabel: "deepDive", position: "inline", caption: "심화 시각 자료" },
        { id: "m3", type: "video", anchorLabel: "conclusion", position: "before", caption: "결론 보조 영상" },
      ],
    };
  }

  const draftSentences = [
    "이 초안은 빠른 기사 생성 계약을 검증하기 위한 회귀 테스트 본문입니다.",
    "핵심 사실과 맥락을 간결하게 정리하고 과장 표현을 배제합니다.",
    "결론에서는 다음 확인 포인트를 짚어 사용자 판단을 돕습니다.",
  ];
  const draftContent = draftSentences.join(" ");
  return {
    title: "회귀 테스트 퀵 초안",
    content: draftContent,
    fallbackUsed: false,
    sections: {
      core: draftSentences[0],
      deepDive: draftSentences[1],
      conclusion: draftSentences[2],
    },
    sourceCitation: {
      title: "Regression Reference",
      url: "https://example.com/regression-reference",
      source: "Regression Runner",
    },
    mediaSlots: [
      { id: "m1", type: "image", anchorLabel: "core", position: "after", caption: "핵심 시각 자료" },
    ],
  };
}

type KeywordNewsArticle = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt?: string;
};

function decodeHtmlEntities(input: string): string {
  return String(input || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripHtmlTags(input: string): string {
  const decodedOnce = decodeHtmlEntities(String(input || ""));
  const withoutTags = decodedOnce.replace(/<[^>]*>/g, " ");
  return decodeHtmlEntities(withoutTags)
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRssLink(raw: string): string {
  const decoded = decodeHtmlEntities(String(raw || ""))
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/gi, "")
    .trim();
  const matched = decoded.match(/https?:\/\/[^\s<>"']+/i);
  return matched ? matched[0].trim() : "";
}

function normalizeNewsSummary(raw: string, title: string, source: string): string {
  const cleaned = stripHtmlTags(raw)
    .replace(/google news|google 뉴스/gi, " ")
    .replace(/^\s*-\s*/, "")
    .trim();
  if (cleaned.length >= 40) return cleaned.slice(0, 220);
  return `${source} 보도를 바탕으로 '${title}' 이슈의 핵심 쟁점을 요약한 내용입니다.`;
}

function parseGoogleNewsRss(xml: string): KeywordNewsArticle[] {
  const items = String(xml || "").match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.slice(0, 8).map((item, idx) => {
    const title = stripHtmlTags((item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1])
      || (item.match(/<title>([\s\S]*?)<\/title>/i)?.[1])
      || "");
    const linkRaw = (item.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i)?.[1])
      || (item.match(/<link>([\s\S]*?)<\/link>/i)?.[1])
      || "";
    const link = normalizeRssLink(linkRaw);
    const descriptionRaw = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1])
      || (item.match(/<description>([\s\S]*?)<\/description>/i)?.[1])
      || "";
    const pubDate = stripHtmlTags(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "");
    const source = stripHtmlTags(item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "외부 뉴스");
    const summary = normalizeNewsSummary(descriptionRaw, title, source);
    return {
      id: `ext-${idx + 1}`,
      title: title || `관련 기사 ${idx + 1}`,
      summary: summary || "요약 정보를 불러오지 못했습니다.",
      url: link || "",
      source,
      publishedAt: pubDate || undefined,
    };
  }).filter((row) => row.url || row.title);
}

function buildNewsRecommendationFallback(keyword: string): KeywordNewsArticle[] {
  const base = buildKeywordFallback(keyword);
  return base.topics.slice(0, 5).map((topic, idx) => ({
    id: `fallback-${idx + 1}`,
    title: `${keyword} 관련 이슈 ${idx + 1}`,
    summary: `${topic} 관점에서 확인할 수 있는 핵심 쟁점 요약입니다.`,
    url: "",
    source: "Fallback",
  }));
}

type KeywordNewsFetchResult = {
  keyword: string;
  articles: KeywordNewsArticle[];
  fallbackUsed: boolean;
  diagnostics?: {
    stage: "external_fetch" | "rss_parse" | "unknown";
    reason: string;
    status?: number;
  };
};

type KeywordNewsCacheEntry = {
  updatedAt: number;
  articles: KeywordNewsArticle[];
};

const KEYWORD_NEWS_CACHE_TTL_MS = 30 * 60 * 1000;
const keywordNewsCache = new Map<string, KeywordNewsCacheEntry>();

function readKeywordNewsCache(keyword: string): KeywordNewsArticle[] | null {
  const key = String(keyword || "").trim().toLowerCase();
  if (!key) return null;
  const row = keywordNewsCache.get(key);
  if (!row) return null;
  if (Date.now() - row.updatedAt > KEYWORD_NEWS_CACHE_TTL_MS) {
    keywordNewsCache.delete(key);
    return null;
  }
  return row.articles.slice();
}

function writeKeywordNewsCache(keyword: string, articles: KeywordNewsArticle[]): void {
  const key = String(keyword || "").trim().toLowerCase();
  if (!key || !Array.isArray(articles) || articles.length === 0) return;
  const valid = articles
    .filter((row) => /^https?:\/\//i.test(String(row?.url || "").trim()))
    .slice(0, 8);
  if (valid.length === 0) return;
  keywordNewsCache.set(key, {
    updatedAt: Date.now(),
    articles: valid,
  });
}

async function fetchKeywordNewsArticles(
  keyword: string,
  limit: number = 5,
  timeoutMs: number = 7000,
): Promise<KeywordNewsFetchResult> {
  const safeKeyword = String(keyword || "").trim();
  if (!safeKeyword) {
    return {
      keyword: safeKeyword,
      articles: [],
      fallbackUsed: true,
      diagnostics: {
        stage: "unknown",
        reason: "empty_keyword",
      },
    };
  }

  const buildQueryVariants = (source: string): string[] => {
    const tokens = source
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
    const candidates = [
      source,
      `${source} 뉴스`,
      tokens.slice(0, 2).join(" "),
      tokens.slice(0, 2).join(" ") ? `${tokens.slice(0, 2).join(" ")} 뉴스` : "",
      tokens[0] || "",
      tokens[0] ? `${tokens[0]} 뉴스` : "",
    ]
      .map((row) => row.trim())
      .filter(Boolean);
    return Array.from(new Set(candidates));
  };

  const queryVariants = buildQueryVariants(safeKeyword);
  const fallbackRssUrl = "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko";
  const keywordTokens = safeKeyword
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2);
  const browserLikeHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.5",
    "Cache-Control": "no-cache",
  } as const;

  const fetchAndParseWithTimeout = async (url: string, reasonTag: string): Promise<KeywordNewsArticle[]> => {
    const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(5000, Math.min(timeoutMs, 15000)) : 9000;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), safeTimeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: browserLikeHeaders,
        });
        if (!response.ok) {
          throw new Error(`${reasonTag}: rss status ${response.status}`);
        }
        const xml = await response.text();
        return parseGoogleNewsRss(xml);
      } catch (error: any) {
        const isLast = attempt >= 2;
        if (isLast) throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    return [];
  };

  try {
    // 1) keyword search feed with query variants
    for (const queryText of queryVariants) {
      const query = encodeURIComponent(queryText);
      const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`;
      try {
        const parsed = await fetchAndParseWithTimeout(rssUrl, "search");
        const relevant = parsed.filter((article) => {
          if (keywordTokens.length === 0) return true;
          const hay = `${article.title || ""} ${article.summary || ""}`.toLowerCase();
          return keywordTokens.some((token) => hay.includes(token));
        });
        const resolved = (relevant.length > 0 ? relevant : parsed)
          .slice(0, Math.max(1, Math.min(limit, 8)));
        if (resolved.length > 0) {
          writeKeywordNewsCache(safeKeyword, resolved);
          return {
            keyword: safeKeyword,
            articles: resolved,
            fallbackUsed: false,
            diagnostics: relevant.length > 0
              ? undefined
              : {
                  stage: "rss_parse",
                  reason: "search_variant_returned_but_keyword_overlap_low",
                },
          };
        }
      } catch {
        // keep trying next variant
      }
    }

    // 2) general KR feed fallback + keyword filter
    const generalParsed = await fetchAndParseWithTimeout(fallbackRssUrl, "top");
    const filtered = generalParsed.filter((article) => {
      if (keywordTokens.length === 0) return true;
      const hay = `${article.title || ""} ${article.summary || ""}`.toLowerCase();
      return keywordTokens.some((token) => hay.includes(token));
    });
    const resolved = (filtered.length > 0 ? filtered : generalParsed)
      .slice(0, Math.max(1, Math.min(limit, 8)));
    if (resolved.length === 0) {
      const cached = readKeywordNewsCache(safeKeyword);
      if (cached && cached.length > 0) {
        return {
          keyword: safeKeyword,
          articles: cached.slice(0, Math.max(1, Math.min(limit, 8))),
          fallbackUsed: false,
          diagnostics: {
            stage: "rss_parse",
            reason: "parsed_empty_recovered_from_cache",
          },
        };
      }
      return {
        keyword: safeKeyword,
        articles: buildNewsRecommendationFallback(safeKeyword),
        fallbackUsed: true,
        diagnostics: {
          stage: "rss_parse",
          reason: "parsed_empty",
        },
      };
    }
    writeKeywordNewsCache(safeKeyword, resolved);
    return {
      keyword: safeKeyword,
      articles: resolved,
      fallbackUsed: false,
      diagnostics: filtered.length > 0
        ? undefined
        : {
            stage: "rss_parse",
            reason: "keyword_filter_empty_fallback_to_top_feed",
          },
    };
  } catch (error: any) {
    const isAbort = error?.name === "AbortError";
    const reason = isAbort ? "rss timeout" : String(error?.message || "unknown error");
    console.warn("[AI] keyword news fetch failed:", error);
    const cached = readKeywordNewsCache(safeKeyword);
    if (cached && cached.length > 0) {
      return {
        keyword: safeKeyword,
        articles: cached.slice(0, Math.max(1, Math.min(limit, 8))),
        fallbackUsed: false,
        diagnostics: {
          stage: "external_fetch",
          reason: `${reason}_recovered_from_cache`,
        },
      };
    }
    return {
      keyword: safeKeyword,
      articles: buildNewsRecommendationFallback(safeKeyword),
      fallbackUsed: true,
      diagnostics: {
        stage: "external_fetch",
        reason,
      },
    };
  }
}

type NewsGeminiResult = {
  text: string | null;
  reasonCode?: "AI_NEWS_KEY_MISSING" | "AI_NEWS_MODEL_TIMEOUT" | "AI_NEWS_MODEL_ERROR";
  latencyMs: number;
  modelUsed?: string;
};

function isRetryableNewsModelError(message: string): boolean {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("503") ||
    text.includes("service unavailable") ||
    text.includes("high demand") ||
    text.includes("429") ||
    text.includes("resource_exhausted") ||
    text.includes("unavailable") ||
    text.includes("timeout")
  );
}

async function generateGeminiNewsText(
  prompt: string,
  timeoutMs: number = aiNewsSettings.modelTimeoutMs,
): Promise<NewsGeminiResult> {
  const startedAt = Date.now();
  const geminiClient = getGeminiClient();
  if (!geminiClient) {
    return {
      text: null,
      reasonCode: "AI_NEWS_KEY_MISSING",
      latencyMs: Date.now() - startedAt,
      modelUsed: FIXED_GEMINI_NEWS_TEXT_MODEL,
    };
  }

  const safeTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(36000, Math.min(timeoutMs, 45000))
    : 36000;
  const modelChain = [FIXED_GEMINI_NEWS_TEXT_MODEL, "gemini-2.5-flash"];
  let lastErrorMessage = "";
  let lastReasonCode: NewsGeminiResult["reasonCode"] = "AI_NEWS_MODEL_ERROR";
  let lastModel = FIXED_GEMINI_NEWS_TEXT_MODEL;

  for (const modelName of modelChain) {
    const maxAttempts = modelName === FIXED_GEMINI_NEWS_TEXT_MODEL ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      lastModel = modelName;
      const model = geminiClient.getGenerativeModel({ model: modelName });
      const generationTask = model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 2200,
          temperature: 0.25,
          topP: 0.85,
          topK: 24,
          thinkingConfig: { thinkingBudget: 0 },
        } as any,
      });
      const timeoutTask = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("AI_NEWS_MODEL_TIMEOUT")), safeTimeoutMs);
      });

      try {
        const result = await Promise.race([generationTask, timeoutTask]) as Awaited<typeof generationTask>;
        const text = result?.response?.text?.() || "";
        return {
          text: text.trim() || null,
          latencyMs: Date.now() - startedAt,
          modelUsed: modelName,
        };
      } catch (error: any) {
        const message = String(error?.message || "");
        lastErrorMessage = message;
        lastReasonCode = message.includes("AI_NEWS_MODEL_TIMEOUT")
          ? "AI_NEWS_MODEL_TIMEOUT"
          : "AI_NEWS_MODEL_ERROR";
        const retryable = isRetryableNewsModelError(message);
        const isLastAttempt = attempt >= maxAttempts;
        if (!isLastAttempt && retryable) {
          await new Promise((resolve) => setTimeout(resolve, 900 + attempt * 450));
          continue;
        }
        break;
      }
    }
  }

  console.warn("[AI] generateGeminiNewsText failed:", {
    reasonCode: lastReasonCode,
    message: lastErrorMessage,
    modelTried: lastModel,
  });
  return {
    text: null,
    reasonCode: lastReasonCode,
    latencyMs: Date.now() - startedAt,
    modelUsed: lastModel,
  };
}

async function repairGeminiNewsJson(
  rawModelText: string,
  timeoutMs: number = 12000,
): Promise<NewsGeminiResult> {
  const source = String(rawModelText || "").trim();
  if (!source) {
    return { text: null, reasonCode: "AI_NEWS_MODEL_ERROR", latencyMs: 0 };
  }
  const repairPrompt = [
    "You are a JSON repairer.",
    "Convert the following model output into strict JSON only.",
    "Do not add new facts. Preserve original meaning.",
    "Target schema:",
    '{"items":[{"title":"string","summary":"string","content":"string","source":"string","sourceCitation":[{"title":"string","url":"string","source":"string"}]}]}',
    "Return JSON only without markdown.",
    "MODEL_OUTPUT_START",
    source.slice(0, 12000),
    "MODEL_OUTPUT_END",
  ].join("\n");
  return generateGeminiNewsText(repairPrompt, timeoutMs);
}

const EMOTION_NEWS_CATEGORY_PROFILE: Record<EmotionType, {
  category: string;
  keywords: string[];
  toneRules: string[];
}> = {
  vibrance: {
    category: "긍정·문화·라이프스타일",
    keywords: ["미담 선행", "문화 콘텐츠", "축제 행사", "스포츠 하이라이트"],
    toneRules: [
      "과장된 희망 서사 금지",
      "정보 왜곡형 긍정 프레이밍 금지",
      "광고/홍보 톤 금지",
    ],
  },
  immersion: {
    category: "정치·속보·공적 논쟁",
    keywords: ["정치 정책", "속보 긴급 이슈", "사회 갈등", "노동 시위 정책 충돌"],
    toneRules: [
      "과도한 선동/단정 표현 금지",
      "감정 자극 프레이밍 강화 금지",
      "공포/분노 유도 문장 금지",
    ],
  },
  clarity: {
    category: "심층 해설·분석",
    keywords: ["심층 분석 해설", "경제 정책 분석", "데이터 기반 리포트", "산업 기술 동향"],
    toneRules: [
      "설명 중심 서술 구조 유지",
      "비유/수사 최소화",
      "감정적 강조 억제",
    ],
  },
  gravity: {
    category: "사건·재난·사회안전",
    keywords: ["사건사고 재난", "범죄 수사 사회 안전", "원인 분석 리포트"],
    toneRules: [
      "선정적/공포 조장 표현 금지",
      "팩트 중심 절제 톤 유지",
      "단정적 공포 서사 금지",
    ],
  },
  serenity: {
    category: "회복·웰빙·커뮤니티",
    keywords: ["환경 기후 자연", "건강 웰빙 생활 안정", "지역 커뮤니티 휴먼 스토리"],
    toneRules: [
      "자극적 사건 중심 서술 지양",
      "회복/균형 중심 톤 유지",
      "위협/불안 증폭 금지",
    ],
  },
  spectrum: {
    category: "균형 스펙트럼",
    keywords: ["정책", "산업", "사회"],
    toneRules: [
      "특정 감정 카테고리 편중 금지",
      "다양성 유지 및 중복 최소화",
    ],
  },
};

const EMOTION_KEYWORD_SYNONYMS: Record<EmotionType, string[]> = {
  vibrance: ["선행", "미담", "지역 축제", "문화 행사", "스포츠 화제", "라이프스타일 트렌드", "커뮤니티 훈훈"],
  immersion: ["정치 이슈", "사회 갈등", "정책 충돌", "속보", "시위", "노동 쟁점", "공적 논쟁"],
  clarity: ["심층 분석", "정책 해설", "경제 분석", "데이터 리포트", "산업 동향", "기술 해설", "시장 구조"],
  gravity: ["사건 사고", "재난", "사회 안전", "범죄 수사", "원인 분석", "위험 경보", "비상 대응"],
  serenity: ["환경", "기후", "웰빙", "건강", "회복", "지역 돌봄", "휴먼 스토리"],
  spectrum: ["정책", "산업", "사회", "경제", "기술", "커뮤니티"],
};

function buildEmotionKeywordQueryList(
  emotion: EmotionType,
  baseKeywords: string[],
  maxCount: number = 8,
): string[] {
  const rows = [
    ...baseKeywords,
    ...EMOTION_KEYWORD_SYNONYMS[emotion],
  ]
    .map((row) => String(row || "").trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const normalized = row.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(row);
    if (out.length >= maxCount) break;
  }
  return out;
}

type EmotionNewsCitation = {
  title: string;
  url: string;
  source: string;
};

type EmotionGeneratedNewsItem = {
  title: string;
  summary: string;
  content: string;
  source: string;
  emotion: EmotionType;
  imagePrompt?: string;
  sourceCitation: EmotionNewsCitation[];
  fallbackUsed: boolean;
  reasonCode?: string;
};

function pickFirstNonEmptyString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(record[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function toEmotionNewsCandidates(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const keys = ["items", "news", "articles", "results", "data"];
  for (const key of keys) {
    const value = rec[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      if (Array.isArray(nested.items)) return nested.items;
      if (Array.isArray(nested.articles)) return nested.articles;
      if (Array.isArray(nested.news)) return nested.news;
    }
  }
  return [];
}

function normalizeEmotionNewsCitations(
  raw: unknown,
  issueArticles: KeywordNewsArticle[],
  fallbackSource: string,
): EmotionNewsCitation[] {
  const issueRows = issueArticles
    .map((issue) => ({
      title: String(issue.title || "").trim().slice(0, 180),
      source: String(issue.source || "").trim().slice(0, 120),
      url: String(issue.url || "").trim().slice(0, 600),
      urlKey: normalizeReferenceUrl(String(issue.url || "")),
    }))
    .filter((issue) => issue.title && issue.source && /^https?:\/\//i.test(issue.url));
  const issueUrlKeySet = new Set(issueRows.map((row) => row.urlKey).filter(Boolean));

  const input = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const fromModel = input
    .map((entry) => {
      const title = String((entry as any)?.title || "").trim().slice(0, 180);
      const url = String((entry as any)?.url || "").trim().slice(0, 600);
      const source = String((entry as any)?.source || fallbackSource || "HueBrief AI").trim().slice(0, 120);
      if (!title || !source || !/^https?:\/\//i.test(url)) return null;
      const urlKey = normalizeReferenceUrl(url);
      if (urlKey && issueUrlKeySet.has(urlKey)) {
        return { title, url, source } as EmotionNewsCitation;
      }

      const titleTokens = tokenizeSimilarity(title);
      let bestIssue: (typeof issueRows)[number] | null = null;
      let bestScore = 0;
      for (const issue of issueRows) {
        const score = jaccardSimilarity(titleTokens, tokenizeSimilarity(issue.title));
        if (score > bestScore) {
          bestScore = score;
          bestIssue = issue;
        }
      }
      if (bestIssue && bestScore >= 0.35) {
        return {
          title: bestIssue.title,
          url: bestIssue.url,
          source: bestIssue.source || source,
        } as EmotionNewsCitation;
      }
      return null;
    })
    .filter((entry): entry is EmotionNewsCitation => Boolean(entry));

  if (fromModel.length > 0) return fromModel.slice(0, 3);

  const fromIssues = issueArticles
    .map((issue) => {
      const title = String(issue.title || "").trim().slice(0, 180);
      const url = String(issue.url || "").trim().slice(0, 600);
      const source = String(issue.source || fallbackSource || "HueBrief AI").trim().slice(0, 120);
      if (!title || !source || !/^https?:\/\//i.test(url)) return null;
      return { title, url, source } as EmotionNewsCitation;
    })
    .filter((entry): entry is EmotionNewsCitation => Boolean(entry));

  if (fromIssues.length > 0) return fromIssues.slice(0, 3);

  const safeQuery = encodeURIComponent(String(fallbackSource || "latest news"));
  return [
    {
      title: "Google News Search",
      url: `https://news.google.com/search?q=${safeQuery}`,
      source: "Google News",
    },
  ];
}

function buildEmotionNewsFallback(
  emotion: EmotionType,
  issueArticles: KeywordNewsArticle[] = [],
  reasonCode: string = "AI_NEWS_FALLBACK",
): EmotionGeneratedNewsItem[] {
  const now = new Date().toISOString().slice(0, 10);
  const baseByEmotion: Record<EmotionType, { themes: string[]; tone: string }> = {
    vibrance: {
      themes: ["지역 커뮤니티 혁신", "청년 창업 성장", "문화·스포츠 성과"],
      tone: "긍정적 신호와 실행 맥락을 균형 있게 정리",
    },
    immersion: {
      themes: ["정책 충돌 이슈", "사회 갈등 완화 방안", "현장 대응 체계 점검"],
      tone: "갈등 포인트를 사실 중심으로 분석",
    },
    clarity: {
      themes: ["산업 데이터 해석", "기술 정책 비교", "시장 영향 구조 분석"],
      tone: "수치와 구조를 기반으로 명확하게 설명",
    },
    gravity: {
      themes: ["리스크 관리 체계", "안전·보건 대응", "장기 영향 점검"],
      tone: "리스크와 대응 시나리오를 차분히 제시",
    },
    serenity: {
      themes: ["생활 회복 정책", "웰빙 트렌드", "지역 돌봄 네트워크"],
      tone: "안정적 변화와 회복 흐름을 중심으로 정리",
    },
    spectrum: {
      themes: ["정책·시장 균형 분석", "사회 반응 스펙트럼", "다음 관전 포인트"],
      tone: "다양한 관점을 균형 있게 제시",
    },
  };

  const profile = baseByEmotion[emotion];
  if (issueArticles.length > 0) {
    return issueArticles.slice(0, 3).map((issue, idx) => ({
      title: `[참고기반] ${profile.themes[idx % profile.themes.length]} 브리핑 ${idx + 1}`.slice(0, 120),
      summary: `${issue.source} 레퍼런스를 기반으로 핵심 쟁점만 재구성한 임시 브리핑 (${now})`.slice(0, 220),
      content: [
        `${issue.source}에서 확인된 이슈를 기준으로 핵심 사실과 파급 포인트를 재구성한 임시 브리핑입니다.`,
        `원문 문장/제목을 그대로 복제하지 않으며, 후속 생성에서 레퍼런스 기반으로 문장을 다시 구성해야 합니다.`,
      ].join("\n\n"),
      source: issue.source || "HueBrief AI",
      emotion,
      sourceCitation: normalizeEmotionNewsCitations(null, [issue], issue.source || "HueBrief AI"),
      fallbackUsed: true,
      reasonCode,
    }));
  }

  return profile.themes.map((theme, idx) => ({
    title: `${theme} 핵심 브리핑 ${idx + 1}`,
    summary: `${theme} 이슈를 ${profile.tone}한 요약 (${now})`,
    content: [
      `${theme} 관련 최신 흐름을 빠르게 정리한 브리핑입니다.`,
      `핵심 사실과 단기 파급효과를 중심으로 후속 확인 포인트를 제시합니다.`,
    ].join("\n\n"),
    source: "HueBrief AI",
    emotion,
    sourceCitation: normalizeEmotionNewsCitations(null, issueArticles, "HueBrief AI"),
    fallbackUsed: true,
    reasonCode,
  }));
}

function normalizeEmotionGeneratedNewsItems(
  raw: unknown,
  emotion: EmotionType,
  issueArticles: KeywordNewsArticle[],
): EmotionGeneratedNewsItem[] | null {
  const candidates = toEmotionNewsCandidates(raw);
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const normalized = candidates
    .slice(0, 3)
    .map((item, idx) => {
      const record = ((item && typeof item === "object") ? item : {}) as Record<string, unknown>;
      const title = pickFirstNonEmptyString(record, ["title", "headline", "newsTitle", "제목"])
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      const summary = pickFirstNonEmptyString(record, ["summary", "deck", "lead", "요약"])
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
      const content = pickFirstNonEmptyString(record, ["content", "body", "article", "본문"]).trim();
      const sourceRaw = pickFirstNonEmptyString(record, ["source", "publisher", "출처"]).trim();
      const sourceCitationRaw =
        record.sourceCitation ??
        record.citations ??
        record.references ??
        record.sources ??
        null;
      const sourceCitation = normalizeEmotionNewsCitations(sourceCitationRaw, issueArticles, sourceRaw || "HueBrief AI");

      if (!title || !summary || !content || sourceCitation.length === 0) return null;
      const resolvedSource = String(sourceCitation[0]?.source || sourceRaw || "HueBrief AI").trim();
      return {
        title,
        summary,
        content,
        source: resolvedSource && !/demo/i.test(resolvedSource) ? resolvedSource : "HueBrief AI",
        emotion,
        sourceCitation,
        fallbackUsed: false,
      } as EmotionGeneratedNewsItem;
    })
    .filter((item): item is EmotionGeneratedNewsItem => Boolean(item));

  return normalized.length > 0 ? normalized : null;
}

function evaluateEmotionNewsQuality(items: EmotionGeneratedNewsItem[]): { pass: boolean; reasonCode?: string } {
  if (!Array.isArray(items) || items.length === 0) return { pass: false, reasonCode: "AI_NEWS_EMPTY" };
  const titleSet = new Set<string>();
  for (const item of items) {
    const titleKey = String(item.title || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!titleKey || titleSet.has(titleKey)) return { pass: false, reasonCode: "AI_NEWS_DUPLICATED_TITLE" };
    titleSet.add(titleKey);
    if (String(item.summary || "").trim().length < 45) return { pass: false, reasonCode: "AI_NEWS_SUMMARY_TOO_SHORT" };
    if (String(item.content || "").trim().length < 180) return { pass: false, reasonCode: "AI_NEWS_CONTENT_TOO_SHORT" };
    if (!Array.isArray(item.sourceCitation) || item.sourceCitation.length === 0) {
      return { pass: false, reasonCode: "AI_NEWS_SOURCE_CITATION_MISSING" };
    }
    const citationOk = item.sourceCitation.some((citation) => /^https?:\/\//i.test(String(citation.url || "")));
    if (!citationOk) return { pass: false, reasonCode: "AI_NEWS_SOURCE_CITATION_INVALID" };
  }
  return { pass: true };
}

function hasLongCopiedSpan(source: string, target: string, minLen: number = 18): boolean {
  const src = normalizeSimilarityText(source).replace(/\s+/g, "");
  const dst = normalizeSimilarityText(target).replace(/\s+/g, "");
  if (!src || !dst || src.length < minLen || dst.length < minLen) return false;
  for (let i = 0; i <= src.length - minLen; i += 3) {
    const segment = src.slice(i, i + minLen);
    if (segment && dst.includes(segment)) return true;
  }
  return false;
}

function countTokenIntersection(left: string, right: string): number {
  const leftSet = new Set(tokenizeSimilarity(left));
  const rightSet = new Set(tokenizeSimilarity(right));
  let count = 0;
  for (const token of Array.from(leftSet)) {
    if (rightSet.has(token)) count += 1;
  }
  return count;
}

function evaluateEmotionNewsReferencePolicy(
  items: EmotionGeneratedNewsItem[],
  issueArticles: KeywordNewsArticle[],
): { pass: boolean; reasonCode?: string } {
  if (!Array.isArray(issueArticles) || issueArticles.length === 0) {
    return { pass: false, reasonCode: "AI_NEWS_REFERENCE_REQUIRED" };
  }
  const issueByUrl = new Map<string, KeywordNewsArticle>();
  const issueUrlSet = new Set(
    issueArticles
      .map((issue) => {
        const url = normalizeReferenceUrl(String(issue.url || "").trim());
        if (url) issueByUrl.set(url, issue);
        return url;
      })
      .filter((url) => Boolean(url)),
  );
  if (issueUrlSet.size === 0) {
    return { pass: false, reasonCode: "AI_NEWS_REFERENCE_REQUIRED" };
  }

  for (const item of items) {
    const citations = Array.isArray(item.sourceCitation) ? item.sourceCitation : [];
    if (citations.length === 0) {
      return { pass: false, reasonCode: "AI_NEWS_SOURCE_CITATION_MISSING" };
    }
    const groundedRefs: KeywordNewsArticle[] = [];
    for (const citation of citations) {
      const key = normalizeReferenceUrl(String(citation.url || ""));
      if (!key || !issueUrlSet.has(key)) continue;
      const issue = issueByUrl.get(key);
      if (issue) groundedRefs.push(issue);
    }
    const hasGroundedCitation = groundedRefs.length > 0;
    if (!hasGroundedCitation) {
      return { pass: false, reasonCode: "AI_NEWS_REFERENCE_OUT_OF_SCOPE" };
    }

    const itemText = `${item.title} ${item.summary} ${item.content}`;
    const isGroundedToReference = groundedRefs.some((ref) => {
      const refText = `${ref.title} ${ref.summary}`;
      const overlapCount = countTokenIntersection(itemText, refText);
      const overlapRatio = jaccardSimilarity(tokenizeSimilarity(itemText), tokenizeSimilarity(refText));
      return overlapCount >= 2 || overlapRatio >= 0.08;
    });
    if (!isGroundedToReference) {
      return { pass: false, reasonCode: "AI_NEWS_REFERENCE_WEAK_GROUNDING" };
    }

    for (const ref of issueArticles) {
      const refTitle = String(ref.title || "");
      const refSummary = String(ref.summary || "");
      const titleOverlap = jaccardSimilarity(tokenizeSimilarity(item.title), tokenizeSimilarity(refTitle));
      if (titleOverlap >= 0.85 || hasLongCopiedSpan(refTitle, item.title, 10)) {
        return { pass: false, reasonCode: "AI_NEWS_TITLE_COPY_DETECTED" };
      }
      if (
        hasLongCopiedSpan(refTitle, item.content, 16) ||
        hasLongCopiedSpan(refSummary, item.content, 24) ||
        hasLongCopiedSpan(refSummary, item.summary, 18)
      ) {
        return { pass: false, reasonCode: "AI_NEWS_CONTENT_COPY_DETECTED" };
      }
    }
  }

  return { pass: true };
}

function buildLongformDraftFallback(rawInput: string): {
  title: string;
  content: string;
  sections: { core: string; deepDive: string; conclusion: string };
  mediaSlots: DraftMediaSlot[];
  sourceCitation?: { title: string; url: string; source: string };
} {
  const keyword = normalizeKeywordSeed(rawInput);
  const core = [
    `${keyword} 이슈는 현재 정책과 산업 의사결정의 중심으로 부상했습니다.`,
    `최근 흐름을 보면 단기 판단이 중기 방향을 좌우할 가능성이 커지고 있습니다.`,
    `이 섹션에서는 해석에 앞서 검증된 사실과 즉시 확인 가능한 맥락을 먼저 정리합니다.`,
  ].join("\n\n");
  const deepDive = [
    `배경 신호를 보면 이해관계자들은 서로 다른 우선순위를 중심으로 움직이고 있습니다.`,
    `대중 영향, 실행 리스크, 거버넌스 불확실성을 분리하지 말고 함께 검토해야 합니다.`,
    `실무 관점에서는 확인된 사건과 전망성 해석을 명확히 구분하는 것이 중요합니다.`,
    `이 구간은 헤드라인 사실에서 구조적 시사점으로 톤을 전환하도록 설계된 심화 파트입니다.`,
  ].join("\n\n");
  const conclusion = [
    `독자가 확인해야 할 핵심은 '무슨 일이 있었는가'뿐 아니라 '무엇이 다음에 바뀌는가'입니다.`,
    `다음 공식 발표, 시장 반응, 산업 간 연쇄 반응을 병렬로 추적하는 것이 유효합니다.`,
    `결론은 현재 근거를 유지하면서도 추적 가능한 후속 지표와 연결되어야 합니다.`,
  ].join("\n\n");

  return {
    title: `${keyword} 분석: 핵심 이슈, 심화 시사점, 그리고 다음 변화`,
    content: [core, deepDive, conclusion].join("\n\n"),
    sections: { core, deepDive, conclusion },
    mediaSlots: [
      {
        id: "m1",
        type: "image",
        anchorLabel: "core",
        position: "after",
        caption: "핵심 이슈를 설명하는 도입 이미지",
      },
      {
        id: "m2",
        type: "image",
        anchorLabel: "deepDive",
        position: "inline",
        caption: "심화 시사점을 보조하는 맥락 이미지",
      },
      {
        id: "m3",
        type: "video",
        anchorLabel: "conclusion",
        position: "before",
        caption: "결론 직전 핵심 정리 영상",
      },
    ],
    sourceCitation: {
      title: `${keyword} 관련 기사`,
      url: "",
      source: "출처 확인 필요",
    },
  };
}

function buildDraftFallback(rawInput: string): { title: string; content: string } {
  const keyword = normalizeKeywordSeed(rawInput);
  const outlineItems = extractOutlineItems(rawInput);

  const sections = outlineItems.length > 0
    ? outlineItems.map((item, idx) => `${idx + 1}) ${item}`).join("\n")
    : [
      "1) 현재 상황 요약",
      "2) 핵심 쟁점과 데이터 포인트",
      "3) 이해관계자 반응",
      "4) 위험과 기회",
      "5) 다음 체크포인트",
    ].join("\n");

  const content = [
    `${keyword} 이슈는 최근 보도에서 핵심 의제로 부상했으며, 정책 방향과 시장 반응이 동시에 변화하고 있습니다.`,
    `초기 신호를 보면 향후 몇 주의 결정이 기관, 기업, 독자에게 영향을 줄 우선순위를 재편할 가능성이 있습니다.`,
    `균형 잡힌 기사 구성을 위해 다음 구조를 중심으로 취재 내용을 정리하세요:\n${sections}`,
    `초안 작성 시에는 확인된 사실과 전망을 구분하고, 주요 주장마다 출처 근거를 연결하는 것이 필요합니다.`,
    `마무리 문단에서는 독자 관점의 실질적 함의를 요약하고, 다음에 추적할 지표를 명확히 제시하세요.`,
  ].join("\n\n");

  return {
    title: `${keyword} 브리핑: 핵심 쟁점과 다음 흐름`,
    content,
  };
}

function buildComplianceFlags(content: string): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  const checks: Array<{
    category: ComplianceFlag["category"];
    severity: ComplianceSeverity;
    regex: RegExp;
    reason: string;
    suggestion: string;
  }> = [
    {
      category: "privacy",
      severity: "high",
      regex: /\b\d{2,3}-\d{3,4}-\d{4}\b|주민등록|신분증|계좌번호/i,
      reason: "Potential personal/sensitive data appears in content.",
      suggestion: "Mask or remove identifiable personal data before publishing.",
    },
    {
      category: "defamation",
      severity: "high",
      regex: /사기꾼|범죄자|거짓말쟁이|fraud|criminal/i,
      reason: "Potentially defamatory wording detected.",
      suggestion: "Use verified attribution and neutral phrasing with sources.",
    },
    {
      category: "medical",
      severity: "medium",
      regex: /완치|기적의 치료|100% 치료|cure/i,
      reason: "Strong medical claim detected.",
      suggestion: "Add evidence source and avoid absolute treatment claims.",
    },
    {
      category: "financial",
      severity: "medium",
      regex: /무조건 수익|원금 보장|확정 수익|guaranteed return/i,
      reason: "High-risk financial certainty claim detected.",
      suggestion: "Add risk disclosure and avoid guaranteed return language.",
    },
    {
      category: "violent",
      severity: "medium",
      regex: /살해|자살|테러|폭탄|shooting|suicide/i,
      reason: "Sensitive violence-related wording detected.",
      suggestion: "Use cautious wording and provide contextual safety framing.",
    },
  ];

  for (const check of checks) {
    const match = content.match(check.regex);
    if (match) {
      flags.push({
        category: check.category,
        severity: check.severity,
        reason: check.reason,
        suggestion: check.suggestion,
        evidenceSnippet: match[0],
      });
    }
  }

  const quoteCount = (content.match(/\"/g) || []).length / 2;
  const hasSourceHint = /(출처|source|according to|보고서|연구)/i.test(content);
  if (quoteCount > 0 && !hasSourceHint) {
    flags.push({
      category: "factual",
      severity: "low",
      reason: "Quoted or asserted statements have weak source attribution.",
      suggestion: "Add source name/date/link near key claims.",
    });
  }

  return flags;
}

function assessCompliance(content: string): ComplianceAssessment {
  const flags = buildComplianceFlags(content);
  const hasHigh = flags.some((f) => f.severity === "high");
  const hasMedium = flags.some((f) => f.severity === "medium");
  const riskLevel: ComplianceSeverity = hasHigh ? "high" : hasMedium ? "medium" : "low";

  return {
    riskLevel,
    flags,
    summary:
      flags.length === 0
        ? "No major compliance/fact-check risk detected."
        : `${flags.length} risk flag(s) detected. Review suggestions before publishing.`,
    publishBlocked: hasHigh,
  };
}

function classifyHueBotMessage(message: string): {
  intent: ChatIntent;
  recommendation: EmotionType;
  confidence: number;
  followUp: string;
  text: string;
  fallbackUsed: boolean;
} {
  const lower = message.toLowerCase();
  const hasAnyText = lower.trim().length > 0;

  const groups: Array<{
    intent: ChatIntent;
    recommendation: EmotionType;
    confidence: number;
    followUp: string;
    text: string;
    keywords: string[];
  }> = [
    {
      intent: "anxiety_relief",
      recommendation: "serenity",
      confidence: 0.88,
      followUp: "불안이 강하면 어떤 상황에서 가장 커지는지 한 문장으로 알려주세요.",
      text: "불안 신호가 보여서 차분한 흐름의 뉴스를 먼저 추천할게요.",
      keywords: ["불안", "초조", "긴장", "걱정", "anx", "anxiety", "nervous", "panic"],
    },
    {
      intent: "anger_release",
      recommendation: "clarity",
      confidence: 0.84,
      followUp: "화가 난 원인이 사람/업무/뉴스 중 어디에 가까운지 알려주세요.",
      text: "분노 반응이 보여요. 감정 정리를 돕는 명료한 톤의 뉴스를 추천할게요.",
      keywords: ["화", "짜증", "분노", "빡", "angry", "anger", "mad", "irritated"],
    },
    {
      intent: "sadness_lift",
      recommendation: "vibrance",
      confidence: 0.83,
      followUp: "오늘 특히 마음이 가라앉은 순간이 있었다면 짧게 적어주세요.",
      text: "기분이 가라앉은 신호가 있어요. 에너지를 올리는 뉴스 흐름을 추천할게요.",
      keywords: ["슬픔", "우울", "무기력", "힘들", "sad", "depressed", "down", "lonely"],
    },
    {
      intent: "focus_clarity",
      recommendation: "clarity",
      confidence: 0.78,
      followUp: "집중이 필요한 과제가 있다면 키워드 2~3개만 알려주세요.",
      text: "집중/정리 니즈로 보여요. 정보 밀도가 균형 잡힌 카테고리를 추천할게요.",
      keywords: ["집중", "정리", "공부", "업무", "focus", "study", "work", "plan"],
    },
  ];

  for (const group of groups) {
    if (group.keywords.some((kw) => lower.includes(kw))) {
      return {
        intent: group.intent,
        recommendation: group.recommendation,
        confidence: group.confidence,
        followUp: group.followUp,
        text: group.text,
        fallbackUsed: false,
      };
    }
  }

  return {
    intent: "balance_general",
    recommendation: "spectrum",
    confidence: hasAnyText ? 0.55 : 0.4,
    followUp: hasAnyText
      ? "지금 감정을 한 단어(불안/화남/슬픔/평온)로 말해주면 더 정확히 추천할게요."
      : "현재 기분을 한 단어로 입력해 주세요. 예: 불안, 화남, 슬픔, 평온",
    text: "현재 메시지로는 감정 신호가 약해요. 균형형 뉴스부터 시작해볼게요.",
    fallbackUsed: true,
  };
}

function detectBiasWarning(message: string): string | null {
  const patterns = [
    /\b(항상|절대|무조건|전부|모두)\b/i,
    /\b(hate|always|never|all of them)\b/i,
    /(편향|선동|혐오|증오)/i,
  ];
  const hit = patterns.some((re) => re.test(message));
  if (!hit) return null;
  return "Strong one-sided wording detected. Please verify multiple sources before relying on this suggestion.";
}

function buildNeutralReQuestion(intent: ChatIntent): string {
  if (intent === "anger_release") {
    return "To keep balance, what is one counter-view or missing fact in this issue?";
  }
  if (intent === "anxiety_relief") {
    return "What specific fact would reduce your uncertainty the most right now?";
  }
  return "For a balanced view, can you share one concrete fact and one concern separately?";
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await hydrateDraftOpsMetrics();
  await hydrateAiNewsOpsMetrics();
  await hydrateAiDraftGateSettings();
  await hydrateAiNewsSettings();
  type SubscriptionPlan = "free" | "premium";
  type RoleRequestStatus = "pending" | "approved" | "rejected";
  type RoleType = "general" | "journalist" | "admin";

  const subscriptionFallback = new Map<string, { status: "active" | "inactive"; plan: SubscriptionPlan; periodEnd: string | null }>();
  const roleRequestFallback: Array<{
    id: string;
    userId: string;
    email?: string;
    requestedRole: RoleType;
    reason?: string;
    status: RoleRequestStatus;
    createdAt: string;
  }> = [];
  const communityFallback: Array<{
    id: string;
    userId: string;
    username: string;
    emotion: EmotionType;
    userOpinion: string;
    articleId?: string | null;
    createdAt: string;
  }> = [];

  // Demo-only OTP store (no SMS provider)
  const phoneOtpFallback = new Map<string, {
    code: string;
    expiresAt: number;
    cooldownUntil: number;
    dailyCount: number;
    dayKey: string;
  }>();
  const demoResetTokens = new Map<string, { phone: string; expiresAt: number }>();
  const demoPhoneToEmails = new Map<string, string[]>([
    ["010-0000-0000", ["demo.user@example.com"]],
    ["010-1111-2222", ["journal.user@example.com", "alt.user@example.com"]],
  ]);
  const hueBotPolicyWindowMs = 15 * 60 * 1000;
  const hueBotSessionState = new Map<string, {
    cooldownUntil: number;
    history: Array<{ intent: ChatIntent; ts: number }>;
  }>();
  type ExportFormat = "excel" | "pdf";
  type ExportMode = "manual" | "scheduled";
  type AlertType = "failure_rate" | "latency" | "ai_error";
  type AlertSeverity = "warning" | "critical";
  type ExportJob = {
    id: string;
    format: ExportFormat;
    mode: ExportMode;
    status: "success" | "failed";
    createdAt: string;
    completedAt: string;
    requestedBy?: string | null;
    summary: {
      articleCount: number;
      reviewedCount: number;
      issueCount: number;
      hiddenCount: number;
    };
    error?: string;
  };
  type ExportScheduleConfig = {
    enabled: boolean;
    intervalMinutes: number;
    formats: ExportFormat[];
    lastRunAt: string | null;
    nextRunAt: string | null;
  };
  const exportJobs: ExportJob[] = [];
  let exportSchedule: ExportScheduleConfig = {
    enabled: false,
    intervalMinutes: 60,
    formats: ["excel", "pdf"],
    lastRunAt: null,
    nextRunAt: null,
  };
  let exportTimer: NodeJS.Timeout | null = null;
  type RequestMetric = { ts: number; path: string; status: number; durationMs: number; isAi: boolean };
  type OpsAlert = {
    id: string;
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
    metric: {
      value: number;
      threshold: number;
      unit: "%" | "ms" | "count";
      windowMinutes: number;
    };
    createdAt: string;
  };
  const requestMetrics: RequestMetric[] = [];
  const opsAlerts: OpsAlert[] = [];
  const alertCooldownMs = 5 * 60 * 1000;
  const lastAlertAtByType = new Map<AlertType, number>();

  const resolveActor = (req: any): { actorId: string | null; actorRole: string } => {
    const actorIdHeader = req.headers?.["x-actor-id"];
    const actorRoleHeader = req.headers?.["x-actor-role"];
    const actorId = typeof actorIdHeader === "string" && actorIdHeader.trim() ? actorIdHeader.trim().slice(0, 128) : null;
    const actorRole = typeof actorRoleHeader === "string" && actorRoleHeader.trim() ? actorRoleHeader.trim().slice(0, 32) : "admin";
    return { actorId, actorRole };
  };

  const writeAdminActionLog = async (
    req: any,
    action: string,
    targetId: string,
    detail?: string,
    targetType: string = "article",
  ) => {
    const actor = resolveActor(req);
    await storage.createAdminActionLog({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action,
      targetType,
      targetId,
      detail: detail || null,
    });
  };

  const pushOpsAlert = async (alert: Omit<OpsAlert, "id" | "createdAt">) => {
    const now = Date.now();
    const last = lastAlertAtByType.get(alert.type) || 0;
    if (now - last < alertCooldownMs) return;
    lastAlertAtByType.set(alert.type, now);

    const row: OpsAlert = {
      id: randomUUID(),
      createdAt: new Date(now).toISOString(),
      ...alert,
    };
    opsAlerts.unshift(row);
    if (opsAlerts.length > 200) opsAlerts.length = 200;

    await storage.createAdminActionLog({
      actorId: null,
      actorRole: "system",
      action: "ops_alert",
      targetType: "ops",
      targetId: row.id,
      detail: `${row.type}:${row.metric.value}${row.metric.unit}`,
    });
  };

  const evaluateOpsAlerts = async () => {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const recent = requestMetrics.filter((m) => now - m.ts <= windowMs);
    if (recent.length >= 20) {
      const failures = recent.filter((m) => m.status >= 500).length;
      const failureRate = Math.round((failures / recent.length) * 100);
      if (failureRate >= 20) {
        await pushOpsAlert({
          type: "failure_rate",
          severity: failureRate >= 35 ? "critical" : "warning",
          title: "API 실패율 경고",
          message: `최근 10분 API 실패율이 ${failureRate}% 입니다.`,
          metric: { value: failureRate, threshold: 20, unit: "%", windowMinutes: 10 },
        });
      }

      const sorted = [...recent].sort((a, b) => a.durationMs - b.durationMs);
      const p95 = sorted[Math.max(0, Math.floor(sorted.length * 0.95) - 1)]?.durationMs || 0;
      if (p95 >= 1500) {
        await pushOpsAlert({
          type: "latency",
          severity: p95 >= 3000 ? "critical" : "warning",
          title: "응답 지연 경고",
          message: `최근 10분 p95 지연이 ${p95}ms 입니다.`,
          metric: { value: p95, threshold: 1500, unit: "ms", windowMinutes: 10 },
        });
      }
    }

    const recentAi = recent.filter((m) => m.isAi);
    const aiErrors = recentAi.filter((m) => m.status >= 500).length;
    if (aiErrors >= 3) {
      await pushOpsAlert({
        type: "ai_error",
        severity: aiErrors >= 6 ? "critical" : "warning",
        title: "AI 오류 경고",
        message: `최근 10분 AI 5xx 오류가 ${aiErrors}건 발생했습니다.`,
        metric: { value: aiErrors, threshold: 3, unit: "count", windowMinutes: 10 },
      });
    }
  };

  const runExportJob = async (format: ExportFormat, mode: ExportMode, requestedBy?: string | null): Promise<ExportJob> => {
    const createdAt = new Date().toISOString();
    try {
      const [articles, reviews] = await Promise.all([
        storage.getAllNews(true),
        storage.getAdminReviews(),
      ]);

      const reviewMap = new Map<string, { completed: boolean; issues: string[] }>();
      reviews.forEach((review) => {
        reviewMap.set(String(review.articleId), {
          completed: Boolean(review.completed),
          issues: Array.isArray(review.issues) ? review.issues : [],
        });
      });

      const hiddenCount = articles.filter((item: any) => {
        const published = typeof item?.isPublished === "boolean"
          ? item.isPublished
          : typeof item?.is_published === "boolean"
            ? item.is_published
            : true;
        return !published;
      }).length;
      const reviewedCount = articles.filter((item: any) => reviewMap.get(String(item.id))?.completed).length;
      const issueCount = articles.reduce((acc: number, item: any) => acc + (reviewMap.get(String(item.id))?.issues.length || 0), 0);

      const job: ExportJob = {
        id: randomUUID(),
        format,
        mode,
        status: "success",
        createdAt,
        completedAt: new Date().toISOString(),
        requestedBy: requestedBy || null,
        summary: {
          articleCount: articles.length,
          reviewedCount,
          issueCount,
          hiddenCount,
        },
      };
      exportJobs.unshift(job);
      if (exportJobs.length > 100) exportJobs.length = 100;
      await storage.createAdminActionLog({
        actorId: requestedBy || null,
        actorRole: "admin",
        action: "export_run",
        targetType: "export",
        targetId: job.id,
        detail: `${format}:${mode}`,
      });
      return job;
    } catch (error: any) {
      const job: ExportJob = {
        id: randomUUID(),
        format,
        mode,
        status: "failed",
        createdAt,
        completedAt: new Date().toISOString(),
        requestedBy: requestedBy || null,
        summary: {
          articleCount: 0,
          reviewedCount: 0,
          issueCount: 0,
          hiddenCount: 0,
        },
        error: String(error?.message || "export job failed"),
      };
      exportJobs.unshift(job);
      if (exportJobs.length > 100) exportJobs.length = 100;
      return job;
    }
  };

  const stopExportSchedule = () => {
    if (exportTimer) {
      clearInterval(exportTimer);
      exportTimer = null;
    }
    exportSchedule.nextRunAt = null;
  };

  const startExportSchedule = () => {
    stopExportSchedule();
    if (!exportSchedule.enabled) return;

    const intervalMs = Math.max(5, exportSchedule.intervalMinutes) * 60 * 1000;
    exportSchedule.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

    exportTimer = setInterval(async () => {
      const nowIso = new Date().toISOString();
      for (const format of exportSchedule.formats) {
        await runExportJob(format, "scheduled", null);
      }
      exportSchedule.lastRunAt = nowIso;
      exportSchedule.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    }, intervalMs);
  };

  app.use((req, res, next) => {
    const monitorTarget =
      req.path.startsWith("/api/ai/") ||
      req.path.startsWith("/api/admin/news/fetch") ||
      req.path.startsWith("/api/admin/exports/");
    if (!monitorTarget) return next();

    const startedAt = Date.now();
    res.on("finish", () => {
      const row: RequestMetric = {
        ts: Date.now(),
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        isAi: req.path.startsWith("/api/ai/"),
      };
      requestMetrics.push(row);
      const expireBefore = Date.now() - 30 * 60 * 1000;
      while (requestMetrics.length > 0 && requestMetrics[0].ts < expireBefore) {
        requestMetrics.shift();
      }
      void evaluateOpsAlerts();
    });

    next();
  });

  app.get("/api/emotions", async (_req, res) => {
    res.json(emotionTypes.map((type) => ({ type, label: type, color: getEmotionColor(type) })));
  });

  app.get("/api/news", async (req, res) => {
    try {
      const includeHidden = req.query.all === "true";
      const news = await storage.getAllNews(includeHidden);
      res.json(news);
    } catch (error: any) {
      console.error("[API] /api/news failed:", error);
      res.status(200).json([]);
    }
  });

  app.get("/api/news/:emotion", async (req, res) => {
    try {
      const emotion = toEmotion(req.params.emotion);
      const news = await storage.getNewsByEmotion(emotion);
      res.json(news);
    } catch (error: any) {
      console.error("[API] /api/news/:emotion failed:", error);
      res.status(200).json([]);
    }
  });

  app.get("/api/community", async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const feedFromFallback = [...communityFallback]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((row) => ({
        id: row.id,
        title: "Community Story",
        emotion: row.emotion,
        excerpt: row.userOpinion,
        author: row.username,
        createdAt: row.createdAt,
      }));

    const approvedReaderArticles = (await storage.getReaderComposedArticles("approved"))
      .map((row: any) => ({
        id: String(row.id),
        title: String(row.generatedTitle || "Reader Article"),
        emotion: toEmotion(row.sourceEmotion),
        category: String(row.sourceCategory || "General"),
        content: String(row.generatedContent || ""),
        excerpt: String(row.generatedSummary || row.userOpinion || "").slice(0, 300),
        author: String(row.userId || "reader"),
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      }));

    const merged = [...approvedReaderArticles, ...feedFromFallback]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, limit);

    res.json(merged);
  });

  app.post("/api/community", async (req, res) => {
    const { userId, username, emotion, userOpinion, articleId, isPublic = true } = req.body || {};
    if (!userId || typeof userOpinion !== "string" || !userOpinion.trim()) {
      return res.status(400).json({ error: "userId and userOpinion are required." });
    }
    const row = {
      id: randomUUID(),
      userId: String(userId),
      username: String(username || "Anonymous"),
      emotion: toEmotion(emotion),
      userOpinion: userOpinion.trim(),
      articleId: articleId || null,
      createdAt: new Date().toISOString(),
    };
    if (isPublic) communityFallback.push(row);
    res.status(201).json({ id: row.id, createdAt: row.createdAt });
  });

  app.post("/api/ai/compose-opinion-article", async (req, res) => {
    try {
      const sourceArticleId = String(req.body?.sourceArticleId || "").trim().slice(0, 128);
      const sourceTitle = String(req.body?.sourceTitle || "").trim().slice(0, 220);
      const sourceSummary = String(req.body?.sourceSummary || "").trim().slice(0, 1600);
      const sourceUrl = String(req.body?.sourceUrl || "").trim().slice(0, 500);
      const opinionText = String(req.body?.opinionText || "").trim().slice(0, 2400);
      const extraRequest = String(req.body?.extraRequest || "").trim().slice(0, 600);
      const requestedReferences = normalizeStringArray(req.body?.requestedReferences, 8, 180);

      if (!sourceArticleId || !sourceTitle || !opinionText) {
        return res.status(400).json({ error: "sourceArticleId, sourceTitle, opinionText are required." });
      }

      const crawlSeed = [sourceTitle, extraRequest, ...requestedReferences.slice(0, 2)]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" ");
      const fetched = await fetchKeywordNewsArticles(crawlSeed || sourceTitle, 6, 9000);
      const crawledArticles = (fetched.articles || [])
        .filter((row) => /^https?:\/\//i.test(String(row?.url || "").trim()))
        .filter((row) => String(row?.source || "").trim().toLowerCase() !== "fallback")
        .slice(0, 6);

      if (crawledArticles.length === 0) {
        return res.status(503).json({
          error: "웹 크롤링 기사 확보에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          code: "OPINION_COMPOSE_CRAWL_EMPTY",
          retryable: true,
        });
      }

      const crawlContext = crawledArticles.map((row, idx) => ({
        n: idx + 1,
        title: row.title,
        summary: row.summary,
        source: row.source,
        url: row.url,
      }));

      const prompt = [
        "You are a newsroom writing assistant.",
        "Task: write a NEW article using web-crawled context + reader opinion.",
        "Hard rules:",
        "1) NEVER edit or overwrite original article text.",
        "2) Treat original article as read-only context only.",
        "3) Use crawled references as the primary factual context.",
        "4) Output content must start from reader perspective section. Do not add a section named '원문 요약'.",
        "5) Return a standalone article that clearly separates reader opinion.",
        "Output strict JSON:",
        '{"title":"string","summary":"string","content":"markdown string","references":[{"title":"string","url":"string","source":"string"}]}',
        "INPUT:",
        JSON.stringify({
          sourceArticleId,
          sourceTitle,
          sourceSummary,
          sourceUrl,
          opinionText,
          extraRequest,
          requestedReferences,
          crawledContext: crawlContext,
          language: "ko-KR",
        }),
      ].join("\n");

      const modelRaw = await generateGeminiText(prompt);
      const parsed = parseJsonFromModelText<{
        title?: string;
        summary?: string;
        content?: string;
        references?: Array<{ title?: string; url?: string; source?: string }>;
      }>(modelRaw || "");

      if (!parsed?.title || !parsed?.summary || !parsed?.content) {
        return res.json(buildOpinionArticleFromCrawledFallback({
          sourceTitle,
          opinionText,
          extraRequest,
          crawledArticles,
        }));
      }

      const references = Array.isArray(parsed.references)
        ? parsed.references
          .map((ref) => ({
            title: String(ref?.title || "").trim().slice(0, 160),
            url: String(ref?.url || "").trim().slice(0, 300),
            source: String(ref?.source || "").trim().slice(0, 120),
          }))
          .filter((ref) => ref.title || ref.url || ref.source)
          .slice(0, 10)
        : [];

      const normalizedCrawledUrlSet = new Set(
        crawledArticles.map((row) => String(row.url || "").trim()).filter(Boolean),
      );
      const hasCrawledReference = references.some((ref) => normalizedCrawledUrlSet.has(ref.url));
      const resolvedReferences = hasCrawledReference
        ? references
        : crawledArticles.slice(0, 4).map((row) => ({
          title: row.title,
          url: row.url,
          source: row.source,
        }));

      return res.json({
        title: String(parsed.title || "").trim().slice(0, 220),
        summary: String(parsed.summary || "").trim().slice(0, 600),
        content: String(parsed.content || "").trim().slice(0, 20000),
        references: resolvedReferences,
        fallbackUsed: false,
      });
    } catch (error) {
      console.error("[API] /api/ai/compose-opinion-article failed:", error);
      return res.status(500).json({ error: "Failed to compose article with opinion." });
    }
  });

  app.get("/api/mypage/insights", async (req, res) => {
    try {
      const userId = normalizeInsightUserId(req.query.userId);
      if (!userId) return res.status(400).json({ error: "userId is required." });

      const rows = await storage.getUserInsights(userId);
      return res.json(rows);
    } catch (error) {
      console.error("[API] /api/mypage/insights failed:", error);
      return res.status(500).json({ error: "Failed to load user insights." });
    }
  });

  app.post("/api/mypage/insights", async (req, res) => {
    try {
      const userId = normalizeInsightUserId(req.body?.userId);
      const articleId = String(req.body?.articleId || "").trim().slice(0, 128);
      const originalTitle = String(req.body?.originalTitle || "").trim().slice(0, 220);
      const userComment = String(req.body?.userComment || "").trim().slice(0, 1200);
      const userFeelingText = String(req.body?.userFeelingText || "").trim().slice(0, 120);
      const selectedTags = Array.isArray(req.body?.selectedTags)
        ? req.body.selectedTags.map((tag: unknown) => String(tag || "").trim()).filter(Boolean).slice(0, 3)
        : [];
      const userEmotion = toEmotion(req.body?.userEmotion);

      if (!userId || !articleId || !originalTitle || !userComment) {
        return res.status(400).json({ error: "userId, articleId, originalTitle, userComment are required." });
      }

      const row = await storage.createUserInsight({
        userId,
        articleId,
        originalTitle,
        userComment,
        userEmotion,
        userFeelingText,
        selectedTags,
      });
      return res.status(201).json(row);
    } catch (error) {
      console.error("[API] /api/mypage/insights create failed:", error);
      return res.status(500).json({ error: "Failed to save insight." });
    }
  });

  app.delete("/api/mypage/insights/:id", async (req, res) => {
    try {
      const userId = normalizeInsightUserId(req.query.userId || req.body?.userId);
      if (!userId) return res.status(400).json({ error: "userId is required." });
      const insightId = String(req.params.id || "").trim();
      const deleted = await storage.deleteUserInsight(userId, insightId);
      if (!deleted) {
        return res.status(404).json({ error: "Insight not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("[API] /api/mypage/insights delete failed:", error);
      return res.status(500).json({ error: "Failed to delete insight." });
    }
  });

  app.get("/api/mypage/composed-articles", async (req, res) => {
    try {
      const userId = normalizeInsightUserId(req.query.userId);
      if (!userId) return res.status(400).json({ error: "userId is required." });
      const rows = await storage.getUserComposedArticles(userId);
      return res.json(rows);
    } catch (error) {
      console.error("[API] /api/mypage/composed-articles failed:", error);
      return res.status(500).json({ error: "Failed to load composed articles." });
    }
  });

  app.post("/api/mypage/composed-articles", async (req, res) => {
    try {
      const userId = normalizeInsightUserId(req.body?.userId);
      const sourceArticleId = String(req.body?.sourceArticleId || "").trim().slice(0, 128);
      const sourceTitle = String(req.body?.sourceTitle || "").trim().slice(0, 220);
      const sourceUrl = String(req.body?.sourceUrl || "").trim().slice(0, 500);
      const userOpinion = String(req.body?.userOpinion || "").trim().slice(0, 2400);
      const extraRequest = String(req.body?.extraRequest || "").trim().slice(0, 600);
      const requestedReferences = normalizeStringArray(req.body?.requestedReferences, 8, 180);
      const generatedTitle = String(req.body?.generatedTitle || "").trim().slice(0, 220);
      const generatedSummary = String(req.body?.generatedSummary || "").trim().slice(0, 1000);
      const generatedContent = String(req.body?.generatedContent || "").trim().slice(0, 24000);
      const referenceLinks = normalizeStringArray(req.body?.referenceLinks, 12, 300);
      const status = String(req.body?.status || "draft").trim().toLowerCase() === "published" ? "published" : "draft";
      const submissionStatusRaw = String(req.body?.submissionStatus || "pending").trim().toLowerCase();
      const submissionStatus = ["pending", "approved", "rejected"].includes(submissionStatusRaw)
        ? (submissionStatusRaw as "pending" | "approved" | "rejected")
        : "pending";
      const sourceEmotion = toEmotion(req.body?.sourceEmotion);
      const sourceCategory = String(req.body?.sourceCategory || "").trim().slice(0, 120) || "General";

      if (!userId || !sourceArticleId || !sourceTitle || !userOpinion || !generatedTitle || !generatedSummary || !generatedContent) {
        return res.status(400).json({ error: "Required fields are missing." });
      }

      const row = await storage.createUserComposedArticle({
        userId,
        sourceArticleId,
        sourceTitle,
        sourceUrl,
        userOpinion,
        extraRequest,
        requestedReferences,
        generatedTitle,
        generatedSummary,
        generatedContent,
        referenceLinks,
        status,
        submissionStatus,
        sourceEmotion,
        sourceCategory,
      });
      return res.status(201).json(row);
    } catch (error) {
      console.error("[API] /api/mypage/composed-articles create failed:", error);
      return res.status(500).json({ error: "Failed to save composed article." });
    }
  });

  app.delete("/api/mypage/composed-articles/:id", async (req, res) => {
    try {
      const userId = normalizeInsightUserId(req.query.userId || req.body?.userId);
      if (!userId) return res.status(400).json({ error: "userId is required." });
      const articleId = String(req.params.id || "").trim();
      const deleted = await storage.deleteUserComposedArticle(userId, articleId);
      if (!deleted) return res.status(404).json({ error: "Composed article not found." });
      return res.json({ success: true });
    } catch (error) {
      console.error("[API] /api/mypage/composed-articles delete failed:", error);
      return res.status(500).json({ error: "Failed to delete composed article." });
    }
  });

  app.put("/api/mypage/composed-articles/:id", async (req, res) => {
    try {
      const userId = normalizeInsightUserId(req.query.userId || req.body?.userId);
      if (!userId) return res.status(400).json({ error: "userId is required." });
      const articleId = String(req.params.id || "").trim();
      if (!articleId) return res.status(400).json({ error: "article id is required." });

      const updates: Record<string, unknown> = {};
      if (typeof req.body?.generatedTitle === "string") updates.generatedTitle = req.body.generatedTitle;
      if (typeof req.body?.generatedSummary === "string") updates.generatedSummary = req.body.generatedSummary;
      if (typeof req.body?.generatedContent === "string") updates.generatedContent = req.body.generatedContent;
      if (typeof req.body?.userOpinion === "string") updates.userOpinion = req.body.userOpinion;
      if (typeof req.body?.extraRequest === "string") updates.extraRequest = req.body.extraRequest;
      if (Array.isArray(req.body?.requestedReferences)) updates.requestedReferences = req.body.requestedReferences;
      if (Array.isArray(req.body?.referenceLinks)) updates.referenceLinks = req.body.referenceLinks;
      if (typeof req.body?.sourceTitle === "string") updates.sourceTitle = req.body.sourceTitle;
      if (typeof req.body?.sourceUrl === "string") updates.sourceUrl = req.body.sourceUrl;
      if (typeof req.body?.status === "string") {
        updates.status = String(req.body.status).trim().toLowerCase() === "published" ? "published" : "draft";
      }
      if (typeof req.body?.sourceCategory === "string") updates.sourceCategory = req.body.sourceCategory;
      if (typeof req.body?.sourceEmotion === "string") updates.sourceEmotion = toEmotion(req.body.sourceEmotion);

      const updated = await storage.updateUserComposedArticle(userId, articleId, updates);
      if (!updated) return res.status(404).json({ error: "Composed article not found." });
      return res.json(updated);
    } catch (error) {
      console.error("[API] /api/mypage/composed-articles/:id update failed:", error);
      return res.status(500).json({ error: "Failed to update composed article." });
    }
  });

  app.get("/api/admin/reader-articles", async (req, res) => {
    try {
      const statusRaw = String(req.query.status || "").trim().toLowerCase();
      const status = ["pending", "approved", "rejected"].includes(statusRaw)
        ? (statusRaw as "pending" | "approved" | "rejected")
        : undefined;
      const rows = await storage.getReaderComposedArticles(status);
      return res.json(rows);
    } catch (error) {
      console.error("[API] /api/admin/reader-articles failed:", error);
      return res.status(500).json({ error: "Failed to load reader articles." });
    }
  });

  app.post("/api/admin/reader-articles/:id/decision", async (req, res) => {
    try {
      const articleId = String(req.params.id || "").trim();
      if (!articleId) return res.status(400).json({ error: "articleId is required." });
      const submissionStatusRaw = String(req.body?.submissionStatus || "").trim().toLowerCase();
      if (!["pending", "approved", "rejected"].includes(submissionStatusRaw)) {
        return res.status(400).json({ error: "submissionStatus must be pending|approved|rejected." });
      }
      const moderationMemo = String(req.body?.moderationMemo || "").trim().slice(0, 1200);
      const reviewedBy = resolveActor(req).actorId || "admin";
      const updated = await storage.updateReaderComposedArticleDecision(articleId, {
        submissionStatus: submissionStatusRaw as "pending" | "approved" | "rejected",
        moderationMemo,
        reviewedBy,
      });
      if (!updated) return res.status(404).json({ error: "Reader article not found." });
      return res.json(updated);
    } catch (error) {
      console.error("[API] /api/admin/reader-articles/:id/decision failed:", error);
      return res.status(500).json({ error: "Failed to update reader article decision." });
    }
  });

  app.get("/api/billing/subscription/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required." });
    res.json(subscriptionFallback.get(userId) || { status: "inactive", plan: "free", periodEnd: null });
  });

  app.post("/api/billing/subscribe", async (req, res) => {
    const { userId, plan = "premium" } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required." });
    const safePlan: SubscriptionPlan = plan === "premium" ? "premium" : "free";
    const periodEnd = safePlan === "premium" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
    const payload = { status: safePlan === "premium" ? "active" as const : "inactive" as const, plan: safePlan, periodEnd };
    subscriptionFallback.set(String(userId), payload);
    res.json(payload);
  });

  app.get("/api/role-requests", async (req, res) => {
    const status = req.query.status as RoleRequestStatus | undefined;
    const rows = roleRequestFallback
      .filter((item) => (status ? item.status === status : true))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(rows);
  });

  app.post("/api/role-requests", async (req, res) => {
    const { userId, email, requestedRole, reason } = req.body || {};
    if (!userId || !["journalist", "admin"].includes(requestedRole)) {
      return res.status(400).json({ error: "userId and valid requestedRole are required." });
    }
    const row = {
      id: randomUUID(),
      userId: String(userId),
      email: String(email || ""),
      requestedRole: requestedRole as RoleType,
      reason: String(reason || ""),
      status: "pending" as RoleRequestStatus,
      createdAt: new Date().toISOString(),
    };
    roleRequestFallback.push(row);
    res.status(201).json({ id: row.id, status: row.status, createdAt: row.createdAt });
  });

  app.post("/api/role-requests/:id/decision", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status." });
    const target = roleRequestFallback.find((item) => item.id === id);
    if (!target) return res.status(404).json({ error: "Role request not found." });
    target.status = status as RoleRequestStatus;
    res.json({ id, status });
  });

  app.post("/api/auth/phone/resend", async (req, res) => {
    const phone = String(req.body?.phone || "").trim();
    if (!phone) return res.status(400).json({ error: "phone is required." });

    const now = Date.now();
    const dayKey = new Date(now).toISOString().slice(0, 10);
    const current = phoneOtpFallback.get(phone);
    const normalizedCurrent = current && current.dayKey !== dayKey ? { ...current, dayKey, dailyCount: 0 } : current;

    if (normalizedCurrent && now < normalizedCurrent.cooldownUntil) {
      return res.status(429).json({
        error: "OTP resend cooldown is active.",
        code: "OTP_COOLDOWN",
        retryAfterSeconds: Math.ceil((normalizedCurrent.cooldownUntil - now) / 1000),
      });
    }

    if ((normalizedCurrent?.dailyCount || 0) >= 5) {
      return res.status(429).json({
        error: "Daily OTP resend limit reached.",
        code: "OTP_RATE_LIMIT",
        retryAfterSeconds: 24 * 60 * 60,
      });
    }

    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    const payload = {
      code,
      expiresAt: now + 5 * 60 * 1000,
      cooldownUntil: now + 60 * 1000,
      dailyCount: (normalizedCurrent?.dailyCount || 0) + 1,
      dayKey,
    };
    phoneOtpFallback.set(phone, payload);

    console.log(`[OTP-DEMO] phone=${phone} code=${code}`);

    res.json({
      success: true,
      cooldownSeconds: 60,
      remainingAttempts: Math.max(0, 5 - payload.dailyCount),
      previewCode: code,
    });
  });

  app.post("/api/auth/phone/verify", async (req, res) => {
    const phone = String(req.body?.phone || "").trim();
    const otp = String(req.body?.otp || "").trim();
    if (!phone || !otp) return res.status(400).json({ error: "phone and otp are required." });

    const current = phoneOtpFallback.get(phone);
    if (!current) return res.status(400).json({ error: "OTP was not requested.", code: "OTP_NOT_REQUESTED" });
    if (Date.now() > current.expiresAt) return res.status(400).json({ error: "OTP expired.", code: "OTP_EXPIRED" });
    if (current.code !== otp) return res.status(400).json({ error: "OTP mismatch.", code: "OTP_MISMATCH" });

    phoneOtpFallback.delete(phone);
    res.json({ success: true });
  });

  app.post("/api/auth/consent", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const termsRequired = Boolean(req.body?.termsRequired);
    const privacyRequired = Boolean(req.body?.privacyRequired);
    const marketingOptional = Boolean(req.body?.marketingOptional);
    const termsVersion = String(req.body?.termsVersion || "").trim();

    if (!email) return res.status(400).json({ error: "email is required." });
    if (!termsRequired || !privacyRequired) {
      return res.status(400).json({ error: "Required consents are missing.", code: "CONSENT_REQUIRED" });
    }
    if (!termsVersion) {
      return res.status(400).json({ error: "termsVersion is required.", code: "CONSENT_VERSION_REQUIRED" });
    }

    const saved = await storage.saveUserConsent({
      email,
      termsRequired,
      privacyRequired,
      marketingOptional,
      termsVersion,
    });
    res.status(201).json({
      success: true,
      consent: {
        ...saved,
        createdAt: new Date(saved.createdAt).toISOString(),
      },
    });
  });

  app.post("/api/auth/find-id", async (req, res) => {
    const phone = String(req.body?.phone || "").trim();
    const otp = String(req.body?.otp || "").trim();
    if (!phone || !otp) return res.status(400).json({ error: "phone and otp are required." });

    const current = phoneOtpFallback.get(phone);
    if (!current) return res.status(400).json({ error: "OTP was not requested.", code: "OTP_NOT_REQUESTED" });
    if (Date.now() > current.expiresAt) return res.status(400).json({ error: "OTP expired.", code: "OTP_EXPIRED" });
    if (current.code !== otp) return res.status(400).json({ error: "OTP mismatch.", code: "OTP_MISMATCH" });

    phoneOtpFallback.delete(phone);
    const emails = demoPhoneToEmails.get(phone) || ["guest.account@example.com"];
    const maskedEmails = emails.slice(0, 3).map((email) => {
      const [id, domain] = email.split("@");
      if (!id || !domain) return email;
      const head = id.slice(0, Math.min(2, id.length));
      return `${head}${"*".repeat(Math.max(1, id.length - head.length))}@${domain}`;
    });
    res.json({ maskedEmails });
  });

  app.post("/api/auth/reset-password/request", async (req, res) => {
    const phone = String(req.body?.phone || "").trim();
    const otp = String(req.body?.otp || "").trim();
    if (!phone || !otp) return res.status(400).json({ error: "phone and otp are required." });

    const current = phoneOtpFallback.get(phone);
    if (!current) return res.status(400).json({ error: "OTP was not requested.", code: "OTP_NOT_REQUESTED" });
    if (Date.now() > current.expiresAt) return res.status(400).json({ error: "OTP expired.", code: "OTP_EXPIRED" });
    if (current.code !== otp) return res.status(400).json({ error: "OTP mismatch.", code: "OTP_MISMATCH" });

    phoneOtpFallback.delete(phone);
    const token = randomUUID();
    demoResetTokens.set(token, { phone, expiresAt: Date.now() + 10 * 60 * 1000 });
    res.json({ success: true, resetToken: token });
  });

  app.post("/api/auth/reset-password/confirm", async (req, res) => {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "token, newPassword, confirmPassword are required." });
    }

    const tokenRow = demoResetTokens.get(token);
    if (!tokenRow) return res.status(400).json({ error: "Invalid reset token.", code: "AUTH_RESET_TOKEN_EXPIRED" });
    if (Date.now() > tokenRow.expiresAt) {
      demoResetTokens.delete(token);
      return res.status(400).json({ error: "Expired reset token.", code: "AUTH_RESET_TOKEN_EXPIRED" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match.", code: "AUTH_PASSWORD_CONFIRM_MISMATCH" });
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ error: "Weak password.", code: "AUTH_WEAK_PASSWORD" });
    }

    demoResetTokens.delete(token);
    res.json({ success: true, message: "Password changed (demo)." });
  });

  app.post("/api/ai/generate-news", async (req, res) => {
    const requestStartedAt = Date.now();
    const emotion = toEmotion(req.body?.emotion);
    const roleHeader = typeof req.headers?.["x-actor-role"] === "string"
      ? String(req.headers["x-actor-role"]).trim().toLowerCase()
      : "";
    if (!["journalist", "admin"].includes(roleHeader)) {
      return res.status(403).json({
        error: "AI 뉴스 생성 권한이 없습니다.",
        code: "AI_NEWS_FORBIDDEN",
        retryable: false,
      });
    }
    trackAiNewsMetric(emotion, "requests");

    const profile = EMOTION_NEWS_CATEGORY_PROFILE[emotion];
    const baseKeywordList = emotion === "spectrum"
      ? (["immersion", "clarity", "serenity", "vibrance", "gravity"] as EmotionType[])
        .flatMap((emotionKey) => EMOTION_NEWS_CATEGORY_PROFILE[emotionKey].keywords.slice(0, 1))
      : profile.keywords.slice(0, 3);
    const keywordList = buildEmotionKeywordQueryList(emotion, baseKeywordList, emotion === "spectrum" ? 10 : 8);
    const issueFetches = await Promise.all(
      keywordList.map((keyword) => fetchKeywordNewsArticles(keyword, 3, 7000)),
    );
    const rssFallbackCount = issueFetches.filter((row) => row.fallbackUsed).length;
    if (rssFallbackCount > 0) {
      trackAiNewsMetric(emotion, "rssFallbacks", rssFallbackCount);
    }
    const groundedIssuePool: KeywordNewsArticle[] = [];
    const seenIssueKeys = new Set<string>();
    for (const fetched of issueFetches) {
      const shouldExcludeForGeneration =
        fetched.fallbackUsed ||
        String(fetched.diagnostics?.reason || "").includes("keyword_filter_empty_fallback_to_top_feed");
      if (shouldExcludeForGeneration) continue;
      for (const article of fetched.articles || []) {
        const key = `${article.url || ""}|${article.title || ""}`.toLowerCase();
        if (!key.trim() || seenIssueKeys.has(key)) continue;
        seenIssueKeys.add(key);
        if (/^https?:\/\//i.test(String(article.url || "").trim())) {
          groundedIssuePool.push(article);
        }
      }
    }
    const selectedIssues = groundedIssuePool.slice(0, 3);
    if (selectedIssues.length === 0) {
      void appendAiNewsCompareLog({
        ts: new Date().toISOString(),
        emotion,
        model: FIXED_GEMINI_NEWS_TEXT_MODEL,
        status: "blocked",
        reasonCode: "AI_NEWS_REFERENCE_UNAVAILABLE",
        latencyMs: Date.now() - requestStartedAt,
        keywords: keywordList,
        selectedIssueCount: 0,
        issueFetches: issueFetches.map((row) => ({
          keyword: row.keyword,
          fallbackUsed: row.fallbackUsed,
          diagnostics: row.diagnostics?.reason,
        })),
      });
      console.warn("[AI] generate-news reference unavailable:", {
        emotion,
        keywords: keywordList,
        diagnostics: issueFetches.map((row) => ({ keyword: row.keyword, fallbackUsed: row.fallbackUsed, diagnostics: row.diagnostics })),
      });
      return res.status(503).json({
        error: "신뢰 가능한 레퍼런스 뉴스 수집에 실패해 AI 생성을 중단했습니다. 잠시 후 다시 시도해 주세요.",
        code: "AI_NEWS_REFERENCE_UNAVAILABLE",
        retryable: true,
      });
    }
    const issueContext = selectedIssues.map((issue, idx) => ({
      idx: idx + 1,
      title: issue.title,
      summary: issue.summary,
      source: issue.source,
      url: issue.url,
    }));
    const prompt = [
      "당신은 뉴스 에디터입니다.",
      "감정 키는 사실을 바꾸지 않고 표현 강도/서술 밀도/자극도만 조절합니다.",
      `아래 실시간 이슈 목록을 기준으로 '${profile.category}' 카테고리의 짧은 속보형 기사 3개를 한국어로 생성하세요.`,
      "각 기사의 핵심 사실은 반드시 제공된 이슈를 기반으로 구성하세요.",
      "반드시 사실형 문체를 사용하고 과장/선동 표현을 피하세요.",
      `감정 모드: ${emotion}`,
      "감정 모드 운영 원칙:",
      ...profile.toneRules.map((rule) => `- ${rule}`),
      "응답은 JSON only 형식이어야 하며 아래 스키마를 따르세요.",
      `category: ${profile.category}`,
      `realtimeIssues: ${JSON.stringify(issueContext)}`,
      '{"items":[{"title":"string","summary":"string","content":"string","source":"string","sourceCitation":[{"title":"string","url":"string","source":"string"}]}]}',
      "제약:",
      "- title: 18~58자 권장",
      "- summary: 45~120자 (짧고 명료하게)",
      "- content: 2개 짧은 문단, 총 180~360자",
      "- source: 'HueBrief AI' 또는 신뢰 가능한 출처명",
      "- sourceCitation: 각 기사당 정확히 1개, title/url/source를 모두 포함",
      "- sourceCitation.url은 반드시 realtimeIssues에 제공된 URL만 사용",
      "- realtimeIssues 제목/요약 문장을 그대로 복사하지 말고 재서술(패러프레이즈)할 것",
      "- 기사 제목/본문에서 레퍼런스 제목/요약의 문장 구조를 그대로 모사하지 말 것",
      "- 기사마다 다른 이슈를 중심으로 작성하고, 중복 서술을 피하세요.",
    ].join("\n");

    try {
      const modelResult = await generateGeminiNewsText(prompt);
      const loggedModel = modelResult.modelUsed || FIXED_GEMINI_NEWS_TEXT_MODEL;
      const text = modelResult.text;
      if (!text) {
        void appendAiNewsCompareLog({
          ts: new Date().toISOString(),
          emotion,
          model: loggedModel,
          status: "fallback",
          reasonCode: modelResult.reasonCode || "AI_NEWS_MODEL_EMPTY",
          latencyMs: Date.now() - requestStartedAt,
          keywords: keywordList,
          selectedIssueCount: selectedIssues.length,
          issueFetches: issueFetches.map((row) => ({
            keyword: row.keyword,
            fallbackUsed: row.fallbackUsed,
            diagnostics: row.diagnostics?.reason,
          })),
        });
        trackAiNewsMetric(emotion, "modelEmpty");
        trackAiNewsMetric(emotion, "fallbackRecoveries");
        return res.json(buildEmotionNewsFallback(emotion, selectedIssues, modelResult.reasonCode || "AI_NEWS_MODEL_EMPTY"));
      }
      const parsed = parseJsonFromModelText<{ items?: unknown }>(text);
      let normalized = normalizeEmotionGeneratedNewsItems(parsed || text, emotion, selectedIssues);
      let repairedTextPreview = "";
      if (!normalized || normalized.length === 0) {
        const repairResult = await repairGeminiNewsJson(text, Math.min(16000, Math.max(10000, aiNewsSettings.modelTimeoutMs - 8000)));
        const repairedText = String(repairResult.text || "").trim();
        repairedTextPreview = repairedText.slice(0, 600);
        if (repairedText) {
          const repairedParsed = parseJsonFromModelText<{ items?: unknown }>(repairedText);
          normalized = normalizeEmotionGeneratedNewsItems(repairedParsed || repairedText, emotion, selectedIssues);
        }
      }
      if (!normalized || normalized.length === 0) {
        console.warn("[AI] generate-news parse fallback:", {
          emotion,
          parsedType: parsed ? (Array.isArray(parsed) ? "array" : typeof parsed) : "null",
          textPreview: String(text || "").slice(0, 600),
        });
        void appendAiNewsParseFailLog({
          ts: new Date().toISOString(),
          emotion,
          model: loggedModel,
          reasonCode: "AI_NEWS_PARSE_FALLBACK",
          latencyMs: Date.now() - requestStartedAt,
          promptPreview: prompt.slice(0, 1200),
          modelTextPreview: String(text || "").slice(0, 2000),
          repairedTextPreview,
        });
        void appendAiNewsCompareLog({
          ts: new Date().toISOString(),
          emotion,
          model: loggedModel,
          status: "fallback",
          reasonCode: "AI_NEWS_PARSE_FALLBACK",
          latencyMs: Date.now() - requestStartedAt,
          keywords: keywordList,
          selectedIssueCount: selectedIssues.length,
          issueFetches: issueFetches.map((row) => ({
            keyword: row.keyword,
            fallbackUsed: row.fallbackUsed,
            diagnostics: row.diagnostics?.reason,
          })),
        });
        trackAiNewsMetric(emotion, "parseFailures");
        trackAiNewsMetric(emotion, "fallbackRecoveries");
        return res.json(buildEmotionNewsFallback(emotion, selectedIssues, "AI_NEWS_PARSE_FALLBACK"));
      }
      const quality = evaluateEmotionNewsQuality(normalized);
      if (!quality.pass) {
        void appendAiNewsCompareLog({
          ts: new Date().toISOString(),
          emotion,
          model: loggedModel,
          status: "blocked",
          reasonCode: quality.reasonCode || "AI_NEWS_QUALITY_BLOCKED",
          latencyMs: Date.now() - requestStartedAt,
          keywords: keywordList,
          selectedIssueCount: selectedIssues.length,
          issueFetches: issueFetches.map((row) => ({
            keyword: row.keyword,
            fallbackUsed: row.fallbackUsed,
            diagnostics: row.diagnostics?.reason,
          })),
        });
        trackAiNewsMetric(emotion, "qualityBlocks");
        trackAiNewsMetric(emotion, "fallbackRecoveries");
        return res.json(buildEmotionNewsFallback(emotion, selectedIssues, quality.reasonCode || "AI_NEWS_QUALITY_BLOCKED"));
      }
      const referencePolicy = evaluateEmotionNewsReferencePolicy(normalized, selectedIssues);
      if (!referencePolicy.pass) {
        void appendAiNewsCompareLog({
          ts: new Date().toISOString(),
          emotion,
          model: loggedModel,
          status: "blocked",
          reasonCode: referencePolicy.reasonCode || "AI_NEWS_REFERENCE_POLICY_BLOCKED",
          latencyMs: Date.now() - requestStartedAt,
          keywords: keywordList,
          selectedIssueCount: selectedIssues.length,
          issueFetches: issueFetches.map((row) => ({
            keyword: row.keyword,
            fallbackUsed: row.fallbackUsed,
            diagnostics: row.diagnostics?.reason,
          })),
        });
        trackAiNewsMetric(emotion, "qualityBlocks");
        trackAiNewsMetric(emotion, "fallbackRecoveries");
        return res.json(buildEmotionNewsFallback(emotion, selectedIssues, referencePolicy.reasonCode || "AI_NEWS_REFERENCE_POLICY_BLOCKED"));
      }
      void appendAiNewsCompareLog({
        ts: new Date().toISOString(),
        emotion,
        model: loggedModel,
        status: "success",
        reasonCode: repairedTextPreview ? "AI_NEWS_PARSE_REPAIRED" : undefined,
        latencyMs: Date.now() - requestStartedAt,
        keywords: keywordList,
        selectedIssueCount: selectedIssues.length,
        issueFetches: issueFetches.map((row) => ({
          keyword: row.keyword,
          fallbackUsed: row.fallbackUsed,
          diagnostics: row.diagnostics?.reason,
        })),
      });
      trackAiNewsMetric(emotion, "success");
      return res.json(normalized);
    } catch (error) {
      console.warn("[AI] generate-news failed, fallback used:", error);
      void appendAiNewsCompareLog({
        ts: new Date().toISOString(),
        emotion,
        model: FIXED_GEMINI_NEWS_TEXT_MODEL,
        status: "error",
        reasonCode: "AI_NEWS_RUNTIME_FALLBACK",
        latencyMs: Date.now() - requestStartedAt,
        keywords: keywordList,
        selectedIssueCount: selectedIssues.length,
        issueFetches: issueFetches.map((row) => ({
          keyword: row.keyword,
          fallbackUsed: row.fallbackUsed,
          diagnostics: row.diagnostics?.reason,
        })),
      });
      trackAiNewsMetric(emotion, "fallbackRecoveries");
      return res.json(buildEmotionNewsFallback(emotion, selectedIssues, "AI_NEWS_RUNTIME_FALLBACK"));
    }
  });

  app.post("/api/ai/summarize-article", async (req, res) => {
    const content = String(req.body?.content || "");
    const title = String(req.body?.title || "Article");
    if (!content.trim()) {
      return res.status(400).json({ error: "content is required." });
    }

    const lines = content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const source = lines.length > 0 ? lines.join(" ") : content;
    const sentenceChunks = source
      .split(/(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const bullets = (sentenceChunks.length > 0 ? sentenceChunks : [source])
      .slice(0, 3)
      .map((text) => text.slice(0, 140));

    return res.json({
      title,
      summary: bullets.join("\n"),
      bullets,
    });
  });

  app.post("/api/ai/recommend-related", async (req, res) => {
    const articleId = String(req.body?.articleId || "");
    const emotion = toEmotion(req.body?.emotion);
    const category = String(req.body?.category || "").trim().toLowerCase();
    const all = await storage.getAllNews(false);

    const pool = all.filter((item) => item.id !== articleId);
    const sameCategory = category
      ? pool.filter((item) => (item.category || "").trim().toLowerCase() === category)
      : [];
    const balance = pool.filter((item) => item.emotion !== emotion);
    const merged = [...sameCategory, ...balance, ...pool];
    const unique: typeof merged = [];
    const seen = new Set<string>();
    for (const item of merged) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      unique.push(item);
      if (unique.length >= 6) break;
    }

    return res.json({
      recommendations: unique,
      strategy: {
        sameCategoryCount: sameCategory.length,
        balanceCount: balance.length,
      },
    });
  });

  app.post("/api/ai/generate/interactive-article", async (req, res) => {
    const body = req.body || {};
    if (!Array.isArray(body.keywords) || body.keywords.length === 0) {
      return res.status(400).json({ error: "keywords must be a non-empty array." });
    }

    const hasRawHtmlBypass = INTERACTIVE_HTML_BYPASS_KEYS.some((key) => {
      const value = body[key];
      return typeof value === "string" && INTERACTIVE_HTML_TAG_RE.test(value);
    });
    if (hasRawHtmlBypass) {
      return res.status(400).json({
        error: "Raw HTML payload is blocked. Submit Story Spec JSON only.",
        code: "INTERACTIVE_STORY_SPEC_ONLY",
        retryable: false,
      });
    }

    const input: InteractiveGenerationInput = {
      keywords: body.keywords,
      tone: body.tone || "analytical",
      targetAudience: body.targetAudience || "general reader",
      platform: body.platform || "web",
      interactionIntensity: body.interactionIntensity || "medium",
      language: body.language || "ko-KR",
      constraints: body.constraints,
    };

    let candidate: InteractiveArticle;
    try {
      candidate = parseStorySpecCandidate(body.storySpec) || buildInteractiveArticle(input);
    } catch (error: any) {
      const parseError = `invalid storySpec JSON: ${error?.message || "parse error"}`;
      const report = buildValidationReport([parseError], "parse");
      console.warn("[interactive-story-spec] parse failed", report);
      const fallback = buildInteractiveFallbackArticle(input, parseError);
      return res.json({ ...fallback, validationReport: report });
    }

    const validation = validateInteractiveArticle(candidate);
    if (!validation.valid) {
      const report = buildValidationReport(validation.errors, "validation");
      console.warn("[interactive-story-spec] validation failed", report);
      const fallback = buildInteractiveFallbackArticle(input, validation.errors.join("; "));
      return res.json({ ...fallback, validationReport: report });
    }

    candidate.qualityMeta.validationPassed = true;
    if (!candidate.qualityMeta.notes) candidate.qualityMeta.notes = "validated story spec";
    return res.json({
      ...candidate,
      validationReport: buildValidationReport([], "validation"),
    });
  });

  app.post("/api/ai/chat", async (req, res) => {
    const message = String(req.body?.message || "");
    const clientIdRaw = String(req.body?.clientId || req.ip || "anonymous");
    const clientId = clientIdRaw.slice(0, 128);
    const now = Date.now();
    const state = hueBotSessionState.get(clientId) || { cooldownUntil: 0, history: [] };
    state.history = state.history.filter((row) => now - row.ts <= hueBotPolicyWindowMs);

    const remainingSeconds = Math.max(0, Math.ceil((state.cooldownUntil - now) / 1000));
    if (remainingSeconds > 0) {
      hueBotSessionState.set(clientId, state);
      return res.json({
        text: "Cooldown is active for emotional safety. Let's pause and continue after the timer.",
        recommendation: "spectrum",
        intent: "balance_general",
        confidence: 0.4,
        followUp: "Take a short break and come back with one concrete fact you want to verify.",
        fallbackUsed: true,
        cooldownActive: true,
        cooldownRemainingSeconds: remainingSeconds,
        neutralPrompt: "What evidence source can you check first?",
      });
    }

    const result = classifyHueBotMessage(message);
    const biasWarning = detectBiasWarning(message);
    const sensitiveIntents: ChatIntent[] = ["anger_release", "anxiety_relief", "sadness_lift"];
    if (sensitiveIntents.includes(result.intent)) {
      state.history.push({ intent: result.intent, ts: now });
    }

    const sensitiveCount = state.history.filter((row) => sensitiveIntents.includes(row.intent)).length;
    if (sensitiveCount >= 3) {
      state.cooldownUntil = now + hueBotPolicyWindowMs;
      hueBotSessionState.set(clientId, state);
      return res.json({
        ...result,
        text: "For emotional balance, Hue Bot is applying a 15-minute cool-down.",
        cooldownActive: true,
        cooldownRemainingSeconds: Math.ceil(hueBotPolicyWindowMs / 1000),
        neutralPrompt: buildNeutralReQuestion(result.intent),
        biasWarning,
      });
    }

    hueBotSessionState.set(clientId, state);
    return res.json({
      ...result,
      cooldownActive: false,
      cooldownRemainingSeconds: 0,
      neutralPrompt: result.fallbackUsed || biasWarning ? buildNeutralReQuestion(result.intent) : undefined,
      biasWarning,
    });
  });

  app.post("/api/ai/analyze-keyword", async (req, res) => {
    const keyword = String(req.body?.keyword || "").trim();
    if (!keyword) return res.status(400).json({ error: "keyword is required." });

    const seed = normalizeKeywordSeed(keyword);
    const fallback = buildKeywordFallback(seed);

    const prompt = [
      "당신은 기자를 돕는 뉴스룸 어시스턴트입니다.",
      "키워드를 바탕으로 한국어 기사 기획 컨텍스트를 생성하세요.",
      "반드시 한국어로 작성하고, 아래 JSON 형식만 반환하세요.",
      `{"topics":["..."],"context":"..."}`,
      "규칙:",
      "- topics 길이: 4~6",
      "- 각 topic은 짧고 구체적으로 작성",
      "- context는 2~3문장, 실무적이고 사실 기반으로 작성",
      `키워드: ${seed}`,
    ].join("\n");

    const text = await generateGeminiText(prompt);
    const parsed = text ? parseJsonFromModelText<{ topics?: unknown; context?: unknown }>(text) : null;

    if (!parsed) {
      return res.status(502).json({
        error: "AI 초안 생성이 불안정합니다. 잠시 후 다시 시도해 주세요.",
        code: "AI_DRAFT_FALLBACK_BLOCKED",
        retryable: true,
      });
    }

    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.map((v) => String(v || "").trim()).filter(Boolean).slice(0, 6)
      : [];
    const context = String(parsed.context || "").trim();

    return res.json({
      topics: topics.length > 0 ? topics : fallback.topics,
      context: context || fallback.context,
      fallbackUsed: false,
    });
  });

  app.post("/api/ai/search-keyword-news", async (req, res) => {
    const keyword = String(req.body?.keyword || "").trim();
    if (!keyword) return res.status(400).json({ error: "keyword is required." });
    const fetched = await fetchKeywordNewsArticles(keyword, 5, 7000);
    return res.json(fetched);
  });

  app.post("/api/ai/generate-outline", async (req, res) => {
    const keyword = String(req.body?.keyword || "").trim();
    if (!keyword) return res.status(400).json({ error: "keyword is required." });
    const topics = Array.isArray(req.body?.topics)
      ? req.body.topics.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : [];
    const seed = normalizeKeywordSeed(keyword);
    const fallback = buildOutlineFallback(seed, topics);

    const prompt = [
      "당신은 뉴스룸 개요 작성 어시스턴트입니다.",
      "롱폼 인터랙티브 기사 개요를 한국어로 생성하세요.",
      "반드시 한국어로 작성하고, 아래 JSON 형식만 반환하세요.",
      `{"outline":"...","topics":["..."]}`,
      "규칙:",
      "- 번호형 개요 6~9줄",
      "- 흐름 포함: 핵심 이슈 -> 심화 시사점 -> 결론",
      "- 각 줄은 '무엇을 쓸지'가 보이도록 구체적으로 작성",
      "- URL, 출처명, 원문 제목 나열 금지",
      "- 문장형 키워드(예: 영향, 쟁점, 반론, 전망)를 포함",
      `키워드: ${seed}`,
      `참고 토픽: ${topics.join(", ")}`,
    ].join("\n");

    const text = await generateGeminiText(prompt);
    const parsed = text ? parseJsonFromModelText<{ outline?: unknown; topics?: unknown }>(text) : null;
    if (!parsed) return res.json({ ...fallback, fallbackUsed: true });

    const outline = String(parsed.outline || "").trim();
    const parsedTopics = Array.isArray(parsed.topics)
      ? parsed.topics.map((v) => String(v || "").trim()).filter(Boolean).slice(0, 6)
      : fallback.topics;

    return res.json({
      outline: outline || fallback.outline,
      topics: parsedTopics.length > 0 ? parsedTopics : fallback.topics,
      fallbackUsed: false,
    });
  });

  app.post("/api/ai/generate-draft", async (req, res) => {
    const keyword = String(req.body?.keyword || "").trim() || "topic";
    const mode = normalizeDraftMode(String(req.body?.mode || "draft").trim());
    trackDraftMetric(mode, "requests", { stage: "start", keyword });
    const selectedArticle = req.body?.selectedArticle && typeof req.body.selectedArticle === "object"
      ? {
        title: String(req.body.selectedArticle.title || "").trim(),
        summary: String(req.body.selectedArticle.summary || "").trim(),
        url: String(req.body.selectedArticle.url || "").trim(),
        source: String(req.body.selectedArticle.source || "").trim(),
      }
      : null;
    if (
      !selectedArticle ||
      !selectedArticle.title ||
      !selectedArticle.summary ||
      !selectedArticle.url ||
      !selectedArticle.source ||
      !/^https?:\/\//i.test(selectedArticle.url)
    ) {
      return res.status(400).json({
        error: "레퍼런스 기사(제목/요약/출처/URL)가 없으면 AI 기사 생성을 진행할 수 없습니다.",
        code: "AI_DRAFT_REFERENCE_REQUIRED",
        retryable: false,
      });
    }
    const regressionEnabled =
      process.env.ENABLE_AI_DRAFT_TEST_SCENARIO === "1" &&
      process.env.NODE_ENV !== "production";
    const regressionScenario = regressionEnabled
      ? String(req.headers["x-ai-draft-scenario"] || "").trim().toLowerCase()
      : "";

    if (regressionScenario) {
      if (regressionScenario === "draft-success" || regressionScenario === "longform-success") {
        const scenarioMode: DraftMode = regressionScenario === "draft-success" ? "draft" : "interactive-longform";
        if (scenarioMode !== mode) {
          return res.status(400).json({
            error: "요청 mode와 회귀 시나리오 mode가 일치하지 않습니다.",
            code: "AI_DRAFT_SCENARIO_MODE_MISMATCH",
            retryable: false,
            mode,
          });
        }

        const mockDraft = buildDraftRegressionMock(mode);
        trackDraftMetric(mode, "success", { scenario: regressionScenario });
        return res.json({
          title: mockDraft.title,
          content: `${mockDraft.content}\n\n[출처]\n- ${mockDraft.sourceCitation.source} (${mockDraft.sourceCitation.url})`,
          sections: mockDraft.sections,
          mediaSlots: mockDraft.mediaSlots,
          sourceCitation: mockDraft.sourceCitation,
          compliance: assessCompliance(mockDraft.content),
          fallbackUsed: false,
        });
      }

      if (regressionScenario === "draft-schema-block" || regressionScenario === "longform-schema-block") {
        const scenarioMode: DraftMode = regressionScenario === "draft-schema-block" ? "draft" : "interactive-longform";
        if (scenarioMode !== mode) {
          return res.status(400).json({
            error: "요청 mode와 회귀 시나리오 mode가 일치하지 않습니다.",
            code: "AI_DRAFT_SCENARIO_MODE_MISMATCH",
            retryable: false,
            mode,
          });
        }
        const invalidIssues = validateDraftByMode({
          mode,
          title: "",
          content: mode === "interactive-longform"
            ? "짧은 본문."
            : "긴본문".repeat(aiDraftGateSettings.draftMaxChars + 20),
          sections: { core: "", deepDive: "", conclusion: "" },
          mediaSlotsCount: 0,
        });
        trackDraftMetric(mode, "schemaBlocks", { scenario: regressionScenario, issues: invalidIssues.length });
        return res.status(502).json({
          error: "AI 초안이 모드별 생성 규칙을 충족하지 못했습니다. 다시 생성해 주세요.",
          code: "AI_DRAFT_SCHEMA_INVALID",
          retryable: true,
          mode,
          issues: invalidIssues,
        });
      }
    }

    const basePrompt = buildDraftGenerationPrompt({
      keyword,
      mode,
      selectedArticle,
    });

    const normalizeDraftText = (raw: string) =>
      String(raw || "")
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    const extractDraftTitle = (raw: string) => {
      const normalized = normalizeDraftText(raw);
      const bracket = normalized.match(/^\[(.+?)\]/);
      if (bracket?.[1]) return bracket[1].trim();
      const firstLine = normalized.split("\n").map((line) => line.trim()).find(Boolean) || "";
      if (firstLine.startsWith("제목:")) return firstLine.replace(/^제목:\s*/i, "").trim();
      return firstLine.slice(0, 60) || selectedArticle?.title || `${keyword} 분석`;
    };

    const defaultMediaSlots: DraftMediaSlot[] = mode === "interactive-longform"
      ? [
        {
          id: "m1",
          type: "image",
          anchorLabel: "core",
          position: "after",
          caption: "핵심 이슈를 설명하는 도입 이미지",
        },
        {
          id: "m2",
          type: "image",
          anchorLabel: "deepDive",
          position: "inline",
          caption: "심화 시사점을 보조하는 맥락 이미지",
        },
        {
          id: "m3",
          type: "video",
          anchorLabel: "conclusion",
          position: "before",
          caption: "결론 직전 핵심 정리 영상",
        },
      ]
      : [
        {
          id: "m1",
          type: "image",
          anchorLabel: "core",
          position: "after",
          caption: "핵심 이슈를 설명하는 도입 이미지",
        },
      ];

    const parseDraftResponse = (text: string) => {
      const parsed = parseJsonFromModelText<{
        title?: unknown;
        content?: unknown;
        sections?: { core?: unknown; deepDive?: unknown; conclusion?: unknown };
        sourceCitation?: { title?: unknown; url?: unknown; source?: unknown };
        mediaSlots?: Array<{
          id?: unknown;
          type?: unknown;
          anchorLabel?: unknown;
          position?: unknown;
          caption?: unknown;
        }>;
      }>(text);

      if (!parsed) {
        const recoveredContent = normalizeDraftText(text);
        if (recoveredContent.length < 320) {
          return {
            error: {
              status: 502,
              body: {
                error: "AI 응답을 기사 JSON으로 해석하지 못했습니다. 다시 시도해 주세요.",
                code: "AI_DRAFT_PARSE_BLOCKED",
                retryable: true,
              },
            },
          };
        }
        const recoveredTitle = extractDraftTitle(recoveredContent);
        const third = Math.max(1, Math.floor(recoveredContent.length / 3));
        return {
          data: {
            title: recoveredTitle,
            content: recoveredContent,
            fallbackUsed: true,
            sections: {
              core: recoveredContent.slice(0, third).trim(),
              deepDive: recoveredContent.slice(third, third * 2).trim(),
              conclusion: recoveredContent.slice(third * 2).trim(),
            },
            sourceCitation: {
              title: selectedArticle?.title || "",
              url: selectedArticle?.url || "",
              source: selectedArticle?.source || "출처 확인 필요",
            },
            mediaSlots: defaultMediaSlots,
          },
        };
      }

      const title = String(parsed.title || "").trim();
      const content = String(parsed.content || "").trim();
      if (!title || !content) {
        return {
          error: {
            status: 502,
            body: {
              error: "AI 초안 본문이 비어 있어 생성을 중단했습니다. 다시 시도해 주세요.",
              code: "AI_DRAFT_EMPTY_BLOCKED",
              retryable: true,
            },
          },
        };
      }

      const sections = {
        core: String(parsed.sections?.core || "").trim(),
        deepDive: String(parsed.sections?.deepDive || "").trim(),
        conclusion: String(parsed.sections?.conclusion || "").trim(),
      };
      const sourceCitation = {
        title: String(parsed.sourceCitation?.title || selectedArticle?.title || "").trim(),
        url: String(parsed.sourceCitation?.url || selectedArticle?.url || "").trim(),
        source: String(parsed.sourceCitation?.source || selectedArticle?.source || "").trim(),
      };
      const normalizedSlots = Array.isArray(parsed.mediaSlots)
        ? parsed.mediaSlots.slice(0, 5).map((slot, idx) => ({
          id: String(slot.id || `m${idx + 1}`),
          type: slot.type === "video" ? "video" as const : "image" as const,
          anchorLabel: ["core", "deepDive", "conclusion"].includes(String(slot.anchorLabel))
            ? String(slot.anchorLabel)
            : "deepDive",
          position: ["before", "inline", "after"].includes(String(slot.position))
            ? (String(slot.position) as "before" | "inline" | "after")
            : "inline",
          caption: String(slot.caption || "추천 미디어 배치"),
        }))
        : [];

      return {
        data: {
          title,
          content,
          fallbackUsed: false,
          sections,
          sourceCitation,
          mediaSlots: normalizedSlots.length > 0 ? normalizedSlots : defaultMediaSlots,
        },
      };
    };

    let finalDraft: {
      title: string;
      content: string;
      fallbackUsed: boolean;
      sections: { core: string; deepDive: string; conclusion: string };
      sourceCitation: { title: string; url: string; source: string };
      mediaSlots: DraftMediaSlot[];
    } | null = null;
    let similarityIssues: DraftSimilarityIssue[] = [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const retryInstruction = attempt === 0
        ? ""
        : [
          "",
          "[재생성 지시]",
          "직전 결과는 참고 기사와 유사도가 높아 차단되었습니다.",
          "제목은 참고 기사와 동일/유사한 단어 조합을 피하고 새롭게 작성하세요.",
          "문단 순서와 문장 시작 표현을 새롭게 바꾸되 사실관계는 유지하세요.",
        ].join("\n");
      const prompt = `${basePrompt}${retryInstruction}`;
      const text = await generateGeminiText(prompt);

      if (!text) {
        trackDraftMetric(mode, "modelEmpty", { attempt });
        return res.status(502).json({
          error: "AI 모델 응답이 비어 있어 초안 생성을 중단했습니다. 잠시 후 다시 시도해 주세요.",
          code: "AI_DRAFT_MODEL_EMPTY",
          retryable: true,
          attempt,
        });
      }

      const parsedResult = parseDraftResponse(text);
      if ("error" in parsedResult && parsedResult.error) {
        if (parsedResult.error.body?.code === "AI_DRAFT_PARSE_BLOCKED") {
          trackDraftMetric(mode, "parseFailures", { attempt });
        }
        return res.status(parsedResult.error.status).json(parsedResult.error.body);
      }
      if (!("data" in parsedResult) || !parsedResult.data) {
        return res.status(502).json({
          error: "AI 초안 생성 중 예기치 않은 처리 오류가 발생했습니다.",
          code: "AI_DRAFT_PROCESSING_FAILED",
          retryable: true,
        });
      }

      const draftValidationIssues = validateDraftByMode({
        mode,
        title: parsedResult.data.title,
        content: parsedResult.data.content,
        sections: parsedResult.data.sections,
        mediaSlotsCount: parsedResult.data.mediaSlots.length,
      });
      if (draftValidationIssues.length > 0) {
        trackDraftMetric(mode, "schemaBlocks", { attempt, issues: draftValidationIssues.length });
        return res.status(502).json({
          error: "AI 초안이 모드별 생성 규칙을 충족하지 못했습니다. 다시 생성해 주세요.",
          code: "AI_DRAFT_SCHEMA_INVALID",
          retryable: true,
          mode,
          issues: draftValidationIssues,
        });
      }

      similarityIssues = evaluateDraftSimilarity({
        selectedArticle: selectedArticle
          ? { title: selectedArticle.title, summary: selectedArticle.summary }
          : null,
        generatedTitle: parsedResult.data.title,
        generatedContent: parsedResult.data.content,
      });

      if (similarityIssues.length > 0) {
        console.warn("[AI] Draft similarity gate blocked:", {
          keyword,
          mode,
          attempt,
          issues: similarityIssues,
        });
        if (attempt === 0) {
          trackDraftMetric(mode, "retries", { reason: "similarity", attempt });
          continue;
        }
        trackDraftMetric(mode, "similarityBlocks", { attempt, issues: similarityIssues.length });
        return res.status(502).json({
          error: "생성 초안이 참고 기사와 유사해 차단되었습니다. 다시 시도해 주세요.",
          code: "AI_DRAFT_SIMILARITY_BLOCKED",
          retryable: true,
          mode,
          issues: similarityIssues,
          retried: true,
        });
      }

      finalDraft = parsedResult.data;
      break;
    }

    if (!finalDraft) {
      return res.status(502).json({
        error: "AI 초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        code: "AI_DRAFT_GENERATION_FAILED",
        retryable: true,
        mode,
      });
    }

    const draftedContentWithSource = `${finalDraft.content}\n\n[출처]\n- ${finalDraft.sourceCitation.source || "출처 확인 필요"}${finalDraft.sourceCitation.url ? ` (${finalDraft.sourceCitation.url})` : ""}`;
    const compliance = assessCompliance(draftedContentWithSource);
    if (compliance.publishBlocked) {
      trackDraftMetric(mode, "complianceBlocks", { riskLevel: compliance.riskLevel, flagCount: compliance.flags.length });
      return res.status(409).json({
        error: "컴플라이언스 고위험 항목이 감지되어 발행이 차단되었습니다. 문구를 수정 후 다시 생성해 주세요.",
        code: "AI_DRAFT_COMPLIANCE_BLOCKED",
        retryable: true,
        mode,
        compliance,
      });
    }
    if (finalDraft.fallbackUsed) {
      trackDraftMetric(mode, "fallbackRecoveries", { stage: "parse_recovery" });
    }
    trackDraftMetric(mode, "success", { fallbackUsed: finalDraft.fallbackUsed });

    return res.json({
      title: finalDraft.title,
      content: draftedContentWithSource,
      sections: {
        core: finalDraft.sections.core || "",
        deepDive: finalDraft.sections.deepDive || "",
        conclusion: finalDraft.sections.conclusion || "",
      },
      mediaSlots: finalDraft.mediaSlots,
      sourceCitation: {
        title: finalDraft.sourceCitation.title || "",
        url: finalDraft.sourceCitation.url || "",
        source: finalDraft.sourceCitation.source || "출처 확인 필요",
      },
      compliance,
      fallbackUsed: finalDraft.fallbackUsed,
    });
  });

  app.post("/api/ai/check-grammar", async (req, res) => {
    const content = String(req.body?.content || "");
    res.json({ correctedText: content, errors: [] });
  });

  app.post("/api/ai/share-keyword-pack", async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const summary = String(req.body?.summary || "").trim();
    const content = String(req.body?.content || "").trim();
    const category = String(req.body?.category || "").trim();
    const emotion = String(req.body?.emotion || "").trim();

    if (!title && !summary && !content) {
      return res.status(400).json({ error: "title/summary/content 중 최소 1개가 필요합니다." });
    }

    const fallback = buildShareKeywordPackFallback({
      title,
      summary,
      content,
      category,
      emotion,
    });

    const prompt = [
      "아래 기사 데이터에서 제목 편향을 최소화하고 본문 중심으로 키워드/해시태그를 생성하세요.",
      "출력은 반드시 JSON 객체 1개만 반환합니다.",
      `입력 제목: ${title || "(없음)"}`,
      `입력 요약: ${summary || "(없음)"}`,
      `입력 본문: ${(content || "").slice(0, 5000) || "(없음)"}`,
      `카테고리: ${category || "(없음)"}`,
      `감정 라벨: ${emotion || "(없음)"}`,
      "요구사항:",
      "1) representativeKeywords: 본문 전체를 대표하는 핵심 키워드 5~8개, 일반명사 남발 금지",
      "2) viralHashtags: SNS 노출 증대를 위한 해시태그용 토큰 7~10개, broad+niche+context 혼합",
      "3) 각 항목은 문자열 배열로 반환, '#' 없이 토큰만 반환",
      "4) 중복/불용어/숫자-only 토큰 제거",
      "JSON Schema:",
      '{"representativeKeywords": ["..."], "viralHashtags": ["..."]}',
    ].join("\n");

    try {
      const modelText = await generateGeminiText(prompt);
      const parsed = parseJsonFromModelText<{
        representativeKeywords?: unknown;
        viralHashtags?: unknown;
      }>(String(modelText || ""));

      const representativeKeywords = sanitizeShareTokens(parsed?.representativeKeywords, 5, 8);
      const viralHashtags = sanitizeShareTokens(parsed?.viralHashtags, 7, 10);

      const normalizedKeywords = representativeKeywords.length >= 5
        ? representativeKeywords.slice(0, 8)
        : fallback.representativeKeywords;
      const normalizedViral = viralHashtags.length >= 7
        ? viralHashtags.slice(0, 10)
        : fallback.viralHashtags;

      const fallbackUsed = !modelText || representativeKeywords.length < 5 || viralHashtags.length < 7;
      return res.json({
        representativeKeywords: normalizedKeywords,
        viralHashtags: normalizedViral,
        fallbackUsed,
      });
    } catch (error) {
      console.warn("[AI] share-keyword-pack failed, fallback used:", error);
      return res.json({
        representativeKeywords: fallback.representativeKeywords,
        viralHashtags: fallback.viralHashtags,
        fallbackUsed: true,
      });
    }
  });

  app.post("/api/ai/generate-hashtags", async (req, res) => {
    const content = String(req.body?.content || "");
    const base = content.split(" ").filter(Boolean).slice(0, 3);
    res.json({ hashtags: ["#HueBrief", "#AI", ...base.map((w) => `#${w.replace(/[^\w가-힣]/g, "")}`)] });
  });

  app.post("/api/ai/optimize-titles", async (req, res) => {
    const content = String(req.body?.content || "기사");
    const seed = content.replace(/\s+/g, " ").trim().slice(0, 40) || "핵심 이슈";
    res.json({
      titles: [
        { platform: "interactive", title: `${seed} 핵심 정리` },
        { platform: "interactive", title: `${seed}: 배경과 쟁점` },
        { platform: "interactive", title: `${seed}, 지금 확인할 3가지` },
      ],
    });
  });

  app.post("/api/ai/compliance-check", async (req, res) => {
    const content = String(req.body?.content || "");
    if (!content.trim()) {
      return res.status(400).json({ error: "content is required." });
    }

    res.json(assessCompliance(content));
  });

  app.post("/api/ai/analyze-sentiment", async (req, res) => {
    const content = String(req.body?.content || "");
    const len = Math.max(content.length, 1);
    const vibrance = Math.min(100, 20 + (len % 25));
    const immersion = Math.min(100, 20 + (len % 17));
    const clarity = Math.min(100, 20 + (len % 19));
    const gravity = Math.min(100, 20 + (len % 13));
    const serenity = Math.max(0, 100 - Math.floor((vibrance + immersion + clarity + gravity) / 4));
    const entries: Array<[EmotionType, number]> = [["vibrance", vibrance], ["immersion", immersion], ["clarity", clarity], ["gravity", gravity], ["serenity", serenity]];
    const dominantEmotion = entries.sort((a, b) => b[1] - a[1])[0][0];
    res.json({ vibrance, immersion, clarity, gravity, serenity, dominantEmotion, feedback: "데모 감정 분석 결과입니다." });
  });

  app.post("/api/ai/translate", async (req, res) => {
    const text = String(req.body?.text || "");
    const targetLang = String(req.body?.targetLang || "ko");
    res.json({ translatedText: `[${targetLang}] ${text}` });
  });

  app.post("/api/ai/generate-image", async (req, res) => {
    const articleContent = String(req.body?.articleContent || "news");
    const customPrompt = String(req.body?.customPrompt || "").trim();
    const count = Math.min(Number(req.body?.count || 3), 4);
    const prompts = buildNarrativeImagePrompts(articleContent, count, customPrompt);

    const images: Array<{
      url: string;
      description: string;
      prompt: string;
      provider: string;
      model: string;
      width: number | null;
      height: number | null;
      aspectRatioObserved: string;
    }> = [];
    const failures: Array<{ index: number; detail: string; prompt: string }> = [];

    for (let i = 0; i < prompts.length; i += 1) {
      const prompt = prompts[i];
      try {
        const generatedImage = await generateGeminiImageWithRetry(prompt, 3);
        const dims = extractImageDimensionsFromDataUrl(generatedImage.dataUrl);
        const ratio = dims ? (dims.width / Math.max(1, dims.height)) : null;
        images.push({
          url: generatedImage.dataUrl,
          description: `흐름 이미지 ${i + 1} (${["도입", "배경", "영향", "결론"][Math.min(i, 3)]})`,
          prompt,
          provider: "gemini",
          model: generatedImage.model,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          aspectRatioObserved: ratio ? ratio.toFixed(4) : "unknown",
        });
      } catch (error: any) {
        failures.push({
          index: i,
          detail: String(error?.message || "unknown"),
          prompt,
        });
      }
    }

    if (images.length === 0) {
      const detail = String(failures[0]?.detail || "unknown");
      const lowerDetail = detail.toLowerCase();
      const isOverloaded =
        lowerDetail.includes("high demand") ||
        lowerDetail.includes("overloaded") ||
        lowerDetail.includes("try again later") ||
        lowerDetail.includes("resource exhausted") ||
        lowerDetail.includes("429") ||
        lowerDetail.includes("503");
      const isTemporaryFailure =
        isOverloaded ||
        lowerDetail.includes("abort") ||
        lowerDetail.includes("timed out") ||
        lowerDetail.includes("timeout") ||
        lowerDetail.includes("deadline") ||
        lowerDetail.includes("unavailable");
      return res.status(isTemporaryFailure ? 503 : 502).json({
        error: isTemporaryFailure
          ? "이미지 생성 요청이 일시적으로 실패했습니다. 잠시 후 다시 시도해 주세요."
          : "Gemini 이미지 생성에 실패했습니다.",
        code: "AI_IMAGE_GENERATION_FAILED",
        model: FIXED_GEMINI_IMAGE_MODEL,
        modelFallbacks: GEMINI_IMAGE_MODEL_FALLBACKS,
        detail,
        retryable: true,
        retryAfterSeconds: isTemporaryFailure ? 20 : undefined,
        failures,
      });
    }

    return res.json({
      images,
      model: images[0]?.model || FIXED_GEMINI_IMAGE_MODEL,
      modelFallbacks: GEMINI_IMAGE_MODEL_FALLBACKS,
      partial: failures.length > 0,
      failures,
    });
  });

  app.post("/api/ai/generate-video-script", async (req, res) => {
    const articleContent = String(req.body?.articleContent || "");
    const customPrompt = String(req.body?.customPrompt || "").trim();
    const videoPrompt = customPrompt || `세로형 숏폼 뉴스 영상, 핵심 요약: ${articleContent.slice(0, 120)}`;
    res.json({
      videoPrompt,
      script: "데모 영상 스크립트",
      scenes: [{ time: "0-5", description: "인트로", text: "요약" }],
    });
  });

  app.post("/api/ai/generate-video", async (_req, res) => {
    res.json({ success: true, videoUrl: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4", duration: 8, aspectRatio: "9:16" });
  });

  app.post("/api/share/short-links", async (req, res) => {
    await hydrateShareShortLinks();

    const targetUrl = String(req.body?.targetUrl || "").trim();
    if (!targetUrl || !isValidHttpUrl(targetUrl)) {
      return res.status(400).json({ error: "targetUrl must be a valid http(s) url." });
    }

    const record = resolveOrCreateShareShortLink(targetUrl);
    const baseUrl = resolveShortLinkBaseUrl(req);
    const shortUrl = `${baseUrl}${buildShortLinkPath(record.slug)}`;
    return res.json({
      slug: record.slug,
      shortUrl,
      shortDisplay: toShortDisplayUrl(shortUrl),
      targetUrl: record.targetUrl,
      createdAt: record.createdAt,
      hits: record.hits,
    });
  });

  const handleShortRedirect = async (req: any, res: any, next?: () => void) => {
    await hydrateShareShortLinks();

    const slug = normalizeShortLinkSlug(req.params.slug);
    if (!slug) {
      if (next) return next();
      return res.status(404).send("Short link not found.");
    }

    const record = shareShortLinksBySlug.get(slug);
    if (!record) {
      if (next) return next();
      return res.status(404).send("Short link not found.");
    }

    record.hits += 1;
    record.updatedAt = new Date().toISOString();
    shareShortLinksBySlug.set(slug, record);
    scheduleShareShortLinksPersistence();

    return res.redirect(302, record.targetUrl);
  };

  if (SHORT_LINK_PATH_PREFIX) {
    app.get(`/${SHORT_LINK_PATH_PREFIX}/:slug`, async (req, res) => {
      await handleShortRedirect(req, res);
    });
  } else {
    app.get("/:slug", async (req, res, next) => {
      const slug = normalizeShortLinkSlug(req.params.slug);
      if (!/^[0-9a-z_-]{4,12}$/i.test(slug)) {
        return next();
      }
      await handleShortRedirect(req, res, next);
    });
  }

  // Legacy compatibility for already-issued /s/{slug} links.
  if (SHORT_LINK_PATH_PREFIX !== "s") {
    app.get("/s/:slug", async (req, res) => {
      await handleShortRedirect(req, res);
    });
  }

  app.get("/api/admin/stats", async (_req, res) => {
    const stats = await storage.getAdminStats();
    res.json({
      ...stats,
      aiDraftOps: getDraftOpsSnapshot(),
      aiNewsOps: getAiNewsOpsSnapshot(),
      aiDraftGateSettings: getAiDraftGateSettingsSnapshot(),
      aiNewsSettings: getAiNewsSettingsSnapshot(),
    });
  });

  app.get("/api/admin/ai/news-health", async (_req, res) => {
    const model = FIXED_GEMINI_NEWS_TEXT_MODEL;
    const hasKey = Boolean(String(process.env.GEMINI_API_KEY || "").trim());
    const timeoutMs = Math.max(36000, Math.min(aiNewsSettings.modelTimeoutMs, 45000));

    if (!hasKey) {
      return res.status(503).json({
        ok: false,
        code: "AI_NEWS_KEY_MISSING",
        model,
        timeoutMs,
      });
    }

    const probePrompt = [
      "JSON only.",
      "Return:",
      '{"ok":true,"kind":"ai_news_probe"}',
    ].join("\n");
    const probe = await generateGeminiNewsText(probePrompt, Math.min(30000, Math.max(12000, timeoutMs - 2000)));
    const ok = Boolean(probe.text);
    return res.status(ok ? 200 : 503).json({
      ok,
      code: ok ? "OK" : (probe.reasonCode || "AI_NEWS_MODEL_ERROR"),
      model,
      timeoutMs,
      latencyMs: probe.latencyMs,
    });
  });

  app.get("/api/admin/ai/news/settings", async (_req, res) => {
    await hydrateAiNewsSettings();
    res.json(getAiNewsSettingsSnapshot());
  });

  app.put("/api/admin/ai/news/settings", async (req, res) => {
    await hydrateAiNewsSettings();
    const { patch, errors } = parseAiNewsSettingsPatch(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        error: "AI news settings validation failed.",
        code: "AI_NEWS_SETTINGS_INVALID",
        issues: errors,
      });
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        error: "No valid setting fields were provided.",
        code: "AI_NEWS_SETTINGS_EMPTY_PATCH",
      });
    }

    applyAiNewsSettingsPatch(patch, "admin");
    const snapshot = getAiNewsSettingsSnapshot();
    await writeAdminActionLog(
      req,
      AI_NEWS_SETTINGS_ACTION,
      "news_settings",
      JSON.stringify({
        settings: snapshot.values,
        source: snapshot.source,
        updatedAt: snapshot.updatedAt,
      }),
      "ai_news",
    );
    return res.json(snapshot);
  });

  app.get("/api/admin/ai-draft/settings", async (_req, res) => {
    await hydrateAiDraftGateSettings();
    res.json(getAiDraftGateSettingsSnapshot());
  });

  app.put("/api/admin/ai-draft/settings", async (req, res) => {
    await hydrateAiDraftGateSettings();
    const { patch, errors } = parseAiDraftGateSettingsPatch(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        error: "AI draft gate settings validation failed.",
        code: "AI_DRAFT_SETTINGS_INVALID",
        issues: errors,
      });
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        error: "No valid setting fields were provided.",
        code: "AI_DRAFT_SETTINGS_EMPTY_PATCH",
      });
    }

    applyAiDraftGateSettingsPatch(patch, "admin");
    const snapshot = getAiDraftGateSettingsSnapshot();
    await writeAdminActionLog(
      req,
      AI_DRAFT_SETTINGS_ACTION,
      "gate_settings",
      JSON.stringify({
        settings: snapshot.values,
        source: snapshot.source,
        updatedAt: snapshot.updatedAt,
      }),
      "ai_draft",
    );
    return res.json(snapshot);
  });

  app.get("/api/admin/reports", async (_req, res) => {
    const reports = await storage.getReports();
    res.json(reports);
  });

  app.post("/api/admin/reports", async (req, res) => {
    const { articleId, reason } = req.body || {};
    if (!articleId || !reason) return res.status(400).json({ error: "articleId and reason are required." });
    const report = await storage.createReport(String(articleId), String(reason));
    await writeAdminActionLog(req, "report_create", String(articleId), String(reason).slice(0, 200));
    res.status(201).json(report);
  });

  app.put("/api/admin/reports/:reportId/status", async (req, res) => {
    const { reportId } = req.params;
    const status = String(req.body?.status || "").trim();
    const resolution = req.body?.resolution == null ? null : String(req.body?.resolution || "");
    const sanctionType = req.body?.sanctionType == null ? null : String(req.body?.sanctionType || "");
    const actor = resolveActor(req);

    if (!["reported", "in_review", "resolved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "invalid report status" });
    }
    if (sanctionType && !["none", "hide_article", "delete_article", "warn_author"].includes(sanctionType)) {
      return res.status(400).json({ error: "invalid sanction type" });
    }

    const updated = await storage.updateReportStatus(reportId, {
      status: status as any,
      resolution,
      sanctionType: (sanctionType || null) as any,
      reviewedBy: actor.actorId,
    });

    if (!updated) return res.status(404).json({ error: "report not found" });
    await writeAdminActionLog(
      req,
      "report_status_update",
      String(updated.articleId || ""),
      `reportId=${reportId},status=${status},sanction=${sanctionType || "none"}`,
      "report",
    );
    res.json(updated);
  });

  app.get("/api/admin/reviews", async (_req, res) => {
    const reviews = await storage.getAdminReviews();
    res.json(reviews);
  });

  app.get("/api/admin/action-logs", async (req, res) => {
    const limit = Number(req.query.limit || 100);
    const logs = await storage.getAdminActionLogs(limit);
    res.json(logs);
  });

  app.get("/api/admin/alerts", async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 20), 100));
    res.json(opsAlerts.slice(0, limit));
  });

  app.get("/api/admin/alerts/summary", async (_req, res) => {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const recent = requestMetrics.filter((m) => now - m.ts <= windowMs);
    const total = recent.length;
    const failures = recent.filter((m) => m.status >= 500).length;
    const failureRate = total > 0 ? Math.round((failures / total) * 100) : 0;
    const sorted = [...recent].sort((a, b) => a.durationMs - b.durationMs);
    const p95LatencyMs = sorted.length > 0 ? (sorted[Math.max(0, Math.floor(sorted.length * 0.95) - 1)]?.durationMs || 0) : 0;
    const aiErrorCount = recent.filter((m) => m.isAi && m.status >= 500).length;
    const criticalCount = opsAlerts.filter((a) => a.severity === "critical").length;
    const warningCount = opsAlerts.filter((a) => a.severity === "warning").length;
    res.json({
      windowMinutes: 10,
      failureRate,
      p95LatencyMs,
      aiErrorCount,
      criticalCount,
      warningCount,
      alertCount: opsAlerts.length,
    });
  });

  app.post("/api/admin/alerts/test", async (req, res) => {
    const type = String(req.body?.type || "ai_error") as AlertType;
    if (!["failure_rate", "latency", "ai_error"].includes(type)) {
      return res.status(400).json({ error: "invalid alert type" });
    }
    await pushOpsAlert({
      type,
      severity: "warning",
      title: "테스트 알림",
      message: "운영 알림 체계 테스트 이벤트입니다.",
      metric: { value: 1, threshold: 1, unit: "count", windowMinutes: 10 },
    });
    res.status(201).json({ success: true });
  });

  app.get("/api/admin/exports/history", async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 20), 100));
    res.json(exportJobs.slice(0, limit));
  });

  app.get("/api/admin/exports/schedule", async (_req, res) => {
    res.json(exportSchedule);
  });

  app.put("/api/admin/exports/schedule", async (req, res) => {
    const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : exportSchedule.enabled;
    const intervalMinutes = Number(req.body?.intervalMinutes || exportSchedule.intervalMinutes);
    const rawFormats = Array.isArray(req.body?.formats) ? req.body.formats : exportSchedule.formats;
    const formats = rawFormats.filter((v: unknown) => v === "excel" || v === "pdf") as ExportFormat[];

    exportSchedule = {
      ...exportSchedule,
      enabled,
      intervalMinutes: Number.isFinite(intervalMinutes) ? Math.max(5, intervalMinutes) : exportSchedule.intervalMinutes,
      formats: formats.length > 0 ? formats : ["excel", "pdf"],
    };
    if (exportSchedule.enabled) {
      startExportSchedule();
    } else {
      stopExportSchedule();
    }

    await writeAdminActionLog(
      req,
      "export_schedule_update",
      "export_schedule",
      `enabled=${exportSchedule.enabled},interval=${exportSchedule.intervalMinutes},formats=${exportSchedule.formats.join(",")}`,
      "export",
    );
    res.json(exportSchedule);
  });

  app.post("/api/admin/exports/run", async (req, res) => {
    const format = String(req.body?.format || "").trim() as ExportFormat;
    if (!["excel", "pdf"].includes(format)) {
      return res.status(400).json({ error: "format must be excel or pdf" });
    }
    const actor = resolveActor(req);
    const job = await runExportJob(format, "manual", actor.actorId);
    if (job.status === "failed") {
      return res.status(500).json(job);
    }
    res.status(201).json(job);
  });

  app.put("/api/admin/reviews/:articleId", async (req, res) => {
    const { articleId } = req.params;
    const { completed, memo, issues } = req.body || {};
    const prev = (await storage.getAdminReviews()).find((row) => row.articleId === articleId);
    const updated = await storage.upsertAdminReview(articleId, {
      ...(typeof completed === "boolean" ? { completed } : {}),
      ...(typeof memo === "string" ? { memo } : {}),
      ...(Array.isArray(issues) ? { issues: issues.filter((v: unknown) => typeof v === "string") } : {}),
    });
    if (typeof completed === "boolean" && completed !== Boolean(prev?.completed)) {
      await writeAdminActionLog(req, completed ? "review_complete" : "review_reopen", articleId);
    }
    if (typeof memo === "string" && memo !== String(prev?.memo || "")) {
      await writeAdminActionLog(req, "memo_update", articleId, `memo_length=${memo.trim().length}`);
    }
    if (Array.isArray(issues)) {
      const prevCount = prev?.issues?.length || 0;
      const nextCount = updated.issues?.length || 0;
      if (nextCount !== prevCount) {
        await writeAdminActionLog(req, "issues_replace", articleId, `issues:${prevCount}->${nextCount}`);
      }
    }
    res.json(updated);
  });

  app.post("/api/admin/reviews/:articleId/issues", async (req, res) => {
    const { articleId } = req.params;
    const issue = String(req.body?.issue || "").trim();
    if (!issue) return res.status(400).json({ error: "issue is required." });
    const updated = await storage.addAdminReviewIssue(articleId, issue);
    await writeAdminActionLog(req, "issue_add", articleId, issue.slice(0, 200));
    res.json(updated);
  });

  app.post("/api/admin/news/fetch", async (req, res) => {
    const actor = resolveActor(req);
    if (!["admin", "journalist"].includes(actor.actorRole)) {
      return res.status(403).json({
        success: false,
        error: "권한이 없습니다.",
        code: "NEWS_FETCH_FORBIDDEN",
      });
    }

    try {
      const result = await Promise.race<any>([
        runAutoNewsUpdate({
          maxArticlesPerCountry: 2,
          concurrency: 2,
          aiTimeoutMs: 9000,
          enableImageGeneration: false,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("news pipeline timeout")), 45000)),
      ]);
      await writeAdminActionLog(
        req,
        "news_fetch_run",
        "news_pipeline",
        `saved=${result?.stats?.saved ?? 0},skipped=${result?.stats?.skipped ?? 0},failed=${result?.stats?.failed ?? 0}`,
        "news",
      );
      return res.json({
        success: true,
        stats: result?.stats || { saved: 0, skipped: 0, failed: 0, total: 0 },
        mode: "live",
        status: result?.status || "completed",
        logs: Array.isArray(result?.logs) ? result.logs.slice(0, 10) : [],
      });
    } catch (error: any) {
      console.error("[NEWS_FETCH] manual trigger failed:", error);
      return res.status(502).json({
        success: false,
        error: "뉴스 수집/생성 파이프라인 실행에 실패했습니다.",
        code: "NEWS_FETCH_PIPELINE_FAILED",
        detail: String(error?.message || "unknown"),
      });
    }
  });

  app.get("/api/cron", async (req, res) => {
    const cronSecret = String(process.env.CRON_SECRET || "").trim();
    if (cronSecret) {
      const headerSecret = String(req.headers["x-cron-secret"] || "").trim();
      const querySecret = String(req.query.secret || "").trim();
      if (headerSecret !== cronSecret && querySecret !== cronSecret) {
        return res.status(403).json({
          success: false,
          error: "Invalid cron secret.",
          code: "CRON_FORBIDDEN",
        });
      }
    }

    try {
      const result = await Promise.race<any>([
        runAutoNewsUpdate({
          maxArticlesPerCountry: 2,
          concurrency: 2,
          aiTimeoutMs: 9000,
          enableImageGeneration: false,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("cron pipeline timeout")), 45000)),
      ]);
      return res.json({
        success: true,
        mode: "live",
        data: result,
      });
    } catch (error: any) {
      console.error("[CRON] runAutoNewsUpdate failed:", error);
      return res.status(502).json({
        success: false,
        mode: "live",
        error: "Cron pipeline failed.",
        code: "CRON_PIPELINE_FAILED",
        detail: String(error?.message || "unknown"),
      });
    }
  });

  const deriveArticleSource = (payload: any): string => {
    const direct = String(payload?.source || "").trim();
    if (direct) return direct.slice(0, 240);

    const content = String(payload?.content || "");
    const sourceMatch = content.match(/\[출처\]([\s\S]*)$/i);
    if (sourceMatch?.[1]) {
      const firstLine = sourceMatch[1]
        .split("\n")
        .map((line) => line.replace(/^[\-\u2022]\s*/, "").trim())
        .find(Boolean) || "";
      const url = firstLine.match(/https?:\/\/[^\s)]+/i)?.[0] || "";
      const withoutUrl = firstLine.replace(/https?:\/\/[^\s)]+/ig, "").replace(/[()]/g, "").trim();
      const extracted = (withoutUrl || url).trim();
      if (extracted) return extracted.slice(0, 240);
    }

    return "출처 확인 필요";
  };

  app.post("/api/articles", async (req, res) => {
    const articleData = {
      ...(req.body || {}),
      source: deriveArticleSource(req.body || {}),
    };
    const newItem = await storage.createNewsItem(articleData);
    res.status(201).json(newItem);
  });

  app.put("/api/articles/:id", async (req, res) => {
    const prev = await storage.getNewsItemById(req.params.id);
    if (!prev) return res.status(404).json({ error: "Article not found" });

    const actor = resolveActor(req);
    const actorRole = String(actor.actorRole || "").trim().toLowerCase();
    const actorId = String(actor.actorId || "").trim().toLowerCase();
    const ownerId = String((prev as any).authorId ?? (prev as any).author_id ?? "").trim().toLowerCase();
    const isAdmin = actorRole === "admin";
    const isJournalistOwner = actorRole === "journalist" && Boolean(actorId) && actorId === ownerId;

    if (!isAdmin && !isJournalistOwner) {
      return res.status(403).json({
        error: "수정 권한이 없습니다. 기사 작성자 또는 관리자만 수정할 수 있습니다.",
      });
    }

    const incoming = req.body || {};
    const updates = {
      ...incoming,
      ...(Object.prototype.hasOwnProperty.call(incoming, "source") || Object.prototype.hasOwnProperty.call(incoming, "content")
        ? { source: deriveArticleSource(incoming) }
        : {}),
    };

    const updatedItem = await storage.updateNewsItem(req.params.id, updates);
    if (!updatedItem) return res.status(404).json({ error: "Article not found" });

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "isPublished")) {
      const wasPublished = Boolean((prev as any).isPublished ?? (prev as any).is_published ?? true);
      const isPublished = Boolean((updatedItem as any).isPublished ?? (updatedItem as any).is_published ?? true);
      if (wasPublished !== isPublished) {
        await writeAdminActionLog(req, isPublished ? "publish" : "hide", req.params.id);
      }
    }

    res.json(updatedItem);
  });

  app.delete("/api/articles/:id", async (req, res) => {
    const success = await storage.deleteNewsItem(req.params.id);
    if (!success) return res.status(404).json({ error: "Article not found" });
    await writeAdminActionLog(req, "delete", req.params.id);
    res.sendStatus(204);
  });

  app.get("/api/articles", async (req, res) => {
    try {
      const includeHidden = req.query.all === "true";
      const news = await storage.getAllNews(includeHidden);
      res.json(news);
    } catch (error: any) {
      console.error("[API] /api/articles failed:", error);
      res.status(200).json([]);
    }
  });

  app.post("/api/interact/view/:id", async (req, res) => {
    await storage.incrementView(req.params.id);
    res.sendStatus(200);
  });

  app.post("/api/interact/save/:id", async (req, res) => {
    const saved = await storage.toggleSave(req.params.id, "test-user");
    res.json({ saved });
  });

  return httpServer;
}


