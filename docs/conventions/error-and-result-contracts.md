# Error And Result Contracts

このドキュメントは、「成功/失敗の返却契約」を固定し、実装・レビューの判断基準を統一する。

- Decision: ADR-0015 `docs/decisions/0015-result-contract-at-boundaries.md`
- Error core: `core/errors/*`

## Boundary Map（どれを返すか）

- 内部（features/core/services/hooks）: `AppResult`
- Server Actions（UI境界）: `ActionResult<T>`（redirect-only 例外は ADR-0014）
- HTTP(Route Handlers): errorは RFC7807 Problem Details、successはpayloadのみ（または `204 No Content`）

## Internal: `AppResult`（正規形）

目的: 内部ロジックの成功/失敗を、1つの正規形で表現する。

- Type/Helpers: `core/errors/app-result.ts`
- Error type: `core/errors/app-error.ts`

ルール:

- 期待される失敗（入力不正、状態不整合、外部APIの想定内失敗等）は `AppResult` で返す
- `throw` は「想定外（バグ/不変条件違反/握れない例外）」に寄せ、境界で `normalizeError` する
- `AppResult.meta` は内部専用（UIやHTTPへ露出させたい情報は、境界で明示的に投影する）

## Server Actions: `ActionResult<T>`（UI境界契約）

目的: UIが扱いやすい形（`userMessage`/`fieldErrors`/`redirectUrl`）で成功/失敗を返す。

- Type/Helpers: `core/errors/adapters/server-actions.ts`
- Convert: `toActionResultFromAppResult` / `toAppResultFromActionResult`

ルール:

- Server Action は原則 `ActionResult<T>` を返す（redirect-only の例外は ADR-0014）
- UIは `result.error.userMessage` をユーザー表示の第一候補として使う（`error.message` は開発者用）
- バリデーションは `zodFail` を優先し、`fieldErrors`（record）で返す
- 内部ロジックが `AppResult` の場合は、境界で `toActionResultFromAppResult` に投影する

アンチパターン:

- `{ success: boolean; error?: string }` の独自Resultを返す
- `result.error` を string 前提で扱う（`result.error.userMessage` を使う）

## HTTP: Problem Details（error）と success payload（成功）

目的: Route Handlers では HTTP として自然な契約にする（成功ラッパを返さず、失敗は標準形式）。

- Adapter: `core/errors/adapters/http-adapter.ts`（`respondWithProblem` / `respondWithCode`）
- Types: `core/errors/problem-details.types.ts`

ルール:

- errorは Problem Details（`Content-Type: application/problem+json`）で返す
- successは `{ success: true }` / `{ ok: true }` のようなラッパを返さない
  - 返すべき情報がある: payloadのみを `NextResponse.json(payload)` で返す
  - 返す情報がない: `204 No Content` を返す

## QStash Worker（補足: retry/DLQ契約）

QStash worker は「HTTP status/headers」でACK/Retry/DLQを制御する（Result型の話ではないが、境界契約として重要）。

- Example: `app/api/workers/stripe-webhook/route.ts`

ルール:

- `2xx`: ACK（成功扱い、リトライなし）
- `489` + `Upstash-NonRetryable-Error: true`: Non-retryable（DLQへ）
- `5xx`: Retryable（リトライ継続）

## Quick Checklist（レビュー観点）

- 内部の戻り値が `AppResult` になっている
- Server Actions が `ActionResult<T>` で、UIは `userMessage` を表示している
- HTTP success が wrapper を返していない（payloadのみ / 204）
- HTTP error が `respondWithProblem` / `respondWithCode` 経由になっている
- `{ success, error?: string }` が増えていない

## Links

- ADR-0013: `docs/decisions/0013-unify-error-handling-with-appError-adapters.md`
- ADR-0014: `docs/decisions/0014-server-actions-redirect-only-pattern.md`
- ADR-0015: `docs/decisions/0015-result-contract-at-boundaries.md`
