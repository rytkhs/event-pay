// バッチ処理共通ユーティリティ

/**
 * バッチ処理の結果
 */
export interface BatchResult<T, R> {
  /** 成功した処理のリスト */
  successful: Array<{ item: T; result: R }>;
  /** 失敗した処理のリスト */
  failed: Array<{ item: T; error: Error }>;
}

/**
 * バッチ処理のオプション
 */
export interface BatchProcessOptions {
  /** エラーが発生しても処理を継続するか */
  continueOnError?: boolean;
  /** 並列処理の最大数 */
  maxConcurrency?: number;
}

/**
 * 項目のリストに対してバッチ処理を実行
 *
 * @param items 処理対象の項目リスト
 * @param processor 各項目に対する処理関数
 * @param options バッチ処理オプション
 * @returns 処理結果（成功・失敗の詳細）
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: BatchProcessOptions = {}
): Promise<BatchResult<T, R>> {
  const { continueOnError = true, maxConcurrency = 5 } = options;
  const successful: Array<{ item: T; result: R }> = [];
  const failed: Array<{ item: T; error: Error }> = [];

  // 並列処理の場合
  if (maxConcurrency > 1) {
    const chunks = chunkArray(items, maxConcurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (item) => {
        try {
          const result = await processor(item);
          return { success: true as const, item, result };
        } catch (error) {
          return {
            success: false as const,
            item,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      });

      const results = await Promise.allSettled(promises);

      for (const result of results) {
        if (result.status === "fulfilled") {
          const processResult = result.value;
          if (processResult.success) {
            successful.push({
              item: processResult.item,
              result: processResult.result,
            });
          } else {
            failed.push({
              item: processResult.item,
              error: processResult.error,
            });

            if (!continueOnError) {
              return { successful, failed };
            }
          }
        } else {
          // Promise.allSettled で rejected になることは通常ないが、念のため
          // Unexpected promise rejection - continue processing
        }
      }
    }
  } else {
    // 直列処理の場合
    for (const item of items) {
      try {
        const result = await processor(item);
        successful.push({ item, result });
      } catch (error) {
        failed.push({
          item,
          error: error instanceof Error ? error : new Error(String(error)),
        });

        if (!continueOnError) {
          break;
        }
      }
    }
  }

  return { successful, failed };
}

/**
 * 配列を指定されたサイズのチャンクに分割
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * バッチ処理結果のサマリーを生成
 */
export function getBatchSummary<T, R>(
  result: BatchResult<T, R>
): {
  total: number;
  successCount: number;
  failureCount: number;
  successRate: number;
} {
  const total = result.successful.length + result.failed.length;
  const successCount = result.successful.length;
  const failureCount = result.failed.length;
  const successRate = total > 0 ? (successCount / total) * 100 : 0;

  return {
    total,
    successCount,
    failureCount,
    successRate: Math.round(successRate * 100) / 100, // 小数点第2位で四捨五入
  };
}
