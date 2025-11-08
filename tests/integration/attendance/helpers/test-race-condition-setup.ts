/**
 * レースコンディションテスト用セットアップヘルパー
 *
 * レースコンディションテストで使用される共通の setup/teardown ロジックを提供
 * テストデータの作成とクリーンアップを一元管理
 *
 * 共通セットアップ関数を使用してリファクタリング済み
 */

import { MockSetupHelper } from "@tests/helpers/test-mock-setup";
import {
  createPaidTestEvent,
  type TestPaymentUser,
  type TestPaymentEvent,
} from "@tests/helpers/test-payment-data";
import { createCommonTestSetup } from "@tests/setup/common-test-setup";

import type { Database } from "@/types/database";

type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];

export interface RaceConditionTestData {
  organizer: TestPaymentUser;
  testEvent: TestPaymentEvent;
}

export interface RaceConditionTestDataWithFreeEvent {
  organizer: TestPaymentUser;
  testEvent: TestPaymentEvent;
  freeEvent: TestPaymentEvent;
}

export interface RaceConditionTestSetup {
  testData: RaceConditionTestData | RaceConditionTestDataWithFreeEvent;
  securityLogCapture: ReturnType<typeof MockSetupHelper.captureSecurityLogs>;
  cleanup: () => Promise<void>;
}

export interface EventOptions {
  title?: string;
  capacity?: number | null;
  fee?: number;
  payment_methods?: PaymentMethod[];
}

/**
 * レースコンディションテストのセットアップ
 *
 * @param options セットアップオプション
 * @param options.organizerEmail オーガナイザーのメールアドレス
 * @param options.eventOptions イベント作成オプション
 * @param options.createFreeEvent 無料イベントも作成するか（TC-RC-002用）
 * @returns セットアップ結果とクリーンアップ関数
 */
export async function setupRaceConditionTest(options?: {
  organizerEmail?: string;
  eventOptions?: EventOptions;
  createFreeEvent?: boolean;
}): Promise<RaceConditionTestSetup> {
  const { organizerEmail, eventOptions, createFreeEvent = false } = options || {};

  // セキュリティログキャプチャ設定
  const securityLogCapture = MockSetupHelper.captureSecurityLogs();

  // 共通テストセットアップを使用（Connect設定済みユーザーを作成）
  const defaultEmail = organizerEmail || `test-organizer-${Date.now()}@example.com`;
  const commonSetup = await createCommonTestSetup({
    testName: `race-condition-test-${Date.now()}`,
    withConnect: true,
    withEvent: false, // イベントは個別に作成する
    accessedTables: ["public.events", "public.attendances", "public.payments"],
  });
  const organizer = commonSetup.testUser as TestPaymentUser;

  // テストイベント作成
  const defaultEventOptions: EventOptions = {
    title: "レースコンディションテスト",
    capacity: 1,
    fee: 1000,
    payment_methods: ["stripe"] as PaymentMethod[],
  };

  const mergedEventOptions = { ...defaultEventOptions, ...eventOptions };
  const testEvent = await createPaidTestEvent(organizer.id, {
    title: mergedEventOptions.title,
    capacity: mergedEventOptions.capacity,
    fee: mergedEventOptions.fee,
    paymentMethods: mergedEventOptions.payment_methods,
  });

  // 無料イベントも作成する場合（TC-RC-002用）
  let testData: RaceConditionTestData | RaceConditionTestDataWithFreeEvent;
  if (createFreeEvent) {
    const freeEvent = await createPaidTestEvent(organizer.id, {
      title: `${mergedEventOptions.title}（無料）`,
      capacity: null,
      fee: 0,
      payment_methods: [] as PaymentMethod[],
    });
    testData = { organizer, testEvent, freeEvent };
  } else {
    testData = { organizer, testEvent };
  }

  // クリーンアップ関数（共通セットアップのクリーンアップも含める）
  const cleanup = async () => {
    await commonSetup.cleanup();
    securityLogCapture.restore();
    MockSetupHelper.restoreMocks();
  };

  return {
    testData,
    securityLogCapture,
    cleanup,
  };
}
