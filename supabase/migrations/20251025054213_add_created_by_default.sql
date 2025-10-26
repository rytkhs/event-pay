-- Add default value for events.created_by column
-- This ensures that auth.uid() is automatically set when inserting events
-- without explicitly providing created_by, which helps with RLS policies

ALTER TABLE public.events
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Add comment to document the purpose
COMMENT ON COLUMN public.events.created_by IS 'Event creator user ID. Automatically set to auth.uid() if not provided during insert.';
