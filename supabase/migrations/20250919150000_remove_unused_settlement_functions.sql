-- 未使用の清算関連RPC関数を削除
-- これらの関数はアプリケーションで使用されておらず、一貫性のないロジックを持っている

-- 未使用関数を削除
DROP FUNCTION IF EXISTS "public"."calc_payout_amount"("p_event_id" "uuid");
DROP FUNCTION IF EXISTS "public"."process_event_payout"("p_event_id" "uuid", "p_user_id" "uuid");
DROP FUNCTION IF EXISTS "public"."get_settlement_aggregations"("p_event_id" "uuid");

-- クリーンアップを記録するコメントを追加
COMMENT ON SCHEMA "public" IS '清算RPC関数のクリーンアップ完了 - 一貫性のないロジックを持つ未使用関数を削除 (calc_payout_amount, process_event_payout, get_settlement_aggregations)';
