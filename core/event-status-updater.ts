// イベントステータス自動更新ロジック

import { EventStatus, EVENT_STATUS } from "@core/types/enums";
import { EVENT_CONFIG, TIME_CONSTANTS } from "@core/constants/event-config";

interface Event {
  id: string;
  status: EventStatus;
  date: string; // Supabaseから取得されるデータは文字列
}

interface StatusUpdateResult {
  shouldUpdate: boolean;
  newStatus: EventStatus;
  reason: string;
}

interface BatchUpdateResult {
  updatesCount: number;
  updates: Array<{
    id: string;
    oldStatus: EventStatus;
    newStatus: EventStatus;
    reason: string;
  }>;
  skipped: Array<{
    id: string;
    status: EventStatus;
    reason: string;
  }>;
}

/**
 * 単一イベントのステータス更新要否を判定
 */
function shouldUpdateEventStatus(event: Event, currentTime: Date): StatusUpdateResult {
  const { status, date } = event;

  // キャンセル済みイベントは更新しない
  if (status === EVENT_STATUS.CANCELLED) {
    return {
      shouldUpdate: false,
      newStatus: status,
      reason: "Cancelled events are not updated",
    };
  }

  // 終了済みイベントは更新しない
  if (status === EVENT_STATUS.PAST) {
    return {
      shouldUpdate: false,
      newStatus: status,
      reason: "Event is already in final state",
    };
  }

  const eventStartTime = new Date(date);
  const timeDiffMs = currentTime.getTime() - eventStartTime.getTime();
  const timeDiffHours = timeDiffMs / TIME_CONSTANTS.MS_TO_HOURS;

  // upcoming → ongoing: イベント開始時刻を過ぎた場合
  if (status === EVENT_STATUS.UPCOMING && timeDiffMs > 0) {
    return {
      shouldUpdate: true,
      newStatus: EVENT_STATUS.ONGOING,
      reason: "Event has started",
    };
  }

  // ongoing → past: イベント開始から設定時間経過した場合
  if (status === EVENT_STATUS.ONGOING && timeDiffHours >= EVENT_CONFIG.AUTO_END_HOURS) {
    return {
      shouldUpdate: true,
      newStatus: EVENT_STATUS.PAST,
      reason: `Event ended (${EVENT_CONFIG.AUTO_END_HOURS} hours passed)`,
    };
  }

  // 更新不要の場合
  if (status === EVENT_STATUS.UPCOMING) {
    return {
      shouldUpdate: false,
      newStatus: status,
      reason: "Event has not started yet",
    };
  }

  if (status === EVENT_STATUS.ONGOING) {
    return {
      shouldUpdate: false,
      newStatus: status,
      reason: `Event is still ongoing (less than ${EVENT_CONFIG.AUTO_END_HOURS} hours)`,
    };
  }

  // デフォルト（到達しないはず）
  return {
    shouldUpdate: false,
    newStatus: status,
    reason: "No update criteria matched",
  };
}

/**
 * 複数イベントの一括ステータス更新処理
 */
export function updateEventStatus(events: Event[], currentTime: Date): BatchUpdateResult {
  const updates: BatchUpdateResult["updates"] = [];
  const skipped: BatchUpdateResult["skipped"] = [];

  for (const event of events) {
    const result = shouldUpdateEventStatus(event, currentTime);

    if (result.shouldUpdate) {
      updates.push({
        id: event.id,
        oldStatus: event.status,
        newStatus: result.newStatus,
        reason: result.reason,
      });
    } else {
      skipped.push({
        id: event.id,
        status: event.status,
        reason: result.reason,
      });
    }
  }

  return {
    updatesCount: updates.length,
    updates,
    skipped,
  };
}

/**
 * 現在時刻を取得（テスト用にモック可能）
 */
export function getCurrentTime(): Date {
  return new Date();
}
