/**
 * AccountStatusClassifier
 * Stripe Account ObjectからDatabase Statusを分類するクラス
 * MECEを保証する5段階ゲートで一意にステータスを決定
 */

import "server-only";

import type Stripe from "stripe";

import { logger } from "@core/logging/app-logger";

import type {
  DatabaseStatus,
  ClassificationResult,
  ClassificationMetadata,
  Capability,
  RequirementsSummary,
  ReviewState,
} from "../types";

type RequirementsSummarySource = {
  currently_due?: string[] | null;
  past_due?: string[] | null;
  eventually_due?: string[] | null;
  pending_verification?: string[] | null;
  disabled_reason?: string | null;
  current_deadline?: number | null;
};

/**
 * AccountStatusClassifier
 * Stripe Account Objectを評価し、Database Statusを一意に分類する
 */
export class AccountStatusClassifier {
  /**
   * MECEを保証する5段階ゲートでステータスを分類
   * @param account Stripe Account Object
   * @returns Classification Result
   */
  classify(account: Stripe.Account): ClassificationResult {
    // Gate 1: Hard Restriction Check
    if (this.hasHardRestriction(account)) {
      return this.createResult("restricted", false, 1, account, "Hard restriction detected");
    }

    // Gate 2: Submission Gate
    if (account.details_submitted !== true) {
      return this.createResult("unverified", false, 2, account, "Details not submitted");
    }

    // Gate 3: Review/Verification Gate
    if (this.isUnderReview(account)) {
      return this.createResult(
        "onboarding",
        false,
        3,
        account,
        "Under review or pending verification"
      );
    }

    // Gate 4: Capability Gate (Destination Charges)
    if (!this.hasRequiredCapabilities(account)) {
      return this.createResult(
        "onboarding",
        false,
        4,
        account,
        "Required transfers capability not met"
      );
    }

    // Gate 4: Requirements Health Gate
    if (!this.hasHealthyRequirements(account)) {
      return this.createResult(
        "onboarding",
        false,
        4,
        account,
        "Requirements not healthy (blocking due items exist)"
      );
    }

    // Gate 5: All conditions met
    return this.createResult("verified", true, 5, account, "All collection conditions met");
  }

  /**
   * Gate 1: Hard Restriction Check
   * requirements.*に由来しない実質的な停止理由を検出
   * @param account Stripe Account Object
   * @returns Hard Restrictionが存在する場合true
   */
  private hasHardRestriction(account: Stripe.Account): boolean {
    const disabledReason = account.requirements?.disabled_reason;
    if (!disabledReason) return false;

    // under_review/pending_verification は Gate 2 で処理
    const reviewReasons = ["under_review", "requirements.pending_verification"];
    if (reviewReasons.includes(disabledReason as string)) {
      return false;
    }

    // requirements.* 起因は除外（Gate 4で処理）
    // ただし requirements.pending_verification は上で除外済み
    if (typeof disabledReason === "string" && disabledReason.startsWith("requirements.")) {
      return false;
    }

    // platform_paused, rejected.* などの実質停止理由
    return true;
  }

  /**
   * Gate 2: Review/Verification Gate
   * 審査中または検証待ちの状態を検出
   * @param account Stripe Account Object
   * @returns 審査中または検証待ちの場合true
   */
  private isUnderReview(account: Stripe.Account): boolean {
    const disabledReason = account.requirements?.disabled_reason;
    const reviewReasons = ["under_review", "requirements.pending_verification"];
    if (reviewReasons.includes(disabledReason as string)) return true;

    const accountPendingVerification =
      (account.requirements?.pending_verification?.length ?? 0) > 0;
    const transfersRequirements = this.getCapabilityRequirements(account.capabilities?.transfers);
    const transfersPendingVerification =
      (transfersRequirements?.pending_verification?.length ?? 0) > 0 ||
      transfersRequirements?.disabled_reason === "requirements.pending_verification";

    return accountPendingVerification || transfersPendingVerification;
  }

