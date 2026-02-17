# ADR-0015: Result Contract at Boundaries (AppResult / ActionResult / Problem Details)

- Status: Accepted
- Date: 2026-02-13

## Context and Problem Statement

ADR-0013 により、失敗（エラー）の内部表現は `AppError` に統一し、境界（HTTP / UI / Server Actions）へは adapter で投影する方針が確定した。

一方で、成功/失敗を含む「結果（Result）の返却契約」自体は次のように揺れやすかった：

- `{ success: true }` / `{ ok: true }` のような成功ラッパの有無が面ごとに混在する
- `{ success: boolean; error?: string }` のような独自Resultが再発し、呼び出し側の分岐・テストが増殖する
- どこまでが「内部の正規形」で、どこからが「境界への投影」なのかが曖昧になる

この揺れは、実装者の迷い・レビューコスト・互換性の破壊（レスポンス構造変更）を招く。
そのため、境界ごとに「固定されたResult Contract」を明文化し、SSOTとして扱う必要がある。

## Decision Drivers

- **一貫性**: どの層でも成功/失敗の扱いが予測できる
- **型安全**: `ErrorCode` / `AppError` を中心に、typoや辞書漏れを防ぐ
- **責務分離**: 内部正規形と境界契約を分離し、投影を明示する
- **互換性**: 外部に露出するレスポンス形の変更を最小化し、変更点を追跡可能にする
- **運用性**: correlation id / retryable 等を統一して、調査しやすくする

## Considered Options

- **Option A: 境界ごとにResult Contractを固定し、投影ルールを明文化する（採用）**
  - 内部: `AppResult`
  - Server Actions(UI境界): `ActionResult`
  - HTTP(Route Handlers): errorは Problem Details、successはpayloadのみ/必要なら204

- **Option B: まずは `AppError` 統一のみを維持し、成功/失敗の形は各実装に委ねる**
  - 短期は楽だが、独自Resultの再発を止められない

- **Option C: 全ての層で単一のResult型（例: ActionResult）を使い回す**
  - 一見統一されるが、HTTPや内部ロジックまでUI都合を持ち込みやすい

## Decision Outcome

**Chosen option: Option A — Result Contract at Boundaries を固定する**

### Contract

1. **内部（features/core/services/hooks）の正規形は `AppResult`**
   - 期待される失敗は `AppResult` の `success: false` で表現する
   - 失敗は必ず `AppError` を保持する

2. **Server Actions（UI境界）の返却は原則 `ActionResult<T>`**
   - redirect-only は ADR-0014 の条件を満たす場合のみ例外
   - `AppResult <-> ActionResult` の変換は adapter を用い、境界で投影する

3. **HTTP（Route Handlers）の error は RFC 7807 Problem Details**
   - `AppError -> Problem Details` は adapter に集約する
   - success は `{ success: true }` 等のラッパを返さず、payloadのみ（または `204 No Content`）

### Documentation Source of Truth

実装者向けの具体的なルール（例、アンチパターン、変換関数の使い方）は
`docs/conventions/error-and-result-contracts.md` に集約する。

## Consequences

### Positive

- 成功/失敗の扱いが層ごとに固定され、新規実装時に迷いにくい
- 独自Resultの再増殖を防止し、呼び出し側の分岐やテストが単純化する
- correlation id / retryable / userMessage の扱いが統一され、障害調査が容易になる

### Negative

- 既存コードの「成功ラッパ」や独自Resultは置換が必要になる
- 返却契約を破る変更（特にHTTPレスポンス形）は互換性破壊になり得るため、変更時の注意が必要

## Links

- ADR-0013: `docs/decisions/0013-unify-error-handling-with-appError-adapters.md`
- ADR-0014: `docs/decisions/0014-server-actions-redirect-only-pattern.md`
- Conventions: `docs/conventions/error-and-result-contracts.md`
- Related issues/PRs: #294, #289, #290, #295, #299
