import { NextRequest, NextResponse } from 'next/server'
import { AuthHandler } from '@/lib/middleware/auth-handler'
import { SecurityHandler } from '@/lib/middleware/security-handler'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const pathname = request.nextUrl.pathname

  // 最も効率的な早期リターン
  if (AuthHandler.shouldSkipAuth(pathname)) {
    return response
  }

  // 認証処理（キャッシュ活用 + 並列処理）
  const authRedirect = await AuthHandler.handleAuth(request, response)
  if (authRedirect) {
    return authRedirect
  }

  // セキュリティ設定を並列で適用
  SecurityHandler.apply(request, response)
  SecurityHandler.applyPathSpecificSecurity(pathname, response)

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
}