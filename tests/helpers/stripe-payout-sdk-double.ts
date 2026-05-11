import Stripe from "stripe";

type BalanceEntry = { amount: number; currency: string; source_types?: Record<string, number> };

type BalanceFixture = {
  available?: BalanceEntry[];
  pending?: BalanceEntry[];
};

type PayoutCreateCall = {
  params: Stripe.PayoutCreateParams;
  options?: Stripe.RequestOptions;
};

type BalanceSettingsUpdateCall = {
  params: Stripe.BalanceSettingsUpdateParams;
  options?: Stripe.RequestOptions;
};

const defaultPayout = (overrides: Partial<Stripe.Payout> = {}): Stripe.Payout =>
  ({
    id: `po_test_${Math.random().toString(36).slice(2, 12)}`,
    object: "payout",
    amount: 1000,
    arrival_date: Math.floor(Date.now() / 1000) + 86400,
    automatic: false,
    balance_transaction: null,
    created: Math.floor(Date.now() / 1000),
    currency: "jpy",
    description: null,
    destination: "ba_test",
    failure_balance_transaction: null,
    failure_code: null,
    failure_message: null,
    livemode: false,
    metadata: {},
    method: "standard",
    original_payout: null,
    reconciliation_status: "not_applicable",
    reversed_by: null,
    source_type: "card",
    statement_descriptor: null,
    status: "paid",
    trace_id: null,
    type: "bank_account",
    ...overrides,
  }) as Stripe.Payout;

export function installStripePayoutSdkDouble() {
  const state = {
    balance: { available: [], pending: [] } as Required<BalanceFixture>,
    balanceError: undefined as unknown,
    payoutError: undefined as unknown,
    payoutResponse: undefined as Stripe.Payout | undefined,
    balanceSettingsError: undefined as unknown,
    payoutCreateCalls: [] as PayoutCreateCall[],
    balanceRetrieveCalls: [] as Array<{ params: unknown; options?: Stripe.RequestOptions }>,
    balanceSettingsUpdateCalls: [] as BalanceSettingsUpdateCall[],
  };

  const stripe = {
    balance: {
      retrieve: jest.fn(async (params: unknown, options?: Stripe.RequestOptions) => {
        state.balanceRetrieveCalls.push({ params, options });
        if (state.balanceError) {
          throw state.balanceError;
        }
        return {
          object: "balance",
          available: state.balance.available,
          pending: state.balance.pending,
          connect_reserved: [],
          livemode: false,
        } as Stripe.Balance;
      }),
    },
    payouts: {
      create: jest.fn(
        async (params: Stripe.PayoutCreateParams, options?: Stripe.RequestOptions) => {
          state.payoutCreateCalls.push({ params, options });
          if (state.payoutError) {
            throw state.payoutError;
          }
          return (
            state.payoutResponse ??
            defaultPayout({
              amount: params.amount,
              currency: params.currency,
              metadata: params.metadata ?? {},
              status: "paid",
            })
          );
        }
      ),
    },
    balanceSettings: {
      update: jest.fn(
        async (params: Stripe.BalanceSettingsUpdateParams, options?: Stripe.RequestOptions) => {
          state.balanceSettingsUpdateCalls.push({ params, options });
          if (state.balanceSettingsError) {
            throw state.balanceSettingsError;
          }
          return { object: "balance_settings" };
        }
      ),
    },
    accounts: {
      create: jest.fn(async () => ({
        id: `acct_test_${Math.random().toString(36).slice(2, 12)}`,
        object: "account",
        details_submitted: false,
        payouts_enabled: false,
      })),
      del: jest.fn(async () => ({ deleted: true })),
    },
  };

  return {
    stripe,
    setBalance(balance: BalanceFixture) {
      state.balance = {
        available: balance.available ?? [],
        pending: balance.pending ?? [],
      };
    },
    setBalanceError(error: unknown) {
      state.balanceError = error;
    },
    setPayoutResponse(payout: Partial<Stripe.Payout>) {
      state.payoutResponse = defaultPayout(payout);
    },
    setPayoutError(error: unknown) {
      state.payoutError = error;
    },
    setBalanceSettingsError(error: unknown) {
      state.balanceSettingsError = error;
    },
    reset() {
      state.balance = { available: [], pending: [] };
      state.balanceError = undefined;
      state.payoutError = undefined;
      state.payoutResponse = undefined;
      state.balanceSettingsError = undefined;
      state.payoutCreateCalls = [];
      state.balanceRetrieveCalls = [];
      state.balanceSettingsUpdateCalls = [];
      jest.clearAllMocks();
    },
    get payoutCreateCalls() {
      return state.payoutCreateCalls;
    },
    get balanceRetrieveCalls() {
      return state.balanceRetrieveCalls;
    },
    get balanceSettingsUpdateCalls() {
      return state.balanceSettingsUpdateCalls;
    },
  };
}

export { defaultPayout as createStripePayoutFixture };
