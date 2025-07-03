# セキュリティテスト修正ガイド

## 🚨 発見された問題と修正方法

### 1. 認証ミドルウェアテスト (auth-middleware.test.ts) の問題

#### 問題点
- 実際の実装はAuthHandler/SecurityHandlerを使用しているが、テストはモックミドルウェアを作成
- リダイレクトのステータスコードが期待値と不一致 (期待: 200/307, 実際: 307/200)
- CSRFトークンの設定テストが失敗

#### 修正方法
```typescript
// 1. 実際のハンドラーを使用したテストに変更
import { AuthHandler } from '@/lib/middleware/auth-handler'
import { SecurityHandler } from '@/lib/middleware/security-handler'

// 2. ステータスコードの期待値を実装に合わせる
// 認証済みユーザーのダッシュボードアクセス: 200 → NextResponse.next()
// 認証済みユーザーのログインページアクセス: 307 → リダイレクト

// 3. CSRFトークンテストの修正
// SecurityHandler.applyでセットされるヘッダーを確認
```

### 2. レート制限テスト (rate-limit.test.ts) の問題

#### 問題点
- モックされたRedisの返り値が@upstash/ratelimitの実際のフォーマットと不一致
- limit, remaining, resetプロパティがundefinedになっている

#### 修正方法
```typescript
// 1. @upstash/ratelimitの正しい返り値フォーマットに修正
mockLimit.mockResolvedValueOnce({
  success: true,
  limit: 5,        // 追加: limit プロパティ
  remaining: 4,    // 追加: remaining プロパティ
  reset: Date.now() + 60000,  // 追加: reset プロパティ
  pending: Promise.resolve()  // 実際のライブラリでは存在
});

// 2. checkRateLimit関数の返り値フォーマットを統一
export interface RateLimitResult {
  success: boolean;
  limit: number;      // 必須
  remaining: number;  // 必須
  reset: number;      // 必須
}
```

### 3. Enum型セキュリティテスト (enum-security.test.ts) の問題

#### 問題点
- Supabaseクライアントで「TypeError: fetch failed」エラー
- テスト環境でのSupabase接続の問題

#### 修正方法
```typescript
// 1. テスト環境のSupabase設定確認
// .env.testのSupabase URLとキーが有効か確認

// 2. モック戦略の見直し
// 実際のSupabase接続ではなく、モックを使用する方針に変更
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: jest.fn().mockResolvedValue({
      data: mockData,
      error: null
    })
  })
}));

// 3. ネットワーク接続テストとして分離
// enum-security.test.ts を unit テストと integration テストに分離
```

## 🔧 緊急修正が必要な項目

### 高優先度 (Critical)
1. **認証ミドルウェアのリダイレクト動作修正**
   - 認証済みユーザーの適切なアクセス制御
   - CSRF保護の実装確認

2. **レート制限機能の動作確認**
   - Redis接続とレート制限の正常動作
   - 攻撃者による制限回避の防止

### 中優先度 (High)
3. **Enum型セキュリティ関数のテスト環境修正**
   - SQLインジェクション対策の検証
   - 権限昇格防止の確認

## 📋 修正手順

### Phase 1: 緊急修正 (今すぐ実行)
```bash
# 1. 認証ミドルウェアテストの修正
npm run test:security -- __tests__/security/auth-middleware.test.ts

# 2. レート制限テストの修正
npm run test:security -- __tests__/security/rate-limit.test.ts
```

### Phase 2: 構造修正 (今週中)
```bash
# 3. Enum型セキュリティテストの分離とモック化
npm run test:security -- __tests__/security/enum-security.test.ts
```

### Phase 3: 総合テスト (来週)
```bash
# 4. 全セキュリティテストの再実行
npm run test:security
```

## 🚦 修正の影響度

### 低リスク修正
- テストコードの期待値調整
- モックデータの修正

### 中リスク修正
- レート制限機能の実装確認
- 認証フローの動作確認

### 高リスク修正
- セキュリティ関数の実装変更
- 権限制御の修正

## 💡 推奨事項

1. **テスト駆動修正**: 失敗テストを1つずつ修正し、各修正後にテスト実行
2. **段階的展開**: クリティカルな修正から順次実行
3. **本番環境の確認**: テスト修正後、本番環境での動作確認
4. **継続監視**: セキュリティテストを CI/CD パイプラインに組み込み
