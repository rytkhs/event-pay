"use server";

import { createClient } from "@/lib/supabase/server";
import { createEventSchema, type CreateEventInput } from "@/lib/validations/event";
import { z } from "zod";
import { randomBytes } from "crypto";
import type { Database } from "@/types/database";

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
  };
}

/**
 * Cryptographically secure invite token generation
 * 16バイトのランダムデータを32文字の16進数文字列に変換
 */
function generateInviteToken(): string {
  return randomBytes(16).toString("hex");
}

function buildEventData(validatedData: CreateEventInput, userId: string, inviteToken: string) {
  return {
    title: validatedData.title,
    date: validatedData.date,
    fee: parseInt(validatedData.fee),
    payment_methods: validatedData.payment_methods,
    location: validatedData.location || null,
    description: validatedData.description || null,
    capacity: validatedData.capacity ? parseInt(validatedData.capacity) : null,
    created_by: userId,
    invite_token: inviteToken,
  };
}
