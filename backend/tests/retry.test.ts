import { describe, expect, it } from "vitest";
import { planFailure } from "../src/services/failure-plan.js";
import { nextRetryDelay } from "../src/services/retry.js";

describe("retry backoff", () => {
  it("calculates fixed, linear, and exponential delays with a cap", () => {
    expect(nextRetryDelay({ strategy: "fixed", baseDelayMs: 1000, maxDelayMs: 10_000 }, 3)).toBe(1000);
    expect(nextRetryDelay({ strategy: "linear", baseDelayMs: 1000, maxDelayMs: 10_000 }, 3)).toBe(3000);
    expect(nextRetryDelay({ strategy: "exponential", baseDelayMs: 1000, multiplier: 2, maxDelayMs: 3500 }, 4)).toBe(3500);
  });

  it("plans retry transitions before max attempts", () => {
    const now = new Date("2026-07-03T00:00:00.000Z");
    const plan = planFailure({
      attempts: 1,
      maxAttempts: 3,
      policy: { strategy: "exponential", baseDelayMs: 1000, multiplier: 2, maxDelayMs: 60_000 },
    }, now);
    expect(plan).toMatchObject({
      terminal: false,
      nextState: "scheduled",
      transitionPath: ["failed", "retrying", "scheduled"],
      delayMs: 1000,
    });
    if (!plan.terminal) expect(plan.nextRetryAt.toISOString()).toBe("2026-07-03T00:00:01.000Z");
  });

  it("plans dead-letter transition after max attempts", () => {
    expect(planFailure({
      attempts: 3,
      maxAttempts: 3,
      policy: { strategy: "fixed", baseDelayMs: 1000, maxDelayMs: 10_000 },
    })).toEqual({
      terminal: true,
      nextState: "dead",
      transitionPath: ["failed", "dead"],
    });
  });
});
