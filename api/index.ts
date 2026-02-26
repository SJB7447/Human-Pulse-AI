type ApiMode = "lightweight";

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
  const method = String(req?.method || "GET").toUpperCase();
  const path = getRequestPath(req?.url);
  const query = getQuery(req?.url);

  try {
    if (path === "/api/health") {
      return sendJson(res, 200, {
        status: "ok",
        mode: "lightweight" as ApiMode,
        timestamp: new Date().toISOString(),
      });
    }

    if (method !== "GET") {
      return sendJson(res, 503, {
        message: "API is running in lightweight mode. This route is unavailable.",
        mode: "lightweight" as ApiMode,
      });
    }

    if (path === "/api/news" || path === "/api/articles") {
      const includeHidden = query.get("all") === "true";
      const select = "select=*&order=created_at.desc";
      const rows = await fetchRows("news_items", includeHidden ? select : `${select}&is_published=eq.true`);
      return sendJson(res, 200, rows);
    }

    if (path.startsWith("/api/news/")) {
      const emotion = toEmotion(path.slice("/api/news/".length));
      const rows = await fetchRows(
        "news_items",
        `select=*&emotion=eq.${encodeURIComponent(emotion)}&is_published=eq.true&order=created_at.desc`,
      );
      return sendJson(res, 200, rows);
    }

    if (path === "/api/community") {
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

    if (path.includes("/comments")) {
      return sendJson(res, 200, []);
    }

    return sendJson(res, 503, {
      message: "API is running in lightweight mode. This route is unavailable.",
      mode: "lightweight" as ApiMode,
    });
  } catch (error) {
    console.error("[Vercel API] fatal:", error);
    if (method === "GET" && (path === "/api/news" || path === "/api/articles" || path === "/api/community" || path.startsWith("/api/news/"))) {
      return sendJson(res, 200, []);
    }
    return sendJson(res, 503, {
      message: "API fallback error",
      mode: "lightweight" as ApiMode,
      error: String(error),
    });
  }
}
