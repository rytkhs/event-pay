import type { WithContext, Organization, WebSite, SoftwareApplication } from "schema-dts";

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://minnano-shukin.com";
}

export function generateOrganizationSchema(): WithContext<Organization> {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${baseUrl}/#organization`,
    name: "みんなの集金",
    url: baseUrl,
    logo: `${baseUrl}/icon-512.png`,
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
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${baseUrl}/#website`,
    name: "みんなの集金",
    url: baseUrl,
    description:
      "参加の確認から集金まで、招待リンクをLINEで共有するだけで完了できるイベント管理 & 集金アプリです。いつもの集金を、キャッシュレスにしませんか?サークル・コミュニティ運営の集金負担を劇的に減らします。",
    inLanguage: "ja",
  };
}

export function generateSoftwareApplicationSchema(): WithContext<SoftwareApplication> {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "みんなの集金",
    image: `${baseUrl}/og/homepage.png`,
    description:
      "「みんなの集金」は、イベントの出欠確認から集金まで、招待リンクをLINEで共有するだけで完了できるイベント管理・集金アプリです。アプリ不要・登録不要で、参加者はニックネームとメールアドレスだけで10秒で参加表明が可能。オンライン集金も現金集金も一つのリストで一元管理できるハイブリッド集金を実現。小銭の管理、未払い対応、名簿と現金の照合など、幹事の集金業務の負担を劇的に軽減します。飲み会・サークル・同窓会など、あらゆるイベントシーンで活躍。初期費用・月額料金0円、現金集金なら完全無料でご利用いただけます。",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: baseUrl,
    author: {
      "@type": "Organization",
      "@id": `${baseUrl}/#organization`,
    },
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "JPY",
      availability: "https://schema.org/InStock",
    },
    featureList: [
      "アプリ不要・登録不要: 招待リンクをLINEやSlackで共有するだけで、参加者は登録せずに10秒で参加表明が完了",
      "ハイブリッド決済対応: クレジットカードなどのキャッシュレス決済も現金払いも一つのリストで一元管理。オンライン決済は自動で入金確認、現金集金も受領ボタンで簡単管理",
      "自動リマインド機能: 開催日前日や決済締切前にシステムが自動でメール送信。催促のストレスから解放",
      "リアルタイム管理: 参加状況と入金状況がリアルタイムで更新され、管理画面で一目で確認可能",
      "多様な決済手段: Visa、Mastercard、JCB、American Express、Diners Club、Discover、Apple Pay、Google Payに対応。Stripe決済で安心・安全",
      "完全無料プラン: 初期費用・月額費0円。現金集金のみなら完全無料で利用可能",
      "幅広い用途: 飲み会・懇親会、サークル・同好会、旅行・イベント、OB会・同窓会など、あらゆるシーンに対応",
      "簡単3ステップ: イベント作成→リンクシェア→待つだけの簡単操作で集金完了",
    ],
  };
}
