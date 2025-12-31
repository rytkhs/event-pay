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
} from "../types";

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
      return this.createResult("restricted", 1, account, "Hard restriction detected");
    }

    // Gate 2: Review/Verification Gate
    if (this.isUnderReview(account)) {
      return this.createResult("onboarding", 2, account, "Under review or pending verification");
    }

    // Gate 3: Capability Gate (Destination Charges)
    if (!this.hasRequiredCapabilities(account)) {
      const status = this.getStatusBySubmission(account);
      return this.createResult(
        status,
        3,
        account,
        "Required capabilities not met (transfers/card_payments/payouts)"
      );
    }

    // Gate 4: Requirements Health Gate
    if (!this.hasHealthyRequirements(account)) {
      const status = this.getStatusBySubmission(account);
      return this.createResult(status, 4, account, "Requirements not healthy (due items exist)");
    }

    // Gate 5: All conditions met
    return this.createResult("verified", 5, account, "All conditions met");
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
    return reviewReasons.includes(disabledReason as string);
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

    // transfers と card_payments が active であること
    const transfersActive = this.getCapabilityStatus(capabilities.transfers) === "active";
    const cardPaymentsActive = this.getCapabilityStatus(capabilities.card_payments) === "active";

    // payouts_enabled も必須
    const payoutsEnabled = account.payouts_enabled === true;

    return transfersActive && cardPaymentsActive && payoutsEnabled;
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
        (accountReqs.eventually_due?.length ?? 0) > 0;

      if (hasDue) return false;
    }

    // Capability レベルの due と disabled_reason チェック
    const capabilities = account.capabilities;
    if (capabilities) {
      // transfers capability
      if (!this.isCapabilityHealthy(capabilities.transfers)) return false;
      // card_payments capability
      if (!this.isCapabilityHealthy(capabilities.card_payments)) return false;
    }

    return true;
  }

  /**
   * Gate 5: Submission Status
   * details_submittedに基づいてunverified/onboardingを判定
   * @param account Stripe Account Object
   * @returns unverified または onboarding
   */
  private getStatusBySubmission(account: Stripe.Account): "unverified" | "onboarding" {
    return account.details_submitted ? "onboarding" : "unverified";
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
          (reqs.eventually_due?.length ?? 0) > 0;

        if (hasDue || reqs.disabled_reason) return false;
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
    gate: 1 | 2 | 3 | 4 | 5,
    account: Stripe.Account,
    reason: string
  ): ClassificationResult {
    const metadata: ClassificationMetadata = {
      gate,
      details_submitted: account.details_submitted ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      transfers_active: this.getCapabilityStatus(account.capabilities?.transfers) === "active",
      card_payments_active:
        this.getCapabilityStatus(account.capabilities?.card_payments) === "active",
      has_due_requirements: this.hasDueRequirements(account),
      disabled_reason: account.requirements?.disabled_reason
        ? String(account.requirements.disabled_reason)
        : undefined,
    };

    logger.info("Account status classified", {
      category: "stripe_connect",
      action: "account_status_classification",
      actor_type: "system",
      account_id: account.id,
      status,
      gate,
      reason,
      metadata,
      outcome: "success",
    });

    return {
      status,
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
    const reqs = account.requirements;
    if (!reqs) return false;

    return (
      (reqs.currently_due?.length ?? 0) > 0 ||
      (reqs.past_due?.length ?? 0) > 0 ||
      (reqs.eventually_due?.length ?? 0) > 0
    );
  }
}
