import * as Sentry from "@sentry/cloudflare";

// @ts-expect-error .open-next/worker.js はビルド生成物で tsconfig の対象外（allowJs: false）
import openNextWorker from "./.open-next/worker.js";

/**
 * Worker の実行コンテキスト。
 *
 * 正しくは `ExecutionContext`（workerd のグローバル型）だが、`@cloudflare/workers-types`
 * を導入していないため解決できない。ここでは受け取って `openNextWorker` へ渡すだけなので、
 * 実際に使う面だけを宣言する。
 */
interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default Sentry.withSentry<CloudflareEnv>(
  (env) => {
    return {
      dsn: env.SENTRY_DSN,
      release: env.SENTRY_RELEASE,
      sendDefaultPii: true,
      enableLogs: true,
      tracesSampleRate: 1.0,
    };
  },
  {
    async fetch(request: Request, env: CloudflareEnv, ctx: WorkerExecutionContext) {
      return openNextWorker.fetch(request, env, ctx);
    },
  }
);
