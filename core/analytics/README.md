# GA4 Analytics Utilities

GA4（Google Analytics 4）イベント送信のための堅牢で信頼性の高いユーティリティライブラリです。クライアント側とサーバー側の両方でGA4イベントを送信でき、タイムアウト処理、リトライロジック、パラメータ検証などのプロダクションレディな機能を提供します。

## 概要

このモジュールは以下の主要コンポーネントで構成されています：

- **GA4ClientService**: クライアント側（ブラウザ）でのGA4イベント送信
- **GA4ServerService**: サーバー側でのMeasurement Protocol APIを使用したイベント送信
- **GA4Validator**: Client IDとイベントパラメータの検証・サニタイズ
- **GA4Error**: 統一されたエラーハンドリング

## 主な改善点

### 1. タイムアウト処理（クライアント側）

Client ID取得とイベントコールバックにタイムアウト保護を追加し、GA4が応答しない場合でもアプリケーションがハングしないようにしました。
また、Client ID取得時には `gtag` のロード完了を待機するポーリング処理を追加し、スクリプト読み込みの遅延に対応しました。

- Client ID取得: デフォルト3000ms（ポーリング間隔: 100ms）
- イベントコールバック: デフォルト2000ms

### 2. リトライロジック（サーバー側）

一時的なネットワークエラーやサーバーエラー（5xx）に対して自動リトライを実装しました。

- 最大3回のリトライ
- 指数バックオフ（2^attempt × 1000ms）
- ランダムジッター（最大1000ms）で thundering herd を防止

### 3. パラメータ検証とサニタイズ

GA4の仕様に準拠したパラメータ検証を実装しました。

- パラメータ名: 英数字とアンダースコアのみ、最大40文字
- 文字列値: 最大100文字（超過分は自動切り詰め）
- Client ID: `数字.数字` 形式の検証（GA4標準フォーマット）

### 4. バッチ送信の最適化

レート制限に対応したバッチ処理を実装しました。

- 25イベントごとに自動分割
- 並列処理による高速化
- 部分失敗時の詳細なログ出力

### 5. 設定の動的リフレッシュ

環境変数の変更を再起動なしで反映できるようになりました。

## インストールと設定

### 環境変数

```bash
# 必須
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=your-api-secret

# オプション
NEXT_PUBLIC_GA4_ENABLED=true
NEXT_PUBLIC_GA4_DEBUG=false
```

### 設定の確認

```typescript
import { getGA4Config } from '@core/analytics/config';

const config = getGA4Config();
console.log('GA4 Enabled:', config.enabled);
```

## 使用例

### クライアント側でのイベント送信

#### 基本的な使用方法

```typescript
import { ga4Client } from '@core/analytics';

// シンプルなイベント送信
ga4Client.sendEvent({
  name: 'page_view',
  params: {
    page_title: 'Home',
    page_location: window.location.href,
  },
});
```

#### タイムアウト付きClient ID取得

```typescript
// デフォルトタイムアウト（3000ms）
const clientId = await ga4Client.getClientId();

// カスタムタイムアウト
const clientId = await ga4Client.getClientId(5000); // 5秒

if (clientId) {
  console.log('Client ID:', clientId);
} else {
  console.log('Client ID取得に失敗またはタイムアウト');
}
```

#### コールバック付きイベント送信

```typescript
// デフォルトタイムアウト（2000ms）
ga4Client.sendEventWithCallback(
  {
    name: 'purchase',
    params: {
      transaction_id: 'T12345',
      value: 99.99,
      currency: 'JPY',
    },
  },
  () => {
    console.log('イベント送信完了');
    // 次の処理へ進む
  }
);

// カスタムタイムアウト
ga4Client.sendEventWithCallback(
  event,
  callback,
  3000 // 3秒
);
```

### サーバー側でのイベント送信

#### 基本的な使用方法

```typescript
import { ga4Server } from '@core/analytics';

// 単一イベントの送信
await ga4Server.sendEvent(
  {
    name: 'purchase',
    params: {
      transaction_id: 'T12345',
      value: 99.99,
      currency: 'JPY',
    },
  },
  '1234567890.0987654321', // Client ID
  'user123', // User ID（オプション）
  1234567890, // Session ID（オプション）
  5000 // Engagement time（オプション）
);
```

#### バッチ送信

```typescript
const events = [
  { name: 'page_view', params: { page_title: 'Home' } },
  { name: 'scroll', params: { percent_scrolled: 90 } },
  { name: 'click', params: { link_text: 'Learn More' } },
  // ... 最大数百イベント
];

// 自動的に25イベントずつに分割して並列送信
await ga4Server.sendEvents(events, clientId);
```

#### 依存性注入（テスト用）

