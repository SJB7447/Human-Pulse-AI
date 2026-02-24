import type { Express, NextFunction, Request, Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const EMOTION_TYPES = ["vibrance", "immersion", "clarity", "gravity", "serenity", "spectrum"] as const;
type EmotionType = typeof EMOTION_TYPES[number];

type LightweightOptions = {
  shouldBypassLightweight: () => boolean;
};

function toEmotion(value: unknown): EmotionType {
  const normalized = String(value || "").toLowerCase().trim();
  return (EMOTION_TYPES as readonly string[]).includes(normalized) ? (normalized as EmotionType) : "spectrum";
}

function isPublishedVisible(row: any): boolean {
  if (typeof row?.isPublished === "boolean") return row.isPublished;
  if (typeof row?.is_published === "boolean") return row.is_published;
  return true;
}

export function registerLightweightReadRoutes(app: Express, options: LightweightOptions): void {
  let supabaseClient: SupabaseClient | null = null;

  const getSupabase = (): SupabaseClient | null => {
    if (supabaseClient) return supabaseClient;

    const url = String(process.env.VITE_SUPABASE_URL || "").trim();
    const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || "").trim();
    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const key = serviceRoleKey || anonKey;

    if (!url || !key) return null;

    supabaseClient = createClient(url, key);
    return supabaseClient;
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
      const supabase = getSupabase();
      if (!supabase) return res.status(200).json([]);

      let query = supabase.from("news_items").select("*").order("created_at", { ascending: false });
      if (!includeHidden) query = query.eq("is_published", true);

      const { data, error } = await query;
      if (error) {
        console.error("[Lightweight API] /api/news query failed:", error);
        return res.status(200).json([]);
      }

      const rows = (data || []).filter((row: any) => includeHidden || isPublishedVisible(row));
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
      const supabase = getSupabase();
      if (!supabase) return res.status(200).json([]);

      const { data, error } = await supabase
        .from("news_items")
        .select("*")
        .eq("emotion", emotion)
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[Lightweight API] /api/news/:emotion query failed:", error);
        return res.status(200).json([]);
      }

      return res.status(200).json(data || []);
    } catch (error) {
      console.error("[Lightweight API] /api/news/:emotion failed:", error);
      return res.status(200).json([]);
    }
  });

  app.get("/api/articles", async (req: Request, res: Response, next: NextFunction) => {
    if (bypassIfNeeded(next)) return;

    try {
      const includeHidden = req.query.all === "true";
      const supabase = getSupabase();
      if (!supabase) return res.status(200).json([]);

      let query = supabase.from("news_items").select("*").order("created_at", { ascending: false });
      if (!includeHidden) query = query.eq("is_published", true);

      const { data, error } = await query;
      if (error) {
        console.error("[Lightweight API] /api/articles query failed:", error);
        return res.status(200).json([]);
      }

      const rows = (data || []).filter((row: any) => includeHidden || isPublishedVisible(row));
      return res.status(200).json(rows);
    } catch (error) {
      console.error("[Lightweight API] /api/articles failed:", error);
      return res.status(200).json([]);
    }
  });
}
