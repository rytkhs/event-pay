BEGIN;

-- Ensure previous version (with _stripe_transfer_id argument) is removed to prevent name conflict
DROP FUNCTION IF EXISTS public.update_payout_status_safe(
    uuid,
    public.payout_status_enum,
    public.payout_status_enum,
    timestamptz,
    text,
    text,
    text,
    text
);

-- Remove _stripe_transfer_id parameter from update_payout_status_safe and stop touching column
CREATE OR REPLACE FUNCTION public.update_payout_status_safe(
    _payout_id uuid,
    _from_status public.payout_status_enum,
    _to_status   public.payout_status_enum,
    _processed_at timestamptz default null,
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
        transfer_group     = coalesce(_transfer_group, transfer_group),
        last_error         = coalesce(_last_error, last_error),
        notes              = coalesce(_notes, notes)
    where id = _payout_id
      and status = _from_status;

    if not found then
        raise exception 'payout status conflict or not found'
            using errcode = '40001';
    end if;
end;
$$;

COMMENT ON FUNCTION public.update_payout_status_safe IS 'Remove transfer_id handling; DC does not rely on transfers.';

COMMIT;