```typescript
// モックfetchを使用したテスト
const mockFetch = jest.fn();
const testServer = new GA4ServerService(mockFetch);

await testServer.sendEvent(event, clientId);

expect(mockFetch).toHaveBeenCalledWith(
  expect.stringContaining('google-analytics.com'),
  expect.objectContaining({ method: 'POST' })
);
```

### パラメータ検証

#### Client ID検証

```typescript
import { GA4Validator } from '@core/analytics';

const result = GA4Validator.validateClientId('1234567890.0987654321');

if (result.isValid) {
  console.log('有効なClient ID');
} else {
  console.error('検証エラー:', result.errors);
  // ["Client ID does not match required format (10digits.10digits)"]
}
```

#### イベントパラメータの検証とサニタイズ

```typescript
const params = {
  event_name: 'purchase',
  'invalid-name': 'value', // ハイフンは無効
  long_string: 'a'.repeat(150), // 100文字を超過
  valid_param: 'ok',
};

const result = GA4Validator.validateAndSanitizeParams(params, true);

console.log('サニタイズ済みパラメータ:', result.sanitizedParams);
// {
//   event_name: 'purchase',
//   long_string: 'aaa...aaa', // 100文字に切り詰め
//   valid_param: 'ok'
// }

console.log('エラー:', result.errors);
// ["Invalid parameter name: invalid-name"]
```

### エラーハンドリング

#### GA4Errorの使用

```typescript
import { GA4Error, GA4ErrorCode } from '@core/analytics';

try {
  await ga4Server.sendEvent(event, invalidClientId);
} catch (error) {
  if (error instanceof GA4Error) {
    console.error('GA4エラー:', error.code);
    console.error('メッセージ:', error.message);
    console.error('コンテキスト:', error.context);

    switch (error.code) {
      case GA4ErrorCode.INVALID_CLIENT_ID:
        // Client ID検証エラーの処理
        break;
      case GA4ErrorCode.RETRY_EXHAUSTED:
        // リトライ失敗の処理
        break;
      case GA4ErrorCode.API_ERROR:
        // APIエラーの処理
        break;
    }
  }
}
```

#### エラーコード一覧

```typescript
GA4ErrorCode.TIMEOUT              // タイムアウト
GA4ErrorCode.INVALID_CLIENT_ID    // 無効なClient ID
GA4ErrorCode.INVALID_PARAMETER    // 無効なパラメータ
GA4ErrorCode.API_ERROR            // APIエラー
GA4ErrorCode.RETRY_EXHAUSTED      // リトライ失敗
GA4ErrorCode.CONFIGURATION_ERROR  // 設定エラー
```

## デバッグモード

デバッグモードを有効にすると、詳細なログが出力されます。

```bash
# 環境変数で有効化
NEXT_PUBLIC_GA4_DEBUG=true
```

デバッグログの例：

```
[GA4] Client ID retrieved: 1234567890.0987654321
[GA4] Event sent: purchase
[GA4] Retrying after error (attempt: 1, delay: 1234ms)
[GA4] Truncated parameter description from 150 to 100 characters
[GA4] Batch sent successfully (batch_index: 0, event_count: 25)
```

## マイグレーションガイド

### 既存コードからの移行

既存のGA4実装からの移行は段階的に行えます。新しいAPIは後方互換性を維持しているため、既存のコードは引き続き動作します。

#### Phase 1: タイムアウト処理の追加

```typescript
// 旧コード
const clientId = await ga4Client.getClientId();

// 新コード（タイムアウト付き）
const clientId = await ga4Client.getClientId(3000);
```

#### Phase 2: エラーハンドリングの改善

```typescript
// 旧コード
try {
  await ga4Server.sendEvent(event, clientId);
} catch (error) {
  console.error('Error:', error);
}

// 新コード（構造化エラー）
try {
  await ga4Server.sendEvent(event, clientId);
} catch (error) {
  if (error instanceof GA4Error) {
    logger.error('GA4 error', {
      code: error.code,
      message: error.message,
      context: error.context,
    });
  }
}
```

#### Phase 3: パラメータ検証の追加

```typescript
// 旧コード
await ga4Server.sendEvent(event, clientId);

// 新コード（検証は自動的に実行される）
// sendEvent内部でGA4Validatorが自動的に呼ばれます
await ga4Server.sendEvent(event, clientId);

// 明示的な事前検証が必要な場合
const validation = GA4Validator.validateAndSanitizeParams(event.params);
if (validation.isValid) {
  await ga4Server.sendEvent(
    { ...event, params: validation.sanitizedParams! },
    clientId
  );
}
```

#### Phase 4: バッチ送信の最適化

```typescript
// 旧コード（手動でループ）
for (const event of events) {
  await ga4Server.sendEvent(event, clientId);
}

// 新コード（自動バッチ処理）
await ga4Server.sendEvents(events, clientId);
// 自動的に25イベントずつに分割され、並列処理されます
```

