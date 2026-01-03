-- Description: Update foreign key constraint on events.canceled_by

ALTER TABLE "public"."events"
DROP CONSTRAINT "events_canceled_by_fkey";

ALTER TABLE "public"."events"
ADD CONSTRAINT "events_canceled_by_fkey"
FOREIGN KEY ("canceled_by")
REFERENCES "public"."users"("id")
ON DELETE SET NULL;

COMMENT ON CONSTRAINT "events_canceled_by_fkey" ON "public"."events" IS 'Sets canceled_by to NULL if the referenced user is deleted, preventing deletion errors.';
