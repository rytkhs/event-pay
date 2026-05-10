import { randomUUID } from "crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { z } from "zod";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { resolveCurrentCommunityForServerAction } from "@core/community/current-community";
import {
  type ActionResult,
  fail,
  ok,
  toActionResultFromAppResult,
  zodFail,
} from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { logEventManagement } from "@core/logging/system-logger";
import { logSecurityEvent } from "@core/security/security-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import type { EventInsert, EventRow } from "@core/types/event";
import type { PaymentMethod } from "@core/types/statuses";
import { handleServerError } from "@core/utils/error-handler.server";
import { extractEventCreateFormData } from "@core/utils/form-data-extractors";
import { generateInviteToken } from "@core/utils/invite-token";
import { convertDatetimeLocalToUtc } from "@core/utils/timezone";
import { createEventSchema, type CreateEventInput } from "@core/validation/event";

import { getEventPayoutProfileReadiness } from "../services/payout-profile-readiness";

type CreateEventResult = ActionResult<EventRow>;

type FormDataFields = {
  title: string;
  date: string;
  fee: string;
  payment_methods: string[];
  location?: string;
  description?: string;
  capacity?: string;
  show_participant_count?: boolean;
  registration_deadline: string;
  payment_deadline?: string;
  allow_payment_after_deadline?: boolean;
  grace_period_days?: number;
};

type CurrentCommunityPayoutSnapshotRow = {
  current_payout_profile_id: string | null;
  id: string;
};

