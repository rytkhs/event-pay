import type { Metadata } from "next";

type OpenGraphMetadata = NonNullable<Metadata["openGraph"]>;

export const siteName = "みんなの集金";
export const siteDescription =
  "出欠確認から集金まで、リンク1本でまとめて管理。招待リンクを送るだけで参加者はアカウント登録不要。オンライン決済・現金払いに対応しています。";
export const siteOgTitle = "みんなの集金 - 出欠確認から集金までリンク1本で管理";
export const siteOgImage = {
  url: "/og/homepage.png",
  width: 1200,
  height: 630,
  alt: siteOgTitle,
} as const;

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL;
}

export function getPublicUrl(path = ""): string {
  return path ? `${getAppUrl()}${path}` : getAppUrl();
}

export function buildOpenGraphMetadata({
  title = siteOgTitle,
  description = siteDescription,
  path,
}: {
  title?: string;
  description?: string;
  path?: string;
} = {}): OpenGraphMetadata {
  return {
    title,
    description,
    type: "website",
    locale: "ja_JP",
    url: getPublicUrl(path),
    siteName,
    images: [siteOgImage],
  };
}
