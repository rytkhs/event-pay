import EventCreateForm from "@/components/events/event-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function CreateEventPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login");
  }

  return (
    <div className="container mx-auto py-8">
      <EventCreateForm />
    </div>
  );
}
