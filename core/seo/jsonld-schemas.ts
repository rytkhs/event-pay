import type { WithContext, Organization, WebSite, SoftwareApplication } from "schema-dts";

import { getAppUrl } from "@core/seo/metadata";

export function generateOrganizationSchema(): WithContext<Organization> {
  const appUrl = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${appUrl}#organization`,
    name: "みんなの集金",
    url: appUrl,
    logo: `${appUrl}/icon-512.png`,
    contactPoint: {
      "@type": "ContactPoint",
      email: "contact@minnano-shukin.com",
      contactType: "customer service",
      availableLanguage: "Japanese",
    },
    sameAs: ["https://twitter.com/minnano_shukin"],
  };
}

export function generateWebSiteSchema(): WithContext<WebSite> {
  const appUrl = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${appUrl}#website`,
    name: "みんなの集金",
    alternateName: "minnano-shukin",
    url: appUrl,
    description:
      "出欠確認から集金まで、リンク1本でまとめて管理できるイベント出欠管理・集金アプリです。参加者はアカウント登録不要で、オンライン決済と現金払いの両方に対応しています。",
    inLanguage: "ja",
    publisher: {
      "@type": "Organization",
      "@id": `${appUrl}#organization`,
    },
  };
}

export function generateSoftwareApplicationSchema(): WithContext<SoftwareApplication> {
  const appUrl = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "みんなの集金",
    image: `${appUrl}/og/homepage.png`,
    description:
      "「みんなの集金」は、イベントの出欠確認から集金まで、リンク1本でまとめて管理できる出欠管理・集金アプリです。参加者はアカウント登録不要で参加表明でき、オンライン集金も現金集金も同じ参加者一覧で一元管理できます。小銭の管理、未払い対応、名簿と現金の照合など、幹事・会計担当の集金業務を軽くします。初期費用・月額料金0円、現金集金なら無料でご利用いただけます。",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: appUrl,
    author: {
      "@type": "Organization",
      "@id": `${appUrl}#organization`,
    },
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "JPY",
      availability: "https://schema.org/InStock",
    },
    featureList: [
      "アプリ不要・登録不要: 招待リンクをLINEやSNSで共有するだけで、参加者は登録せずに10秒で参加表明が完了",
      "ハイブリッド決済対応: クレジットカードなどのキャッシュレス決済も現金払いも一つのリストで一元管理。オンライン決済は自動で入金確認、現金集金も受領ボタンで簡単管理",
      "自動リマインド機能: 開催日前日やオンライン支払い期限前にシステムが自動でメール送信。催促のストレスから解放",
      "リアルタイム管理: 参加状況と入金状況がリアルタイムで更新され、管理画面で一目で確認可能",
      "多様な決済手段: Visa、Mastercard、JCB、American Express、Diners Club、Discover、Apple Pay、Google Payに対応。Stripe決済で安心・安全",
    ],
  };
}
