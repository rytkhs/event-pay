import type { Metadata } from "next";

type OpenGraphMetadata = NonNullable<Metadata["openGraph"]>;

export const siteName = "みんなの集金";
export const siteDescription =
  "参加の確認から集金まで、招待リンクをLINEで共有するだけで完了できる、集金 & 出欠管理アプリです。いつもの集金を、キャッシュレスにしませんか?";
export const siteOgTitle = "みんなの集金 - オンライン集金アプリ";
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
