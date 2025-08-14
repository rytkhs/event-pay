-- 20250813: add_update_payout_status_rpc.sql
-- 送金ステータスを安全に更新する RPC。TOCTOU 対策として期待ステータスを条件に含める。

-- ドキュメント
--   _payout_id        : 対象 payout.id
--   _from_status      : 期待する現在のステータス（楽観ロック）
--   _to_status        : 更新後ステータス
--   _processed_at     : 処理日時（NULL なら変更しない）
--   _stripe_transfer_id: Stripe Transfer ID（NULL なら変更しない）
--   _transfer_group   : Transfer Group（NULL なら変更しない）
--   _last_error       : 最終エラーメッセージ（NULL なら変更しない）
--   _notes            : 備考（NULL なら変更しない）

create or replace function public.update_payout_status_safe(
    _payout_id uuid,
    _from_status public.payout_status_enum,
    _to_status   public.payout_status_enum,
    _processed_at timestamptz default null,
    _stripe_transfer_id text  default null,
    _transfer_group text      default null,
    _last_error text          default null,
    _notes text               default null
) returns void
language plpgsql
as $$
begin
    update public.payouts
    set status             = _to_status,
        updated_at         = now(),
        processed_at       = coalesce(_processed_at, processed_at),
        stripe_transfer_id = coalesce(_stripe_transfer_id, stripe_transfer_id),
        transfer_group     = coalesce(_transfer_group, transfer_group),
        last_error         = coalesce(_last_error, last_error),
        notes              = coalesce(_notes, notes)
    where id = _payout_id
      and status = _from_status;

    if not found then
        raise exception 'payout status conflict or not found'
            using errcode = '40001'; -- serialization_failure 相当
    end if;
end;
$$;
