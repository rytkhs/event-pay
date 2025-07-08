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

/**
 * キャンセル機能付きデバウンス関数
 * 戻り値としてキャンセル関数も提供する
 */
export function debounceValidationWithCancel<T extends (...args: any[]) => any>(
  fn: T, 
  delay: number
): { debouncedFn: T; cancel: () => void } {
  let timeoutId: NodeJS.Timeout | null = null;

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const debouncedFn = ((...args: Parameters<T>) => {
    cancel();

    timeoutId = setTimeout(
      () => {
        timeoutId = null;
        fn(...args);
      },
      Math.max(0, delay)
    );
  }) as T;

  return { debouncedFn, cancel };
}
