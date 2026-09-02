# Test structure

テストは、対象コードの配置場所ではなく、テストが接続する境界で分類する。

```text
tests/
├── unit/          # I/Oを行わない純粋ロジックと同期コンポーネント
├── architecture/  # リポジトリ内のソースと設定ファイルの静的検査
├── db/            # SupabaseのRLS、RPC、制約、transaction
├── integration/   # アプリケーション境界からDBまで
├── e2e/           # ブラウザから操作するユーザーフロー
├── fixtures/      # テストデータの値と生成関数
└── setup/         # テストランナーと実行環境の初期化
```

## Classification

### `unit/`

- DB、ネットワーク、ファイルシステムへ接続しない。
- 日時、金額、状態遷移、validation、Result契約などを公開インターフェースから検証する。
- 同期Client Componentは、ユーザーが観測できる表示と操作を検証する。
- 内部モジュールはmockしない。

### `architecture/`

- リポジトリ内のソースと設定ファイルを読み、コード全体にかかる規約を検証する。
- 対象ファイルは`git ls-files`で列挙する。未追跡ファイルを読むと、ローカルとCIで結果が変わる。
- 型検査やlintでは表現できない規約に限る。ESLintで書けるものはESLintに置く。
- アプリケーションのコードは実行しない。読み取るのはファイルの中身だけで、外部への接続は行わない。
- 検証するのは規約であり、特定機能の振る舞いではない。

### `db/`

- ローカルSupabaseへ直接接続する。
- RLS、RPC、DB制約、trigger、transaction、並行更新を検証する。
- アプリケーションのServer Action、Route Handler、serviceは経由しない。
- 結果はDBレスポンスと永続化状態で検証する。

### `integration/`

- Server Action、Route Handler、Worker、公開serviceを入口にする。
- ローカルSupabaseまでの実経路を通す。
- Stripe、QStash、メールなどの外部サービスだけを境界でfake化できる。
- Supabase QueryBuilderや内部モジュールの呼び出し順は検証しない。

### `e2e/`

- Playwrightから実際の画面を操作する。
- 認証、画面遷移、入力、永続化後の表示を含む重要なユーザーフローを検証する。
- テスト内で環境に応じてシナリオを分岐しない。
- 固定時間の待機ではなく、観測可能な状態を待つ。

### `fixtures/`

- ドメインオブジェクト、外部イベント、DBレコードの入力値と生成関数を置く。
- テストの実行ライフサイクルやグローバルな接続状態を保持しない。
- 特定テストの期待値やassertionを含めない。

### `setup/`

- Vitest、Supabaseなど、実行環境ごとの初期化と終了処理を置く。
- ドメインシナリオや機能固有fixtureを含めない。
- 複数テスト間で認証クライアントや可変データを共有しない。

## Naming

- `unit/`: `*.test.ts` / `*.test.tsx`
- `architecture/`: `*.test.ts`
- `db/`: `*.db.test.ts`
- `integration/`: `*.integration.test.ts`
- `e2e/`: `*.spec.ts`

テスト名は実装手順ではなく、外部から観測できる振る舞いを表す。

## Commands

Vitestの5プロジェクト（`unit-node` / `unit-jsdom` / `architecture` / `db` / `integration`）は、接続先の有無で実行コマンドが分かれる。

| コマンド | 対象 | ローカルSupabase |
| --- | --- | --- |
| `pnpm test` | `unit-node` / `unit-jsdom` / `architecture` | 不要 |
| `pnpm test:server` | `db` / `integration` | 必要（prepareを内部で実行） |
| `pnpm test:db:prepare` | prepareのみ | 必要 |
| `pnpm typecheck:test` | `tests/tsconfig.json` の型検査 | 不要 |

`pnpm test`はDB、ネットワーク、環境変数のいずれにも依存しない。ローカルSupabaseの接続情報はunitプロジェクトへ渡らない。`architecture`はリポジトリ内のファイルを読むが、読み取るのは追跡済みのソースと設定だけで、実行環境には依存しない。

### Watch

watchはVitest CLIの既定（`vitest`がwatch、`vitest run`が単発）を使う。プロジェクトごとのnpmスクリプトは用意しない。

```bash
pnpm exec vitest --project unit-node
pnpm exec vitest --project unit-jsdom
pnpm exec vitest --project architecture
pnpm exec vitest --project db           # pnpm test:db:prepare の実行後
pnpm exec vitest --project integration  # pnpm test:db:prepare の実行後
```

`db`と`integration`はprepareが生成した接続情報を前提にする。prepare未実行の場合はglobalSetupが失敗する。watch中にDBを初期状態へ戻したいときは、watchを止めて`pnpm test:db:prepare`を再実行する。

