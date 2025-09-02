'use client'

import { useState, useEffect, Suspense } from 'react'

import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'

import { resendOtpAction } from '../actions'

function VerifyEmailContent() {
  const [resendLoading, setResendLoading] = useState(false)
  const [resendDisabled, setResendDisabled] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email')

  // カウントダウンタイマー
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (resendDisabled && countdown === 0) {
      setResendDisabled(false)
    }
  }, [countdown, resendDisabled])

  // メールアドレスがない場合はリダイレクト
  useEffect(() => {
    if (!email) {
      router.push('/login')
    }
  }, [email, router])

  const handleResend = async () => {
    if (!email || resendDisabled) {
      return
    }

    setResendLoading(true)
    setError(null)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('email', email)

      const result = await resendOtpAction(formData)

      if (result.error) {
        setError(result.error)
      } else {
        setMessage('確認メールを再送信しました')
        setResendDisabled(true)
        setCountdown(60)
      }
    } catch {
      setError('再送信に失敗しました。')
    } finally {
      setResendLoading(false)
    }
  }

  const getEmailProvider = (email: string) => {
    const domain = email.split('@')[1]?.toLowerCase()

    const providers = {
      'gmail.com': { name: 'Gmail', url: 'https://mail.google.com' },
      'yahoo.co.jp': { name: 'Yahoo!メール', url: 'https://mail.yahoo.co.jp' },
      'hotmail.com': { name: 'Outlook', url: 'https://outlook.live.com' },
      'outlook.com': { name: 'Outlook', url: 'https://outlook.live.com' },
      'icloud.com': { name: 'iCloud Mail', url: 'https://www.icloud.com/mail' },
      'docomo.ne.jp': { name: 'ドコモメール', url: 'https://mail.docomo.ne.jp' },
      'ezweb.ne.jp': { name: 'au メール', url: 'https://webmail.ezweb.ne.jp' },
      'softbank.ne.jp': { name: 'SoftBank メール', url: 'https://mail.softbank.jp' },
    }

    return providers[domain as keyof typeof providers]
  }

  if (!email) {
    return null // リダイレクト中
  }

  const emailProvider = getEmailProvider(email)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md space-y-6">
        {/* ヘッダー */}
        <header className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">メールをご確認ください</h1>
          <p className="text-gray-600 text-sm">
            <span className="font-mono text-sm">{email}</span> に確認メールを送信しました
          </p>
        </header>

        {/* メイン内容 */}
        <main className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="font-semibold text-blue-900 mb-2">次の手順</h2>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>メールボックスを確認してください</li>
              <li>EventPayからの確認メールを開いてください</li>
              <li>メール内の6桁の確認コードをコピーしてください</li>
              <li>
                <Link
                  href={`/verify-otp?email=${encodeURIComponent(email)}`}
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  確認コード入力ページ
                </Link>
                でコードを入力してください
              </li>
            </ol>
          </div>

          {/* メールプロバイダーへのリンク */}
          {emailProvider && (
            <div className="text-center">
              <a
                href={emailProvider.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                {emailProvider.name}を開く
              </a>
            </div>
          )}

          {/* メッセージ表示 */}
          {message && (
            <div className="p-3 rounded-md text-sm bg-green-50 text-green-800 border border-green-200">
              {message}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200">
              {error}
            </div>
          )}

          {/* 再送信セクション */}
          <div className="border-t pt-6">
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-600">メールが届かない場合は？</p>

              <div className="text-xs text-gray-500 space-y-1">
                <p>• 迷惑メールフォルダをご確認ください</p>
                <p>• メールアドレスに誤りがないかご確認ください</p>
                <p>• 数分経ってから再度お試しください</p>
              </div>

              <button
                onClick={handleResend}
                disabled={resendDisabled || resendLoading}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  resendDisabled || resendLoading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {resendLoading
                  ? '送信中...'
                  : resendDisabled
                    ? `再送信まで ${countdown}秒`
                    : '確認メールを再送信'}
              </button>
            </div>
          </div>
        </main>

        {/* フッター */}
        <footer className="text-center pt-6 border-t">
          <div className="text-xs text-gray-400 space-y-2">
            <div>
              <Link
                href={`/verify-otp?email=${encodeURIComponent(email)}`}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                確認コードをお持ちの場合はこちら
              </Link>
            </div>
            <div>
              <Link href="/login" className="text-gray-600 hover:text-gray-800 underline">
                ログインページに戻る
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
              <p className="text-gray-600">読み込み中...</p>
            </div>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
