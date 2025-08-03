-- ユーザープロファイル自動作成トリガーの実装
-- このマイグレーションは、auth.usersにユーザーが登録された際に
-- 自動的にpublic.usersテーブルにプロファイルレコードを作成します。

-- ユーザープロファイル自動作成関数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- auth.usersからのメタデータを使用してpublic.usersにプロファイルを作成
  INSERT INTO public.users (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'ユーザー')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーの作成
-- auth.usersテーブルにレコードが挿入された後、自動的にpublic.usersにプロファイルを作成
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- セキュリティ設定
-- 関数の実行権限を適切に設定（supabase_auth_adminのみ実行可能）
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;

-- コメント追加（public.usersテーブルの関数のみ）
COMMENT ON FUNCTION public.handle_new_user() IS
'auth.usersテーブルに新しいユーザーが作成された際に、自動的にpublic.usersテーブルにプロファイルレコードを作成する関数';
