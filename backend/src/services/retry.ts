import type { RetryStrategy } from "../types.js";

export type RetryPolicy = {
  strategy?: RetryStrategy;
  maxAttempts?: number;
  baseDelayMs?: number;
  delayMs?: number;
  multiplier?: number | string;
  maxDelayMs?: number;
};

export function nextRetryDelay(policy: RetryPolicy | null | undefined, attemptNumber: number): number {
  const base = Number(policy?.baseDelayMs ?? policy?.delayMs ?? 5000);
  const strategy = policy?.strategy ?? "exponential";
  const multiplier = Number(policy?.multiplier ?? 2);
  const cap = Number(policy?.maxDelayMs ?? 60000);
  const attempt = Math.max(1, attemptNumber);

  let delay = base;
  if (strategy === "linear") delay = base * attempt;
  if (strategy === "exponential") delay = Math.round(base * Math.pow(multiplier, attempt - 1));
  return Math.max(0, Math.min(delay, cap));
}

export function shouldRetry(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts;
}
