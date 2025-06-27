import { NextRequest, NextResponse } from 'next/server'
import { SECURITY_HEADERS, COOKIE_CONFIG, AUTH_CONFIG } from '@/config/security'

/**
 * セキュリティヘッダーとCookieの効率的な処理
 */
export class SecurityHandler {
  /**
   * セキュリティヘッダーを一括設定
   */
  static applySecurityHeaders(response: NextResponse): void {
    // 高速化のためにループではなく直接設定
    response.headers.set('X-Frame-Options', SECURITY_HEADERS['X-Frame-Options'])
    response.headers.set('X-Content-Type-Options', SECURITY_HEADERS['X-Content-Type-Options'])
    response.headers.set('Referrer-Policy', SECURITY_HEADERS['Referrer-Policy'])
    response.headers.set('X-XSS-Protection', SECURITY_HEADERS['X-XSS-Protection'])
    
    // 本番環境でのみ追加のセキュリティヘッダー
    if (process.env.NODE_ENV === 'production') {
      response.headers.set('Strict-Transport-Security', SECURITY_HEADERS['Strict-Transport-Security'])
      response.headers.set('Content-Security-Policy', SECURITY_HEADERS['Content-Security-Policy'])
    }
  }

  /**
   * 認証関連Cookieの設定を更新
   */
  static updateAuthCookies(request: NextRequest, response: NextResponse): void {
    const cookieNames = Object.values(AUTH_CONFIG.cookieNames)
    
    // 並列でCookieを処理
    cookieNames.forEach(cookieName => {
      const cookieValue = request.cookies.get(cookieName)?.value
      if (cookieValue) {
        response.cookies.set(cookieName, cookieValue, COOKIE_CONFIG)
      }
    })
  }

  /**
   * CSRF トークンの生成・検証
   */
  static generateCSRFToken(): string {
    // 簡易的なCSRFトークン生成（本番環境では更に強化が必要）
    return Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64')
  }

  static validateCSRFToken(token: string, maxAge: number = 30 * 60 * 1000): boolean {
    try {
      const decoded = Buffer.from(token, 'base64').toString()
      const [timestamp] = decoded.split('-')
      const tokenTime = parseInt(timestamp, 10)
      
      return Date.now() - tokenTime < maxAge
    } catch {
      return false
    }
  }

  /**
   * セキュリティヘッダーとCookie処理の統合
   */
  static apply(request: NextRequest, response: NextResponse): void {
    // 並列処理で効率化
    Promise.all([
      Promise.resolve(this.applySecurityHeaders(response)),
      Promise.resolve(this.updateAuthCookies(request, response))
    ])
  }

  /**
   * 特定パスでのセキュリティレベル調整
   */
  static applyPathSpecificSecurity(pathname: string, response: NextResponse): void {
    // 管理者パスでは追加のセキュリティヘッダー
    if (pathname.startsWith('/admin')) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow')
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    }

    // 決済関連パスでは最高レベルのセキュリティ
    if (pathname.includes('/payment') || pathname.includes('/checkout')) {
      response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
      response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
      response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    }
  }
}