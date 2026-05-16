import "server-only";

import Stripe from "stripe";

import { AppError, errFrom, errResult, okResult, type AppResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { generateIdempotencyKey, getStripe } from "@core/stripe/client";
import { FeeConfigService } from "@core/stripe/fee-config/service";
import { hasPostgrestCode } from "@core/supabase/postgrest-error-guards";
import type { AppSupabaseClient } from "@core/types/supabase";

import type {
  LatestPayoutRequest,
  PayoutBalance,
  PayoutPanelDisabledReason,
  PayoutPanelState,
  PayoutRequestStatus,
  PayoutSystemFeeState,
  RequestPayoutInput,
  RequestPayoutPayload,
  StripePayoutRequestStatus,
} from "../types/payout-request";

import { resolveCurrentCommunityPayoutProfile } from "./payout-profile-resolver";

type PayoutRequestRow = {
  id: string;
  amount: number;
  gross_amount: number;
  currency: string;
  status: PayoutRequestStatus;
  system_fee_amount: number;
  system_fee_state: PayoutSystemFeeState;
  requested_at: string;
  arrival_date: string | null;
  failure_code: string | null;
  failure_message: string | null;
};

type PayoutEligibility = PayoutBalance & {
  canRequestPayout: boolean;
  disabledReason?: PayoutPanelDisabledReason;
};

type PayoutProfileForPayout = {
  id: string;
  owner_user_id: string;
  stripe_account_id: string;
};

const IN_PROGRESS_STATUSES: PayoutRequestStatus[] = [
  "requesting",
  "creation_unknown",
  "manual_review_required",
];
const IDEMPOTENCY_KEY_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPIRED_IDEMPOTENCY_FAILURE_CODE = "idempotency_key_expired";
const PAYOUT_CREATION_FAILED_AFTER_FEE_COLLECTED = "payout_creation_failed_after_fee_collected";
const ACCOUNT_DEBIT_TRANSFER_ID_MISSING = "account_debit_transfer_id_missing";
const PAYOUT_FEE_GRACE_REGISTERED_BEFORE = "2026-05-17T00:00:00+09:00";
const PAYOUT_FEE_GRACE_ENDS_AT = "2026-09-01T00:00:00+09:00";
const SYSTEM_FEE_CREATION_UNKNOWN_MESSAGE =
  "振込手数料回収の処理状況を確認中です。確認完了まで新しい振込は実行できません。";
const ACCOUNT_DEBIT_TRANSFER_ID_MISSING_MESSAGE =
  "振込手数料回収のTransfer IDを確認できませんでした。";
const MANUAL_REVIEW_REQUIRED_MESSAGE =
  "Stripe idempotency key の保証期間を超過したため、振込状況の手動確認が必要です。";
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

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
    error instanceof Stripe.errors.StripeAPIError
  );
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Stripe.errors.StripeRateLimitError;
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

