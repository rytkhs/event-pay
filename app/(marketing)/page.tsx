import type { Metadata } from "next";

import LandingPage from "./_components/LandingPage";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      absolute: "みんなの集金 - いつもの集金を、キャッシュレスに",
    },
  };
}

export default function Home() {
  return <LandingPage />;
}
