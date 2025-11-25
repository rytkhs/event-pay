-- public.usersテーブルにemailカラムを追加

-- emailカラムを追加
ALTER TABLE public.users
ADD COLUMN email VARCHAR(255);

-- メールアドレスのユニーク制約とインデックス（大文字小文字を区別しない）
CREATE UNIQUE INDEX idx_users_email_unique
ON public.users (LOWER(email))
WHERE email IS NOT NULL;

-- コメント追加
COMMENT ON COLUMN public.users.email IS 'ユーザーのメールアドレス(auth.usersと同期)';

-- 既存ユーザーのemailをauth.usersから同期
UPDATE public.users u
SET email = au.email
FROM auth.users au
WHERE u.id = au.id
  AND au.email IS NOT NULL;

-- handle_new_user()トリガー関数を更新してemailも挿入するようにする
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  -- auth.usersからのメタデータとemailを使用してpublic.usersにプロファイルを作成
  INSERT INTO public.users (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'ユーザー'),
    NEW.email
  );
  RETURN NEW;
END;
$$;
