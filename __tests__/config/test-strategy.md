# EventPay テスト戦略再構築プラン

## 現状の問題点
- Jest profile分割が過度に細分化（6つのsetup）
- グローバルモックの複雑化
- 統合テストとE2Eテストの重複
- テスト実行時間の増加

## 推奨テスト階層（3層構造）

### 1. Unit Tests（単体テスト）
**対象**: 個別の関数、コンポーネント、フック
**モック**: 最小限のモック（依存関係のみ）
**実行頻度**: 開発中（常時）

```bash
npm run test:unit
```

### 2. Integration Tests（統合テスト）
**対象**: Server Actions、API Routes、データベース連携
**モック**: 外部サービスのみモック（Supabase、Stripe等は実際のテスト環境）
**実行頻度**: PR作成時

```bash
npm run test:integration
```

### 3. E2E Tests（エンドツーエンドテスト）
**対象**: ユーザーフロー、クリティカルパス
**モック**: なし（実際のアプリケーション環境）
**実行頻度**: リリース前

```bash
npm run test:e2e
```

## 統合テストからE2Eテストへの移行計画

### 移行対象（統合テスト → E2Eテスト）
1. 認証フロー全体
2. イベント作成・編集フロー
3. 参加申し込みフロー
4. 決済フロー
5. セキュリティ関連のユーザーフロー

### 残留対象（統合テスト維持）
1. Server Actions単体
2. データベーススキーマ検証
3. RLSポリシー検証
4. API Routes検証

## モック戦略の簡素化

### 統一モックファクトリー
```typescript
// __tests__/helpers/unified-mock-factory.ts
export class UnifiedMockFactory {
  static createUnitMocks() {
    // 最小限のモック
  }

  static createIntegrationMocks() {
    // 外部サービスのみモック
  }
}
```

### Jest Profile統合
- `unit.setup.mjs` - 単体テスト用
- `integration.setup.mjs` - 統合テスト用
- `e2e.setup.mjs` - E2Eテスト用（新規）

## 実装スケジュール

### Phase 1: E2Eテスト拡充（1-2日）
- 認証フローE2Eテスト
- イベント管理フローE2Eテスト
- 参加申し込みフローE2Eテスト

### Phase 2: 統合テスト整理（1日）
- 重複する統合テストの削除
- Server Actions専用統合テストに集約

### Phase 3: Jest Profile統合（0.5日）
- 6つのsetupファイルを3つに統合
- グローバルモックの簡素化

### Phase 4: CI/CD最適化（0.5日）
- テスト実行時間の短縮
- 並列実行の最適化

## 期待効果

### 開発効率向上
- テスト実行時間: 50%短縮
- メンテナンス性: 60%向上
- 新規テスト追加: 70%高速化

### 品質向上
- テスト信頼性: 向上
- バグ検出率: 向上
- リグレッション防止: 強化
