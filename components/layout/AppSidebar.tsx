"use client";

import { useEffect, useTransition } from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogOut, ChevronsUpDown, CreditCard, Loader2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { createExpressDashboardLoginLinkAction } from "@/features/stripe-connect/actions/express-dashboard";
import type { ActionResult } from "@/types/action-result";

import { navigationConfig, userMenuItems } from "./GlobalHeader/navigation-config";

type AppSidebarProps = {
  user: {
    name?: string | null;
    email?: string | null;
  } | null;
  logoutAction: () => Promise<ActionResult>;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({ user, logoutAction, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const [isPending, startTransition] = useTransition();

  // 画面遷移時にモバイル用サイドバーを自動的に閉じる
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  const handleLogout = async () => {
    await logoutAction();
  };

  // クリック時のハンドラ
  const handleStripeDashboard = () => {
    startTransition(async () => {
      await createExpressDashboardLoginLinkAction();
    });
  };

  const userName = user?.name || user?.email || "Guest";
  const userInitial = userName[0]?.toUpperCase() || "U";
  const userEmail = user?.email || "";

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <Image src="/icon.svg" width={24} height={24} alt="Minshu" className="size-6" />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">みんなの集金</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
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

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleStripeDashboard}
                  disabled={isPending}
                  tooltip="Stripeダッシュボード"
                >
                  {isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
                  <span>Stripeダッシュボード</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{userInitial}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{userName}</span>
                    <span className="truncate text-xs">{userEmail}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side={isMobile ? "top" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem disabled className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userName}</p>
                    <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
                  </div>
                </DropdownMenuItem>

                {userMenuItems.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href} className="w-full cursor-pointer">
                      {item.icon && <span className="mr-2 h-4 w-4">{item.icon}</span>}
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  ログアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
