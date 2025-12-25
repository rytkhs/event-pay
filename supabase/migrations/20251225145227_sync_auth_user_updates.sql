-- Description: auth.usersの更新をpublic.usersに同期するトリガー
--
-- 背景:
--   現状、auth.usersとpublic.usersの同期はINSERT時のみ（handle_new_user トリガー）
--   auth.usersが更新された場合（設定からの名前/email変更、LINE連携によるemail更新等）は
--   public.usersに反映されていなかった
--
-- 変更内容:
--   1. sync_auth_user_to_public() 関数を新規作成
--   2. auth.usersのUPDATE時に発火するトリガーを追加

-- ============================================================================
-- 0. 権限付与（マイグレーション実行に必要）
-- ============================================================================
GRANT CREATE ON SCHEMA public TO app_definer;

-- ============================================================================
-- 1. 同期用トリガー関数の作成
-- ============================================================================
CREATE OR REPLACE FUNCTION "public"."sync_auth_user_to_public"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- auth.usersの変更をpublic.usersに反映
  -- email または raw_user_meta_data->>'name' が変更された場合のみ更新
  UPDATE public.users
  SET
    email = NEW.email,
    name = COALESCE(NEW.raw_user_meta_data->>'name', name),
    updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- 関数の所有者をapp_definerに設定（既存のhandle_new_userと同様）
ALTER FUNCTION "public"."sync_auth_user_to_public"() OWNER TO "app_definer";

-- 関数コメント
COMMENT ON FUNCTION "public"."sync_auth_user_to_public"() IS
  'auth.usersテーブルが更新された際に、public.usersテーブルのemail/nameを同期する関数';

-- ============================================================================
-- 2. UPDATEトリガーの作成
-- ============================================================================
-- emailまたはraw_user_meta_dataが変更された場合のみ発火
CREATE OR REPLACE TRIGGER "trigger_sync_auth_user_to_public"
  AFTER UPDATE OF email, raw_user_meta_data ON "auth"."users"
  FOR EACH ROW
  WHEN (
    OLD.email IS DISTINCT FROM NEW.email
    OR OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data
  )
  EXECUTE FUNCTION "public"."sync_auth_user_to_public"();

-- ============================================================================
-- 3. 権限設定
-- ============================================================================
-- supabase_auth_adminにのみ実行権限を付与（auth.usersを更新するのはauth systemのみ）
REVOKE ALL ON FUNCTION "public"."sync_auth_user_to_public"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_auth_user_to_public"() TO "supabase_auth_admin";

-- ============================================================================
-- 4. 権限取り消し（クリーンアップ）
-- ============================================================================
REVOKE CREATE ON SCHEMA public FROM app_definer;
