// lib/activation.test.ts
// Activation tracking must count completed generations, de-dupe distinct sessions,
// tolerate a missing session id, and never leak an identifier in its output.

import { describe, it, expect, beforeEach } from "vitest";
import { recordActivation, getActivation, _resetActivation } from "./activation";

beforeEach(() => _resetActivation());

describe("recordActivation", () => {
  it("starts at zero", () => {
    expect(getActivation()).toEqual({ completedGenerations: 0, activatedSessions: 0 });
  });

  it("counts every completed generation but de-dupes sessions", () => {
    recordActivation("session-a");
    recordActivation("session-a"); // same session, second platform card
    recordActivation("session-b");

    expect(getActivation()).toEqual({ completedGenerations: 3, activatedSessions: 2 });
  });

  it("counts a completed generation even without a session id", () => {
    recordActivation(undefined);
    recordActivation("");

    const { completedGenerations, activatedSessions } = getActivation();
    expect(completedGenerations).toBe(2);
    expect(activatedSessions).toBe(0); // no id → not counted as a distinct session
  });

  it("only exposes counts, never the session ids", () => {
    recordActivation("secret-session-id");
    const snapshot = getActivation();
    expect(Object.keys(snapshot).sort()).toEqual(["activatedSessions", "completedGenerations"]);
    expect(JSON.stringify(snapshot)).not.toContain("secret-session-id");
  });
});
