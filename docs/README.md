# Documentation

「みんなの集金（EventPay）」の設計・仕様ドキュメント。

## Document Index

- [Architecture](./architecture.md) - システム構成、シーケンス、レイヤー。
- [Security](./security.md) - 脅威モデル、対策実装、ログ方針。
- [Data model](./data-model.md) - ER図、冪等性キー、RLSポリシー。
- [Domain model](./domain.md) - 会計業務のドメイン知識、状態遷移、不変条件。
- [Conventions](./conventions/error-and-result-contracts.md) - エラー/Resultの返却契約（AppResult/ActionResult/Problem Details）。
- [Conventions](./conventions/response-conventions.md) - `app/api/**` のHTTPレスポンス規約（payload only / Problem Details）。
- [Key Flows](./flows/) - 主要な業務プロセス。
- [Decisions (ADR)](./decisions/) - 技術的な意思決定の履歴。

## Update Policy

- 外部サービス統合・コンポーネント構成が変わった → `architecture.md`
- テーブル/列/制約/RLSが変わった → `supabase/migrations/*.sql` + `data-model.md` + `pnpm run db:generate`
- 状態遷移や不変条件が変わった → `domain.md`
- 脅威・対策・運用（鍵・Webhook・ログ等）が変わった → `security.md`
- エラー/Resultの返却契約を変更した → `conventions/error-and-result-contracts.md` + 必要なら ADR
- 「なぜそうしたか」を後で説明したくなる変更 → ADRを追加（`decisions/`）

## Generated Artifacts

スキーマの正は `supabase/migrations/*.sql` のみ。次の2つは、それをローカルDBへ適用した結果のスナップショットであり、手で編集しない。

| 生成物 | 用途 |
|---|---|
| `types/database.ts` | アプリ全体の型の起点（`core/types/supabase.ts` が `AppDatabase` として再エクスポート） |
| `local_schema.sql` | 現時点のDDLをDocker無しで読む・grepするための参照用スナップショット。41本の migration を追わずに「いまの姿」を確認できる |

migration を追加・変更したら、ローカルスタックを起動した状態で再生成してコミットする。

```
supabase start
pnpm run db:reset
pnpm run db:generate
```

CI（`.github/workflows/test.yml` の `DB / Integration` ジョブ）が `Verify generated artifacts` で再生成後の差分を検証するため、忘れるとPRが落ちる。

なお `wrangler types` が生成する `cloudflare-env.d.ts` は、アプリが Cloudflare の binding を型として参照していない（アクセスは `@opennextjs/cloudflare` の `getCloudflareContext()` 経由のみ）ため保持しない。将来 `wrangler.jsonc` の binding を直接型付けしたくなったら `pnpm exec wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts` で生成し、その時点で管理方針を決める。
