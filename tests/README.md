# Test structure

テストは、対象コードの配置場所ではなく、テストが接続する境界で分類する。

```text
tests/
├── unit/          # I/Oを行わない純粋ロジックと同期コンポーネント
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

- Jest、Playwright、Supabaseなど、実行環境ごとの初期化と終了処理を置く。
- ドメインシナリオや機能固有fixtureを含めない。
- 複数テスト間で認証クライアントや可変データを共有しない。

## Naming

- `unit/`: `*.test.ts` / `*.test.tsx`
- `db/`: `*.db.test.ts`
- `integration/`: `*.integration.test.ts`
- `e2e/`: `*.spec.ts`

テスト名は実装手順ではなく、外部から観測できる振る舞いを表す。
