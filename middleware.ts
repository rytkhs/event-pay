import { NextRequest, NextResponse } from "next/server";
import { AuthHandler } from "@/lib/middleware/auth-handler";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 認証チェックをスキップするパス
  if (AuthHandler.shouldSkipAuth(pathname)) {
    return NextResponse.next();
  }

  // 認証処理（Server Actionsは自動CSRF保護）
  const response = NextResponse.next();
  const authRedirect = await AuthHandler.handleAuth(request, response);
  if (authRedirect) {
    return authRedirect;
  }

  return response;
}

export const config = {
  matcher: [
    // 認証が必要なページのみ
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|health).*)",
  ],
};
