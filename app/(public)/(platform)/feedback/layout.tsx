import type { JSX } from "react";

import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

export const metadata: Metadata = {
  title: "フィードバック",
  description:
    "みんなの集金へのフィードバックフォームです。機能要望や不具合報告を気軽に送信できます。",
  alternates: {
    canonical: getPublicUrl("/feedback"),
  },
  openGraph: buildOpenGraphMetadata({
    title: "フィードバック",
    description:
      "みんなの集金へのフィードバックフォームです。機能要望や不具合報告を気軽に送信できます。",
    path: "/feedback",
  }),
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return <>{children}</>;
}
