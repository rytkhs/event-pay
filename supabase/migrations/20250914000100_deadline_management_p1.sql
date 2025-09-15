-- P1: 締切管理 仕様反映（allow_payment_after_deadline / grace_period_days / CHECK見直し）
-- 破壊的変更を含むが、本番未運用前提（docs/spec/deadline-management/required.md 参照）

BEGIN;

-- 1) 新カラム追加
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS allow_payment_after_deadline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_period_days smallint NOT NULL DEFAULT 0;

-- 1-1) 新カラムCHECK（0〜30日）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_grace_period_days_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_grace_period_days_check
      CHECK (grace_period_days >= 0 AND grace_period_days <= 30);
  END IF;
END $$;

-- 2) 旧CHECKの削除（"payment_deadline < date" を撤廃）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_payment_deadline_before_event'
  ) THEN
    ALTER TABLE public.events DROP CONSTRAINT events_payment_deadline_before_event;
  END IF;
END $$;

-- 3) 支払締切 上限: payment_deadline <= date + 30 days（nullセーフ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_payment_deadline_within_30d_after_date'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_payment_deadline_within_30d_after_date
      CHECK (
        payment_deadline IS NULL OR payment_deadline <= ("date" + INTERVAL '30 days')
      );
  END IF;
END $$;

-- 4) 支払締切 下限（既存の registration 以降 制約はinclusiveのため流用/存在確認）
-- 既存: events_payment_deadline_after_registration
-- 形式: (payment_deadline IS NULL) OR (registration_deadline IS NULL) OR (payment_deadline >= registration_deadline)
-- なければ追加しておく
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_payment_deadline_after_registration'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_payment_deadline_after_registration
      CHECK (
        payment_deadline IS NULL OR registration_deadline IS NULL OR payment_deadline >= registration_deadline
      );
  END IF;
END $$;

COMMIT;
