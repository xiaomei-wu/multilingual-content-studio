// app/api/config/route.ts
// Tells the UI which providers can serve a live request, so it can show a "live" vs
// "mock" badge. Only booleans cross the wire — never the keys themselves.

import { PROVIDERS } from "@/lib/models";
import { providerIsLive } from "@/lib/resolve-model";

export async function GET() {
  const configured: Record<string, boolean> = {};
  for (const p of PROVIDERS) {
    // Live via the AI Gateway (covers every provider) or this provider's own key.
    configured[p.id] = providerIsLive(p.id);
  }
  return Response.json({ configured });
}