## External service fake

`integration`では、Stripe / QStash / Resendへの通信を**HTTPのレイヤーで**fakeする。
内部モジュールはmockしない。ハーネスは`tests/setup/external-http.ts`、
テストからの入口は`tests/fixtures/external-http.ts`の`externalHttp` fixture。

fixtureが持つのは`on()`、`requests()`、`takeViolations()`の3つだけ。
レスポンス列・ネットワークエラー・遅延はMSWの標準機能を直接使う。

| やりたいこと | 使うもの |
| --- | --- |
| 単発のレスポンス | `http.post(url, resolver)` |
| レスポンス列 | `http.post(url, resolver, { once: true })`を必要な回数重ねる |
| ネットワークエラー | `HttpResponse.error()` |
| 遅延・timeout | `await delay(ms)` |

```ts
import { http, HttpResponse } from "msw";
import { test } from "../../fixtures/external-http";

test("Checkout Sessionへ渡す金額が内部Paymentと一致する", async ({ externalHttp }) => {
  externalHttp.on(
    http.post("https://api.stripe.com/v1/checkout/sessions", () =>
      HttpResponse.json({ id: "cs_test", url: "https://checkout.stripe.com/c/pay/cs_test" })
    )
  );

  // ... Server Actionを実行 ...

  const [request] = externalHttp.requests("stripe");
  const body = new URLSearchParams(await request.text());
  expect(body.get("line_items[0][price_data][unit_amount]")).toBe("1000");
});
```

既存のfixtureチェーンへ合成するときは`withExternalHttp`を使う。

```ts
import { test as paymentTest } from "../../fixtures/payment";
import { withExternalHttp } from "../../fixtures/external-http";

const test = withExternalHttp(paymentTest);
```

- fake対象は`api.stripe.com`、`stripe.com`（Webhook IP許可リスト）、`qstash.upstash.io`、`api.resend.com`。
- ローカルSupabaseだけは素通しする。それ以外の未登録ホストと、既知ホストのレスポンス未登録は、
  リクエストを違反として記録し、`afterEach`がテストを失敗させる。意図した検証なら
  `takeViolations()`でドレインする。
- ハーネスは失敗させるとき例外ではなく`400`を返す。SDKのリトライを誘発せずに失敗させるためで、
  理由は`tests/setup/external-http.ts`のコメントにある。
- ダミーの環境変数は`integration`プロジェクトの`test.env`（`tests/setup/external-service-env.ts`）が
  プロセス全体に固定する。テストから`vi.stubEnv`しない。Stripeクライアントがモジュールスコープで
  キャッシュされるため間に合わない。
- Stripe sandboxやResendのテストアドレス（`delivered@resend.dev`）への実接続は、このレーンではなく
  External contractの担当。
- ハーネスのカナリーは`tests/integration/setup/external-http.integration.test.ts`に置く。
  MSWやSDKの更新時はこのカナリーを最初に確認する。

## Next.js Server Action request context

`integration`では、`tests/setup/next-request-context.ts`の
`runInNextServerActionContext`を使い、認証Cookie、`cookies()`の書き込み、
`revalidatePath()`を含むServer ActionをNext.jsのrequest context内で実行できる。

- Next.js 15.5にはServer Action用の公開Vitestハーネスがないため、Next.js内部APIへの依存はこの1ファイルだけに隔離する。
- ハーネスのカナリーは`tests/integration/setup/next-request-context.integration.test.ts`に置く。Next.js更新時はこのカナリーを最初に確認する。
- 認証Cookieは`@supabase/ssr`の`createServerClient`と実際のログインから生成し、Cookie名やchunk形式を手書きしない。
- ハーネスはNext.jsのHTTP transportやReact Server Componentの再描画を保証しない。それらは将来のE2Eで扱う。
- 実行ごとに独立したcontextを生成し、可変なCookieやrequest stateをモジュールスコープで共有しない。

## Local Supabase

`db`と`integration`はローカルSupabaseスタックへ直接接続する。前提はDockerが動作していることだけで、手書きの環境変数ファイルは使わない。

`pnpm test:db:prepare`が以下を担う。

1. ローカルスタックの状態を確認し、停止していれば`supabase start`で起動する
2. 接続先がローカルスタックであることを検証する
3. `supabase db reset`でマイグレーションとseedを1回だけ適用する
4. 接続情報を`tests/.env.local-supabase`（gitignore対象）へ書き出す

DBのライフサイクルはprepareの責務であり、Vitestの`setupFiles`や`globalSetup`からリセット・起動は行わない。テスト間のデータ分離はスイートの直列化ではなくfixtureが担う。
