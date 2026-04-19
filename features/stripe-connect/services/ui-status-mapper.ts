/**
 * UIStatusMapper
 * Database StatusとStripe Account ObjectからUI Statusを派生するクラス
 *
 * 要件:
 * - 2.1: UI Statusとして no_account、unverified、requirements_due、pending_review、ready、restricted の6つの値を返す
 * - 2.2: Connect Account が存在しないとき、UI Status として no_account を返す
 * - 2.3: Database Status が unverified であるとき、UI Status として unverified を返す
 * - 2.4: Account Object の currently_due、past_due、または eventually_due が非空であるとき、UI Status として requirements_due を返す
 * - 2.4.1: onboarding 状態で pending_verification があり due 項目がない場合は pending_review を返す
 * - 2.5: Database Status が restricted であるとき、UI Status として restricted を返し、requirements_due に統合しない
 * - 2.6: Database Status が verified かつ Account Object の due配列が空かつ disabled_reason が null であるとき、UI Status として ready を返す
 */

import type Stripe from "stripe";

import type {
  DatabaseStatus,
  RequirementsStateSummary,
  RequirementsSummary,
  ReviewState,
  UIStatus,
} from "../types/status-classification";

type StoredStatusInput = {
  dbStatus: DatabaseStatus | null;
  collectionReady?: boolean | null;
  requirementsDisabledReason?: string | null;
  requirementsSummary?: unknown;
  transfersStatus?: string | null;
};

const EMPTY_REQUIREMENTS_STATE: RequirementsStateSummary = {
  currently_due: [],
  past_due: [],
  eventually_due: [],
  pending_verification: [],
  disabled_reason: undefined,
  current_deadline: null,
};

