import React, { memo } from "react";
import Link from "next/link";
import { Event } from "@features/events/types";
import { EventCard } from "./event-card";
import { Button } from "@/components/ui/button";

interface EventListProps {
  events: Event[];
  isLoading?: boolean;
  isFiltered?: boolean;
}

function EmptyEventList({ isFiltered = false }: { isFiltered?: boolean }) {
  if (isFiltered) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">🔍</div>
        <p className="text-gray-600 text-lg mb-2">条件に合うイベントが見つかりません</p>
        <p className="text-gray-500 mb-6">フィルター条件を変更してお試しください</p>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <div className="text-gray-400 text-6xl mb-4">📅</div>
      <p className="text-gray-600 text-lg mb-2">イベントがまだありません</p>
      <p className="text-gray-500 mb-6">新しいイベントを作成してみましょう</p>
      <Button asChild>
        <Link href="/events/create">新しいイベントを作成</Link>
      </Button>
    </div>
  );
}

export const EventList = memo(function EventList({ events, isFiltered = false }: EventListProps) {
  if (events.length === 0) {
    return <EmptyEventList isFiltered={isFiltered} />;
  }

  return (
    <div data-testid="event-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
});
