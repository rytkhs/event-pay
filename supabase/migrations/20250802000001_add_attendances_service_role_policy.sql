-- Add service role policy for attendances table
-- This allows Server Actions to bypass RLS and manage attendance records
-- while maintaining security for client-side access

CREATE POLICY "Service role can manage attendances"
ON public.attendances
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
