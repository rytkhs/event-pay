import type { PostgrestError } from "@supabase/supabase-js";

export type RetryResult<T> = {
  data: T | null;
  error: PostgrestError | null;
};

type RetryOptions<T> = {
  attempt: () => Promise<RetryResult<T>>;
  isSuccess?: (result: RetryResult<T>) => boolean;
  maxRetries?: number;
  baseDelayMs?: number;
};

export const updateWithRetries = async <T>({
  attempt,
  isSuccess = (result) => !result.error,
  maxRetries = 3,
  baseDelayMs = 100,
}: RetryOptions<T>): Promise<RetryResult<T>> => {
  let lastResult: RetryResult<T> = { data: null, error: null };

  for (let i = 0; i < maxRetries; i += 1) {
    const result = await attempt();
    if (isSuccess(result)) {
      return result;
    }
    lastResult = result;
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (i + 1)));
  }

  return lastResult;
};
