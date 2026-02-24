import { createServer } from "http";
import express from "express";
import { registerLightweightReadRoutes } from "./vercel/lightweightReadRoutes";
import { loadServerRegisterRoutes } from "./vercel/loadServerRoutes";

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false }));

let lightweightRoutesRegistered = false;
let fullRoutesRegistered = false;
let fullRoutesBootstrapAttempted = false;
let errorMiddlewareRegistered = false;
let routeBootstrapError: string | null = null;

function getRequestPath(url: unknown): string {
  const raw = String(url || "/");
  try {
    return new URL(raw, "http://localhost").pathname;
  } catch {
    return raw.split("?")[0] || "/";
  }
}

function isLightweightReadPath(method: unknown, path: string): boolean {
  if (String(method || "").toUpperCase() !== "GET") return false;
  if (path === "/api/news" || path === "/api/articles") return true;
  return path.startsWith("/api/news/");
}

function resolveApiMode(): "full" | "fallback" | "lightweight" {
  if (fullRoutesRegistered) return "full";
  if (routeBootstrapError) return "fallback";
  return "lightweight";
}

function ensureLightweightRoutes() {
  if (lightweightRoutesRegistered) return;
  registerLightweightReadRoutes(app, {
    shouldBypassLightweight: () => fullRoutesRegistered,
  });
  lightweightRoutesRegistered = true;
}

function ensureErrorMiddleware() {
  if (errorMiddlewareRegistered) return;
  app.use((err: any, _req: any, res: any, _next: any) => {
    const status = err?.status || err?.statusCode || 500;
    const message = err?.message || "Internal Server Error";
    console.error(err);
    res.status(status).json({ message });
  });
  errorMiddlewareRegistered = true;
}

async function ensureFullRoutes() {
  if (fullRoutesRegistered || fullRoutesBootstrapAttempted) return;

  fullRoutesBootstrapAttempted = true;
  try {
    const registerRoutes = await loadServerRegisterRoutes();
    await registerRoutes(httpServer, app);
    fullRoutesRegistered = true;
    routeBootstrapError = null;
    console.log("[Vercel API] Full routes registered");
  } catch (error) {
    routeBootstrapError = String(error);
    console.error("[Vercel API] Full route bootstrap failed:", error);
    console.warn("[Vercel API] Lightweight mode remains active");
  } finally {
    ensureErrorMiddleware();
  }
}

export default async function handler(req: any, res: any) {
  const path = getRequestPath(req?.url);
  console.log(`API Request: ${req.method} ${path}`);

  ensureLightweightRoutes();

  if (path === "/api/health") {
    return res.status(200).json({
      status: "ok",
      mode: resolveApiMode(),
      routeBootstrapError,
      timestamp: new Date().toISOString(),
    });
  }

  const isLightweight = isLightweightReadPath(req?.method, path);

  if (!isLightweight && !fullRoutesRegistered) {
    await ensureFullRoutes();
  }

  if (path.startsWith("/api/") && !isLightweight && !fullRoutesRegistered) {
    return res.status(503).json({
      message: "API is running in fallback mode. This route is unavailable.",
      mode: resolveApiMode(),
      routeBootstrapError,
    });
  }

  app(req, res);
}
