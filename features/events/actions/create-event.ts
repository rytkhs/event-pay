"use server";

import { headers } from "next/headers";

import { z } from "zod";

import { getCurrentUser } from "@core/auth/auth-utils";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
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
  try {
    const user = await getCurrentUser();

    if (!user) {
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
        return zodErrorToServerActionResponse(validationError);
      }
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
        const adminClient = await factory.createAuditedAdminClient(
          AdminReason.EVENT_MANAGEMENT,
          "create_event_precheck",
          {
            userId: user.id,
          }
        );

        const { data: connectAccount, error: connectError } = await adminClient
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
