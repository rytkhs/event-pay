import dynamicImport from "next/dynamic";
import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { createClient } from "@core/supabase/server";

export const dynamic = "force-dynamic";

const LandingPage = dynamicImport(() => import("./(marketing)/_components/LandingPage"), {
  ssr: false,
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      absolute: "みんなの集金 - 出欠から集金まで、ひとつのリンクで完了",
    },
  };
}

export default async function Home() {
  // 認証状態チェック
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // 認証済みユーザーはダッシュボードにリダイレクト
  if (user && !error) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