export async function createEventAction(formData: FormData): Promise<CreateEventResult> {
  const requestId = randomUUID();
  const actionLogger = logger.withContext({
    category: "event_management",
    action: "create_event",
    actor_type: "user",
    request_id: requestId,
  });

  actionLogger.info("Event creation action invoked", { outcome: "success" });

  try {
    const user = await getCurrentUserForServerAction();

    if (!user) {
      actionLogger.warn("Event creation attempted without authentication", {
        outcome: "failure",
      });

      // セキュリティログの記録
      const headersList = await headers();
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

      return fail("UNAUTHORIZED", {
        userMessage: "認証が必要です",
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
          outcome: "failure",
        });
        return zodFail(validationError, { userMessage: "入力が不正です" });
      }
      handleServerError("EVENT_OPERATION_FAILED", {
        category: "event_management",
        action: "create_event_validation_error",
        userId: user.id,
        additionalData: {
          error: validationError instanceof Error ? validationError.message : validationError,
          request_id: requestId,
        },
      });
      return fail("VALIDATION_ERROR", { userMessage: "入力が不正です" });
    }

    const currentCommunityResolutionResult = await resolveCurrentCommunityForServerAction();

    if (!currentCommunityResolutionResult.success) {
      return toActionResultFromAppResult(currentCommunityResolutionResult, {
        userMessage: "イベントの作成に必要なコミュニティ情報を取得できませんでした",
      });
    }

    if (!currentCommunityResolutionResult.data?.currentCommunity) {
      return fail("NOT_FOUND", {
        userMessage: "イベントを作成できるコミュニティが見つかりません",
      });
    }

    const currentCommunity = currentCommunityResolutionResult.data.currentCommunity;
    const authenticatedClient = await createServerActionSupabaseClient();

    const { data: currentCommunitySnapshot, error: currentCommunityError } =
      await authenticatedClient
        .from("communities")
        .select("id, current_payout_profile_id")
        .eq("id", currentCommunity.id)
        .eq("is_deleted", false)
        .maybeSingle<CurrentCommunityPayoutSnapshotRow>();

    if (currentCommunityError) {
      handleServerError("DATABASE_ERROR", {
        category: "event_management",
        action: "create_event_load_current_community_failed",
        userId: user.id,
        additionalData: {
          community_id: currentCommunity.id,
          error_code: currentCommunityError.code,
          error_message: currentCommunityError.message,
          request_id: requestId,
        },
      });
      return fail("DATABASE_ERROR", {
        userMessage: "イベントの作成に必要なコミュニティ情報の取得に失敗しました",
        retryable: true,
      });
    }

    if (!currentCommunitySnapshot) {
      return fail("NOT_FOUND", {
        userMessage: "イベントを作成できるコミュニティが見つかりません",
      });
    }

    const payoutProfileId = currentCommunitySnapshot.current_payout_profile_id ?? null;

    // オンライン決済の準備状態を current community の payout snapshot 候補から判定する
    {
      const fee = Number(rawData.fee);
      const wantsStripe = rawData.payment_methods.includes("stripe");

      if (fee > 0 && wantsStripe) {
        const payoutReadiness = await getEventPayoutProfileReadiness(
          authenticatedClient,
          payoutProfileId
        );

        if (!payoutReadiness.isReady) {
          actionLogger.warn(
            "Current community payout profile is not ready for paid event creation",
            {
              user_id: user.id,
              community_id: currentCommunity.id,
              payout_profile_id: payoutProfileId,
              outcome: "failure",
            }
          );
          return fail("VALIDATION_ERROR", {
            userMessage:
              payoutReadiness.userMessage ||
              "オンライン決済を利用するには受取先プロファイルの設定完了が必要です",
            fieldErrors: {
              payment_methods: [
                payoutReadiness.userMessage ||
                  "受取先プロファイルの設定を完了してください（本人確認）",
              ],
            },
          });
        }
      }
    }

    const eventId = randomUUID();
    const inviteToken = generateInviteToken();
    const eventData = buildEventData(validatedData, {
      communityId: currentCommunity.id,
      eventId,
      inviteToken,
      payoutProfileId,
      userId: user.id,
    });

    // 認証済みクライアントを使用（RLSポリシーで自分のイベント作成を許可）

    actionLogger.info("Attempting to insert event", {
      user_id: user.id,
      fee: eventData.fee,
      payment_methods: eventData.payment_methods,
      created_by: eventData.created_by,
      community_id: eventData.community_id,
      payout_profile_id: eventData.payout_profile_id,
      outcome: "success",
    });

    const { error: dbError } = await authenticatedClient.from("events").insert(eventData);

    if (dbError) {
      handleServerError("DATABASE_ERROR", {
        category: "event_management",
        action: "create_event_db_insert_fail",
        userId: user.id,
        additionalData: {
          error_code: dbError.code,
          error_message: dbError.message,
          hint: dbError.hint,
          request_id: requestId,
        },
      });
      return fail("DATABASE_ERROR", {
        userMessage: "イベントの作成に失敗しました",
        retryable: true,
        details: { dbError },
      });
    }

    const { data: createdEvent, error: createdEventLoadError } = await authenticatedClient
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (createdEventLoadError) {
      handleServerError("DATABASE_ERROR", {
        category: "event_management",
        action: "create_event_load_created_event_fail",
        userId: user.id,
        additionalData: {
          event_id: eventId,
          error_code: createdEventLoadError.code,
          error_message: createdEventLoadError.message,
          request_id: requestId,
        },
      });
      return fail("DATABASE_ERROR", {
        userMessage: "イベント作成後の取得に失敗しました",
        retryable: true,
      });
    }

    if (!createdEvent) {
      handleServerError("DATABASE_ERROR", {
        category: "event_management",
        action: "create_event_no_result",
        userId: user.id,
        additionalData: { request_id: requestId },
      });
      return fail("DATABASE_ERROR", {
        userMessage: "イベントの作成に失敗しました",
        retryable: true,
      });
    }

    actionLogger.info("Event created successfully", {
      user_id: user.id,
      event_id: createdEvent.id,
      outcome: "success",
    });

    // 監査ログ記録
    await logEventManagement({
      action: "event.create",
      message: `Event created: ${createdEvent.id}`,
      user_id: user.id,
      resource_id: createdEvent.id,
      outcome: "success",
      metadata: {
        community_id: currentCommunity.id,
        title: eventData.title,
        fee: eventData.fee,
        payment_methods: eventData.payment_methods,
        payout_profile_id: eventData.payout_profile_id,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/events");

    return ok(createdEvent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      handleServerError("EVENT_OPERATION_FAILED", {
        category: "event_management",
        action: "create_event_zod_error_catch",
        additionalData: { issues: error.issues, request_id: requestId },
      });
      return zodFail(error, { userMessage: "入力が不正です" });
    }
    handleServerError("EVENT_OPERATION_FAILED", {
      category: "event_management",
      action: "create_event_unexpected_error",
      additionalData: {
        error_message: error instanceof Error ? error.message : String(error),
        request_id: requestId,
      },
    });
    return fail("INTERNAL_ERROR", {
      userMessage: "予期しないエラーが発生しました",
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
  params: {
    communityId: string;
    eventId: string;
    inviteToken: string;
    payoutProfileId: string | null;
    userId: string;
  }
): EventInsert {
  const fee = Number(validatedData.fee);

  return {
    id: params.eventId,
    title: validatedData.title,
    date: convertDatetimeLocalToIso(validatedData.date),
    fee,
    // 無料イベント（fee=0）の場合は空配列を明示的に設定
    payment_methods: fee === 0 ? [] : (validatedData.payment_methods as PaymentMethod[]),
    location: validatedData.location ?? null,
    description: validatedData.description ?? null,
    capacity: parseCapacityLocal(validatedData.capacity),
    show_participant_count: Boolean(validatedData.show_participant_count),
    registration_deadline: convertDatetimeLocalToIso(validatedData.registration_deadline as string),
    // 無料イベント（fee=0）の場合はオンライン支払い期限も強制的にnullに設定
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
    created_by: params.userId,
    community_id: params.communityId,
    payout_profile_id: params.payoutProfileId,
    invite_token: params.inviteToken,
  };
}
