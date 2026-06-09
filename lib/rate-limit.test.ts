// lib/rate-limit.test.ts
// The limiter must allow up to `limit` per window, reject the overflow with a
// Retry-After, and reset cleanly once the window elapses. Clock is injected so the
// test is deterministic (no real timers).

import { describe, it, expect } from "vitest";
import { RateLimiter, clientKeyFromHeaders } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows requests up to the limit, then rejects with a Retry-After", () => {
    const now = 1_000_000;
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 }, () => now);

    expect(limiter.check("a")).toMatchObject({ ok: true, remaining: 2 });
    expect(limiter.check("a")).toMatchObject({ ok: true, remaining: 1 });
    expect(limiter.check("a")).toMatchObject({ ok: true, remaining: 0 });

    const blocked = limiter.check("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("tracks separate keys independently", () => {
    const now = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 }, () => now);
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(false);
    // Different client is unaffected.
    expect(limiter.check("b").ok).toBe(true);
  });

  it("resets after the window elapses", () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 }, () => now);
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(false);

    now += 1001; // window passed
    expect(limiter.check("a")).toMatchObject({ ok: true, remaining: 0 });
  });

  it("reports a shrinking retryAfter as the window drains", () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 10_000 }, () => now);
    limiter.check("a");
    const first = limiter.check("a").retryAfterSec;
    now += 5000;
    const later = limiter.check("a").retryAfterSec;
    expect(later).toBeLessThan(first);
  });
});

describe("clientKeyFromHeaders", () => {
  it("uses the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientKeyFromHeaders(h)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then a shared local bucket", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(clientKeyFromHeaders(new Headers())).toBe("local");
  });
});
