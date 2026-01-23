/**
 * 並行リクエスト実行ヘルパー
 *
 * レースコンディションテストのための同時リクエスト実行とその検証を提供
 * 仕様書: P0-3_race_condition_specification.md 5.2節実装
 */

import type { ServerActionResult } from "@core/types/server-actions";
import type { ParticipationFormData } from "@core/validation/participation";

import type { RegisterParticipationData } from "@features/invite/types";

import { registerParticipationAction } from "@/app/invite/[token]/actions";

export interface ConcurrentRequestOptions {
  delayMs?: number;
  timeout?: number;
}

export interface ConcurrentRequestResult<T> {
  successCount: number;
  failureCount: number;
  results: Array<PromiseSettledResult<T>>;
  successResults: T[];
  failureResults: Array<{
    reason: unknown;
    error?: {
      type: string;
      message: string;
    };
  }>;
}

/**
 * 並行リクエスト実行ヘルパークラス
 *
 * 仕様書に基づいた同時実行テストとその結果検証を提供
 */
export class ConcurrentRequestHelper {
  /**
   * 複数のリクエストを同時実行する
   *
   * @param requests 実行する非同期関数の配列
   * @param options 実行オプション
   * @returns Promise settled results
   */
  static async executeSimultaneous<T>(
    requests: Array<() => Promise<T>>,
    options: ConcurrentRequestOptions = {}
  ): Promise<Array<PromiseSettledResult<T>>> {
    // 最小限の遅延後に同時実行（レースコンディション発生確率を高めるため）
    if (options.delayMs) {
      await new Promise((resolve) => {
        const delayTimerId = setTimeout(() => {
          clearTimeout(delayTimerId);
          resolve(undefined);
        }, options.delayMs);
      });
    }

    const executePromises = requests.map((fn) => fn());

    if (options.timeout) {
      // タイマーIDを追跡してクリーンアップを確実にする
      const timerIds: NodeJS.Timeout[] = [];

      const timeoutPromises = executePromises.map((promise, index) => {
        let timerId: NodeJS.Timeout;

        const timeoutPromise = new Promise<never>((_, reject) => {
          timerId = setTimeout(
            () => reject(new Error("Request timeout")),
            options.timeout || 30000
          );
          timerIds[index] = timerId;
        });

        // レース完了時にタイマーをクリア
        return Promise.race([promise.finally(() => clearTimeout(timerIds[index])), timeoutPromise]);
      });

      try {
        return await Promise.allSettled(timeoutPromises);
      } finally {
        // 念のため残存タイマーをすべてクリア
        timerIds.forEach((id) => id && clearTimeout(id));
      }
    }

    return Promise.allSettled(executePromises);
  }

