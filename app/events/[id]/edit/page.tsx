import { notFound, redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { calculateAttendeeCount } from "@core/utils/event-calculations";
import { validateEventId } from "@core/validation/event-id";

import { EventEditForm } from "@features/events";
import { getDetailedAccountStatusAction } from "@features/stripe-connect";

interface EventEditPageProps {
  params: {
    id: string;
  };
}

export default async function EventEditPage({ params }: EventEditPageProps) {
  const supabase = createClient();

  // IDバリデーション（形式不正のみ404）
  const validation = validateEventId(params.id);
  if (!validation.success) {
    notFound();
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // イベントの取得（RLSで他人イベントは0件として見える）
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select(
      `
      id,
      title,
      description,
      location,
      date,
      fee,
      capacity,
      payment_methods,
      registration_deadline,
      payment_deadline,
      allow_payment_after_deadline,
      grace_period_days,
      created_at,
      updated_at,
      created_by,
      invite_token,
      canceled_at,
      attendances(id, status)
    `
    )
    .eq("id", params.id)
    .single();

  // アクセス拒否は403へ（PGRST301=RLS拒否 / PGRST116=0件）
  if (eventError?.code === "PGRST301" || eventError?.code === "PGRST116" || !event) {
    redirect(`/events/${params.id}/forbidden`);
  }

  // 編集権限チェック
  if (event.created_by !== user.id) {
    redirect(`/events/${params.id}/forbidden`);
  }

  const attendeeCount = calculateAttendeeCount(event.attendances);

  // Stripe 決済済み参加者の有無を算出
  const { data: stripePaid, error: stripePaidError } = await supabase
    .from("payments")
    .select("id, attendances!inner(event_id)")
    .eq("attendances.event_id", params.id)
    .eq("method", "stripe")
    .in("status", ["paid", "refunded"])
    .limit(1);

  // 取得エラー時はフェイルクローズ（true 扱い）
  const hasStripePaid = stripePaidError ? true : (stripePaid?.length ?? 0) > 0;
  // 算出ステータスを付与
  const computedStatus = deriveEventStatus(event.date, (event as any).canceled_at ?? null);

  // 開催済み・キャンセル済みイベントの編集禁止チェック
  if (computedStatus === "past" || computedStatus === "canceled") {
    redirect(`/events/${params.id}/forbidden?reason=${computedStatus}`);
  }

  // Stripe Connectの詳細状態を取得し、オンライン決済可否を決定
  const detailedStatus = await getDetailedAccountStatusAction();

  /**
   * オンライン決済可否の判定ロジック（編集時）
   *
   * getDetailedAccountStatusAction の仕様:
   * - アカウント未作成/認証不備がある場合: status オブジェクトを返す（CTA表示用）
   * - 全て正常で決済可能な場合: status を undefined で返す（CTA非表示）
   *
   * したがって、status === undefined が「ready」状態を意味する
   */
  const canUseOnlinePayments = detailedStatus.success && !detailedStatus.status;

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* ページヘッダー */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground">イベント編集</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              イベント「{event.title}」の設定を編集します
            </p>
          </div>

          {/* V2ではhasStripePaid時のみ制限が発生（fee/payment_methods）。旧Noticeは非表示にする */}

          {/* 編集フォーム */}
          <EventEditForm
            event={{ ...(event as any), status: computedStatus }}
            attendeeCount={attendeeCount}
            hasStripePaid={hasStripePaid}
            canUseOnlinePayments={canUseOnlinePayments}
          />
        </div>
      </div>
    </div>
  );
}

export function generateMetadata() {
  return {
    title: "イベント編集 - みんなの集金",
    description: "イベント情報の編集画面",
  };
}
