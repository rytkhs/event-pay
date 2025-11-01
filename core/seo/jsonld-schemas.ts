import type { WithContext, Organization, WebSite } from "schema-dts";

/**
 * 環境に応じたベースURLを取得
 */
function getBaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://minnano-shukin.com"
    );
  }
  return "http://localhost:3000";
}

/**
 * Organization スキーマを生成
 *
 * ブランド情報を構造化データとして提供します。
 */
export function generateOrganizationSchema(): WithContext<Organization> {
  const baseUrl = getBaseUrl();

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "みんなの集金",
    url: baseUrl,
    logo: `${baseUrl}/icon.svg`,
    contactPoint: {
      "@type": "ContactPoint",
      email: "contact@minnano-shukin.com",
      contactType: "customer service",
    },
    sameAs: ["https://twitter.com/minnano_shukin"],
  };
}

/**
 * WebSite スキーマを生成
 *
 * サイト情報を構造化データとして提供します。
 */
export function generateWebSiteSchema(): WithContext<WebSite> {
  const baseUrl = getBaseUrl();

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "みんなの集金",
    url: baseUrl,
    description: "参加の確認から集金まで、リンクの共有だけで完了できる新しいサービスです。",
  };
}
