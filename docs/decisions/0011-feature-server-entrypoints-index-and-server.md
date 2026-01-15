# ADR-0011: Featureのserver-only公開エントリ（server.ts）の導入

- Status: Accepted
- Date: 2026-01-15

## Context and Problem Statement

Next.js App Router の `app/api/**` や worker（server-only 実行環境）から `features/<domain>` を参照するケースが増えてきた。

一方で、Feature の公開入口を `index.ts` に一本化すると、以下の問題が起きる：

- `index.ts` が client component / client hook / UI を export している場合、API/worker が `@features/<domain>` を import すると **client依存が server-only 領域に混入**するリスクがある。
- `boundaries/entry-point` を厳格に運用しているため、server-only 側が安全に参照できる公開入口を別に持ちづらい。

これにより、境界違反を回避するために深いパス import / 動的import による迂回が増え、責務や依存関係が不明瞭になりうる。

## Decision Drivers

- **安全性**: server-only 実行環境に client 依存を混入させない
- **明確性**: server から参照可能な公開APIを明示し、深いパス import を避ける
- **強制力**: ESLint（boundaries）で規約を自動検出できる
- **段階移行**: 既存の `index.ts` 前提を壊さずに拡張できる

## Considered Options

- Option A: `index.ts` の export を厳密に分離し、client を含めない（UIは別Featureへ）
  - Pros: entrypointが1つで単純
  - Cons: 既存設計と衝突しやすく、移行コストが高い

- Option B: 深いパス import を許可し、レビューで運用する
  - Pros: 追加の仕組みが不要
  - Cons: ルールが形骸化しやすく、client混入を検知しづらい

- Option C: `server.ts` を server-only の公開エントリとして追加（採用）
  - Pros: server-only 側の公開APIを明示でき、client混入を抑止できる
  - Cons: entrypointが2つになり運用ルールが増える

## Decision Outcome

**採用オプション**: Option C（`server.ts` を server-only の公開エントリとして追加）

### ルール

- `features/<domain>/index.ts`
  - 既定の公開エントリ（UI/Client を含む公開API）
- `features/<domain>/server.ts`
  - server-only の公開エントリ（API Route / Worker / Server Actions など）
  - 先頭に `import "server-only";` を置き、client export を混入させない

### ESLint

`boundaries/entry-point` の許可対象を `index.{js,ts,tsx}` に加えて `server.{js,ts,tsx}` も許可する。

## Consequences

### Positive

- server-only 側の import が安全になり、client混入リスクが下がる
- 公開APIの設計が明確になり、深いパス import を減らせる
- boundaries/entry-point の強制力を維持したまま運用できる

### Negative

- entrypointが2つになり、export設計のメンテが増える
- `server.ts` に何を出すべきかの判断が必要になる（必要最小限に留める）

## Links

- `ARCHITECTURE_RULES.md`
- `.eslintrc.json`（`boundaries/entry-point`）
- Supersedes: ADR-0007（entry-point制約の「index.tsのみ」部分。相互依存禁止やレイヤ境界の方針は継続）
