import type { Express, NextFunction, Request, Response } from "express";

const EMOTION_TYPES = ["vibrance", "immersion", "clarity", "gravity", "serenity", "spectrum"] as const;
type EmotionType = typeof EMOTION_TYPES[number];

type LightweightOptions = {
  shouldBypassLightweight: () => boolean;
};

function toEmotion(value: unknown): EmotionType {
  const normalized = String(value || "").toLowerCase().trim();
  return (EMOTION_TYPES as readonly string[]).includes(normalized) ? (normalized as EmotionType) : "spectrum";
}

export function registerLightweightReadRoutes(app: Express, options: LightweightOptions): void {
  const getSupabaseConfig = (): { url: string; key: string } | null => {
    const url = String(process.env.VITE_SUPABASE_URL || "").trim();
    const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || "").trim();
    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const key = serviceRoleKey || anonKey;
    if (!url || !key) return null;
    return { url, key };
  };

  const buildUrl = (base: string, table: string, query: string): string => {
    return `${base.replace(/\/+$/, "")}/rest/v1/${table}?${query}`;
  };

  const fetchRows = async (table: string, query: string): Promise<any[]> => {
    const config = getSupabaseConfig();
    if (!config) return [];

    const response = await fetch(buildUrl(config.url, table, query), {
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
  };

  const bypassIfNeeded = (next: NextFunction): boolean => {
    if (!options.shouldBypassLightweight()) return false;
    next();
    return true;
  };

  app.get("/api/news", async (req: Request, res: Response, next: NextFunction) => {
    if (bypassIfNeeded(next)) return;

    try {
      const includeHidden = req.query.all === "true";
      const select = "select=*&order=created_at.desc";
      const query = includeHidden ? select : `${select}&is_published=eq.true`;
      const rows = await fetchRows("news_items", query);
      return res.status(200).json(rows);
    } catch (error) {
      console.error("[Lightweight API] /api/news failed:", error);
      return res.status(200).json([]);
    }
  });

  app.get("/api/news/:emotion", async (req: Request, res: Response, next: NextFunction) => {
    if (bypassIfNeeded(next)) return;

    try {
      const emotion = toEmotion(req.params.emotion);
      const rows = await fetchRows(
        "news_items",
        `select=*&emotion=eq.${encodeURIComponent(emotion)}&is_published=eq.true&order=created_at.desc`,
      );
      return res.status(200).json(rows);
    } catch (error) {
      console.error("[Lightweight API] /api/news/:emotion failed:", error);
      return res.status(200).json([]);
    }
  });

  app.get("/api/articles", async (req: Request, res: Response, next: NextFunction) => {
    if (bypassIfNeeded(next)) return;

    try {
      const includeHidden = req.query.all === "true";
      const select = "select=*&order=created_at.desc";
      const query = includeHidden ? select : `${select}&is_published=eq.true`;
      const rows = await fetchRows("news_items", query);
      return res.status(200).json(rows);
    } catch (error) {
      console.error("[Lightweight API] /api/articles failed:", error);
      return res.status(200).json([]);
    }
  });

  app.get("/api/community", async (req: Request, res: Response, next: NextFunction) => {
    if (bypassIfNeeded(next)) return;

    try {
      const limit = Math.min(Number(req.query.limit || 30), 100);
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

      const items = (data || []).map((row: any) => ({
        id: String(row?.id || ""),
        title: String(row?.generated_title || "Reader Article"),
        emotion: toEmotion(row?.source_emotion),
        category: String(row?.source_category || "General"),
        content: String(row?.generated_content || ""),
        excerpt: String(row?.generated_summary || row?.user_opinion || "").slice(0, 300),
        author: String(row?.user_id || "reader"),
        createdAt: row?.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      })).filter((row: any) => row.id);

      return res.status(200).json(items);
    } catch (error) {
      console.error("[Lightweight API] /api/community failed:", error);
      return res.status(200).json([]);
    }
  });
}