function getExpandableId(value: string | { id?: string } | null | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }
  return typeof value?.id === "string" ? value.id : null;
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
    case "below_payout_fee":
      return new AppError("INSUFFICIENT_BALANCE", {
        userMessage: "振込可能額が最小振込額を下回っています。",
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
    grossAmount: row.gross_amount,
    currency: "jpy",
    status: row.status,
    systemFeeAmount: row.system_fee_amount,
    systemFeeState: row.system_fee_state,
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

  private async getFreshPayoutBalanceWithFeeAmount(
    stripeAccountId: string,
    payoutRequestFeeAmount: number
  ): Promise<PayoutBalance> {
    const balance = await getStripe().balance.retrieve({}, { stripeAccount: stripeAccountId });
    const availableJpy = balance.available.find((entry) => entry.currency === "jpy");
    const pendingJpy = balance.pending.find((entry) => entry.currency === "jpy");
    const availableAmount = getCardSourceAmount(availableJpy);

    return {
      availableAmount,
      pendingAmount: getCardSourceAmount(pendingJpy),
      currency: "jpy",
      payoutRequestFeeAmount,
      payoutAmount: Math.max(availableAmount - payoutRequestFeeAmount, 0),
    };
  }

  async getFreshPayoutBalance(stripeAccountId: string): Promise<AppResult<PayoutBalance>> {
    try {
      const feeConfig = await new FeeConfigService(this.supabase).getConfig();
      return okResult(
        await this.getFreshPayoutBalanceWithFeeAmount(
          stripeAccountId,
          feeConfig.payoutRequestFeeAmount
        )
      );
    } catch (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }
  }

  private async resolvePayoutRequestFeeAmount(params: {
    ownerUserId: string;
    configuredFeeAmount: number;
    now?: Date;
  }): Promise<AppResult<number>> {
    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("created_at")
        .eq("id", params.ownerUserId)
        .single<{ created_at: string }>();

      if (error) {
        return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
      }

      const userCreatedAt = new Date(data.created_at).getTime();
      const registeredBefore = new Date(PAYOUT_FEE_GRACE_REGISTERED_BEFORE).getTime();
      const graceEndsAt = new Date(PAYOUT_FEE_GRACE_ENDS_AT).getTime();
      const now = params.now ?? new Date();
      const isGracePeriodUser =
        Number.isFinite(userCreatedAt) &&
        userCreatedAt < registeredBefore &&
        now.getTime() < graceEndsAt;

      return okResult(isGracePeriodUser ? 0 : params.configuredFeeAmount);
    } catch (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }
  }

  private async getFreshPayoutPrerequisiteDisabledReason(
    stripeAccountId: string
  ): Promise<AppResult<PayoutPanelDisabledReason | undefined>> {
    try {
      const stripe = getStripe();
      const [account, externalAccounts] = await Promise.all([
        stripe.accounts.retrieve(stripeAccountId),
        stripe.accounts.listExternalAccounts(stripeAccountId, {
          object: "bank_account",
          limit: 100,
        }),
      ]);

      const defaultBankAccount = findDefaultJpyBankAccount(externalAccounts);
      const disabledReason = !account.payouts_enabled
        ? "payouts_disabled"
        : defaultBankAccount === null
          ? "external_account_missing"
          : BLOCKED_EXTERNAL_ACCOUNT_STATUSES.has(defaultBankAccount.status) ||
              !defaultBankAccount.available_payout_methods?.includes("standard")
            ? "external_account_unavailable"
            : undefined;

      return okResult(disabledReason);
    } catch (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }
  }

  private async getFreshPayoutEligibility(
    payoutProfile: PayoutProfileForPayout,
    params: { hasInProgressRequest: boolean }
  ): Promise<AppResult<PayoutEligibility>> {
    try {
      const [prerequisiteResult, feeConfig] = await Promise.all([
        this.getFreshPayoutPrerequisiteDisabledReason(payoutProfile.stripe_account_id),
        new FeeConfigService(this.supabase).getConfig(),
      ]);

      if (!prerequisiteResult.success) {
        return prerequisiteResult;
      }

      const feeAmountResult = await this.resolvePayoutRequestFeeAmount({
        ownerUserId: payoutProfile.owner_user_id,
        configuredFeeAmount: feeConfig.payoutRequestFeeAmount,
      });
      if (!feeAmountResult.success) {
        return feeAmountResult;
      }
      if (feeAmountResult.data === undefined) {
        return errResult(getMissingEligibilityDataError());
      }

      const balanceResult = await this.getFreshPayoutBalanceWithFeeAmount(
        payoutProfile.stripe_account_id,
        feeAmountResult.data
      );
      const balance = balanceResult as PayoutBalance;
      const minimumRequiredAmount = balance.payoutRequestFeeAmount + feeConfig.minPayoutAmount;
      const disabledReason =
        prerequisiteResult.data ??
        (params.hasInProgressRequest
          ? "request_in_progress"
          : balance.availableAmount <= 0
            ? "no_available_balance"
            : balance.availableAmount < minimumRequiredAmount
              ? "below_payout_fee"
            : undefined);

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
          payoutRequestFeeAmount: 0,
          payoutAmount: 0,
          latestRequest: null,
          canRequestPayout: false,
          disabledReason: "no_account",
        });
      }

      let [latestRequest, activeRequest] = await Promise.all([
        this.getLatestRequest(payoutProfile.id),
        this.getLatestActiveRequest(payoutProfile.id),
      ]);

      if (
        activeRequest?.status === "creation_unknown" &&
        this.isCreationUnknownExpired(activeRequest)
      ) {
        const markResult = await this.markCreationUnknownManualReviewRequired(
          activeRequest.id,
          activeRequest.systemFeeState
        );
        if (!markResult.success) {
          return markResult;
        }

        if (markResult.data) {
          latestRequest = {
            ...activeRequest,
            status: "manual_review_required",
            failureCode: EXPIRED_IDEMPOTENCY_FAILURE_CODE,
            failureMessage: MANUAL_REVIEW_REQUIRED_MESSAGE,
          };
          activeRequest = latestRequest;
        } else {
          [latestRequest, activeRequest] = await Promise.all([
            this.getLatestRequest(payoutProfile.id),
            this.getLatestActiveRequest(payoutProfile.id),
          ]);
        }
      }

      const hasInProgressRequest =
        activeRequest !== null && IN_PROGRESS_STATUSES.includes(activeRequest.status);
      const eligibilityResult = await this.getFreshPayoutEligibility(payoutProfile, {
        hasInProgressRequest,
      });
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
        payoutRequestFeeAmount: eligibility.payoutRequestFeeAmount,
        payoutAmount: eligibility.payoutAmount,
        latestRequest: activeRequest ?? latestRequest,
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

      const activeRequest = await this.getLatestActiveRequest(payoutProfile.id);
      if (activeRequest?.status === "creation_unknown") {
        return this.recoverCreationUnknown(payoutProfile, params);
      }
      if (activeRequest?.status === "manual_review_required") {
        return errResult(
          new AppError("RESOURCE_CONFLICT", {
            userMessage:
              "前回の振込リクエストの状況確認が必要です。確認完了まで新しい振込は実行できません。",
            retryable: false,
            details: { payoutRequestId: activeRequest.id, status: activeRequest.status },
          })
        );
      }
      if (activeRequest?.status === "requesting") {
        return errResult(
          new AppError("RESOURCE_CONFLICT", {
            userMessage: "処理中の振込リクエストがあります。",
            retryable: true,
            details: { payoutRequestId: activeRequest.id, status: activeRequest.status },
          })
        );
      }

      const eligibilityResult = await this.getFreshPayoutEligibility(payoutProfile, {
        hasInProgressRequest: false,
      });
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

      const grossAmount = eligibility.availableAmount;
      const systemFeeAmount = eligibility.payoutRequestFeeAmount;
      const amount = eligibility.payoutAmount;
      const shouldCollectSystemFee = systemFeeAmount > 0;

      const idempotencyKey = generateIdempotencyKey("payout");
      const systemFeeIdempotencyKey = shouldCollectSystemFee
        ? generateIdempotencyKey("payout_fee")
        : null;
      const { data: inserted, error: insertError } = await this.supabase
        .from("payout_requests")
        .insert({
          payout_profile_id: payoutProfile.id,
          community_id: params.communityId,
          requested_by: params.userId,
          stripe_account_id: payoutProfile.stripe_account_id,
          amount,
          gross_amount: grossAmount,
          currency: "jpy",
          system_fee_amount: systemFeeAmount,
          system_fee_idempotency_key: systemFeeIdempotencyKey,
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

      return this.createStripePayoutAndPersist({
        payoutRequestId: inserted.id,
        payoutProfile,
        communityId: params.communityId,
        userId: params.userId,
        amount,
        idempotencyKey,
        systemFeeAmount,
        systemFeeIdempotencyKey,
        systemFeeState: "not_started",
        shouldCollectSystemFee,
        successLogMessage: "Payout request created",
        failureMessageFallback: "Payout creation failed",
        failedUserMessage: "振込リクエストの作成に失敗しました。",
      });
    } catch (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }
  }

  async syncPayoutFromWebhook(
    payout: Stripe.Payout,
    stripeAccountId: string
  ): Promise<AppResult<void, { reason?: string; payoutId?: string }>> {
    const payoutRequestId =
      typeof payout.metadata?.payout_request_id === "string"
        ? payout.metadata.payout_request_id
        : null;
    const hasValidPayoutRequestId = payoutRequestId !== null && isUuid(payoutRequestId);

    // 1. 対象の payout_request を特定
    const findQuery = hasValidPayoutRequestId
      ? this.supabase
          .from("payout_requests")
          .select("id, stripe_account_id, stripe_payout_id, status, failure_code")
          .eq("id", payoutRequestId)
          .maybeSingle()
      : this.supabase
          .from("payout_requests")
          .select("id, stripe_account_id, stripe_payout_id, status, failure_code")
          .eq("stripe_payout_id", payout.id)
          .maybeSingle();

    const { data: existing, error: findError } = await findQuery;
    if (findError) {
      return errFrom(findError, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }

    // 2. 未知の payout_request → アプリ外payoutとしてACKする
    if (!existing) {
      return okResult(undefined, {
        reason: "untracked_payout_skipped",
        payoutId: payout.id,
      });
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

    const canRecoverExpiredCreationUnknown =
      currentStatus === "failed" &&
      existing.failure_code === EXPIRED_IDEMPOTENCY_FAILURE_CODE &&
      existing.stripe_payout_id === null;

    if (TERMINAL_STATUSES.includes(currentStatus) && !canRecoverExpiredCreationUnknown) {
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
    payoutProfile: PayoutProfileForPayout,
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

    if (this.isCreationUnknownExpired({ requestedAt: unknownRequest.requested_at })) {
      const markResult = await this.markCreationUnknownManualReviewRequired(
        unknownRequest.id,
        unknownRequest.system_fee_state
      );
      if (!markResult.success) {
        return markResult;
      }
      if (!markResult.data) {
        return errResult(
          new AppError("RESOURCE_CONFLICT", {
            userMessage: "前回の振込リクエストの状況が更新されました。画面を更新してください。",
            retryable: false,
            details: {
              payoutRequestId: unknownRequest.id,
              status: "updated",
            },
          })
        );
      }

      return errResult(
        new AppError("RESOURCE_CONFLICT", {
          userMessage:
            "前回の振込リクエストは自動復旧できませんでした。確認完了まで新しい振込は実行できません。",
          retryable: false,
          details: {
            payoutRequestId: unknownRequest.id,
            failureCode: EXPIRED_IDEMPOTENCY_FAILURE_CODE,
            status: "manual_review_required",
          },
        })
      );
    }

    const prerequisiteResult = await this.getFreshPayoutPrerequisiteDisabledReason(
      payoutProfile.stripe_account_id
    );
    if (!prerequisiteResult.success) {
      return prerequisiteResult;
    }
    if (prerequisiteResult.data !== undefined) {
      return errResult(getDisabledReasonError(prerequisiteResult.data));
    }

    if (unknownRequest.currency !== "jpy") {
      return errResult(
        new AppError("RESOURCE_CONFLICT", {
          userMessage: "前回の振込リクエストを復旧できません。",
          retryable: false,
        })
      );
    }

    return this.createStripePayoutAndPersist({
      payoutRequestId: unknownRequest.id,
      payoutProfile,
      communityId: params.communityId,
      userId: params.userId,
      amount: unknownRequest.amount,
      idempotencyKey: unknownRequest.idempotency_key,
      systemFeeAmount: unknownRequest.system_fee_amount,
      systemFeeIdempotencyKey: unknownRequest.system_fee_idempotency_key,
      systemFeeState: unknownRequest.system_fee_state,
      shouldCollectSystemFee:
        unknownRequest.system_fee_state !== "succeeded" && unknownRequest.system_fee_amount > 0,
      successLogMessage: "Payout request recovered from creation_unknown",
      failureMessageFallback: "Payout recovery failed",
      failedUserMessage: "振込リクエストの復旧に失敗しました。",
    });
  }

  private async createStripePayoutAndPersist(params: {
    payoutRequestId: string;
    payoutProfile: PayoutProfileForPayout;
    communityId: string;
    userId: string;
    amount: number;
    idempotencyKey: string;
    systemFeeAmount: number;
    systemFeeIdempotencyKey: string | null;
    systemFeeState: PayoutSystemFeeState;
    shouldCollectSystemFee: boolean;
    successLogMessage: string;
    failureMessageFallback: string;
    failedUserMessage: string;
  }): Promise<AppResult<RequestPayoutPayload>> {
    let systemFeeCollected = !params.shouldCollectSystemFee && params.systemFeeAmount > 0;

    try {
      if (params.shouldCollectSystemFee) {
        const systemFeeResult = await this.collectSystemFee({
          payoutRequestId: params.payoutRequestId,
          payoutProfile: params.payoutProfile,
          communityId: params.communityId,
          userId: params.userId,
          amount: params.systemFeeAmount,
          idempotencyKey:
            params.systemFeeIdempotencyKey ?? generateIdempotencyKey("payout_fee"),
          expectedSystemFeeState: params.systemFeeState,
        });
        if (!systemFeeResult.success) {
          return systemFeeResult;
        }
        systemFeeCollected = true;
      }

      const payout = await getStripe().payouts.create(
        {
          amount: params.amount,
          currency: "jpy",
          source_type: "card",
          metadata: {
            payout_request_id: params.payoutRequestId,
            payout_profile_id: params.payoutProfile.id,
            community_id: params.communityId,
            requested_by: params.userId,
          },
        },
        {
          stripeAccount: params.payoutProfile.stripe_account_id,
          idempotencyKey: params.idempotencyKey,
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

      const updateResult = await this.updateRequestFromPayout(params.payoutRequestId, payout);
      if (!updateResult.success) {
        return updateResult;
      }

      this.logger.info(params.successLogMessage, {
        payout_request_id: params.payoutRequestId,
        payout_id: payout.id,
        amount: params.amount,
        stripe_account_id: params.payoutProfile.stripe_account_id,
        outcome: "success",
      });

      return okResult({
        payoutRequestId: params.payoutRequestId,
        stripePayoutId: payout.id,
        stripeAccountId: params.payoutProfile.stripe_account_id,
        amount: params.amount,
        grossAmount: params.amount + params.systemFeeAmount,
        systemFeeAmount: params.systemFeeAmount,
        systemFeeState: systemFeeCollected ? "succeeded" : "not_started",
        currency: "jpy",
        status: payoutStatus,
      });
    } catch (stripeError) {
      return this.markPayoutCreationFailure({
        payoutRequestId: params.payoutRequestId,
        stripeError,
        systemFeeCollected,
        failureMessageFallback: params.failureMessageFallback,
        failedUserMessage: params.failedUserMessage,
      });
    }
  }

  private async collectSystemFee(params: {
    payoutRequestId: string;
    payoutProfile: PayoutProfileForPayout;
    communityId: string;
    userId: string;
    amount: number;
    idempotencyKey: string;
    expectedSystemFeeState: PayoutSystemFeeState;
  }): Promise<AppResult<void>> {
    if (params.amount <= 0) {
      return okResult(undefined);
    }

    const markStartedResult = await this.markSystemFeeCollectionStarted({
      payoutRequestId: params.payoutRequestId,
      expectedSystemFeeState: params.expectedSystemFeeState,
    });
    if (!markStartedResult.success) {
      return markStartedResult;
    }

    try {
      const charge = await getStripe().charges.create(
        {
          amount: params.amount,
          currency: "jpy",
          expand: ["source_transfer"],
          source: params.payoutProfile.stripe_account_id,
          metadata: {
            payout_request_id: params.payoutRequestId,
            payout_profile_id: params.payoutProfile.id,
            community_id: params.communityId,
            requested_by: params.userId,
            purpose: "payout_request_system_fee",
          },
        },
        { idempotencyKey: params.idempotencyKey }
      );
      const sourceTransferId = getExpandableId(charge.source_transfer);

      if (sourceTransferId === null) {
        const { error } = await this.supabase
          .from("payout_requests")
          .update({
            status: "manual_review_required",
            system_fee_state: "manual_review_required",
            stripe_account_debit_payment_id: charge.id,
            system_fee_failure_code: ACCOUNT_DEBIT_TRANSFER_ID_MISSING,
            system_fee_failure_message: ACCOUNT_DEBIT_TRANSFER_ID_MISSING_MESSAGE,
            failure_code: ACCOUNT_DEBIT_TRANSFER_ID_MISSING,
            failure_message: ACCOUNT_DEBIT_TRANSFER_ID_MISSING_MESSAGE,
          })
          .eq("id", params.payoutRequestId);

        if (error) {
          return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
        }

        this.logger.error("Payout system fee collected without source transfer id", {
          payout_request_id: params.payoutRequestId,
          stripe_account_debit_payment_id: charge.id,
          stripe_account_id: params.payoutProfile.stripe_account_id,
          outcome: "failure",
        });

        return errResult(
          new AppError("STRIPE_CONNECT_SERVICE_ERROR", {
            userMessage:
              "振込手数料の回収状況を確認できませんでした。確認完了まで新しい振込は実行できません。",
            retryable: false,
            details: {
              payoutRequestId: params.payoutRequestId,
              stripeAccountDebitPaymentId: charge.id,
              status: "manual_review_required",
            },
          })
        );
      }

      const { error } = await this.supabase
        .from("payout_requests")
        .update({
          system_fee_state: "succeeded",
          stripe_account_debit_payment_id: charge.id,
          stripe_account_debit_transfer_id: sourceTransferId,
          system_fee_failure_code: null,
          system_fee_failure_message: null,
        })
        .eq("id", params.payoutRequestId);

      if (error) {
        return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
      }

      this.logger.info("Payout system fee collected", {
        payout_request_id: params.payoutRequestId,
        stripe_account_debit_payment_id: charge.id,
        stripe_account_debit_transfer_id: sourceTransferId,
        amount: params.amount,
        stripe_account_id: params.payoutProfile.stripe_account_id,
        outcome: "success",
      });

      return okResult(undefined);
    } catch (stripeError) {
      return this.markSystemFeeCollectionFailure({
        payoutRequestId: params.payoutRequestId,
        stripeError,
      });
    }
  }

  private async markSystemFeeCollectionStarted(params: {
    payoutRequestId: string;
    expectedSystemFeeState: PayoutSystemFeeState;
  }): Promise<AppResult<void>> {
    if (
      params.expectedSystemFeeState !== "not_started" &&
      params.expectedSystemFeeState !== "creation_unknown"
    ) {
      return errResult(
        new AppError("RESOURCE_CONFLICT", {
          userMessage: "前回の振込リクエストの状況が更新されました。画面を更新してください。",
          retryable: false,
          details: {
            payoutRequestId: params.payoutRequestId,
            systemFeeState: params.expectedSystemFeeState,
          },
        })
      );
    }

    const expectedStatus =
      params.expectedSystemFeeState === "not_started" ? "requesting" : "creation_unknown";
    const { data, error } = await this.supabase
      .from("payout_requests")
      .update({
        status: "creation_unknown",
        system_fee_state: "creation_unknown",
        system_fee_failure_code: null,
        system_fee_failure_message: null,
        failure_code: null,
        failure_message: null,
      })
      .eq("id", params.payoutRequestId)
      .eq("status", expectedStatus)
      .eq("system_fee_state", params.expectedSystemFeeState)
      .select("id");

    if (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }

    if ((data?.length ?? 0) === 0) {
      return errResult(
        new AppError("RESOURCE_CONFLICT", {
          userMessage: "前回の振込リクエストの状況が更新されました。画面を更新してください。",
          retryable: false,
          details: {
            payoutRequestId: params.payoutRequestId,
            status: "updated",
          },
        })
      );
    }

    return okResult(undefined);
  }

  private async markSystemFeeCollectionFailure(params: {
    payoutRequestId: string;
    stripeError: unknown;
  }): Promise<AppResult<void>> {
    const status: PayoutRequestStatus = isUnknownCreationError(params.stripeError)
      ? "creation_unknown"
      : "failed";
    const systemFeeState: PayoutSystemFeeState =
      status === "creation_unknown" ? "creation_unknown" : "failed";
    const retryable = status === "creation_unknown" || isRateLimitError(params.stripeError);

    const { error } = await this.supabase
      .from("payout_requests")
      .update({
        status,
        system_fee_state: systemFeeState,
        system_fee_failure_code:
          params.stripeError instanceof Stripe.errors.StripeError ? params.stripeError.code : null,
        system_fee_failure_message:
          params.stripeError instanceof Error
            ? params.stripeError.message
            : "System fee collection failed",
        failure_code:
          params.stripeError instanceof Stripe.errors.StripeError ? params.stripeError.code : null,
        failure_message:
          params.stripeError instanceof Error
            ? params.stripeError.message
            : "System fee collection failed",
      })
      .eq("id", params.payoutRequestId);

    if (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }

    return errResult(
      new AppError(
        isRateLimitError(params.stripeError) ? "RATE_LIMITED" : "STRIPE_CONNECT_SERVICE_ERROR",
        {
          userMessage:
            status === "creation_unknown"
              ? SYSTEM_FEE_CREATION_UNKNOWN_MESSAGE
              : "振込手数料の回収に失敗しました。",
          cause: params.stripeError,
          retryable,
          details: { payoutRequestId: params.payoutRequestId, status },
        }
      )
    );
  }

  private async markPayoutCreationFailure(params: {
    payoutRequestId: string;
    stripeError: unknown;
    systemFeeCollected: boolean;
    failureMessageFallback: string;
    failedUserMessage: string;
  }): Promise<AppResult<RequestPayoutPayload>> {
    const isCreationUnknown = isUnknownCreationError(params.stripeError);
    const status: PayoutRequestStatus = isCreationUnknown
      ? "creation_unknown"
      : params.systemFeeCollected
        ? "manual_review_required"
        : "failed";
    const retryable = status === "creation_unknown" || isRateLimitError(params.stripeError);

    const { error: updateError } = await this.supabase
      .from("payout_requests")
      .update({
        status,
        failure_code:
          params.systemFeeCollected && !isCreationUnknown
            ? PAYOUT_CREATION_FAILED_AFTER_FEE_COLLECTED
            : params.stripeError instanceof Stripe.errors.StripeError
              ? params.stripeError.code
              : null,
        failure_message:
          params.stripeError instanceof Error
            ? params.stripeError.message
            : params.failureMessageFallback,
      })
      .eq("id", params.payoutRequestId);

    if (updateError) {
      return errFrom(updateError, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }

    return errResult(
      new AppError(
        isRateLimitError(params.stripeError) ? "RATE_LIMITED" : "STRIPE_CONNECT_SERVICE_ERROR",
        {
          userMessage:
            status === "creation_unknown"
              ? "振込リクエストの処理状況を確認中です。しばらくしてから再度確認してください。"
              : status === "manual_review_required"
                ? "振込手数料の回収後に振込リクエストの作成に失敗しました。確認完了まで新しい振込は実行できません。"
              : params.failedUserMessage,
          cause: params.stripeError,
          retryable,
          details: { payoutRequestId: params.payoutRequestId, status },
        }
      )
    );
  }

  private async getCreationUnknownRequest(
    payoutProfileId: string
  ): Promise<{
    id: string;
    amount: number;
    currency: string;
    idempotency_key: string;
    system_fee_amount: number;
    system_fee_idempotency_key: string | null;
    system_fee_state: PayoutSystemFeeState;
    requested_at: string;
  } | null> {
    const { data, error } = await this.supabase
      .from("payout_requests")
      .select(
        "id, amount, currency, idempotency_key, system_fee_amount, system_fee_idempotency_key, system_fee_state, requested_at"
      )
      .eq("payout_profile_id", payoutProfileId)
      .eq("status", "creation_unknown")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        amount: number;
        currency: string;
        idempotency_key: string;
        system_fee_amount: number;
        system_fee_idempotency_key: string | null;
        system_fee_state: PayoutSystemFeeState;
        requested_at: string;
      }>();

    if (error) {
      throw error;
    }

    return data ?? null;
  }

  private async markCreationUnknownManualReviewRequired(
    payoutRequestId: string,
    systemFeeState: PayoutSystemFeeState
  ): Promise<AppResult<boolean>> {
    const updatePayload = {
      status: "manual_review_required" as const,
      failure_code: EXPIRED_IDEMPOTENCY_FAILURE_CODE,
      failure_message: MANUAL_REVIEW_REQUIRED_MESSAGE,
      ...(systemFeeState === "creation_unknown"
        ? { system_fee_state: "manual_review_required" as const }
        : {}),
    };

    const { data, error } = await this.supabase
      .from("payout_requests")
      .update(updatePayload)
      .eq("id", payoutRequestId)
      .eq("status", "creation_unknown")
      .select("id");

    if (error) {
      return errFrom(error, { defaultCode: "STRIPE_CONNECT_SERVICE_ERROR" });
    }

    return okResult((data?.length ?? 0) > 0);
  }

  private isCreationUnknownExpired(request: Pick<LatestPayoutRequest, "requestedAt">): boolean {
    const requestedAt = new Date(request.requestedAt).getTime();
    return (
      Number.isFinite(requestedAt) &&
      Date.now() - requestedAt >= IDEMPOTENCY_KEY_RECOVERY_WINDOW_MS
    );
  }

  private async getLatestRequest(payoutProfileId: string): Promise<LatestPayoutRequest | null> {
    const { data, error } = await this.supabase
      .from("payout_requests")
      .select(
        "id, amount, gross_amount, currency, status, system_fee_amount, system_fee_state, requested_at, arrival_date, failure_code, failure_message"
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

  private async getLatestActiveRequest(
    payoutProfileId: string
  ): Promise<LatestPayoutRequest | null> {
    const { data, error } = await this.supabase
      .from("payout_requests")
      .select(
        "id, amount, gross_amount, currency, status, system_fee_amount, system_fee_state, requested_at, arrival_date, failure_code, failure_message"
      )
      .eq("payout_profile_id", payoutProfileId)
      .in("status", IN_PROGRESS_STATUSES)
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
