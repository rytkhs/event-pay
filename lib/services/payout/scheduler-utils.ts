/**
 * PayoutSchedulerユーティリティ関数
 *
 * スケジューラーで使用する共通的な処理を提供
 */

import { PayoutSchedulerLog, SchedulerExecutionResult, SchedulerExecutionSummary } from "./types";

/**
 * 実行結果のサマリーを生成する
 */
export function generateExecutionSummary(result: SchedulerExecutionResult): string {
  const {
    eligibleEventsCount,
    successfulPayouts,
    failedPayouts,
    totalAmount,
    dryRun,
    error,
  } = result;

  if (error) {
    return `実行エラー: ${error}`;
  }

  if (dryRun) {
    return `ドライラン完了: ${eligibleEventsCount}件のイベントが送金対象（総額: ¥${totalAmount.toLocaleString()}）`;
  }

  if (eligibleEventsCount === 0) {
    return "送金対象のイベントはありませんでした";
  }

  const successRate = eligibleEventsCount > 0
    ? Math.round((successfulPayouts / eligibleEventsCount) * 100)
    : 0;

  if (failedPayouts === 0) {
    return `送金処理完了: ${successfulPayouts}件成功（総額: ¥${totalAmount.toLocaleString()}）`;
  } else {
    return `送金処理完了: ${successfulPayouts}件成功、${failedPayouts}件失敗（成功率: ${successRate}%、総額: ¥${totalAmount.toLocaleString()}）`;
  }
}

/**
 * 実行時間を人間が読みやすい形式に変換する
 */
export function formatProcessingTime(processingTimeMs: number): string {
  if (processingTimeMs < 1000) {
    return `${processingTimeMs}ms`;
  }

  const seconds = Math.floor(processingTimeMs / 1000);
  const remainingMs = processingTimeMs % 1000;

  if (seconds < 60) {
    return remainingMs > 0
      ? `${seconds}.${Math.floor(remainingMs / 100)}s`
      : `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`;
}

/**
 * 実行結果の統計情報を計算する
 */
export function calculateExecutionStats(logs: PayoutSchedulerLog[]): SchedulerExecutionSummary {
  if (logs.length === 0) {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalPayoutsProcessed: 0,
      totalAmountProcessed: 0,
      averageProcessingTime: 0,
    };
  }

  const successfulExecutions = logs.filter(log => !log.error_message).length;
  const failedExecutions = logs.length - successfulExecutions;
  const totalPayoutsProcessed = logs.reduce((sum, log) => sum + log.successful_payouts, 0);
  const totalAmountProcessed = logs.reduce((sum, log) => sum + log.total_amount, 0);
  const averageProcessingTime = logs.reduce((sum, log) => sum + log.processing_time_ms, 0) / logs.length;

  return {
    totalExecutions: logs.length,
    successfulExecutions,
    failedExecutions,
    totalPayoutsProcessed,
    totalAmountProcessed,
    averageProcessingTime: Math.round(averageProcessingTime),
  };
}

/**
 * 実行結果をCSV形式に変換する
 */
