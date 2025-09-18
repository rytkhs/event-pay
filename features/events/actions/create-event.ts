"use server";

import { z } from "zod";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { createClient } from "@core/supabase/server";
import {
  type ServerActionResult,
  createServerActionError,
  createServerActionSuccess,
  zodErrorToServerActionResponse,
} from "@core/types/server-actions";
import { extractEventCreateFormData } from "@core/utils/form-data-extractors";
import { generateInviteToken } from "@core/utils/invite-token";
import { convertDatetimeLocalToUtc } from "@core/utils/timezone";
import { createEventSchema, type CreateEventInput } from "@core/validation/event";

import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

type CreateEventResult = ServerActionResult<EventRow>;

type FormDataFields = {
  title: string;
  date: string;
  fee: string;
  payment_methods: string[];
  location?: string;
  description?: string;
  capacity?: string;
  registration_deadline: string;
  payment_deadline?: string;
  allow_payment_after_deadline?: boolean;
  grace_period_days?: number;
};

export async function createEventAction(formData: FormData): Promise<CreateEventResult> {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です");
    }

    if (!user) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です");
    }

    const rawData = extractFormData(formData);

    let validatedData;
    try {
      validatedData = createEventSchema.parse(rawData);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return zodErrorToServerActionResponse(validationError);
      }
      return createServerActionError("VALIDATION_ERROR", "入力が不正です");
    }

    const inviteToken = generateInviteToken();
    const eventData = buildEventData(validatedData, user.id, inviteToken);

    // Service Roleクライアントを使用してRLS制約を回避
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.EVENT_MANAGEMENT,
      "create_event",
      {
        userId: user.id,
        eventTitle: eventData.title,
        inviteToken: eventData.invite_token,
      }
    );

    const { data: createdEvent, error: dbError } = await adminClient
      .from("events")
      .insert(eventData)
      .select()
      .single();

    if (dbError) {
      return createServerActionError("DATABASE_ERROR", "イベントの作成に失敗しました", {
        retryable: true,
        details: { dbError },
      });
    }

    if (!createdEvent) {
      return createServerActionError("DATABASE_ERROR", "イベントの作成に失敗しました", {
        retryable: true,
      });
    }

    return createServerActionSuccess(createdEvent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorToServerActionResponse(error);
    }
    return createServerActionError("INTERNAL_ERROR", "予期しないエラーが発生しました", {
      retryable: true,
      details: { originalError: error },
    });
  }
}

function extractFormData(formData: FormData): FormDataFields {
  // 共通ユーティリティを使用して型安全なFormData抽出
  return extractEventCreateFormData(formData);
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
    if (capacity.trim() === "") {
      return null;
    }
    const parsed = Number(capacity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  if (typeof capacity === "number") {
    if (capacity <= 0) {
      return null;
    }
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

function buildEventData(
  validatedData: CreateEventInput,
  userId: string,
  inviteToken: string
): {
  title: string;
  date: string;
  fee: number;
  payment_methods: Database["public"]["Enums"]["payment_method_enum"][] | [];
  location: string | null;
  description: string | null;
  capacity: number | null;
  registration_deadline: string | null;
  payment_deadline: string | null;
  allow_payment_after_deadline: boolean;
  grace_period_days: number;
  created_by: string;
  invite_token: string;
} {
  const fee = Number(validatedData.fee);

  return {
    title: validatedData.title,
    date: convertDatetimeLocalToIso(validatedData.date),
    fee,
    // 無料イベント（fee=0）の場合は空配列を明示的に設定
    payment_methods:
      fee === 0
        ? []
        : (validatedData.payment_methods as Database["public"]["Enums"]["payment_method_enum"][]),
    location: validatedData.location ?? null,
    description: validatedData.description ?? null,
    capacity: parseCapacityLocal(validatedData.capacity),
    registration_deadline: validatedData.registration_deadline
      ? convertDatetimeLocalToIso(validatedData.registration_deadline)
      : null,
    payment_deadline: validatedData.payment_deadline
      ? convertDatetimeLocalToIso(validatedData.payment_deadline)
      : null,
    allow_payment_after_deadline: Boolean(validatedData.allow_payment_after_deadline),
    grace_period_days: Number(validatedData.grace_period_days ?? 0),
    created_by: userId,
    invite_token: inviteToken,
  };
}
