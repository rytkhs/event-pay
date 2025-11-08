/**
 * 基本参加登録フロー統合テスト共通セットアップ
 */

import type { TestPaymentUser } from "@tests/helpers/test-payment-data";
import { createPaymentTestSetup } from "@tests/setup/common-test-setup";

export interface TestData {
  user: TestPaymentUser;
  eventId: string;
  inviteToken: string;
}

export interface SecurityLogEntry {
  type: string;
  message: string;
  details?: any;
}

export interface BasicParticipationFlowTestSetup {
  testData: TestData;
  securityLogs: SecurityLogEntry[];
  securityLogSpy: jest.SpyInstance;
  cleanup: () => Promise<void>;
}

/**
 * 基本参加登録フローテストのセットアップ
 *
 * @param options セットアップオプション
 * @param options.fee イベントの参加費（デフォルト: 0）
 * @param options.paymentMethods 決済方法（デフォルト: []）
 * @returns テストデータとセキュリティログキャプチャを含むセットアップオブジェクト
 */
export async function setupBasicParticipationFlowTest(options?: {
  fee?: number;
  paymentMethods?: string[];
}): Promise<BasicParticipationFlowTestSetup> {
  // 決済テスト用のセットアップを作成
  const paymentSetup = await createPaymentTestSetup({
    testName: `basic-participation-flow-${Date.now()}`,
    eventFee: options?.fee ?? 0,
    paymentMethods: options?.paymentMethods ?? [],
  });

  // セキュリティログキャプチャ開始
  const securityLogs: SecurityLogEntry[] = [];
  const securityLogSpy = jest
    .spyOn(require("@core/security/security-logger"), "logParticipationSecurityEvent")
    .mockImplementation((...args: any[]) => {
      const [type, message, details] = args;
      securityLogs.push({ type, message, details });
    });

  const testData: TestData = {
    user: paymentSetup.testUser,
    eventId: paymentSetup.testEvent.id,
    inviteToken: paymentSetup.testEvent.invite_token,
  };

  // クリーンアップ関数
  const cleanup = async () => {
    // 共通セットアップ関数のcleanupを呼び出してテストデータをクリーンアップ
    await paymentSetup.cleanup();
    securityLogSpy.mockRestore();
  };

  return {
    testData,
    securityLogs,
    securityLogSpy,
    cleanup,
  };
}
