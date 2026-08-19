import type { AppDatabase, AppSupabaseClient } from "@core/types/supabase";

import { createLocalAdminClient } from "../setup/local-supabase";

import { test as rsvpTest, type TestAttendance, type TestEvent } from "./rsvp";

/**
 * 有料イベント上の Payment を組み立てる fixture。
 *
 * payments は `authenticated` に SELECT しか許可していないため、投入と最終状態の
 * 検証はすべて service_role で行う。RPC の検証だけが `organizerClient` を必要とする。
 *
 * teardown は持たない。payments / attendances / events は `community` fixture の
 * delete で、`payout_profiles` は `organizer` 削除時の cascade で消える。
 * `payout_profiles` を明示的に消してはならない。payments が残っている状態では
 * FK 違反になるうえ、削除順に依存した後始末になる。
 */

type PaymentMethod = AppDatabase["public"]["Enums"]["payment_method_enum"];
type PaymentStatus = AppDatabase["public"]["Enums"]["payment_status_enum"];
type PaymentInsert = AppDatabase["public"]["Tables"]["payments"]["Insert"];

/** 有料イベントの参加費。`events_fee_check`（0 または 100〜1,000,000）を満たす。 */
export const PAID_EVENT_FEE = 1000;

/**
 * 支払期限。`registration_deadline`（2099-05-31）以降かつ
 * イベント日（2099-06-01）の30日以内に収める。
 */
const PAYMENT_DEADLINE = "2099-06-15T00:00:00.000Z";

/** 入金日時の固定値。実時刻に依存させない。 */
export const PAYMENT_PAID_AT = "2026-01-01T00:00:00.000Z";

const PAYMENT_SELECT =
  "id, attendance_id, method, status, amount, version, paid_at, payout_profile_id, stripe_payment_intent_id";

export type TestPayoutProfile = {
  id: string;
  ownerUserId: string;
  stripeAccountId: string;
};

export type TestPayment = {
  id: string;
  attendanceId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  version: number;
  paidAt: string | null;
  payoutProfileId: string | null;
  stripePaymentIntentId: string | null;
};

/** 永続化後の検証に使うスナップショット。 */
export type PaymentSnapshot = Omit<TestPayment, "id" | "attendanceId">;

/** payments 行の入力値。`attendanceId` と `label` 以外は列をそのまま上書きできる。 */
export type BuildPaymentOptions = Partial<PaymentInsert> & {
  attendanceId: string;
  /** メールアドレスと PaymentIntent ID の一意化に使う識別子。省略時は自動採番。 */
  label?: string;
};

export type PaymentFactory = {
  /** `paidEvent` 上に参加者を1件作る。 */
  createAttendance(label?: string): Promise<TestAttendance>;
  /** DB契約を満たす payments 行の値を組み立てる。insert はしない。 */
  buildPayment(options: BuildPaymentOptions): PaymentInsert;
  createPayment(options: BuildPaymentOptions): Promise<TestPayment>;
  /** 参加者ごと新規に作る短縮形。 */
  createPaymentWithAttendance(
    options?: Omit<BuildPaymentOptions, "attendanceId">
  ): Promise<TestPayment>;
  /** 最新の永続化状態を service_role で読む。 */
  readPayment(paymentId: string): Promise<PaymentSnapshot>;
  /** グローバルに一意な PaymentIntent ID。 */
  stripeIntentId(label?: string): string;
  /** 並行 insert 用の独立した service_role クライアント。 */
  createAdminClient(): AppSupabaseClient;
};

export type PaymentFixtures = {
  /** 現金と Stripe の両方を受け付ける有料イベント。定員は無制限。 */
  paidEvent: TestEvent;
  /** `organizer` が所有する受取先プロファイル。 */
  payoutProfile: TestPayoutProfile;
  payment: PaymentFactory;
  /** `paidEvent` 上の未収の現金 Payment。 */
  cashPayment: TestPayment;
};

type PaymentRow = {
  id: string;
  attendance_id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  version: number;
  paid_at: string | null;
  payout_profile_id: string | null;
  stripe_payment_intent_id: string | null;
};

function toTestPayment(row: PaymentRow): TestPayment {
  return {
    id: row.id,
    attendanceId: row.attendance_id,
    method: row.method,
    status: row.status,
    amount: row.amount,
    version: row.version,
    paidAt: row.paid_at,
    payoutProfileId: row.payout_profile_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
  };
}

