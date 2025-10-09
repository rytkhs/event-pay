"use server";

import { randomUUID } from "crypto";

import { headers } from "next/headers";

import { z } from "zod";

import { getCurrentUser } from "@core/auth/auth-utils";
import { logger } from "@core/logging/app-logger";
import { logEventManagement } from "@core/logging/system-logger";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { logSecurityEvent } from "@core/security/security-logger";
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
  const requestId = randomUUID();
  const actionLogger = logger.withContext({
    tag: "eventCreation",
    request_id: requestId,
  });

  actionLogger.info("Event creation action invoked");

  try {
    const user = await getCurrentUser();

    if (!user) {
      actionLogger.warn("Event creation attempted without authentication");

      // セキュリティログの記録
      const headersList = headers();
      logSecurityEvent({
        type: "SUSPICIOUS_ACTIVITY",
        severity: "MEDIUM",
        message: "未認証でのイベント作成試行",
        userAgent: headersList.get("user-agent") || undefined,
        ip: headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || undefined,
        timestamp: new Date(),
        details: {
          action: "create_event",
          endpoint: "/events/create",
        },
      });

      return createServerActionError("UNAUTHORIZED", "認証が必要です", {
        details: {
          timestamp: new Date().toISOString(),
          action: "create_event",
        },
      });
    }

    const rawData = extractFormData(formData);

    let validatedData;
    try {
      validatedData = createEventSchema.parse(rawData);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        actionLogger.warn("Event creation validation failed", {
          user_id: user.id,
          issues: validationError.issues,
        });
        return zodErrorToServerActionResponse(validationError);
      }
      actionLogger.error("Event creation validation encountered unexpected error", {
        user_id: user.id,
        error: validationError instanceof Error ? validationError.message : validationError,
      });
      return createServerActionError("VALIDATION_ERROR", "入力が不正です");
    }

    // オンライン決済の準備状態（Stripe Connect）のサーバー側チェック
    // - クライアント改ざん防止のため、"stripe"選択時は verified && payouts_enabled を必須とする
    // - features間の直接依存は避け、DBのアカウント状態で軽量判定する
    {
      const fee = Number(rawData.fee);
      const wantsStripe = Array.isArray((rawData as any).payment_methods)
        ? ((rawData as any).payment_methods as string[]).includes("stripe")
        : false;

      if (fee > 0 && wantsStripe) {
        const factory = SecureSupabaseClientFactory.getInstance();
        const authenticatedClient = factory.createAuthenticatedClient();

        const { data: connectAccount, error: connectError } = await authenticatedClient
          .from("stripe_connect_accounts")
          .select("status, payouts_enabled")
          .eq("user_id", user.id)
          .maybeSingle();

        const isReady =
          !!connectAccount &&
          (connectAccount as any).status === "verified" &&
          (connectAccount as any).payouts_enabled === true;

        if (connectError || !isReady) {
          actionLogger.warn("Stripe Connect not ready for paid event creation", {
            user_id: user.id,
            connect_error: connectError?.message,
            connect_status: connectAccount?.status,
            connect_payouts_enabled: connectAccount?.payouts_enabled,
          });
          return createServerActionError(
            "VALIDATION_ERROR",
            "オンライン決済を利用するにはStripe Connectの設定完了が必要です",
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

    const inviteToken = generateInviteToken();
    const eventData = buildEventData(validatedData, user.id, inviteToken);

    // 認証済みクライアントを使用（RLSポリシーで自分のイベント作成を許可）
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const authenticatedClient = secureFactory.createAuthenticatedClient();

    actionLogger.info("Attempting to insert event", {
      user_id: user.id,
      fee: eventData.fee,
      payment_methods: eventData.payment_methods,
      created_by: eventData.created_by,
    });

    const { data: createdEvent, error: dbError } = await authenticatedClient
      .from("events")
      .insert(eventData)
      .select()
      .single();

    if (dbError) {
      actionLogger.error("Event creation failed at database insert", {
        user_id: user.id,
        error_code: dbError.code,
        error_message: dbError.message,
        hint: dbError.hint,
        details: dbError.details,
        rls_suspected: dbError.code === "42501",
      });
      return createServerActionError("DATABASE_ERROR", "イベントの作成に失敗しました", {
        retryable: true,
        details: { dbError },
      });
    }

    if (!createdEvent) {
      actionLogger.error("Event creation did not return created event", {
        user_id: user.id,
      });
      return createServerActionError("DATABASE_ERROR", "イベントの作成に失敗しました", {
        retryable: true,
      });
    }

    actionLogger.info("Event created successfully", {
      user_id: user.id,
      event_id: createdEvent.id,
    });

    // 監査ログ記録
    await logEventManagement({
      action: "event.create",
      message: `Event created: ${createdEvent.id}`,
      user_id: user.id,
      resource_id: createdEvent.id,
      outcome: "success",
      metadata: {
        title: eventData.title,
        fee: eventData.fee,
        payment_methods: eventData.payment_methods,
      },
    });

    return createServerActionSuccess(createdEvent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      actionLogger.error("Event creation caught ZodError in catch", {
        issues: error.issues,
      });
      return zodErrorToServerActionResponse(error);
    }
    actionLogger.error("Event creation action threw unexpected error", {
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : undefined,
    });
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
  registration_deadline: string;
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
    registration_deadline: convertDatetimeLocalToIso(validatedData.registration_deadline as string),
    // 無料イベント（fee=0）の場合は決済締切も強制的にnullに設定
    payment_deadline:
      fee === 0
        ? null
        : validatedData.payment_deadline
          ? convertDatetimeLocalToIso(validatedData.payment_deadline)
          : null,
    // 無料イベント（fee=0）の場合は決済関連の設定も強制的にリセット
    allow_payment_after_deadline:
      fee === 0 ? false : Boolean(validatedData.allow_payment_after_deadline),
    grace_period_days: fee === 0 ? 0 : Number(validatedData.grace_period_days ?? 0),
    created_by: userId,
    invite_token: inviteToken,
  };
}
