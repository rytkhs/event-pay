import type { JSX } from "react";

import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description:
    "みんなの集金のお問い合わせフォームです。ご質問やご不明な点がございましたら、お気軽にお問い合わせください。",
  alternates: {
    canonical: getPublicUrl("/contact"),
  },
  openGraph: buildOpenGraphMetadata({
    title: "お問い合わせ | みんなの集金",
    description:
      "みんなの集金のお問い合わせフォームです。ご質問やご不明な点がございましたら、お気軽にお問い合わせください。",
    path: "/contact",
  }),
};

export default function ContactLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return <>{children}</>;
}
