import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function EventListRowSkeleton() {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex min-w-0 flex-1 items-center gap-3.5 sm:gap-5">
        <Skeleton className="h-12 w-12 flex-shrink-0 rounded-[10px] sm:h-[52px] sm:w-[52px]" />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-40 max-w-[60%]" />
            <Skeleton className="h-5 w-12 rounded-[6px]" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center gap-3 sm:hidden">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </div>

      <div className="ml-4 hidden items-center gap-6 sm:flex lg:ml-8 lg:gap-10">
        <div className="flex w-[70px] flex-col items-end gap-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="flex w-[80px] flex-col items-end gap-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-4 w-14" />
        </div>
        <Skeleton className="h-4 w-4" />
      </div>

      <Skeleton className="ml-3 h-4 w-4 sm:hidden" />
    </div>
  );
}

export function EventListPageSkeleton() {
  return (
    <div className="container mx-auto max-w-7xl">
      <div className="space-y-6">
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-1 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.08)] backdrop-blur-md">
            <div className="flex flex-1 items-center gap-3 px-3">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-40 max-w-[60%]" />
            </div>
            <div className="flex items-center gap-1 pr-1">
              <Skeleton className="h-9 w-9 rounded-xl sm:w-24" />
              <Skeleton className="h-4 w-px" />
              <Skeleton className="h-9 w-9 rounded-xl sm:w-24" />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-3 w-32" />
          </div>

          <div className="pt-2 pb-4">
            <div className="group/list flex flex-col overflow-hidden rounded-xl border border-border/70 bg-white/55 shadow-sm backdrop-blur-sm divide-y divide-border/50 dark:bg-card/40">
              {Array.from({ length: 6 }).map((_, index) => (
                <EventListRowSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventFormSectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-none">
      <CardHeader className="border-b border-border/70 bg-muted/20 p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <Skeleton className="hidden size-10 rounded-md sm:block" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-5">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EventTimelineSkeleton() {
  return (
    <Card className="rounded-lg border border-border/70 bg-card shadow-none">
      <CardHeader className="p-4 sm:p-5">
        <Skeleton className="h-5 w-28" />
      </CardHeader>
      <CardContent className="space-y-5 p-4 pt-0 sm:p-5 sm:pt-0">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="flex gap-3">
            <Skeleton className="size-3 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function EventFormPageSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 pb-28 pt-3 sm:gap-6 sm:px-6 sm:pb-32 lg:px-8 lg:pt-8">
        <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:gap-4 sm:pb-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-7 w-56" />
          </div>
          <Skeleton className="h-9 w-40 rounded-md" />
        </header>

        <div className="grid grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-7 xl:col-span-8">
            <EventFormSectionSkeleton rows={3} />
            <EventFormSectionSkeleton rows={3} />
            <EventFormSectionSkeleton rows={4} />
          </div>

          <div className="sticky top-24 hidden flex-col gap-4 lg:col-span-5 lg:flex xl:col-span-4">
            <EventTimelineSkeleton />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-20px_hsl(var(--foreground)/0.35)] backdrop-blur sm:px-4 sm:pb-[calc(1rem+env(safe-area-inset-bottom))] md:left-[var(--sidebar-width)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-36 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function EventDetailPageSkeleton() {
  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6">
        <div className="pt-2 pb-2 sm:py-2">
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-7 w-64 max-w-full" />
              <div className="flex flex-wrap gap-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
            <Skeleton className="hidden h-10 w-24 rounded-xl sm:block" />
          </div>
        </div>
      </div>

      <div className="sticky top-[var(--app-mobile-header-height)] z-20 border-b border-border/40 bg-white/80 backdrop-blur-xl md:top-14">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6">
          <div className="flex gap-5 py-3.5 sm:gap-8 md:py-4">
            <Skeleton className="h-5 w-10" />
            <Skeleton className="h-5 w-14" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 py-6 space-y-5">
        <Card className="rounded-lg border border-border/70 shadow-none">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-56 max-w-full" />
            </div>
            <Skeleton className="h-10 w-32 rounded-md" />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Card key={item} className="rounded-lg border border-border/70 shadow-none">
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-lg border border-border/70 shadow-none">
          <CardHeader className="p-4 sm:p-5">
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between gap-4 border-b border-border/50 pb-3 last:border-b-0 last:pb-0"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-40 max-w-[55%]" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
