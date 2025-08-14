// ------------------------------
// 共通定数とユーティリティ
// ------------------------------

/**
 * 整数環境変数のパースユーティリティ
 * @param name 環境変数名
 * @param defaultValue フォールバック値
 */
function parseIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

// ===== Payout Scheduler Defaults =====
export const DEFAULT_PAYOUT_DAYS_AFTER_EVENT = parseIntEnv("PAYOUT_SCHEDULER_DAYS_AFTER_EVENT", 5);
export const DEFAULT_PAYOUT_MAX_EVENTS_PER_RUN = parseIntEnv("PAYOUT_SCHEDULER_MAX_EVENTS_PER_RUN", 100);
export const DEFAULT_PAYOUT_MAX_CONCURRENCY = parseIntEnv("PAYOUT_SCHEDULER_MAX_CONCURRENCY", 3);
export const DEFAULT_PAYOUT_DELAY_BETWEEN_BATCHES = parseIntEnv("PAYOUT_SCHEDULER_DELAY_BETWEEN_BATCHES", 1000);

// ===== Payout Amount Bounds =====
export const MAX_PAYOUT_AMOUNT = parseIntEnv("MAX_PAYOUT_AMOUNT", 100_000_000); // 1億円

// ===== Stripe Transfer Amount Bounds =====
export const MIN_STRIPE_TRANSFER_AMOUNT = 1; // 1円
export const MAX_STRIPE_TRANSFER_AMOUNT = 999_999_999; // Stripe制限
