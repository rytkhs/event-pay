# UIテスト用テストデータスクリプト

UIの動作確認のために、特定のアカウントに紐付いた大量の多様なテストデータを作成・管理するためのスクリプトです。

## ⚠️ 重要な注意事項

- **本番環境では実行しないでください**
- **実行前にデータベースのバックアップを取ることを強く推奨します**
- **テストユーザーのUUIDは事前に作成・確認してください**

## ファイル構成

- `create_test_data.sql` - テストデータ作成スクリプト
- `cleanup_test_data.sql` - テストデータ削除スクリプト
- `README.md` - 本ドキュメント

## 事前準備

### 1. テストユーザーアカウントの準備

```sql
-- auth.users テーブルでテストユーザーを作成
-- または、既存のテストアカウントのUUIDを確認
SELECT id, email FROM auth.users WHERE email = 'test@example.com';
```

### 2. スクリプト内のUUID設定

両スクリプトファイルの以下の行を実際のテストユーザーUUIDに変更してください：

```sql
-- ⚠️ ここに実際のテストユーザーのUUIDを設定してください
test_user_id UUID := '00000000-0000-0000-0000-000000000001'; -- PLACEHOLDER: 実際のUUIDに変更
```

## テストデータの作成

### 作成されるデータパターン

#### イベント（7種類）
1. **開催済み・有料・Stripeのみ・参加者多数**
   - 参加者: 18名
   - 決済状況: 様々なステータス

2. **開催済み・無料・現金のみ**
   - 参加者: 21名
   - 無料のため決済データなし

3. **開催済み・中止イベント**
   - 参加者: 24名
   - キャンセル処理済み

4. **開催予定・高額・Stripe+現金**
   - 参加者: 27名
   - 高額設定（8,000円）

5. **開催予定・無料・定員少**
   - 参加者: 30名
   - 定員8名（オーバーブッキング状態）

6. **開催予定・締切間近**
   - 参加者: 33名
   - 登録締切まで2日

7. **開催予定・定員なし・高額**
   - 参加者: 36名
   - 定員制限なし（12,000円）

#### 参加者データ
- **ステータス**: attending, not_attending, maybe
- **多様な名前パターン**: 日本人名、外国人名など
- **メールアドレス**: テスト用の一意なアドレス

#### 決済データ（有料イベントの参加者のみ）
- **決済方法**: stripe, cash
- **ステータス**: paid, received, pending, completed, waived, failed
- **Stripe固有ID**: 必要に応じて自動生成

#### Stripe Connectアカウント
- **ステータス**: verified（認証済み）
- **機能**: charges_enabled=true, payouts_enabled=true

#### 清算データ
- 開催済みイベント（最初の3つ）に対して自動生成

### 実行方法

```bash
# Supabaseローカル環境の場合
supabase db reset --db-url "postgresql://postgres:postgres@localhost:54322/postgres"
psql -h localhost -p 54322 -U postgres -d postgres -f scripts/create_test_data.sql

# 本番/ステージング環境（推奨しません）
psql "your-database-connection-string" -f scripts/create_test_data.sql
```

### 実行結果例

```
テストデータ作成が完了しました！
====================================================================================================
テストユーザーID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
作成されたイベント数: 7
参加者総数: 189
決済レコード数: 95
====================================================================================================
UIテストを開始してください！
====================================================================================================
```

## テストデータの削除

### 実行方法

```bash
# テストデータのみを削除（ユーザーアカウントは保持）
psql "your-database-connection-string" -f scripts/cleanup_test_data.sql
```

### 削除対象

1. 清算データ（settlements）
2. 決済データ（payments）
3. 参加者データ（attendances）
4. イベントデータ（events）
5. Stripe Connectアカウント

**注意**: テストユーザーアカウント自体は削除されません。削除したい場合はスクリプト内のコメントアウトを外してください。

## UIテストでの確認ポイント

### ダッシュボード画面
- [ ] イベント一覧の表示（開催前/後、有料/無料）
- [ ] 参加者数の表示
- [ ] 売上・決済状況の表示
- [ ] キャンセルイベントの表示

### イベント詳細画面
- [ ] 参加者リストの表示
- [ ] 各種参加ステータスの表示
- [ ] 決済状況の表示（ステータス別）
- [ ] 清算情報の表示（開催済みイベント）

### 決済管理画面
- [ ] 決済ステータス別の表示
- [ ] 現金決済の手動ステータス更新
- [ ] 一括操作の動作

### レスポンシブ対応
- [ ] モバイル表示
- [ ] タブレット表示
- [ ] デスクトップ表示

### エラーハンドリング
- [ ] 締切後の操作制限
- [ ] 定員超過時の表示
- [ ] 権限不足時のエラー表示

## トラブルシューティング

### よくあるエラー

#### 1. UUIDが見つからない
```
ERROR: ユーザーが見つかりません: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```
**解決方法**: テストユーザーアカウントを事前に作成してください。

#### 2. 制約違反エラー
```
ERROR: duplicate key value violates unique constraint
```
**解決方法**: 既存のテストデータがある場合は、先にクリーンアップスクリプトを実行してください。

#### 3. 権限エラー
```
ERROR: permission denied for table
```
**解決方法**: 適切なデータベース権限でスクリプトを実行してください。

### データ確認クエリ

```sql
-- テストユーザーの全イベントを確認
SELECT id, title, date, fee, canceled_at
FROM public.events
WHERE created_by = 'your-test-user-id'
ORDER BY date;

-- 参加者数を確認
SELECT e.title, COUNT(a.id) as attendance_count
FROM public.events e
LEFT JOIN public.attendances a ON e.id = a.event_id
WHERE e.created_by = 'your-test-user-id'
GROUP BY e.id, e.title;

-- 決済状況を確認
SELECT e.title, p.status, COUNT(*) as count
FROM public.events e
JOIN public.attendances a ON e.id = a.event_id
JOIN public.payments p ON a.id = p.attendance_id
WHERE e.created_by = 'your-test-user-id'
GROUP BY e.title, p.status
ORDER BY e.title, p.status;
```

## サポート

スクリプトに問題がある場合は、エラーメッセージと実行環境の情報を含めて報告してください。
