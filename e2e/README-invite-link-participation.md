# 招待リンク参加機能 E2Eテスト

## 概要

このドキュメントは、招待リンク参加機能のEnd-to-Endテストの実装について説明します。

## テストファイル

### 1. `e2e/invite-link-participation.spec.ts`
包括的なE2Eテストスイート。以下の機能をテストします：

#### 正常な参加フロー
- 招待リンクから参加確認まで完全なフローが動作する
- 現金支払いでの参加フローが動作する
- 不参加での登録フローが動作する
- 未定での登録フローが動作する

#### ゲスト管理機能
- ゲスト管理ページでの参加状況確認が動作する
- ゲスト管理ページでの参加状況変更が動作する

#### エラーシナリオ
- 無効な招待トークンでアクセスした場合のエラー処理
- 期限切れイベントでのエラー処理
- 定員超過時のエラー処理
- 重複メールアドレスでのエラー処理

#### フォームバリデーション
- 必須項目のバリデーションが機能する
- メールアドレス形式のバリデーションが機能する
- ニックネーム長さ制限のバリデーションが機能する
- 参加時の支払い方法選択バリデーションが機能する

#### セキュリティ対策
- レート制限が機能する
- XSS攻撃の防止が機能する
- 無効なゲストトークンでのアクセス防止

#### モバイル互換性
- モバイルデバイスでの参加フローが正常に動作する
- タブレットデバイスでの参加フローが正常に動作する
- 画面回転時のレイアウト維持

#### アクセシビリティ
- キーボードナビゲーションが機能する
- スクリーンリーダー対応のARIA属性が設定されている
- エラーメッセージがスクリーンリーダーで読み上げられる

#### パフォーマンス
- ページ読み込み時間が適切である
- フォーム送信のレスポンス時間が適切である

### 2. `e2e/invite-link-participation-basic.spec.ts`
基本的な機能テスト。アプリケーションのビルドエラーがある場合でも実行可能：

- 招待リンクページが正常に表示される
- 無効な招待トークンでエラーページが表示される
- ゲスト管理ページが存在する
- 参加フォームの基本要素が存在する
- フォームバリデーションの基本動作
- レスポンシブデザインの基本確認
- アクセシビリティの基本確認
- セキュリティヘッダーの基本確認
- パフォーマンスの基本確認
- エラーハンドリングの基本確認

## テスト実行方法

### 全体テスト実行
```bash
npm run test:e2e -- --grep "招待リンク参加機能"
```

### 基本テストのみ実行
```bash
npm run test:e2e -- --grep "招待リンク参加機能 - 基本テスト"
```

### 特定のテストケース実行
```bash
npm run test:e2e -- --grep "正常な参加フロー"
```

### UIモードでの実行
```bash
npm run test:e2e:ui -- --grep "招待リンク参加機能"
```

## テスト対象要件

このE2Eテストは以下の要件をカバーしています：

### Requirement 1: 招待リンクアクセス
- 1.1: 招待トークンの検証と参加フォーム表示
- 1.2: 無効・期限切れトークンのエラー処理
- 1.3: 定員超過時の参加防止
- 1.4: 登録期限後の参加防止

### Requirement 2: 参加者情報入力
- 2.1: ニックネーム入力（1-50文字）
- 2.2: 有効なメールアドレス入力
- 2.3: メールアドレス形式バリデーション
- 2.4: 重複メールアドレス防止

### Requirement 3: 参加ステータス選択
- 3.1: 参加・不参加・未定の選択
- 3.2: 参加選択時の定員計算
- 3.3: 不参加・未定選択時の支払い処理除外
- 3.4: ステータス変更時の適切な処理
- 3.5: 未定から参加への変更時の定員チェック

### Requirement 4: 支払い方法選択
- 4.1: 参加選択時の支払い方法表示
- 4.2: クレジットカード選択時の記録
- 4.3: 現金選択時の記録
- 4.4: 不参加・未定時の支払い方法非表示

### Requirement 5: ゲストトークン管理
- 5.1: 参加登録後のゲストトークン生成
- 5.2: ゲスト管理URL提供
- 5.3: ゲストトークンでの参加状況表示
- 5.4: ゲストトークンでの参加状況変更

### Requirement 6: セキュリティ対策
- 6.1: レート制限（5分間10リクエスト）
- 6.2: 入力サニタイゼーション
- 6.3: 重複登録防止
- 6.4: セキュリティログ記録

### Requirement 7: 確認ページ表示
- 7.1: 参加登録後の確認ページ表示
- 7.2: 登録内容の表示
- 7.3: ゲスト管理URL提供
- 7.4: 支払い情報表示

## テスト環境要件

### 前提条件
- Node.js 18以上
- npm または yarn
- Playwright がインストール済み
- テスト用データベース（Supabase）
- 環境変数の設定

### 環境変数
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### テストデータ
テストでは以下のテストユーザーを使用します：
- `creator@eventpay.test` - イベント作成者
- `test@eventpay.test` - 一般テストユーザー
- `participant@eventpay.test` - 参加者テストユーザー

## トラブルシューティング

### よくある問題

#### 1. アプリケーションビルドエラー
```
Error: Event handlers cannot be passed to Client Component props
```
**解決方法**: 基本テスト（`invite-link-participation-basic.spec.ts`）を実行してください。

#### 2. ログインタイムアウト
```
page.waitForURL: Test timeout
```
**解決方法**: テストユーザーのアカウントロック状態をクリアしてください。

#### 3. データベース接続エラー
**解決方法**: Supabaseの環境変数が正しく設定されているか確認してください。

### デバッグ方法

#### 1. スクリーンショット確認
テスト失敗時のスクリーンショットは `test-results/` ディレクトリに保存されます。

#### 2. ビデオ録画確認
テスト実行の様子は動画として記録されます。

#### 3. ログ確認
```bash
npm run test:e2e -- --grep "招待リンク参加機能" --reporter=line --verbose
```

## 継続的インテグレーション

### GitHub Actions設定例
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e -- --grep "招待リンク参加機能"
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

## メンテナンス

### テストの更新
- 新機能追加時は対応するテストケースを追加
- UI変更時はセレクターを更新
- API変更時はモックデータを更新

### パフォーマンス監視
- テスト実行時間の監視
- ページ読み込み時間の閾値調整
- レスポンス時間の閾値調整

## 参考資料

- [Playwright Documentation](https://playwright.dev/)
- [Next.js Testing Guide](https://nextjs.org/docs/testing)
- [EventPay Architecture Documentation](../docs/)