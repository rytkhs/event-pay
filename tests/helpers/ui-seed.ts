import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import {
  createTestUserWithConnect,
  createTestUserWithoutConnect,
  createTestUserWithDisabledPayouts,
  createPaidTestEvent,
  createTestAttendance,
  createPendingTestPayment,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
  type TestPaymentData,
} from "./test-payment-data";

// UI_DEMO_SEED=true
export interface UiSeedOptions {
  /** 作成するイベント数（ユーザーごと） */
  eventsPerUser?: number;
  /** 1イベントあたりの参加者数 */
  participantsPerEvent?: number;
  /** 参加者のうち、pending決済を持つ人数 */
  pendingPaymentsPerEvent?: number;
  /** 有料イベントの割合 (0-1)。残りは無料イベント */
  paidEventRatio?: number;
  /** イベントの料金候補 */
  feeCandidates?: number[];
}

export interface UiSeedResult {
  users: {
    withConnect: TestPaymentUser;
    withoutConnect: TestPaymentUser;
    disabledPayouts: TestPaymentUser;
  };
  events: TestPaymentEvent[];
  attendances: TestAttendanceData[];
  payments: TestPaymentData[];
}

/**
 * UI検証用にボリュームのあるテストデータを生成
 */
export async function seedUiDemoData(options: UiSeedOptions = {}): Promise<UiSeedResult> {
  const {
    eventsPerUser = 10,
    participantsPerEvent = 50,
    pendingPaymentsPerEvent = 20,
    paidEventRatio = 0.8,
    feeCandidates = [500, 1000, 1500, 2000, 5000],
  } = options;

  const withConnect = await createTestUserWithConnect();
  const withoutConnect = await createTestUserWithoutConnect();
  const disabledPayouts = await createTestUserWithDisabledPayouts();

  // 複数ユーザーでイベントを作成（Connect有りユーザー中心）
  const owners: TestPaymentUser[] = [withConnect, withConnect, withoutConnect, disabledPayouts];

  const events: TestPaymentEvent[] = [];
  const attendances: TestAttendanceData[] = [];
  const payments: TestPaymentData[] = [];

  for (const owner of owners) {
    for (let i = 0; i < eventsPerUser; i++) {
      const isPaid = Math.random() < paidEventRatio;
      const fee = isPaid ? feeCandidates[Math.floor(Math.random() * feeCandidates.length)] : 0;

      const event = await createPaidTestEvent(owner.id, {
        fee,
        capacity: null,
        title: `${owner.email.split("@")[0]}のイベント ${i + 1}${fee > 0 ? `（有料:${fee}円）` : "（無料）"}`,
        paymentMethods: fee > 0 ? ["stripe"] : [],
      });
      events.push(event);

      // 参加者を作成
      const createdAttendances: TestAttendanceData[] = [];
      for (let j = 0; j < participantsPerEvent; j++) {
        const a = await createTestAttendance(event.id, {});
        attendances.push(a);
        createdAttendances.push(a);
      }

      // pending 決済を作成（有料イベントのみ）
      if (fee > 0) {
        const target = createdAttendances.slice(
          0,
          Math.min(pendingPaymentsPerEvent, createdAttendances.length)
        );
        await Promise.all(
          target.map(async (a) => {
            const p = await createPendingTestPayment(a.id, {
              amount: fee,
              stripeAccountId: owner.stripeConnectAccountId,
            });
            payments.push(p);
          })
        );
      }
    }
  }

  return {
    users: {
      withConnect,
      withoutConnect,
      disabledPayouts,
    },
    events,
    attendances,
    payments,
  };
}

/**
 * 特定のユーザーに紐づくUIデモデータを生成
 */
export async function seedUiDemoDataForUser(
  owner: { id: string; email: string; stripeConnectAccountId?: string },
  options: UiSeedOptions = {}
): Promise<{
  events: TestPaymentEvent[];
  attendances: TestAttendanceData[];
  payments: TestPaymentData[];
}> {
  const {
    eventsPerUser = 10,
    participantsPerEvent = 50,
    pendingPaymentsPerEvent = 20,
    paidEventRatio = 0.8,
    feeCandidates = [500, 1000, 1500, 2000, 3000, 5000],
  } = options;

  const events: TestPaymentEvent[] = [];
  const attendances: TestAttendanceData[] = [];
  const payments: TestPaymentData[] = [];

  for (let i = 0; i < eventsPerUser; i++) {
    const isPaid = Math.random() < paidEventRatio;
    const fee = isPaid ? feeCandidates[Math.floor(Math.random() * feeCandidates.length)] : 0;

    const event = await createPaidTestEvent(owner.id, {
      fee,
      capacity: null,
      title: `${owner.email.split("@")[0]} のイベント ${i + 1}${fee > 0 ? `（有料:${fee}円）` : "（無料）"}`,
      paymentMethods: fee > 0 ? ["stripe"] : [],
    });
    events.push(event);

    const createdAttendances: TestAttendanceData[] = [];
    for (let j = 0; j < participantsPerEvent; j++) {
      const a = await createTestAttendance(event.id, {});
      attendances.push(a);
      createdAttendances.push(a);
    }

    if (fee > 0) {
      const target = createdAttendances.slice(
        0,
        Math.min(pendingPaymentsPerEvent, createdAttendances.length)
      );
      await Promise.all(
        target.map(async (a) => {
          const p = await createPendingTestPayment(a.id, {
            amount: fee,
            stripeAccountId: owner.stripeConnectAccountId,
          });
          payments.push(p);
        })
      );
    }
  }

  return { events, attendances, payments };
}

/**
 * UIデモデータを全削除（危険）
 * 注意: auth.users の削除までは行わない。必要に応じて tests/helpers/test-user.ts の deleteTestUser を使うこと。
 */
export async function cleanupUiDemoData(): Promise<void> {
  const secureFactory = SecureSupabaseClientFactory.getInstance();
  const admin = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_CLEANUP,
    "Cleanup UI demo data",
    {
      operationType: "DELETE",
      accessedTables: [
        "public.payments",
        "public.attendances",
        "public.events",
        "public.stripe_connect_accounts",
      ],
      additionalInfo: { scope: "ui-demo" },
    }
  );

  // payments -> attendances -> events の順に削除
  await admin.from("payments").delete().neq("id", "");
  await admin.from("attendances").delete().neq("id", "");
  await admin.from("events").delete().neq("id", "");
}
