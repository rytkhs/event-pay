/**
 * AccountStatusClassifier 単体テスト
 * 各ゲートの動作とエッジケースを検証
 */

import type Stripe from "stripe";

import { AccountStatusClassifier } from "@features/stripe-connect/services/account-status-classifier";
import type { DatabaseStatus } from "@features/stripe-connect/types";

/**
 * モックStripe Accountオブジェクトを生成するヘルパー関数
 */
const createMockAccount = (overrides?: Partial<Stripe.Account>): Stripe.Account => {
  const baseAccount: Stripe.Account = {
    id: "acct_test_123",
    object: "account",
    business_profile: null,
    business_type: null,
    capabilities: {
      card_payments: "inactive",
      transfers: "inactive",
    },
    charges_enabled: false,
    controller: {
      type: "account",
    },
    country: "JP",
    created: Math.floor(Date.now() / 1000),
    default_currency: "jpy",
    details_submitted: false,
    email: "test@example.com",
    external_accounts: {
      object: "list",
      data: [],
      has_more: false,
      url: "/v1/accounts/acct_test_123/external_accounts",
    },
    future_requirements: {
      alternatives: [],
      current_deadline: null,
      currently_due: [],
      disabled_reason: null,
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    },
    individual: undefined,
    metadata: {},
    payouts_enabled: false,
    requirements: {
      alternatives: [],
      current_deadline: null,
      currently_due: [],
      disabled_reason: null,
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    },
    settings: {
      bacs_debit_payments: {
        display_name: null,
        service_user_number: null,
      },
      branding: {
        icon: null,
        logo: null,
        primary_color: null,
        secondary_color: null,
      },
      card_issuing: {
        tos_acceptance: {
          date: null,
          ip: null,
        },
      },
      card_payments: {
        decline_on: {
          avs_failure: false,
          cvc_failure: false,
        },
        statement_descriptor_prefix: null,
        statement_descriptor_prefix_kana: null,
        statement_descriptor_prefix_kanji: null,
      },
      dashboard: {
        display_name: "Test Account",
        timezone: "Asia/Tokyo",
      },
      invoices: {
        default_account_tax_ids: null,
        hosted_payment_method_save: null,
      },
      payments: {
        statement_descriptor: "TEST",
        statement_descriptor_kana: null,
        statement_descriptor_kanji: null,
        statement_descriptor_prefix_kana: null,
        statement_descriptor_prefix_kanji: null,
      },
      payouts: {
        debit_negative_balances: false,
        schedule: {
          delay_days: 7,
          interval: "weekly",
          weekly_anchor: "friday",
        },
        statement_descriptor: null,
      },
      sepa_debit_payments: {},
      treasury: {
        tos_acceptance: {
          date: null,
          ip: null,
        },
      },
    },
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: "127.0.0.1",
      user_agent: "test-user-agent",
    },
    type: "express",
  };

  return {
    ...baseAccount,
    ...overrides,
  } as Stripe.Account;
};

