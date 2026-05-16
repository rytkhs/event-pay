import type { Metadata } from "next";

import { getTermsLegalDocument } from "@core/legal/documents";
import { LegalDocumentView } from "@core/legal/LegalDocumentView";
import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "利用規約",
    description:
      "みんなの集金の利用規約です。本サービスのご利用にあたって同意いただく事項を定めています。",
    alternates: {
      canonical: getPublicUrl("/terms"),
    },
    openGraph: buildOpenGraphMetadata({
      title: "利用規約 | みんなの集金",
      description:
        "みんなの集金の利用規約です。本サービスのご利用にあたって同意いただく事項を定めています。",
      path: "/terms",
    }),
  };
}

export default async function Page() {
  const document = await getTermsLegalDocument();
  return <LegalDocumentView document={document} fallbackTitle="利用規約" />;
}
