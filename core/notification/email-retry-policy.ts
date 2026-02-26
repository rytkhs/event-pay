import type { EmailErrorInfo } from "./types";

export const DEFAULT_MAX_ATTEMPTS = 2;
export const INITIAL_RETRY_DELAY_MS = 1000;
export const RATE_LIMIT_RETRY_DELAY_MS = 5000;
export const RETRY_JITTER_RATIO = 0.2;

function withJitter(
  baseDelayMs: number,
  randomFn: () => number,
  jitterRatio: number = RETRY_JITTER_RATIO
): number {
  const jitterFactor = 1 + (randomFn() * 2 - 1) * jitterRatio;
  return Math.max(0, Math.round(baseDelayMs * jitterFactor));
}

export function shouldRetry(options: {
  errorInfo: EmailErrorInfo;
  attempt: number;
  maxAttempts?: number;
}): boolean {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  return options.errorInfo.type === "transient" && options.attempt < maxAttempts;
}

export function computeRetryDelayMs(options: {
  attempt: number;
  statusCode?: number;
  errorName?: string;
  retryAfterSeconds?: number;
  randomFn?: () => number;
}): number {
  const randomFn = options.randomFn ?? Math.random;

  if (options.statusCode === 429 && typeof options.retryAfterSeconds === "number") {
    return Math.max(0, Math.round(options.retryAfterSeconds * 1000));
  }

  if (options.statusCode === 429 || options.errorName === "rate_limit_exceeded") {
    return withJitter(RATE_LIMIT_RETRY_DELAY_MS, randomFn);
  }

  return withJitter(INITIAL_RETRY_DELAY_MS * Math.pow(2, options.attempt), randomFn);
}
