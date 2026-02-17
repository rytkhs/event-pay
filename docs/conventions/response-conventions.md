# Response Conventions (HTTP / Route Handlers)

このドキュメントは `app/api/**`（Next.js Route Handlers）のレスポンス規約を固定する。

- Error contract: RFC 7807 Problem Details
- Success contract: payload only (no success wrapper) or `204 No Content`

関連:

- ADR-0015: `docs/decisions/0015-result-contract-at-boundaries.md`
- Error/Result contracts: `docs/conventions/error-and-result-contracts.md`
- HTTP adapter: `core/errors/adapters/http-adapter.ts`

## Scope

- 対象: `app/api/**` の Route Handlers（`GET/POST/...`）
- 非対象: Page/Server Actions の返却契約（別ドキュメント）

## Error Responses: Problem Details

エラーは Problem Details（`Content-Type: application/problem+json`）で返す。

- 実装は `core/errors/adapters/http-adapter.ts` の `respondWithProblem` / `respondWithCode` を利用する
- `X-Correlation-ID` と `Cache-Control: no-store` は adapter 側の規約に従う

例（概要）:

- `respondWithProblem(error, { defaultCode, instance, logContext })`
- `respondWithCode("INVALID_REQUEST", { detail, instance, logContext })`

## Success Responses: Payload Only / 204

成功レスポンスは以下のどちらかに統一する。

1. payload を返す（JSON）
2. payload が不要な場合は `204 No Content`

禁止:

- `{ success: true }`, `{ ok: true }` のような成功ラッパを返す

### Payload を返す場合

- 返す情報がある場合のみ JSON を返す
- 返す JSON は「ドメインとして意味のあるデータ」に限定する（デバッグ用の内部情報は入れない）

### 204 を返す場合

- 成功したこと以外に返す情報がない場合は `204 No Content` を返す
- `204` の場合はレスポンスボディを返さない

## Status Code Guidelines

- `200`: JSON payload を返す成功
- `201`: リソース作成で Location 等を使う場合のみ（原則 `200` + payload でも可）
- `204`: 成功・返す payload なし
- `4xx/5xx`: Problem Details（error）

## Headers

原則として、HTTP adapter に集約する。

- `X-Correlation-ID`: 調査用の相関ID
- `Cache-Control: no-store`: センシティブな失敗情報の誤キャッシュ防止
- `Retry-After`: 429 の場合に付与（adapter の規約に従う）
- `WWW-Authenticate`: 401 の場合に付与（adapter の規約に従う）

## QStash Workers（補足）

`/api/workers/**` は QStash のリトライ制御の都合で、`status` と特定ヘッダーで挙動が変わる。
このルールは `docs/conventions/error-and-result-contracts.md` の「QStash Worker」節を正とする。

## Review Checklist

- success wrapper を返していない（payload only / 204）
- error を Problem Details で返している（`respondWithProblem` / `respondWithCode` 経由）
- 互換性が必要な外部向け API なら、レスポンス shape 変更を明示している（ADR/CHANGELOG/Issue）

