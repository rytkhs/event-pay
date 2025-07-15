"use client";

import { EventError } from "@/components/events/event-error";

export default function EventsPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <EventError error={error} reset={reset} />;
}
