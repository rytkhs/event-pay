/**
 * モック設定ヘルパー
 *
 * レースコンディションテスト用のモック設定とクリーンアップを提供
 * 仕様書: P0-3_race_condition_specification.md TC-RC-003用実装
 */

import { jest } from "@jest/globals";

import * as guestTokenUtils from "@core/utils/guest-token";

export interface MockTokenConfig {
  fixedToken: string;
  callCount?: number;
}

/**
 * モック設定ヘルパークラス
 *
 * テスト用のモック設定とクリーンアップを管理
 */
export class MockSetupHelper {
  private static activeMocks: jest.MockedFunction<any>[] = [];

  /**
   * ゲストトークン生成を固定値に設定
   *
   * TC-RC-003でゲストトークン重複を意図的に発生させるために使用
   *
   * @param config モック設定
   * @returns モック関数
   */
  static mockGuestTokenGeneration(
    config: MockTokenConfig
  ): jest.MockedFunction<typeof guestTokenUtils.generateGuestToken> {
    const { fixedToken, callCount } = config;

    // generateGuestTokenをモック化
    const mockFn = jest.spyOn(guestTokenUtils, "generateGuestToken").mockReturnValue(fixedToken);

    // アクティブなモックリストに追加
    this.activeMocks.push(mockFn);

    // 呼び出し回数を制限する場合
    if (callCount !== undefined) {
      let currentCallCount = 0;
      mockFn.mockImplementation(() => {
        currentCallCount++;
        if (currentCallCount <= callCount) {
          return fixedToken;
        } else {
          // 制限回数を超えた場合は元の実装を呼び出し
          mockFn.mockRestore();
          return guestTokenUtils.generateGuestToken();
        }
      });
    }

    return mockFn;
  }

  /**
   * 重複ゲストトークンのテスト用モック設定
   *
   * TC-RC-003用の専用設定
   *
   * @param duplicateCount 重複させる回数（デフォルト: 2）
   * @returns モック情報
   */
  static setupDuplicateGuestTokenTest(duplicateCount: number = 2): {
    mockToken: string;
    mockFn: jest.MockedFunction<typeof guestTokenUtils.generateGuestToken>;
    teardown: () => void;
  } {
    // 意図的に重複させるための固定トークン
    const mockToken = "gst_" + "a".repeat(32);

    const mockFn = this.mockGuestTokenGeneration({
      fixedToken: mockToken,
      callCount: duplicateCount,
    });

    return {
      mockToken,
      mockFn,
      teardown: () => this.restoreMocks(),
    };
  }

  /**
   * 時刻制御モックの設定
   *
   * レースコンディションテストで時刻を固定する場合に使用
   *
   * @param fixedDate 固定する日時
   * @returns モック情報
   */
  static mockSystemTime(fixedDate: Date | string): {
    originalDate: DateConstructor;
    restore: () => void;
  } {
    const originalDate = Date;
    const fixedTime =
      typeof fixedDate === "string" ? new Date(fixedDate).getTime() : fixedDate.getTime();

    // Jest fake timers を使用
    jest.useFakeTimers();
    jest.setSystemTime(fixedTime);

    return {
      originalDate,
      restore: () => {
        jest.useRealTimers();
      },
    };
  }

  /**
   * UUID生成を予測可能にする
   *
   * テスト結果の再現性を高めるために使用
   *
   * @param sequence 生成するUUIDのシーケンス
   * @returns モック情報
   */
  static mockUUIDGeneration(sequence: string[]): {
    currentIndex: number;
    mockFn: jest.MockedFunction<any> | null;
    restore: () => void;
  } {
    let currentIndex = 0;
    let mockFn: jest.MockedFunction<any> | null = null;

    try {
      // crypto.randomUUIDが利用可能な場合
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        mockFn = jest.spyOn(crypto, "randomUUID").mockImplementation(() => {
          const uuid = sequence[currentIndex % sequence.length];
          currentIndex++;
          return uuid;
        });
        this.activeMocks.push(mockFn);
      }
    } catch (error) {
      // crypto が利用できない場合は何もしない
      console.warn("crypto.randomUUID is not available for mocking");
    }

