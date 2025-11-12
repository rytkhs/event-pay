/**
 * Mailpitヘルパー関数
 * Supabaseローカル開発環境でのメール取得とOTP抽出
 *
 * 注意: このヘルパーはテスト環境専用です。本番環境では使用しないでください。
 */

const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:54324";
const MAILPIT_API_BASE = `${MAILPIT_URL}/api/v1`;

export interface MailpitMessage {
  ID: string;
  From: {
    Name: string;
    Address: string;
  };
  To: Array<{
    Name: string;
    Address: string;
  }>;
  Subject: string;
  Created: string;
  Size: number;
  Snippet: string;
}

export interface MailpitMessagesResponse {
  total: number;
  unread: number;
  count: number;
  messages: MailpitMessage[];
}

export interface MailpitMessageDetail {
  ID: string;
  From: {
    Name: string;
    Address: string;
  };
  To: Array<{
    Name: string;
    Address: string;
  }>;
  Subject: string;
  Date: string;
  Text: string;
  HTML: string;
  Size: number;
}

/**
 * 指定したメールアドレス宛の最新のメールを取得
 * @param email メールアドレス
 * @param timeoutMs タイムアウト時間（ミリ秒）
 * @param pollIntervalMs ポーリング間隔（ミリ秒）
 * @returns メール情報（subject, body, html）
 */
export async function getLatestEmailForAddress(
  email: string,
  timeoutMs: number = 10000,
  pollIntervalMs: number = 500
): Promise<{ subject: string; body: string; html: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      // 全メッセージを取得してフィルタリング
      const response = await fetch(`${MAILPIT_API_BASE}/messages`);

      if (!response.ok) {
        console.warn(`Failed to fetch messages: ${response.status} ${response.statusText}`);
        await sleep(pollIntervalMs);
        continue;
      }

      const data: MailpitMessagesResponse = await response.json();

      if (!data.messages || data.messages.length === 0) {
        // メールがまだ届いていない場合は待機
        await sleep(pollIntervalMs);
        continue;
      }

      // 指定したメールアドレス宛のメッセージを検索
      const targetMessage = data.messages.find((msg) =>
        msg.To.some((to) => to.Address.toLowerCase() === email.toLowerCase())
      );

      if (!targetMessage) {
        // 該当メールがまだ届いていない場合は待機
        await sleep(pollIntervalMs);
        continue;
      }

      // メールの詳細を取得
      const detailResponse = await fetch(`${MAILPIT_API_BASE}/message/${targetMessage.ID}`);

      if (!detailResponse.ok) {
        throw new Error(
          `Failed to fetch message detail: ${detailResponse.status} ${detailResponse.statusText}`
        );
      }

      const emailDetail: MailpitMessageDetail = await detailResponse.json();

      return {
        subject: emailDetail.Subject,
        body: emailDetail.Text,
        html: emailDetail.HTML,
      };
    } catch (error) {
      // エラーが発生した場合もリトライ
      console.warn(`Error fetching email (will retry): ${error}`);
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Timeout: No email received for ${email} within ${timeoutMs}ms`);
}

/**
 * メール本文から6桁のOTPコードを抽出
 * @param emailBody メール本文（テキストまたはHTML）
 * @returns OTPコード（6桁の数字）、見つからない場合はnull
 */
export function extractOtpFromEmail(emailBody: string): string | null {
  // 6桁の数字を検索（単語境界で区切られている）
  const otpPattern = /\b(\d{6})\b/;
  const match = emailBody.match(otpPattern);

  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/**
 * 指定したメールアドレス宛の最新メールからOTPコードを取得
 * @param email メールアドレス
 * @param timeoutMs タイムアウト時間（ミリ秒）
 * @returns OTPコード（6桁の数字）
 */
export async function getOtpFromEmail(email: string, timeoutMs: number = 10000): Promise<string> {
  const emailData = await getLatestEmailForAddress(email, timeoutMs);

  // テキスト本文からOTPを抽出
  let otp = extractOtpFromEmail(emailData.body);

  // テキスト本文で見つからない場合はHTML本文から抽出
  if (!otp && emailData.html) {
    // HTMLタグを除去してテキストとして扱う
    const htmlText = emailData.html.replace(/<[^>]*>/g, " ");
    otp = extractOtpFromEmail(htmlText);
  }

  if (!otp) {
    throw new Error(`OTP code not found in email. Subject: ${emailData.subject}`);
  }

  return otp;
}

/**
 * 全メッセージを削除
 */
export async function clearAllMessages(): Promise<void> {
  try {
    const response = await fetch(`${MAILPIT_API_BASE}/messages`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      console.warn(`Failed to clear messages: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.warn(`Error clearing messages: ${error}`);
  }
}

/**
 * 指定したメールアドレス宛のメッセージをクリア（実際には全削除）
 * Mailpitは特定のメールアドレスのみを削除する機能がないため、全削除を実行
 * @param email メールアドレス（互換性のため残す）
 */
export async function clearMailbox(email: string): Promise<void> {
  await clearAllMessages();
}

/**
 * メール本文からパスワードリセットリンクを抽出
 * @param emailBody メール本文（テキストまたはHTML）
 * @returns パスワードリセットリンク（相対パスまたは絶対URL）、見つからない場合はnull
 */
export function extractPasswordResetLinkFromEmail(emailBody: string): string | null {
  // パターン1: 絶対URL形式（https://example.com/reset-password/update?...）
  const absoluteUrlPattern = /https?:\/\/[^\s"'<>]+\/reset-password\/update\?[^\s"'<>]+/;
  const absoluteMatch = emailBody.match(absoluteUrlPattern);

  if (absoluteMatch && absoluteMatch[0]) {
    return absoluteMatch[0];
  }

  // パターン2: 相対パス形式（/reset-password/update?...）
  const relativePathPattern = /\/reset-password\/update\?[^\s"'<>]+/;
  const relativeMatch = emailBody.match(relativePathPattern);

  if (relativeMatch && relativeMatch[0]) {
    return relativeMatch[0];
  }

  return null;
}

/**
 * 指定したメールアドレス宛の最新メールからパスワードリセットリンクを取得
 * @param email メールアドレス
 * @param timeoutMs タイムアウト時間（ミリ秒）
 * @returns パスワードリセットリンク（相対パスまたは絶対URL）
 */
export async function getPasswordResetLinkFromEmail(
  email: string,
  timeoutMs: number = 10000
): Promise<string> {
  const emailData = await getLatestEmailForAddress(email, timeoutMs);

  // HTML本文からリセットリンクを抽出
  let resetLink = null;
  if (emailData.html) {
    resetLink = extractPasswordResetLinkFromEmail(emailData.html);
  }

  // HTML本文で見つからない場合はテキスト本文から抽出
  if (!resetLink && emailData.body) {
    resetLink = extractPasswordResetLinkFromEmail(emailData.body);
  }

  if (!resetLink) {
    throw new Error(`Password reset link not found in email. Subject: ${emailData.subject}`);
  }

  return resetLink;
}

/**
 * 指定したミリ秒間スリープ
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
