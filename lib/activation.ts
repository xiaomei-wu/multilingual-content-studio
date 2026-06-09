// lib/activation.ts
// POS-15: the launch North Star is "demo sessions that complete ≥1 generation"
// (target 200 in launch week). The metrics ring (lib/metrics.ts) tells us about
// requests; this tells us about *activation* — how many distinct sessions actually
// got a finished post, plus the running total of completed generations.
//
// Privacy-safe by construction:
//   - we count, we don't profile. The output is two integers, never an id.
//   - the only identifier we hold is an OPAQUE, client-generated random session id
//     (sessionStorage UUID) — no IP, no fingerprint, no PII. It lets us de-dupe
//     "distinct sessions" without knowing anything about the person.
//   - in-memory + per-instance, exactly like the metrics ring and rate limiter:
//     no persistence, no new infra, zero cost, and it can't regress the mock path.
//     A production deploy would swap this for an aggregate analytics counter behind
//     the same record() call.
//
// We record an activation only when a generation actually completes (status "ok"),
// so the number means what the launch report claims it means.

// Defensive cap so a hostile client spraying random session ids can't grow the Set
// without bound. Far above the ~200 launch-week target; once hit we still count
// completed generations, we just stop tracking *new* distinct sessions.
const MAX_TRACKED_SESSIONS = 100_000;

const activatedSessions = new Set<string>();
let completedGenerations = 0;

export interface ActivationSnapshot {
  /** Total generations that completed successfully (across all sessions). */
  completedGenerations: number;
  /** Distinct sessions that completed ≥1 generation — the launch North Star. */
  activatedSessions: number;
}

/**
 * Record one *completed* generation. Pass the opaque client session id when present
 * so the session counts once toward distinct activation; a missing id still counts
 * toward the completed-generations total. No-op-safe to call on every success.
 */
export function recordActivation(sessionId?: string): void {
  completedGenerations += 1;
  if (sessionId && activatedSessions.size < MAX_TRACKED_SESSIONS) {
    activatedSessions.add(sessionId);
  }
}

/** Current activation aggregates — two counts, never an identifier. */
export function getActivation(): ActivationSnapshot {
  return {
    completedGenerations,
    activatedSessions: activatedSessions.size,
  };
}

/** Test helper: clear activation state. */
export function _resetActivation(): void {
  activatedSessions.clear();
  completedGenerations = 0;
}
