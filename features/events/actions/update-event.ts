import { revalidatePath } from "next/cache";

import { z } from "zod";

import {
  buildRestrictionContext,
  createFormDataSnapshot,
  evaluateEventEditViolations,
} from "@core/domain/event-edit-restrictions";
import { logEventManagement } from "@core/logging/system-logger";
import { createClient } from "@core/supabase/server";
import {
  type ServerActionResult,
  createServerActionError,
  createServerActionSuccess,
  zodErrorToServerActionResponse,
} from "@core/types/server-actions";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { calculateAttendeeCount } from "@core/utils/event-calculations";
import { extractEventUpdateFormData } from "@core/utils/form-data-extractors";
import { convertDatetimeLocalToUtc } from "@core/utils/timezone";
import { updateEventSchema, type UpdateEventFormData } from "@core/validation/event";
import { validateEventId } from "@core/validation/event-id";

import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type UpdateEventResult = ServerActionResult<EventRow>;

// UpdateEventInputを使用（Zodスキーマから自動生成）

export async function updateEventAction(
  eventId: string,
  formData: FormData
): Promise<UpdateEventResult> {
  try {
    const supabase = createClient();

    // イベントIDのバリデーション（UUID形式）
    const eventIdValidation = validateEventId(eventId);
    if (!eventIdValidation.success) {
      return createServerActionError(
        "VALIDATION_ERROR",
        eventIdValidation.error?.message || "無効なイベントIDです"
      );
    }

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です");
    }

    // イベントの存在確認と権限チェック
    const { data: existingEvent, error: eventError } = await supabase
      .from("events")
      .select("*, attendances(*)")
      .eq("id", eventId)
      .eq("created_by", user.id)
      .single();

    // RLSフィルターにより、存在しないイベントまたは権限のないイベントは取得不可
    if (eventError?.code === "PGRST301" || eventError?.code === "PGRST116" || !existingEvent) {
      return createServerActionError("FORBIDDEN", "このイベントを編集する権限がありません");
    }

    // ステータスベースの編集禁止チェック
    const eventStatus = deriveEventStatus(existingEvent.date, existingEvent.canceled_at);

    if (eventStatus === "past") {
      return createServerActionError("FORBIDDEN", "開催済みのイベントは編集できません");
    }

    if (eventStatus === "canceled") {
      return createServerActionError("FORBIDDEN", "キャンセル済みのイベントは編集できません");
    }

    // フォームデータの抽出
    const rawData = extractFormData(formData);

    // バリデーション（Zodによる統一されたバリデーション）
    let validatedData;
    try {
      validatedData = updateEventSchema.parse(rawData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // フィールド別エラーを含む統一形式でレスポンス
        return zodErrorToServerActionResponse(error);
      }
      throw error;
    }

    // クロスフィールド検証（既存値と突合）: registration/payment_deadline と date の整合
    // effectiveDate: 入力があれば新値、なければ既存値
    const effectiveDateIso = validatedData.date
      ? convertDatetimeLocalToIso(validatedData.date as string)
      : existingEvent.date;

    // registration_deadline: 入力未指定なら既存値、Zodで空文字はチェック済み
    const effectiveRegDeadlineIso =
      validatedData.registration_deadline !== undefined
        ? convertDatetimeLocalToIso(validatedData.registration_deadline as string)
        : existingEvent.registration_deadline;

    // payment_deadline: 入力未指定なら既存値、空文字はnull（クリア）
    const effectivePayDeadlineIso =
      validatedData.payment_deadline !== undefined
        ? validatedData.payment_deadline
          ? convertDatetimeLocalToIso(validatedData.payment_deadline as string)
          : null
        : (existingEvent.payment_deadline as string | null);

    // 参加申込締切: registration_deadline ≤ date
    if (effectiveRegDeadlineIso) {
      if (new Date(effectiveRegDeadlineIso) > new Date(effectiveDateIso)) {
        return createServerActionError(
          "VALIDATION_ERROR",
          "参加申込締切は開催日時以前に設定してください"
        );
      }
    }

    // 決済締切: registration_deadline ≤ payment_deadline（regがある場合）
    if (effectivePayDeadlineIso && effectiveRegDeadlineIso) {
      if (new Date(effectivePayDeadlineIso) < new Date(effectiveRegDeadlineIso)) {
        return createServerActionError(
          "VALIDATION_ERROR",
          "決済締切は参加申込締切以降に設定してください"
        );
      }
    }

    // 決済締切: payment_deadline ≤ date + 30日
    if (effectivePayDeadlineIso) {
      const eventPlus30d = new Date(
        new Date(effectiveDateIso).getTime() + 30 * 24 * 60 * 60 * 1000
      );
      if (new Date(effectivePayDeadlineIso) > eventPlus30d) {
        return createServerActionError(
          "VALIDATION_ERROR",
          "オンライン決済締切は開催日時から30日以内に設定してください"
        );
      }
    }

    // 猶予ON時: final_payment_limit <= date + 30日
    const effectiveAllowAfter =
      validatedData.allow_payment_after_deadline !== undefined
        ? Boolean(validatedData.allow_payment_after_deadline)
        : Boolean((existingEvent as any).allow_payment_after_deadline);

    if (effectiveAllowAfter) {
      const baseIso = effectivePayDeadlineIso ?? effectiveDateIso;
      const graceDays =
        Number(
          validatedData.grace_period_days !== undefined
            ? validatedData.grace_period_days
            : ((existingEvent as any).grace_period_days ?? 0)
        ) || 0;
      const finalCandidate = new Date(
        new Date(baseIso).getTime() + graceDays * 24 * 60 * 60 * 1000
      );
      const eventPlus30d = new Date(
        new Date(effectiveDateIso).getTime() + 30 * 24 * 60 * 60 * 1000
      );
      if (finalCandidate > eventPlus30d) {
        return createServerActionError(
          "VALIDATION_ERROR",
          "猶予を含む最終支払期限は開催日時から30日以内にしてください"
        );
      }
    }

    // 部分更新時のeffective値による統合バリデーション
    const effectiveFee =
      validatedData.fee !== undefined
        ? typeof validatedData.fee === "number"
          ? validatedData.fee
          : Number(validatedData.fee || 0)
        : (existingEvent.fee ?? 0);

    // fee=0 の場合は決済方法を空配列にする
    const effectivePaymentMethods =
      effectiveFee === 0
        ? []
        : validatedData.payment_methods !== undefined
          ? validatedData.payment_methods
          : existingEvent.payment_methods || [];

    // 有料イベント時の決済方法必須チェック（effective値での検証）
    if (effectiveFee > 0 && effectivePaymentMethods.length === 0) {
      return createServerActionError(
        "VALIDATION_ERROR",
        "有料イベントでは決済方法の選択が必要です",
        {
          details: {
            fieldErrors: [
              {
                field: "payment_methods",
                message: "有料イベントでは決済方法の選択が必要です",
              },
            ],
          },
        }
      );
    }

    // Stripe決済締切必須関係の差分送信時取りこぼし防止
    const hasStripe = effectivePaymentMethods.includes("stripe");
    if (hasStripe) {
      const effectivePaymentDeadline =
        validatedData.payment_deadline !== undefined
          ? validatedData.payment_deadline
          : existingEvent.payment_deadline;

      if (!effectivePaymentDeadline) {
        return createServerActionError(
          "VALIDATION_ERROR",
          "オンライン決済を選択した場合、決済締切の設定が必要です。既存のイベントでオンライン決済締切が未設定の場合は、編集画面で締切日時を入力してください。",
          {
            details: {
              fieldErrors: [
                {
                  field: "payment_deadline",
                  message:
                    "オンライン決済を選択した場合、決済締切の設定が必要です。既存のイベントでオンライン決済締切が未設定の場合は、編集画面で締切日時を入力してください。",
                },
              ],
            },
          }
        );
      }
    }

    // Stripe Connect 準備状態チェック（"stripe" を新規に追加する場合のみ）
    {
      const hadStripe = (existingEvent.payment_methods || []).includes("stripe");
      const addingStripe = hasStripe && !hadStripe && effectiveFee > 0;

      if (addingStripe) {
        const { data: connectAccount, error: connectError } = await supabase
          .from("stripe_connect_accounts")
          .select("status, payouts_enabled")
          .eq("user_id", user.id)
          .maybeSingle();

        const isReady =
          !!connectAccount &&
          (connectAccount as any).status === "verified" &&
          (connectAccount as any).payouts_enabled === true;

        if (connectError || !isReady) {
          return createServerActionError(
            "VALIDATION_ERROR",
            "オンライン決済を追加するにはStripe Connectの設定完了が必要です",
            {
              details: {
                fieldErrors: [
                  {
                    field: "payment_methods",
                    message: "Stripe Connectの設定を完了してください（本人確認と入金有効化）",
                  },
                ],
              },
            }
          );
        }
      }
    }

    // Stripe決済済み参加者の存在を確認（有無だけで良いので軽量に取得）
    // 注意: 現金決済済みはここには含まれない（仕様：Stripe決済完了者がいる場合のみ金銭系をロック）
    const { data: stripePayments, error: paymentsError } = await supabase
      .from("payments")
      .select("id, attendances!inner(event_id)")
      .eq("attendances.event_id", eventId)
      .eq("method", "stripe")
      .in("status", ["paid", "refunded"])
      .limit(1);

    // 決済状況取得エラー時はフェイルクローズ（UI側と統一）
    // エラー時は安全側に倒して、Stripe決済済み参加者がいるものとして扱う
    const hasStripePaid = paymentsError ? true : (stripePayments?.length || 0) > 0;

    // 現在の参加者数（attending のみ）を算出 - 共通ユーティリティを使用
    const attendeeCount = calculateAttendeeCount(existingEvent.attendances || []);
    const hasAttendees = attendeeCount > 0;

    const restrictionContext = buildRestrictionContext(
      {
        fee: existingEvent.fee,
        capacity: existingEvent.capacity,
        payment_methods: existingEvent.payment_methods ?? [],
        title: existingEvent.title,
        description: existingEvent.description ?? undefined,
        location: existingEvent.location ?? undefined,
        date: existingEvent.date,
        registration_deadline: existingEvent.registration_deadline ?? undefined,
        payment_deadline: existingEvent.payment_deadline ?? undefined,
        allow_payment_after_deadline:
          (existingEvent as any).allow_payment_after_deadline ?? undefined,
        grace_period_days: (existingEvent as any).grace_period_days ?? undefined,
      },
      { hasAttendees, attendeeCount, hasStripePaid },
      eventStatus
    );

    const effectiveCapacity =
      validatedData.capacity !== undefined ? validatedData.capacity : existingEvent.capacity;
    const effectiveTitle = validatedData.title ?? existingEvent.title;
    const effectiveDescription =
      validatedData.description !== undefined
        ? validatedData.description
        : (existingEvent.description ?? undefined);
    const effectiveLocation =
      validatedData.location !== undefined
        ? validatedData.location
        : (existingEvent.location ?? undefined);
    const effectiveRegistrationDeadline = effectiveRegDeadlineIso ?? undefined;
    const effectivePaymentDeadline = effectivePayDeadlineIso ?? undefined;
    const effectiveGracePeriodDays =
      validatedData.grace_period_days !== undefined
        ? validatedData.grace_period_days
        : ((existingEvent as any).grace_period_days ?? undefined);

    const formDataSnapshot = createFormDataSnapshot({
      fee: effectiveFee,
      capacity: effectiveCapacity,
      payment_methods: effectivePaymentMethods,
      title: effectiveTitle,
      description: effectiveDescription ?? undefined,
      location: effectiveLocation ?? undefined,
      date: effectiveDateIso,
      registration_deadline: effectiveRegistrationDeadline,
      payment_deadline: effectivePaymentDeadline,
      allow_payment_after_deadline: effectiveAllowAfter,
      grace_period_days: effectiveGracePeriodDays,
    });

    const restrictionPatch = Object.fromEntries(
      Object.entries(validatedData).filter(([, value]) => value !== undefined)
    );

    const fieldViolations = await evaluateEventEditViolations({
      context: restrictionContext,
      formData: formDataSnapshot,
      patch: restrictionPatch,
    });

    if (fieldViolations.length > 0) {
      return createServerActionError("RESOURCE_CONFLICT", "編集制限により変更できません", {
        details: {
          violations: fieldViolations.map((violation) => ({
            field: violation.field,
            message: violation.message,
          })),
        },
      });
    }

    // 定員変更の追加検証（Race Condition対策）
    if (validatedData.capacity !== undefined) {
      // 最新の参加者数を再取得してRace Conditionを防ぐ
      const { data: latestAttendances, error: attendanceError } = await supabase
        .from("attendances")
        .select("id")
        .eq("event_id", eventId)
        .eq("status", "attending");

      if (attendanceError) {
        return createServerActionError("DATABASE_ERROR", "参加者数の確認に失敗しました");
      }

      const currentAttendeeCount = latestAttendances?.length || 0;

      // 定員が設定されており、現在の参加者数より少ない場合はエラー
      if (validatedData.capacity !== null && validatedData.capacity < currentAttendeeCount) {
        return createServerActionError(
          "VALIDATION_ERROR",
          `定員は現在の参加者数（${currentAttendeeCount}名）以上で設定してください`
        );
      }
    }

    // 更新データの構築
    const updateData = buildUpdateData(validatedData, existingEvent);

    // 更新データが空の場合は既存データを返す（変更なし）
    if (Object.keys(updateData).length === 0) {
      return createServerActionSuccess(existingEvent, "変更はありませんでした");
    }

    // データベース更新
    const { data: updatedEvent, error: updateError } = await supabase
      .from("events")
      .update(updateData)
      .eq("id", eventId)
      .select()
      .single();

    if (updateError) {
      return createServerActionError("DATABASE_ERROR", "イベントの更新に失敗しました", {
        details: { databaseError: updateError },
      });
    }

    if (!updatedEvent) {
      return createServerActionError("DATABASE_ERROR", "イベントの更新に失敗しました");
    }

    // 監査ログ記録
    await logEventManagement({
      action: "event.update",
      message: `Event updated: ${eventId}`,
      user_id: user.id,
      resource_id: eventId,
      outcome: "success",
      metadata: {
        updated_fields: Object.keys(updateData),
        has_fee_change: updateData.fee !== undefined,
        has_payment_methods_change: updateData.payment_methods !== undefined,
      },
    });

    // キャッシュの無効化
    revalidatePath("/events");
    revalidatePath(`/events/${eventId}`);

    return createServerActionSuccess(updatedEvent, "イベントが正常に更新されました");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorToServerActionResponse(error);
    }

    return createServerActionError("INTERNAL_ERROR", "予期しないエラーが発生しました", {
      details: { originalError: error },
    });
  }
}

