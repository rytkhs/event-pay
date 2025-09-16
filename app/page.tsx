import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

const LandingPage = dynamic(() => import("./(marketing)/_components/LandingPage"), {
  ssr: false,
});

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
