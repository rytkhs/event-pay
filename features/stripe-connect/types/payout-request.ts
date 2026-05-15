export type PayoutRequestStatus =
  | "requesting"
  | "pending"
  | "in_transit"
  | "paid"
  | "failed"
  | "canceled"
  | "creation_unknown"
  | "manual_review_required";

export type StripePayoutRequestStatus = Exclude<
  PayoutRequestStatus,
  "requesting" | "creation_unknown" | "manual_review_required"
>;

export type PayoutSystemFeeState =
  | "not_started"
  | "succeeded"
  | "failed"
  | "creation_unknown"
  | "manual_review_required";

export type PayoutBalance = {
  availableAmount: number;
  pendingAmount: number;
  currency: "jpy";
  payoutRequestFeeAmount: number;
  payoutAmount: number;
};

export type LatestPayoutRequest = {
  id: string;
  amount: number;
  grossAmount: number;
  currency: "jpy";
  status: PayoutRequestStatus;
  systemFeeAmount: number;
  systemFeeState: PayoutSystemFeeState;
  requestedAt: string;
  arrivalDate: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type PayoutPanelDisabledReason =
  | "no_account"
  | "payouts_disabled"
  | "external_account_missing"
  | "external_account_unavailable"
  | "no_available_balance"
  | "below_payout_fee"
  | "request_in_progress";

export type PayoutPanelState = PayoutBalance & {
  latestRequest: LatestPayoutRequest | null;
  canRequestPayout: boolean;
  disabledReason?: PayoutPanelDisabledReason;
};

export type RequestPayoutInput = {
  userId: string;
  communityId: string;
};

export type RequestPayoutPayload = {
  payoutRequestId: string;
  stripePayoutId: string;
  stripeAccountId: string;
  amount: number;
  grossAmount: number;
  systemFeeAmount: number;
  systemFeeState: PayoutSystemFeeState;
  currency: "jpy";
  status: StripePayoutRequestStatus;
};
