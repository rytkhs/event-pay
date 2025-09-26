/**
 * 制限ルール - 単体テスト
 */

import {
  STRIPE_PAID_FEE_RESTRICTION,
  STRIPE_PAID_PAYMENT_METHODS_RESTRICTION,
  ATTENDEE_COUNT_CAPACITY_RESTRICTION,
  ATTENDEE_IMPACT_ADVISORY,
  FREE_EVENT_PAYMENT_ADVISORY,
  PAID_EVENT_PAYMENT_REQUIRED_ADVISORY,
} from "../../../features/events/core/restrictions/rules";
import type {
  RestrictionContext,
  FormDataSnapshot,
} from "../../../features/events/core/restrictions/types";

// =============================================================================
// Test Helpers - テストヘルパー
// =============================================================================

const createTestContext = (overrides: Partial<RestrictionContext> = {}): RestrictionContext => ({
  hasAttendees: false,
  attendeeCount: 0,
  hasStripePaid: false,
  eventStatus: "upcoming",
  originalEvent: {
    fee: 0,
    capacity: null,
    payment_methods: [],
  },
  ...overrides,
});

const createTestFormData = (overrides: Partial<FormDataSnapshot> = {}): FormDataSnapshot => ({
  fee: 0,
  capacity: "",
  payment_methods: [],
  ...overrides,
});

// =============================================================================
// Structural Restrictions Tests - 構造的制限のテスト
// =============================================================================

describe("STRIPE_PAID_FEE_RESTRICTION", () => {
  it("決済済み参加者がいない場合は制限なし", () => {
    const context = createTestContext({ hasStripePaid: false });
    const formData = createTestFormData({ fee: 1000 });

    const result = STRIPE_PAID_FEE_RESTRICTION.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.message).toBe("制限なし");
  });

  it("決済済み参加者がいて参加費が変更されている場合は制限あり", () => {
    const context = createTestContext({
      hasStripePaid: true,
      attendeeCount: 5,
      originalEvent: { fee: 500, capacity: null, payment_methods: [] },
    });
    const formData = createTestFormData({ fee: 1000 });

    const result = STRIPE_PAID_FEE_RESTRICTION.evaluate(context, formData);

    expect(result.isRestricted).toBe(true);
    expect(result.message).toBe("決済済み参加者がいるため、参加費は変更できません");
    expect(result.details).toContain("5名の参加者");
  });

  it("決済済み参加者がいても参加費が変更されていない場合は制限なし", () => {
    const context = createTestContext({
      hasStripePaid: true,
      originalEvent: { fee: 1000, capacity: null, payment_methods: [] },
    });
    const formData = createTestFormData({ fee: 1000 });

    const result = STRIPE_PAID_FEE_RESTRICTION.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.message).toBe("制限なし");
  });
});

describe("STRIPE_PAID_PAYMENT_METHODS_RESTRICTION", () => {
  it("決済済み参加者がいない場合は制限なし", () => {
    const context = createTestContext({ hasStripePaid: false });
    const formData = createTestFormData({ payment_methods: ["stripe", "cash"] });

    const result = STRIPE_PAID_PAYMENT_METHODS_RESTRICTION.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.message).toBe("制限なし");
  });

  it("決済済み参加者がいて決済方法が変更されている場合は制限あり", () => {
    const context = createTestContext({
      hasStripePaid: true,
      originalEvent: { fee: 1000, capacity: null, payment_methods: ["stripe"] },
    });
    const formData = createTestFormData({ payment_methods: ["stripe", "cash"] });

    const result = STRIPE_PAID_PAYMENT_METHODS_RESTRICTION.evaluate(context, formData);

    expect(result.isRestricted).toBe(true);
    expect(result.message).toBe("決済済み参加者がいるため、決済方法は変更できません");
  });
});

// =============================================================================
// Conditional Restrictions Tests - 条件的制限のテスト
// =============================================================================

describe("ATTENDEE_COUNT_CAPACITY_RESTRICTION", () => {
  it("参加者がいない場合は制限なし", () => {
    const context = createTestContext({ hasAttendees: false, attendeeCount: 0 });
    const formData = createTestFormData({ capacity: 5 });

    const result = ATTENDEE_COUNT_CAPACITY_RESTRICTION.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.message).toBe("制限なし");
  });

  it("新定員が参加者数より少ない場合は制限あり", () => {
    const context = createTestContext({ hasAttendees: true, attendeeCount: 10 });
    const formData = createTestFormData({ capacity: 5 });

    const result = ATTENDEE_COUNT_CAPACITY_RESTRICTION.evaluate(context, formData);

    expect(result.isRestricted).toBe(true);
    expect(result.message).toContain(
      "現在10名の参加者がいるため、定員を10名未満には設定できません"
    );
  });

  it("新定員が参加者数以上の場合は制限なし", () => {
    const context = createTestContext({ hasAttendees: true, attendeeCount: 10 });
    const formData = createTestFormData({ capacity: 15 });

    const result = ATTENDEE_COUNT_CAPACITY_RESTRICTION.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.message).toBe("制限なし");
  });

  it("定員未設定（null）の場合は制限なし", () => {
    const context = createTestContext({ hasAttendees: true, attendeeCount: 10 });
    const formData = createTestFormData({ capacity: null });

    const result = ATTENDEE_COUNT_CAPACITY_RESTRICTION.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.message).toBe("制限なし（定員無制限）");
  });
});

// =============================================================================
// Advisory Restrictions Tests - 注意事項のテスト
// =============================================================================

describe("FREE_EVENT_PAYMENT_ADVISORY", () => {
  it("無料イベントで決済方法が設定されている場合はワーニング", () => {
    const context = createTestContext();
    const formData = createTestFormData({
      fee: 0,
      payment_methods: ["stripe"],
    });

    const result = FREE_EVENT_PAYMENT_ADVISORY.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.status).toBe("warning");
    expect(result.message).toBe("参加費が0円のため、決済方法の設定は不要です");
  });

  it("有料イベントの場合はワーニングなし", () => {
    const context = createTestContext();
    const formData = createTestFormData({
      fee: 1000,
      payment_methods: ["stripe"],
    });

    const result = FREE_EVENT_PAYMENT_ADVISORY.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.status).toBe("allowed");
    expect(result.message).toBe("制限なし");
  });
});

describe("PAID_EVENT_PAYMENT_REQUIRED_ADVISORY", () => {
  it("有料イベントで決済方法が設定されていない場合はワーニング", () => {
    const context = createTestContext();
    const formData = createTestFormData({
      fee: 1000,
      payment_methods: [],
    });

    const result = PAID_EVENT_PAYMENT_REQUIRED_ADVISORY.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.status).toBe("warning");
    expect(result.message).toBe("有料イベントでは決済方法の選択が必要です");
  });

  it("有料イベントで決済方法が設定されている場合はワーニングなし", () => {
    const context = createTestContext();
    const formData = createTestFormData({
      fee: 1000,
      payment_methods: ["stripe"],
    });

    const result = PAID_EVENT_PAYMENT_REQUIRED_ADVISORY.evaluate(context, formData);

    expect(result.isRestricted).toBe(false);
    expect(result.status).toBe("allowed");
    expect(result.message).toBe("制限なし");
  });
});
