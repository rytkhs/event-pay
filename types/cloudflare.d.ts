/**
 * Cloudflare Worker の env バインディングの型契約。
 *
 * `process.env`（`env.d.ts` の `NodeJS.ProcessEnv`）とは供給経路が異なる。
 * Worker のエントリ（`sentry-worker.ts`）は Cloudflare が渡す env オブジェクトから
 * 直接読むため、ProcessEnv 側へ混ぜると seam が曖昧になる。
 *
 * `CloudflareEnv` は `@opennextjs/cloudflare` が `declare global` で宣言しており、
 * ここでの宣言は declaration merging で合流する。
 */
declare global {
  interface CloudflareEnv {
    /** Sentry の DSN。未設定なら Sentry へ送信しない */
    SENTRY_DSN?: string;
    /** Sentry のリリース識別子。`pnpm deploy` が `--var` で注入する */
    SENTRY_RELEASE?: string;
  }
}

export {};
