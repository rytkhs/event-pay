import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { createProblemResponse } from "@core/api/problem-details";
import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";

import { getLimiterForPolicy, getRedisClient } from "./client";
import { protectIdentifier } from "./hash";
import type { EnforceOptions, EnforceResult, RateLimitPolicy } from "./types";

// 開発環境フォールバック（プロセス内）
const inMemoryPenalty = new Map<string, number>();
const inMemoryCounters = new Map<string, { count: number; resetAt: number }>();

function parseWindowMs(window: RateLimitPolicy["window"]): number {
  const [nStr, unit] = window.split(" ") as [string, "s" | "m" | "h" | "d"];
  const n = Number(nStr);
  const unitMs =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * unitMs;
}

function shouldFailClosed(globalFailClosed: boolean, isPublicPaymentScope: boolean): boolean {
  const publicFailClosed = getEnv().RL_FAIL_CLOSED_PUBLIC === "true";
  return globalFailClosed || (isPublicPaymentScope && publicFailClosed);
}

export async function enforceRateLimit(opts: EnforceOptions): Promise<EnforceResult> {
  const { keys, policy } = opts;
  const allowIfStoreError = opts.allowIfStoreError ?? getEnv().RL_FAIL_CLOSED !== "true";

  // ペナルティ優先
  const now = Date.now();
  // 1) Redis にペナルティキーがあれば TTL を優先採用
  const redis = getRedisClient();
  if (redis) {
    try {
      for (const k of keys) {
        const penaltyKey = `RL:penalty:${policy.scope}:${k}`;
        const ttl = await redis.ttl(penaltyKey);
        // ttl > 0 の場合はブロック継続中（秒）
        if (typeof ttl === "number" && ttl > 0) {
          return { allowed: false, retryAfter: ttl };
        }
      }
    } catch (error) {
      const failClosed = shouldFailClosed(
        getEnv().RL_FAIL_CLOSED === "true",
        policy.scope.startsWith("stripe.")
      );
      logger.warn("Rate limit penalty TTL read error", {
        tag: "rate_limit_store_error",
        scope: policy.scope,
        error_message: error instanceof Error ? error.message : String(error),
        phase: "read_penalty_ttl",
        fail_closed: failClosed,
      });
      if (!allowIfStoreError || failClosed) {
        return { allowed: false, retryAfter: Math.ceil(policy.blockMs / 1000) };
      }
      // フェイルオープン: 続行
    }
  }
  // 2) メモリ上のペナルティ（開発フォールバック）
  for (const k of keys) {
    const penaltyKey = `RL:penalty:${policy.scope}:${k}`;
    const exp = inMemoryPenalty.get(penaltyKey);
    if (exp && exp > now) {
      return { allowed: false, retryAfter: Math.ceil((exp - now) / 1000) };
    }
  }

  const limiter = getLimiterForPolicy(policy);
  try {
    if (limiter) {
      // Upstash: AND 判定
      let remainingMin: number | undefined = undefined;
      for (const k of keys) {
        const res = await limiter.limit(k);
        if (!res.success) {
          const retryAfter = Math.ceil(policy.blockMs / 1000);
          const penaltyKey = `RL:penalty:${policy.scope}:${k}`;
          // Redis にもペナルティ設定（存在すれば上書き）
          if (redis) {
            try {
              await redis.set(penaltyKey, "1", { ex: retryAfter });
            } catch (error) {
              const failClosed = shouldFailClosed(
                getEnv().RL_FAIL_CLOSED === "true",
                policy.scope.startsWith("stripe.")
              );
              logger.warn("Rate limit penalty set error", {
                tag: "rate_limit_store_error",
                scope: policy.scope,
                error_message: error instanceof Error ? error.message : String(error),
                phase: "set_penalty",
                fail_closed: failClosed,
              });
              if (!allowIfStoreError || failClosed) {
                return { allowed: false, retryAfter };
              }
            }
          }
          // メモリにも設定（フォールバック）
          inMemoryPenalty.set(penaltyKey, now + policy.blockMs);
          return { allowed: false, retryAfter };
        }
        if (typeof res.remaining === "number") {
          remainingMin =
            remainingMin === undefined ? res.remaining : Math.min(remainingMin, res.remaining);
        }
      }
      return { allowed: true, remaining: remainingMin };
    }
  } catch (error) {
    const failClosed = shouldFailClosed(
      getEnv().RL_FAIL_CLOSED === "true",
      policy.scope.startsWith("stripe.")
    );
    logger.warn("Rate limit store error", {
      tag: "rate_limit_store_error",
      scope: policy.scope,
      error_message: error instanceof Error ? error.message : String(error),
      fail_closed: failClosed,
    });
    if (!allowIfStoreError || failClosed) {
      return { allowed: false, retryAfter: Math.ceil(policy.blockMs / 1000) };
    }
    return { allowed: true };
  }

  // Upstash 未設定: メモリフォールバック
  const windowMs = parseWindowMs(policy.window);
  let remainingMin: number | undefined = undefined;
  for (const k of keys) {
    const bucketKey = `RL:${policy.scope}:${k}`;
    const bucket = inMemoryCounters.get(bucketKey);
    const now2 = Date.now();
    if (!bucket || bucket.resetAt <= now2) {
      inMemoryCounters.set(bucketKey, { count: 1, resetAt: now2 + windowMs });
      remainingMin =
        remainingMin === undefined ? policy.limit - 1 : Math.min(remainingMin, policy.limit - 1);
      continue;
    }
    if (bucket.count >= policy.limit) {
      const penaltyKey = `RL:penalty:${policy.scope}:${k}`;
      inMemoryPenalty.set(penaltyKey, now2 + policy.blockMs);
      return { allowed: false, retryAfter: Math.ceil(policy.blockMs / 1000) };
    }
    bucket.count += 1;
    inMemoryCounters.set(bucketKey, bucket);
    remainingMin =
      remainingMin === undefined
        ? policy.limit - bucket.count
        : Math.min(remainingMin, policy.limit - bucket.count);
  }
  return { allowed: true, remaining: remainingMin };
}

