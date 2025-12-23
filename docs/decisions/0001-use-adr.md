# ADR-0001: Use ADRs for Architecture Decisions

- Status: Accepted
- Date: 2025-12-21

## Context and Problem Statement

このプロジェクトでは、以下のような性質の意思決定が多く発生する。

- Supabase / Stripe / Cloudflare Workers / QStash / Resend など、外部サービスとの統合に関する選択。
- 認証・認可・RLS・ゲストトークンなど、セキュリティや権限境界に関わる設計。
- 決済の確定点や冪等性戦略など、データ整合性と運用に影響する設計。

これらは実装やREADMEだけでは「なぜその選択をしたのか」「どの選択肢を検討したのか」が時間とともに失われやすく、将来の自分や別の開発者が理由を復元するのが困難になる。

そのため、重要なアーキテクチャ上の決定を、小さな文書として残す仕組みが必要。

## Decision Drivers

- 将来の自分や他の開発者が、「なぜこの構成になっているか」を短時間で理解できること。
- 設計変更時に、古い決定がどのように上書きされたか（Superseded）を追跡できること。
- 記述コストが高すぎず、個人開発でも運用可能であること。
- 技術選定だけでなく、セキュリティ・運用・MVPスコープのような非機能面の判断も残せること。

## Considered Options

- **Option A: ADR を採用し、Markdown で記録する（MADR 形式ベース）**
  - `docs/decisions/` 配下に 1 決定 1 ファイルで保存する。

- **Option B: README / docs/architecture.md に都度追記するだけ**
  - 大きめの設計ドキュメントの中に「決定と理由」を散在させる。

- **Option C: Issue / PR / コメントに任せる**
  - GitHub 上の議論ログに決定が埋もれる形で残す。

## Decision Outcome

**Chosen option: Option A — ADR を採用し、Markdown で記録する。**

理由:

- **要点が短い単位で独立して残るため、後から読み返しやすい。**
  各決定を 1 ファイルに切り出すことで、README や architecture.md を「背景説明」で過度に膨らませずに済む。

- **決定のライフサイクル（Proposed / Accepted / Superseded / Deprecated）を明示できる。**
  新しい決定で古い決定を置き換えるときに、Superseded として辿れる。

- **Markdownベースなので、既存のGitツールと相性が良い。**
  差分レビューや blame が容易で、個人開発でも無理なく運用できる。

Option B/C は、決定がREADMEやIssueに混在してしまい、「どれが今有効な判断か」が分かりづらくなるため採用しない。

## Consequences

### Positive

- 重要な設計判断の「背景・選択肢・結果」が簡単に追い返せるようになる。
- 設計変更時に「どの前提が崩れたのか」を議論しやすくなる。
- ポートフォリオとして公開した際に、技術選定や設計の意図を読み手に伝えやすくなる。

### Negative

- ADRを書く手間が増える（小さな文章を継続的に書く必要がある）。
- 運用ルールを守らないと、古い情報が残り続けて混乱を生むリスクがある。

## ADR Policy（このリポジトリでの運用ルール）

### 1. 保存場所とファイル命名

- ディレクトリ: `docs/decisions/`
- ファイル名: `NNNN-short-title.md`
  - `NNNN` は 0 パディングした連番（例: `0002-hosting-cloudflare-workers-opennext.md`）。
  - `short-title` は英語の短いケバブケース（例: `supabase-for-auth-and-db`）。

### 2. ステータス

各ADRは必ず `Status` を持つ。

- `Proposed` — 提案中、まだ採用されていない。
- `Accepted` — 採用され、現時点で有効な決定。
- `Deprecated` — 使われなくなったが、別のADRに置き換えられてはいない。
- `Superseded` — 別の ADR によって明示的に置き換えられた。

Superseded の場合は、どの ADR によって置き換えられたか（例: `Superseded by ADR-0010`）を本文中に明記する。

### 3. ADR に記録する対象（What to record）

ADRにするのは、次のような「後から理由を知りたくなりそうな決定」。

- 外部サービス / インフラの採用・変更
  - 例: Supabase を採用した理由、Cloudflare Workers + OpenNext を選んだ理由、Stripe Connect Express にした理由など。

- セキュリティ / 認可 / データ境界に関わる設計
  - 例: ゲスト参加をトークンベースで許可する設計、RLS方針、レート制限の設計など。

- データ整合性・冪等性・「真のソース」
  - 例: 決済の確定点を Stripe Webhook とする設計、再送時の挙動、集計ロジックの前提など。

### 4. ADR に記録しない対象（What NOT to record）

次のようなものは、基本的にADRにはしない。

- CSSやコンポーネントの細かなUI変更。
- ライブラリのマイナーアップデート（セキュリティ的に重要な場合を除く）。
- 一時的な開発上の都合（デバッグ用コードなど）。

### 5. テンプレート

本リポジトリでは、MADR から簡略化した以下の構造を標準テンプレートとする。

```
# ADR-NNNN: Title

- Status: Proposed | Accepted | Deprecated | Superseded
- Date: YYYY-MM-DD
- Deciders: 名前やロール
- Tags: 任意

## Context and Problem Statement
- なぜこの決定が必要になったか
- どのような問題を解決したいのか

## Decision Drivers
- この決定を評価するための基準（コスト、運用性、セキュリティなど）

## Considered Options
- Option A: ...
- Option B: ...
- Option C: ...

## Decision Outcome
- 採用したオプション
- 選んだ理由（Decision Driversとの対応）

## Consequences
- Positive: ...
- Negative: ...

## Pros and Cons of the Options
（必要に応じて、各Optionごとに箇条書き）

## Links
- 関連するADRやドキュメントへのリンク
```

### 6. レビューと運用

- ADRは基本的にPR経由で追加・変更する。
- 一度 `Accepted` になったADRの内容を直接書き換えず、変更が必要な場合は新しいADRを作成して旧ADRを `Superseded` にする。

## Status

- 2025-12-21: 初版作成。Status = Accepted。
- 将来、ADRの運用方針を大きく変える場合、このADR自体も別のADRによって Superseded される。
