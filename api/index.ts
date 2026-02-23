import { createServer } from "http";
import express from "express";
import type { Server } from "http";
import type { Express } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const app = express();
const httpServer = createServer(app);

// Middleware setup (copied from server/index.ts)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false }));

// Register routes
// We need to await this, but Vercel handler is sync/async.
// We can wrap it.
let routesRegistered = false;
let registerRoutesFn: ((httpServer: Server, app: Express) => Promise<Server>) | null = null;
let fallbackRoutesRegistered = false;
let routeBootstrapError: string | null = null;
let supabaseClient: SupabaseClient | null = null;

const EMOTION_TYPES = ["vibrance", "immersion", "clarity", "gravity", "serenity", "spectrum"] as const;
type EmotionType = typeof EMOTION_TYPES[number];

function toEmotion(value: unknown): EmotionType {
    const normalized = String(value || "").toLowerCase().trim();
    return (EMOTION_TYPES as readonly string[]).includes(normalized) ? (normalized as EmotionType) : "spectrum";
}

function isPublishedVisible(row: any): boolean {
    if (typeof row?.isPublished === "boolean") return row.isPublished;
    if (typeof row?.is_published === "boolean") return row.is_published;
    return true;
}

function getSupabase(): SupabaseClient | null {
    if (supabaseClient) return supabaseClient;

    const url = String(process.env.VITE_SUPABASE_URL || "").trim();
    const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || "").trim();
    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const key = serviceRoleKey || anonKey;

    if (!url || !key) {
        return null;
    }

    supabaseClient = createClient(url, key);
    return supabaseClient;
}

function registerFallbackRoutes(app: Express): void {
    if (fallbackRoutesRegistered) return;

    fallbackRoutesRegistered = true;

    app.get("/api/news", async (req, res) => {
        try {
            const includeHidden = req.query.all === "true";
            const supabase = getSupabase();
            if (!supabase) return res.status(200).json([]);

            let query = supabase.from("news_items").select("*").order("created_at", { ascending: false });
            if (!includeHidden) query = query.eq("is_published", true);

            const { data, error } = await query;
            if (error) {
                console.error("[Fallback API] /api/news query failed:", error);
                return res.status(200).json([]);
            }

            const rows = (data || []).filter((row: any) => includeHidden || isPublishedVisible(row));
            return res.status(200).json(rows);
        } catch (error) {
            console.error("[Fallback API] /api/news failed:", error);
            return res.status(200).json([]);
        }
    });

    app.get("/api/news/:emotion", async (req, res) => {
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
                console.error("[Fallback API] /api/news/:emotion query failed:", error);
                return res.status(200).json([]);
            }

            return res.status(200).json(data || []);
        } catch (error) {
            console.error("[Fallback API] /api/news/:emotion failed:", error);
            return res.status(200).json([]);
        }
    });

    app.get("/api/articles", async (req, res) => {
        try {
            const includeHidden = req.query.all === "true";
            const supabase = getSupabase();
            if (!supabase) return res.status(200).json([]);

            let query = supabase.from("news_items").select("*").order("created_at", { ascending: false });
            if (!includeHidden) query = query.eq("is_published", true);

            const { data, error } = await query;
            if (error) {
                console.error("[Fallback API] /api/articles query failed:", error);
                return res.status(200).json([]);
            }

            const rows = (data || []).filter((row: any) => includeHidden || isPublishedVisible(row));
            return res.status(200).json(rows);
        } catch (error) {
            console.error("[Fallback API] /api/articles failed:", error);
            return res.status(200).json([]);
        }
    });
}

async function loadRegisterRoutes(): Promise<(httpServer: Server, app: Express) => Promise<Server>> {
    if (registerRoutesFn) return registerRoutesFn;

    const candidates = ["../server/routes.js", "../server/routes.ts", "../server/routes"];
    const errors: string[] = [];

    for (const specifier of candidates) {
        try {
            const mod: any = await import(specifier);
            if (typeof mod?.registerRoutes === "function") {
                const loaded = mod.registerRoutes as (httpServer: Server, app: Express) => Promise<Server>;
                registerRoutesFn = loaded;
                return loaded;
            }
            errors.push(`${specifier}: registerRoutes export not found`);
        } catch (error: any) {
            errors.push(`${specifier}: ${String(error?.message || error)}`);
        }
    }

    throw new Error(`Failed to load registerRoutes. ${errors.join(" | ")}`);
}

export default async function handler(req: any, res: any) {
    console.log(`API Request: ${req.method} ${req.url}`);

    // Health Check
    if (req.url === "/api/health") {
        return res.status(200).json({
            status: "ok",
            mode: fallbackRoutesRegistered ? "fallback" : "full",
            routeBootstrapError,
            timestamp: new Date().toISOString(),
        });
    }

    if (!routesRegistered) {
        try {
            const registerRoutes = await loadRegisterRoutes();
            await registerRoutes(httpServer, app);
            routesRegistered = true;
            console.log("Routes registered successfully");
        } catch (e) {
            console.error("Failed to register routes:", e);
            routeBootstrapError = String(e);
            registerFallbackRoutes(app);
            routesRegistered = true;
            console.warn("Fallback API routes registered");
        }

        // Error handling middleware
        app.use((err: any, _req: any, res: any, _next: any) => {
            const status = err.status || err.statusCode || 500;
            const message = err.message || "Internal Server Error";
            console.error(err);
            res.status(status).json({ message });
        });
    }

    // Vercel handles the request
    app(req, res);
}
