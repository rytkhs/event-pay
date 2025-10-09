# dedupe_key 使用ガイド

## 概要

`system_logs`テーブルに`dedupe_key`カラムを追加しました。これにより、重複ログの記録を防止し、Webhook処理やトランザクション処理の冪等性を保証できます。

## 機能

- **重複防止**: 同一の`dedupe_key`を持つログは1度のみ記録される
- **UNIQUE制約**: データベースレベルで一意性を保証
- **部分インデックス**: NULL値は制約対象外（オプショナルな機能）
- **自動ハンドリング**: 重複時は静かにスキップ（エラーではない）

## 使用ケース

### 1. Webhook処理の重複防止

Stripeは同じイベントを最大3回配信する可能性があります。`stripe_event_id`をdedupe_keyに使用することで、重複処理を防げます。

```typescript
import { logToSystemLogs } from "@core/logging/system-logger";

// Stripe Webhook処理
await logToSystemLogs({
  log_category: "stripe_webhook",
  action: "webhook.payment_intent.succeeded",
  message: `Payment succeeded for event ${stripeEventId}`,
  actor_type: "webhook",
  stripe_event_id: stripeEventId,
  stripe_request_id: stripeRequestId,
  resource_type: "payment",
  resource_id: paymentId,
  outcome: "success",
  metadata: {
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
  },
  // 重複防止キーを設定
  dedupe_key: `webhook:${stripeEventId}`,
});
```

### 2. トランザクション処理の重複防止

決済処理など、重複実行を防ぎたいトランザクションログに使用します。

```typescript
// 決済作成ログ
await logToSystemLogs({
  log_category: "payment",
  action: "payment.create",
  message: `Payment created for event ${eventId}`,
  user_id: userId,
  resource_type: "payment",
  resource_id: paymentId,
  outcome: "success",
  // タイムスタンプを含めて一意性を保証
  dedupe_key: `tx:payment.create:${paymentId}:${Date.now()}`,
});
```

### 3. Idempotency-Keyベースの重複防止

Stripe APIのIdempotency-Keyを使用したログの重複防止。

```typescript
// Checkout作成ログ
await logToSystemLogs({
  log_category: "payment",
  action: "checkout.create",
  message: "Checkout session created",
  user_id: userId,
  idempotency_key: idempotencyKey,
  stripe_request_id: stripeRequestId,
  outcome: "success",
  // Idempotency-Keyをそのまま使用
  dedupe_key: `idempotent:${idempotencyKey}`,
});
```

### 4. カスタムキーでの重複防止

複合キーを使用したカスタムな重複防止。

```typescript
// イベント公開ログ
await logToSystemLogs({
  log_category: "event_management",
  action: "event.publish",
  message: `Event published: ${eventTitle}`,
  user_id: userId,
  resource_type: "event",
  resource_id: eventId,
  outcome: "success",
  // カテゴリ + アクション + リソースID
  dedupe_key: `event_management:event.publish:${eventId}`,
});
```

## 命名規則

### 推奨フォーマット

```
{type}:{identifier}[:{additional_context}]
```

### 例

| ケース | フォーマット | 例 |
|--------|--------------|-----|
| Webhook | `webhook:{event_id}` | `webhook:evt_1ABC123` |
| Transaction | `tx:{action}:{resource_id}:{timestamp}` | `tx:payment.create:pay_abc:1234567890` |
| Idempotent | `idempotent:{idempotency_key}` | `idempotent:checkout:evt_abc:usr_123` |
| Custom | `{category}:{action}:{resource_id}` | `payment:refund:pay_abc` |

## 重要な注意事項

### 1. オプショナルな機能

すべてのログに`dedupe_key`を設定する必要はありません。重複防止が必要なケースのみ使用してください。

```typescript
// 通常の情報ログ（dedupe_key不要）
await logToSystemLogs({
  log_category: "authentication",
  action: "user.login",
  message: "User logged in",
  user_id: userId,
  outcome: "success",
  // dedupe_keyは設定しない
});
```

### 2. エラーハンドリング

`logToSystemLogs`関数は、UNIQUE制約違反を自動的に処理します。アプリケーション側で特別な処理は不要です。

```typescript
// 内部実装（参考）
if (error.code === "23505" && error.message?.includes("dedupe_key")) {
  logger.debug("Duplicate log entry detected, skipping", {
    tag: "systemLog",
    dedupe_key: entry.dedupe_key,
    action: entry.action,
  });
  return; // 重複ログは無視して正常終了
}
```

### 3. タイムスタンプの使用

タイムスタンプを含める場合は、ミリ秒単位で一意性を保証してください。

```typescript
// ✅ Good: ミリ秒単位
dedupe_key: `tx:payment.create:${paymentId}:${Date.now()}`

// ❌ Bad: 秒単位（同一秒内に複数実行される可能性）
dedupe_key: `tx:payment.create:${paymentId}:${Math.floor(Date.now() / 1000)}`
```

### 4. パフォーマンス

- UNIQUE制約のチェックはインデックスを使用するため高速
- NULL値の場合はインデックスに含まれないため、オーバーヘッドなし
- 部分インデックス（`WHERE dedupe_key IS NOT NULL`）により、最適化されています

## データベーススキーマ

```sql
-- カラム定義
dedupe_key text,

-- UNIQUE制約付きインデックス
CREATE UNIQUE INDEX idx_system_logs_dedupe_key
ON public.system_logs (dedupe_key)
WHERE dedupe_key IS NOT NULL;
```

## 検証クエリ

### 重複キーの確認

```sql
-- 重複している dedupe_key を確認
SELECT dedupe_key, COUNT(*) as count
FROM system_logs
WHERE dedupe_key IS NOT NULL
GROUP BY dedupe_key
HAVING COUNT(*) > 1;
```

### dedupe_key使用率の確認

```sql
-- dedupe_key が設定されているログの割合
SELECT
  COUNT(*) FILTER (WHERE dedupe_key IS NOT NULL) as with_dedupe_key,
  COUNT(*) as total,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE dedupe_key IS NOT NULL) / COUNT(*),
    2
  ) as percentage
FROM system_logs;
```

### カテゴリ別の dedupe_key 使用状況

```sql
-- カテゴリごとの dedupe_key 使用率
SELECT
  log_category,
  COUNT(*) FILTER (WHERE dedupe_key IS NOT NULL) as with_dedupe_key,
  COUNT(*) as total,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE dedupe_key IS NOT NULL) / COUNT(*),
    2
  ) as percentage
FROM system_logs
GROUP BY log_category
ORDER BY percentage DESC;
```

## 実装ファイル

- **マイグレーション**: `supabase/migrations/20251008000000_rebuild_system_logs.sql`
- **TypeScript型定義**: `core/logging/system-logger.ts`
- **ヘルパー関数**: `logToSystemLogs()`

## 関連資料

- [OpenTelemetry Event Specification](https://opentelemetry.io/docs/reference/specification/logs/data-model/)
- [Stripe Webhooks Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [PostgreSQL UNIQUE Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS)
