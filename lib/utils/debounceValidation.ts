/**
 * バリデーション用のデバウンス関数
 * 指定された遅延時間後に関数を実行し、連続呼び出しは最後のもののみ実行される
 */
export function debounceValidation<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timeoutId: NodeJS.Timeout | null = null;

  return ((...args: Parameters<T>) => {
    // 既存のタイマーをクリア
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // 新しいタイマーを設定
    timeoutId = setTimeout(
      () => {
        timeoutId = null;
        fn(...args);
      },
      Math.max(0, delay)
    );
  }) as T;
}
