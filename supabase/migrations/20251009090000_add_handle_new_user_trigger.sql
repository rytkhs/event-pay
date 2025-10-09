-- ============================================================================
-- Migration: Add trigger for public.handle_new_user on auth.users
-- Description: Ensures new auth users automatically get a public.users profile
-- Date: 2025-10-09
-- ============================================================================

BEGIN;

-- 既存トリガーがあれば安全に削除（リネーム等の可能性に備えてIF EXISTS）
DROP TRIGGER IF EXISTS trigger_handle_new_user ON auth.users;

-- auth.usersに対するAFTER INSERTトリガーを作成し、
-- 新規ユーザー作成時にpublic.usersへプロファイルを同期
CREATE TRIGGER trigger_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;
