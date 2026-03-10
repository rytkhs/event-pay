import type { Metadata } from "next";

import { buildOpenGraphMetadata, siteOgTitle } from "@core/seo/metadata";

import { CTASection } from "./_components/CTASection";
import { FAQSection } from "./_components/FAQSection";
import { FeaturesSection } from "./_components/FeaturesSection";
import { HeroSection } from "./_components/HeroSection";
import { HowItWorksSection } from "./_components/HowItWorksSection";
import { PricingSection } from "./_components/PricingSection";
import { ProblemsSection } from "./_components/ProblemsSection";
import { UseCasesSection } from "./_components/UseCasesSection";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      absolute: siteOgTitle,
    },
    description:
      "参加の確認から集金まで、招待リンクをLINEで共有するだけで完了できるイベント管理 & 集金アプリです。いつもの集金を、キャッシュレスにしませんか?サークル・コミュニティ運営の集金負担を劇的に減らします。",
    alternates: {
      canonical: process.env.NEXT_PUBLIC_APP_URL,
    },
    openGraph: buildOpenGraphMetadata({
      title: siteOgTitle,
      description:
        "参加の確認から集金まで、招待リンクをLINEで共有するだけで完了できるイベント管理 & 集金アプリです。いつもの集金を、キャッシュレスにしませんか?サークル・コミュニティ運営の集金負担を劇的に減らします。",
    }),
  };
}

export default function Home() {
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
