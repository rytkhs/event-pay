import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

import { ModernEventForm } from "@features/events";

export default async function CreateEventPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 to-accent/5 py-8">
      <div className="container mx-auto px-4">
        <ModernEventForm />
      </div>
    </div>
  );
}
