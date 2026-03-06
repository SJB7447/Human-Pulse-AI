type ApiMode = "full" | "lightweight";

const EMOTION_TYPES = ["vibrance", "immersion", "clarity", "gravity", "serenity", "spectrum"] as const;
type EmotionType = typeof EMOTION_TYPES[number];

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
      timestamp: new Date().toISOString(),
    });
  }

  if (fullApiHandler) {
    return fullApiHandler(req, res);
  }

  const method = String(req?.method || "GET").toUpperCase();
  const query = getQuery(req?.url);

  try {
    if (method !== "GET") {
      return sendJson(res, 503, {
        message: "API is running in lightweight mode. This route is unavailable.",
        mode: "lightweight" as ApiMode,
      });
    }

    if (normalizedPath === "/api/news" || normalizedPath === "/api/articles") {
      const includeHidden = query.get("all") === "true";
      const select = "select=*&order=created_at.desc";
      const rows = await fetchRows("news_items", includeHidden ? select : `${select}&is_published=eq.true`);
      return sendJson(res, 200, rows);
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
      const [{ default: express }, { createServer }, routeLoader] = await Promise.all([
        import("express"),
        import("http"),
        import("./vercel/loadServerRoutes.js"),
      ]);

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

      // Auth bootstrap can be skipped in serverless fallback if module is unavailable.
      try {
        const authMod: any = await import("../server/auth.js");
        if (typeof authMod?.setupAuth === "function") {
          authMod.setupAuth(app);
        }
      } catch {
        // Non-fatal: routes that don't depend on session auth should still work.
      }

      const registerRoutes = await routeLoader.loadServerRegisterRoutes();
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
