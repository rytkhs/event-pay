import type { ReactNode } from "react";

import { createClient } from "@core/supabase/server";

import { AppSidebar } from "@components/layout/AppSidebar";

import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

/**
 * アプリケーションレイアウト
 *
 * 認証済みユーザー向けアプリケーション領域のレイアウト。
 * アプリケーションサイドバー（AppSidebar）とメインコンテンツエリアを提供します。
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // 認証状態を取得（middlewareで認証済みであることが保証されている）
  const supabase = createClient();
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
      <AppSidebar user={currentUser} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background z-10">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {/* Breadcrumbs can be added here in the future */}
        </header>
        <main className="flex-1 flex flex-col p-4 w-full max-w-7xl mx-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
