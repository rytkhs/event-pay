import { validateInviteToken } from "@/lib/utils/invite-token";
import { InviteEventDetail } from "@/components/events/invite-event-detail";
import { InviteError } from "@/components/events/invite-error";
import { notFound } from "next/navigation";
import { sanitizeEventDescription } from "@/lib/utils/sanitize";

interface InvitePageProps {
  params: {
    token: string;
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  try {
    if (!params?.token) {
      notFound();
    }

    // 招待トークンを検証
    const validationResult = await validateInviteToken(params.token);

    // 無効なトークンの場合はエラーページを表示
    if (!validationResult.isValid || !validationResult.event) {
      return (
        <InviteError
          errorMessage={validationResult.errorMessage || "無効な招待リンクです"}
          showRetry={false}
        />
      );
    }

    // 登録不可の場合はエラーページを表示
    if (!validationResult.canRegister) {
      return (
        <InviteError
          errorMessage={validationResult.errorMessage || "現在参加申し込みを受け付けていません"}
          showRetry={false}
        />
      );
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 text-center">イベント参加申し込み</h1>
            <p className="text-gray-600 text-center mt-2">
              以下のイベントに参加申し込みをしてください
            </p>
          </div>

          <InviteEventDetail event={validationResult.event} inviteToken={params.token} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("招待ページエラー:", error);
    return <InviteError errorMessage="招待リンクの処理中にエラーが発生しました" showRetry={true} />;
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
