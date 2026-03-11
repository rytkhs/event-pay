"use client";

import { startTransition, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { type EventManagementTab, buildEventManagementSearchParams } from "../query-params";

interface EventManagementTabsShellProps {
  eventId: string;
  initialTab: EventManagementTab;
  headerContent: React.ReactNode;
  overviewContent: React.ReactNode;
  participantsContent: React.ReactNode;
  tabLabels: {
    overview: string;
    participants: string;
  };
}

export function EventManagementTabsShell({
  eventId,
  initialTab,
  headerContent,
  overviewContent,
  participantsContent,
  tabLabels,
}: EventManagementTabsShellProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = (value: string) => {
    if (value !== "overview" && value !== "participants") {
      return;
    }

    setActiveTab(value);

    startTransition(() => {
      const params = buildEventManagementSearchParams(window.location.search, {
        tab: value,
      });
      const search = params.toString();

      router.replace(`/events/${eventId}${search ? `?${search}` : ""}`, { scroll: false });
    });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="min-h-screen w-full">
      <div className="sticky top-12 z-10 border-b border-border/60 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6">
          {headerContent}

          <div className="mt-4 border-t border-border/60 py-2">
            <TabsList
              className="h-auto w-full justify-start gap-1 rounded-none bg-transparent p-0"
              aria-label="イベント管理タブ"
            >
              <TabsTrigger
                value="overview"
                className="rounded-full border border-transparent px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary/15 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground"
              >
                {tabLabels.overview}
              </TabsTrigger>
              <TabsTrigger
                value="participants"
                className="rounded-full border border-transparent px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary/15 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground"
              >
                {tabLabels.participants}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
      </div>

      <TabsContent
        value="overview"
        className="mt-0 focus-visible:outline-none"
        aria-label={tabLabels.overview}
      >
        {overviewContent}
      </TabsContent>
      <TabsContent
        value="participants"
        className="mt-0 focus-visible:outline-none"
        aria-label={tabLabels.participants}
      >
        {participantsContent}
      </TabsContent>
    </Tabs>
  );
}
