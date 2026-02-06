# ADR-0013: `AppError`とAdapterによるエラー処理の統一

* Status: **Accepted**
* Date: **2026-02-02**

## Context and Problem Statement

これまでエラーハンドリングが複数系統に分散していた。

* HTTP（Route Handlers）では Problem Details を返すが、コード指定が `string` ベースで typo がコンパイル時に検知できず、辞書漏れ等で実行時不具合になり得た。
* UI 側の error logger / handler、Server Actions の結果型（ActionResult 相当）、ErrorDetails などが併存し、「どれが正なのか」「どこで変換すべきか」が曖昧だった。
* エラーの表示・ログ・通知・HTTP 応答がレイヤごとに独自実装になり、振る舞いの一貫性（ユーザー表示・相関ID・キャッシュ制御など）を保ちにくかった。

これにより、運用時の原因追跡や、機能追加時のエラー追加コストが高く、設計が揺れやすい状態だった。

## Decision Drivers

* **型安全性**：エラーコードの typo / 辞書漏れをコンパイル時に検知したい
* **単一の真実（SSOT）**：エラー定義（コード・メッセージ・分類）を一箇所に集約したい
* **責務分離**：内部表現と外部表現（HTTP/UI/Actions/ログ）を分離して、変換を明示したい
* **一貫性**：ユーザー表示文言、HTTPレスポンス形式、ログ収集のルールを揃えたい
* **観測性**：相関IDなどの付与・ヘッダ制御を共通化し、追跡性を上げたい
* **移行容易性**：既存実装を段階的 or 一括で置き換え可能な構造にしたい

## Considered Options

* **Option A: `AppError` を内部表現として統一し、HTTP/UI/Actions へは adapter で変換する**

  * `ErrorCode`（型）+ `ErrorRegistry` を SSOT とする
  * `normalizeError` で例外/未知エラーも `AppError` に正規化
  * HTTP は RFC7807 Problem Details へ、Actions は `ActionResult` へ、UI は handler/logger へ変換

* **Option B: 文字列コードのまま運用し、テストや lint で補強する**

  * `createProblemResponse(code: string)` のような API を維持しつつ、辞書とテストを強化

* **Option C: HTTP（Problem Details）中心に寄せ、内部表現も HTTP 寄りに統一する**

  * すべてを Problem Details で扱い、UI/Actions もそれに追従

* **Option D: 例外（Exception）中心に寄せ、コード体系を弱める**

  * 例外型で分岐し、コードや辞書は最小限に留める

## Decision Outcome

**Chosen option: Option A — `AppError` + adapters による統一**

理由:

* `ErrorCode` を型で扱うことで typo がコンパイル時に検知でき、辞書漏れが起きにくい。
* `ErrorRegistry` に定義を集約することで、エラー追加・変更の導線が明確になる（SSOT）。
* adapter を挟むことで、HTTP/UI/Actions それぞれの都合（RFC7807、ActionResult、ユーザー表示/ログ収集）を保ちつつ、内部は統一できる。
* 共通処理（相関ID、no-store、認証系ヘッダ等）を HTTP adapter 側に集約でき、振る舞いが揃う。
* 長期的に「新しい入出力面が増えても adapter を追加すればよい」構造になり、設計が揺れにくい。

## Consequences

### Positive

* エラー定義が一箇所に集約され、追加・変更・レビューが容易になる。
* 文字列コード由来の typo / 実行時例外リスクが低下する。
* HTTP / UI / Actions の挙動が統一され、表示とログが安定する。
* 観測性（相関ID、キャッシュ制御、必要ヘッダ）が共通化され、トラブルシュートがしやすい。

### Negative

* 初期導入コスト（既存参照の置換、旧ユーティリティ削除）が発生する。
* `ErrorCode` / registry の運用ルール（命名、増やし方、重複防止）が必要になる。
* adapter 増加により構造理解が必要（ただし責務が明確になるためトレードオフとして許容）。

## Pros and Cons of the Options

### Option A（採用）

* Pros: 型安全、SSOT、責務分離、一貫性、拡張性
* Cons: 導入コスト、運用ルールの整備が必要

### Option B

* Pros: 変更が少ない、短期コストが低い
* Cons: typo/辞書漏れの根本解決にならず、分散した体系が残る

### Option C

* Pros: HTTP との整合が高い
* Cons: UI/Actions の内部表現としては過剰・不自然になりやすく、用途差分が吸収しづらい

### Option D

* Pros: 実装が直感的に見えることがある
* Cons: 表示文言やログ収集などの統一が崩れやすく、コード体系・辞書の整理が後回しになりがち

## Migration Plan

* 既存の Problem Details / ErrorDetails / UI logger / Server Actions 結果型を `core/errors`（`AppError`, `ErrorRegistry`, `ErrorCode`, `normalizeError`）へ順次置換する。
* HTTP は adapter 経由（Problem Details 応答関数）に統一する。
* Server Actions は `ActionResult`（ok/fail 等）へ統一し、UI 側は `result.error` を文字列前提ではなく `userMessage` 等へ移行する。
* 旧ユーティリティは最終的に削除し、参照が残る場合はコンパイルエラーで検知できるようにする。

## Links

* Issue: #281
* PR: #290