    return {
      currentIndex,
      mockFn,
      restore: () => {
        if (mockFn) {
          mockFn.mockRestore();
          this.activeMocks = this.activeMocks.filter((mock) => mock !== mockFn);
        }
      },
    };
  }

  /**
   * Stripe API レスポンスのモック設定
   *
   * 決済処理のレースコンディションテスト用
   *
   * @param responses モックするレスポンスの配列
   * @returns モック情報
   */
  static mockStripeAPIResponses(responses: Array<{ success: boolean; data?: any; error?: any }>): {
    mockFn: jest.MockedFunction<any> | null;
    restore: () => void;
  } {
    // 実際のStripe実装に応じて調整が必要
    // ここでは基本的な構造のみ提供

    return {
      mockFn: null,
      restore: () => {
        // Stripe関連のモック復旧処理
      },
    };
  }

  /**
   * セキュリティログキャプチャの設定
   *
   * レースコンディション発生時のログ記録をテストで検証するために使用
   *
   * @returns ログキャプチャ機能
   */
  static captureSecurityLogs(): {
    logs: Array<{
      type: string;
      message: string;
      details?: any;
      context?: any;
    }>;
    mockFn: jest.MockedFunction<any> | null;
    restore: () => void;
  } {
    const capturedLogs: Array<{
      type: string;
      message: string;
      details?: any;
      context?: any;
    }> = [];

    let mockFn: jest.MockedFunction<any> | null = null;

    try {
      // セキュリティロガーのモック（実装に応じて調整）
      const securityLogger = require("@core/security/security-logger");
      if (securityLogger.logParticipationSecurityEvent) {
        mockFn = jest
          .spyOn(securityLogger, "logParticipationSecurityEvent")
          .mockImplementation((type: string, message: string, details?: any, context?: any) => {
            capturedLogs.push({ type, message, details, context });
            return Promise.resolve();
          });
        this.activeMocks.push(mockFn);
      }
    } catch (error) {
      console.warn("Security logger mocking failed:", error);
    }

    return {
      logs: capturedLogs,
      mockFn,
      restore: () => {
        if (mockFn) {
          mockFn.mockRestore();
          this.activeMocks = this.activeMocks.filter((mock) => mock !== mockFn);
        }
      },
    };
  }

  /**
   * すべてのアクティブなモックを復旧
   *
   * テスト終了時のクリーンアップで使用
   */
  static restoreMocks(): void {
    // 全てのアクティブなモックを復旧
    for (const mock of this.activeMocks) {
      try {
        mock.mockRestore();
      } catch (error) {
        console.warn("Failed to restore mock:", error);
      }
    }

    // アクティブモックリストをクリア
    this.activeMocks = [];

    // Jest timers をリアルタイムに戻す
    try {
      jest.useRealTimers();
    } catch (error) {
      // 既にリアルタイムの場合は無視
    }
  }

  /**
   * テストセットアップ用の包括的なモック設定
   *
   * よく使用される組み合わせを一括設定
   *
   * @param options セットアップオプション
   * @returns セットアップ結果
   */
  static setupComprehensiveTestMocks(
    options: {
      fixedTime?: Date | string;
      duplicateGuestTokens?: boolean;
      captureSecurityLogs?: boolean;
      predictableUUIDs?: string[];
    } = {}
  ): {
    timeControl?: ReturnType<typeof this.mockSystemTime>;
    guestTokenDuplication?: ReturnType<typeof this.setupDuplicateGuestTokenTest>;
    securityLogCapture?: ReturnType<typeof this.captureSecurityLogs>;
    uuidMock?: ReturnType<typeof this.mockUUIDGeneration>;
    restoreAll: () => void;
  } {
    const results: any = {};

    // 時刻制御
    if (options.fixedTime) {
      results.timeControl = this.mockSystemTime(options.fixedTime);
    }

    // ゲストトークン重複
    if (options.duplicateGuestTokens) {
      results.guestTokenDuplication = this.setupDuplicateGuestTokenTest();
    }

    // セキュリティログキャプチャ
    if (options.captureSecurityLogs) {
      results.securityLogCapture = this.captureSecurityLogs();
    }

    // 予測可能なUUID
    if (options.predictableUUIDs) {
      results.uuidMock = this.mockUUIDGeneration(options.predictableUUIDs);
    }

    return {
      ...results,
      restoreAll: () => {
        this.restoreMocks();
        if (results.timeControl) results.timeControl.restore();
        if (results.guestTokenDuplication) results.guestTokenDuplication.teardown();
        if (results.securityLogCapture) results.securityLogCapture.restore();
        if (results.uuidMock) results.uuidMock.restore();
      },
    };
  }
}
