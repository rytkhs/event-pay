import React, { memo } from "react";

import Link from "next/link";

import { PlusIcon, SearchIcon, CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { EventListItem } from "../types";

import { EventCard } from "./EventCard";

interface EventListProps {
  events: EventListItem[];
  isLoading?: boolean;
  isFiltered?: boolean;
}

function EmptyEventList({ isFiltered = false }: { isFiltered?: boolean }) {
  if (isFiltered) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center bg-white/55 dark:bg-card/40 backdrop-blur-sm border border-border/70 rounded-2xl md:rounded-3xl shadow-sm">
        <div className="mx-auto w-12 h-12 bg-muted/50 rounded-xl flex items-center justify-center mb-4 shadow-sm border border-border/50">
          <SearchIcon className="h-5 w-5 text-muted-foreground/60" />
        </div>
        <h3 className="text-[14px] font-semibold text-foreground mb-1.5">
          イベントが見つかりません
        </h3>
        <p className="text-[13px] text-muted-foreground/70 max-w-sm mx-auto font-medium">
          検索条件に一致するイベントがありません。
          <br className="hidden sm:inline" />
          フィルターやキーワードを変更してお試しください。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-28 px-4 text-center bg-white/55 dark:bg-card/40 backdrop-blur-sm border border-border/70 rounded-2xl md:rounded-3xl shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/5 border border-primary/10 mb-5">
        <CalendarIcon className="h-6 w-6 text-primary/70" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground mb-1.5">イベントがまだありません</h3>
      <p className="text-[13px] text-muted-foreground/70 mb-6 max-w-sm mx-auto font-medium leading-relaxed">
        コミュニティの最初のイベントを作成して、
        <br className="hidden sm:inline" />
        参加者の募集と集金を始めましょう。
      </p>
      <Button
        asChild
        size="default"
        className="rounded-xl font-bold px-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
      >
        <Link href="/events/create" prefetch={false} className="inline-flex items-center gap-2">
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
    <div
      data-testid="event-grid"
      className="group/list flex flex-col bg-white/55 dark:bg-card/40 backdrop-blur-sm border border-border/70 rounded-2xl md:rounded-3xl shadow-sm divide-y divide-border/50 overflow-hidden"
    >
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
});
