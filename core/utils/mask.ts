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
