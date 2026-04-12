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
import {
  DeleteMistakenAttendanceInputSchema,
  type DeleteMistakenAttendanceResult,
} from "@core/validation/participant-management";

import { getOwnedEventActionContextForServerAction } from "../services/get-owned-event-context-for-community";

export async function deleteMistakenAttendanceAction(
  input: unknown
): Promise<ActionResult<DeleteMistakenAttendanceResult>> {
  const parsed = DeleteMistakenAttendanceInputSchema.safeParse(input);
  if (!parsed.success) {
    return zodFail(parsed.error, { userMessage: "入力データが無効です。" });
  }

  try {
    const { eventId, attendanceId } = parsed.data;
    const supabase = await createServerActionSupabaseClient();

    const accessResult = await getOwnedEventActionContextForServerAction(supabase, eventId);
    if (!accessResult.success) {
      return toActionResultFromAppResult(accessResult);
    }

    const accessContext = accessResult.data;
    if (!accessContext) {
      return fail("INTERNAL_ERROR", { userMessage: "イベント情報の取得に失敗しました。" });
    }

    const { data: _rpcResult, error } = await supabase.rpc("rpc_admin_delete_mistaken_attendance", {
      p_event_id: accessContext.id,
      p_attendance_id: attendanceId,
      p_user_id: accessContext.user.id,
    });

    if (error) {
      if (hasPostgrestCode(error, "P0002")) {
        return fail("ATTENDANCE_NOT_FOUND", {
          userMessage: "参加レコードが見つかりません。",
        });
      }

      if (hasPostgrestCode(error, "P0003")) {
        return fail("RESOURCE_CONFLICT", {
          userMessage:
            "決済処理が開始済み、または会計操作の記録があるため、この参加は取り消せません。",
        });
      }

      if (hasPostgrestCode(error, "P0001")) {
        return fail("FORBIDDEN", {
          userMessage: "この参加を取り消す権限がありません。",
        });
      }

      return fail("DATABASE_ERROR", {
        userMessage: "参加の取り消しに失敗しました。",
        retryable: true,
      });
    }

    revalidatePath(`/events/${accessContext.id}`);
    revalidatePath("/dashboard");

    return ok({ attendanceId }, { message: "誤登録を取り消しました。" });
  } catch (_error) {
    return fail("INTERNAL_ERROR", {
      userMessage: "参加の取り消し中にエラーが発生しました。",
      retryable: true,
    });
  }
}
