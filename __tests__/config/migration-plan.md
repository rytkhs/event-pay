# Jest Profile分割 → 統合テスト・E2Eテスト移行実装プラン

## ✅ 実装完了ステータス

**実装完了日**: 2024年7月16日
**実装者**: Claude Assistant
**実装状況**: 全Phase完了（Phase 1〜4）

### 完了した実装項目

- ✅ **Phase 1**: E2Eテスト拡充完了
  - `e2e/auth-complete-flow.spec.ts` (206 lines)
  - `e2e/attendance-registration-flow.spec.ts` (355 lines)
  - `e2e/event-management-flow.spec.ts` (411 lines)

- ✅ **Phase 2**: 統合テスト整理完了
  - 重複テストファイル削除 (795 lines削除)
  - 統合テスト再構築 (database/, server-actions/)

- ✅ **Phase 3**: Jest Profile統合完了
  - `jest.config.simplified.mjs` 作成
  - simplified-*.setup.mjs 作成 (3ファイル)
  - 不要設定ファイル削除 (6ファイル削除)

- ✅ **Phase 4**: package.jsonスクリプト更新完了
  - 統合テストスクリプト実装
  - 不要スクリプト削除

### 最終的な構成

```
__tests__/config/jest-profiles/
├── simplified-unit.setup.mjs       # 単体テスト用setup
├── simplified-integration.setup.mjs # 統合テスト用setup
├── simplified-e2e.setup.mjs        # E2Eテスト用setup
└── integration.env.mjs             # 環境変数設定

jest.config.simplified.mjs          # 統合設定ファイル
```

## 実装ステップ

### Phase 1: E2Eテスト拡充（優先度: 高）

#### 1.1 認証フローE2Eテスト
```bash
# 新規作成
e2e/auth-complete-flow.spec.ts
```
- ログイン・ログアウト・パスワードリセット
- セッション管理・認証状態の永続化
- エラーハンドリング・バリデーション

#### 1.2 イベント管理フローE2Eテスト
```bash
# 既に作成済み
e2e/event-management-flow.spec.ts
```
- イベント作成・編集・削除フロー
- 参加者管理・制限項目の可視化
- 招待リンク生成・QRコード表示

#### 1.3 参加申し込みフローE2Eテスト
```bash
# 新規作成
e2e/attendance-registration-flow.spec.ts
```
- 招待リンクからの参加申し込み
- 決済方法選択・Stripe決済フロー
- 参加ステータス変更・キャンセル

### Phase 2: 統合テスト整理（優先度: 中）

#### 2.1 削除対象の統合テスト
```bash
# E2Eテストに移行済みのため削除
__tests__/integration/auth-server-actions-flow.test.tsx
__tests__/integration/events/page.integration.test.tsx
__tests__/integration/events/updateEventAction.integration.test.ts
```

#### 2.2 残留対象の統合テスト
```bash
# Server Actions単体テスト
__tests__/integration/server-actions/
├── auth-actions.test.ts
├── event-actions.test.ts
└── payment-actions.test.ts

# データベース関連テスト
__tests__/integration/database/
├── schema-validation.test.ts
├── rls-policies.test.ts
└── migrations.test.ts
```

### Phase 3: Jest Profile統合（優先度: 中）

#### 3.1 新しいJest設定
```bash
# 統合後の設定ファイル
jest.config.simplified.mjs
├── unit: __tests__/config/jest-profiles/simplified-unit.setup.mjs
├── integration: __tests__/config/jest-profiles/simplified-integration.setup.mjs
└── e2e: __tests__/config/jest-profiles/simplified-e2e.setup.mjs
```

#### 3.2 削除対象の設定ファイル
```bash
# 削除予定
__tests__/config/jest-profiles/
├── api.setup.mjs
├── security.setup.mjs
├── integration-supabase.setup.mjs
└── integration.env.mjs
```

### Phase 4: package.jsonスクリプト更新

#### 4.1 新しいテストスクリプト
```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "jest --config jest.config.simplified.mjs --testPathPattern=unit",
    "test:integration": "jest --config jest.config.simplified.mjs --testPathPattern=integration",
    "test:e2e": "playwright test",
    "test:dev": "npm run test:unit",
    "test:ci": "npm run test:unit && npm run test:integration",
    "test:full": "npm run test:unit && npm run test:integration && npm run test:e2e"
  }
}
```

#### 4.2 削除対象スクリプト
```json
{
  "scripts": {
    // 削除予定
    "test:api": "jest --config jest.config.api.mjs",
    "test:security": "jest --config jest.config.security.mjs",
    "test:integration:supabase": "jest --config jest.config.integration-supabase.mjs"
  }
}
```

## 実装コマンド

### Phase 1: E2Eテスト拡充
```bash
# 認証フローE2Eテスト作成
touch e2e/auth-complete-flow.spec.ts

# 参加申し込みフローE2Eテスト作成
touch e2e/attendance-registration-flow.spec.ts

# E2Eテスト実行確認
npm run test:e2e
```

### Phase 2: 統合テスト整理
```bash
# 重複する統合テストを削除
rm __tests__/integration/auth-server-actions-flow.test.tsx
rm __tests__/integration/events/page.integration.test.tsx

# 残留する統合テストを整理
mkdir -p __tests__/integration/server-actions
mkdir -p __tests__/integration/database
```

### Phase 3: Jest Profile統合
```bash
# 統合されたsetupファイルを作成
cp __tests__/config/jest-profiles/simplified-unit.setup.mjs __tests__/config/jest-profiles/unit.setup.mjs

# 不要なsetupファイルを削除
rm __tests__/config/jest-profiles/api.setup.mjs
rm __tests__/config/jest-profiles/security.setup.mjs
rm __tests__/config/jest-profiles/integration-supabase.setup.mjs
```

### Phase 4: package.json更新
```bash
# package.jsonのスクリプトを更新
# （手動編集が必要）
```

## 期待される効果

### 定量的効果
- **テストファイル数**: 88個 → 70個（約20%削減）
- **Jest setup数**: 6個 → 3個（50%削減）
- **テスト実行時間**: 約50%短縮
- **メンテナンス工数**: 約60%削減

### 定性的効果
- **テスト信頼性向上**: E2Eテストによる実際のユーザーフロー検証
- **開発効率向上**: シンプルなモック設定による新規テスト追加の高速化
- **保守性向上**: 統一されたテスト戦略による一貫性確保

## リスク対策

### 移行時のリスク
1. **テストカバレッジ低下**: 移行前に既存テストの網羅性を確認
2. **E2Eテスト実行時間**: 並列実行とキャッシュ活用で最適化
3. **CI/CD影響**: 段階的移行でCI/CDパイプライン安定性確保

### 対策
1. **段階的移行**: 各Phaseを独立して実行し、影響範囲を限定
2. **テスト並列実行**: PlaywrightとJestの並列実行設定
3. **ロールバック計画**: 各Phase完了後のロールバック手順を準備

## 実装スケジュール

| Phase | 工数 | 期間 | 担当 |
|-------|------|------|------|
| Phase 1 | 2日 | 1週間 | 開発者 |
| Phase 2 | 1日 | 3日 | 開発者 |
| Phase 3 | 0.5日 | 1日 | 開発者 |
| Phase 4 | 0.5日 | 1日 | 開発者 |

**合計**: 4日間（約1週間）で完了予定