export function withRateLimit(
  policy: RateLimitPolicy,
  keyBuilder: (req: NextRequest) => string | string[]
): (req: NextRequest) => Promise<NextResponse | null> {
  return async (req: NextRequest) => {
    const keyInput = keyBuilder(req);
    const keys = Array.isArray(keyInput) ? keyInput : [keyInput];
    const result = await enforceRateLimit({ keys, policy });
    if (!result.allowed) {
      const res = createProblemResponse("RATE_LIMITED", {
        instance: req.nextUrl.pathname,
        retryable: true,
      });
      // Retry-After は必ず付与（わからない場合は policy.blockMs を採用）
      const retryAfterSec = result.retryAfter ?? Math.ceil(policy.blockMs / 1000);
      res.headers.set("Retry-After", String(retryAfterSec));
      // ログ: key_hint（識別子を短縮表示）
      const keyHints = keys.map((k) => {
        const parts = k.split(":");
        // 形式: RL:<scope>:<dimension>:<identifier>
        const dimension = parts[2] || "?";
        const identifier = parts[3] || k.slice(-8);
        return `${dimension}:${identifier}`;
      });
      logger.warn("rate limited", {
        tag: "rate_limited",
        scope: policy.scope,
        retry_after: retryAfterSec,
        key_hint: keyHints,
      });
      return res;
    }
    return null;
  };
}

export function buildKey(params: {
  scope: string;
  ip?: string;
  userId?: string;
  email?: string;
  token?: string;
  attendanceId?: string;
  extras?: string[];
}): string | string[] {
  const parts: string[] = [];
  const { scope, ip, userId, email, token, attendanceId, extras } = params;
  if (ip) parts.push(`RL:${scope}:ip:${ip}`);
  if (userId) parts.push(`RL:${scope}:user:${userId}`);
  if (email) parts.push(`RL:${scope}:email:${protectIdentifier(email)}`);
  if (token) parts.push(`RL:${scope}:token:${protectIdentifier(token)}`);
  if (attendanceId) parts.push(`RL:${scope}:attendance:${attendanceId}`);
  if (extras && extras.length > 0) parts.push(...extras.map((e) => `RL:${scope}:x:${e}`));

  if (parts.length === 0) {
    return `RL:${scope}`;
  }
  return parts;
}

export const POLICIES: Record<string, RateLimitPolicy> = {
  "auth.register": { scope: "auth.register", limit: 5, window: "15 m", blockMs: 60 * 60 * 1000 },
  "auth.login": { scope: "auth.login", limit: 10, window: "15 m", blockMs: 30 * 60 * 1000 },
  "auth.passwordReset": {
    scope: "auth.passwordReset",
    limit: 5,
    window: "1 h",
    blockMs: 2 * 60 * 60 * 1000,
  },
  "auth.emailResend": {
    scope: "auth.emailResend",
    limit: 4,
    window: "1 m",
    blockMs: 3 * 60 * 1000,
  },
  invite: { scope: "invite", limit: 10, window: "5 m", blockMs: 15 * 60 * 1000 },
  participation: { scope: "participation", limit: 10, window: "5 m", blockMs: 15 * 60 * 1000 },
  "guest.general": { scope: "guest.general", limit: 15, window: "5 m", blockMs: 15 * 60 * 1000 },
  general: { scope: "general", limit: 60, window: "1 m", blockMs: 5 * 60 * 1000 },
  "payment.createSession": {
    scope: "payment.createSession",
    limit: 3,
    window: "10 s",
    blockMs: 20 * 1000,
  },
  "payment.statusUpdate": {
    scope: "payment.statusUpdate",
    limit: 10,
    window: "5 s",
    blockMs: 20 * 1000,
  },
  "payout.manual": { scope: "payout.manual", limit: 3, window: "1 m", blockMs: 5 * 60 * 1000 },
  "stripe.checkout": { scope: "stripe.checkout", limit: 10, window: "1 m", blockMs: 2 * 60 * 1000 },
  "stripe.paymentIntent": {
    scope: "stripe.paymentIntent",
    limit: 5,
    window: "1 m",
    blockMs: 5 * 60 * 1000,
  },
  "export.participantsCsv": {
    scope: "export.participantsCsv",
    limit: 5,
    window: "5 m",
    blockMs: 15 * 60 * 1000,
  },
  "contact.submit": {
    scope: "contact.submit",
    limit: 5,
    window: "1 m",
    blockMs: 5 * 60 * 1000,
  },
  "demo.create": {
    scope: "demo.create",
    limit: 10,
    window: "1 h",
    blockMs: 24 * 60 * 60 * 1000,
  },
};

export * from "./types";
