"use server";

import { createClient } from "@/lib/supabase/server";
import { updateEventSchema, type UpdateEventFormData } from "@/lib/validations/event";
import { validateEventId } from "@/lib/validations/event-id";
import { extractEventUpdateFormData } from "@/lib/utils/form-data-extractors";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";
import { checkEditRestrictions } from "@/lib/utils/event-restrictions";
import {
  type ServerActionResult,
  createServerActionError,
  createServerActionSuccess,
  zodErrorToServerActionResponse,
} from "@/lib/types/server-actions";
import { convertDatetimeLocalToUtc } from "@/lib/utils/timezone";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type UpdateEventResult = ServerActionResult<EventRow>;

// UpdateEventInputを使用（Zodスキーマから自動生成）

export async function updateEventAction(
  eventId: string,
  formData: FormData
): Promise<UpdateEventResult> {
  try {
    // CSRF対策: Origin/Refererヘッダーチェック（複数環境対応）
    const getAllowedOrigins = () => {
      const origins = [];

      // 本番環境URL
      if (process.env.NEXT_PUBLIC_SITE_URL) {
        origins.push(process.env.NEXT_PUBLIC_SITE_URL);
      }

      // 開発環境URL
      origins.push("http://localhost:3000");
      origins.push("https://localhost:3000");

      // Vercel Preview環境URL（動的に生成される）
      if (process.env.VERCEL_URL) {
        origins.push(`https://${process.env.VERCEL_URL}`);
      }

      // 追加の許可オリジン（環境変数で設定可能）
      if (process.env.ALLOWED_ORIGINS) {
        const additionalOrigins = process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
        origins.push(...additionalOrigins);
      }

      return [...new Set(origins)]; // 重複を除去
    };

    const allowedOrigins = getAllowedOrigins();

    // Edge Runtimeではheadersを直接取得
    const { headers } = await import("next/headers");
    const headersList = headers();
    const requestOrigin = headersList.get("origin");
    const referer = headersList.get("referer");
    const requestMethod = headersList.get("x-http-method-override") || "POST";

    // OPTIONS リクエストの場合は追加検証を実行
    if (requestMethod === "OPTIONS") {
      // プリフライトリクエストでは Origin ヘッダーが必須
      if (!requestOrigin) {
        return createServerActionError("UNAUTHORIZED", "無効なリクエストです");
      }
    }

    // オリジンの正規化関数（末尾スラッシュを除去）
    const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "");

    // Origin または Referer のいずれかが許可されたオリジンと一致するかチェック
    const isValidOrigin =
      requestOrigin &&
      allowedOrigins.some((allowed) => normalizeOrigin(requestOrigin) === normalizeOrigin(allowed));
    const isValidReferer =
      referer && allowedOrigins.some((allowed) => referer.startsWith(normalizeOrigin(allowed)));

    // より厳密なチェック: 少なくとも一つのヘッダーが存在し、有効である必要がある
    if ((!requestOrigin && !referer) || (!isValidOrigin && !isValidReferer)) {
      return createServerActionError("UNAUTHORIZED", "無効なリクエストです");
    }

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
      .single();

    if (eventError || !existingEvent) {
      return createServerActionError("NOT_FOUND", "イベントが見つかりません");
    }

    // 作成者権限チェック
    if (existingEvent.created_by !== user.id) {
      return createServerActionError("FORBIDDEN", "このイベントを編集する権限がありません");
    }

    // フォームデータの抽出
    const rawData = extractFormData(formData);

    // バリデーション（Zodによる統一されたバリデーション）
    let validatedData;
    try {
      validatedData = updateEventSchema.parse(rawData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        return createServerActionError("VALIDATION_ERROR", firstError.message);
      }
      throw error;
    }

    // 参加者がいる場合の制限チェック（バリデーション後に実行）
    const restrictions = checkEditRestrictions(existingEvent, {
      title: validatedData.title,
      date: validatedData.date ? convertDatetimeLocalToIso(validatedData.date) : undefined,
      fee: validatedData.fee,
      capacity: validatedData.capacity,
      payment_methods: validatedData.payment_methods,
    });

    if (restrictions.length > 0) {
      return createServerActionError(
        "RESOURCE_CONFLICT",
        "編集制限により変更できません",
        {
          details: {
            violations: restrictions,
          },
        }
      );
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
  if (validatedData.title && validatedData.title !== existingEvent.title) {
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
    const newDeadline = validatedData.registration_deadline
      ? convertDatetimeLocalToIso(validatedData.registration_deadline as string)
      : null;
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

  return updateData;
}
