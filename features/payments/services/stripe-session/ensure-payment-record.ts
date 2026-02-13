/**
 * 決済レコード確保（冪等性・並行制御）ロジック
 *
 * Stripe決済セッション作成前に、DBに決済レコードを確保または再利用する。
 * - 既存のpending決済があれば再利用（Idempotency Key更新）
 * - 既存のfailed決済があれば新規作成
 * - 並行作成（23505エラー）時は既存レコードを再利用
 */

import "server-only";

import type { PaymentLogger } from "@core/logging/payment-logger";
import { generateIdempotencyKey } from "@core/stripe/client";
import { assertStripePayment } from "@core/stripe/guards";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import type { AppSupabaseClient } from "@core/types/supabase";

import type { CreateStripeSessionParams, PaymentMethod, PaymentStatus } from "../types";
import { findLatestPaymentByEffectiveTime } from "../utils/payment-effective-time";

import {
  type EnsurePaymentRecordResult,
  type OpenPaymentRow,
  OPEN_PAYMENT_SELECT_COLUMNS,
  OPEN_PAYMENT_STATUSES,
  TERMINAL_PAYMENT_STATUSES,
  isOpenPaymentStatus,
  isTerminalPaymentStatus,
} from "./types";

/**
 * オープン決済レコードの正規化
 */
