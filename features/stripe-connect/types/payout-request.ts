export type PayoutRequestStatus =
  | "requesting"
  | "created"
  | "paid"
  | "failed"
  | "canceled"
  | "creation_unknown";

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
  failureCode: string | null;
  failureMessage: string | null;
};

export type PayoutPanelState = PayoutBalance & {
  latestRequest: LatestPayoutRequest | null;
  canRequestPayout: boolean;
  disabledReason?:
    | "no_account"
    | "payouts_disabled"
    | "no_available_balance"
    | "request_in_progress";
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
  status: "created";
};
