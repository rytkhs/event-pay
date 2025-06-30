import { NextRequest, NextResponse } from "next/server";
import { SecurityHandler } from "./security-handler";

/**
 * CSRF保護ミドルウェア
 */
export async function withCSRFProtection(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  // GETリクエストは除外
  if (request.method === "GET") {
    return handler(request);
  }

  // CSRF検証を実行
  const isValid = await SecurityHandler.validateCSRFProtection(request);
  
  if (!isValid) {
    return NextResponse.json(
      { 
        error: "CSRF validation failed",
        message: "リクエストが無効です。ページを再読み込みしてください。" 
      },
      { status: 403 }
    );
  }

  return handler(request);
}

/**
 * CSRF保護の簡易チェック関数（既存コードとの互換性用）
 */
export async function validateCSRFRequest(request: NextRequest): Promise<boolean> {
  return SecurityHandler.validateCSRFProtection(request);
}

/**
 * CSRFトークンを生成してレスポンスに設定
 */
export function setCSRFTokenInResponse(response: NextResponse): string {
  return SecurityHandler.setCSRFToken(response);
}