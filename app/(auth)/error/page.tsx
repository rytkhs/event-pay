import Link from 'next/link'

interface ErrorPageProps {
  searchParams: {
    message?: string
  }
}

export default function AuthErrorPage({ searchParams }: ErrorPageProps) {
  const { message } = searchParams

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md space-y-6">
        <header className="text-center">
          <h1 className="text-2xl font-bold text-red-600">認証エラー</h1>
        </header>

        <main className="space-y-4">
          <div className="p-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200">
            {message ? decodeURIComponent(message) : '認証に失敗しました。'}
          </div>

          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">以下の方法をお試しください：</p>
            <ul className="text-sm text-gray-500 list-disc list-inside space-y-1">
              <li>再度ログインを試す</li>
              <li>新しい確認メールを送信する</li>
              <li>時間をおいてから再度お試しください</li>
            </ul>
          </div>

          <div className="text-center space-y-3">
            <Link
              href="/login"
              className="inline-block w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              ログインページに戻る
            </Link>
            <Link
              href="/register"
              className="inline-block text-blue-600 underline hover:text-blue-800"
            >
              アカウント登録
            </Link>
          </div>
        </main>
      </div>
    </div>
  )
}
