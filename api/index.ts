import { createServer } from "http";
import express from "express";
import type { Server } from "http";
import type { Express } from "express";

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
        return res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    }

    if (!routesRegistered) {
        try {
            const registerRoutes = await loadRegisterRoutes();
            await registerRoutes(httpServer, app);
            routesRegistered = true;
            console.log("Routes registered successfully");
        } catch (e) {
            console.error("Failed to register routes:", e);
            return res.status(500).json({ error: "Internal Server Error", details: String(e) });
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
