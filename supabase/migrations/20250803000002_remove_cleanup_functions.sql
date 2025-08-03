-- Remove unused cleanup functions and related structures
-- These functions were created for orphaned user cleanup but are not needed
-- for EventPay's small community use case

-- Drop cleanup functions
DROP FUNCTION IF EXISTS public.cleanup_orphaned_users(BOOLEAN);
DROP FUNCTION IF EXISTS public.detect_orphaned_users();

-- Drop cleanup-related log entries
DELETE FROM public.system_logs WHERE operation_type = 'CLEANUP_ORPHANED_USERS';

-- Add comment explaining the removal
COMMENT ON TABLE public.system_logs IS 'System operation logs (cleanup functions removed for security and simplicity)';

DO $$
BEGIN
    RAISE NOTICE '✅ Cleanup functions removed successfully. EventPay uses CASCADE deletion for data integrity.';
END $$;
