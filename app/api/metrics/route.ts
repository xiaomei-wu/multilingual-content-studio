// app/api/metrics/route.ts
// Serves the in-memory generation metrics (token usage, cost, latency, prompt version,
// status) to the in-app metrics panel (POS-9), plus the privacy-safe activation
// aggregate (POS-15: completed generations + distinct activated sessions — the launch
// North Star). Read-only; only counts and the last N requests cross the wire — never
// prompts, source text, or any identifier.

import { getMetrics } from "@/lib/metrics";
import { getActivation } from "@/lib/activation";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { ...getMetrics(), activation: getActivation() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
