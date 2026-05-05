import type { Metadata } from "next";

import { buildOpenGraphMetadata, siteOgTitle } from "@core/seo/metadata";

import { CTASection } from "./_components/CTASection";
import { FAQSection } from "./_components/FAQSection";
import { FeaturesSection } from "./_components/FeaturesSection";
import { HeroSection } from "./_components/HeroSection";
import { MoneyFlowSection } from "./_components/MoneyFlowSection";
import { ParticipantFlowSection } from "./_components/ParticipantFlowSection";
import { PricingSection } from "./_components/PricingSection";

export const dynamic = "force-static";

const metaDescription =
  "参加費・会費の集金を、リンク1本でまとめて管理。招待リンクを送るだけで出欠確認から集金まで完了。参加者はアカウント登録不要。オンライン決済・現金払い対応。";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      absolute: siteOgTitle,
    },
    description: metaDescription,
    alternates: {
      canonical: process.env.NEXT_PUBLIC_APP_URL,
    },
    openGraph: buildOpenGraphMetadata({
      title: siteOgTitle,
      description: metaDescription,
    }),
  };
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden">
      <HeroSection />
      <FeaturesSection />
      <ParticipantFlowSection />
      <MoneyFlowSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </div>
  );
}
