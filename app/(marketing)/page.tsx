import type { Metadata } from "next";

import LandingPage from "./_components/LandingPage";

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
