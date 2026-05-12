import "server-only";

import Stripe from "stripe";

import { AppError, errFrom, errResult, okResult, type AppResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { generateIdempotencyKey, getStripe } from "@core/stripe/client";
import { hasPostgrestCode } from "@core/supabase/postgrest-error-guards";
import type { AppSupabaseClient } from "@core/types/supabase";

import type {
  LatestPayoutRequest,
  PayoutBalance,
  PayoutPanelDisabledReason,
  PayoutPanelState,
  PayoutRequestStatus,
  RequestPayoutInput,
  RequestPayoutPayload,
  StripePayoutRequestStatus,
} from "../types/payout-request";

import { resolveCurrentCommunityPayoutProfile } from "./payout-profile-resolver";

type PayoutRequestRow = {
  id: string;
  amount: number;
  currency: string;
  status: PayoutRequestStatus;
  requested_at: string;
  arrival_date: string | null;
  failure_code: string | null;
  failure_message: string | null;
};

type PayoutEligibility = PayoutBalance & {
  canRequestPayout: boolean;
  disabledReason?: PayoutPanelDisabledReason;
};

const IN_PROGRESS_STATUSES: PayoutRequestStatus[] = ["requesting", "creation_unknown"];
const BLOCKED_EXTERNAL_ACCOUNT_STATUSES = new Set([
  "errored",
  "verification_failed",
  "tokenized_account_number_deactivated",
]);

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

function mapStripePayoutStatus(status: Stripe.Payout["status"]): StripePayoutRequestStatus | null {
  switch (status) {
    case "pending":
      return "pending";
    case "in_transit":
      return "in_transit";
    case "paid":
      return "paid";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
  }

  return null;
}

function isUnknownCreationError(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeConnectionError ||
    error instanceof Stripe.errors.StripeAPIError ||
    error instanceof Stripe.errors.StripeRateLimitError
  );
}

function getCardSourceAmount(balanceEntry: Stripe.Balance.Available | undefined): number {
  return balanceEntry?.source_types?.card ?? 0;
}

function isBankAccount(account: Stripe.ExternalAccount): account is Stripe.BankAccount {
  return account.object === "bank_account";
}

function findDefaultJpyBankAccount(accounts: {
  data: Stripe.ExternalAccount[];
}): Stripe.BankAccount | null {
  return (
    accounts.data
      .filter(isBankAccount)
      .find((account) => account.currency === "jpy" && account.default_for_currency === true) ??
    null
  );
}

function getDisabledReasonError(disabledReason: PayoutPanelDisabledReason): AppError {
  switch (disabledReason) {
    case "no_account":
      return new AppError("CONNECT_ACCOUNT_NOT_FOUND", {
        userMessage: "振込先の設定が見つかりません。",
        retryable: false,
      });
    case "payouts_disabled":
      return new AppError("CONNECT_ACCOUNT_RESTRICTED", {
        userMessage: "振込を実行できる状態ではありません。",
        retryable: false,
      });
    case "external_account_missing":
    case "external_account_unavailable":
      return new AppError("CONNECT_ACCOUNT_RESTRICTED", {
        userMessage: "振込先口座を確認してください。",
        retryable: false,
      });
    case "no_available_balance":
      return new AppError("INSUFFICIENT_BALANCE", {
        userMessage: "振込可能な残高がありません。",
        retryable: false,
      });
    case "request_in_progress":
      return new AppError("RESOURCE_CONFLICT", {
        userMessage: "処理中の振込リクエストがあります。",
        retryable: true,
      });
  }
}

