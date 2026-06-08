// app/api/config/route.ts
// Tells the UI which providers have a key configured, so it can show a "live" vs
// "mock" badge. Only booleans cross the wire — never the keys themselves.

import { PROVIDERS } from "@/lib/models";

export async function GET() {
  const configured: Record<string, boolean> = {};
  for (const p of PROVIDERS) {
    configured[p.id] = Boolean(process.env[p.envVar]);
  }
  return Response.json({ configured });
}
