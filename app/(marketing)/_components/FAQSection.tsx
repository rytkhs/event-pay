import React from "react";

import { FadeIn } from "./ui/FadeIn";
import { StaggerContainer, StaggerItem } from "./ui/StaggerContainer";

export const FAQSection: React.FC = () => {
  const faqs = [
    {
      q: "参加者もアカウント登録が必要ですか？",
      a: "いいえ、必要ありません。参加者はメールアドレスとニックネームだけで参加登録・決済が可能です。アプリのインストールも不要です。",
    },
    {
      q: "利用料金はいくらですか？",
      a: "基本料金はありません。オンライン決済された参加費に対し、プラットフォーム利用手数料(1.3%)を申し受けます。 なお、上記手数料とは別に、決済代行会社の手数料(3.6%)が差し引かれます。現金集金は完全無料です。",
    },
    {
      q: "参加者は「未定」でも登録できますか？",
      a: "はい、可能です。「未定」で登録しておくことで参加申込締め切りのリマインダーメールを受信することができます。「参加」に変更後、決済手続きへ進めます。",
    },
    {
      q: "現金とオンラインの両方で集金できますか？",
      a: "はい。現金の場合は対面で集金する必要がありますが、入金状況を1つの画面で管理できます。",
    },
    {
      q: "リマインドのタイミングは？",
      a: "参加締切、オンライン決済締切、イベント開催日を設定している場合、それぞれ前日の午前9時頃に自動でリマインドメールが送信されます。",
    },
    {
      q: "セキュリティは大丈夫ですか？",
      a: "クレジットカード情報は世界的な決済基盤「Stripe」が管理し、当サービスでは一切保持しません。通信はすべて暗号化されています。",
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
                  <span className="text-lg font-bold text-slate-800">Q. {item.q}</span>
                  <span className="transition group-open:rotate-180">
                    <svg
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
                <div className="text-slate-600 px-6 pb-6 leading-relaxed">A. {item.a}</div>
              </details>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
};