export const test = rsvpTest.extend<PaymentFixtures>({
  paidEvent: async ({ rsvp }, use) => {
    await use(
      await rsvp.createEvent({
        fee: PAID_EVENT_FEE,
        // 既定の定員1のままだと2人目の参加者を作れない。
        capacity: null,
        paymentMethods: ["cash", "stripe"],
        paymentDeadline: PAYMENT_DEADLINE,
      })
    );
  },

  payoutProfile: async ({ adminClient, organizer, unique }, use) => {
    const { data, error } = await adminClient
      .from("payout_profiles")
      .insert({
        owner_user_id: organizer.id,
        stripe_account_id: `acct_${unique.token.replaceAll("-", "")}`,
        status: "verified",
        payouts_enabled: true,
        collection_ready: true,
      })
      .select("id, owner_user_id, stripe_account_id")
      .single();

    if (error || !data) {
      throw new Error(
        `テスト受取先プロファイルの作成に失敗しました: ${error?.message ?? "row が空です"}`
      );
    }

    await use({
      id: data.id,
      ownerUserId: data.owner_user_id,
      stripeAccountId: data.stripe_account_id,
    });
  },

  payment: async ({ adminClient, paidEvent, payoutProfile, rsvp, unique }, use) => {
    let sequence = 0;
    const nextLabel = () => {
      sequence += 1;
      return `payment-${sequence}`;
    };

    const stripeIntentId = (label = "intent") => `pi_${unique.token.replaceAll("-", "")}_${label}`;

    const createAttendance = (label?: string) =>
      rsvp.createAttendance({ eventId: paidEvent.id, label: label ?? nextLabel() });

    const buildPayment = ({
      attendanceId,
      label,
      ...overrides
    }: BuildPaymentOptions): PaymentInsert => {
      const resolvedLabel = label ?? nextLabel();
      const method = overrides.method ?? "cash";
      const status = overrides.status ?? "pending";

      // その組合せで DB契約を満たす最小の行を組み立て、呼び出し側の指定で上書きする。
      // 違反させたい制約だけを1本ずつ踏ませるための既定値。
      const base: PaymentInsert = {
        attendance_id: attendanceId,
        amount: PAID_EVENT_FEE,
        method,
        status,
      };

      if (status === "paid" || status === "received") {
        base.paid_at = PAYMENT_PAID_AT;
      }

      if (method === "stripe") {
        base.payout_profile_id = payoutProfile.id;
        base.stripe_account_id = payoutProfile.stripeAccountId;
        base.destination_account_id = payoutProfile.stripeAccountId;

        if (status !== "pending" && status !== "canceled") {
          base.stripe_payment_intent_id = stripeIntentId(resolvedLabel);
        }
      }

      return { ...base, ...overrides };
    };

    const createPayment = async (options: BuildPaymentOptions): Promise<TestPayment> => {
      const { data, error } = await adminClient
        .from("payments")
        .insert(buildPayment(options))
        .select(PAYMENT_SELECT)
        .single();

      if (error || !data) {
        throw new Error(`テスト決済の作成に失敗しました: ${error?.message ?? "row が空です"}`);
      }

      return toTestPayment(data);
    };

    const createPaymentWithAttendance = async (
      options: Omit<BuildPaymentOptions, "attendanceId"> = {}
    ): Promise<TestPayment> => {
      const label = options.label ?? nextLabel();
      const attendance = await createAttendance(label);
      return createPayment({ ...options, attendanceId: attendance.id, label });
    };

    const readPayment = async (paymentId: string): Promise<PaymentSnapshot> => {
      const { data, error } = await adminClient
        .from("payments")
        .select(PAYMENT_SELECT)
        .eq("id", paymentId)
        .single();

      if (error || !data) {
        throw new Error(`テスト決済の読み取りに失敗しました: ${error?.message ?? "row が空です"}`);
      }

      const { id: _id, attendanceId: _attendanceId, ...snapshot } = toTestPayment(data);
      return snapshot;
    };

    await use({
      createAttendance,
      buildPayment,
      createPayment,
      createPaymentWithAttendance,
      readPayment,
      stripeIntentId,
      createAdminClient: createLocalAdminClient,
    });
  },

  cashPayment: async ({ payment }, use) => {
    await use(await payment.createPaymentWithAttendance());
  },
});
