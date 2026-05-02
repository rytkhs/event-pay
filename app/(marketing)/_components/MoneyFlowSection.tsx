import React from "react";

import Image from "next/image";
import Link from "next/link";

import { Shield, CreditCard, Lock, Landmark } from "lucide-react";

import { FadeIn } from "./ui/FadeIn";
import { StaggerContainer, StaggerItem } from "./ui/StaggerContainer";

export const MoneyFlowSection: React.FC = () => {
  const steps = [
    {
      number: "1",
      title: "主催者がStripe連携",
      desc: "オンライン集金を使うには、主催者側でStripe連携と受取設定を行います。",
    },
    {
      number: "2",
      title: "参加者がオンラインで支払い",
      desc: "参加者は、招待ページからオンライン決済を選んで支払えます。",
    },
    {
      number: "3",
      title: "支払い状況が自動で反映",
      desc: "主催者は、参加者ごとの支払い状況をイベント画面で確認できます。",
    },
    {
      number: "4",
      title: "主催者の口座へ入金",
      desc: "オンライン集金分は、手数料差引後にStripe経由で主催者の口座へ入金されます。",
    },
  ];

  const trustItems = [
    {
      icon: Shield,
      title: "カード情報の非保持",
      desc: "カード情報は当サービスでは保持しません。Stripeが安全に管理します。",
    },
    {
      icon: CreditCard,
      title: "Stripeによる決済処理",
      desc: "世界的な決済基盤Stripeを利用。PCI DSS Level 1に準拠しています。",
    },
    {
      icon: Lock,
      title: "通信の暗号化",
      desc: "すべての通信はSSL/TLSで暗号化されています。",
    },
    {
      icon: Landmark,
      title: "入金はStripeに準拠",
      desc: "入金タイミングはStripeの審査状況・運用ルールに従います。",
    },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <FadeIn direction="up" className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
              集めた参加費は、Stripeを通じて主催者の口座へ。
            </h2>
            <p className="text-slate-500 text-lg">
              オンライン決済を利用する場合、主催者はStripeアカウントを連携します。
              <br className="hidden md:block" />
              参加者が支払った参加費はStripeで処理され、主催者の口座へ入金されます。
            </p>
          </FadeIn>

          {/* 4ステップ図解 */}
          <FadeIn direction="up" delay={0.2}>
            <div className="relative">
              <StaggerContainer className="grid md:grid-cols-4 gap-6">
                {steps.map((item) => (
                  <StaggerItem key={item.number} className="text-center">
                    <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-primary font-bold text-xl">{item.number}</span>
                    </div>
                    <h3 className="font-bold text-slate-800 mb-2 text-sm">{item.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                  </StaggerItem>
                ))}
              </StaggerContainer>

              {/* Connecting arrows (desktop only) */}
              <div
                className="hidden md:block absolute top-7 left-[18%] right-[18%] h-0.5 bg-primary/10 -z-0"
                aria-hidden="true"
              ></div>
            </div>
          </FadeIn>

          {/* 信頼要素 */}
          <FadeIn direction="up" delay={0.3}>
            <div className="mt-16 pt-12 border-t border-slate-100">
              <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {trustItems.map((item) => (
                  <StaggerItem key={item.title} className="text-center">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <item.icon className="text-slate-600 w-5 h-5" aria-hidden="true" />
                    </div>
                    <h4 className="font-bold text-slate-700 text-xs mb-1">{item.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                  </StaggerItem>
                ))}
              </StaggerContainer>

              {/* Powered by Stripe */}
              <div className="mt-8 flex justify-center">
                <Image
                  src="/images/powered-by-stripe.svg"
                  alt="Powered by Stripe"
                  width={120}
                  height={32}
                  className="h-7 w-auto opacity-70"
                />
              </div>
            </div>
          </FadeIn>

          {/* 文脈リンク */}
          <FadeIn direction="up" delay={0.2}>
            <div className="mt-8 text-center">
              <Link
                href="/guide/online-collection"
                className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
              >
                オンライン集金のしくみを見る →
              </Link>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
};
