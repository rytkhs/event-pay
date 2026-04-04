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
  workspace: AppWorkspaceShellData;
  logoutAction: () => Promise<ActionResult>;
  createExpressDashboardLoginLinkAction: () => Promise<void>;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({
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
      <SidebarHeader className="border-b border-sidebar-border/60 px-2.5 pb-2 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <CommunitySwitcher
              workspace={workspace}
              logoutAction={logoutAction}
              createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2.5 py-3">
        {/* メインナビゲーション */}
        <SidebarGroup className="py-0 group-data-[collapsible=icon]:px-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
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
                        "relative h-10 rounded-xl px-3 text-[13px] font-medium transition-all duration-150",
                        "text-sidebar-foreground/70 hover:bg-sidebar-accent/75 hover:text-sidebar-foreground",
                        "group-data-[collapsible=icon]:justify-center",
                        isActive
                          ? "bg-sidebar-accent/95 font-semibold text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_hsl(var(--sidebar-primary)/0.12),0_8px_18px_-14px_hsl(var(--sidebar-primary)/0.65)] hover:bg-sidebar-accent"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <Link href={item.href}>
                        <span
                          className={
                            isActive
                              ? "text-sidebar-primary"
                              : "text-sidebar-foreground/45 transition-colors group-hover/menu-item:text-sidebar-foreground/70"
                          }
                        >
                          {item.icon}
                        </span>
                        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 区切り線 */}
        <div className="mx-2 my-2.5 h-px bg-sidebar-border/60 group-data-[collapsible=icon]:hidden" />

        {/* イベント作成ボタン */}
        <SidebarGroup className="py-0 group-data-[collapsible=icon]:px-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/events/create"}
                  tooltip="新しいイベントを作成"
                  className={[
                    "h-10 rounded-xl border border-sidebar-primary/25 bg-gradient-to-r from-sidebar-primary/16 via-sidebar-primary/10 to-sidebar-primary/5 text-[13px] font-semibold text-sidebar-primary transition-all duration-150",
                    "shadow-[inset_0_1px_0_hsl(var(--sidebar-primary-foreground)/0.4),0_10px_20px_-18px_hsl(var(--sidebar-primary)/0.9)] hover:border-sidebar-primary/45 hover:from-sidebar-primary/24 hover:via-sidebar-primary/16 hover:to-sidebar-primary/8 hover:shadow-[inset_0_1px_0_hsl(var(--sidebar-primary-foreground)/0.5),0_14px_26px_-18px_hsl(var(--sidebar-primary)/1)]",
                    "group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center",
                    pathname === "/events/create"
                      ? "border-sidebar-primary/50 from-sidebar-primary/28 via-sidebar-primary/18 to-sidebar-primary/10"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Link href="/events/create">
                    <Plus className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      新しいイベントを作成
                    </span>
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
