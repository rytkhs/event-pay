import "server-only";

import { revalidateTag } from "next/cache";

import Stripe from "stripe";

import { AppError, errFrom, errResult, okResult, type AppResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { generateIdempotencyKey, getStripe } from "@core/stripe/client";
import type { AppSupabaseClient } from "@core/types/supabase";

import type {
  LatestPayoutRequest,
  PayoutBalance,
  PayoutPanelState,
  PayoutRequestStatus,
  RequestPayoutInput,
  RequestPayoutPayload,
} from "../types/payout-request";

import { resolveCurrentCommunityPayoutProfile } from "./payout-profile-resolver";

type PayoutRequestRow = {
  id: string;
  amount: number;
  currency: string;
  status: PayoutRequestStatus;
  requested_at: string;
  failure_message: string | null;
};

const IN_PROGRESS_STATUSES: PayoutRequestStatus[] = ["requesting", "creation_unknown"];

/** paid/failed/canceled は終端ステータス。ここからの巻き戻しを制限する */
const TERMINAL_STATUSES: PayoutRequestStatus[] = ["paid", "failed", "canceled"];

/** paid → failed のみ許可（Stripe公式: paid に見えてから failed に変わる場合がある） */
const ALLOWED_TRANSITIONS: Partial<Record<PayoutRequestStatus, PayoutRequestStatus[]>> = {
  paid: ["paid", "failed"],
  failed: ["failed"],
  canceled: ["canceled"],
};

function toTimestamp(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

function mapStripePayoutStatus(status: Stripe.Payout["status"]): PayoutRequestStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return "created";
  }
}

function isUnknownCreationError(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeConnectionError ||
    error instanceof Stripe.errors.StripeAPIError ||
    error instanceof Stripe.errors.StripeRateLimitError
  );
}

function toLatestPayoutRequest(row: PayoutRequestRow | null): LatestPayoutRequest | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    amount: row.amount,
    currency: "jpy",
    status: row.status,
    requestedAt: row.requested_at,
    failureMessage: row.failure_message,
  };
}

export class PayoutRequestService {
  constructor(private readonly supabase: AppSupabaseClient<"public">) {}

  private get logger() {
    return logger.withContext({
      category: "stripe_connect",
      action: "payout_request_service",
    });
  }

  async getFreshPayoutBalance(stripeAccountId: string): Promise<AppResult<PayoutBalance>> {
    try {
      const balance = await getStripe().balance.retrieve({}, { stripeAccount: stripeAccountId });
      const availableJpy = balance.available.find((entry) => entry.currency === "jpy");
      const pendingJpy = balance.pending.find((entry) => entry.currency === "jpy");

      return okResult({
        availableAmount: availableJpy?.amount ?? 0,
        pendingAmount: pendingJpy?.amount ?? 0,
        currency: "jpy",
      });
    } catch (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }
  }

  async getPayoutPanelState(params: RequestPayoutInput): Promise<AppResult<PayoutPanelState>> {
    try {
      const { payoutProfile } = await resolveCurrentCommunityPayoutProfile(this.supabase, {
        communityId: params.communityId,
      });

      if (!payoutProfile) {
        return okResult({
          availableAmount: 0,
          pendingAmount: 0,
          currency: "jpy",
          latestRequest: null,
          canRequestPayout: false,
          disabledReason: "no_account",
        });
      }

      const latestRequest = await this.getLatestRequest(payoutProfile.id);
      const balanceResult = await this.getFreshPayoutBalance(payoutProfile.stripe_account_id);
      if (!balanceResult.success) {
        return balanceResult;
      }
      const balance = balanceResult.data as PayoutBalance;

      const hasInProgressRequest =
        latestRequest !== null && IN_PROGRESS_STATUSES.includes(latestRequest.status);

      const disabledReason = !payoutProfile.payouts_enabled
        ? "payouts_disabled"
        : hasInProgressRequest
          ? "request_in_progress"
          : balance.availableAmount <= 0
            ? "no_available_balance"
            : undefined;

      return okResult({
        ...balance,
        latestRequest,
        canRequestPayout: disabledReason === undefined,
        disabledReason,
      });
    } catch (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }
  }

