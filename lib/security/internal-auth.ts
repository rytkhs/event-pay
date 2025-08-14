/**
 * 内部API認証機能
 * HMAC署名またはAPIキーによる認証
 */

import { NextRequest } from "next/server";
import { createHmac } from "crypto";

export interface InternalAuthResult {
  success: boolean;
  error?: string;
}

/**
 * 内部リクエストの認証を検証
 */
export async function verifyInternalRequest(request: NextRequest, bodyText?: string): Promise<InternalAuthResult> {
  try {
    // APIキーによる認証
    const apiKey = request.headers.get("x-api-key");
    const expectedApiKey = process.env.INTERNAL_API_KEY;

    if (expectedApiKey && apiKey === expectedApiKey) {
      return { success: true };
    }

    // HMAC署名による認証（より安全）
    const signature = request.headers.get("x-signature");
    const timestamp = request.headers.get("x-timestamp");
    const secret = process.env.INTERNAL_API_SECRET;

    if (signature && timestamp && secret) {
      const timestampNum = parseInt(timestamp, 10);
      const now = Math.floor(Date.now() / 1000);

      // タイムスタンプが5分以内かチェック
      if (Math.abs(now - timestampNum) > 300) {
        return { success: false, error: "Timestamp too old" };
      }

      // リクエストボディを使用（引数で渡された場合はそれを使用）
      const body = bodyText !== undefined ? bodyText : await request.text().catch(() => "");
      const payload = `${timestamp}.${body}`;
      const expectedSignature = createHmac("sha256", secret)
        .update(payload)
        .digest("hex");

      if (signature === `sha256=${expectedSignature}`) {
        return { success: true };
      }
    }

    // 開発環境では認証をスキップ
    if (process.env.NODE_ENV === "development") {
      return { success: true };
    }

    return { success: false, error: "Authentication failed" };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Authentication error"
    };
  }
}
