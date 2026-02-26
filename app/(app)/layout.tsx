import type { ReactNode } from "react";

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
  // 認証状態を取得（middlewareで認証済みであることが保証されている）
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // usersテーブルからユーザー情報を取得
  const currentUser = user
    ? await supabase
        .from("users")
        .select("id, name, created_at, updated_at")
        .eq("id", user.id)
        .single()
        .then(({ data, error }) =>
          error ? { ...user, name: user.email } : { ...user, name: data?.name || user.email }
        )
    : null;

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
