# ADR-0010: 非同期基盤としてのQStash採用、再試行・DLQ・可観測性戦略

- **Status**: Accepted
- **Date**: 2025-12-21
- **Updated**: 2026-02-13

## Context and Problem Statement

「みんなの集金」では、Stripe Webhook（決済成功/失敗、払い戻しなど）の処理で DB 更新・メール通知・リマインダー送信などの重い処理が発生する。Webhookは5秒以内に2xx応答を返す必要があるが、同期処理ではタイムアウトリスクがあり、再試行・重複処理・障害時の追跡が課題となる。

以下の非同期基盤要件を満たす必要がある：
- **再試行**: 一時的エラー（ネットワーク/外部API遅延）からの自動回復
- **DLQ**: リトライ限界後の恒久失敗メッセージの保存・再実行
- **可観測性**: 処理成功率・レイテンシ・障害原因の迅速特定（Metrics/Logs/Traces）
- **冪等性**: Stripeの重複配信やQStashリトライ時の一貫性保証

## Decision Drivers

1. **応答速度**: Stripe 5秒タイムアウト回避
2. **信頼性**: データ損失ゼロ、再試行/DLQによる確実処理
3. **運用性**: Cloudflare Workers環境での軽量実装、監視容易性
4. **コスト**: サーバーレス従量課金、最小インフラ
5. **拡張性**: 通知・バッチ処理への横展開容易性

## Considered Options

| オプション | 再試行 | DLQ | 可観測性 | Workers親和性 | コスト |
|------------|--------|-----|----------|---------------|--------|
| **A: QStash** | 組み込み（指数バックオフ、最大回数指定） | 標準サポート（自動移動/コンソール管理） | ログ+外部ツール | ◎（HTTPベース） | 低（無料枠あり） |
| **B: AWS SQS+Lambda** | カスタム可能 | 標準（redrive policy） | CloudWatch統合 | △（APIコール必要） | 中 |
| **C: 同期処理** | なし | なし | ログのみ | ◎ | 最低 |

## Decision Outcome

**採用: Option A (QStash + アプリ補完)**

### 全体アーキテクチャ
```
Stripe Webhook → [署名検証 + QStash publish (204即返却)] → QStash → [Worker: DB更新/メール送信] → DLQ（失敗時）
                           ↓ Correlation IDでトレース
                     構造化ログ/Sentry/メトリクス
```

**選択理由**:
1. HTTPベースでCloudflare Workersから数百msでpublish可能、5秒制約を確実にクリア
2. **組み込み再試行/DLQ**: `retries: 3`で指数バックオフ自動リトライ→DLQ自動移動
3. **重複排除**: Stripe `event.id`を`deduplicationId`に使用
4. **可観測性基盤**: QStashダッシュボード + Sentry + 構造化ログでエンドツーエンド追跡

## 非同期基盤詳細設計

### 1. 再試行戦略（2層構造）
- **QStashレベル**: ネットワーク/HTTPエラー向け。`{retries: 3, delay: 0}`で指数バックオフ（1s→2s→4s...）
- **アプリレベル**: Worker内で「再試行不要（non-retryable）」と「再試行可能（retryable）」をHTTPステータスで明示する

| Workerレスポンス | 意味 | QStash挙動 |
|------------------|------|------------|
| `204 No Content` | 成功ACK（重複/既処理を含む） | リトライしない |
| `489` + `Upstash-NonRetryable-Error: true` | 恒久失敗（署名不正、JSON不正、必須項目欠落など） | リトライせずDLQへ |
| `5xx` | 一時失敗（DB一時障害、外部依存障害など） | リトライする |

- **区別基準（例）**:
  - 署名不正/ペイロード不正/必須データ欠落: `489`（non-retryable）
  - DB一時障害/ネットワーク断/外部API一時障害: `5xx`（retryable）
  - duplicate/already_processed: `204`（成功ACK）

### 2. DLQ運用
- **QStash DLQ活用**: リトライ限界で自動DLQトピックへ移動。コンソール/APIで一覧・再publish・削除
- **アプリ補完**: `failed_webhook_events`テーブル作成（event_id, payload, error, created_at）。DLQ監視スクリプトで自動同期し、管理画面で手動再実行
- **アラート**: DLQ滞留数>0 or 24h超でSentry/メール通知

### 3. 可観測性（Metrics/Logs/Traces）
```
Metrics: publish成功率(99.9%), Worker成功率(99.5%), リトライ率(<1%), DLQ流入率(0%)
Logs: Correlation ID + structured JSON (event_id, participant_id, error_type)
Traces: SentryでWebhook→QStash→Workerを1トレース化
```

| 収集項目 | ツール | アラート閾値 |
|----------|--------|-------------|
| QStash publish失敗 | Cloudflare Log | >1% |
| Workerエラー率 | Sentry | >0.5% |
| DLQ滞留数 | QStash Dashboard + スクリプト | >0 |
| E2Eレイテンシ | Sentry Traces | P95>10s |

### 4. 責務分担
- **Webhook Endpoint**: 署名検証→QStash publish→`204`（<500ms）
- **QStash**: 配信保証・リトライ・DLQ
- **Worker**: 冪等DB更新（`stripe_event_id` UNIQUE制約）→メール送信→ログ→HTTPでretry可否を明示

### 5. 応答コントラクト
- 成功レスポンスは JSON ラッパ（`{ success: true }` など）を返さず、`204 No Content` を基本とする。
- 相関情報（`requestId`, `eventId`, `qstashMessageId` など）はレスポンスボディではなくHTTPヘッダーで返す。
- エラー時は `respondWithProblem` による Problem Details を使用し、観測性を維持する。

## Consequences

### Positive
- **5秒保証**: publishのみで即応答、Stripe要件100%クリア
- **信頼性**: デュアルライト不要、QStash配信保証+DLQでデータ損失ゼロ
- **運用容易**: QStashコンソールでリトライ/DLQ一元管理、Sentryでエンドツーエンド可視化
- **拡張性**: メール/リマインダー/バッチも同一基盤で横展開可能

### Negative / リスク軽減策
| リスク | 影響度 | 軽減策 |
|--------|--------|--------|
| QStash障害 | 中 | フォールバック: 同期キュー（`SKIP_QSTASH_IN_TEST`）+アラート |
| DLQ監視不足 | 高 | 自動スクリプト+ダッシュボード |
| コスト超過 | 低 | 無料枠10k msg/dayでMVP十分、超過時SQS移行検討 |
| ベンダーロック | 中 | 抽象化Wrapper実装（`QueueService`インタフェース）など |

## 今後の検討

1. QStash DLQ有効化、構造化ログ強化、Sentryトレース
2. `failed_webhook_events`テーブル+管理画面
3. メトリクスダッシュボード（Grafana/Cloudflare）、メール非同期化

## Links
- [QStash DLQ](https://upstash.com/docs/qstash/features/dlq)
- [Stripe Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [QStash + Cloudflare Workers](https://upstash.com/docs/qstash/quickstarts/cloudflare-workers)
