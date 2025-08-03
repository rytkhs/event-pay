import { headers } from "next/headers";
import { validateInviteToken } from "@/lib/utils/invite-token";
import { InviteEventDetail } from "@/components/events/invite-event-detail";
import { InviteError } from "@/components/events/invite-error";
import { notFound } from "next/navigation";
import { sanitizeEventDescription } from "@/lib/utils/sanitize";
import { logInvalidTokenAccess } from "@/lib/security/security-logger";
import { getClientIPFromHeaders } from "@/lib/utils/ip-detection";

interface InvitePageProps {
  params: {
    token: string;
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  // リクエスト情報を取得（セキュリティログ用）
  const headersList = headers();
  const userAgent = headersList.get("user-agent") || undefined;
  const ip = getClientIPFromHeaders(headersList);

  try {
    if (!params?.token) {
      notFound();
    }

    // 招待トークンを検証
    const validationResult = await validateInviteToken(params.token);

    // 無効なトークンの場合はエラーページを表示
    if (!validationResult.isValid || !validationResult.event) {
      // 無効なトークンアクセスをログに記録
      logInvalidTokenAccess(params.token, "invite", { userAgent, ip });

      return (
        <InviteError
          errorMessage={validationResult.errorMessage || "無効な招待リンクです"}
          errorCode="INVALID_TOKEN"
          showRetry={false}
        />
      );
    }

    // 登録不可の場合はエラーページを表示
    if (!validationResult.canRegister) {
      // エラーメッセージからエラーコードを推測
      let errorCode = "UNKNOWN_ERROR";
      const errorMessage = validationResult.errorMessage || "現在参加申し込みを受け付けていません";

      if (errorMessage.includes("定員")) {
        errorCode = "CAPACITY_REACHED";
      } else if (errorMessage.includes("期限")) {
        errorCode = "REGISTRATION_DEADLINE_PASSED";
      } else if (errorMessage.includes("終了")) {
        errorCode = "EVENT_ENDED";
      } else if (errorMessage.includes("キャンセル")) {
        errorCode = "EVENT_CANCELLED";
      }

      return (
        <InviteError
          errorMessage={errorMessage}
          errorCode={errorCode}
          showRetry={false}
          eventTitle={validationResult.event?.title}
          capacity={validationResult.event?.capacity ?? undefined}
          deadline={validationResult.event?.registration_deadline ?? undefined}
        />
      );
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-6 sm:py-8">
          <div className="max-w-2xl mx-auto">
            <header className="mb-4 sm:mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
                イベント参加申し込み
              </h1>
              <p className="text-sm sm:text-base text-gray-600 text-center mt-2">
                以下のイベントに参加申し込みをしてください
              </p>
            </header>

            <main role="main">
              <InviteEventDetail event={validationResult.event} inviteToken={params.token} />
            </main>
          </div>
        </div>
      </div>
    );
  } catch (_error) {
    // 予期しないエラーは詳細なログ記録を避ける（セキュリティ上の理由）
    return (
      <InviteError
        errorMessage="招待リンクの処理中にエラーが発生しました"
        errorCode="INTERNAL_SERVER_ERROR"
        showRetry={true}
      />
    );
  }
}

// ページメタデータ生成
export async function generateMetadata({ params }: InvitePageProps) {
  try {
    if (!params?.token) {
      return {
        title: "イベント参加申し込み - EventPay",
        description: "イベントへの参加申し込み",
      };
    }

    const validationResult = await validateInviteToken(params.token);

    if (!validationResult.isValid || !validationResult.event) {
      return {
        title: "無効な招待リンク - EventPay",
        description: "招待リンクが無効または期限切れです",
      };
    }

    const event = validationResult.event;
    return {
      title: `${event.title} - 参加申し込み | EventPay`,
      description: sanitizeEventDescription(event.description || `${event.title}への参加申し込み`),
    };
  } catch {
    return {
      title: "イベント参加申し込み - EventPay",
      description: "イベントへの参加申し込み",
    };
  }
}