  /**
   * 結果を分析し、成功・失敗数をカウント
   *
   * @param results Promise settled results
   * @returns 分析結果
   */
  static analyzeConcurrentResults<T>(
    results: Array<PromiseSettledResult<T>>
  ): ConcurrentRequestResult<T> {
    const successResults: T[] = [];
    const failureResults: Array<{
      reason: unknown;
      error?: { type: string; message: string };
    }> = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        // 【修正】ServerActionResultの success フィールドをチェック
        const actionResult = result.value;
        if (actionResult && typeof actionResult === "object" && "success" in actionResult) {
          if (actionResult.success === true) {
            // ServerActionResult で成功の場合
            successResults.push(result.value);
          } else {
            // ServerActionResult で失敗の場合（success: false）
            // ServerActionError型の場合のプロパティアクセス
            const errorResult = actionResult as { success: false; code?: string; error?: string };
            failureResults.push({
              reason: actionResult,
              error: {
                type: errorResult.code || "UNKNOWN",
                message: errorResult.error || "Unknown error",
              },
            });
          }
        } else {
          // ServerActionResult 以外の形式の場合は成功として扱う
          successResults.push(result.value);
        }
      } else {
        // Promise が reject された場合
        const reason = result.reason;
        if (reason && typeof reason === "object" && "success" in reason && !reason.success) {
          failureResults.push({
            reason,
            error: {
              type: reason.error?.type || "UNKNOWN",
              message: reason.error?.message || "Unknown error",
            },
          });
        } else {
          failureResults.push({ reason });
        }
      }
    }

    return {
      successCount: successResults.length,
      failureCount: failureResults.length,
      results,
      successResults,
      failureResults,
    };
  }

  /**
   * 正確に1つのリクエストのみ成功することを検証
   *
   * レースコンディション対策が正しく動作していることを確認
   *
   * @param results Promise settled results
   * @returns 検証結果
   */
  static verifyExactlyOneSuccess<T>(results: Array<PromiseSettledResult<T>>): {
    success: boolean;
    message: string;
    successCount: number;
    failureCount: number;
    successResult?: T;
  } {
    const analysis = this.analyzeConcurrentResults(results);
    const { successCount, failureCount, successResults } = analysis;

    if (successCount === 1) {
      return {
        success: true,
        message: `正常：${successCount}つの成功、${failureCount}つの失敗`,
        successCount,
        failureCount,
        successResult: successResults[0],
      };
    } else {
      return {
        success: false,
        message: `異常：${successCount}つの成功（期待値：1）、${failureCount}つの失敗`,
        successCount,
        failureCount,
        successResult: successResults[0],
      };
    }
  }

  /**
   * 参加登録アクションを並行実行するヘルパー
   *
   * @param participationDataArray 参加登録データの配列
   * @param options 実行オプション
   * @returns 実行結果
   */
  static async executeParticipationRequests(
    participationDataArray: ParticipationFormData[],
    options: ConcurrentRequestOptions = {}
  ): Promise<ConcurrentRequestResult<ServerActionResult<RegisterParticipationData>>> {
    const requests = participationDataArray.map((data) => () => {
      const formData = this.createFormDataFromParticipationData(data);
      return registerParticipationAction(formData);
    });

    const results = await this.executeSimultaneous(requests, options);
    return this.analyzeConcurrentResults(results);
  }

  /**
   * ParticipationFormDataからFormDataを作成
   *
   * @param data 参加データ
   * @returns FormData
   */
  private static createFormDataFromParticipationData(data: ParticipationFormData): FormData {
    const formData = new FormData();
    formData.append("inviteToken", data.inviteToken);
    formData.append("nickname", data.nickname);
    formData.append("email", data.email);
    formData.append("attendanceStatus", data.attendanceStatus);
    if (data.paymentMethod) {
      formData.append("paymentMethod", data.paymentMethod);
    }
    return formData;
  }

  /**
   * エラー型が期待値と一致することを検証
   *
   * @param failureResults 失敗結果の配列
   * @param expectedErrorType 期待されるエラー型
   * @param expectedErrorMessage 期待されるエラーメッセージ（部分一致）
   * @returns 検証結果
   */
  static verifyExpectedErrors(
    failureResults: Array<{
      reason: unknown;
      error?: { type: string; message: string };
    }>,
    expectedErrorType: string,
    expectedErrorMessage?: string
  ): {
    success: boolean;
    message: string;
    matchingErrors: number;
  } {
    let matchingErrors = 0;

    for (const failure of failureResults) {
      const errorType = failure.error?.type;
      const errorMessage = failure.error?.message;

      if (errorType === expectedErrorType) {
        if (!expectedErrorMessage || errorMessage?.includes(expectedErrorMessage)) {
          matchingErrors++;
        }
      }
    }

    const success = matchingErrors === failureResults.length;

    return {
      success,
      message: success
        ? `全ての失敗リクエストが期待されるエラー型 ${expectedErrorType} でした`
        : `期待されるエラー型 ${expectedErrorType} は ${matchingErrors}/${failureResults.length} 件でした`,
      matchingErrors,
    };
  }
}
