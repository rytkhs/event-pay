# EventPay テストガイドライン

## 概要
このドキュメントは、EventPayプロジェクトでのテスト実装におけるベストプラクティスを定義します。

## テスト方針

### 1. 階層化されたテスト戦略

#### 単体テスト (Unit Tests)
- **対象**: 個別の関数、フック、コンポーネント
- **モック範囲**: 外部依存のみ (API呼び出し、外部ライブラリ)
- **実行頻度**: 開発中（常時）

#### 統合テスト (Integration Tests)
- **対象**: Server Actions、API Routes、データベース連携
- **モック範囲**: 外部サービスのみ (Stripe、メール送信等)
- **実行頻度**: PR作成時

#### E2Eテスト (End-to-End Tests)
- **対象**: ユーザーフロー、クリティカルパス
- **モック範囲**: なし（実際のアプリケーション環境）
- **実行頻度**: リリース前

### 2. フックテストのベストプラクティス

#### ✅ 推奨: 実際のビジネスロジックをテスト

```typescript
// ❌ 悪い例: フック全体をモック
jest.mock("@/hooks/use-event-edit-form");

// ✅ 良い例: 外部依存のみモック
jest.mock("@/app/events/actions/update-event");
jest.mock("next/navigation");

describe('useEventEditForm', () => {
  it('validateField - バリデーション境界値テスト', () => {
    const { result } = renderHook(() => useEventEditForm(props));
    
    act(() => {
      result.current.handleInputChange('title', '');
    });

    expect(result.current.errors.title).toBe('タイトルは必須です');
  });
});
```

#### モック戦略の指針

1. **最小限のモック**: 必要最小限の外部依存のみモック
2. **実ロジック実行**: フックの実際のビジネスロジックをテスト
3. **境界値テスト**: バリデーション条件の境界値を網羅的にテスト

### 3. コンポーネントテストのベストプラクティス

#### ✅ 推奨: フックとの統合テスト

```typescript
describe('EventEditForm', () => {
  it('バリデーションエラーが表示される', () => {
    render(<EventEditForm {...mockProps} />);
    
    const titleInput = screen.getByDisplayValue("テストイベント");
    fireEvent.change(titleInput, { target: { value: "" } });
    
    // 実際のバリデーションロジックによってエラーが表示されることを確認
    expect(screen.getByText("タイトルは必須です")).toBeInTheDocument();
  });
});
```

#### テストパターン

1. **表示テスト**: 基本的なコンポーネントの表示確認
2. **操作テスト**: ユーザー操作に対する反応
3. **統合テスト**: フックとの連携動作
4. **エラーテスト**: エラー状態での表示と動作

### 4. ファイル構成規約

```
__tests__/
├── hooks/                    # フック単体テスト
│   └── use-event-edit-form.test.ts
├── components/              # コンポーネント単体テスト
│   └── events/
│       └── event-edit-form.test.tsx
├── integration/             # 統合テスト
│   ├── server-actions/
│   ├── database/
│   └── api/
└── security/               # セキュリティテスト
    └── event-edit/
```

### 5. テストケース命名規約

#### 関数・メソッドテスト
```typescript
describe('validateField', () => {
  it('タイトルが空の場合にエラーを設定する', () => {
    // テスト実装
  });
  
  it('タイトルが100文字を超える場合にエラーを設定する', () => {
    // テスト実装
  });
});
```

#### 状態・動作テスト
```typescript
describe('フォーム送信', () => {
  it('成功時にonSubmitコールバックが呼び出される', async () => {
    // テスト実装
  });
  
  it('エラー時に適切なエラーメッセージが表示される', async () => {
    // テスト実装
  });
});
```

### 6. モックの管理

#### 統一モックファクトリーの使用
```typescript
// __tests__/helpers/unified-mock-factory.ts
export class UnifiedMockFactory {
  static createEventMock(overrides = {}) {
    return {
      id: 'event-1',
      title: 'テストイベント',
      // ... デフォルト値
      ...overrides
    };
  }
  
  static createHookPropsMock(event, attendeeCount = 0, onSubmit) {
    return {
      event,
      attendeeCount,
      onSubmit: onSubmit || undefined
    };
  }
}
```

#### モック設定の原則
1. **外部依存のみモック**: API呼び出し、外部ライブラリ
2. **一貫性のあるモック**: プロジェクト全体で統一された方式
3. **テスト間の独立性**: 各テストで適切にモックをリセット

### 7. テスト実行とCI/CD

#### 開発時のテスト実行
```bash
# 高速フィードバック用
npm run test:unit

# 変更後の確認用
npm run test:integration

# 機能完了時
npm run test:full
```

#### CI/CD での実行順序
1. `npm run test:unit` - 基本的な単体テスト
2. `npm run test:integration` - 統合テスト
3. `npm run test:security` - セキュリティテスト
4. `npm run test:e2e` - E2Eテスト

### 8. テスト品質の指標

#### カバレッジ目標
- **単体テスト**: 90%以上
- **統合テスト**: 主要パス100%
- **E2Eテスト**: クリティカルパス100%

#### レビュー観点
1. **実際のロジック検証**: モックではなく実ロジックのテスト
2. **境界値テスト**: エッジケースの網羅
3. **エラーハンドリング**: 異常系の動作確認
4. **可読性**: テストコードの理解しやすさ

## まとめ

EventPayのテスト戦略では、実際のビジネスロジックを検証することを重視します。フックの完全モック化は避け、外部依存のみをモックすることで、より信頼性の高いテストスイートを構築します。

この方針により、リファクタリング時の安全性とバグの早期発見を実現し、プロダクトの品質向上を図ります。