/**
 * プライバシー保護のためのマスク処理ユーティリティ
 * 画面表示時の個人情報マスキングを行います
 */

/**
 * メールアドレスをプライバシー保護のためにマスクします
 *
 * 例:
 * - user@example.com → us***@example.com
 * - john.doe@gmail.com → jo***@gmail.com
 * - a@test.co.jp → a***@test.co.jp
 *
 * @param email マスクするメールアドレス
 * @returns マスクされたメールアドレス
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== "string") {
    return "";
  }

  // メールアドレスの形式チェック（基本的な@の存在確認）
  const atIndex = email.indexOf("@");
  if (atIndex === -1) {
    // @がない場合は全体をマスク
    return email.length > 1 ? email[0] + "***" : "***";
  }

  const localPart = email.substring(0, atIndex);
  const domainPart = email.substring(atIndex + 1);

  // ローカル部（@より前）のマスク処理
  let maskedLocal: string;
  if (localPart.length === 0) {
    maskedLocal = "***";
  } else if (localPart.length === 1) {
    maskedLocal = localPart + "***";
  } else if (localPart.length === 2) {
    maskedLocal = localPart + "***";
  } else {
    // 最初の2文字を残し、残りを***でマスク
    maskedLocal = localPart.substring(0, 2) + "***";
  }

  // ドメイン部はそのまま表示
  return `${maskedLocal}@${domainPart}`;
}

/**
 * Stripeセッション IDをセキュリティのためにマスクします
 * デバッグ性を考慮: 先頭12文字のみ表示し、残りを"..."でマスク
 *
 * 例:
 * - cs_test_1234567890abcdef → cs_test_1234...
 * - cs_live_abcdefgh12345678 → cs_live_abcd...
 * - short_id → sho***
 *
 * @param sessionId マスクするStripeセッション ID
 * @returns マスクされたセッション ID
 */
export function maskSessionId(sessionId: string | null | undefined): string {
  if (!sessionId || typeof sessionId !== "string") {
    return "***";
  }

  // 8文字以下の場合は全体をマスク（セキュリティ配慮）
  if (sessionId.length <= 8) {
    return sessionId.substring(0, 3) + "***";
  }

  // デバッグ性を考慮: 先頭12文字 + "..."
  return `${sessionId.substring(0, 12)}...`;
}

/**
 * 決済関連IDをセキュリティのためにマスクします
 * Payment Intent ID, Setup Intent ID等に使用
 *
 * 例:
 * - pi_1234567890abcdef → pi_12***def
 * - si_abcdefgh12345678 → si_ab***678
 *
 * @param paymentId マスクする決済ID
 * @returns マスクされた決済ID
 */
export function maskPaymentId(paymentId: string | null | undefined): string {
  if (!paymentId || typeof paymentId !== "string") {
    return "***";
  }

  // 8文字以下の場合は全体をマスク
  if (paymentId.length <= 8) {
    return paymentId.substring(0, 2) + "***";
  }

  // 先頭4文字 + *** + 末尾3文字
  return `${paymentId.substring(0, 4)}***${paymentId.substring(paymentId.length - 3)}`;
}
