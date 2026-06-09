// lib/rate-limit.ts
// A small, dependency-free fixed-window rate limiter for the generation API
// (POS-9: "rate-limit handling on the generation API"). Two jobs:
//   1. Protect the demo / our gateway quota from a single client hammering the
//      endpoint — we reject early with a 429 + Retry-After BEFORE spending a model
//      call, which is exactly how you stay under the AI Gateway / provider limits.
//   2. Be pure and injectable (clock passed in) so it's deterministic to unit-test.
//
// In-memory + per-instance: fine for a single-instance demo (Fluid Compute reuses the
// instance). A multi-instance production deploy would swap this for a shared store
// (e.g. Upstash Redis via the Vercel Marketplace) behind the same interface.

export interface RateLimitConfig {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  limit: number;
  /** Seconds until the window resets (for the `Retry-After` header). */
  retryAfterSec: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

// Defaults are generous enough for the demo's parallel-platform fan-out (one request
// per selected platform) yet still stop abuse. Tunable via env without a code change.
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  limit: Number(process.env.GENERATION_RATE_LIMIT ?? 30),
  windowMs: Number(process.env.GENERATION_RATE_WINDOW_MS ?? 60_000),
};

/**
 * A reusable limiter instance backed by an in-memory map. `check(key)` records and
 * evaluates one hit for `key` (typically a client IP). The clock is injectable so
 * tests can advance time deterministically.
 */
export class RateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly config: RateLimitConfig = DEFAULT_RATE_LIMIT,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const { limit, windowMs } = this.config;
    const t = this.now();
    const existing = this.windows.get(key);

    // No window yet, or the previous one has expired → start a fresh window.
    if (!existing || t >= existing.resetAt) {
      this.windows.set(key, { count: 1, resetAt: t + windowMs });
      return { ok: true, remaining: limit - 1, limit, retryAfterSec: 0 };
    }

    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - t) / 1000));
    if (existing.count >= limit) {
      return { ok: false, remaining: 0, limit, retryAfterSec };
    }

    existing.count += 1;
    return { ok: true, remaining: limit - existing.count, limit, retryAfterSec };
  }

  /** Drop expired windows. Optional housekeeping; the limiter is correct without it. */
  sweep(): void {
    const t = this.now();
    for (const [key, state] of this.windows) {
      if (t >= state.resetAt) this.windows.delete(key);
    }
  }
}

// Process-wide limiter shared across requests on this instance.
export const generationLimiter = new RateLimiter();

/**
 * Best-effort client identifier from request headers. Falls back to a shared bucket
 * when no forwarding header is present (local dev), which is acceptable for the demo.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "local";
}
