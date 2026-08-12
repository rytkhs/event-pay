import { AsyncLocalStorage } from "node:async_hooks";

import "./test-environment";

/**
 * Next.js は Node runtime の起動時に AsyncLocalStorage を global へ配線する。
 * Vitest は Next server を起動しないため、integration worker で同じ前提だけを満たす。
 *
 * Next.js 内部モジュールを import する前に実行する必要があるため、integration project
 * 専用の setupFiles として読み込む。unit / db project には影響させない。
 */
const nextRuntimeGlobal = globalThis as typeof globalThis & {
  AsyncLocalStorage?: typeof AsyncLocalStorage;
};

nextRuntimeGlobal.AsyncLocalStorage ??= AsyncLocalStorage;
