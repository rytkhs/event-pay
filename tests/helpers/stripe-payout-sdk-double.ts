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

type ChargeCreateCall = {
  params: Stripe.ChargeCreateParams;
  options?: Stripe.RequestOptions;
};

type BalanceSettingsUpdateCall = {
  params: Stripe.BalanceSettingsUpdateParams;
  options?: Stripe.RequestOptions;
};

type AccountRetrieveCall = {
  id: string | null;
  params?: Stripe.AccountRetrieveParams;
  options?: Stripe.RequestOptions;
};

type ExternalAccountsListCall = {
  id: string;
  params?: Stripe.AccountListExternalAccountsParams;
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

const defaultCharge = (overrides: Partial<Stripe.Charge> = {}): Stripe.Charge =>
  ({
    id: `py_test_${Math.random().toString(36).slice(2, 12)}`,
    object: "charge",
    amount: 260,
    amount_captured: 260,
    amount_refunded: 0,
    application: null,
    application_fee: null,
    application_fee_amount: null,
    balance_transaction: null,
    billing_details: {
      address: null,
      email: null,
      name: null,
      phone: null,
      tax_id: null,
    },
    calculated_statement_descriptor: null,
    captured: true,
    created: Math.floor(Date.now() / 1000),
    currency: "jpy",
    customer: null,
    description: null,
    disputed: false,
    failure_balance_transaction: null,
    failure_code: null,
    failure_message: null,
    fraud_details: {},
    livemode: false,
    metadata: {},
    on_behalf_of: null,
    order: null,
    outcome: null,
    paid: true,
    payment_intent: null,
    payment_method: null,
    payment_method_details: null,
    receipt_email: null,
    receipt_number: null,
    receipt_url: null,
    refunded: false,
    refunds: {
      object: "list",
      data: [],
      has_more: false,
      url: "/v1/charges/py_test/refunds",
    },
    review: null,
    shipping: null,
    source: null,
    source_transfer: "tr_test_system_fee",
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: "succeeded",
    transfer_data: null,
    transfer_group: null,
    ...overrides,
  }) as Stripe.Charge;

const defaultAccount = (overrides: Partial<Stripe.Account> = {}): Stripe.Account =>
  ({
    id: "acct_test_default",
    object: "account",
    business_type: "individual",
    charges_enabled: true,
    country: "JP",
    default_currency: "jpy",
    details_submitted: true,
    email: "connect@example.com",
    payouts_enabled: true,
    type: "express",
    ...overrides,
  }) as Stripe.Account;

const defaultBankAccount = (
  overrides: Partial<Stripe.BankAccount> = {}
): Stripe.BankAccount =>
  ({
    id: "ba_test_default",
    object: "bank_account",
    account: "acct_test_default",
    account_holder_name: "Test Holder",
    account_holder_type: "individual",
    account_type: "futsu",
    available_payout_methods: ["standard"],
    bank_name: "Test Bank",
    country: "JP",
    currency: "jpy",
    default_for_currency: true,
    fingerprint: "bank_fingerprint",
    last4: "1234",
    metadata: {},
    routing_number: "1100000",
    status: "new",
    ...overrides,
  }) as Stripe.BankAccount;

export function installStripePayoutSdkDouble() {
  const state = {
    balance: { available: [], pending: [] } as Required<BalanceFixture>,
    balanceError: undefined as unknown,
    payoutError: undefined as unknown,
    payoutResponse: undefined as Stripe.Payout | undefined,
    chargeError: undefined as unknown,
    chargeResponse: undefined as Stripe.Charge | undefined,
    account: defaultAccount(),
    accountError: undefined as unknown,
    externalAccounts: [defaultBankAccount()] as Stripe.ExternalAccount[],
    externalAccountsError: undefined as unknown,
    balanceSettingsError: undefined as unknown,
    payoutCreateCalls: [] as PayoutCreateCall[],
    chargeCreateCalls: [] as ChargeCreateCall[],
    balanceRetrieveCalls: [] as Array<{ params: unknown; options?: Stripe.RequestOptions }>,
    accountRetrieveCalls: [] as AccountRetrieveCall[],
    externalAccountsListCalls: [] as ExternalAccountsListCall[],
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
    charges: {
      create: jest.fn(
        async (params: Stripe.ChargeCreateParams, options?: Stripe.RequestOptions) => {
          state.chargeCreateCalls.push({ params, options });
          if (state.chargeError) {
            throw state.chargeError;
          }
          return (
            state.chargeResponse ??
            defaultCharge({
              amount: params.amount,
              currency: params.currency,
              metadata: params.metadata ?? {},
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
      retrieve: jest.fn(
        async (
          id: string | null,
          params?: Stripe.AccountRetrieveParams,
          options?: Stripe.RequestOptions
        ) => {
          state.accountRetrieveCalls.push({ id, params, options });
          if (state.accountError) {
            throw state.accountError;
          }
          return { ...state.account, id: id ?? state.account.id } as Stripe.Account;
        }
      ),
      listExternalAccounts: jest.fn(
        async (
          id: string,
          params?: Stripe.AccountListExternalAccountsParams,
          options?: Stripe.RequestOptions
        ) => {
          state.externalAccountsListCalls.push({ id, params, options });
          if (state.externalAccountsError) {
            throw state.externalAccountsError;
          }
          return {
            object: "list",
            data: state.externalAccounts,
            has_more: false,
            url: `/v1/accounts/${id}/external_accounts`,
          } as Stripe.ApiList<Stripe.ExternalAccount>;
        }
      ),
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
    setChargeResponse(charge: Partial<Stripe.Charge>) {
      state.chargeResponse = defaultCharge(charge);
    },
    setChargeError(error: unknown) {
      state.chargeError = error;
    },
    setAccount(account: Partial<Stripe.Account>) {
      state.account = defaultAccount(account);
    },
    setAccountError(error: unknown) {
      state.accountError = error;
    },
    setExternalAccounts(accounts: Partial<Stripe.BankAccount>[]) {
      state.externalAccounts = accounts.map((account) => defaultBankAccount(account));
    },
    setExternalAccountsError(error: unknown) {
      state.externalAccountsError = error;
    },
    setBalanceSettingsError(error: unknown) {
      state.balanceSettingsError = error;
    },
    reset() {
      state.balance = { available: [], pending: [] };
      state.balanceError = undefined;
      state.payoutError = undefined;
      state.payoutResponse = undefined;
      state.chargeError = undefined;
      state.chargeResponse = undefined;
      state.account = defaultAccount();
      state.accountError = undefined;
      state.externalAccounts = [defaultBankAccount()];
      state.externalAccountsError = undefined;
      state.balanceSettingsError = undefined;
      state.payoutCreateCalls = [];
      state.chargeCreateCalls = [];
      state.balanceRetrieveCalls = [];
      state.accountRetrieveCalls = [];
      state.externalAccountsListCalls = [];
      state.balanceSettingsUpdateCalls = [];
      jest.clearAllMocks();
    },
    get payoutCreateCalls() {
      return state.payoutCreateCalls;
    },
    get chargeCreateCalls() {
      return state.chargeCreateCalls;
    },
    get balanceRetrieveCalls() {
      return state.balanceRetrieveCalls;
    },
    get accountRetrieveCalls() {
      return state.accountRetrieveCalls;
    },
    get externalAccountsListCalls() {
      return state.externalAccountsListCalls;
    },
    get balanceSettingsUpdateCalls() {
      return state.balanceSettingsUpdateCalls;
    },
  };
}

export { defaultPayout as createStripePayoutFixture };
