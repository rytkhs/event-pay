import { createHash } from "crypto";

import { NextRequest } from "next/server";

import { getEnv } from "./cloudflare-env";

/**
 * ヘッダーアクセス用のインターフェース
 * NextRequest.headers、Web API Headers、Next.js ReadonlyHeaders すべてに対応
 */
interface HeaderLike {
  get(name: string): string | null;
}

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
function isValidIP(ip: string): boolean {
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
function isPrivateIP(ip: string): boolean {
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
function normalizeIP(ip: string): string {
  if (!ip || typeof ip !== "string") {
    return "127.0.0.1";
  }

  const trimmedIP = ip.trim().toLowerCase();

  // 基本的な検証
  if (!isValidIP(trimmedIP)) {
    // 本番環境では適切なログシステムに出力
    if (getEnv().NODE_ENV === "development") {
      import("@core/logging/app-logger").then(({ logger }) =>
        logger.warn("Invalid IP address detected. Using fallback.", {
          tag: "ipDetection",
          ip,
        })
      );
    }
    return "127.0.0.1";
  }

  return trimmedIP;
}

/**
 * フォールバック識別子を生成する
 * プロキシヘッダーが全て存在しない場合の代替手段
 */
function generateFallbackIdentifier(request: NextRequest): string {
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
export function getClientIP(request: NextRequest): string;
export function getClientIP(headers: HeaderLike): string;
export function getClientIP(requestOrHeaders: NextRequest | HeaderLike): string {
  // NextRequestかHeaderLikeかを判定
  const headers = "headers" in requestOrHeaders ? requestOrHeaders.headers : requestOrHeaders;

  // 信頼度ベースでのIPヘッダー優先順位
  // セキュリティ重要度: HIGH > MEDIUM > LOW
  const ipSources = [
    // 🟢 HIGH: 偽装が困難な信頼できるヘッダー
    {
      ip: headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim(),
      trust: "high",
      source: "Vercel",
    },
    {
      ip: headers.get("cf-connecting-ip"),
      trust: "high",
      source: "Cloudflare",
    },

    // 🟡 MEDIUM: CDN/プロキシ固有ヘッダー（中程度の信頼度）
    {
      ip: headers.get("x-real-ip"),
      trust: "medium",
      source: "Nginx",
    },
    {
      ip: headers.get("x-client-ip"),
      trust: "medium",
      source: "Apache",
    },

    // 🔴 LOW: 偽装可能な汎用ヘッダー（注意深い使用）
    {
      ip: headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      trust: "low",
      source: "X-Forwarded-For",
    },
    {
      ip: headers.get("x-cluster-client-ip"),
      trust: "low",
      source: "Cluster",
    },
    {
      ip: headers.get("x-forwarded"),
      trust: "low",
      source: "Forwarded",
    },
    {
      ip: headers.get("forwarded-for"),
      trust: "low",
      source: "Forwarded-For",
    },

    // 最後の手段（Edge Runtimeでは常にundefined）
    {
      ip: "ip" in requestOrHeaders ? requestOrHeaders.ip : undefined,
      trust: "low",
      source: "Request.ip",
    },
  ];

  // 信頼度の高いIPアドレスを優先して探す
  let selectedIP: string | null = null;
  let selectedTrust: string | null = null;
  let selectedSource: string | null = null;

  for (const { ip, trust, source } of ipSources) {
    if (ip && isValidIP(ip)) {
      const normalizedIP = normalizeIP(ip);

      // プライベートIPでない場合は採用候補
      if (!isPrivateIP(normalizedIP)) {
        selectedIP = normalizedIP;
        selectedTrust = trust;
        selectedSource = source;

        // 高信頼度の場合は即座に採用
        if (trust === "high") {
          break;
        }
      }

      // 明示的にlocalhostの場合は開発環境用として採用
      if ((ip === "127.0.0.1" || ip === "::1") && !selectedIP) {
        selectedIP = normalizedIP;
        selectedTrust = trust;
        selectedSource = source;
      }
    }
  }

  // 選択されたIPアドレスがある場合
  if (selectedIP) {
    // セキュリティログ: 低信頼度ヘッダーの使用を警告
    if (selectedTrust === "low" && getEnv().NODE_ENV === "development") {
      import("@core/logging/app-logger").then(({ logger }) =>
        logger.warn("Using low-trust IP header", {
          tag: "ipDetection",
          source: selectedSource || undefined,
          ip: selectedIP,
        })
      );
    }
    return selectedIP;
  }

  // 全てのプロキシヘッダーが存在しない場合のフォールバック戦略
  if (getEnv().NODE_ENV === "development") {
    // 開発環境ではlocalhostを返す
    return "127.0.0.1";
  } else {
    // 本番環境では擬似IPを生成（レート制限機能を維持するため）
    // NextRequestの場合のみfallback identifierを生成可能
    const fallbackIP =
      "headers" in requestOrHeaders ? generateFallbackIdentifier(requestOrHeaders) : "127.0.0.1"; // Headersのみの場合はlocalhostを使用

    // 本番環境では適切なログシステムに出力
    if (getEnv().NODE_ENV === "development") {
      import("@core/logging/app-logger").then(({ logger }) =>
        logger.warn("No valid client IP found, using fallback identifier", {
          tag: "ipDetection",
          fallback_ip: fallbackIP,
          user_agent: headers.get("user-agent") || undefined,
        })
      );
    }

    return fallbackIP;
  }
}

/**
 * Server Component/Server Actions用のIPアドレス取得関数
 * Next.js の headers() 関数から取得したオブジェクトに特化
 */
export function getClientIPFromHeaders(headersList: HeaderLike): string {
  // 信頼度ベースでのIPヘッダー優先順位（Server Components用）
  const ipSources = [
    // 🟢 HIGH: 偽装が困難な信頼できるヘッダー
    {
      ip: headersList.get("x-vercel-forwarded-for")?.split(",")[0]?.trim(),
      trust: "high",
      source: "Vercel",
    },
    {
      ip: headersList.get("cf-connecting-ip"),
      trust: "high",
      source: "Cloudflare",
    },

    // 🟡 MEDIUM: CDN/プロキシ固有ヘッダー（中程度の信頼度）
    {
      ip: headersList.get("x-real-ip"),
      trust: "medium",
      source: "Nginx",
    },
    {
      ip: headersList.get("x-client-ip"),
      trust: "medium",
      source: "Apache",
    },

    // 🔴 LOW: 偽装可能な汎用ヘッダー（注意深い使用）
    {
      ip: headersList.get("x-forwarded-for")?.split(",")[0]?.trim(),
      trust: "low",
      source: "X-Forwarded-For",
    },
    {
      ip: headersList.get("x-cluster-client-ip"),
      trust: "low",
      source: "Cluster",
    },
    {
      ip: headersList.get("x-forwarded"),
      trust: "low",
      source: "Forwarded",
    },
    {
      ip: headersList.get("forwarded-for"),
      trust: "low",
      source: "Forwarded-For",
    },
  ];

  // 信頼度の高いIPアドレスを優先して探す
  let selectedIP: string | null = null;
  let selectedTrust: string | null = null;
  let selectedSource: string | null = null;

  for (const { ip, trust, source } of ipSources) {
    if (ip && isValidIP(ip)) {
      const normalizedIP = normalizeIP(ip);

      // プライベートIPでない場合は採用候補
      if (!isPrivateIP(normalizedIP)) {
        selectedIP = normalizedIP;
        selectedTrust = trust;
        selectedSource = source;

        // 高信頼度の場合は即座に採用
        if (trust === "high") {
          break;
        }
      }

      // 明示的にlocalhostの場合は開発環境用として採用
      if ((ip === "127.0.0.1" || ip === "::1") && !selectedIP) {
        selectedIP = normalizedIP;
        selectedTrust = trust;
        selectedSource = source;
      }
    }
  }

  // 選択されたIPアドレスがある場合
  if (selectedIP) {
    // セキュリティログ: 低信頼度ヘッダーの使用を警告
    if (selectedTrust === "low" && getEnv().NODE_ENV === "development") {
      import("@core/logging/app-logger").then(({ logger }) =>
        logger.warn("[Server Component] Using low-trust IP header", {
          tag: "ipDetection",
          source: selectedSource || undefined,
          ip: selectedIP,
        })
      );
    }
    return selectedIP;
  }

  // 全てのプロキシヘッダーが存在しない場合は開発環境想定のlocalhostを返す
  return "127.0.0.1";
}

/**
 * クライアント識別子を取得する（レート制限用）
 * IPアドレスベースの識別に加えて、より堅牢な識別を提供
 */
export function getClientIdentifier(request: NextRequest, userId?: string): string {
  // 認証済みユーザーの場合はユーザーIDを使用
  if (userId?.trim()) {
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
