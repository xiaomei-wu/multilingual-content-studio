// app/api/metrics/route.ts
// Serves the in-memory generation metrics (token usage, cost, latency, prompt version,
// status) to the in-app metrics panel (POS-9). Read-only; only aggregates + the last
// N requests cross the wire — never prompts or source text.

import { getMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getMetrics(), { headers: { "Cache-Control": "no-store" } });
}
