import { buildCollectionProgressSummary } from "@features/events/server";

import type { ParticipantView } from "@core/validation/participant-management";

function participant(overrides: Partial<ParticipantView>): ParticipantView {
  return {
    attendance_id: "att-1",
    nickname: "テストユーザー",
    email: "test@example.com",
    status: "attending",
    attendance_created_at: "2026-01-01T00:00:00Z",
    attendance_updated_at: "2026-01-01T00:00:00Z",
    payment_id: "pay-1",
    payment_method: "cash",
    payment_status: "pending",
    amount: 1000,
    paid_at: null,
    payment_version: 1,
    payment_created_at: "2026-01-01T00:00:00Z",
    payment_updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildCollectionProgressSummary", () => {
  it("attending の paid/received/pending/failed を運用KPIとして集計する", () => {
    const summary = buildCollectionProgressSummary(
      [
        participant({ attendance_id: "a1", payment_status: "paid", payment_method: "stripe" }),
        participant({ attendance_id: "a2", payment_status: "received" }),
        participant({ attendance_id: "a3", payment_status: "pending" }),
        participant({ attendance_id: "a4", payment_status: "failed", payment_method: "stripe" }),
      ],
      1000
    );

    expect(summary).toMatchObject({
      targetAmount: 4000,
      collectedAmount: 2000,
      outstandingAmount: 2000,
      exemptAmount: 0,
      targetCount: 4,
      collectedCount: 2,
      outstandingCount: 2,
      exemptCount: 0,
      reviewCount: 0,
    });
  });

  it("waived を集金対象から外し、免除だけに集計する", () => {
    const summary = buildCollectionProgressSummary(
      [participant({ payment_status: "waived", amount: 1500 })],
      1000
    );

    expect(summary).toMatchObject({
      targetAmount: 0,
      collectedAmount: 0,
      outstandingAmount: 0,
      exemptAmount: 1500,
      targetCount: 0,
      collectedCount: 0,
      outstandingCount: 0,
      exemptCount: 1,
      reviewCount: 0,
    });
  });

  it("attending の refunded/canceled を要確認に入れる", () => {
    const summary = buildCollectionProgressSummary(
      [
        participant({ attendance_id: "a1", payment_status: "refunded" }),
        participant({ attendance_id: "a2", payment_status: "canceled" }),
      ],
      1000
    );

    expect(summary).toMatchObject({
      targetAmount: 0,
      collectedAmount: 0,
      outstandingAmount: 0,
      exemptAmount: 0,
      targetCount: 0,
      collectedCount: 0,
      outstandingCount: 0,
      exemptCount: 0,
      reviewCount: 2,
    });
  });

  it("not_attending/maybe で完了系の支払いを持つものを要確認に入れる", () => {
    const summary = buildCollectionProgressSummary(
      [
        participant({ attendance_id: "a1", status: "not_attending", payment_status: "paid" }),
        participant({ attendance_id: "a2", status: "maybe", payment_status: "waived" }),
        participant({ attendance_id: "a3", status: "not_attending", payment_status: "refunded" }),
      ],
      1000
    );

    expect(summary.reviewCount).toBe(3);
    expect(summary.targetCount).toBe(0);
  });

  it("payment_status が null の attending を未収として集計し、要確認には入れない", () => {
    const summary = buildCollectionProgressSummary(
      [
        participant({
          payment_id: null,
          payment_method: null,
          payment_status: null,
          amount: null,
          payment_version: null,
          payment_created_at: null,
          payment_updated_at: null,
        }),
      ],
      1200
    );

    expect(summary).toMatchObject({
      targetAmount: 1200,
      outstandingAmount: 1200,
      targetCount: 1,
      outstandingCount: 1,
      reviewCount: 0,
    });
  });

  it("amount が 0 の参加者でも eventFee にフォールバックしない", () => {
    const summary = buildCollectionProgressSummary(
      [
        participant({
          payment_status: "paid",
          payment_method: "stripe",
          amount: 0,
        }),
      ],
      1200
    );

    expect(summary).toMatchObject({
      targetAmount: 0,
      collectedAmount: 0,
      outstandingAmount: 0,
      targetCount: 1,
      collectedCount: 1,
    });
  });
});
