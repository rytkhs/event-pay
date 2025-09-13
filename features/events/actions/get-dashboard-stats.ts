"use server";

import { startOfMonth, endOfMonth } from "date-fns";

import { createClient } from "@core/supabase/server";
// import { formatUtcToJst } from "@core/utils/timezone";

export interface DashboardStats {
  monthlyRevenue: number;
  monthlyEventsCount: number;
  monthlyParticipants: number;
  pendingActionsCount: number;
}

export interface RecentEvent {
  id: string;
  title: string;
  date: string;
  status: string;
  fee: number;
  attendances_count: number;
  capacity: number | null;
}

export interface DashboardData {
  stats: DashboardStats;
  recentEvents: RecentEvent[];
}

export async function getDashboardDataAction(): Promise<{
  success: boolean;
  data?: DashboardData;
  error?: string;
}> {
  try {
    const supabase = createClient();

    // 認証確認
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    // 今月の開始・終了日を取得
    const now = new Date();
    const monthStart = startOfMonth(now).toISOString();
    const monthEnd = endOfMonth(now).toISOString();

    // 並列でデータを取得
    const [eventsResult, attendancesResult, paymentsResult] = await Promise.all([
      // ユーザーのイベント一覧取得
      supabase
        .from("events")
        .select(
          `
          id,
          title,
          date,
          status,
          fee,
          capacity,
          payment_deadline,
          registration_deadline,
          created_at
        `
        )
        .eq("created_by", user.id)
        .order("created_at", { ascending: false }),

      // 今月の参加者数取得
      supabase
        .from("attendances")
        .select(
          `
          id,
          status,
          event:events!inner(created_by, date)
        `
        )
        .eq("events.created_by", user.id)
        .gte("events.date", monthStart)
        .lte("events.date", monthEnd),

      // 今月の売上取得
      supabase
        .from("payments")
        .select(
          `
          amount,
          status,
          attendance:attendances!inner(
            event:events!inner(created_by, date)
          )
        `
        )
        .eq("attendances.events.created_by", user.id)
        .gte("attendances.events.date", monthStart)
        .lte("attendances.events.date", monthEnd),
    ]);

    if (eventsResult.error) {
      return {
        success: false,
        error: "イベント情報の取得に失敗しました",
      };
    }

    const events = eventsResult.data || [];

    // 統計計算
    const monthlyEventsCount = events.filter((event) => {
      const eventDate = new Date(event.date);
      return eventDate >= new Date(monthStart) && eventDate <= new Date(monthEnd);
    }).length;

    // 今月の参加者数計算（参加確定者のみ）
    const monthlyParticipants =
      attendancesResult.data?.filter((attendance) => attendance.status === "attending").length || 0;

    // 今月の売上計算（決済完了分のみ）
    const monthlyRevenue =
      paymentsResult.data
        ?.filter((payment) => ["paid", "received", "completed"].includes(payment.status))
        .reduce((sum, payment) => sum + payment.amount, 0) || 0;

    // 未処理アクション数計算
    const pendingActionsCount = calculatePendingActions(events);

    // 最近のイベント5件（参加者数を含む）
    const recentEventsWithStats = await Promise.all(
      events.slice(0, 5).map(async (event) => {
        const { data: attendances } = await supabase
          .from("attendances")
          .select("status")
          .eq("event_id", event.id);

        const attendances_count =
          attendances?.filter((attendance) => attendance.status === "attending").length || 0;

        return {
          id: event.id,
          title: event.title,
          date: event.date,
          status: event.status,
          fee: event.fee,
          attendances_count,
          capacity: event.capacity,
        };
      })
    );

    return {
      success: true,
      data: {
        stats: {
          monthlyRevenue,
          monthlyEventsCount,
          monthlyParticipants,
          pendingActionsCount,
        },
        recentEvents: recentEventsWithStats,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: "ダッシュボード情報の取得に失敗しました",
    };
  }
}

function calculatePendingActions(
  events: Array<{
    date: string;
    payment_deadline?: string | null;
    registration_deadline?: string | null;
    capacity?: number | null;
  }>
): number {
  const now = new Date();
  let pendingCount = 0;

  events.forEach((event) => {
    // const eventDate = new Date(event.date);
    const paymentDeadline = event.payment_deadline ? new Date(event.payment_deadline) : null;
    const registrationDeadline = event.registration_deadline
      ? new Date(event.registration_deadline)
      : null;

    // 支払い締切が7日以内のイベント
    if (paymentDeadline && paymentDeadline > now) {
      const daysUntilPayment = Math.ceil(
        (paymentDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilPayment <= 7) {
        pendingCount++;
      }
    }

    // 参加者募集締切が3日以内のイベント
    if (registrationDeadline && registrationDeadline > now) {
      const daysUntilRegistration = Math.ceil(
        (registrationDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilRegistration <= 3) {
        pendingCount++;
      }
    }

    // 定員の90%以上のイベントのチェックは後で個別に処理する
    // ここでは一旦コメントアウト
  });

  return pendingCount;
}
