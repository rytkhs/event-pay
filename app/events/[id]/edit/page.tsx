import { notFound, redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";
import { calculateAttendeeCount } from "@core/utils/event-calculations";
import { validateEventId } from "@core/validation/event-id";

import { EditRestrictionsNotice, EventEditForm } from "@features/events";

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
      *,
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
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* ページヘッダー */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">イベント編集</h1>
            <p className="mt-2 text-sm text-gray-600">
              イベント「{event.title}」の設定を編集します
            </p>
          </div>

          {/* 編集制限の通知 */}
          <EditRestrictionsNotice hasAttendees={attendeeCount > 0} attendeeCount={attendeeCount} />

          {/* 編集フォーム */}
          <EventEditForm event={event} attendeeCount={attendeeCount} />
        </div>
      </div>
    </div>
  );
}

export function generateMetadata() {
  return {
    title: "イベント編集 - EventPay",
    description: "イベント情報の編集画面",
  };
}
