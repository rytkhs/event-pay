# Test Helpers

## テストユーザー管理 (`test-user.ts`)

Playwrightテスト用の安定したテストユーザー作成・削除機能を提供します。

### 主な改善点

- **競合状態の回避**: 複数テストの並行実行でも安全
- **リトライ機構**: 一時的な障害に対する指数バックオフ付き再試行
- **堅牢なエラーハンドリング**: 詳細なログ出力とロールバック処理
- **トランザクション風の処理**: `auth.users`と`public.users`の整合性保証

### 基本的な使用方法

```typescript
import { createTestUser, deleteTestUser } from './test-user';

// テストユーザーの作成
const user = await createTestUser('test@example.com', 'password123');

// オプション付きでの作成
const user2 = await createTestUser('test2@example.com', 'password123', {
  maxRetries: 5,
  retryDelay: 2000,
  skipProfileCreation: false
});

// テストユーザーの削除
await deleteTestUser('test@example.com');
```

### 複数ユーザーの作成

```typescript
import { createMultipleTestUsers } from './test-user';

// 順次実行（安全）
const users = await createMultipleTestUsers([
  { email: 'user1@test.com', password: 'pass1' },
  { email: 'user2@test.com', password: 'pass2' }
]);

// 並列実行（高速）
const users2 = await createMultipleTestUsers(
  [
    { email: 'user3@test.com', password: 'pass3' },
    { email: 'user4@test.com', password: 'pass4' }
  ],
  { parallel: true }
);
```

### 一括削除

```typescript
import { deleteAllTestUsers } from './test-user';

// 全テストユーザーを削除（危険な操作）
await deleteAllTestUsers();
```

### 設定オプション

- `maxRetries`: 最大リトライ回数（デフォルト: 3）
- `retryDelay`: 初回リトライ遅延時間（デフォルト: 1000ms）
- `skipProfileCreation`: プロファイル作成をスキップ（デフォルト: false）
- `parallel`: 並列実行の有効化（デフォルト: false）
- `cleanupOnFailure`: 失敗時のクリーンアップ（デフォルト: true）

### トラブルシューティング

#### エラー: "Failed to create test user"
- データベース接続を確認してください
- 環境変数（Supabase設定）を確認してください
- 管理者権限があることを確認してください

#### エラー: "User may have been created by another process"
- 正常な動作です。並行テストで競合が発生した際の安全な処理です
- リトライ機構により自動的に解決されます

#### テストが遅い
- `skipProfileCreation: true`を使用してプロファイル作成をスキップできます
- `parallel: true`で並列実行を有効化できます（リソース使用量は増加）

### ログ出力

安定版では詳細なログ出力を提供します：
- ✓: 成功操作
- ⚠: 警告（非致命的エラー）
- ✗: エラー（致命的）

```
Creating or retrieving test user: test@example.com
✓ Using existing test user: test@example.com (ID: abc123)
✓ Test user ready: test@example.com
```
