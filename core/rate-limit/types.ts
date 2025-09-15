// v2 新APIの型
export type RateLimitPolicy = {
  scope: string;
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  blockMs: number;
};

export type EnforceOptions = {
  keys: string[];
  policy: RateLimitPolicy;
  allowIfStoreError?: boolean;
};

export type EnforceResult = {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
};
