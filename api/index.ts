import { createServer } from "http";
import express from "express";
import { registerRoutes } from "../server/routes";

const app = express();
const httpServer = createServer(app);

// Middleware setup (copied from server/index.ts)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false }));

// Register routes
// We need to await this, but Vercel handler is sync/async.
// We can wrap it.
let routesRegistered = false;

export default async function handler(req: any, res: any) {
    console.log(`API Request: ${req.method} ${req.url}`);

    // Health Check
    if (req.url === "/api/health") {
        return res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    }

    if (!routesRegistered) {
        try {
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