### 破壊的変更

このアップデートには破壊的変更はありません。すべての既存APIは引き続き動作します。

### 推奨される移行手順

1. **デバッグモードを有効化**: `NEXT_PUBLIC_GA4_DEBUG=true` を設定
2. **段階的に新機能を導入**: 重要度の高い箇所から順に適用
3. **ログを監視**: デバッグログでタイムアウトやリトライの動作を確認
4. **テストを実行**: 既存のテストが引き続きパスすることを確認
5. **本番環境にデプロイ**: 問題がなければデバッグモードを無効化

## パフォーマンスへの影響

### クライアント側

- Client ID取得: タイムアウト処理により最大3秒の遅延（デフォルト）
- イベント送信: タイムアウト処理により最大2秒の遅延（デフォルト）
- パラメータ検証: 無視できるオーバーヘッド（< 1ms）

### サーバー側

- リトライロジック: 失敗時のみ影響（最大約20秒の遅延）
- パラメータ検証: 無視できるオーバーヘッド（< 1ms）
- バッチ処理: 並列処理により大幅な高速化（25イベント単位）

## トラブルシューティング

### Client IDが取得できない

```typescript
const clientId = await ga4Client.getClientId();
if (!clientId) {
  // 原因:
  // 1. GA4が無効化されている
  // 2. gtagスクリプトが読み込まれていない
  // 3. タイムアウトが発生した

  // 対処法:
  // - 環境変数を確認: NEXT_PUBLIC_GA4_ENABLED=true
  // - gtagスクリプトの読み込みを確認
  // - タイムアウト時間を延長: getClientId(5000)
}
```

### イベントが送信されない

```typescript
// デバッグモードを有効化して詳細を確認
NEXT_PUBLIC_GA4_DEBUG=true

// ログを確認:
// - "Event skipped (disabled)" → GA4が無効
// - "Invalid client ID" → Client ID検証エラー
// - "Event parameters validation failed" → パラメータエラー
```

### リトライが失敗する

```typescript
// リトライ回数を増やす（GA4ServerServiceのコンストラクタで設定）
// または、ネットワーク接続を確認
```

### バッチ送信が部分的に失敗する

```typescript
// ログで失敗したバッチを特定
// [GA4] Batch sending completed (total_batches: 4, succeeded: 3, failed: 1)

// 失敗したバッチのみを再送信
const failedEvents = events.slice(75, 100); // 4番目のバッチ
await ga4Server.sendEvents(failedEvents, clientId);
```

## API リファレンス

### GA4ClientService

#### `getClientId(timeoutMs?: number): Promise<string | null>`

Client IDを取得します。`window.gtag` が利用可能になるまでポーリングを行い、取得を試みます。

- **timeoutMs**: タイムアウト時間（ミリ秒）、デフォルト: 3000
- **戻り値**: Client ID、または取得失敗時は null

#### `sendEvent(event: GA4Event): void`

イベントを送信します。

- **event**: 送信するイベント

#### `sendEventWithCallback(event: GA4Event, callback: () => void, timeoutMs?: number): void`

コールバック付きでイベントを送信します。

- **event**: 送信するイベント
- **callback**: 送信完了後に実行する関数
- **timeoutMs**: タイムアウト時間（ミリ秒）、デフォルト: 2000

### GA4ServerService

#### `sendEvent(event: GA4Event, clientId?: string, userId?: string, sessionId?: number, engagementTimeMsec?: number): Promise<void>`

サーバー側でイベントを送信します。

- **event**: 送信するイベント
- **clientId**: Client ID（オプション）
- **userId**: User ID（オプション）
- **sessionId**: Session ID（オプション）
- **engagementTimeMsec**: エンゲージメント時間（オプション）

#### `sendEvents(events: GA4Event[], clientId: string): Promise<void>`

複数のイベントをバッチ送信します。

- **events**: 送信するイベントの配列
- **clientId**: Client ID

### GA4Validator

#### `static validateClientId(clientId: string): ValidationResult`

Client IDを検証します。

- **clientId**: 検証するClient ID
- **戻り値**: 検証結果

#### `static validateAndSanitizeParams(params: Record<string, unknown>, debug?: boolean): ValidationResult`

イベントパラメータを検証・サニタイズします。

- **params**: 検証するパラメータ
- **debug**: デバッグログを出力するか
- **戻り値**: 検証結果とサニタイズ済みパラメータ

## ライセンス

このプロジェクトのライセンスに従います。

## サポート

問題が発生した場合は、以下を確認してください：

1. デバッグモードを有効化してログを確認
2. 環境変数が正しく設定されているか確認
3. GA4の管理画面でイベントが記録されているか確認

それでも解決しない場合は、プロジェクトのIssueトラッカーに報告してください。
