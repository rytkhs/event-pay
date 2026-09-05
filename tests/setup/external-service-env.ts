/**
 * `integration` プロジェクトへ渡す外部サービスのダミー env。
 *
 * `vitest.config.mts` の `test.env` として `localSupabaseEnv` と合成する。
 * fixture 側の `vi.stubEnv` は使えない。`core/stripe/client.ts` の `getStripe()` が
 * Stripe インスタンスをモジュールスコープにキャッシュし、`createFetchHttpClient()` が
 * 構築時点の `globalThis.fetch` を捕捉するため、最初の呼び出し以降は差し替えが効かない。
 *
 * ここは字面の値だけを持ち、`process.env` を読まない。動的アクセスと分割代入は
 * `tests/architecture/env-declarations.test.ts` が禁止している。
 *
 * `.env` / `.env.local` の cascade からは漏れない（Vite の `loadEnv` は `VITE_` 以外を
 * `process.env` へ書き戻さない）。残る流入経路はシェルの export だけなので、挙動を
 * 変えるキーはここで falsy 値に固定して無害化する。
 */

const DUMMY_SECRETS = {
  // core/stripe/client.ts の requireEnv。値の形式は検証されない。
  STRIPE_SECRET_KEY: "sk_test_eventpay_integration_dummy",
  // getWebhookSecrets() / getConnectWebhookSecrets() は非本番で _TEST を優先する。
  STRIPE_WEBHOOK_SECRET_TEST: "whsec_eventpay_integration_dummy",
  STRIPE_CONNECT_WEBHOOK_SECRET_TEST: "whsec_eventpay_integration_connect_dummy",

  QSTASH_TOKEN: "qstash_eventpay_integration_dummy",

  // NODE_ENV=test では EmailNotificationService のコンストラクタが
  // この4つのいずれかが欠けると throw する（core/notification/email-service.ts）。
  RESEND_API_KEY: "re_eventpay_integration_dummy",
  FROM_EMAIL: "no-reply@example.test",
  FROM_NAME: "みんなの集金（テスト）",
  ADMIN_EMAIL: "admin@example.test",
} as const;

const FIXED_ENDPOINTS = {
  /**
   * QStash publish の宛先 URL に入る（app/api/webhooks/stripe/route.ts）。
   */
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",

  /**
   * 空文字にしてはいけない。`@upstash/qstash` の資格情報解決は
   * `defaultCreds.QSTASH_URL ?? DEFAULT_QSTASH_URL` と `??` を使うため、
   * 空文字は nullish 扱いされず baseUrl として採用されて URL 生成が壊れる。
   * 明示固定は、シェルへ export された dev server の URL によって
   * publish が interception 対象外のホストへ迂回するのも防ぐ。
   */
  QSTASH_URL: "https://qstash.upstash.io",
} as const;

/**
 * シェルから漏れると挙動が変わるキー。`test.env` は unset できないため falsy 値で上書きする。
 */
const NEUTRALIZED = {
  /** "true" のとき Webhook が QStash publish をスキップして同期処理へ分岐する（#593）。 */
  SKIP_QSTASH_IN_TEST: "",
  /** 空文字なら「本番のみ有効」の既定に戻る（core/security/stripe-ip-allowlist.ts）。 */
  ENABLE_STRIPE_IP_CHECK: "",
  /** url と token が揃ったときだけ Upstash Redis クライアントが作られる。 */
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  SKIP_RATE_LIMIT: "",
  /** falsy なら region 別の資格情報探索を行わない（@upstash/qstash）。 */
  QSTASH_REGION: "",
} as const;

export const externalServiceEnv: Record<string, string> = {
  ...DUMMY_SECRETS,
  ...FIXED_ENDPOINTS,
  ...NEUTRALIZED,
};
