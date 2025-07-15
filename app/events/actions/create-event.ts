"use server";

import { createClient } from "@/lib/supabase/server";
import { createEventSchema, type CreateEventInput } from "@/lib/validations/event";
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
      console.warn("未認証ユーザーによるアクセス試行");
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

    console.info("イベント作成成功:", {
      eventId: createdEvent.id,
      userId: user.id,
      title: createdEvent.title,
    });

    return {
      success: true,
      data: createdEvent,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn("バリデーションエラー:", {
        errors: error.errors,
        formData: Object.fromEntries(formData.entries()),
      });
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
  return {
    title: (formData.get("title") as string) || "",
    date: (formData.get("date") as string) || "",
    fee: (formData.get("fee") as string) || "",
    payment_methods: (formData.get("payment_methods") as string) || "",
    location: (formData.get("location") as string) || undefined,
    description: (formData.get("description") as string) || undefined,
    capacity: (formData.get("capacity") as string) || undefined,
    registration_deadline: (formData.get("registration_deadline") as string) || undefined,
    payment_deadline: (formData.get("payment_deadline") as string) || undefined,
  };
}

/**
 * Cryptographically secure invite token generation
 * 16バイトのランダムデータを32文字の16進数文字列に変換
 */
function generateInviteToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * 定員の値を適切に処理する
 * 空文字列または未定義の場合は無制限（null）
 * "0"の場合も無制限として扱う（参加不可能を避けるため）
 */

function buildEventData(validatedData: CreateEventInput, userId: string, inviteToken: string) {
  return {
    title: validatedData.title,
    date: convertDatetimeLocalToUtc(validatedData.date).toISOString(),
    fee: Number(validatedData.fee),
    payment_methods:
      validatedData.payment_methods as Database["public"]["Enums"]["payment_method_enum"][],
    location: validatedData.location || null,
    description: validatedData.description || null,
    capacity: validatedData.capacity,
    registration_deadline: validatedData.registration_deadline
      ? convertDatetimeLocalToUtc(validatedData.registration_deadline).toISOString()
      : null,
    payment_deadline: validatedData.payment_deadline
      ? convertDatetimeLocalToUtc(validatedData.payment_deadline).toISOString()
      : null,
    created_by: userId,
    invite_token: inviteToken,
  };
}
