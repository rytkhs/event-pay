import { createClient } from "@core/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  // 認証状態チェック
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // 認証済みユーザーはダッシュボードにリダイレクト
  if (user && !error) {
    redirect("/home");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="flex flex-col justify-center items-center min-h-screen px-4">
        <div className="max-w-md w-full space-y-8 text-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">EventPay</h1>
            <p className="text-xl text-gray-600 mb-8">
              小規模コミュニティ向け
              <br />
              イベント出欠管理・集金ツール
            </p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-lg border">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">はじめよう</h2>

            <div className="space-y-4">
              <Link
                href="/login"
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                ログイン
              </Link>

              <Link
                href="/register"
                className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                新規登録
              </Link>
            </div>

            <div className="mt-6 text-sm text-gray-500">
              <p>アカウントを作成してイベント管理を始めましょう</p>
            </div>
          </div>

          <div className="text-center text-sm text-gray-500">
            <p>© 2024 EventPay - 会計担当者の負担を80%削減</p>
          </div>
        </div>
      </div>
    </div>
  );
}
