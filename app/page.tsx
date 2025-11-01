import dynamicImport from "next/dynamic";
import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { createClient } from "@core/supabase/server";
import { getCanonicalUrl } from "@core/utils/canonical-url";

export const dynamic = "force-dynamic";

const LandingPage = dynamicImport(() => import("./(marketing)/_components/LandingPage"), {
  ssr: false,
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    alternates: {
      canonical: getCanonicalUrl("/"),
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
