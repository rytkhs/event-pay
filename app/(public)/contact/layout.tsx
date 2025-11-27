import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description:
    "みんなの集金のお問い合わせフォームです。ご質問やご不明な点がございましたら、お気軽にお問い合わせください。",
  alternates: {
    canonical: "/contact",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return <>{children}</>;
}
