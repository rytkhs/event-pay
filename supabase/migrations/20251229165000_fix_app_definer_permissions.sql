-- Description: app_definerロールにpublic.usersテーブルのUPDATE権限を付与（同期トリガー実行用）
--
-- 背景:
--   20251225145227_sync_auth_user_updates.sql で追加された sync_auth_user_to_public 関数は
--   app_definer 権限で実行され、public.users テーブルを UPDATE する。
--   しかし、初期スキーマ定義(20251009091140_initial_schema.sql)では app_definer には
--   public.users の SELECT, INSERT 権限のみが付与されており、UPDATE 権限が不足していた。
--   これにより、auth.users の更新時（ユーザー登録時のメタデータ更新再試行など）に 500 エラーが発生していた。

GRANT UPDATE ON TABLE "public"."users" TO "app_definer";
