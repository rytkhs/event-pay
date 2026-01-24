# ADR-0012: Server Actions の app 配下への集約と初期化処理の統一

- Status: Accepted
- Date: 2026-01-25

## Context and Problem Statement

これまでの実装では、Server Actions (`"use server"`) が `features/**/actions` や `core/actions` など、各レイヤーに散在していた。これには以下の問題があった。

1. **エントリーポイントの分散**: どの操作がクライアントから呼び出し可能なのか、一覧性が低い。
2. **責務の混在**: Feature層（本来はドメインロジックやデータアクセスに関心を持つべき）が、Next.js固有の「Server Action」というデリバリーメカニズムを知ってしまっている。
3. **初期化の曖昧さと逆依存**: DIコンテナや機能の初期化（`registerFeatures`など）の責務が不明確。これを保証するために Feature 層が App 層の初期化ロジックに依存すると、逆依存（Circular Dependency）が発生する。

## Decision Drivers

- **関心の分離**: Feature層をフレームワーク固有の通信方式（Server Actions）から切り離し、純粋な関数/クラスとして保ちたい。
- **依存の方向性**: `app` -> `features` の一方向依存を維持し、`features` が `app` の初期化都合を知らない状態にしたい。
- **import 境界の明確化**: 「クライアントから呼べる処理」がどこにあるかを明確にしたい。
- **初期化/登録の保証**: すべてのリクエスト処理において、確実に依存関係が初期化された状態でロジックを実行させたい（Composition Rootパターン）。また、この初期化処理は冪等（Idempotent）であり、複数回呼ばれても安全であるべき。

## Considered Options

- **Option A: 現状維持（Feature層に配置）**
  - Pros: 機能に関するコードが1箇所にまとまる（Colocation）。
  - Cons: `use server` がドメインロジックに混入し続ける。初期化問題や逆依存のリスクが解決しない。

- **Option B: app配下への集約とComposition Rootの適用（採用）**
  - `features/` から `"use server"` を排除し、すべて `app/**/actions.ts` に移動する。
  - `layout.tsx` や API Route の先頭で `ensureFeaturesRegistered()` を呼び出し、初期化を保証する。

## Decision Outcome

**採用オプション: Option B**

### 具体的なルール

1. **Server Actions の配置場所**
   - Server Actions は必ず `app/` ディレクトリ配下の `actions.ts` に定義する。
   - `features/` ディレクトリ内では `"use server"` を使用しない。Featureは純粋なサーバーサイドロジック（`server.ts`経由で公開）を提供するのみとする。
   - これにより、Feature層は Next.js や Server Actions に依存せず、純粋な TypeScript の関数/クラスとして記述される。

2. **依存関係の初期化 (Composition Root)**
   - アプリケーションのエントリーポイント（Root Layout, API Routes）で、リクエスト処理の開始前に必ず `ensureFeaturesRegistered()` を呼び出す。
   - `ensureFeaturesRegistered()` は**冪等（Idempotent）**に実装し、同一リクエスト内で複数回呼び出されてもコストがかからない、または無害であるようにする。
   - Feature層が自律的に初期化しようとして App層に依存することを禁止する。

3. **Featureへのアクセス**
   - `app/` から Feature を利用する場合、原則として DIコンテナ経由、または `ensureFeaturesRegistered` 済みのサービスインスタンスを利用する（現状の実装パターンに準拠）。
   - Importパスは `ADR-0011` に従い、`@features/<domain>/server` を使用する。

## Consequences

### Positive

- **境界の明確化**: `app/` が「デリバリー（HTTP/RPC）」、`features/` が「ドメイン/ビジネスロジック」という役割分担が明確になる。
- **テスタビリティ向上**: Feature層のロジックから `use server` が消えることで、Next.jsの文脈なしに純粋な関数としてユニットテストしやすくなる。
- **初期化の安全性**: `ensureFeaturesRegistered` により、未初期化のサービスにアクセスする実行時エラーを防げる。

### Negative

- **ファイルの分離**: ロジックの実体（Feature）とエントリーポイント（App Actions）が離れるため、コードを書く際に行き来が必要になる。
- **ボイラープレート**: 各 `actions.ts` でFeatureのメソッドをラップするだけの関数を書く必要がある。

## Links

- PR #273 Refactor: Server Actionsの集約と初期化処理の統一 (Issue #263)
- ADR-0011: Featureのserver-only公開エントリ
