"use server";

import { revalidatePath } from "next/cache";

import { Client } from "@upstash/qstash";

import { verifyEventAccess } from "@core/auth/event-authorization";
import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";

type CancelEventInput = {
  eventId: string;
  message?: string;
};

function getQstashClient() {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    throw new Error("QSTASH_TOKEN environment variable is required");
  }
  return new Client({ token });
}

export async function cancelEventAction(
  params: CancelEventInput
): Promise<ServerActionResult<{ status: "canceled" }>> {
  try {
    if (!params?.eventId || typeof params.eventId !== "string") {
      return createServerActionError("EVENT_INVALID_ID", "無効なイベントID形式です");
    }

    // 認証・権限（作成者のみ）
    const { eventId, user } = await verifyEventAccess(params.eventId);

    const supabase = createClient();

    // イベントを中止状態に更新（invite_token を NULL 化）
    const { data: updatedRows, error: updateError } = await supabase
      .from("events")
      .update({ status: "canceled", invite_token: null })
      .eq("id", eventId)
      .eq("created_by", user.id)
      .neq("status", "canceled")
      .select("id");

    if (updateError) {
      return createServerActionError("EVENT_CANCEL_FAILED", "イベントの中止に失敗しました");
    }

    // キャッシュ無効化
    revalidatePath("/events");
    revalidatePath(`/events/${eventId}`);

    // QStash にキャンセル通知ジョブを投入（ベストエフォート）
    try {
      // 更新が発生していない（既に canceled）場合は通知をスキップ
      if (!updatedRows || updatedRows.length === 0) {
        return createServerActionSuccess({ status: "canceled" as const }, "イベントを中止しました");
      }
      const workerUrl = `${process.env.APP_BASE_URL || process.env.NEXTAUTH_URL}/api/workers/event-cancel`;
      const body = { eventId, message: params.message };

      const qstash = getQstashClient();
      const publishRes = await qstash.publishJSON({
        url: workerUrl,
        body,
        // 同一イベント中止の重複配送を抑制（簡易）
        deduplicationId: `event-cancel-${eventId}`,
        retries: 3,
        delay: 0,
        headers: {
          "x-source": "event-cancel-action",
        },
      });

      logger.info("Cancel event published to QStash", {
        tag: "event-cancel",
        event_id: eventId,
        qstash_message_id: publishRes.messageId,
      });
    } catch (e) {
      // 通知失敗は中止結果に影響させない（非機能要件）
      logger.warn("Failed to publish cancel event to QStash", {
        tag: "event-cancel",
        event_id: eventId,
        error_message: e instanceof Error ? e.message : String(e),
      });
    }

    return createServerActionSuccess({ status: "canceled" as const }, "イベントを中止しました");
  } catch (_error) {
    return createServerActionError("INTERNAL_ERROR", "予期しないエラーが発生しました", {
      retryable: true,
    });
  }
}
