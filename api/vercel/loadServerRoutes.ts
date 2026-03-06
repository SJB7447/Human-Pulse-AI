import type { Server } from "http";
import type { Express } from "express";

export type RegisterRoutesFn = (httpServer: Server, app: Express) => Promise<Server>;

export async function loadServerRegisterRoutes(): Promise<RegisterRoutesFn> {
  const errors: string[] = [];

  try {
    const mod: any = await import("../../server/routes.js");
    if (typeof mod?.registerRoutes === "function") {
      return mod.registerRoutes as RegisterRoutesFn;
    }
    errors.push("../../server/routes.js: registerRoutes export not found");
  } catch (error: any) {
    errors.push(`../../server/routes.js: ${String(error?.message || error)}`);
  }

  try {
    const mod: any = await import("../../server/routes.ts");
    if (typeof mod?.registerRoutes === "function") {
      return mod.registerRoutes as RegisterRoutesFn;
    }
    errors.push("../../server/routes.ts: registerRoutes export not found");
  } catch (error: any) {
    errors.push(`../../server/routes.ts: ${String(error?.message || error)}`);
  }

  try {
    const mod: any = await import("../../server/routes");
    if (typeof mod?.registerRoutes === "function") {
      return mod.registerRoutes as RegisterRoutesFn;
    }
    errors.push("../../server/routes: registerRoutes export not found");
  } catch (error: any) {
    errors.push(`../../server/routes: ${String(error?.message || error)}`);
  }

  throw new Error(`Failed to load registerRoutes. ${errors.join(" | ")}`);
}
