import dynamicImport from "next/dynamic";

import type { Metadata } from "next";

const LandingPage = dynamicImport(() => import("./_components/LandingPage"), {
  ssr: false,
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      absolute: "みんなの集金 - 出欠から集金まで、ひとつのリンクで完了",
    },
  };
}

export default function Home() {
  return <LandingPage />;
}
