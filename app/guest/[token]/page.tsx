import { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { validateGuestToken } from "@/lib/utils/guest-token";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import { GuestManagementForm } from "@/components/events/guest-management-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { logInvalidTokenAccess } from "@/lib/security/security-logger";
import { getClientIP } from "@/lib/utils/ip-detection";

interface GuestPageProps {
  params: { token: string };
}

export async function generateMetadata({ params }: GuestPageProps): Promise<Metadata> {
  const { token } = params;

  // ゲストトークンを検証してイベント情報を取得
  const validation = await validateGuestToken(token);

  if (!validation.isValid || !validation.attendance) {
    return {
      title: "参加状況管理 - EventPay",
      description: "イベント参加状況の管理ページ",
    };
  }

  const eventTitle = sanitizeForEventPay(validation.attendance.event.title);

  return {
    title: `${eventTitle} - 参加状況管理 | EventPay`,
    description: `${eventTitle}の参加状況を確認・変更できます`,
    robots: "noindex, nofollow", // ゲストページは検索エンジンにインデックスされないようにする
  };
}

export default async function GuestPage({ params }: GuestPageProps) {
  const { token } = params;

  try {
    // リクエスト情報を取得（セキュリティログ用）
    const headersList = headers();
    const userAgent = headersList.get("user-agent") || undefined;
    const ip = getClientIP(headersList);

    // ゲストトークンの検証
    const validation = await validateGuestToken(token);

    // 無効なトークンの場合は404を返す
    if (!validation.isValid || !validation.attendance) {
      // 無効なゲストトークンアクセスをログに記録
      logInvalidTokenAccess(token, "guest", { userAgent, ip });
      notFound();
    }

    const { attendance, canModify } = validation;

    return (
      <div className="min-h-screen bg-gray-50">
        {/* ヘッダー */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="py-4 sm:py-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">参加状況管理</h1>
                  <p className="mt-1 text-sm text-gray-600 break-words">
                    {sanitizeForEventPay(attendance.event.title)}
                  </p>
                </div>

                {/* 招待ページに戻るリンク（オプション） */}
                <div className="flex-shrink-0">
                  <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                    <Link href="/">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      ホームに戻る
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* セキュリティ警告 */}
          <Card className="p-3 sm:p-4 mb-4 sm:mb-6 bg-yellow-50 border-yellow-200">
            <div className="flex items-start space-x-2 sm:space-x-3">
              <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm min-w-0 flex-1">
                <p className="font-medium text-yellow-800">セキュリティについて</p>
                <p className="text-yellow-700 mt-1 leading-relaxed">
                  このページのURLは他の人と共有しないでください。
                  URLを知っている人は誰でもあなたの参加状況を確認・変更できます。
                </p>
              </div>
            </div>
          </Card>

          {/* ゲスト管理フォーム */}
          <GuestManagementForm attendance={attendance} canModify={canModify} />

          {/* フッター情報 */}
          <div className="mt-6 sm:mt-8 text-center">
            <p className="text-xs text-gray-500 leading-relaxed">
              このページは参加者専用の管理ページです。
              ご質問がある場合は、イベント主催者にお問い合わせください。
            </p>
          </div>
        </div>
      </div>
    );
  } catch (_error) {
    // 予期しないエラーの場合は404を返す
    notFound();
  }
}
