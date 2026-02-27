/**
 * 決済完了済みガードテスト用ヘルパー関数
 *
 * 仕様書と実装の差異検証のための専用ヘルパー
 */

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { PaymentStatus } from "@features/payments";

import type { Database } from "@/types/database";

type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];

/**
 * 指定されたステータスの決済を作成
 */
export async function createPaymentWithStatus(
  attendanceId: string,
  status: PaymentStatus,
  options: {
    amount?: number;
    method?: Database["public"]["Enums"]["payment_method_enum"];
    paidAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
    stripePaymentIntentId?: string | null;
  } = {}
): Promise<{ id: string; created_at: string; updated_at: string; paid_at: string | null }> {
  const { amount = 1000, paidAt, createdAt, updatedAt, stripePaymentIntentId = null } = options;

  const method = options.method ?? (status === "received" ? "cash" : "stripe");

  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating ${status} payment for completion guard test`,
    {
      operationType: "INSERT",
      accessedTables: ["public.payments"],
      additionalInfo: {
        testContext: "payment-completion-guard",
        attendanceId,
        status,
      },
    }
  );

  const now = new Date();
  const paymentData: PaymentInsert = {
    attendance_id: attendanceId,
    method,
    amount,
    status,
    paid_at:
      paidAt?.toISOString() ??
      (["paid", "received", "refunded", "waived"].includes(status) ? now.toISOString() : null),
    created_at: createdAt?.toISOString() ?? now.toISOString(),
    updated_at: updatedAt?.toISOString() ?? now.toISOString(),
    stripe_payment_intent_id:
      stripePaymentIntentId ??
      (method === "stripe" && status !== "pending"
        ? `pi_test_${Math.random().toString(36).slice(2)}`
        : null),
    tax_included: false,
  };

  // refunded status requires additional fields
  if (status === "refunded") {
    paymentData.refunded_amount = amount;
  }

  const { data: payment, error } = await adminClient
    .from("payments")
    .insert(paymentData)
    .select("id, created_at, updated_at, paid_at")
    .single();

  if (error) {
    throw new Error(`Failed to create ${status} payment: ${error.message}`);
  }

  return payment;
}

/**
 * 複数の決済を時系列順で作成
 */
export async function createPaymentsInSequence(
  attendanceId: string,
  paymentSpecs: Array<{
    status: PaymentStatus;
    minutesAgo: number;
    method?: Database["public"]["Enums"]["payment_method_enum"];
    amount?: number;
  }>
): Promise<
  Array<{
    id: string;
    status: PaymentStatus;
    created_at: string;
    updated_at: string;
    paid_at: string | null;
  }>
> {
  const baseTime = new Date();
  const results = [];

  for (const spec of paymentSpecs) {
    const timestamp = new Date(baseTime.getTime() - spec.minutesAgo * 60000);

    const payment = await createPaymentWithStatus(attendanceId, spec.status, {
      amount: spec.amount || 1000,
      method: spec.method || "stripe",
      createdAt: timestamp,
      updatedAt: timestamp,
      paidAt: ["paid", "received", "refunded", "waived"].includes(spec.status)
        ? timestamp
        : undefined,
    });

    results.push({
      ...payment,
      status: spec.status,
    });
  }

  return results;
}

/**
 * 時間比較テスト用の決済セットを作成
 */
export async function createTimeComparisonPaymentSet(
  attendanceId: string,
  scenario: {
    terminalStatus: PaymentStatus;
    terminalTime: {
      createdAt: number; // minutes ago
      updatedAt: number; // minutes ago
      paidAt: number; // minutes ago
    };
    openStatus: PaymentStatus;
    openTime: {
      createdAt: number; // minutes ago
      updatedAt: number; // minutes ago
    };
  }
): Promise<{
  terminalPayment: { id: string; effective_time: string };
  openPayment: { id: string; effective_time: string };
}> {
  const baseTime = new Date();

  // 終端決済作成
  const terminalCreatedAt = new Date(baseTime.getTime() - scenario.terminalTime.createdAt * 60000);
  const terminalUpdatedAt = new Date(baseTime.getTime() - scenario.terminalTime.updatedAt * 60000);
  const terminalPaidAt = new Date(baseTime.getTime() - scenario.terminalTime.paidAt * 60000);

  const terminalPayment = await createPaymentWithStatus(attendanceId, scenario.terminalStatus, {
    createdAt: terminalCreatedAt,
    updatedAt: terminalUpdatedAt,
    paidAt: terminalPaidAt,
  });

  // オープン決済作成
  const openCreatedAt = new Date(baseTime.getTime() - scenario.openTime.createdAt * 60000);
  const openUpdatedAt = new Date(baseTime.getTime() - scenario.openTime.updatedAt * 60000);

  const openPayment = await createPaymentWithStatus(attendanceId, scenario.openStatus, {
    createdAt: openCreatedAt,
    updatedAt: openUpdatedAt,
  });

  // 仕様書の時間比較ロジックによる有効時間を計算
  const terminalEffectiveTime =
    terminalPayment.paid_at ?? terminalPayment.updated_at ?? terminalPayment.created_at;
  const openEffectiveTime = openPayment.updated_at ?? openPayment.created_at;

  return {
    terminalPayment: {
      id: terminalPayment.id,
      effective_time: terminalEffectiveTime as string,
    },
    openPayment: {
      id: openPayment.id,
      effective_time: openEffectiveTime as string,
    },
  };
}

/**
 * 決済完了済みガードのテスト結果を検証
 */
export interface GuardTestResult {
  shouldBlock: boolean;
  reason?: string;
}

/**
 * 仕様書に基づいて決済完了済みガードの期待動作を計算
 */
export function calculateExpectedGuardBehavior(
  terminalPayments: Array<{
    status: PaymentStatus;
    paid_at: string | null;
    updated_at: string | null;
    created_at: string;
  }>,
  openPayments: Array<{ status: PaymentStatus; updated_at: string | null; created_at: string }>
): GuardTestResult {
  // 仕様書による終端系ステータス（waived含む）
  const SPEC_TERMINAL_STATUSES: PaymentStatus[] = ["paid", "received", "refunded", "waived"];

  // 終端決済の存在確認
  const latestTerminal = terminalPayments
    .filter((p) => SPEC_TERMINAL_STATUSES.includes(p.status))
    .sort((a, b) => {
      // 仕様書: paid_at > updated_at > created_at の優先順位でソート
      const aTime = a.paid_at ?? a.updated_at ?? a.created_at;
      const bTime = b.paid_at ?? b.updated_at ?? b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    })[0];

  if (!latestTerminal) {
    return { shouldBlock: false, reason: "終端決済なし" };
  }

  // オープン決済の存在確認
  const latestOpen = openPayments.sort((a, b) => {
    // 仕様書: updated_at > created_at の優先順位でソート
    const aTime = a.updated_at ?? a.created_at;
    const bTime = b.updated_at ?? b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  })[0];

  if (!latestOpen) {
    return { shouldBlock: true, reason: "終端決済存在・オープン決済なし" };
  }

  // 時間比較
  const terminalTime =
    latestTerminal.paid_at ?? latestTerminal.updated_at ?? latestTerminal.created_at;
  const openTime = latestOpen.updated_at ?? latestOpen.created_at;

  if (new Date(terminalTime).getTime() > new Date(openTime).getTime()) {
    return { shouldBlock: true, reason: "終端決済の方が新しい" };
  }

  return { shouldBlock: false, reason: "オープン決済の方が新しいか同じ" };
}

/**
 * 全ての決済ステータスで完了済みガードの動作をテスト
 */
export async function testAllStatusGuardBehavior(
  attendanceId: string
): Promise<Record<PaymentStatus, boolean>> {
  const statuses: PaymentStatus[] = ["pending", "failed", "paid", "received", "refunded", "waived"];
  const results: Record<PaymentStatus, boolean> = {} as any;

  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    "Testing all payment statuses for completion guard",
    {
      operationType: "INSERT",
      accessedTables: ["public.payments"],
    }
  );

  for (const status of statuses) {
    // 既存の決済をクリア
    await adminClient.from("payments").delete().eq("attendance_id", attendanceId);

    // テスト対象のステータスで決済を作成
    await createPaymentWithStatus(attendanceId, status);

    // ここで実際の PaymentService.createStripeSession を呼び出して
    // ブロックされるかどうかを確認する必要がある
    // （このヘルパーでは状態作成のみ行い、実際のテストは呼び出し元で実行）

    // 仕様書による期待値を設定
    const SPEC_TERMINAL_STATUSES = ["paid", "received", "refunded", "waived"];
    results[status] = SPEC_TERMINAL_STATUSES.includes(status);
  }

  return results;
}

/**
 * 決済データをクリアして初期状態にリセット
 */
export async function resetPaymentState(attendanceId: string): Promise<void> {
  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_CLEANUP,
    "Reset payment state for completion guard test",
    {
      operationType: "DELETE",
      accessedTables: ["public.payments"],
    }
  );

  await adminClient.from("payments").delete().eq("attendance_id", attendanceId);
}
