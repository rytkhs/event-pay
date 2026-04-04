"use client";

import { useMemo } from "react";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { resolveMobilePageConfig } from "./mobile-navigation";

export function Header() {
  const pathname = usePathname();
  const pageConfig = useMemo(() => resolveMobilePageConfig(pathname), [pathname]);

  return (
    <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center border-b border-border/50 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/90 md:flex">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-5" />
        <h1 className="truncate text-sm font-medium text-foreground">{pageConfig.title}</h1>
      </div>
    </header>
  );
}
