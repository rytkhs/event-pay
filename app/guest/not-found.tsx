import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Shield, Home } from "lucide-react";
import Link from "next/link";

/**
 * ゲストページ専用の404エラーページ
 */
export default function GuestNotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="text-red-500 mb-4">
          <Shield className="h-16 w-16 mx-auto" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">アクセスできません</h1>

        <p className="text-gray-600 mb-6">
          無効なアクセスです。正しい管理URLをご確認ください。
          管理URLは参加登録完了時に送信されたメールに記載されています。
        </p>

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            管理URLを紛失された場合は、イベント主催者にお問い合わせください。
          </p>
        </div>

        <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
          <Link href="/">
            <Home className="h-4 w-4 mr-2" />
            ホームに戻る
          </Link>
        </Button>
      </Card>
    </div>
  );
}
