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
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="min-h-screen w-full [--event-management-tabbar-height:3.25rem]"
    >
      <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6">{headerContent}</div>
      <div className="sticky top-[var(--app-mobile-header-height)] z-20 border-b border-border/40 bg-white/80 backdrop-blur-xl md:top-14">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6">
          <div className="py-0">
            <TabsList
              className="h-auto w-full justify-start gap-5 rounded-none bg-transparent p-0 sm:gap-8"
              aria-label="イベント管理タブ"
            >
              <TabsTrigger
                value="overview"
                className="group relative rounded-none border-0 px-0.5 py-3.5 text-sm font-semibold text-muted-foreground/70 transition-all data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none hover:text-foreground md:px-1 md:py-4 md:text-[15px]"
              >
                {tabLabels.overview}
                <span className="absolute bottom-0 left-0 h-0.5 w-full origin-center scale-x-0 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.4)] transition-transform duration-300 group-data-[state=active]:scale-x-100" />
              </TabsTrigger>
              <TabsTrigger
                value="participants"
                className="group relative rounded-none border-0 px-0.5 py-3.5 text-sm font-semibold text-muted-foreground/70 transition-all data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none hover:text-foreground md:px-1 md:py-4 md:text-[15px]"
              >
                {tabLabels.participants}
                <span className="absolute bottom-0 left-0 h-0.5 w-full origin-center scale-x-0 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.4)] transition-transform duration-300 group-data-[state=active]:scale-x-100" />
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
