import type { Metadata } from "next";

import { getPrivacyLegalDocument } from "@core/legal/documents";
import { LegalDocumentView } from "@core/legal/LegalDocumentView";
import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "プライバシーポリシー",
    description:
      "みんなの集金のプライバシーポリシーです。個人情報の取り扱いについて説明しています。",
    alternates: {
      canonical: getPublicUrl("/privacy"),
    },
    openGraph: buildOpenGraphMetadata({
      title: "プライバシーポリシー | みんなの集金",
      description:
        "みんなの集金のプライバシーポリシーです。個人情報の取り扱いについて説明しています。",
      path: "/privacy",
    }),
  };
}

export default async function Page() {
  const document = await getPrivacyLegalDocument();
  return <LegalDocumentView document={document} fallbackTitle="プライバシーポリシー" />;
}