function extractFormData(formData: FormData): Partial<UpdateEventFormData> {
  // 共通ユーティリティを使用して型安全なFormData抽出
  return extractEventUpdateFormData(formData);
}

/**
 * datetime-local形式の文字列をUTCに変換してISO文字列として返す
 * date-fns-tzを使用した統一的なタイムゾーン処理
 */
function convertDatetimeLocalToIso(dateString: string): string {
  const utcDate = convertDatetimeLocalToUtc(dateString);
  return utcDate.toISOString();
}

// 型安全なupdateData構築関数
function buildUpdateData(
  validatedData: Record<string, unknown>,
  existingEvent: EventRow
): Partial<EventRow> {
  const updateData: Partial<EventRow> = {};

  // 変更されたフィールドのみ更新（パフォーマンス最適化）
  if (validatedData.title !== undefined && validatedData.title !== existingEvent.title) {
    updateData.title = validatedData.title as string;
  }

  if (validatedData.date) {
    const newDate = convertDatetimeLocalToIso(validatedData.date as string);
    if (newDate !== existingEvent.date) {
      updateData.date = newDate;
    }
  }

  if (validatedData.fee !== undefined) {
    const newFee =
      typeof validatedData.fee === "number"
        ? validatedData.fee
        : typeof validatedData.fee === "string"
          ? Number(validatedData.fee)
          : 0;
    if (newFee !== existingEvent.fee) {
      updateData.fee = newFee;
    }
  }

  if (validatedData.payment_methods !== undefined) {
    // 配列の深い比較を実装（順序に依存しない比較）
    const existingMethods = existingEvent.payment_methods || [];
    let newMethods =
      validatedData.payment_methods as Database["public"]["Enums"]["payment_method_enum"][];

    // 無料イベント（fee=0）の場合は決済方法を空配列に設定
    const newFee =
      validatedData.fee !== undefined
        ? typeof validatedData.fee === "number"
          ? validatedData.fee
          : Number(validatedData.fee || 0)
        : existingEvent.fee;

    if (newFee === 0) {
      newMethods = [];
    }

    // 配列の内容が異なる場合のみ更新（Set使用で簡略化）
    const existingSet = new Set(existingMethods);
    const newSet = new Set(newMethods);
    const methodsChanged =
      existingSet.size !== newSet.size ||
      !Array.from(existingSet).every((method) => newSet.has(method));

    if (methodsChanged) {
      updateData.payment_methods = newMethods;
    }
  }

  if (validatedData.location !== undefined && validatedData.location !== existingEvent.location) {
    updateData.location = validatedData.location as string | null;
  }

  if (
    validatedData.description !== undefined &&
    validatedData.description !== existingEvent.description
  ) {
    updateData.description = validatedData.description as string | null;
  }

  if (validatedData.capacity !== undefined) {
    const newCapacity = validatedData.capacity as number | null;
    if (newCapacity !== existingEvent.capacity) {
      updateData.capacity = newCapacity;
    }
  }

  if (validatedData.registration_deadline !== undefined) {
    // Zodバリデーションで空文字は既にチェック済みのため、ここでは有効な値として処理
    const deadline = validatedData.registration_deadline as string;
    const newDeadline = convertDatetimeLocalToIso(deadline);
    if (newDeadline !== existingEvent.registration_deadline) {
      updateData.registration_deadline = newDeadline;
    }
  }

  if (validatedData.payment_deadline !== undefined) {
    const newDeadline = validatedData.payment_deadline
      ? convertDatetimeLocalToIso(validatedData.payment_deadline as string)
      : null;
    if (newDeadline !== existingEvent.payment_deadline) {
      updateData.payment_deadline = newDeadline;
    }
  }

  // fee=0 の場合は決済方法を必ず空配列に（payloadに含まれない場合も確実に反映）
  {
    const effectiveFee =
      validatedData.fee !== undefined
        ? typeof validatedData.fee === "number"
          ? validatedData.fee
          : Number(validatedData.fee || 0)
        : existingEvent.fee;

    if (effectiveFee === 0) {
      // payloadの有無に関わらず、fee=0の場合は確実にpayment_methodsを空配列にする
      updateData.payment_methods = [] as Database["public"]["Enums"]["payment_method_enum"][];
    }
  }

  // 締切後決済許可
  if (validatedData.allow_payment_after_deadline !== undefined) {
    const next = Boolean(validatedData.allow_payment_after_deadline);
    if (next !== (existingEvent as any).allow_payment_after_deadline) {
      (updateData as any).allow_payment_after_deadline = next;
    }
  }

  // 猶予日数
  if (validatedData.grace_period_days !== undefined) {
    const raw = validatedData.grace_period_days as number;
    const next = Number.isFinite(raw) ? Number(raw) : 0;
    if (next !== (existingEvent as any).grace_period_days) {
      (updateData as any).grace_period_days = next;
    }
  }

  return updateData;
}
