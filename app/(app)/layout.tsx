import type { ReactNode } from "react";

import { requireCurrentUserForServerComponent } from "@core/auth/auth-utils";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { DemoBanner } from "@features/demo";

import { AppSidebar } from "@components/layout/AppSidebar";
import { Header } from "@components/layout/Header";

import { logoutAction } from "@/app/(auth)/actions";
import { createExpressDashboardLoginLinkAction } from "@/app/_actions/stripe-connect/actions";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * アプリケーションレイアウト
 *
 * 認証済みユーザー向けアプリケーション領域のレイアウト。
 * アプリケーションサイドバー（AppSidebar）とメインコンテンツエリアを提供します。
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireCurrentUserForServerComponent();
  const supabase = await createServerComponentSupabaseClient();

  // usersテーブルからユーザー情報を取得
  const currentUser = await supabase
    .from("users")
    .select("id, name, created_at, updated_at")
    .eq("id", user.id)
    .single()
    .then(({ data, error }) =>
      error ? { ...user, name: user.email } : { ...user, name: data?.name || user.email }
    );

  return (
    <SidebarProvider>
      <AppSidebar
        user={currentUser}
        logoutAction={logoutAction}
        createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
      />
      <SidebarInset>
        <DemoBanner />
        <Header />
        <main className="flex-1 flex flex-col p-2 sm:p-4 w-full max-w-7xl mx-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
