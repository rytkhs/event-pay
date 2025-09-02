import { redirect } from 'next/navigation'

import { createClient } from '@core/supabase/server'
import { formatUtcToJst } from '@core/utils/timezone'

import { logoutAction } from '@/app/(auth)/actions'

async function handleLogout() {
  'use server'
  const result = await logoutAction()
  if (result.success && result.redirectUrl) {
    redirect(result.redirectUrl)
  }
}

export default async function DashboardPage() {
  // 認証状態チェック
  const supabase = createClient()

  // デバッグ情報を追加
  if (process.env.NODE_ENV === 'development') {
    // console.info("Dashboard: Checking authentication...");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // デバッグ情報を追加
  if (process.env.NODE_ENV === 'development') {
    // console.info("Dashboard: Auth check result:", {
    //   hasUser: !!user,
    //   userId: user?.id || "none",
    //   userEmail: user?.email || "none",
    //   error: error?.message || "none",
    //   timestamp: new Date().toISOString(),
    // });
  }

  if (error || !user) {
    if (process.env.NODE_ENV === 'development') {
      // console.warn("Dashboard: Redirecting to login due to auth failure");
    }
    redirect('/login?redirectTo=/home')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">EventPay ダッシュボード</h1>
            </div>
            <div className="flex items-center space-x-4" data-testid="user-menu">
              <span className="text-sm text-gray-700">ようこそ、{user.email}さん</span>
              <form action={handleLogout}>
                <button
                  type="submit"
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  ログアウト
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg h-96">
            <div className="flex flex-col items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">🎉 ログイン成功！</h2>
                <p className="text-lg text-gray-600 mb-8">EventPay ダッシュボードへようこそ</p>

                <div className="bg-white p-6 rounded-lg shadow border max-w-md">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">ユーザー情報</h3>
                  <div className="space-y-2 text-left">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">ユーザーID:</span>
                      <span className="text-sm font-mono text-gray-900">{user.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">メールアドレス:</span>
                      <span className="text-sm text-gray-900">{user.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">登録日時:</span>
                      <span className="text-sm text-gray-900">
                        {formatUtcToJst(user.created_at, 'yyyy/MM/dd HH:mm')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">メール確認:</span>
                      <span
                        className={`text-sm ${user.email_confirmed_at ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {user.email_confirmed_at ? '確認済み' : '未確認'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 text-sm text-gray-500">
                  <p>認証機能の実環境テストが完了しました。</p>
                  <p>イベント管理機能は今後実装予定です。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