describe("AccountStatusClassifier", () => {
  let classifier: AccountStatusClassifier;

  beforeEach(() => {
    classifier = new AccountStatusClassifier();
  });

  describe("Gate 1: Hard Restriction Check", () => {
    it("platform_pausedの場合はrestrictedに分類される", () => {
      const account = createMockAccount({
        requirements: {
          ...createMockAccount().requirements!,
          disabled_reason: "platform_paused",
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("restricted");
      expect(result.metadata.gate).toBe(1);
      expect(result.reason).toContain("Hard restriction");
    });

    it("rejected.fraudの場合はrestrictedに分類される", () => {
      const account = createMockAccount({
        requirements: {
          ...createMockAccount().requirements!,
          disabled_reason: "rejected.fraud",
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("restricted");
      expect(result.metadata.gate).toBe(1);
    });

    it("rejected.terms_of_serviceの場合はrestrictedに分類される", () => {
      const account = createMockAccount({
        requirements: {
          ...createMockAccount().requirements!,
          disabled_reason: "rejected.terms_of_service",
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("restricted");
      expect(result.metadata.gate).toBe(1);
    });

    it("requirements.*起因の場合はrestrictedに分類されない", () => {
      const account = createMockAccount({
        requirements: {
          ...createMockAccount().requirements!,
          disabled_reason: "requirements.past_due",
        },
        details_submitted: true,
      });

      const result = classifier.classify(account);

      expect(result.status).not.toBe("restricted");
    });

    it("under_reviewの場合はGate 2で処理される", () => {
      const account = createMockAccount({
        requirements: {
          ...createMockAccount().requirements!,
          disabled_reason: "under_review",
        },
        details_submitted: true,
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(2);
    });

    it("pending_verificationの場合はGate 2で処理される", () => {
      const account = createMockAccount({
        requirements: {
          ...createMockAccount().requirements!,
          disabled_reason: "requirements.pending_verification" as any,
        },
        details_submitted: true,
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(2);
    });
  });

  describe("Gate 2: Review/Verification Gate", () => {
    it("under_reviewの場合はonboardingに分類される", () => {
      const account = createMockAccount({
        requirements: {
          ...createMockAccount().requirements!,
          disabled_reason: "under_review",
        },
        details_submitted: true,
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(2);
      expect(result.reason).toContain("Under review");
    });

    it("pending_verificationの場合はonboardingに分類される", () => {
      const account = createMockAccount({
        requirements: {
          ...createMockAccount().requirements!,
          disabled_reason: "requirements.pending_verification" as any,
        },
        details_submitted: true,
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(2);
    });
  });

  describe("Gate 3: Capability Gate", () => {
    it("transfersがinactiveの場合はverifiedに分類されない", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "inactive",
          card_payments: "active",
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(3);
      expect(result.metadata.transfers_active).toBe(false);
    });

    it("card_paymentsがinactiveの場合はverifiedに分類されない", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "inactive",
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(3);
      expect(result.metadata.card_payments_active).toBe(false);
    });

    it("payouts_enabledがfalseの場合はverifiedに分類されない", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: false,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(3);
      expect(result.metadata.payouts_enabled).toBe(false);
    });

    it("capabilitiesがstring型の場合も正しく処理される", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active" as any,
          card_payments: "active" as any,
        },
      });

      const result = classifier.classify(account);

      // Gate 3を通過してGate 4へ
      expect(result.metadata.transfers_active).toBe(true);
      expect(result.metadata.card_payments_active).toBe(true);
    });

    it("capabilitiesがobject型の場合も正しく処理される", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: { status: "active" } as any,
          card_payments: { status: "active" } as any,
        },
      });

      const result = classifier.classify(account);

      expect(result.metadata.transfers_active).toBe(true);
      expect(result.metadata.card_payments_active).toBe(true);
    });
  });

  describe("Gate 4: Requirements Health Gate", () => {
    it("currently_dueがある場合はverifiedに分類されない", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          ...createMockAccount().requirements!,
          currently_due: ["individual.verification.document"],
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(4);
      expect(result.metadata.has_due_requirements).toBe(true);
    });

    it("past_dueがある場合はverifiedに分類されない", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          ...createMockAccount().requirements!,
          past_due: ["individual.verification.document"],
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(4);
      expect(result.metadata.has_due_requirements).toBe(true);
    });

    it("eventually_dueがある場合はverifiedに分類されない", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          ...createMockAccount().requirements!,
          eventually_due: ["individual.verification.document"],
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(4);
    });

    it("Capability レベルのcurrently_dueがある場合はverifiedに分類されない", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: {
            status: "active",
            requirements: {
              currently_due: ["individual.verification.document"],
            },
          } as any,
          card_payments: "active",
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(4);
    });

    it("Capability レベルのdisabled_reasonがある場合はverifiedに分類されない", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: {
            status: "active",
            requirements: {
              disabled_reason: "requirements.past_due",
            },
          } as any,
          card_payments: "active",
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(4);
    });
  });

  describe("Gate 5: Verified", () => {
    it("全ての条件を満たす場合はverifiedに分類される", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          ...createMockAccount().requirements!,
          currently_due: [],
          past_due: [],
          eventually_due: [],
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("verified");
      expect(result.metadata.gate).toBe(5);
      expect(result.reason).toContain("All conditions met");
      expect(result.metadata.details_submitted).toBe(true);
      expect(result.metadata.payouts_enabled).toBe(true);
      expect(result.metadata.transfers_active).toBe(true);
      expect(result.metadata.card_payments_active).toBe(true);
      expect(result.metadata.has_due_requirements).toBe(false);
    });
  });

  describe("Submission Status", () => {
    it("details_submittedがfalseの場合はunverifiedに分類される", () => {
      const account = createMockAccount({
        details_submitted: false,
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("unverified");
      expect(result.metadata.details_submitted).toBe(false);
    });

    it("details_submittedがtrueだが条件を満たさない場合はonboardingに分類される", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: false,
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.details_submitted).toBe(true);
    });
  });

  describe("エッジケース", () => {
    it("requirementsがundefinedの場合も正しく処理される", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: undefined as any,
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("verified");
    });

    it("capabilitiesがundefinedの場合はverifiedに分類されない", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: undefined as any,
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.gate).toBe(3);
    });

    it("due配列が空配列の場合は健全と判定される", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          ...createMockAccount().requirements!,
          currently_due: [],
          past_due: [],
          eventually_due: [],
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("verified");
      expect(result.metadata.has_due_requirements).toBe(false);
    });

    it("disabled_reasonが空文字列の場合は制限なしと判定される", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          ...createMockAccount().requirements!,
          disabled_reason: "" as any,
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("verified");
    });

    it("複数のdue配列がある場合も正しく検出される", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          ...createMockAccount().requirements!,
          currently_due: ["individual.verification.document"],
          past_due: ["business.tax_id"],
          eventually_due: ["company.verification.document"],
        },
      });

      const result = classifier.classify(account);

      expect(result.status).toBe("onboarding");
      expect(result.metadata.has_due_requirements).toBe(true);
    });
  });

  describe("Classification Result構造", () => {
    it("結果にstatus, reason, metadataが含まれる", () => {
      const account = createMockAccount({
        details_submitted: false,
      });

      const result = classifier.classify(account);

      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("reason");
      expect(result).toHaveProperty("metadata");
      expect(typeof result.status).toBe("string");
      expect(typeof result.reason).toBe("string");
      expect(typeof result.metadata).toBe("object");
    });

    it("metadataに全ての必須フィールドが含まれる", () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
      });

      const result = classifier.classify(account);

      expect(result.metadata).toHaveProperty("gate");
      expect(result.metadata).toHaveProperty("details_submitted");
      expect(result.metadata).toHaveProperty("payouts_enabled");
      expect(result.metadata).toHaveProperty("transfers_active");
      expect(result.metadata).toHaveProperty("card_payments_active");
      expect(result.metadata).toHaveProperty("has_due_requirements");
    });
  });
});
