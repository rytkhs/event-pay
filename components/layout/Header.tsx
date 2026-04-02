"use client";

import Link from "next/link";

import type { AppWorkspaceShellData } from "@core/community/app-workspace";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type HeaderProps = {
  workspace: AppWorkspaceShellData;
};

export function Header({ workspace }: HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 bg-background z-20 sticky top-0">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">現在のコミュニティ</span>
        <Link
          href="/settings/community"
          className="max-w-40 truncate rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors sm:max-w-56"
        >
          {workspace.currentCommunity?.name ?? "未設定"}
        </Link>
      </div>
    </header>
  );
}
