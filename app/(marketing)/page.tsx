import type { Metadata } from "next";

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
      absolute: "みんなの集金 - 集金ストレスをゼロに",
    },
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
