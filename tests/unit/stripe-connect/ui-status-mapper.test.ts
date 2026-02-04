/**
 * UIStatusMapper 単体テスト
 * 各UI Statusへのマッピングとエッジケースを検証
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

import { UIStatusMapper } from "@features/stripe-connect/services/ui-status-mapper";
import type { DatabaseStatus } from "@features/stripe-connect/types/status-classification";

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

describe("UIStatusMapper", () => {
  let mapper: UIStatusMapper;

  beforeEach(() => {
    mapper = new UIStatusMapper();
  });

  describe("要件 2.2: no_account - アカウント未作成", () => {
    it("dbStatusがnullの場合はno_accountを返す", () => {
      const uiStatus = mapper.mapToUIStatus(null);

      expect(uiStatus).toBe("no_account");
    });

    it("dbStatusがnullでaccountが渡されてもno_accountを返す", () => {
      const account = createMockAccount();
      const uiStatus = mapper.mapToUIStatus(null, account);

      expect(uiStatus).toBe("no_account");
    });
  });

  describe("要件 2.5: restricted - ハード制限", () => {
    it("dbStatusがrestrictedの場合はrestrictedを返す", () => {
      const uiStatus = mapper.mapToUIStatus("restricted");

      expect(uiStatus).toBe("restricted");
    });

    it("dbStatusがrestrictedでdue配列があってもrestrictedを返す（requirements_dueに統合しない）", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: ["individual.verification.document"],
          disabled_reason: "platform_paused",
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      });

      const uiStatus = mapper.mapToUIStatus("restricted", account);

      expect(uiStatus).toBe("restricted");
    });
  });

  describe("要件 2.3: unverified - 未提出", () => {
    it("dbStatusがunverifiedの場合はunverifiedを返す", () => {
      const uiStatus = mapper.mapToUIStatus("unverified");

      expect(uiStatus).toBe("unverified");
    });

    it("dbStatusがunverifiedでaccountが渡されてもunverifiedを返す", () => {
      const account = createMockAccount();
      const uiStatus = mapper.mapToUIStatus("unverified", account);

      expect(uiStatus).toBe("unverified");
    });
  });

  describe("要件 2.4: requirements_due - 要件未完了", () => {
    it("currently_dueが非空の場合はrequirements_dueを返す", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: ["individual.verification.document"],
          disabled_reason: null,
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("requirements_due");
    });

    it("past_dueが非空の場合はrequirements_dueを返す", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: [],
          disabled_reason: null,
          errors: [],
          eventually_due: [],
          past_due: ["business.tax_id"],
          pending_verification: [],
        },
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("requirements_due");
    });

    it("eventually_dueが非空の場合はrequirements_dueを返す", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: [],
          disabled_reason: null,
          errors: [],
          eventually_due: ["company.verification.document"],
          past_due: [],
          pending_verification: [],
        },
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("requirements_due");
    });

    it("disabled_reasonが存在する場合はrequirements_dueを返す", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: [],
          disabled_reason: "under_review",
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("requirements_due");
    });

    it("複数のdue配列が非空の場合はrequirements_dueを返す", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: ["individual.verification.document"],
          disabled_reason: null,
          errors: [],
          eventually_due: ["company.verification.document"],
          past_due: ["business.tax_id"],
          pending_verification: [],
        },
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("requirements_due");
    });

    it("onboardingステータスでdue配列がある場合はrequirements_dueを返す", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: ["individual.verification.document"],
          disabled_reason: null,
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      });

      const uiStatus = mapper.mapToUIStatus("onboarding", account);

      expect(uiStatus).toBe("requirements_due");
    });
  });

  describe("要件 2.4.1: pending_review - 審査中", () => {
    it("onboardingステータスでpending_verificationがある場合はpending_reviewを返す", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: [],
          disabled_reason: null,
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: ["individual.verification.document"],
        },
      });

      const uiStatus = mapper.mapToUIStatus("onboarding", account);

      expect(uiStatus).toBe("pending_review");
    });

    it("capabilityがpendingの場合はpending_reviewを返す", () => {
      const account = createMockAccount({
        capabilities: {
          card_payments: "pending",
          transfers: "active",
        },
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
      });

      const uiStatus = mapper.mapToUIStatus("onboarding", account);

      expect(uiStatus).toBe("pending_review");
    });

    it("pending_verificationがあってもdue項目がある場合はrequirements_dueを優先する", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: ["individual.verification.document"],
          disabled_reason: null,
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: ["individual.verification.document"],
        },
      });

      const uiStatus = mapper.mapToUIStatus("onboarding", account);

      expect(uiStatus).toBe("requirements_due");
    });
  });

  describe("要件 2.6: ready - 設定完了", () => {
    it("dbStatusがverifiedでdue配列が空の場合はreadyを返す", () => {
      const account = createMockAccount({
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
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("ready");
    });

    it("dbStatusがverifiedでaccountが渡されない場合はreadyを返す", () => {
      const uiStatus = mapper.mapToUIStatus("verified");

      expect(uiStatus).toBe("ready");
    });

    it("dbStatusがverifiedでrequirementsがundefinedの場合はreadyを返す", () => {
      const account = createMockAccount({
        requirements: undefined as any,
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("ready");
    });
  });

  describe("onboardingステータスのデフォルト動作", () => {
    it("onboardingでdue配列が空の場合はrequirements_dueを返す（デフォルト）", () => {
      const account = createMockAccount({
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
      });

      const uiStatus = mapper.mapToUIStatus("onboarding", account);

      expect(uiStatus).toBe("requirements_due");
    });

    it("onboardingでaccountが渡されない場合はrequirements_dueを返す", () => {
      const uiStatus = mapper.mapToUIStatus("onboarding");

      expect(uiStatus).toBe("requirements_due");
    });
  });

  describe("エッジケース", () => {
    it("due配列がundefinedの場合は空配列として扱われる", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: undefined as any,
          disabled_reason: null,
          errors: [],
          eventually_due: undefined as any,
          past_due: undefined as any,
          pending_verification: [],
        },
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("ready");
    });

    it("due配列が空配列の場合は要件なしと判定される", () => {
      const account = createMockAccount({
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
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("ready");
    });

    it("disabled_reasonが空文字列の場合は要件なしと判定される", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: [],
          disabled_reason: "" as any,
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("ready");
    });

    it("disabled_reasonがnullの場合は要件なしと判定される", () => {
      const account = createMockAccount({
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
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("ready");
    });

    it("requirementsがnullの場合は要件なしと判定される", () => {
      const account = createMockAccount({
        requirements: null as any,
      });

      const uiStatus = mapper.mapToUIStatus("verified", account);

      expect(uiStatus).toBe("ready");
    });
  });

  describe("全てのUI Statusが返される（要件 2.1）", () => {
    it("no_accountが返される", () => {
      const uiStatus = mapper.mapToUIStatus(null);
      expect(uiStatus).toBe("no_account");
    });

    it("unverifiedが返される", () => {
      const uiStatus = mapper.mapToUIStatus("unverified");
      expect(uiStatus).toBe("unverified");
    });

    it("requirements_dueが返される", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: ["individual.verification.document"],
          disabled_reason: null,
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      });
      const uiStatus = mapper.mapToUIStatus("verified", account);
      expect(uiStatus).toBe("requirements_due");
    });

    it("readyが返される", () => {
      const account = createMockAccount({
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
      });
      const uiStatus = mapper.mapToUIStatus("verified", account);
      expect(uiStatus).toBe("ready");
    });

    it("restrictedが返される", () => {
      const uiStatus = mapper.mapToUIStatus("restricted");
      expect(uiStatus).toBe("restricted");
    });

    it("pending_reviewが返される", () => {
      const account = createMockAccount({
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: [],
          disabled_reason: null,
          errors: [],
          eventually_due: [],
          past_due: [],
          pending_verification: ["individual.verification.document"],
        },
      });
      const uiStatus = mapper.mapToUIStatus("onboarding", account);
      expect(uiStatus).toBe("pending_review");
    });
  });

  describe("型の整合性", () => {
    it("返り値がUIStatus型である", () => {
      const uiStatus = mapper.mapToUIStatus("verified");
      const validStatuses: string[] = [
        "no_account",
        "unverified",
        "requirements_due",
        "pending_review",
        "ready",
        "restricted",
      ];

      expect(validStatuses).toContain(uiStatus);
    });
  });
});
