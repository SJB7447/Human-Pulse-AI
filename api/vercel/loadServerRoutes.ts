import type { Server } from "http";
import type { Express } from "express";

export type RegisterRoutesFn = (httpServer: Server, app: Express) => Promise<Server>;

export async function loadServerRegisterRoutes(): Promise<RegisterRoutesFn> {
  const candidates = ["../../server/routes.js", "../../server/routes.ts", "../../server/routes"];
  const errors: string[] = [];

  for (const specifier of candidates) {
    try {
      const mod: any = await import(specifier);
      if (typeof mod?.registerRoutes === "function") {
        return mod.registerRoutes as RegisterRoutesFn;
      }
      errors.push(`${specifier}: registerRoutes export not found`);
    } catch (error: any) {
      errors.push(`${specifier}: ${String(error?.message || error)}`);
    }
  }

  throw new Error(`Failed to load registerRoutes. ${errors.join(" | ")}`);
}
