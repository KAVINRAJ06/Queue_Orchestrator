import type { JobState, RetryStrategy } from "../types.js";
import { nextRetryDelay, shouldRetry } from "./retry.js";

export type FailurePlanInput = {
  attempts: number;
  maxAttempts: number;
  policy: {
    strategy?: RetryStrategy;
    baseDelayMs?: number;
    multiplier?: number | string;
    maxDelayMs?: number;
  };
};

export type FailurePlan =
  | {
      terminal: false;
      nextState: JobState;
      transitionPath: JobState[];
      delayMs: number;
      nextRetryAt: Date;
    }
  | {
      terminal: true;
      nextState: JobState;
      transitionPath: JobState[];
    };

export function planFailure(input: FailurePlanInput, now = new Date()): FailurePlan {
  if (shouldRetry(input.attempts, input.maxAttempts)) {
    const delayMs = nextRetryDelay(input.policy, input.attempts);
    return {
      terminal: false,
      nextState: "scheduled",
      transitionPath: ["failed", "retrying", "scheduled"],
      delayMs,
      nextRetryAt: new Date(now.getTime() + delayMs),
    };
  }
  return {
    terminal: true,
    nextState: "dead",
    transitionPath: ["failed", "dead"],
  };
}
