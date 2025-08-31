import { createClient } from "@core/supabase/server";
import { notFound, redirect } from "next/navigation";
import { EventEditForm } from "@/components/events/event-edit-form";
import { EditRestrictionsNotice } from "@/components/events/edit-restrictions-notice";
import { calculateAttendeeCount } from "@core/utils/event-calculations";

interface EventEditPageProps {
  params: {
    id: string;
  };
}

export default async function EventEditPage({ params }: EventEditPageProps) {
  const supabase = createClient();

  // 認証チェック
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // イベントの取得
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

  if (eventError || !event) {
    notFound();
  }

  // 編集権限チェック
  if (event.created_by !== user.id) {
    redirect(`/events/${params.id}`);
  }

  // 参加者数を計算（技術設計書のattendance_status_enumに準拠）
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
