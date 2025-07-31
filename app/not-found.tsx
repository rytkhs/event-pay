import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * 404 Not Found ページ
 * Next.js App Routerの not-found.tsx ファイル
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="text-gray-400 mb-4">
          <FileQuestion className="h-16 w-16 mx-auto" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">ページが見つかりません</h1>

        <p className="text-gray-600 mb-6">
          お探しのページは存在しないか、移動された可能性があります。
          URLをご確認いただくか、ホームページに戻ってください。
        </p>

        <div className="space-y-3">
          <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              ホームに戻る
            </Link>
          </Button>

          <Button onClick={() => window.history.back()} variant="outline" className="w-full">
            <ArrowLeft className="h-4 w-4 mr-2" />
            前のページに戻る
          </Button>
        </div>
      </Card>
    </div>
  );
}
