"use server";

import { createClient } from "@/lib/supabase/server";
import { createEventSchema, type CreateEventInput } from "@/lib/validations/event";
import { extractEventCreateFormData } from "@/lib/utils/form-data-extractors";
import { z } from "zod";
import { randomBytes } from "crypto";
import type { Database } from "@/types/database";
import { convertDatetimeLocalToUtc } from "@/lib/utils/timezone";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

type CreateEventResult =
  | {
      success: true;
      data: EventRow;
    }
  | {
      success: false;
      error: string;
    };

type FormDataFields = {
  title: string;
  date: string;
  fee: string;
  payment_methods: string;
  location?: string;
  description?: string;
  capacity?: string;
  registration_deadline?: string;
  payment_deadline?: string;
};

export async function createEventAction(formData: FormData): Promise<CreateEventResult> {
  try {
    const supabase = createClient();

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
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    const rawData = extractFormData(formData);
    const validatedData = createEventSchema.parse(rawData);
    const inviteToken = generateInviteToken();

    const eventData = buildEventData(validatedData, user.id, inviteToken);

    const { data: createdEvent, error: dbError } = await supabase
      .from("events")
      .insert(eventData)
      .select()
      .single();

    if (dbError) {
      console.error("データベースエラー:", {
        error: dbError,
        userId: user.id,
        eventData: { ...eventData, invite_token: "[REDACTED]" },
      });
      return {
        success: false,
        error: "イベントの作成に失敗しました",
      };
    }

    if (!createdEvent) {
      console.error("イベント作成後にデータが返されませんでした:", {
        userId: user.id,
        eventData: { ...eventData, invite_token: "[REDACTED]" },
      });
      return {
        success: false,
        error: "イベントの作成に失敗しました",
      };
    }

    return {
      success: true,
      data: createdEvent,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message,
      };
    }

    console.error("予期しないエラー:", error);
    return {
      success: false,
      error: "予期しないエラーが発生しました",
    };
  }
}

function extractFormData(formData: FormData): FormDataFields {
  // 共通ユーティリティを使用して型安全なFormData抽出
  return extractEventCreateFormData(formData);
}

/**
 * Cryptographically secure invite token generation
 * 16バイトのランダムデータを32文字の16進数文字列に変換
 */
function generateInviteToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * 定員の値を適切に処理する（型が異なる場合対応）
 * 空文字列または未定義の場合は無制限（null）
 * "0"の場合も無制限として扱う（参加不可能を避けるため）
 */
function parseCapacityLocal(capacity: string | number | null | undefined): number | null {
  if (!capacity || capacity === null) {
    return null;
  }

  if (typeof capacity === "string") {
    if (capacity.trim() === "") return null;
    const parsed = Number(capacity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  if (typeof capacity === "number") {
    if (capacity <= 0) return null;
    return capacity;
  }

  return null;
}

/**
 * datetime-local形式の文字列をUTCに変換してISO文字列として返す
 * date-fns-tzを使用した統一的なタイムゾーン処理
 */
function convertDatetimeLocalToIso(dateString: string): string {
  const utcDate = convertDatetimeLocalToUtc(dateString);
  return utcDate.toISOString();
}

function buildEventData(validatedData: CreateEventInput, userId: string, inviteToken: string) {
  return {
    title: validatedData.title,
    date: convertDatetimeLocalToIso(validatedData.date),
    fee: Number(validatedData.fee),
    payment_methods:
      validatedData.payment_methods as Database["public"]["Enums"]["payment_method_enum"][],
    location: validatedData.location || null,
    description: validatedData.description || null,
    capacity: parseCapacityLocal(validatedData.capacity),
    registration_deadline: validatedData.registration_deadline
      ? convertDatetimeLocalToIso(validatedData.registration_deadline)
      : null,
    payment_deadline: validatedData.payment_deadline
      ? convertDatetimeLocalToIso(validatedData.payment_deadline)
      : null,
    created_by: userId,
    invite_token: inviteToken,
  };
}