function getMissingEligibilityDataError(): AppError {
  return new AppError("STRIPE_CONNECT_SERVICE_ERROR", {
    userMessage: "振込可否の確認に失敗しました。",
    retryable: true,
  });
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
    arrivalDate: row.arrival_date,
    failureCode: row.failure_code,
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
        availableAmount: getCardSourceAmount(availableJpy),
        pendingAmount: getCardSourceAmount(pendingJpy),
        currency: "jpy",
      });
    } catch (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }
  }

  private async getFreshPayoutEligibility(
    stripeAccountId: string,
    params: { hasInProgressRequest: boolean }
  ): Promise<AppResult<PayoutEligibility>> {
    try {
      const stripe = getStripe();
      const [account, externalAccounts, balanceResult] = await Promise.all([
        stripe.accounts.retrieve(stripeAccountId),
        stripe.accounts.listExternalAccounts(stripeAccountId, {
          object: "bank_account",
          limit: 100,
        }),
        this.getFreshPayoutBalance(stripeAccountId),
      ]);

      if (!balanceResult.success) {
        return balanceResult;
      }

      const defaultBankAccount = findDefaultJpyBankAccount(externalAccounts);
      const balance = balanceResult.data as PayoutBalance;
      const disabledReason = !account.payouts_enabled
        ? "payouts_disabled"
        : defaultBankAccount === null
          ? "external_account_missing"
          : BLOCKED_EXTERNAL_ACCOUNT_STATUSES.has(defaultBankAccount.status) ||
              !defaultBankAccount.available_payout_methods?.includes("standard")
            ? "external_account_unavailable"
            : balance.availableAmount <= 0
              ? "no_available_balance"
              : params.hasInProgressRequest
                ? "request_in_progress"
                : undefined;

      return okResult({
        ...balance,
        canRequestPayout: disabledReason === undefined,
        disabledReason,
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
      const hasInProgressRequest =
        latestRequest !== null && IN_PROGRESS_STATUSES.includes(latestRequest.status);
      const eligibilityResult = await this.getFreshPayoutEligibility(
        payoutProfile.stripe_account_id,
        { hasInProgressRequest }
      );
      if (!eligibilityResult.success) {
        return eligibilityResult;
      }
      if (eligibilityResult.data === undefined) {
        return errResult(getMissingEligibilityDataError());
      }
      const eligibility = eligibilityResult.data;

      return okResult({
        availableAmount: eligibility.availableAmount,
        pendingAmount: eligibility.pendingAmount,
        currency: eligibility.currency,
        latestRequest,
        canRequestPayout: eligibility.canRequestPayout,
        disabledReason: eligibility.disabledReason,
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
            userMessage: "振込先の設定が見つかりません。",
            retryable: false,
          })
        );
      }

      if (payoutProfile.owner_user_id !== params.userId) {
        return errResult(
          new AppError("FORBIDDEN", {
            userMessage: "この振込先を操作する権限がありません。",
            retryable: false,
          })
        );
      }

      const latestRequest = await this.getLatestRequest(payoutProfile.id);
      const hasInProgressRequest =
        latestRequest !== null && IN_PROGRESS_STATUSES.includes(latestRequest.status);
      const eligibilityResult = await this.getFreshPayoutEligibility(
        payoutProfile.stripe_account_id,
        { hasInProgressRequest }
      );
      if (!eligibilityResult.success) {
        return eligibilityResult;
      }
      if (eligibilityResult.data === undefined) {
        return errResult(getMissingEligibilityDataError());
      }
      const eligibility = eligibilityResult.data;

      if (!eligibility.canRequestPayout) {
        if (
          eligibility.disabledReason === "request_in_progress" &&
          latestRequest?.status === "creation_unknown"
        ) {
          return this.recoverCreationUnknown(payoutProfile, params);
        }
        return errResult(getDisabledReasonError(eligibility.disabledReason ?? "payouts_disabled"));
      }

      const amount = eligibility.availableAmount;

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
        if (hasPostgrestCode(insertError, "23505")) {
          return errResult(
            new AppError("RESOURCE_CONFLICT", {
              userMessage: "処理中の振込リクエストがあります。",
              cause: insertError,
              retryable: true,
            })
          );
        }
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

        const payoutStatus = mapStripePayoutStatus(payout.status);
        if (payoutStatus === null) {
          return errResult(
            new AppError("STRIPE_CONNECT_SERVICE_ERROR", {
              userMessage: "未対応の振込ステータスです。",
              retryable: true,
              details: { status: payout.status },
            })
          );
        }

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

        return okResult({
          payoutRequestId: inserted.id,
          stripePayoutId: payout.id,
          stripeAccountId: payoutProfile.stripe_account_id,
          amount,
          currency: "jpy",
          status: payoutStatus,
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
                ? "振込リクエストの処理状況を確認中です。しばらくしてから再度確認してください。"
                : "振込リクエストの作成に失敗しました。",
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
          userMessage: "対応する振込リクエストが見つかりません。",
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
    if (newStatus === null) {
      return errResult(
        new AppError("STRIPE_CONNECT_SERVICE_ERROR", {
          userMessage: "未対応の振込ステータスです。",
          retryable: true,
          details: { status: payout.status },
        })
      );
    }

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
          userMessage: "復旧対象の振込リクエストが見つかりません。",
          retryable: false,
        })
      );
    }

    const eligibilityResult = await this.getFreshPayoutEligibility(
      payoutProfile.stripe_account_id,
      {
        hasInProgressRequest: false,
      }
    );
    if (!eligibilityResult.success) {
      return eligibilityResult;
    }
    if (eligibilityResult.data === undefined) {
      return errResult(getMissingEligibilityDataError());
    }
    const eligibility = eligibilityResult.data;
    if (!eligibility.canRequestPayout) {
      return errResult(getDisabledReasonError(eligibility.disabledReason ?? "payouts_disabled"));
    }

    if (
      unknownRequest.amount !== eligibility.availableAmount ||
      unknownRequest.currency !== "jpy"
    ) {
      return errResult(
        new AppError("RESOURCE_CONFLICT", {
          userMessage: "残高が変動したため、前回の振込リクエストを復旧できません。",
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

      const payoutStatus = mapStripePayoutStatus(payout.status);
      if (payoutStatus === null) {
        return errResult(
          new AppError("STRIPE_CONNECT_SERVICE_ERROR", {
            userMessage: "未対応の振込ステータスです。",
            retryable: true,
            details: { status: payout.status },
          })
        );
      }

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

      return okResult({
        payoutRequestId: unknownRequest.id,
        stripePayoutId: payout.id,
        stripeAccountId: payoutProfile.stripe_account_id,
        amount: unknownRequest.amount,
        currency: "jpy",
        status: payoutStatus,
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
              ? "振込リクエストの処理状況を確認中です。しばらくしてから再度確認してください。"
              : "振込リクエストの復旧に失敗しました。",
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
      .select(
        "id, amount, currency, status, requested_at, arrival_date, failure_code, failure_message"
      )
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
    const status = mapStripePayoutStatus(payout.status);
    if (status === null) {
      return errResult(
        new AppError("STRIPE_CONNECT_SERVICE_ERROR", {
          userMessage: "未対応の振込ステータスです。",
          retryable: true,
          details: { status: payout.status },
        })
      );
    }

    const { error } = await this.supabase
      .from("payout_requests")
      .update({
        stripe_payout_id: payout.id,
        status,
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
