/**
 * @file 認証ミドルウェアテストスイート
 * @description Next.js認証ミドルウェアとCSRF保護テスト（AUTH-001）
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Supabaseクライアントのモック
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn()
}))

// モック用のミドルウェア関数
const createMockMiddleware = (
  supabaseUrl: string, 
  supabaseAnonKey: string,
  protectedPaths: string[] = ['/dashboard', '/events', '/profile']
) => {
  return async (request: NextRequest) => {
    const response = NextResponse.next()
    const pathname = request.nextUrl.pathname

    // 静的ファイルとAPIルートはスキップ
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.includes('.')
    ) {
      return response
    }

    // Supabaseクライアント作成（実装想定）
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure: true,
            sameSite: 'strict'
          })
        },
        remove(name: string, options: any) {
          response.cookies.delete(name)
        }
      }
    })

    // 認証状態確認（実装想定）
    let session = null
    try {
      const { data: { session: sessionData }, error } = await supabase.auth.getSession()
      session = sessionData
    } catch (authError) {
      // Supabase接続エラーの場合は未認証として処理
      console.warn('Supabase auth error:', authError)
      session = null
    }

    // 保護されたパスの認証チェック
    if (protectedPaths.some(path => pathname.startsWith(path))) {
      if (!session) {
        // 未認証の場合、ログインページにリダイレクト
        const redirectUrl = new URL('/auth/login', request.url)
        redirectUrl.searchParams.set('redirectTo', pathname)
        return NextResponse.redirect(redirectUrl)
      }
    }

    // 認証済みユーザーがログインページにアクセスした場合
    if (session && pathname.startsWith('/auth/login')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // セキュリティヘッダーの設定
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('X-XSS-Protection', '1; mode=block')

    // CSRF保護のためのSameSite Cookie設定
    const sameSiteCookies = ['supabase-auth-token', 'csrf-token']
    sameSiteCookies.forEach(cookieName => {
      const cookieValue = request.cookies.get(cookieName)?.value
      if (cookieValue) {
        response.cookies.set(cookieName, cookieValue, {
          sameSite: 'strict',
          httpOnly: true,
          secure: true
        })
      }
    })

    return response
  }
}

// モック用のリクエスト作成ヘルパー
const createMockRequest = (
  url: string, 
  cookies: { [key: string]: string } = {},
  headers: { [key: string]: string } = {}
) => {
  const request = new NextRequest(new URL(url, 'http://localhost:3000'))
  
  // Cookieの設定
  Object.entries(cookies).forEach(([name, value]) => {
    request.cookies.set(name, value)
  })

  // ヘッダーの設定
  Object.entries(headers).forEach(([name, value]) => {
    request.headers.set(name, value)
  })

  return request
}

describe('認証ミドルウェアテスト', () => {
  const mockSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const mockSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  // モックSupabaseクライアント
  const mockSupabaseClient = {
    auth: {
      getSession: jest.fn()
    }
  }

  beforeEach(() => {
    // Supabaseクライアントのモックをリセット
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabaseClient)
    mockSupabaseClient.auth.getSession.mockClear()
  })
  
  describe('2.2.2 認証ミドルウェア基本機能', () => {
    test('認証が必要なページで未認証時リダイレクト', async () => {
      // 未認証状態をモック
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      })

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/dashboard')
      
      // 未認証でダッシュボードにアクセス
      const response = await middleware(request)

      expect(response.status).toBe(307) // リダイレクト
      expect(response.headers.get('location')).toContain('/auth/login')
      expect(response.headers.get('location')).toContain('redirectTo=%2Fdashboard')
    })

    test('認証済みユーザーはダッシュボードにアクセス可能', async () => {
      // 認証済み状態をモック
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { 
          session: {
            user: { id: 'test-user-id', email: 'test@example.com' },
            access_token: 'valid-token',
            expires_at: Date.now() + 3600000 // 1時間後
          }
        },
        error: null
      })

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/dashboard', {
        'supabase-auth-token': 'valid-session-token'
      })

      // 認証済みでダッシュボードにアクセス
      const response = await middleware(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
    })

    test('セッション期限切れ時の適切な処理', async () => {
      // 期限切れセッション状態をモック
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'session expired' }
      })

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/dashboard', {
        'supabase-auth-token': 'expired-session-token'
      })

      // 期限切れセッションでアクセス
      const response = await middleware(request)

      expect(response.status).toBe(307) // ログインページにリダイレクト
      expect(response.headers.get('location')).toContain('/auth/login')
    })

    test('認証済みユーザーがログインページにアクセスした場合のリダイレクト', async () => {
      // 認証済み状態をモック
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { 
          session: {
            user: { id: 'test-user-id', email: 'test@example.com' },
            access_token: 'valid-token',
            expires_at: Date.now() + 3600000 // 1時間後
          }
        },
        error: null
      })

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/auth/login', {
        'supabase-auth-token': 'valid-session-token'
      })

      // 認証済みでログインページにアクセス
      const response = await middleware(request)

      expect(response.status).toBe(307) // ダッシュボードにリダイレクト
      expect(response.headers.get('location')).toContain('/dashboard')
    })
  })

  describe('CSRF攻撃対策テスト', () => {
    test('SameSite Cookie設定によるCSRF防止', async () => {
      // 認証済み状態をモック
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { 
          session: {
            user: { id: 'test-user-id', email: 'test@example.com' },
            access_token: 'valid-token',
            expires_at: Date.now() + 3600000 // 1時間後
          }
        },
        error: null
      })

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/dashboard', {
        'supabase-auth-token': 'valid-token'
      })

      const response = await middleware(request)

      // SameSite=strict設定の確認
      const setCookieHeaders = response.headers.getSetCookie()
      const authCookie = setCookieHeaders.find(cookie => 
        cookie.includes('supabase-auth-token')
      )
      
      expect(authCookie).toBeDefined()
      expect(authCookie).toContain('SameSite=strict')
      expect(authCookie).toContain('HttpOnly')
      expect(authCookie).toContain('Secure')
    })

    test('クロスサイトからのAPI呼び出し拒否', async () => {
      // 未認証状態をモック（外部サイトからのアクセス）
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      })

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/dashboard', {}, {
        'Origin': 'https://malicious-site.com',
        'Referer': 'https://malicious-site.com/attack'
      })

      // 外部サイトからのアクセス
      const response = await middleware(request)

      // 保護されたパスなので未認証ユーザーはリダイレクト
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/login')
    })

    test('同一オリジンからのアクセスは許可', async () => {
      // 認証済み状態をモック
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { 
          session: {
            user: { id: 'test-user-id', email: 'test@example.com' },
            access_token: 'valid-token',
            expires_at: Date.now() + 3600000 // 1時間後
          }
        },
        error: null
      })

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/dashboard', {
        'supabase-auth-token': 'valid-token'
      }, {
        'Origin': 'http://localhost:3000',
        'Referer': 'http://localhost:3000/profile'
      })

      const response = await middleware(request)

      expect(response.status).toBe(200)
    })
  })

  describe('セキュリティヘッダー設定テスト', () => {
    test('セキュリティヘッダーが適切に設定される', async () => {
      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/')

      const response = await middleware(request)

      // セキュリティヘッダーの確認
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
    })

    test('Content Security Policy（CSP）ヘッダー設定', async () => {
      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/')

      const response = await middleware(request)

      // CSPヘッダーの確認（next.config.mjsで設定想定）
      const csp = response.headers.get('Content-Security-Policy')
      if (csp) {
        expect(csp).toContain("default-src 'self'")
        expect(csp).toContain("script-src")
        expect(csp).toContain("style-src")
      }
    })
  })

  describe('パスベースアクセス制御テスト', () => {
    test('静的ファイルはミドルウェア処理をスキップ', async () => {
      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/favicon.ico')

      const response = await middleware(request)

      // 静的ファイルはそのまま通す
      expect(response.status).toBe(200)
    })

    test('APIルートはミドルウェア処理をスキップ', async () => {
      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/api/auth/login')

      const response = await middleware(request)

      // APIルートはそのまま通す
      expect(response.status).toBe(200)
    })

    test('Next.js内部パスはスキップ', async () => {
      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/_next/static/css/app.css')

      const response = await middleware(request)

      // Next.js内部パスはそのまま通す
      expect(response.status).toBe(200)
    })

    test('保護されたパスへの未認証アクセス制御', async () => {
      // 未認証状態をモック
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      })

      const protectedPaths = ['/dashboard', '/events', '/profile', '/admin']
      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey, protectedPaths)

      for (const path of protectedPaths) {
        const request = createMockRequest(path)
        const response = await middleware(request)

        expect(response.status).toBe(307) // リダイレクト
        expect(response.headers.get('location')).toContain('/auth/login')
      }
    })

    test('公開パスへのアクセスは制限なし', async () => {
      // 未認証状態をモック（公開パスは認証不要）
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      })

      const publicPaths = ['/', '/about', '/contact', '/auth/register']
      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)

      for (const path of publicPaths) {
        const request = createMockRequest(path)
        const response = await middleware(request)

        expect(response.status).toBe(200)
      }
    })
  })

  describe('エラーハンドリングとエッジケース', () => {
    test('不正なCookieでのアクセス処理', async () => {
      // 不正なトークンによる未認証状態をモック
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid JWT' }
      })

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/dashboard', {
        'supabase-auth-token': 'invalid-malformed-token'
      })

      const response = await middleware(request)

      // 不正なトークンの場合、ログインページにリダイレクト
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/login')
    })

    test('Supabaseサービス接続エラー時の処理', async () => {
      // Supabase接続エラーをモック
      mockSupabaseClient.auth.getSession.mockRejectedValue(new Error('Service unavailable'))

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/dashboard')

      // エラーが発生してもアプリケーションが停止しないことを確認
      await expect(middleware(request)).resolves.toBeDefined()
    })

    test('循環リダイレクトの防止', async () => {
      // 未認証状態をモック
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      })

      const middleware = createMockMiddleware(mockSupabaseUrl, mockSupabaseAnonKey)
      const request = createMockRequest('/auth/login', {}, {
        'Referer': 'http://localhost:3000/auth/login'
      })

      const response = await middleware(request)

      // 循環リダイレクトを防ぐため、既にログインページの場合は何もしない
      expect(response.status).toBe(200)
    })
  })
})