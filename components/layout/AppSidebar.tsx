"use client";

import { useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CircleHelp, MessageSquare, Plus } from "lucide-react";

import type { AppWorkspaceShellData } from "@core/community/app-workspace";
import type { ActionResult } from "@core/errors/adapters/server-actions";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

import { isAppSidebarNavActive } from "./app-sidebar-active";
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
                const isActive = isAppSidebarNavActive(item, pathname);

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
                              ? "text-sidebar-primary [&>svg]:size-4 [&>svg]:shrink-0"
                              : "text-sidebar-foreground/55 transition-colors group-hover/menu-item:text-sidebar-foreground/70 [&>svg]:size-4 [&>svg]:shrink-0"
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
                    "h-10 rounded-lg border border-sidebar-primary/20 bg-sidebar-primary/10 px-3 text-[13px] font-semibold text-sidebar-primary transition-colors duration-150",
                    "hover:border-sidebar-primary/35 hover:bg-sidebar-primary/15",
                    "group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center",
                    pathname === "/events/create"
                      ? "border-sidebar-primary/40 bg-sidebar-primary/15"
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

      <SidebarFooter className="border-t border-sidebar-border/60 px-2.5 py-3">
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="サポート"
              className={[
                "h-9 rounded-xl px-3 text-[13px] font-medium transition-all duration-150",
                "text-sidebar-foreground/60 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground",
                "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
              ].join(" ")}
            >
              <Link href="/contact">
                <CircleHelp className="size-4 text-sidebar-foreground/55" />
                <span className="group-data-[collapsible=icon]:hidden">サポート</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="フィードバック"
              className={[
                "h-9 rounded-xl px-3 text-[13px] font-medium transition-all duration-150",
                "text-sidebar-foreground/60 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground",
                "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
              ].join(" ")}
            >
              <Link href="/feedback">
                <MessageSquare className="size-4 text-sidebar-foreground/55" />
                <span className="group-data-[collapsible=icon]:hidden">要望・不具合</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
