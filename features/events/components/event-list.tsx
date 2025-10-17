import React, { memo } from "react";

import Link from "next/link";

import { PlusIcon, SearchIcon, CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Event } from "../types";

import { EventCard } from "./event-card";

interface EventListProps {
  events: Event[];
  isLoading?: boolean;
  isFiltered?: boolean;
}

function EmptyEventList({ isFiltered = false }: { isFiltered?: boolean }) {
  if (isFiltered) {
    return (
      <div className="text-center py-16">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6">
          <SearchIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">条件に合うイベントが見つかりません</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          フィルター条件を変更するか、検索キーワードを見直してお試しください
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-16">
      <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
        <CalendarIcon className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">イベントがまだありません</h3>
      <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
        最初のイベントを作成して、参加者の管理を始めましょう
      </p>
      <Button asChild size="lg">
        <Link href="/events/create" className="inline-flex items-center gap-2">
          <PlusIcon className="h-4 w-4" />
          新しいイベントを作成
        </Link>
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