export const EMPTY_REQUIREMENTS_SUMMARY: RequirementsSummary = {
  account: EMPTY_REQUIREMENTS_STATE,
  transfers: EMPTY_REQUIREMENTS_STATE,
  review_state: "none",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeDisabledReason(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeDeadline(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function normalizeReviewState(value: unknown): ReviewState {
  return value === "pending_review" || value === "under_review" ? value : "none";
}

function normalizeStateSummary(
  value: unknown,
  fallbackDisabledReason?: string | null
): RequirementsStateSummary {
  const record = isRecord(value) ? value : {};

  return {
    currently_due: normalizeStringArray(record.currently_due),
    past_due: normalizeStringArray(record.past_due),
    eventually_due: normalizeStringArray(record.eventually_due),
    pending_verification: normalizeStringArray(record.pending_verification),
    disabled_reason:
      normalizeDisabledReason(record.disabled_reason) ?? fallbackDisabledReason ?? undefined,
    current_deadline: normalizeDeadline(record.current_deadline),
  };
}

function hasPendingVerification(summary: RequirementsSummary): boolean {
  return (
    summary.account.pending_verification.length > 0 ||
    summary.transfers.pending_verification.length > 0 ||
    summary.account.disabled_reason === "requirements.pending_verification" ||
    summary.transfers.disabled_reason === "requirements.pending_verification"
  );
}

function resolveReviewState(summary: RequirementsSummary): ReviewState {
  if (summary.review_state !== "none") {
    return summary.review_state;
  }

  if (
    summary.account.disabled_reason === "under_review" ||
    summary.transfers.disabled_reason === "under_review"
  ) {
    return "under_review";
  }

  return hasPendingVerification(summary) ? "pending_review" : "none";
}

function getCapabilityRequirements(capability: unknown): unknown {
  if (!isRecord(capability)) {
    return undefined;
  }

  return capability.requirements;
}

function getCapabilityStatus(capability: unknown): string | null {
  if (typeof capability === "string") {
    return capability;
  }

  if (isRecord(capability) && typeof capability.status === "string") {
    return capability.status;
  }

  return null;
}

export function normalizeRequirementsSummary(
  value: unknown,
  fallbackDisabledReason?: string | null
): RequirementsSummary {
  const record = isRecord(value) ? value : {};
  const summary: RequirementsSummary = {
    account: normalizeStateSummary(record.account, fallbackDisabledReason),
    transfers: normalizeStateSummary(record.transfers),
    review_state: normalizeReviewState(record.review_state),
  };

  return {
    ...summary,
    review_state: resolveReviewState(summary),
  };
}

export function buildRequirementsSummaryFromStripeAccount(
  account?: Stripe.Account
): RequirementsSummary {
  if (!account) {
    return EMPTY_REQUIREMENTS_SUMMARY;
  }

  const transfersCapability = account.capabilities?.transfers;
  const accountDisabledReason =
    typeof account.requirements?.disabled_reason === "string"
      ? account.requirements.disabled_reason
      : undefined;

  return normalizeRequirementsSummary(
    {
      account: account.requirements,
      transfers: getCapabilityRequirements(transfersCapability),
      review_state: accountDisabledReason === "under_review" ? "under_review" : "none",
    },
    accountDisabledReason
  );
}

export function flattenRequirementsSummary(summary: RequirementsSummary): {
  currently_due: string[];
  eventually_due: string[];
  past_due: string[];
  pending_verification: string[];
  disabled_reason?: string;
  current_deadline?: number | null;
} {
  return {
    currently_due: [...summary.account.currently_due, ...summary.transfers.currently_due],
    eventually_due: [...summary.account.eventually_due, ...summary.transfers.eventually_due],
    past_due: [...summary.account.past_due, ...summary.transfers.past_due],
    pending_verification: [
      ...summary.account.pending_verification,
      ...summary.transfers.pending_verification,
    ],
    disabled_reason: summary.account.disabled_reason ?? summary.transfers.disabled_reason,
    current_deadline: summary.account.current_deadline ?? summary.transfers.current_deadline,
  };
}

function isBlockingDisabledReason(disabledReason?: string): boolean {
  if (!disabledReason) {
    return false;
  }

  return (
    disabledReason !== "under_review" &&
    disabledReason !== "requirements.pending_verification" &&
    disabledReason.startsWith("requirements.")
  );
}

function hasBlockingRequirements(summary: RequirementsSummary): boolean {
  return (
    summary.account.currently_due.length > 0 ||
    summary.account.past_due.length > 0 ||
    summary.transfers.currently_due.length > 0 ||
    summary.transfers.past_due.length > 0 ||
    isBlockingDisabledReason(summary.account.disabled_reason) ||
    isBlockingDisabledReason(summary.transfers.disabled_reason)
  );
}

export class UIStatusMapper {
  mapStoredAccountToUIStatus(input: StoredStatusInput): UIStatus {
    if (!input.dbStatus) {
      return "no_account";
    }

    if (input.dbStatus === "restricted") {
      return "restricted";
    }

    if (input.dbStatus === "unverified") {
      return "unverified";
    }

    const summary = normalizeRequirementsSummary(
      input.requirementsSummary,
      input.requirementsDisabledReason
    );

    if (hasBlockingRequirements(summary)) {
      return "requirements_due";
    }

    if (resolveReviewState(summary) !== "none" || input.transfersStatus === "pending") {
      return "pending_review";
    }

    if (input.collectionReady === true) {
      return "ready";
    }

    return "requirements_due";
  }

  /**
   * Database StatusとAccount ObjectからUI Statusを計算
   *
   * @param dbStatus Database Status (null の場合はアカウント未作成)
   * @param account Stripe Account Object (optional)
   * @returns UI Status
   */
  mapToUIStatus(dbStatus: DatabaseStatus | null, account?: Stripe.Account): UIStatus {
    return this.mapStoredAccountToUIStatus({
      dbStatus,
      collectionReady: dbStatus === "verified" ? true : undefined,
      requirementsSummary: buildRequirementsSummaryFromStripeAccount(account),
      requirementsDisabledReason: account?.requirements?.disabled_reason
        ? String(account.requirements.disabled_reason)
        : null,
      transfersStatus: getCapabilityStatus(account?.capabilities?.transfers),
    });
  }
}
