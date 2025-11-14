import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { createClient } from "@core/supabase/server";

import LandingPage from "./_components/LandingPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      absolute: "みんなの集金 - いつもの集金を、キャッシュレスに",
    },
  };
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 認証済みユーザーはダッシュボードへリダイレクト
  if (user) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
