import { NextRequest } from "next/server";
import { createHash } from "crypto";

/**
 * IPアドレス検証用の正規表現
 */
const IPv4_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/**
 * プライベートIPアドレスの範囲
 */
const PRIVATE_IP_RANGES = [
  /^127\./, // 127.0.0.0/8 (localhost)
  /^10\./, // 10.0.0.0/8
  /^172\.1[6-9]\./, // 172.16.0.0/12
  /^172\.2[0-9]\./, // 172.16.0.0/12
  /^172\.3[0-1]\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^169\.254\./, // 169.254.0.0/16 (link-local)
];

/**
 * IPv6アドレスが有効かどうかを検証する（簡易版）
 */
function isValidIPv6(ip: string): boolean {
  // よく使われるIPv6パターンをチェック
  if (ip === "::1" || ip === "::") {
    return true;
  }

  // 基本的なIPv6形式チェック（コロンを含み、16進数文字のみ）
  if (ip.includes(":") && /^[0-9a-fA-F:]+$/.test(ip)) {
    // 完全なIPv6アドレス（例：2001:0db8:85a3:0000:0000:8a2e:0370:7334）
    if (/^[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){7}$/.test(ip)) {
      return true;
    }

    // 圧縮形式のIPv6アドレス（::を含む）
    if (ip.includes("::")) {
      return true;
    }
  }

  return false;
}

/**
 * IPアドレスが有効かどうかを検証する
 */
export function isValidIP(ip: string): boolean {
  if (!ip || typeof ip !== "string") {
    return false;
  }

  const trimmedIP = ip.trim();

  // 基本的な長さチェック
  if (trimmedIP.length < 2 || trimmedIP.length > 45) {
    return false;
  }

  // IPv4またはIPv6の形式チェック
  return IPv4_REGEX.test(trimmedIP) || isValidIPv6(trimmedIP);
}

/**
 * IPアドレスがプライベートIPかどうかを判定する
 */
export function isPrivateIP(ip: string): boolean {
  if (!isValidIP(ip)) {
    return false;
  }

  // IPv6のlocalhostチェック
  if (ip === "::1" || ip === "::") {
    return true;
  }

  // IPv4のプライベートIPチェック
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

/**
 * IPアドレスを正規化する
 */
export function normalizeIP(ip: string): string {
  if (!ip || typeof ip !== "string") {
    return "127.0.0.1";
  }

  const trimmedIP = ip.trim().toLowerCase();

  // 基本的な検証
  if (!isValidIP(trimmedIP)) {
    // 本番環境では適切なログシステムに出力
    if ((process.env.NODE_ENV as string) === "development") {
      console.warn(`Invalid IP address detected: ${ip}, using fallback`);
    }
    return "127.0.0.1";
  }

  return trimmedIP;
}

/**
 * フォールバック識別子を生成する
 * プロキシヘッダーが全て存在しない場合の代替手段
 */
export function generateFallbackIdentifier(request: NextRequest): string {
  // セッション固有の情報からハッシュを生成
  const sessionData = [
    request.headers.get("user-agent") || "",
    request.headers.get("accept-language") || "",
    request.headers.get("accept-encoding") || "",
    request.headers.get("x-request-id") || "",
    Date.now().toString().slice(0, -3), // 1秒単位での時間（レート制限用）
  ].join("|");

  // SHA-256ハッシュの最初の16文字を使用（IP形式に近づける）
  const hash = createHash("sha256").update(sessionData).digest("hex").substring(0, 16);

  // 擬似IPアドレス形式に変換（識別しやすくするため）
  const segments = [
    parseInt(hash.substring(0, 2), 16) % 255,
    parseInt(hash.substring(2, 4), 16) % 255,
    parseInt(hash.substring(4, 6), 16) % 255,
    parseInt(hash.substring(6, 8), 16) % 255,
  ];

  return segments.join(".");
}

/**
 * クライアントIPアドレスを取得する（Edge Runtime互換版）
 *
 * @param request - Next.js Request オブジェクト
 * @returns クライアントのIPアドレス
 */
export function getClientIP(request: NextRequest): string {
  // Vercel本番環境でのプロキシヘッダー優先順位
  // Edge Runtimeの制約を考慮し、request.ipへの依存を最小化
  const ipSources = [
    // Vercel固有のヘッダー（最優先）
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim(),

    // 標準的なプロキシヘッダー
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),

    // CDN固有のヘッダー
    request.headers.get("cf-connecting-ip"), // Cloudflare
    request.headers.get("x-real-ip"), // Nginx
    request.headers.get("x-client-ip"), // Apache

    // その他のプロキシヘッダー
    request.headers.get("x-cluster-client-ip"),
    request.headers.get("x-forwarded"),
    request.headers.get("forwarded-for"),

    // 最後の手段（Edge Runtimeでは常にundefined）
    request.ip,
  ];

  // 有効なIPアドレスを順番に探す
  for (const source of ipSources) {
    if (source && isValidIP(source)) {
      const normalizedIP = normalizeIP(source);

      // プライベートIPでない場合は採用
      if (!isPrivateIP(normalizedIP)) {
        return normalizedIP;
      }

      // 明示的にlocalhostの場合は採用（開発環境用）
      if (source === "127.0.0.1" || source === "::1") {
        return normalizedIP;
      }
    }
  }

  // 全てのプロキシヘッダーが存在しない場合のフォールバック戦略
  if ((process.env.NODE_ENV as string) === "development") {
    // 開発環境ではlocalhostを返す
    return "127.0.0.1";
  } else {
    // 本番環境では擬似IPを生成（レート制限機能を維持するため）
    const fallbackIP = generateFallbackIdentifier(request);

    // 本番環境では適切なログシステムに出力
    if ((process.env.NODE_ENV as string) === "development") {
      console.warn("No valid client IP found, using fallback identifier", {
        fallbackIP,
        userAgent: request.headers.get("user-agent"),
        timestamp: new Date().toISOString(),
      });
    }

    return fallbackIP;
  }
}

/**
 * クライアント識別子を取得する（レート制限用）
 * IPアドレスベースの識別に加えて、より堅牢な識別を提供
 */
export function getClientIdentifier(request: NextRequest, userId?: string): string {
  // 認証済みユーザーの場合はユーザーIDを使用
  if (userId && userId.trim()) {
    return `user_${userId.trim().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  }

  // IPアドレスベースの識別
  const clientIP = getClientIP(request);
  return `ip_${clientIP}`;
}

/**
 * セキュリティログ用のクライアント情報を取得する
 */
export function getClientInfo(request: NextRequest) {
  return {
    ip: getClientIP(request),
    userAgent: request.headers.get("user-agent") || "unknown",
    acceptLanguage: request.headers.get("accept-language") || "unknown",
    referer: request.headers.get("referer") || "none",
    xForwardedFor: request.headers.get("x-forwarded-for") || "none",
    xRealIp: request.headers.get("x-real-ip") || "none",
    cfConnectingIp: request.headers.get("cf-connecting-ip") || "none",
    timestamp: new Date().toISOString(),
  };
}
