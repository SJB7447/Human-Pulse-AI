import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes.js";
import { buildArticleTopicSummaries, normalizeArticleTopic, resolveArticleTopic } from "../shared/articleTopics.js";
import {
  createDefaultNotificationPrefs,
  normalizeNotificationRole,
  sanitizeNotificationPrefsPatch,
} from "../shared/notification.types.js";

type ApiMode = "full" | "lightweight";

const EMOTION_TYPES = ["vibrance", "immersion", "clarity", "gravity", "serenity", "spectrum"] as const;
type EmotionType = typeof EMOTION_TYPES[number];
const lightweightNotificationPrefs = new Map<string, { role: string; prefs: ReturnType<typeof createDefaultNotificationPrefs> }>();
const lightweightNotifications = new Map<string, Array<{
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  is_read: boolean;
  created_at: string;
}>>();

function getRequestPath(url: unknown): string {
  const raw = String(url || "/");
  try {
    return new URL(raw, "http://localhost").pathname;
  } catch {
    return raw.split("?")[0] || "/";
  }
}

function getQuery(url: unknown): URLSearchParams {
  const raw = String(url || "/");
  try {
    return new URL(raw, "http://localhost").searchParams;
  } catch {
    const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
    return new URLSearchParams(query);
  }
}

function toEmotion(value: unknown): EmotionType {
  const normalized = String(value || "").toLowerCase().trim();
  return (EMOTION_TYPES as readonly string[]).includes(normalized) ? (normalized as EmotionType) : "spectrum";
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = String(process.env.VITE_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const key = serviceRoleKey || anonKey;
  if (!url || !key) return null;
  return { url, key };
}

function buildRestUrl(base: string, table: string, query: string): string {
  return `${base.replace(/\/+$/, "")}/rest/v1/${table}?${query}`;
}

async function fetchRows(table: string, query: string): Promise<any[]> {
  const config = getSupabaseConfig();
  if (!config) return [];

  const response = await fetch(buildRestUrl(config.url, table, query), {
    method: "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase REST ${response.status}: ${text || "request failed"}`);
  }

  const payload = await response.json().catch(() => []);
  return Array.isArray(payload) ? payload : [];
}

function sendJson(res: any, status: number, body: unknown): void {
  if (typeof res?.status === "function" && typeof res?.json === "function") {
    res.status(status).json(body);
    return;
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function parseJsonBody(req: any): Promise<any> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (!chunks.length) return {};
    const text = Buffer.concat(chunks).toString("utf-8").trim();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function resolveLightweightActor(req: any, query: URLSearchParams): Promise<{ userId: string; role: string } | null> {
  const requestedActorId = String(req?.headers?.["x-actor-id"] || query.get("userId") || "").trim();
  const requestedRole = normalizeNotificationRole(req?.headers?.["x-actor-role"] || query.get("role"));
  const authHeader = typeof req?.headers?.authorization === "string" ? req.headers.authorization.trim() : "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (!token && requestedActorId.startsWith("demo-")) {
    return { userId: requestedActorId, role: requestedRole };
  }

  if (!token) return null;

  const config = getSupabaseConfig();
  if (!config) return null;

  const authResponse = await fetch(`${config.url.replace(/\/+$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  }).catch(() => null);

  if (!authResponse || !authResponse.ok) return null;
  const authPayload = await authResponse.json().catch(() => null);
  const authUserId = String(authPayload?.id || "").trim();
  if (!authUserId) return null;
  if (requestedActorId && requestedActorId !== authUserId) return null;
  return {
    userId: authUserId,
    role: normalizeNotificationRole(req?.headers?.["x-actor-role"] || query.get("role") || authPayload?.user_metadata?.role),
  };
}

export default async function handler(req: any, res: any) {
  await ensureFullApi();

  const path = getRequestPath(req?.url);
  const normalizedPath = path !== "/" ? path.replace(/\/+$/, "") : path;
  if (normalizedPath === "/api/health") {
    return sendJson(res, 200, {
      status: "ok",
      mode: fullApiHandler ? ("full" as ApiMode) : ("lightweight" as ApiMode),
      fullApiReady: Boolean(fullApiHandler),
      fullApiBootstrapError: fullApiHandler ? null : fullApiLastError || null,
      deployedCommit: String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || null,
      timestamp: new Date().toISOString(),
    });
  }

  if (fullApiHandler) {
    return fullApiHandler(req, res);
  }

  const method = String(req?.method || "GET").toUpperCase();
  const query = getQuery(req?.url);

  try {
    if (method === "POST" && normalizedPath === "/api/ai/search-keyword-news") {
      const body = await parseJsonBody(req);
      const keyword = String(body?.keyword || "").trim() || "주요 이슈";
      const articles = Array.from({ length: 5 }).map((_, index) => ({
        id: `lightweight-fallback-${index + 1}`,
        title: `${keyword} 관련 핵심 이슈 ${index + 1}`,
        summary: `${keyword} 키워드를 중심으로 최근 쟁점을 정리한 참고 기사 요약입니다. (lightweight fallback)`,
        url: "",
        source: "lightweight fallback",
        publishedAt: new Date().toISOString(),
      }));
      return sendJson(res, 200, {
        keyword,
        articles,
        fallbackUsed: true,
        diagnostics: {
          stage: "unknown",
          reason: "server is running in lightweight mode",
        },
      });
    }

    if (method === "POST" && normalizedPath === "/api/guest/start") {
      const body = await parseJsonBody(req);
      const requestedGuestId = String(body?.guestId || "").trim();
      const guestId = requestedGuestId || `guest-lightweight-${Date.now()}`;
      const nowIso = new Date().toISOString();
      return sendJson(res, 201, {
        success: true,
        guestId,
        session: {
          moodKey: "spectrum",
          moodScore: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      });
    }

    if (method === "GET" && normalizedPath === "/api/notifications") {
      const actor = await resolveLightweightActor(req, query);
      if (!actor) {
        return sendJson(res, 401, { error: "로그인이 필요합니다." });
      }
      return sendJson(res, 200, lightweightNotifications.get(actor.userId) || []);
    }

    if (method === "POST" && normalizedPath === "/api/notifications/test") {
      const actor = await resolveLightweightActor(req, query);
      if (!actor) {
        return sendJson(res, 401, { error: "로그인이 필요합니다." });
      }
      const item = {
        id: `lightweight-notice-${Date.now()}`,
        type: actor.role === "admin" ? "admin_report" : actor.role === "reporter" ? "reporter_edit_requested" : "breaking",
        title: actor.role === "admin" ? "관리자 테스트 알림" : actor.role === "reporter" ? "기자단 테스트 알림" : "독자 테스트 알림",
        body: "라이트웨이트 모드에서 생성된 테스트 알림입니다.",
        url: "/mypage?tab=settings",
        is_read: false,
        created_at: new Date().toISOString(),
      };
      const existing = lightweightNotifications.get(actor.userId) || [];
      lightweightNotifications.set(actor.userId, [item, ...existing].slice(0, 50));
      return sendJson(res, 201, {
        success: true,
        delivered: false,
        message: "브라우저 푸시는 제한될 수 있지만 알림함 기록은 생성했습니다.",
      });
    }

    if (method === "PATCH" && normalizedPath === "/api/notifications/read-all") {
      const actor = await resolveLightweightActor(req, query);
      if (!actor) {
        return sendJson(res, 401, { error: "로그인이 필요합니다." });
      }
      const existing = lightweightNotifications.get(actor.userId) || [];
      lightweightNotifications.set(
        actor.userId,
        existing.map((item) => ({ ...item, is_read: true })),
      );
      return sendJson(res, 200, { success: true, mode: "lightweight" as ApiMode });
    }

    if (method === "PATCH" && normalizedPath.startsWith("/api/notifications/")) {
      const actor = await resolveLightweightActor(req, query);
      if (!actor) {
        return sendJson(res, 401, { error: "로그인이 필요합니다." });
      }
      const notificationId = normalizedPath.split("/").slice(-2, -1)[0];
      const existing = lightweightNotifications.get(actor.userId) || [];
      lightweightNotifications.set(
        actor.userId,
        existing.map((item) => item.id === notificationId ? { ...item, is_read: true } : item),
      );
      return sendJson(res, 200, { success: true, mode: "lightweight" as ApiMode });
    }

    if (normalizedPath === "/api/notification-prefs") {
      const authHeader = typeof req?.headers?.authorization === "string" ? req.headers.authorization.trim() : "";
      const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
      const requestedActorId = String(req?.headers?.["x-actor-id"] || query.get("userId") || "").trim();
      const requestedRole = normalizeNotificationRole(req?.headers?.["x-actor-role"] || query.get("role"));
      if (!token && requestedActorId.startsWith("demo-")) {
        const existing = lightweightNotificationPrefs.get(requestedActorId) || {
          role: requestedRole,
          prefs: createDefaultNotificationPrefs(),
        };

        if (method === "GET") {
          return sendJson(res, 200, existing);
        }

        if (method === "PATCH") {
          const body = await parseJsonBody(req);
          const patch = sanitizeNotificationPrefsPatch(body || {}, requestedRole);
          const next = {
            role: requestedRole,
            prefs: {
              ...existing.prefs,
              ...patch,
            },
          };
          lightweightNotificationPrefs.set(requestedActorId, next);
          return sendJson(res, 200, { ...next, updatedKeys: Object.keys(patch) });
        }
      }
      if (!token) {
        return sendJson(res, 401, { error: "로그인이 필요합니다." });
      }

      const config = getSupabaseConfig();
      if (!config) {
        return sendJson(res, 500, { error: "Supabase 설정이 없습니다." });
      }

      const authResponse = await fetch(`${config.url.replace(/\/+$/, "")}/auth/v1/user`, {
        method: "GET",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }).catch(() => null);

      if (!authResponse || !authResponse.ok) {
        return sendJson(res, 401, { error: "유효한 로그인 세션이 필요합니다." });
      }

      const authPayload = await authResponse.json().catch(() => null);
      const authUserId = String(authPayload?.id || "").trim();
      if (!authUserId) {
        return sendJson(res, 401, { error: "유효한 로그인 세션이 필요합니다." });
      }

      const requestedUserId = String(req?.headers?.["x-actor-id"] || query.get("userId") || "").trim();
      if (requestedUserId && requestedUserId !== authUserId) {
        return sendJson(res, 403, { error: "다른 사용자의 알림 설정에는 접근할 수 없습니다." });
      }

      const role = normalizeNotificationRole(req?.headers?.["x-actor-role"] || query.get("role") || authPayload?.user_metadata?.role);
      const existing = lightweightNotificationPrefs.get(authUserId) || { role, prefs: createDefaultNotificationPrefs() };

      if (method === "GET") {
        return sendJson(res, 200, existing);
      }

      if (method === "PATCH") {
        const body = await parseJsonBody(req);
        const patch = sanitizeNotificationPrefsPatch(body || {}, role);
        const next = {
          role,
          prefs: {
            ...existing.prefs,
            ...patch,
          },
        };
        lightweightNotificationPrefs.set(authUserId, next);
        return sendJson(res, 200, { ...next, updatedKeys: Object.keys(patch) });
      }
    }

    if (method !== "GET") {
      return sendJson(res, 503, {
        message: "API is running in lightweight mode. This route is unavailable.",
        mode: "lightweight" as ApiMode,
      });
    }

    if (normalizedPath === "/api/articles/topics") {
      const emotion = toEmotion(query.get("emotion"));
      const filters = ["select=*", "is_published=eq.true"];
      if (emotion !== "spectrum") {
        filters.push(`emotion=eq.${encodeURIComponent(emotion)}`);
      }
      const rows = await fetchRows("news_items", filters.join("&"));
      return sendJson(res, 200, { topics: buildArticleTopicSummaries(rows) });
    }

    if (normalizedPath === "/api/news" || normalizedPath === "/api/articles") {
      const includeHidden = query.get("all") === "true";
      const requestedEmotion = String(query.get("emotion") || "").trim().toLowerCase();
      const requestedTopic = normalizeArticleTopic(query.get("topic"));
      const safePage = Math.max(1, Number(query.get("page") || 1) || 1);
      const safeLimit = Math.max(1, Math.min(Number(query.get("limit") || 12) || 12, 100));
      const shouldUseFilteredEnvelope =
        normalizedPath === "/api/articles" && (
          Boolean(requestedEmotion) ||
          query.get("topic") !== null ||
          query.get("page") !== null ||
          query.get("limit") !== null
        );
      const select = "select=*&order=created_at.desc";
      const filters = [];
      if (!includeHidden) filters.push("is_published=eq.true");
      if (requestedEmotion && requestedEmotion !== "spectrum") {
        filters.push(`emotion=eq.${encodeURIComponent(toEmotion(requestedEmotion))}`);
      }
      const rows = await fetchRows("news_items", [select, ...filters].join("&"));
      const topicFiltered = requestedTopic
        ? rows.filter((row: any) => resolveArticleTopic(row) === requestedTopic)
        : rows;
      if (!shouldUseFilteredEnvelope) {
        return sendJson(res, 200, topicFiltered);
      }
      const start = (safePage - 1) * safeLimit;
      return sendJson(res, 200, {
        items: topicFiltered.slice(start, start + safeLimit),
        total: topicFiltered.length,
        page: safePage,
        pageSize: safeLimit,
      });
    }

    if (normalizedPath === "/api/admin/stats") {
      return sendJson(res, 200, {
        totalArticles: 0,
        publishedArticles: 0,
        pendingArticles: 0,
        totalViews: 0,
        aiDraftOps: { totals: { requests: 0, success: 0 } },
        aiNewsOps: { totals: { requests: 0, success: 0 } },
        aiNewsSettings: { source: "env", hydrated: false, values: { modelTimeoutMs: 24000 } },
      });
    }

    if (
      normalizedPath === "/api/admin/reviews" ||
      normalizedPath === "/api/admin/reports" ||
      normalizedPath === "/api/admin/reader-articles"
    ) {
      return sendJson(res, 200, []);
    }

    if (normalizedPath === "/api/admin/alerts") {
      return sendJson(res, 200, []);
    }

    if (normalizedPath === "/api/admin/alerts/summary") {
      return sendJson(res, 200, {
        windowMinutes: 10,
        failureRate: 0,
        p95LatencyMs: 0,
        aiErrorCount: 0,
        criticalCount: 0,
        warningCount: 0,
        alertCount: 0,
      });
    }

    if (normalizedPath === "/api/admin/exports/history") {
      return sendJson(res, 200, []);
    }

    if (normalizedPath === "/api/admin/exports/schedule") {
      return sendJson(res, 200, {
        enabled: false,
        intervalMinutes: 60,
        formats: ["excel", "pdf"],
        lastRunAt: null,
        nextRunAt: null,
      });
    }

    if (normalizedPath.startsWith("/api/admin/")) {
      return sendJson(res, 200, []);
    }

    if (normalizedPath.startsWith("/api/news/")) {
      const emotion = toEmotion(normalizedPath.slice("/api/news/".length));
      const rows = await fetchRows(
        "news_items",
        `select=*&emotion=eq.${encodeURIComponent(emotion)}&is_published=eq.true&order=created_at.desc`,
      );
      return sendJson(res, 200, rows);
    }

    if (normalizedPath === "/api/community") {
      const limit = Math.min(Number(query.get("limit") || 30), 100);

      let data: any[] = [];
      try {
        data = await fetchRows(
          "user_composed_articles",
          `select=id,user_id,generated_title,generated_summary,generated_content,user_opinion,created_at,submission_status,source_emotion,source_category&submission_status=eq.approved&order=created_at.desc&limit=${limit}`,
        );
      } catch {
        data = await fetchRows(
          "user_composed_articles",
          `select=id,user_id,generated_title,generated_summary,generated_content,user_opinion,created_at,submission_status&submission_status=eq.approved&order=created_at.desc&limit=${limit}`,
        );
      }

      const items = (data || [])
        .map((row: any) => ({
          id: String(row?.id || ""),
          title: String(row?.generated_title || "Reader Article"),
          emotion: toEmotion(row?.source_emotion),
          category: String(row?.source_category || "General"),
          content: String(row?.generated_content || ""),
          excerpt: String(row?.generated_summary || row?.user_opinion || "").slice(0, 300),
          author: String(row?.user_id || "reader"),
          createdAt: row?.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        }))
        .filter((row: any) => row.id);

      return sendJson(res, 200, items);
    }

    if (normalizedPath.includes("/comments")) {
      return sendJson(res, 200, []);
    }

    return sendJson(res, 503, {
      message: "API is running in lightweight mode. This route is unavailable.",
      mode: "lightweight" as ApiMode,
    });
  } catch (error) {
    console.error("[Vercel API] fatal:", error);
    if (method === "GET" && (
      normalizedPath === "/api/news" ||
      normalizedPath === "/api/articles" ||
      normalizedPath === "/api/articles/topics" ||
      normalizedPath === "/api/community" ||
      normalizedPath.startsWith("/api/news/") ||
      normalizedPath.startsWith("/api/admin/")
    )) {
      return sendJson(res, 200, []);
    }
    return sendJson(res, 503, {
      message: "API fallback error",
      mode: "lightweight" as ApiMode,
      error: String(error),
    });
  }
}

let fullApiHandler: ((req: any, res: any) => void) | null = null;
let fullApiInitPromise: Promise<void> | null = null;
let fullApiInitErrorLogged = false;
let fullApiLastError = "";

async function ensureFullApi(): Promise<void> {
  if (fullApiHandler || fullApiInitPromise) return fullApiInitPromise ?? Promise.resolve();

  fullApiInitPromise = (async () => {
    try {
      const app = express();
      const httpServer = createServer(app);

      app.use(
        express.json({
          limit: "50mb",
          verify: (request: any, _res: any, buf: Buffer) => {
            request.rawBody = buf;
          },
        }),
      );
      app.use(express.urlencoded({ extended: false }));

      await registerRoutes(httpServer, app);

      app.use((err: any, _req: any, response: any, next: any) => {
        const status = Number(err?.status || err?.statusCode || 500);
        const message = String(err?.message || "Internal Server Error");
        if (response.headersSent) return next(err);
        return response.status(status).json({ message });
      });

      fullApiHandler = (request: any, response: any) => {
        app(request, response, () => {
          if (!response.headersSent) {
            sendJson(response, 404, { message: "Not Found" });
          }
        });
      };
    } catch (error) {
      fullApiLastError = String((error as any)?.message || error || "unknown error");
      if (!fullApiInitErrorLogged) {
        console.error("[Vercel API] full API bootstrap failed. Falling back to lightweight mode.", error);
        fullApiInitErrorLogged = true;
      }
    } finally {
      fullApiInitPromise = null;
    }
  })();

  await fullApiInitPromise;
}




