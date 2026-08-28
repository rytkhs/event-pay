-- payments.amount を正の整数に限定する
-- - 0円決済はアプリ層のバリデーションと全RPCの fee > 0 ガードで既に作られない
-- - DB制約だけが amount >= 0 と緩く、service_role の直接操作で0円行を作れた
-- - 制約名を chk_payments_* の命名規約へ揃える

DO $$
DECLARE
    non_positive_payment_count integer;
BEGIN
    SELECT COUNT(*)
    INTO non_positive_payment_count
    FROM public.payments
    WHERE amount <= 0;

    IF non_positive_payment_count > 0 THEN
        RAISE EXCEPTION
            'Cannot enforce positive payment amount: % payments still have amount <= 0',
            non_positive_payment_count;
    END IF;
END
$$;

ALTER TABLE ONLY public.payments
    DROP CONSTRAINT IF EXISTS payments_amount_check;

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT chk_payments_amount_positive
    CHECK (amount > 0);
