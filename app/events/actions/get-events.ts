"use server";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { Event } from "@/types/event";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

type EventWithAttendancesCount = EventRow & {
  attendances?: { count: number };
  public_profiles?: { name: string | null };
};

type GetEventsOptions = {
  limit?: number;
  offset?: number;
};

type GetEventsResult =
  | {
      success: true;
      data: Event[];
      totalCount: number;
      hasMore: boolean;
    }
  | {
      success: false;
      error: string;
    };

export async function getEventsAction(options: GetEventsOptions = {}): Promise<GetEventsResult> {
  try {
    const supabase = createClient();
    const { limit = 50, offset = 0 } = options;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("認証エラー:", authError);
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    if (!user) {
      console.warn("未認証ユーザーによるアクセス試行");
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    // 総件数を取得
    const { count: totalCount, error: countError } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("created_by", user.id);

    if (countError) {
      console.error("総件数取得エラー:", {
        error: countError,
        userId: user.id,
      });
      return {
        success: false,
        error: "イベントの取得に失敗しました",
      };
    }

    // JOINクエリで一回でデータを取得（N+1問題を解決）
    const { data: events, error: dbError } = await supabase
      .from("events")
      .select(`
        id,
        title,
        date,
        location,
        fee,
        capacity,
        status,
        created_by,
        attendances(count),
        public_profiles!inner(name)
      `)
      .eq("created_by", user.id)
      .order("date", { ascending: true })
      .range(offset, offset + limit - 1) as {
        data: EventWithAttendancesCount[] | null;
        error: any;
      };

    if (dbError) {
      console.error("イベント取得エラー:", {
        error: dbError,
        userId: user.id,
      });
      return {
        success: false,
        error: "イベントの取得に失敗しました",
      };
    }

    // データ変換（N+1問題解決済み、参加者数も正しく取得）
    const eventsData = (events || []).map(event => ({
      id: event.id,
      title: event.title,
      date: event.date,
      location: event.location || "",
      fee: event.fee,
      capacity: event.capacity || 0,
      status: event.status as Database["public"]["Enums"]["event_status_enum"],
      creator_name: event.public_profiles?.name || "不明",
      attendances_count: event.attendances?.count || 0,
    }));

    const hasMore = totalCount ? offset + limit < totalCount : false;

    return {
      success: true,
      data: eventsData,
      totalCount: totalCount || 0,
      hasMore,
    };
  } catch (error) {
    console.error("予期しないエラー:", error);
    return {
      success: false,
      error: "予期しないエラーが発生しました",
    };
  }
}