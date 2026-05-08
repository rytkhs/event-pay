import React from "react";

import Link from "next/link";

import { FadeIn } from "./ui/FadeIn";
import { StaggerContainer, StaggerItem } from "./ui/StaggerContainer";

export const FAQSection: React.FC = () => {
  const faqs = [
    {
      q: "参加者はアカウント登録が必要ですか？",
      a: "不要です。参加者は招待リンクから、名前(ニックネーム)とメールアドレスを入力して参加登録できます。アプリのインストールや専用アカウントの作成は必要ありません。",
    },
    {
      q: "オンライン払いと現金払いを同じイベントで管理できますか？",
      a: "できます。オンライン決済を選んだ参加者と、現金払いを選んだ参加者を同じイベント内で管理できます。現金払いの参加者は、主催者が受領済みに変更できます。",
    },
    {
      q: "オンライン集金を使うには何が必要ですか？",
      a: "主催者によるオンライン集金の設定が必要です。Stripeのページで入金先の銀行口座の登録や本人確認を行います。",
      link: { label: "オンライン集金・入金のしくみを見る", href: "/guide/online-collection" },
    },
    {
      q: "集めたお金はどこに入りますか？",
      a: "オンラインで支払われた参加費はStripeで処理され、オンライン集金手数料を差し引いた後、Stripe残高として管理されます。",
    },
    // {
    //   q: "入金はいつ行われますか？",
    //   a: "通常、決済完了後、数日程度で入金可能になります。その後任意のタイミングで銀行口座に入金できます。",
    // },
    {
      q: "返金はできますか？",
      a: "現時点では、みんなの集金のアプリ内に返金機能はありません。返金が必要な場合は、主催者と参加者の間で個別に対応してください。",
    },
    {
      q: "カード情報は保存されますか？",
      a: "カード情報は本サービスでは保持しません。オンライン決済にはStripeを利用しており、カード情報はStripeが安全に管理します。",
    },
    {
      q: "主催者は参加費に手数料を上乗せできますか？",
      a: "できます。主催者が受け取りたい金額をもとに、手数料を考慮した参加費を設定できます。自動計算ツールも内蔵しています。",
      link: { label: "料金と手数料について", href: "/guide/pricing-and-fees" },
    },
    {
      q: "どんな集まりに向いていますか？",
      a: "サークル、OB会、同窓会、懇親会、研究会、講習会など、クローズドなイベントや、参加費や会費を事前に集める場面に向いています。逆に、少人数の割り勘や、金額が後から変わる精算、公開して広く参加を募るイベントには向いていません。",
    },
  ];

  return (
    <section id="faq" className="py-20 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <FadeIn direction="up" className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-800">よくある質問</h2>
        </FadeIn>

        <StaggerContainer className="max-w-3xl mx-auto space-y-4">
          {faqs.map((item, index) => (
            <StaggerItem key={index}>
              <details className="group bg-slate-50 rounded-xl">
                <summary className="flex justify-between items-center font-medium cursor-pointer list-none p-6">
                  <span className="text-lg font-bold text-slate-800 pr-4">Q. {item.q}</span>
                  <span className="transition group-open:rotate-180 flex-shrink-0">
                    <svg
                      aria-hidden="true"
                      fill="none"
                      height="24"
                      shapeRendering="geometricPrecision"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                      width="24"
                    >
                      <path d="M6 9l6 6 6-6"></path>
                    </svg>
                  </span>
                </summary>
                <div className="text-slate-600 px-6 pb-6 leading-relaxed">
                  <p>A. {item.a}</p>
                  {item.link && (
                    <Link
                      href={item.link.href}
                      className="inline-block mt-2 text-primary hover:text-primary/80 text-sm font-medium transition-colors"
                    >
                      {item.link.label} →
                    </Link>
                  )}
                </div>
              </details>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
};
