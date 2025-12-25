# ADR-0003: Supabase をMVPのDB基盤として採用する

- Status: Accepted
- Date: 2025-12-21

## Context and Problem Statement
本プロダクトのMVPでは、出欠・決済状態・現金受領などの状態を一貫して扱えるRDBが必要で、個人開発のためDB運用（バックアップ、更新、監視など）を極力自作せずに進めたい。
また、スピード優先・小規模・コスト重視のため、無料〜低コストで開始でき、必要に応じて段階的にスケールできるDBaaSを選定する必要がある。

## Decision Drivers
- 初期コストを抑えられる（無料枠/低価格の起点がある）
- 運用負担が小さい（マネージド、設定がシンプル）
- Webアプリ（Next.js/TypeScript）から使いやすい（接続・SDK・運用導線）
- 将来的な移行リスクが低い（標準的なPostgreSQL、データ移行性）

## Considered Options
- Option A: Supabase（Postgres DBaaS）
- Option B: Neon（Serverless Postgres）
- Option C: Vercel Postgres
- Option D: Render Postgres（Free）
- Option E: Railway Postgres
- Option F: Turso（libSQL/SQLite系）

## Decision Outcome
Option A（Supabase）を採用する。
SupabaseはFreeプランから開始でき、MVPの初期費用を抑えやすい点を重視した。
同じPostgreSQL系の代替としてNeon（Freeプランあり）も有力だが、今回は「まず1つの管理画面/プラットフォームに寄せて運用負担を下げる」方針を優先し、Supabaseを第一候補として固定する。

## Consequences
- Positive: Freeプランから開始でき、初期コストを抑えたMVP立ち上げが可能になる。
- Positive: PostgreSQL前提の設計により、他のPostgreSQLホスティングへ移行する選択肢も残る（例：Neon）。
- Negative: 将来、アクセス増加や機能追加で無料枠を超えるとコストが発生し、費用予測の見直しが必要になる。
- Negative: DBをSupabaseに寄せるため、プラットフォーム障害や仕様変更の影響を受ける可能性がある。

## Pros and Cons of the Options
- Option A: Supabase
  - Pros: Freeプランがあり、MVPの初期コストを抑えやすい。
  - Cons: 無料枠超過時の費用管理が必要。

- Option B: Neon
  - Pros: Free（$0）から開始でき、Serverless Postgresとして利用できる。
  - Cons: 採用時は「DB + 周辺運用（管理導線）」を別サービスで組む判断が増えやすい。

- Option C: Vercel Postgres
  - Pros: Vercel利用者向けに提供され、ホスティングと近い導線で扱える。
  - Cons: 利用条件や費用はVercel側の枠組みに依存する。

- Option D: Render Postgres（Free）
  - Pros: 無料でPostgresを試せる。
  - Cons: FreeのPostgresが30日でexpireする。

- Option E: Railway Postgres
  - Pros: 使用量ベースの課金モデルで始められる。
  - Cons: RAM/CPU/ネットワーク/ストレージ等の積み上げでコストが読みづらくなり得る。

- Option F: Turso
  - Pros: Free（$0）/Developerプランなど、低価格帯の起点がある。
  - Cons: Postgresではない（libSQL/SQLite系）ため、将来の移行や周辺エコシステム適合を追加検討しやすい。

## Links
- Supabase Pricing: https://supabase.com/pricing
- Neon Pricing: https://neon.com/pricing
- Vercel Postgres: https://vercel.com/changelog/vercel-postgres-is-now-available-for-pro-users
- Render Postgres: https://render.com/docs/postgresql-refresh
- Railway Pricing Plans: https://docs.railway.com/reference/pricing/plans
- Turso Pricing: https://turso.tech/pricing
