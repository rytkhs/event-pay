import type { Metadata } from "next";

import { getPlatformTokushohoLegalDocument } from "@core/legal/documents";
import { LegalDocumentView } from "@core/legal/LegalDocumentView";
import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "特定商取引法に基づく表記",
    description: "みんなの集金の特定商取引法に基づく表記です。",
    alternates: {
      canonical: getPublicUrl("/tokushoho/platform"),
    },
    openGraph: buildOpenGraphMetadata({
      title: "特定商取引法に基づく表記 | みんなの集金",
      description: "みんなの集金の特定商取引法に基づく表記です。",
      path: "/tokushoho/platform",
    }),
  };
}

export default async function Page() {
  const document = await getPlatformTokushohoLegalDocument();
  return <LegalDocumentView document={document} fallbackTitle="特定商取引法に基づく表記" />;
}
