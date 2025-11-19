/**
 * GA4 Cookie Utilities
 *
 * _ga CookieからGA4 Client IDを抽出するユーティリティ関数。
 * GA4では、_gaというファーストパーティCookieにClient IDが格納される。
 *
 * 一般的な形式（GS1/従来形式）:
 *   GA1.1.XXXXXXXXXX.YYYYYYYYYY
 * 末尾2セグメント（XXXXXXXXXX.YYYYYYYYYY）が Client ID として使用される。
 *
 * 参考:
 *  - _ga クッキーの例: GA1.1.40032303.1671533621
 *    → Client ID: 40032303.1671533621
 */

/**
 * 予期しない _ga 形式や不正な Client ID 抽出時に呼ばれるオプションのロガー型。
 *
 * 呼び出し側でアプリケーションロガーに橋渡ししたい場合に利用する。
 */
export type GaCookieDebugLogger = (message: string, context?: Record<string, unknown>) => void;

function debugLog(
  logger: GaCookieDebugLogger | undefined,
  message: string,
  context?: Record<string, unknown>
): void {
  if (!logger) return;
  try {
    logger(message, context);
  } catch {
    // ロガー側の例外でアプリの動作を止めないために握りつぶす
  }
}

/**
 * _ga Cookieの値からGA4 Client IDを抽出する。
 *
 * @param gaValue - _ga Cookieの値（例: "GA1.1.1234567890.1699999999"）
 * @param logger  - 任意のデバッグロガー（異常フォーマット検知用、オプショナル）
 * @returns Client ID（形式: "1234567890.1699999999"）、無効な場合はnull
 *
 * @example
 * extractClientIdFromGaCookie("GA1.1.1234567890.1699999999")
 * // => "1234567890.1699999999"
 *
 * extractClientIdFromGaCookie("GA1.1.123.456")
 * // => "123.456"
 *
 * extractClientIdFromGaCookie(undefined)
 * // => null
 */
export function extractClientIdFromGaCookie(
  gaValue: string | undefined,
  logger?: GaCookieDebugLogger
): string | null {
  if (!gaValue) {
    return null;
  }

  // 期待される一般的な形式:
  //   GA1.1.XXXXXXXXXX.YYYYYYYYYY
  // ただし、Universal/GA4いずれも「末尾2セグメントが Client ID」である点は共通。
  // 参考: GA1.1.233577256.1615161473 → 233577256.1615161473
  //       GA1.2.12349876.1500644855 → 12349876.1500644855
  const parts = gaValue.split(".");

  // 最低4セグメント（GA1.1.XXXXXXXXXX.YYYYYYYYYY）が必要
  if (parts.length < 4) {
    debugLog(logger, "[GA4] Unexpected _ga cookie format (too few segments)", {
      gaValue,
      segmentCount: parts.length,
    });
    return null;
  }

  // 末尾2セグメントを Client ID として取得
  const cid = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;

  // Client IDの形式検証: 数字.数字（例: 1234567890.1699999999）
  // Measurement Protocol では client_id は任意の文字列も許容されるが、
  // ここでは「標準的な _ga 由来の数値形式」のみを使用する。
  const clientIdPattern = /^\d+\.\d+$/;

  if (!clientIdPattern.test(cid)) {
    debugLog(logger, "[GA4] Invalid client_id pattern extracted from _ga", {
      gaValue,
      extractedClientId: cid,
    });
    return null;
  }

  return cid;
}
