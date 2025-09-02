import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

import EventCreateForm from "@features/events/components/event-form";

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
    <div className="container mx-auto py-8">
      <EventCreateForm />
    </div>
  );
}
