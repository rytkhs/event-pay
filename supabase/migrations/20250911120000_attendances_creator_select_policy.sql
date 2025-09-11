-- ====================================================================
-- RLS: attendances の主催者向け SELECT ポリシー追加
-- 目的: イベント作成者のみが自イベントの参加者一覧を取得できるようDB側でも担保
-- 注意: 参加者自身/ゲストの参照はアプリケーション層（service_role + 検証）で実施
-- 日付: 2025-09-11
-- ====================================================================

-- 念のためRLS有効化（既に有効な場合でも問題なし）
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

-- 既存の同名ポリシーがあれば削除して置換
DROP POLICY IF EXISTS "event_creators_can_view_attendances" ON public.attendances;

-- イベント作成者のみが当該イベントの参加者行を SELECT 可能
CREATE POLICY "event_creators_can_view_attendances"
ON public.attendances
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = attendances.event_id
    AND e.created_by = auth.uid()
  )
);

-- 備考:
-- - 参加者本人/ゲストトークンによる参照は、循環参照や誤許可を避けるためDB側には付与しない。
--   該当フローは API レイヤで service_role を用い、厳格なトークン検証・監査ログの上で実施。
-- - payments 側の RLS（主催者のみ SELECT）は既存ポリシーを利用。
