import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { createClient } from "@core/supabase/server";

import { CTASection } from "./_components/CTASection";
import { FAQSection } from "./_components/FAQSection";
import { FeaturesSection } from "./_components/FeaturesSection";
import { HeroSection } from "./_components/HeroSection";
import { HowItWorksSection } from "./_components/HowItWorksSection";
import { PricingSection } from "./_components/PricingSection";
import { ProblemsSection } from "./_components/ProblemsSection";
import { UseCasesSection } from "./_components/UseCasesSection";

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

  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden">
      <HeroSection />
      <ProblemsSection />
      <FeaturesSection />
      <UseCasesSection />
      <HowItWorksSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </div>
  );
}
