"use server";

import { createClient } from "@/lib/supabase/server";
import { updateEventSchema } from "@/lib/validations/event";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";
import { checkEditRestrictions } from "@/lib/utils/event-restrictions";
import {
  type ServerActionResult,
  createErrorResponse,
  createSuccessResponse,
  zodErrorToResponse,
  ERROR_CODES,
} from "@/lib/types/server-actions";
import { convertDatetimeLocalToUtc } from "@/lib/utils/timezone";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type UpdateEventResult = ServerActionResult<EventRow>;

type FormDataFields = {
  title?: string;
  date?: string;
  fee?: string;
  payment_methods?: string;
  location?: string;
  description?: string;
  capacity?: string;
  registration_deadline?: string;
  payment_deadline?: string;
};

export async function updateEventAction(
  eventId: string,
  formData: FormData
): Promise<UpdateEventResult> {
  try {
    const supabase = createClient();

    // イベントIDのバリデーション（UUID形式）
    try {
      z.string().uuid().parse(eventId);
    } catch {
      return createErrorResponse(ERROR_CODES.INVALID_INPUT, "無効なイベントIDです");
    }

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("認証エラー:", authError);
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED);
    }

    // イベントの存在確認と権限チェック
    const { data: existingEvent, error: eventError } = await supabase
      .from("events")
      .select("*, attendances(*)")
      .eq("id", eventId)
      .single();

    if (eventError || !existingEvent) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "イベントが見つかりません");
    }

    // 作成者権限チェック
    if (existingEvent.created_by !== user.id) {
      return createErrorResponse(ERROR_CODES.FORBIDDEN, "このイベントを編集する権限がありません");
    }

    // フォームデータの抽出
    const rawData = extractFormData(formData);

    // バリデーション（Zodによる統一されたバリデーション）
    const validatedData = updateEventSchema.parse(rawData);

    // 参加者がいる場合の制限チェック（バリデーション後に実行）
    const restrictions = checkEditRestrictions(existingEvent, {
      title: validatedData.title,
      date: validatedData.date
        ? convertDatetimeLocalToUtc(validatedData.date).toISOString()
        : undefined,
      fee: validatedData.fee ? Number(validatedData.fee) : undefined,
      capacity: validatedData.capacity,
      payment_methods: validatedData.payment_methods,
    });

    if (restrictions.length > 0) {
      return createErrorResponse(ERROR_CODES.EDIT_RESTRICTION, restrictions[0].message, {
        violations: restrictions,
      });
    }

    // 更新データの構築
    const updateData = buildUpdateData(validatedData, existingEvent);

    // 更新対象がない場合は早期リターン
    if (Object.keys(updateData).length === 0) {
      return createSuccessResponse(existingEvent, "変更がないため更新をスキップしました");
    }

    // データベース更新
    const { data: updatedEvent, error: updateError } = await supabase
      .from("events")
      .update(updateData)
      .eq("id", eventId)
      .select()
      .single();

    if (updateError) {
      console.error("データベース更新エラー:", updateError);
      return createErrorResponse(ERROR_CODES.DATABASE_ERROR, "イベントの更新に失敗しました", {
        databaseError: updateError,
      });
    }

    if (!updatedEvent) {
      return createErrorResponse(ERROR_CODES.DATABASE_ERROR, "イベントの更新に失敗しました");
    }

    // キャッシュの無効化
    revalidatePath("/events");
    revalidatePath(`/events/${eventId}`);

    return createSuccessResponse(updatedEvent, "イベントが正常に更新されました");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorToResponse(error);
    }

    console.error("予期しないエラー:", error);
    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, "予期しないエラーが発生しました", {
      originalError: error,
    });
  }
}

function extractFormData(formData: FormData): FormDataFields {
  const extractValue = (key: string): string | undefined => {
    const value = formData.get(key) as string;
    return value && value.trim() !== "" ? value : undefined;
  };

  return {
    title: extractValue("title"),
    date: extractValue("date"),
    fee: extractValue("fee"),
    payment_methods: extractValue("payment_methods"),
    location: extractValue("location"),
    description: extractValue("description"),
    capacity: extractValue("capacity"),
    registration_deadline: extractValue("registration_deadline"),
    payment_deadline: extractValue("payment_deadline"),
  };
}

function buildUpdateData(validatedData: any, existingEvent: any) {
  const updateData: any = {};

  // 変更されたフィールドのみ更新（パフォーマンス最適化）
  if (validatedData.title && validatedData.title !== existingEvent.title) {
    updateData.title = validatedData.title;
  }

  if (validatedData.date) {
    const newDate = convertDatetimeLocalToUtc(validatedData.date).toISOString();
    if (newDate !== existingEvent.date) {
      updateData.date = newDate;
    }
  }

  if (validatedData.fee !== undefined) {
    const newFee = Number(validatedData.fee);
    if (newFee !== existingEvent.fee) {
      updateData.fee = newFee;
    }
  }

  if (validatedData.payment_methods) {
    // 配列の深い比較を実装（重複や順序を考慮）
    const existingMethods = existingEvent.payment_methods || [];
    const newMethods = validatedData.payment_methods;

    // 配列の要素が同じかチェック（順序は関係なし）
    const isEqual =
      existingMethods.length === newMethods.length &&
      existingMethods.every((method: string) => newMethods.includes(method)) &&
      newMethods.every((method: string) => existingMethods.includes(method));

    if (!isEqual) {
      updateData.payment_methods = newMethods;
    }
  }

  if (validatedData.location !== undefined) {
    const newLocation = validatedData.location || null;
    if (newLocation !== existingEvent.location) {
      updateData.location = newLocation;
    }
  }

  if (validatedData.description !== undefined) {
    const newDescription = validatedData.description || null;
    if (newDescription !== existingEvent.description) {
      updateData.description = newDescription;
    }
  }

  if (validatedData.capacity !== undefined) {
    // Zodで既に変換済みの値を使用
    const newCapacity = validatedData.capacity;
    if (newCapacity !== existingEvent.capacity) {
      updateData.capacity = newCapacity;
    }
  }

  if (validatedData.registration_deadline !== undefined) {
    const newDeadline = validatedData.registration_deadline
      ? convertDatetimeLocalToUtc(validatedData.registration_deadline).toISOString()
      : null;
    if (newDeadline !== existingEvent.registration_deadline) {
      updateData.registration_deadline = newDeadline;
    }
  }

  if (validatedData.payment_deadline !== undefined) {
    const newDeadline = validatedData.payment_deadline
      ? convertDatetimeLocalToUtc(validatedData.payment_deadline).toISOString()
      : null;
    if (newDeadline !== existingEvent.payment_deadline) {
      updateData.payment_deadline = newDeadline;
    }
  }

  return updateData;
}
