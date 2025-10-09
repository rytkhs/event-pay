CREATE POLICY "Creators can view their own events"
ON "public"."events"
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);
