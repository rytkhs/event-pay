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
      <SidebarHeader className="border-b border-sidebar-border/70 px-2 pb-3 pt-3">
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

      <SidebarContent className="gap-5 px-2 py-4">
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationConfig.app.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.exactMatch === false &&
                    pathname.startsWith(item.href) &&
                    item.href !== "/dashboard") ||
                  (item.href === "/dashboard" && pathname === "/dashboard");

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <Link href={item.href}>
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/events/create"}
                  tooltip="新しいイベントを作成"
                  className="h-10 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/70 text-sidebar-foreground shadow-sm hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:border-sidebar-primary/40 data-[active=true]:bg-sidebar-primary/12 data-[active=true]:text-sidebar-foreground"
                >
                  <Link href="/events/create">
                    <Plus />
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
