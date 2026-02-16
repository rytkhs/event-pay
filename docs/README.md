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
- テーブル/列/制約/RLSが変わった → `data-model.md` + `supabase/migrations/*.sql`
- 状態遷移や不変条件が変わった → `domain.md`
- 脅威・対策・運用（鍵・Webhook・ログ等）が変わった → `security.md`
- エラー/Resultの返却契約を変更した → `conventions/error-and-result-contracts.md` + 必要なら ADR
- 「なぜそうしたか」を後で説明したくなる変更 → ADRを追加（`decisions/`）