  /**
   * Gate 3: Capability Gate (Destination Charges)
   * Destination Chargesに必要なcapabilityを確認
   * @param account Stripe Account Object
   * @returns 必要なcapabilityが全て満たされている場合true
   */
  private hasRequiredCapabilities(account: Stripe.Account): boolean {
    const capabilities = account.capabilities;
    if (!capabilities) return false;

    // destination charges では connected account 側は transfers が active であればよい
    return this.getCapabilityStatus(capabilities.transfers) === "active";
  }

  /**
   * Gate 4: Requirements Health Gate
   * Account レベルおよびCapability レベルの要件健全性を確認
   * @param account Stripe Account Object
   * @returns 要件が健全な場合true
   */
  private hasHealthyRequirements(account: Stripe.Account): boolean {
    // Account レベルの due チェック
    const accountReqs = account.requirements;
    if (accountReqs) {
      const hasDue =
        (accountReqs.currently_due?.length ?? 0) > 0 ||
        (accountReqs.past_due?.length ?? 0) > 0 ||
        this.isBlockingRequirementsDisabledReason(accountReqs.disabled_reason);

      if (hasDue) return false;
    }

    // Capability レベルの due と disabled_reason チェック
    const capabilities = account.capabilities;
    if (capabilities) {
      // transfers capability
      if (!this.isCapabilityHealthy(capabilities.transfers)) return false;
    }

    return true;
  }

  /**
   * requirements.* のうち review 以外を blocking reason として扱う
   * @param disabledReason requirements.disabled_reason
   * @returns 集金不可にすべき理由の場合true
   */
  private isBlockingRequirementsDisabledReason(disabledReason?: string | null): boolean {
    if (!disabledReason) return false;
    if (disabledReason === "requirements.pending_verification") return false;
    return disabledReason.startsWith("requirements.");
  }

  /**
   * Capabilityのステータスを取得
   * string型とobject型の両方に対応
   * @param capability Capability
   * @returns ステータス文字列
   */
  private getCapabilityStatus(capability: Capability | undefined): string | undefined {
    if (!capability) return undefined;
    if (typeof capability === "string") return capability;
    if (typeof capability === "object" && "status" in capability) {
      return capability.status;
    }
    return undefined;
  }

  /**
   * Capabilityの健全性を確認
   * due配列とdisabled_reasonをチェック
   * @param capability Capability
   * @returns 健全な場合true
   */
  private isCapabilityHealthy(capability: Capability | undefined): boolean {
    if (!capability) return true; // 存在しない場合は問題なし

    // string 型の場合は requirements チェック不要
    if (typeof capability === "string") return true;

    // object 型の場合
    if (typeof capability === "object" && "requirements" in capability) {
      const reqs = capability.requirements;
      if (reqs) {
        const hasDue =
          (reqs.currently_due?.length ?? 0) > 0 ||
          (reqs.past_due?.length ?? 0) > 0 ||
          this.isBlockingRequirementsDisabledReason(reqs.disabled_reason);

        if (hasDue) return false;
      }
    }

    return true;
  }

  /**
   * Classification Resultを生成
   * @param status Database Status
   * @param gate ゲート番号
   * @param account Stripe Account Object
   * @param reason 分類理由
   * @returns Classification Result
   */
  private createResult(
    status: DatabaseStatus,
    collectionReady: boolean,
    gate: 1 | 2 | 3 | 4 | 5,
    account: Stripe.Account,
    reason: string
  ): ClassificationResult {
    const transfersStatus = this.getCapabilityStatus(account.capabilities?.transfers);
    const requirementsDisabledReason = account.requirements?.disabled_reason
      ? String(account.requirements.disabled_reason)
      : undefined;
    const requirementsSummary = this.buildRequirementsSummary(account);
    const metadata: ClassificationMetadata = {
      gate,
      details_submitted: account.details_submitted ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      collection_ready: collectionReady,
      transfers_active: transfersStatus === "active",
      transfers_status: transfersStatus,
      has_currently_due_requirements: this.hasCurrentlyDueRequirements(account),
      has_past_due_requirements: this.hasPastDueRequirements(account),
      has_eventually_due_requirements: this.hasEventuallyDueRequirements(account),
      has_pending_verification: this.hasPendingVerification(account),
      has_due_requirements: this.hasDueRequirements(account),
      review_state: this.getReviewState(account),
      disabled_reason: requirementsDisabledReason,
    };

    logger.info("Account status classified", {
      category: "stripe_connect",
      action: "account_status_classification",
      actor_type: "system",
      account_id: account.id,
      status,
      collection_ready: collectionReady,
      gate,
      reason,
      metadata,
      outcome: "success",
    });

    return {
      status,
      collectionReady,
      transfersStatus,
      requirementsDisabledReason,
      requirementsSummary,
      reason,
      metadata,
    };
  }

