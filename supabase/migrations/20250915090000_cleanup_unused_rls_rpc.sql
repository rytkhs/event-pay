-- Cleanup unused RLS policies and RPCs
-- Policy: Keep only RPCs recommended for future Cron adoption:
--   - try_acquire_scheduler_lock
--   - extend_scheduler_lock
--   - release_scheduler_lock
--   - find_eligible_events_with_details
-- Skip all log-related objects.

BEGIN;

-- =========================
-- Drop unused RLS policies
-- =========================

-- invite_links: not used (events.invite_token is used instead)
DROP POLICY IF EXISTS "Safe invite link management policy" ON public.invite_links;
DROP POLICY IF EXISTS "Safe invite link view policy" ON public.invite_links;

-- settlements: direct SELECT not used (reports retrieved via RPC)
DROP POLICY IF EXISTS "Users can view own settlements" ON public.settlements;
DROP POLICY IF EXISTS "event_creators_can_view_settlements" ON public.settlements;
DROP POLICY IF EXISTS "users_can_view_own_settlements" ON public.settlements;

-- scheduler_locks: direct CRUD not used (RPCs are SECURITY DEFINER)
DROP POLICY IF EXISTS "Allow service role access to scheduler_locks" ON public.scheduler_locks;

-- Note: log-related policies are intentionally skipped

-- =========================
-- Drop unused RPC/functions (non-log)
-- =========================

-- Old payout flow (replaced by generate_settlement_report)
DROP FUNCTION IF EXISTS public.process_event_payout(uuid, uuid);

-- Dev/test helper (not used in app)
DROP FUNCTION IF EXISTS public.cleanup_test_tables_dev_only();

-- Payment creation helper (replaced by register_attendance_with_payment, etc.)
DROP FUNCTION IF EXISTS public.create_payment_record(uuid, public.payment_method_enum, integer);

-- Safe payout status update (not used in current flow)
DROP FUNCTION IF EXISTS public.update_payout_status_safe(uuid, public.payout_status_enum, public.payout_status_enum, timestamptz, text, text, text);

-- Force release of advisory lock (not part of the recommended Cron set)
DROP FUNCTION IF EXISTS public.force_release_payout_scheduler_lock();

-- Eligible events basic (use the detailed version instead)
DROP FUNCTION IF EXISTS public.find_eligible_events_basic(integer, integer, integer, uuid);

-- Enum and diagnostics helpers (not used by app)
DROP FUNCTION IF EXISTS public.get_enum_values(text);
DROP FUNCTION IF EXISTS public.list_all_enums();
DROP FUNCTION IF EXISTS public.detect_orphaned_users();

-- Note: log-related cleanup helpers (e.g., cleanup_old_audit_logs, cleanup_old_scheduler_logs)
-- are intentionally kept as per instruction to skip log-related objects.

COMMIT;
