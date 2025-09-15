import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { logInvalidTokenAccess } from "@core/security/security-logger";
import { validateInviteToken } from "@core/utils/invite-token";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { sanitizeEventDescription } from "@core/utils/sanitize";

import { InviteEventDetail } from "@features/invite";

import { ErrorLayout } from "@/components/errors";

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
        <ErrorLayout
          code="INVALID_INVITE"
          category="business"
          severity="medium"
          title="無効な招待リンク"
          message={validationResult.errorMessage || "この招待リンクは無効または期限切れです"}
          description="正しい招待リンクをご確認いただくか、イベント主催者にお問い合わせください。"
          showRetry={false}
          showHome={true}
          enableLogging={false}
        />
      );
    }

    // 登録不可の場合はエラーページを表示
    if (!validationResult.canRegister) {
      const errorMessage = validationResult.errorMessage || "現在参加申し込みを受け付けていません";
      const errorCode = validationResult.errorCode || "UNKNOWN_ERROR";

      // エラーコードに応じたエラーレイアウト
      const getErrorConfig = () => {
        switch (errorCode) {
          case "EVENT_ENDED":
            return {
              title: "イベント終了",
              icon: "business" as const,
              description: "既に終了したイベントには参加申し込みできません。",
            };
          case "EVENT_CANCELED":
            return {
              title: "定員到達",
              icon: "business" as const,
              description: `定員: ${validationResult.event?.capacity}\u540d\nキャンセルが出た場合は参加可能になることがあります。`,
            };
          case "REGISTRATION_DEADLINE_PASSED":
            return {
              title: "申込期限終了",
              icon: "business" as const,
              description: validationResult.event?.registration_deadline
                ? `申込期限: ${new Date(validationResult.event.registration_deadline).toLocaleString("ja-JP")}`
                : "申込期限を過ぎたため、参加申し込みはできません。",
            };
          default:
            return {
              title: "参加申し込み不可",
              icon: "business" as const,
              description: "現在参加申し込みを受け付けていません。",
            };
        }
      };

      const config = getErrorConfig();

      return (
        <ErrorLayout
          code="409"
          category={config.icon}
          severity="medium"
          title={config.title}
          message={
            validationResult.event?.title
              ? `「${validationResult.event.title}」${errorMessage}`
              : errorMessage
          }
          description={config.description}
          showRetry={false}
          showHome={true}
          enableLogging={false}
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
      <ErrorLayout
        code="500"
        category="server"
        severity="high"
        title="サーバーエラー"
        message="招待リンクの処理中にエラーが発生しました"
        description="しばらく時間をおいて再度お試しください。問題が続く場合はサポートにお問い合わせください。"
        showRetry={true}
        showHome={true}
        showSupport={true}
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
