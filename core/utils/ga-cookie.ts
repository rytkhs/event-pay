/**
 * GA4 Cookie Utilities
 *
 * _ga CookieからGA4 Client IDを抽出するユーティリティ関数
 * GA4は_gaというファーストパーティCookieにClient IDを格納する
 * 形式: GA1.1.XXXXXXXXXX.YYYYYYYYYY
 * Client IDは末尾2セグメント（XXXXXXXXXX.YYYYYYYYYY）で構成される
 */

/**
 * _ga Cookieの値からGA4 Client IDを抽出する
 *
 * @param gaValue - _ga Cookieの値（例: "GA1.1.1234567890.1699999999"）
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
export function extractClientIdFromGaCookie(gaValue: string | undefined): string | null {
  if (!gaValue) {
    return null;
  }

  // _ga Cookieの形式: GA1.1.XXXXXXXXXX.YYYYYYYYYY
  // 末尾2セグメントがClient ID
  const parts = gaValue.split(".");

  // 最低4セグメント（GA1.1.XXXXXXXXXX.YYYYYYYYYY）が必要
  if (parts.length < 4) {
    return null;
  }

  // 末尾2セグメントを取得
  const cid = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;

  // Client IDの形式検証: 数字.数字（例: 1234567890.1699999999）
  const clientIdPattern = /^\d+\.\d+$/;
  if (!clientIdPattern.test(cid)) {
    return null;
  }

  return cid;
}
