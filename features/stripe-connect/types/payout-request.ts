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

export type PayoutBalance = {
  availableAmount: number;
  pendingAmount: number;
  currency: "jpy";
};

export type LatestPayoutRequest = {
  id: string;
  amount: number;
  currency: "jpy";
  status: PayoutRequestStatus;
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
  currency: "jpy";
  status: StripePayoutRequestStatus;
};
