"use client";

import { useEffect, useState, useTransition } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogOut, ChevronsUpDown, CreditCard, Loader2 } from "lucide-react";

import type { AppWorkspaceShellData } from "@core/community/app-workspace";
import type { ActionResult } from "@core/errors/adapters/server-actions";

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

import { CommunitySwitcher } from "./CommunitySwitcher";
import { navigationConfig, userMenuItems } from "./GlobalHeader/navigation-config";

const LOGOUT_ERROR_MESSAGE = "ログアウトに失敗しました。再度お試しください。";

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

  const [isPending, startTransition] = useTransition();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  // 画面遷移時にモバイル用サイドバーを自動的に閉じる
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      const result = await logoutAction();
      if (!result.success) {
        setIsLoggingOut(false);
        setLogoutError(result.error.userMessage || LOGOUT_ERROR_MESSAGE);
        return;
      }

      const redirectUrl = result.redirectUrl || "/login";
      window.location.href = redirectUrl;
    } catch {
      setIsLoggingOut(false);
      setLogoutError(LOGOUT_ERROR_MESSAGE);
    }
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
            <CommunitySwitcher workspace={workspace} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>メニュー</SidebarGroupLabel>
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
          <SidebarGroupLabel>ツール</SidebarGroupLabel>
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
            <DropdownMenu
              open={isUserMenuOpen}
              onOpenChange={(open) => {
                setIsUserMenuOpen(open);
                if (!open) {
                  setLogoutError(null);
                }
              }}
            >
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
                  disabled={isLoggingOut}
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleLogout();
                  }}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  {isLoggingOut ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  {isLoggingOut ? "ログアウト中..." : "ログアウト"}
                </DropdownMenuItem>

                {logoutError && (
                  <div
                    className="mx-2 mt-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    role="alert"
                    aria-live="assertive"
                  >
                    {logoutError}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
