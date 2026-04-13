import { revalidatePath } from "next/cache";

import {
  type ActionResult,
  fail,
  ok,
  toActionResultFromAppResult,
  zodFail,
} from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { hasPostgrestCode } from "@core/supabase/postgrest-error-guards";
import { buildGuestUrl } from "@core/utils/guest-token";
import {
  AdminUpdateAttendanceStatusInputSchema,
  type AdminUpdateAttendanceConfirmation,
  type AdminUpdateAttendanceStatusResult,
} from "@core/validation/participant-management";

import { getOwnedEventActionContextForServerAction } from "../services/get-owned-event-context-for-community";

type RpcAdminUpdateAttendanceStatusResult = {
  updated?: boolean;
  attendance_id?: string;
  old_status?: AdminUpdateAttendanceStatusResult["oldStatus"];
  new_status?: AdminUpdateAttendanceStatusResult["newStatus"];
  payment_effect?: AdminUpdateAttendanceStatusResult["paymentEffect"];
  payment_id?: string | null;
  payment_method?: AdminUpdateAttendanceStatusResult["paymentMethod"];
  payment_status?: AdminUpdateAttendanceStatusResult["paymentStatus"];
  guest_token?: string | null;
};

function parseCapacityConflict(error: { message?: string; details?: string | null }) {
  const target = `${error.message ?? ""} ${error.details ?? ""}`;
  const currentMatch = target.match(/Current(?: attendees)?:\s*(\d+)/i);
  const capacityMatch = target.match(/Capacity:\s*(\d+)/i) ?? target.match(/capacity \((\d+)\)/i);

  return {
    current: currentMatch ? Number.parseInt(currentMatch[1], 10) : null,
    capacity: capacityMatch ? Number.parseInt(capacityMatch[1], 10) : null,
  };
}

function mapRpcResult(
  data: RpcAdminUpdateAttendanceStatusResult
): AdminUpdateAttendanceStatusResult {
  const guestToken = data.guest_token ?? null;
  return {
    updated: data.updated ?? false,
    attendanceId: data.attendance_id ?? "",
    oldStatus: data.old_status ?? "maybe",
    newStatus: data.new_status ?? "maybe",
    paymentEffect: data.payment_effect ?? "none",
    paymentId: data.payment_id ?? null,
    paymentMethod: data.payment_method ?? null,
    paymentStatus: data.payment_status ?? null,
    guestUrl: guestToken ? buildGuestUrl(guestToken) : undefined,
  };
}

export async function adminUpdateAttendanceStatusAction(
  input: unknown
): Promise<ActionResult<AdminUpdateAttendanceStatusResult | AdminUpdateAttendanceConfirmation>> {
  const parsed = AdminUpdateAttendanceStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    return zodFail(parsed.error, { userMessage: "入力データが無効です。" });
  }

  try {
    const {
      eventId,
      attendanceId,
      status,
      paymentMethod,
      bypassCapacity,
      acknowledgedFinalizedPayment,
      acknowledgedPastEvent,
      notes,
    } = parsed.data;

    const supabase = await createServerActionSupabaseClient();
    const accessResult = await getOwnedEventActionContextForServerAction(supabase, eventId);
    if (!accessResult.success) {
      return toActionResultFromAppResult(accessResult);
    }

    const accessContext = accessResult.data;
    if (!accessContext) {
      return fail("INTERNAL_ERROR", { userMessage: "イベント情報の取得に失敗しました。" });
    }

    const { data, error } = await supabase.rpc("rpc_admin_update_attendance_status", {
      p_event_id: accessContext.id,
      p_attendance_id: attendanceId,
      p_new_status: status,
      p_user_id: accessContext.user.id,
      p_payment_method: paymentMethod ?? undefined,
      p_bypass_capacity: bypassCapacity,
      p_acknowledged_finalized_payment: acknowledgedFinalizedPayment,
      p_acknowledged_past_event: acknowledgedPastEvent,
      p_notes: notes ?? undefined,
    });

    if (error) {
      if (hasPostgrestCode(error, "P0004")) {
        return ok({
          confirmRequired: true,
          reason: "capacity",
          ...parseCapacityConflict(error),
        });
      }

      if (hasPostgrestCode(error, "P0008")) {
        return ok({ confirmRequired: true, reason: "past_event" });
      }

      if (hasPostgrestCode(error, "P0009")) {
        return ok({ confirmRequired: true, reason: "finalized_payment" });
      }

      if (hasPostgrestCode(error, "P0002")) {
        return fail("ATTENDANCE_NOT_FOUND", {
          userMessage: "参加レコードが見つかりません。",
        });
      }

      if (hasPostgrestCode(error, "P0013")) {
        return fail("EVENT_CANCELED", {
          userMessage: "中止済みイベントの出欠は変更できません。",
        });
      }

      if (hasPostgrestCode(error, "P0010")) {
        return fail("VALIDATION_ERROR", {
          userMessage: "有料イベントで参加に変更するには、支払い方法を選択してください。",
          fieldErrors: { paymentMethod: ["支払い方法を選択してください。"] },
        });
      }

      if (hasPostgrestCode(error, "P0011")) {
        return fail("VALIDATION_ERROR", {
          userMessage: "このイベントでは選択された支払い方法を利用できません。",
          fieldErrors: { paymentMethod: ["利用できない支払い方法です。"] },
        });
      }

      if (hasPostgrestCode(error, "P0012")) {
        return fail("RESOURCE_CONFLICT", {
          userMessage: "オンライン決済を利用するには受取先プロファイルの設定完了が必要です。",
        });
      }

      if (hasPostgrestCode(error, "P0001")) {
        return fail("FORBIDDEN", {
          userMessage: "この参加を変更する権限がありません。",
        });
      }

      return fail("DATABASE_ERROR", {
        userMessage: "参加状況の更新に失敗しました。",
        retryable: true,
      });
    }

    const result = mapRpcResult((data ?? {}) as RpcAdminUpdateAttendanceStatusResult);

    revalidatePath(`/events/${accessContext.id}`);
    revalidatePath("/dashboard");

    return ok(result, { message: "出欠を更新しました。" });
  } catch (_error) {
    return fail("INTERNAL_ERROR", {
      userMessage: "参加状況の更新中にエラーが発生しました。",
      retryable: true,
    });
  }
}
