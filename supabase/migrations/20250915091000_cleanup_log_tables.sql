-- Cleanup log-related tables, policies, and functions (keep ones in active use)
-- Kept: system_logs, security_audit_log (both used in application code)

BEGIN;

-- =========================
-- Drop RLS policies (defensive; tables will be dropped below)
-- =========================

-- admin_access_audit
DROP POLICY IF EXISTS "Service role can access admin audit logs" ON public.admin_access_audit;
DROP POLICY IF EXISTS "Users can view own admin audit logs" ON public.admin_access_audit;

-- guest_access_audit
DROP POLICY IF EXISTS "Service role can access guest audit logs" ON public.guest_access_audit;

-- unauthorized_access_log
DROP POLICY IF EXISTS "Service role can access unauthorized access logs" ON public.unauthorized_access_log;

-- payout_scheduler_logs
DROP POLICY IF EXISTS "admin_can_view_scheduler_logs" ON public.payout_scheduler_logs;
DROP POLICY IF EXISTS "system_can_manage_scheduler_logs" ON public.payout_scheduler_logs;

-- Note: security_audit_log policies remain (table is in use)

-- =========================
-- Drop log-related functions no longer used
-- =========================

DROP FUNCTION IF EXISTS public.cleanup_old_audit_logs(integer);
DROP FUNCTION IF EXISTS public.cleanup_old_scheduler_logs(integer);
DROP FUNCTION IF EXISTS public.log_security_event(text, jsonb);

-- =========================
-- Drop log-related tables not used by the app
-- =========================

DROP TABLE IF EXISTS public.admin_access_audit CASCADE;
DROP TABLE IF EXISTS public.guest_access_audit CASCADE;
DROP TABLE IF EXISTS public.unauthorized_access_log CASCADE;
DROP TABLE IF EXISTS public.suspicious_activity_log CASCADE;
DROP TABLE IF EXISTS public.payout_scheduler_logs CASCADE;

COMMIT;