export function normalizeOpenPaymentRow(
  row: Record<string, unknown>,
  logger: PaymentLogger
): OpenPaymentRow | null {
  if (!row || typeof row.id !== "string") return null;

  const checkoutKeyRevisionRaw = row.checkout_key_revision;
  const checkoutKeyRevision =
    typeof checkoutKeyRevisionRaw === "number"
      ? checkoutKeyRevisionRaw
      : typeof checkoutKeyRevisionRaw === "string" && /^\d+$/.test(checkoutKeyRevisionRaw)
        ? Number.parseInt(checkoutKeyRevisionRaw, 10)
        : 0;

  if (
    checkoutKeyRevisionRaw !== null &&
    checkoutKeyRevisionRaw !== undefined &&
    typeof checkoutKeyRevisionRaw !== "number"
  ) {
    logger.warn("checkout_key_revision is not a number; coercing to 0", {
      payment_id: row.id,
      checkout_key_revision_raw: checkoutKeyRevisionRaw,
    });
  }

  return {
    id: row.id,
    status: row.status as PaymentStatus,
    method: row.method as PaymentMethod,
    amount: typeof row.amount === "number" ? row.amount : 0,
    checkout_idempotency_key:
      typeof row.checkout_idempotency_key === "string" ? row.checkout_idempotency_key : null,
    checkout_key_revision: checkoutKeyRevision,
    stripe_payment_intent_id:
      typeof row.stripe_payment_intent_id === "string" ? row.stripe_payment_intent_id : null,
    paid_at: typeof row.paid_at === "string" ? row.paid_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/**
 * pending状態からの優先選択
 */
function selectPreferredOpenPayment(payments: OpenPaymentRow[]): OpenPaymentRow | null {
  if (!payments.length) return null;
  const pendingPayments = payments.filter((payment) => payment.status === "pending");
  if (pendingPayments.length > 0) {
    return findLatestPaymentByEffectiveTime(pendingPayments, TERMINAL_PAYMENT_STATUSES);
  }
  return findLatestPaymentByEffectiveTime(payments, TERMINAL_PAYMENT_STATUSES);
}

/**
 * Stripe決済レコードの確保（冪等性・並行制御）
 */
export async function ensureStripePaymentRecord(
  params: CreateStripeSessionParams,
  supabase: AppSupabaseClient<"public">,
  logger: PaymentLogger
): Promise<EnsurePaymentRecordResult> {
  // --- オープン決済の検索 ---
  const { data: openPayments, error: openPaymentsError } = await supabase
    .from("payments")
    .select(OPEN_PAYMENT_SELECT_COLUMNS)
    .eq("attendance_id", params.attendanceId)
    .in("status", OPEN_PAYMENT_STATUSES);

  if (openPaymentsError) {
    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      `決済レコード（open）の検索に失敗しました: ${openPaymentsError.message}`,
      openPaymentsError
    );
  }

  const normalizedOpenPayments = (openPayments ?? [])
    .map((payment) =>
      normalizeOpenPaymentRow(payment as unknown as Record<string, unknown>, logger)
    )
    .filter((payment): payment is OpenPaymentRow => payment !== null);

  const openPayment = selectPreferredOpenPayment(normalizedOpenPayments);

  // --- 終端決済の存在確認 ---
  const { data: existingTerminal, error: terminalFindError } = await supabase
    .from("payments")
    .select("id")
    .eq("attendance_id", params.attendanceId)
    .in("status", TERMINAL_PAYMENT_STATUSES)
    .limit(1)
    .maybeSingle();

  if (terminalFindError) {
    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      `決済レコード（終端）の検索に失敗しました: ${terminalFindError.message}`,
      terminalFindError
    );
  }

  if (existingTerminal) {
    throw new PaymentError(
      PaymentErrorType.PAYMENT_ALREADY_EXISTS,
      "この参加に対する決済は既に完了済みです"
    );
  }

  // --- ヘルパー関数 ---
  const buildIdempotencyKey = () => generateIdempotencyKey("checkout");

  const fetchOpenPaymentById = async (paymentId: string): Promise<OpenPaymentRow | null> => {
    const { data: currentOpen, error: fetchError } = await supabase
      .from("payments")
      .select(OPEN_PAYMENT_SELECT_COLUMNS)
      .eq("id", paymentId)
      .maybeSingle();

    if (fetchError) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済レコードの再取得に失敗しました: ${fetchError.message}`,
        fetchError
      );
    }

    const normalized = currentOpen
      ? normalizeOpenPaymentRow(currentOpen as Record<string, unknown>, logger)
      : null;

    if (!normalized) {
      return null;
    }

    if (isTerminalPaymentStatus(normalized.status)) {
      throw new PaymentError(
        PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        "この参加に対する決済は既に完了済みです"
      );
    }

    if (!isOpenPaymentStatus(normalized.status)) {
      throw new PaymentError(
        PaymentErrorType.CONCURRENT_UPDATE,
        "決済情報が更新されています。再試行してください。"
      );
    }

    return normalized;
  };

  const reusePendingPayment = async (
    pendingPayment: OpenPaymentRow
  ): Promise<EnsurePaymentRecordResult> => {
    const currentRevision = pendingPayment.checkout_key_revision;
    const idempotencyKey = buildIdempotencyKey();
    const checkoutKeyRevision = currentRevision + 1;

    const { data: reserved, error: reserveError } = await supabase
      .from("payments")
      .update({
        amount: params.amount,
        stripe_payment_intent_id: null,
        stripe_checkout_session_id: null,
        checkout_idempotency_key: idempotencyKey,
        checkout_key_revision: checkoutKeyRevision,
      })
      .eq("id", pendingPayment.id)
      .eq("checkout_key_revision", currentRevision)
      .select(OPEN_PAYMENT_SELECT_COLUMNS)
      .maybeSingle();

    if (reserveError) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `既存決済の更新に失敗しました: ${reserveError.message}`,
        reserveError
      );
    }

    const normalizedReserved = reserved
      ? normalizeOpenPaymentRow(reserved as Record<string, unknown>, logger)
      : null;

    if (normalizedReserved?.checkout_idempotency_key === idempotencyKey) {
      logger.info("Idempotency key reserved", {
        attendance_id: params.attendanceId,
        has_open_payment: true,
        final_key: idempotencyKey.substring(0, 12) + "...",
        final_revision: checkoutKeyRevision,
      });

      return {
        paymentId: pendingPayment.id,
        idempotencyKey,
        checkoutKeyRevision,
      };
    }

    const latestOpen = await fetchOpenPaymentById(pendingPayment.id);

    if (!latestOpen) {
      logger.warn("Idempotency key reservation returned no row; fallback", {
        attendance_id: params.attendanceId,
        payment_id: pendingPayment.id,
        final_key: idempotencyKey.substring(0, 12) + "...",
        final_revision: checkoutKeyRevision,
      });

      return {
        paymentId: pendingPayment.id,
        idempotencyKey,
        checkoutKeyRevision,
      };
    }

    if (latestOpen.checkout_idempotency_key) {
      if (latestOpen.amount !== params.amount) {
        logger.warn("Concurrent checkout reserved with different amount", {
          attendance_id: params.attendanceId,
          payment_id: latestOpen.id,
          requested_amount: params.amount,
          reserved_amount: latestOpen.amount,
          reserved_revision: latestOpen.checkout_key_revision,
        });
        throw new PaymentError(
          PaymentErrorType.CONCURRENT_UPDATE,
          "決済情報が更新されています。再試行してください。"
        );
      }

      logger.info("Idempotency key reused after concurrent reservation", {
        attendance_id: params.attendanceId,
        payment_id: latestOpen.id,
        final_key: latestOpen.checkout_idempotency_key.substring(0, 12) + "...",
        final_revision: latestOpen.checkout_key_revision,
      });

      return {
        paymentId: latestOpen.id,
        idempotencyKey: latestOpen.checkout_idempotency_key,
        checkoutKeyRevision: latestOpen.checkout_key_revision,
      };
    }

    logger.warn("Idempotency key reservation missing after update; fallback", {
      attendance_id: params.attendanceId,
      payment_id: latestOpen.id,
      final_key: idempotencyKey.substring(0, 12) + "...",
      final_revision: checkoutKeyRevision,
    });

    return {
      paymentId: pendingPayment.id,
      idempotencyKey,
      checkoutKeyRevision,
    };
  };

  const fetchConcurrentOpenPayments = async (): Promise<OpenPaymentRow[]> => {
    const { data: concurrentOpen, error: refetchOpenError } = await supabase
      .from("payments")
      .select(OPEN_PAYMENT_SELECT_COLUMNS)
      .eq("attendance_id", params.attendanceId)
      .in("status", OPEN_PAYMENT_STATUSES);

    if (refetchOpenError) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `既存open決済の再取得に失敗しました: ${refetchOpenError.message}`,
        refetchOpenError
      );
    }

    return (concurrentOpen ?? [])
      .map((payment) => normalizeOpenPaymentRow(payment as Record<string, unknown>, logger))
      .filter((payment): payment is OpenPaymentRow => payment !== null);
  };

  const fetchConcurrentOpenPreferPending = async (): Promise<OpenPaymentRow | null> => {
    const concurrentOpen = await fetchConcurrentOpenPayments();
    return selectPreferredOpenPayment(concurrentOpen);
  };

  const fetchConcurrentOpenLatest = async (): Promise<OpenPaymentRow | null> => {
    const concurrentOpen = await fetchConcurrentOpenPayments();
    return findLatestPaymentByEffectiveTime(concurrentOpen, TERMINAL_PAYMENT_STATUSES);
  };

  /**
   * 23505エラー（unique constraint violation）のリカバリ処理
   */
  const handleUniqueConstraintRecovery = async (
    insertError: { code?: string; message: string },
    preferPending: boolean
  ): Promise<EnsurePaymentRecordResult> => {
    const concurrentOpen = preferPending
      ? await fetchConcurrentOpenPreferPending()
      : await fetchConcurrentOpenLatest();

    if (concurrentOpen) {
      if (concurrentOpen.status === "pending") {
        return await reusePendingPayment(concurrentOpen);
      }

      const { data: terminalAfterRace } = await supabase
        .from("payments")
        .select("id")
        .eq("attendance_id", params.attendanceId)
        .in("status", TERMINAL_PAYMENT_STATUSES)
        .order("paid_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (terminalAfterRace) {
        throw new PaymentError(
          PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          "この参加に対する決済は既に完了済みです",
          insertError
        );
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済レコードの作成に失敗しました（再試行してください）",
        insertError
      );
    }

    const { data: terminalAfterRace } = await supabase
      .from("payments")
      .select("id")
      .eq("attendance_id", params.attendanceId)
      .in("status", TERMINAL_PAYMENT_STATUSES)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (terminalAfterRace) {
      throw new PaymentError(
        PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        "この参加に対する決済は既に完了済みです",
        insertError
      );
    }

    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      `決済レコードの作成に失敗しました: ${insertError.message}`,
      insertError
    );
  };

  // --- メインロジック ---
  if (openPayment) {
    if (openPayment.status === "pending") {
      return await reusePendingPayment(openPayment);
    }

    // failed の場合は新規作成
    const newIdempotencyKey = buildIdempotencyKey();
    const { data: payment, error: insertError } = await supabase
      .from("payments")
      .insert({
        attendance_id: params.attendanceId,
        method: "stripe",
        amount: params.amount,
        status: "pending",
        checkout_idempotency_key: newIdempotencyKey,
        checkout_key_revision: 0,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return await handleUniqueConstraintRecovery(insertError, true);
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済レコードの作成に失敗しました: ${insertError.message}`,
        insertError
      );
    }

    assertStripePayment(payment, "payment lookup");
    return {
      paymentId: payment.id,
      idempotencyKey: newIdempotencyKey,
      checkoutKeyRevision: 0,
    };
  }

  // オープン決済がない場合は新規作成
  const newIdempotencyKey = buildIdempotencyKey();
  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      attendance_id: params.attendanceId,
      method: "stripe",
      amount: params.amount,
      status: "pending",
      checkout_idempotency_key: newIdempotencyKey,
      checkout_key_revision: 0,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return await handleUniqueConstraintRecovery(insertError, false);
    }

    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      `決済レコードの作成に失敗しました: ${insertError.message}`,
      insertError
    );
  }

  assertStripePayment(payment, "payment lookup");
  return {
    paymentId: payment.id,
    idempotencyKey: newIdempotencyKey,
    checkoutKeyRevision: 0,
  };
}
