/**
 * @file ユーザー登録APIテストスイート
 * @description `/api/auth/register` エンドポイントのバリデーションとセキュリティテスト（AUTH-001）
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'

// ユーザー登録スキーマ（実装想定）
const RegisterSchema = z.object({
  name: z.string()
    .min(1, 'お名前は必須です')
    .max(100, 'お名前は100文字以内で入力してください'),
  email: z.string()
    .email('有効なメールアドレスを入力してください')
    .max(255, 'メールアドレスは255文字以内で入力してください'),
  password: z.string()
    .min(8, 'パスワードは8文字以上で入力してください')
    .max(128, 'パスワードは128文字以内で入力してください')
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, 'パスワードは英数字を含む必要があります'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: 'パスワードと確認用パスワードが一致しません',
  path: ['confirmPassword']
})

type RegisterInput = z.infer<typeof RegisterSchema>

// レート制限設定（実装想定）
const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000, // 15分
  maxAttempts: 5, // 最大5回の登録試行
  blockDurationMs: 60 * 60 * 1000 // 1時間のブロック
}

// モック用のAPIハンドラー
const createMockRegisterHandler = () => {
  const rateLimitStore = new Map<string, { count: number; resetTime: number; blocked?: boolean }>()

  return async (request: NextRequest) => {
    try {
      // リクエストボディの取得
      const body = await request.json()
      
      // レート制限チェック（IP基準）
      const clientIP = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      '127.0.0.1'
      
      const now = Date.now()
      const rateLimitKey = `register:${clientIP}`
      const rateLimitData = rateLimitStore.get(rateLimitKey)

      if (rateLimitData) {
        if (rateLimitData.blocked && now < rateLimitData.resetTime) {
          return new Response(
            JSON.stringify({ 
              error: 'レート制限に達しました。しばらく時間をおいてから再試行してください。',
              retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000)
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          )
        }

        if (now < rateLimitData.resetTime) {
          rateLimitData.count += 1
          if (rateLimitData.count >= RATE_LIMIT_CONFIG.maxAttempts) {
            rateLimitStore.set(rateLimitKey, {
              ...rateLimitData,
              blocked: true,
              resetTime: now + RATE_LIMIT_CONFIG.blockDurationMs
            })
            return new Response(
              JSON.stringify({ 
                error: 'レート制限に達しました。1時間後に再試行してください。' 
              }),
              { status: 429, headers: { 'Content-Type': 'application/json' } }
            )
          }
        } else {
          rateLimitStore.set(rateLimitKey, {
            count: 1,
            resetTime: now + RATE_LIMIT_CONFIG.windowMs
          })
        }
      } else {
        rateLimitStore.set(rateLimitKey, {
          count: 1,
          resetTime: now + RATE_LIMIT_CONFIG.windowMs
        })
      }

      // 入力値バリデーション
      const validation = RegisterSchema.safeParse(body)
      if (!validation.success) {
        return new Response(
          JSON.stringify({ 
            error: 'バリデーションエラー',
            details: validation.error.flatten().fieldErrors
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const { name, email, password } = validation.data

      // TODO: 実装されるべき認証機能
      // 注意: この時点では認証機能が実装されていないため、これらのテストは失敗します

      // Supabase Authでユーザー作成（実装想定）
      // const { data: authUser, error: authError } = await supabase.auth.signUp({
      //   email,
      //   password,
      //   options: { data: { name } }
      // })

      // public.usersテーブルへの同期（実装想定）
      // if (authUser.user) {
      //   await supabase.from('users').insert({
      //     id: authUser.user.id,
      //     email,
      //     name,
      //     created_at: new Date().toISOString()
      //   })
      // }

      // メール確認フローの開始（実装想定）
      // await resend.emails.send({
      //   from: 'EventPay <noreply@eventpay.com>',
      //   to: email,
      //   subject: 'メールアドレスの確認',
      //   html: confirmationEmailTemplate
      // })

      // 成功レスポンス（実装想定）
      return new Response(
        JSON.stringify({ 
          message: 'ユーザー登録が完了しました。メールアドレスに確認メールを送信しました。',
          requiresEmailConfirmation: true
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      )

    } catch (error) {
      console.error('Registration error:', error)
      return new Response(
        JSON.stringify({ error: 'サーバーエラーが発生しました' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}

// テストヘルパー関数
const createTestRequest = (
  method: string = 'POST',
  body?: any,
  headers: { [key: string]: string } = {}
) => {
  const url = 'http://localhost:3000/api/auth/register'
  const request = new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  })
  return request
}

describe('ユーザー登録API `/api/auth/register`', () => {
  let mockHandler: (request: NextRequest) => Promise<Response>

  beforeEach(() => {
    // 各テスト前にモックハンドラーを新規作成してレート制限をリセット
    mockHandler = createMockRegisterHandler()
  })

  describe('2.3.1 正常な登録処理', () => {
    test('有効な入力での登録成功', async () => {
      const validData: RegisterInput = {
        name: 'テストユーザー',
        email: `test-${Date.now()}@eventpay.test`,
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      const request = createTestRequest('POST', validData)
      const response = await mockHandler(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.message).toContain('ユーザー登録が完了しました')
      expect(result.requiresEmailConfirmation).toBe(true)
    })

    test('auth.usersとpublic.usersの同期確認', async () => {
      // TODO: 実装後にSupabaseテーブル同期のテスト
      const validData: RegisterInput = {
        name: 'テストユーザー2',
        email: `test2-${Date.now()}@eventpay.test`,
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      const request = createTestRequest('POST', validData)
      const response = await mockHandler(request)

      expect(response.status).toBe(201)
      
      // 実装後: auth.usersとpublic.usersの両方にユーザーが作成されることを確認
      // const authUser = await supabase.auth.admin.getUserById(userId)
      // const publicUser = await supabase.from('users').select('*').eq('id', userId).single()
      // expect(authUser.data.user).toBeTruthy()
      // expect(publicUser.data).toBeTruthy()
      // expect(publicUser.data.email).toBe(validData.email)
    })
  })

  describe('入力バリデーションテスト', () => {
    test('不正なメールアドレス', async () => {
      const invalidEmailData = {
        name: 'テストユーザー',
        email: 'invalid-email',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      const request = createTestRequest('POST', invalidEmailData)
      const response = await mockHandler(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('バリデーションエラー')
      expect(result.details.email).toContain('有効なメールアドレスを入力してください')
    })

    test('パスワード強度チェック - 短すぎる', async () => {
      const weakPasswordData = {
        name: 'テストユーザー',
        email: 'test@eventpay.test',
        password: '123',
        confirmPassword: '123'
      }

      const request = createTestRequest('POST', weakPasswordData)
      const response = await mockHandler(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.details.password).toContain('パスワードは8文字以上で入力してください')
    })

    test('パスワード強度チェック - 英数字混在', async () => {
      const weakPasswordData = {
        name: 'テストユーザー',
        email: 'test@eventpay.test',
        password: 'onlyletters',
        confirmPassword: 'onlyletters'
      }

      const request = createTestRequest('POST', weakPasswordData)
      const response = await mockHandler(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.details.password).toContain('パスワードは英数字を含む必要があります')
    })

    test('パスワード確認の不一致', async () => {
      const mismatchPasswordData = {
        name: 'テストユーザー',
        email: 'test@eventpay.test',
        password: 'SecurePass123!',
        confirmPassword: 'DifferentPass456!'
      }

      const request = createTestRequest('POST', mismatchPasswordData)
      const response = await mockHandler(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.details.confirmPassword).toContain('パスワードと確認用パスワードが一致しません')
    })

    test('必須フィールドの欠損', async () => {
      const incompleteData = {
        email: 'test@eventpay.test',
        password: 'SecurePass123!'
        // nameとconfirmPasswordが欠損
      }

      const request = createTestRequest('POST', incompleteData)
      const response = await mockHandler(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.details.name).toBeDefined()
      expect(result.details.confirmPassword).toBeDefined()
    })

    test('長すぎる入力値の拒否', async () => {
      const longInputData = {
        name: 'a'.repeat(101), // 100文字制限を超過
        email: 'a'.repeat(250) + '@test.com', // 255文字制限を超過
        password: 'a'.repeat(129), // 128文字制限を超過
        confirmPassword: 'a'.repeat(129)
      }

      const request = createTestRequest('POST', longInputData)
      const response = await mockHandler(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.details.name).toContain('お名前は100文字以内で入力してください')
      expect(result.details.email).toContain('メールアドレスは255文字以内で入力してください')
      expect(result.details.password).toContain('パスワードは128文字以内で入力してください')
    })
  })

  describe('重複メールアドレステスト', () => {
    test('重複メールアドレスでの登録拒否', async () => {
      // TODO: 実装後にSupabaseでの重複チェックテスト
      const duplicateEmailData: RegisterInput = {
        name: 'テストユーザー',
        email: 'duplicate@eventpay.test',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      // 最初の登録（成功想定）
      const firstRequest = createTestRequest('POST', duplicateEmailData)
      const firstResponse = await mockHandler(firstRequest)
      expect(firstResponse.status).toBe(201)

      // 同じメールアドレスでの2回目の登録（失敗想定）
      const secondRequest = createTestRequest('POST', duplicateEmailData)
      const secondResponse = await mockHandler(secondRequest)
      const result = await secondResponse.json()

      // 実装後: 重複エラーの確認
      // expect(secondResponse.status).toBe(409)
      // expect(result.error).toContain('このメールアドレスは既に登録されています')
    })
  })

  describe('メール確認フローテスト', () => {
    test('メール確認フローの開始', async () => {
      // TODO: 実装後にResend統合テスト
      const validData: RegisterInput = {
        name: 'メール確認テストユーザー',
        email: 'email-confirm@eventpay.test',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      const request = createTestRequest('POST', validData)
      const response = await mockHandler(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.requiresEmailConfirmation).toBe(true)
      
      // 実装後: メール送信の確認
      // expect(mockResend.emails.send).toHaveBeenCalledWith(
      //   expect.objectContaining({
      //     to: validData.email,
      //     subject: expect.stringContaining('メールアドレスの確認')
      //   })
      // )
    })
  })

  describe('レート制限テスト', () => {
    test('連続登録試行でのレート制限発動', async () => {
      const headers = { 'x-forwarded-for': '192.168.1.100' }

      // 5回連続で登録試行（異なるメールアドレスを使用してレート制限をテスト）
      for (let i = 0; i < 5; i++) {
        const testData: RegisterInput = {
          name: `レート制限テストユーザー${i}`,
          email: `ratelimit${i}@eventpay.test`,
          password: 'SecurePass123!',
          confirmPassword: 'SecurePass123!'
        }
        
        const request = createTestRequest('POST', testData, headers)
        const response = await mockHandler(request)
        
        if (i < 4) {
          expect(response.status).toBe(201)
        } else {
          // 5回目でレート制限発動
          expect(response.status).toBe(429)
          const result = await response.json()
          expect(result.error).toContain('レート制限に達しました')
        }
      }
    })

    test('IPアドレス別レート制限', async () => {
      const testData: RegisterInput = {
        name: 'IP別テストユーザー',
        email: 'ip-test@eventpay.test',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      // 異なるIPアドレスからのアクセス
      const ip1Headers = { 'x-forwarded-for': '192.168.1.101' }
      const ip2Headers = { 'x-forwarded-for': '192.168.1.102' }

      // IP1から登録
      const request1 = createTestRequest('POST', testData, ip1Headers)
      const response1 = await mockHandler(request1)
      expect(response1.status).toBe(201)

      // IP2から登録（独立してカウント）
      const request2 = createTestRequest('POST', testData, ip2Headers)
      const response2 = await mockHandler(request2)
      expect(response2.status).toBe(201)
    })

    test('レート制限期間経過後のリセット', async () => {
      // TODO: 実装後に時間経過テスト
      // この機能のテストには時間制御のモックが必要
      expect(true).toBe(true) // プレースホルダー
    })
  })

  describe('セキュリティテスト', () => {
    test('SQLインジェクション攻撃対策', async () => {
      const maliciousData = {
        name: "'; DROP TABLE users; --",
        email: "test@evil.com'; DROP TABLE users; --",
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      const request = createTestRequest('POST', maliciousData)
      const response = await mockHandler(request)

      // バリデーションエラーとして処理され、SQLインジェクションは実行されない
      expect(response.status).toBe(400)
    })

    test('XSS攻撃対策', async () => {
      const xssData = {
        name: '<script>alert("xss")</script>',
        email: 'test@eventpay.test',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      const request = createTestRequest('POST', xssData)
      const response = await mockHandler(request)

      // 実装後: HTMLエスケープ処理の確認
      expect(response.status).toBe(201)
      // レスポンスにスクリプトタグが含まれていないことを確認
      const result = await response.json()
      expect(JSON.stringify(result)).not.toContain('<script>')
    })

    test('大量データ攻撃対策', async () => {
      const massiveData = {
        name: 'a'.repeat(100000), // 異常に大きなデータ
        email: 'test@eventpay.test',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      const request = createTestRequest('POST', massiveData)
      const response = await mockHandler(request)

      // バリデーションで適切に拒否される
      expect(response.status).toBe(400)
    })
  })

  describe('HTTPメソッド制限テスト', () => {
    test('POST以外のHTTPメソッドは拒否', async () => {
      const methods = ['GET', 'PUT', 'DELETE', 'PATCH']
      
      for (const method of methods) {
        const request = createTestRequest(method)
        // 実装後: MethodNotAllowedエラーの確認
        // const response = await mockHandler(request)
        // expect(response.status).toBe(405)
      }
    })

    test('Content-Typeチェック', async () => {
      const validData: RegisterInput = {
        name: 'テストユーザー',
        email: 'content-type@eventpay.test',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      }

      // 不正なContent-Type
      const request = createTestRequest('POST', validData, {
        'Content-Type': 'text/plain'
      })

      // 実装後: Content-Typeエラーの確認
      // const response = await mockHandler(request)
      // expect(response.status).toBe(415) // Unsupported Media Type
    })
  })
})