  async requestPayout(params: RequestPayoutInput): Promise<AppResult<RequestPayoutPayload>> {
    try {
      const { payoutProfile } = await resolveCurrentCommunityPayoutProfile(this.supabase, {
        communityId: params.communityId,
      });

      if (!payoutProfile) {
        return errResult(
          new AppError("CONNECT_ACCOUNT_NOT_FOUND", {
            userMessage: "入金先の設定が見つかりません。",
            retryable: false,
          })
        );
      }

      if (payoutProfile.owner_user_id !== params.userId) {
        return errResult(
          new AppError("FORBIDDEN", {
            userMessage: "この入金先を操作する権限がありません。",
            retryable: false,
          })
        );
      }

      if (!payoutProfile.payouts_enabled) {
        return errResult(
          new AppError("CONNECT_ACCOUNT_RESTRICTED", {
            userMessage: "入金を実行できる状態ではありません。",
            retryable: false,
          })
        );
      }

      const latestRequest = await this.getLatestRequest(payoutProfile.id);
      if (latestRequest !== null && IN_PROGRESS_STATUSES.includes(latestRequest.status)) {
        if (latestRequest.status === "creation_unknown") {
          return this.recoverCreationUnknown(payoutProfile, params);
        }
        return errResult(
          new AppError("RESOURCE_CONFLICT", {
            userMessage: "処理中の入金リクエストがあります。",
            retryable: true,
          })
        );
      }

      const balanceResult = await this.getFreshPayoutBalance(payoutProfile.stripe_account_id);
      if (!balanceResult.success) {
        return balanceResult;
      }
      const balance = balanceResult.data as PayoutBalance;

      const amount = balance.availableAmount;
      if (amount <= 0) {
        return errResult(
          new AppError("INSUFFICIENT_BALANCE", {
            userMessage: "入金可能な残高がありません。",
            retryable: false,
          })
        );
      }

      const idempotencyKey = generateIdempotencyKey("payout");
      const { data: inserted, error: insertError } = await this.supabase
        .from("payout_requests")
        .insert({
          payout_profile_id: payoutProfile.id,
          community_id: params.communityId,
          requested_by: params.userId,
          stripe_account_id: payoutProfile.stripe_account_id,
          amount,
          currency: "jpy",
          status: "requesting",
          idempotency_key: idempotencyKey,
        })
        .select("id")
        .single<{ id: string }>();

      if (insertError) {
        return errFrom(insertError, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
      }

      try {
        const payout = await getStripe().payouts.create(
          {
            amount,
            currency: "jpy",
            source_type: "card",
            metadata: {
              payout_request_id: inserted.id,
              payout_profile_id: payoutProfile.id,
              community_id: params.communityId,
              requested_by: params.userId,
            },
          },
          {
            stripeAccount: payoutProfile.stripe_account_id,
            idempotencyKey,
          }
        );

        const updateResult = await this.updateRequestFromPayout(inserted.id, payout);
        if (!updateResult.success) {
          return updateResult;
        }

        this.logger.info("Payout request created", {
          payout_request_id: inserted.id,
          payout_id: payout.id,
          amount,
          stripe_account_id: payoutProfile.stripe_account_id,
          outcome: "success",
        });

        revalidateTag(`stripe-balance-${payoutProfile.stripe_account_id}`);

        return okResult({
          payoutRequestId: inserted.id,
          stripePayoutId: payout.id,
          stripeAccountId: payoutProfile.stripe_account_id,
          amount,
          currency: "jpy",
          status: "created",
        });
      } catch (stripeError) {
        const status: PayoutRequestStatus = isUnknownCreationError(stripeError)
          ? "creation_unknown"
          : "failed";

        await this.supabase
          .from("payout_requests")
          .update({
            status,
            failure_code:
              stripeError instanceof Stripe.errors.StripeError ? stripeError.code : null,
            failure_message:
              stripeError instanceof Error ? stripeError.message : "Payout creation failed",
          })
          .eq("id", inserted.id);

        return errResult(
          new AppError("STRIPE_CONNECT_SERVICE_ERROR", {
            userMessage:
              status === "creation_unknown"
                ? "入金リクエストの処理状況を確認中です。しばらくしてから再度確認してください。"
                : "入金リクエストの作成に失敗しました。",
            cause: stripeError,
            retryable: status === "creation_unknown",
            details: { payoutRequestId: inserted.id, status },
          })
        );
      }
    } catch (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }
  }

  async syncPayoutFromWebhook(
    payout: Stripe.Payout,
    stripeAccountId: string
  ): Promise<AppResult<void>> {
    const payoutRequestId =
      typeof payout.metadata?.payout_request_id === "string"
        ? payout.metadata.payout_request_id
        : null;

    // 1. 対象の payout_request を特定
    const findQuery = payoutRequestId
      ? this.supabase
          .from("payout_requests")
          .select("id, stripe_account_id, stripe_payout_id, status")
          .eq("id", payoutRequestId)
          .maybeSingle()
      : this.supabase
          .from("payout_requests")
          .select("id, stripe_account_id, stripe_payout_id, status")
          .eq("stripe_payout_id", payout.id)
          .maybeSingle();

    const { data: existing, error: findError } = await findQuery;
    if (findError) {
      return errFrom(findError, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }

    // 2. 未知の payout_request → リトライ不要の失敗
    if (!existing) {
      return errResult(
        new AppError("PAYOUT_REQUEST_NOT_FOUND", {
          userMessage: "対応する入金リクエストが見つかりません。",
          retryable: false,
        })
      );
    }

    // 3. stripe_account_id 照合
    if (existing.stripe_account_id !== stripeAccountId) {
      return errResult(
        new AppError("STRIPE_ACCOUNT_MISMATCH", {
          userMessage: "Stripe アカウントが一致しません。",
          retryable: false,
        })
      );
    }

    // 4. stripe_payout_id 矛盾チェック
    if (existing.stripe_payout_id !== null && existing.stripe_payout_id !== payout.id) {
      return errResult(
        new AppError("PAYOUT_ID_MISMATCH", {
          userMessage: "Payout ID が一致しません。",
          retryable: false,
        })
      );
    }

    // 5. ステータス遷移ガード
    const currentStatus = existing.status as PayoutRequestStatus;
    const newStatus = mapStripePayoutStatus(payout.status);

    if (TERMINAL_STATUSES.includes(currentStatus)) {
      const allowed = ALLOWED_TRANSITIONS[currentStatus];
      if (!allowed?.includes(newStatus)) {
        // 巻き戻し防止: 現在のステータスを維持して成功扱い（冪等）
        return okResult(undefined);
      }
    }

    // 6. 更新実行
    const { error: updateError } = await this.supabase
      .from("payout_requests")
      .update({
        stripe_payout_id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        status: newStatus,
        arrival_date: toTimestamp(payout.arrival_date),
        stripe_created_at: toTimestamp(payout.created),
        failure_code: payout.failure_code,
        failure_message: payout.failure_message,
      })
      .eq("id", existing.id);

    if (updateError) {
      return errFrom(updateError, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }

    return okResult(undefined);
  }

  private async recoverCreationUnknown(
    payoutProfile: { id: string; stripe_account_id: string },
    params: RequestPayoutInput
  ): Promise<AppResult<RequestPayoutPayload>> {
    const unknownRequest = await this.getCreationUnknownRequest(payoutProfile.id);
    if (!unknownRequest) {
      return errResult(
        new AppError("PAYOUT_REQUEST_NOT_FOUND", {
          userMessage: "復旧対象の入金リクエストが見つかりません。",
          retryable: false,
        })
      );
    }

    const balanceResult = await this.getFreshPayoutBalance(payoutProfile.stripe_account_id);
    if (!balanceResult.success) {
      return balanceResult;
    }
    const balance = balanceResult.data as PayoutBalance;

    if (unknownRequest.amount !== balance.availableAmount || unknownRequest.currency !== "jpy") {
      return errResult(
        new AppError("RESOURCE_CONFLICT", {
          userMessage: "残高が変動したため、前回の入金リクエストを復旧できません。",
          retryable: false,
        })
      );
    }

    try {
      const payout = await getStripe().payouts.create(
        {
          amount: unknownRequest.amount,
          currency: "jpy",
          source_type: "card",
          metadata: {
            payout_request_id: unknownRequest.id,
            payout_profile_id: payoutProfile.id,
            community_id: params.communityId,
            requested_by: params.userId,
          },
        },
        {
          stripeAccount: payoutProfile.stripe_account_id,
          idempotencyKey: unknownRequest.idempotency_key,
        }
      );

      const updateResult = await this.updateRequestFromPayout(unknownRequest.id, payout);
      if (!updateResult.success) {
        return updateResult;
      }

      this.logger.info("Payout request recovered from creation_unknown", {
        payout_request_id: unknownRequest.id,
        payout_id: payout.id,
        amount: unknownRequest.amount,
        stripe_account_id: payoutProfile.stripe_account_id,
        outcome: "success",
      });

      revalidateTag(`stripe-balance-${payoutProfile.stripe_account_id}`);

      return okResult({
        payoutRequestId: unknownRequest.id,
        stripePayoutId: payout.id,
        stripeAccountId: payoutProfile.stripe_account_id,
        amount: unknownRequest.amount,
        currency: "jpy",
        status: "created",
      });
    } catch (stripeError) {
      const status: PayoutRequestStatus = isUnknownCreationError(stripeError)
        ? "creation_unknown"
        : "failed";

      await this.supabase
        .from("payout_requests")
        .update({
          status,
          failure_code: stripeError instanceof Stripe.errors.StripeError ? stripeError.code : null,
          failure_message:
            stripeError instanceof Error ? stripeError.message : "Payout recovery failed",
        })
        .eq("id", unknownRequest.id);

      return errResult(
        new AppError("STRIPE_CONNECT_SERVICE_ERROR", {
          userMessage:
            status === "creation_unknown"
              ? "入金リクエストの処理状況を確認中です。しばらくしてから再度確認してください。"
              : "入金リクエストの復旧に失敗しました。",
          cause: stripeError,
          retryable: status === "creation_unknown",
          details: { payoutRequestId: unknownRequest.id, status },
        })
      );
    }
  }

  private async getCreationUnknownRequest(
    payoutProfileId: string
  ): Promise<{ id: string; amount: number; currency: string; idempotency_key: string } | null> {
    const { data, error } = await this.supabase
      .from("payout_requests")
      .select("id, amount, currency, idempotency_key")
      .eq("payout_profile_id", payoutProfileId)
      .eq("status", "creation_unknown")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; amount: number; currency: string; idempotency_key: string }>();

    if (error) {
      throw error;
    }

    return data ?? null;
  }

  private async getLatestRequest(payoutProfileId: string): Promise<LatestPayoutRequest | null> {
    const { data, error } = await this.supabase
      .from("payout_requests")
      .select("id, amount, currency, status, requested_at, failure_message")
      .eq("payout_profile_id", payoutProfileId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle<PayoutRequestRow>();

    if (error) {
      throw error;
    }

    return toLatestPayoutRequest(data ?? null);
  }

  private async updateRequestFromPayout(
    payoutRequestId: string,
    payout: Stripe.Payout
  ): Promise<AppResult<void>> {
    const { error } = await this.supabase
      .from("payout_requests")
      .update({
        stripe_payout_id: payout.id,
        status: mapStripePayoutStatus(payout.status),
        arrival_date: toTimestamp(payout.arrival_date),
        stripe_created_at: toTimestamp(payout.created),
        failure_code: payout.failure_code,
        failure_message: payout.failure_message,
      })
      .eq("id", payoutRequestId);

    if (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }

    return okResult(undefined);
  }
}
