BEGIN;

-- Rename table payouts -> settlements
ALTER TABLE public.payouts RENAME TO settlements;

-- Rename indexes referencing payouts
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- generic helper to rename if exists
  PERFORM 1;
END $$;

-- Specific known indexes
ALTER INDEX IF EXISTS public.idx_payouts_user_id          RENAME TO idx_settlements_user_id;
ALTER INDEX IF EXISTS public.idx_payouts_event_id         RENAME TO idx_settlements_event_id;
ALTER INDEX IF EXISTS public.idx_payouts_status           RENAME TO idx_settlements_status;
ALTER INDEX IF EXISTS public.idx_payouts_stripe_transfer  RENAME TO idx_settlements_stripe_transfer;
ALTER INDEX IF EXISTS public.idx_payouts_stripe_account   RENAME TO idx_settlements_stripe_account;
ALTER INDEX IF EXISTS public.idx_payouts_transfer_group   RENAME TO idx_settlements_transfer_group;
ALTER INDEX IF EXISTS public.idx_payouts_event_generated_at RENAME TO idx_settlements_event_generated_at;
ALTER INDEX IF EXISTS public.idx_payouts_settlement_mode  RENAME TO idx_settlements_settlement_mode;
ALTER INDEX IF EXISTS public.idx_payouts_generated_date_jst RENAME TO idx_settlements_generated_date_jst;
ALTER INDEX IF EXISTS public.uniq_payouts_event_generated_date_jst RENAME TO uniq_settlements_event_generated_date_jst;
ALTER INDEX IF EXISTS public.unique_active_payout_per_event RENAME TO unique_active_settlement_per_event;

-- Update RLS policies comments and names (drop and recreate with same logic)
DROP POLICY IF EXISTS "Users can view own payouts" ON public.settlements;
DROP POLICY IF EXISTS users_can_view_own_payouts ON public.settlements;
DROP POLICY IF EXISTS event_creators_can_view_payouts ON public.settlements;
DROP POLICY IF EXISTS event_creators_can_view_settlement_reports ON public.settlements;
DROP POLICY IF EXISTS "Service role can manage payouts" ON public.settlements;

CREATE POLICY "Users can view own settlements" ON public.settlements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY users_can_view_own_settlements ON public.settlements FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY event_creators_can_view_settlements ON public.settlements FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = settlements.event_id
      AND e.created_by = auth.uid()
  )
);
CREATE POLICY "Service role can manage settlements" ON public.settlements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Triggers
DROP TRIGGER IF EXISTS update_payouts_updated_at ON public.settlements;
CREATE TRIGGER update_settlements_updated_at BEFORE UPDATE ON public.settlements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.settlements IS '運営者への売上清算履歴（レポート・スナップショット用途）';
COMMENT ON COLUMN public.settlements.settlement_mode IS '送金モード（destination_charge固定）';
COMMENT ON COLUMN public.settlements.generated_at IS 'レポート生成日時';
COMMENT ON COLUMN public.settlements.transfer_group IS 'イベント単位の送金グループ識別子';
COMMENT ON COLUMN public.settlements.stripe_account_id IS 'Stripe Connect Account ID';
COMMENT ON COLUMN public.settlements.retry_count IS '清算処理のリトライ回数';
COMMENT ON COLUMN public.settlements.last_error IS '最後に発生したエラーメッセージ';

COMMIT;
