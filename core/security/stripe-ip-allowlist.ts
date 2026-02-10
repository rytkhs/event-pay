/**
 * Stripe Webhook 送信元 IP 許可リスト検証
 * - 本番環境のみ有効化（既定）
 * - 公式 JSON を定期取得してキャッシュ
 * - 追加許可 IP は環境変数で上書き可能
 */

import { getEnv } from "@core/utils/cloudflare-env";

const STRIPE_IPS_JSON_URL = "https://stripe.com/files/ips/ips_webhooks.json";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type StripeIpsResponse = {
  WEBHOOKS?: string[];
  webhooks?: string[];
};

let cachedIps: {
  set: Set<string>;
  fetchedAt: number;
  ttlMs: number;
} | null = null;

function now(): number {
  return Date.now();
}

function parseExtraIpsFromEnv(): string[] {
  const extra = getEnv().STRIPE_WEBHOOK_ALLOWED_IPS_EXTRA?.trim();
  if (!extra) return [];
  return extra
    .split(/[,\n\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isProduction(): boolean {
  const env = getEnv();
  return env.NODE_ENV === "production";
}

/**
 * Stripe Webhook IP許可リスト検証の有効/無効を判定
 *
 * 環境変数 ENABLE_STRIPE_IP_CHECK の制御:
 * - "false" | "0" | "no" | "off": 強制的に無効化（本番環境でも無効）
 * - "true" | "1" | "yes" | "on": 強制的に有効化（テスト環境でも有効）
 * - 未設定または空文字: 本番環境のみ有効、テスト環境では無効
 *
 * @returns IP許可リスト検証を実行するかどうか
 */
export function shouldEnforceStripeWebhookIpCheck(): boolean {
  const explicitSetting = getEnv().ENABLE_STRIPE_IP_CHECK?.trim();

  // 明示的に無効化
  if (explicitSetting && /^(?:0|false|no|off)$/i.test(explicitSetting)) {
    return false;
  }

  // 明示的に有効化（テスト環境でも強制的に有効）
  if (explicitSetting && /^(?:1|true|yes|on)$/i.test(explicitSetting)) {
    return true;
  }

  // デフォルト：本番環境のみ有効
  return isProduction();
}

async function getStripeWebhookAllowedIPs(options?: { ttlMs?: number }): Promise<Set<string>> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;

  // キャッシュ新鮮
  if (cachedIps && now() - cachedIps.fetchedAt < cachedIps.ttlMs) {
    return new Set([...cachedIps.set]);
  }

  // フェッチ
  try {
    const response = await fetch(STRIPE_IPS_JSON_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to fetch Stripe IP list: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as StripeIpsResponse;
    const webhookIps = Array.isArray(payload.WEBHOOKS)
      ? payload.WEBHOOKS
      : Array.isArray(payload.webhooks)
        ? payload.webhooks
        : [];
    const ips = new Set<string>([...webhookIps, ...parseExtraIpsFromEnv()]);

    cachedIps = { set: ips, fetchedAt: now(), ttlMs };
    return new Set([...ips]);
  } catch (_err) {
    // フェッチ失敗時はキャッシュがあればそれを返す。無ければ追加許可のみで生成。
    if (cachedIps) {
      return new Set([...cachedIps.set]);
    }
    return new Set(parseExtraIpsFromEnv());
  }
}

/**
 * IPv4 アドレス同士の一致を高速判定（必要に応じて CIDR を拡張可能）
 * Stripe 提供 JSON は単一 IP の配列だが、将来 CIDR に変わっても対応しやすい形にしておく。
 */
function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    acc = (acc << 8) + n;
  }
  return acc >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  // 単一 IP
  if (!cidr.includes("/")) {
    return ip === cidr;
  }
  // IPv4 CIDR の簡易対応
  const [base, maskStr] = cidr.split("/");
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base);
  const mask = Number(maskStr);
  if (ipInt == null || baseInt == null || !Number.isInteger(mask) || mask < 0 || mask > 32) {
    return false;
  }
  const maskInt = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
  return (ipInt & maskInt) === (baseInt & maskInt);
}

export async function isStripeWebhookIpAllowed(ip: string): Promise<boolean> {
  if (!ip || typeof ip !== "string") return false;
  const normalized = ip.trim();
  const ips = await getStripeWebhookAllowedIPs();

  // まずは完全一致
  if (ips.has(normalized)) return true;

  // CIDR 形式を含む可能性に備えて一応チェック
  for (const allowed of ips) {
    if (allowed.includes("/") && isIpInCidr(normalized, allowed)) return true;
  }

  return false;
}