export function exportExecutionResultsToCSV(logs: PayoutSchedulerLog[]): string {
  const headers = [
    "実行ID",
    "開始時刻",
    "終了時刻",
    "処理時間(ms)",
    "対象イベント数",
    "成功送金数",
    "失敗送金数",
    "総送金額",
    "ドライラン",
    "エラーメッセージ",
  ];

  const rows = logs.map(log => [
    log.execution_id,
    log.start_time,
    log.end_time,
    log.processing_time_ms.toString(),
    log.eligible_events_count.toString(),
    log.successful_payouts.toString(),
    log.failed_payouts.toString(),
    log.total_amount.toString(),
    log.dry_run ? "はい" : "いいえ",
    log.error_message || "",
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return csvContent;
}

/**
 * 実行結果の詳細をJSON形式で出力する
 */
export function exportExecutionResultsToJSON(logs: PayoutSchedulerLog[]): string {
  const exportData = {
    exportedAt: new Date().toISOString(),
    totalLogs: logs.length,
    summary: calculateExecutionStats(logs),
    logs: logs.map(log => ({
      ...log,
      processingTimeFormatted: formatProcessingTime(log.processing_time_ms),
      summaryText: generateExecutionSummary({
        executionId: log.execution_id,
        startTime: new Date(log.start_time),
        endTime: new Date(log.end_time),
        eligibleEventsCount: log.eligible_events_count,
        successfulPayouts: log.successful_payouts,
        failedPayouts: log.failed_payouts,
        totalAmount: log.total_amount,
        results: log.results,
        summary: log.summary || undefined,
        error: log.error_message || undefined,
        dryRun: log.dry_run,
      }),
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * 実行結果のフィルタリング
 */
export function filterExecutionLogs(
  logs: PayoutSchedulerLog[],
  filters: {
    successOnly?: boolean;
    failedOnly?: boolean;
    dryRunOnly?: boolean;
    actualRunOnly?: boolean;
    minAmount?: number;
    maxAmount?: number;
    startDate?: Date;
    endDate?: Date;
  }
): PayoutSchedulerLog[] {
  return logs.filter(log => {
    // 成功のみ
    if (filters.successOnly && log.error_message) {
      return false;
    }

    // 失敗のみ
    if (filters.failedOnly && !log.error_message) {
      return false;
    }

    // ドライランのみ
    if (filters.dryRunOnly && !log.dry_run) {
      return false;
    }

    // 実際の実行のみ
    if (filters.actualRunOnly && log.dry_run) {
      return false;
    }

    // 最小金額
    if (filters.minAmount !== undefined && log.total_amount < filters.minAmount) {
      return false;
    }

    // 最大金額
    if (filters.maxAmount !== undefined && log.total_amount > filters.maxAmount) {
      return false;
    }

    // 開始日
    if (filters.startDate && new Date(log.start_time) < filters.startDate) {
      return false;
    }

    // 終了日
    if (filters.endDate && new Date(log.start_time) > filters.endDate) {
      return false;
    }

    return true;
  });
}

/**
 * 実行結果のグループ化（日別、週別、月別）
 */
export function groupExecutionLogsByPeriod(
  logs: PayoutSchedulerLog[],
  period: "day" | "week" | "month"
): Record<string, {
  logs: PayoutSchedulerLog[];
  summary: SchedulerExecutionSummary;
}> {
  const groups: Record<string, PayoutSchedulerLog[]> = {};

  logs.forEach(log => {
    const date = new Date(log.start_time);
    let key: string;

    switch (period) {
      case "day":
        key = date.toISOString().split("T")[0]; // YYYY-MM-DD
        break;
      case "week":
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // 週の始まり（日曜日）
        key = weekStart.toISOString().split("T")[0];
        break;
      case "month":
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; // YYYY-MM
        break;
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(log);
  });

  // 各グループのサマリーを計算
  const result: Record<string, {
    logs: PayoutSchedulerLog[];
    summary: SchedulerExecutionSummary;
  }> = {};

  Object.entries(groups).forEach(([key, groupLogs]) => {
    result[key] = {
      logs: groupLogs,
      summary: calculateExecutionStats(groupLogs),
    };
  });

  return result;
}

/**
 * 実行結果の健全性チェック
 */
export function validateExecutionResult(result: SchedulerExecutionResult): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 基本的な整合性チェック
  if (result.endTime < result.startTime) {
    errors.push("終了時刻が開始時刻より前になっています");
  }

  if (result.successfulPayouts + result.failedPayouts > result.eligibleEventsCount) {
    errors.push("処理済み送金数が対象イベント数を超えています");
  }

  if (result.successfulPayouts < 0 || result.failedPayouts < 0) {
    errors.push("送金数が負の値になっています");
  }

  if (result.totalAmount < 0) {
    errors.push("総送金額が負の値になっています");
  }

  // 警告レベルのチェック
  if (result.eligibleEventsCount > 0 && result.successfulPayouts === 0 && !result.error) {
    warnings.push("対象イベントがあるにも関わらず成功した送金がありません");
  }

  if (result.failedPayouts > result.successfulPayouts && result.failedPayouts > 0) {
    warnings.push("失敗した送金が成功した送金より多くなっています");
  }

  const processingTime = result.endTime.getTime() - result.startTime.getTime();
  if (processingTime > 300000) { // 5分以上
    warnings.push("処理時間が5分を超えています");
  }

  if (result.results.length !== result.eligibleEventsCount) {
    warnings.push("結果の詳細数と対象イベント数が一致しません");
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}
