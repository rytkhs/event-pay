"use client";

import { useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Plus } from "lucide-react";

import type { AppWorkspaceShellData } from "@core/community/app-workspace";
import type { ActionResult } from "@core/errors/adapters/server-actions";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

import { CommunitySwitcher } from "./CommunitySwitcher";
import { navigationConfig } from "./GlobalHeader/navigation-config";

type AppSidebarProps = {
  user: {
    name?: string | null;
    email?: string | null;
  } | null;
  workspace: AppWorkspaceShellData;
  logoutAction: () => Promise<ActionResult>;
  createExpressDashboardLoginLinkAction: () => Promise<void>;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({
  user,
  workspace,
  logoutAction,
  createExpressDashboardLoginLinkAction,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  if (isMobile) {
    return null;
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* ヘッダー: コミュニティスイッチャー */}
      <SidebarHeader className="border-b border-sidebar-border/60 px-2 pb-3 pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <CommunitySwitcher
              user={user}
              workspace={workspace}
              logoutAction={logoutAction}
              createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        {/* メインナビゲーション */}
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navigationConfig.app.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.exactMatch === false &&
                    pathname.startsWith(item.href) &&
                    item.href !== "/dashboard") ||
                  (item.href === "/dashboard" && pathname === "/dashboard");

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                      className={[
                        "relative h-9 rounded-lg text-[13px] font-medium transition-all duration-150",
                        "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                        "group-data-[collapsible=icon]:justify-center",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent font-semibold before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <Link href={item.href}>
                        <span
                          className={
                            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
                          }
                        >
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 区切り線 */}
        <div className="mx-1 my-3 h-px bg-sidebar-border/50 group-data-[collapsible=icon]:hidden" />

        {/* イベント作成ボタン */}
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/events/create"}
                  tooltip="新しいイベントを作成"
                  className={[
                    "h-9 rounded-lg text-[13px] font-semibold transition-all duration-150",
                    "border border-sidebar-primary/30 bg-gradient-to-r from-sidebar-primary/15 to-sidebar-primary/5",
                    "text-sidebar-primary hover:from-sidebar-primary/25 hover:to-sidebar-primary/10 hover:border-sidebar-primary/50",
                    "shadow-sm hover:shadow",
                    pathname === "/events/create"
                      ? "from-sidebar-primary/30 to-sidebar-primary/15 border-sidebar-primary/50"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Link href="/events/create">
                    <Plus className="size-4" />
                    <span>新しいイベントを作成</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
