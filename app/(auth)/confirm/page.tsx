import Link from 'next/link'

interface ConfirmPageProps {
  searchParams: {
    email?: string
    error?: string
  }
}

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const { email, error } = searchParams

  // エラーがある場合の表示
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md space-y-6">
          <header className="text-center">
            <h1 className="text-2xl font-bold text-red-600">確認エラー</h1>
          </header>
          <main className="space-y-4">
            <div className="p-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200">
              {decodeURIComponent(error)}
            </div>
            <div className="text-center">
              <Link href="/register" className="text-blue-600 underline hover:text-blue-800">
                登録ページに戻る
              </Link>
            </div>
          </main>
        </div>
      </div>
    )
  }

  // 通常の確認待ちページ
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md space-y-6">
        {/* ヘッダー */}
        <header className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">メールアドレスを確認してください</h1>
        </header>

        {/* メイン情報 */}
        <main className="space-y-4">
          <div className="space-y-2">
            <p className="text-gray-700">確認メールを送信しました</p>
            {email && (
              <p className="text-sm text-gray-600">
                送信先: <span className="font-mono">{email}</span>
              </p>
            )}
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h2 className="font-medium text-blue-900 mb-2">次の手順</h2>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>受信したメールを開く</li>
              <li>メール内の確認リンクをクリック</li>
              <li>自動的にダッシュボードに移動します</li>
            </ol>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4">
              メールが届かない場合は、迷惑メールフォルダもご確認ください
            </p>

            {email && (
              <Link
                href={`/verify-otp?email=${encodeURIComponent(email)}`}
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                確認コードで認証する
              </Link>
            )}
          </div>
        </main>

        {/* フッター情報 */}
        <footer className="text-center space-y-2">
          <div className="text-xs text-gray-400">
            <Link href="/login" className="hover:text-gray-600 underline">
              ログインページに戻る
            </Link>
          </div>
        </footer>
      </div>
    </div>
  )
}