  /**
   * due配列が存在するかチェック
   * @param account Stripe Account Object
   * @returns due配列が存在する場合true
   */
  private hasDueRequirements(account: Stripe.Account): boolean {
    return (
      this.hasCurrentlyDueRequirements(account) ||
      this.hasPastDueRequirements(account) ||
      this.hasEventuallyDueRequirements(account) ||
      this.hasPendingVerification(account)
    );
  }

  private hasCurrentlyDueRequirements(account: Stripe.Account): boolean {
    const reqs = account.requirements;
    const transfersReqs = this.getCapabilityRequirements(account.capabilities?.transfers);

    return (
      (reqs?.currently_due?.length ?? 0) > 0 || (transfersReqs?.currently_due?.length ?? 0) > 0
    );
  }

  private hasPastDueRequirements(account: Stripe.Account): boolean {
    const reqs = account.requirements;
    const transfersReqs = this.getCapabilityRequirements(account.capabilities?.transfers);

    return (reqs?.past_due?.length ?? 0) > 0 || (transfersReqs?.past_due?.length ?? 0) > 0;
  }

  private hasEventuallyDueRequirements(account: Stripe.Account): boolean {
    const reqs = account.requirements;
    const transfersReqs = this.getCapabilityRequirements(account.capabilities?.transfers);

    return (
      (reqs?.eventually_due?.length ?? 0) > 0 || (transfersReqs?.eventually_due?.length ?? 0) > 0
    );
  }

  private hasPendingVerification(account: Stripe.Account): boolean {
    const reqs = account.requirements;
    const transfersReqs = this.getCapabilityRequirements(account.capabilities?.transfers);

    return (
      (reqs?.pending_verification?.length ?? 0) > 0 ||
      (transfersReqs?.pending_verification?.length ?? 0) > 0 ||
      reqs?.disabled_reason === "requirements.pending_verification" ||
      transfersReqs?.disabled_reason === "requirements.pending_verification"
    );
  }

  private getReviewState(account: Stripe.Account): ReviewState {
    if (account.requirements?.disabled_reason === "under_review") return "under_review";
    return this.hasPendingVerification(account) ? "pending_review" : "none";
  }

  private buildRequirementsSummary(account: Stripe.Account): RequirementsSummary {
    return {
      account: this.buildRequirementsStateSummary(account.requirements),
      transfers: this.buildRequirementsStateSummary(
        this.getCapabilityRequirements(account.capabilities?.transfers)
      ),
      review_state: this.getReviewState(account),
    };
  }

  private buildRequirementsStateSummary(
    requirements?: RequirementsSummarySource | null
  ): RequirementsSummary["account"] {
    return {
      currently_due: requirements?.currently_due ?? [],
      past_due: requirements?.past_due ?? [],
      eventually_due: requirements?.eventually_due ?? [],
      pending_verification: requirements?.pending_verification ?? [],
      disabled_reason: requirements?.disabled_reason ?? undefined,
      current_deadline: requirements?.current_deadline,
    };
  }

  private getCapabilityRequirements(
    capability: Capability | undefined
  ): RequirementsSummarySource | undefined {
    if (!capability || typeof capability === "string") return undefined;
    if (typeof capability === "object" && "requirements" in capability) {
      return capability.requirements;
    }
    return undefined;
  }
}
