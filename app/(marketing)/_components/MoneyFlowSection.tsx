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
      desc: "主催者は、参加者ごとの支払い状況を管理画面で確認できます。",
    },
    {
      number: "4",
      title: "主催者の口座へ振込",
      desc: "オンラインで支払われた参加費は、オンライン集金手数料を差し引いた後にStripe経由で主催者の口座へ振込されます。",
    },
  ];

  const trustItems = [
    { icon: Shield, title: "カード情報の非保持" },
    { icon: CreditCard, title: "Stripeによる決済処理" },
    { icon: Lock, title: "通信の暗号化" },
    { icon: Landmark, title: "振込はStripeに準拠" },
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
              参加者が支払った参加費はStripeで処理され、主催者の口座へ振り込まれます。
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

          {/* 対応支払い方法 + 信頼要素 */}
          <FadeIn direction="up" delay={0.3}>
            <div className="mt-12 pt-8 border-t border-slate-100">
              {/* 対応している支払い方法 */}
              <p className="text-center text-slate-400 text-sm mb-6">対応している支払い方法</p>
              <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-4 mb-8">
                <div className="flex items-center gap-4">
                  <Image
                    src="/images/cards/visa.svg"
                    alt="Visa"
                    width={48}
                    height={32}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/mastercard.svg"
                    alt="Mastercard"
                    width={48}
                    height={32}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/jcb.webp"
                    alt="JCB"
                    width={73}
                    height={56}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/amex.webp"
                    alt="Amex"
                    width={56}
                    height={56}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/diners.webp"
                    alt="Diners"
                    width={76}
                    height={56}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/discover.webp"
                    alt="Discover"
                    width={88}
                    height={56}
                    className="h-7 w-auto"
                  />
                </div>

                {/* Divider for desktop */}
                <div className="hidden lg:block h-8 w-px bg-slate-200" aria-hidden="true"></div>

                {/* Wallets */}
                <div className="flex items-center gap-5">
                  <Image
                    src="/images/cards/apple-pay.svg"
                    alt="Apple Pay"
                    width={56}
                    height={32}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/google-pay.webp"
                    alt="Google Pay"
                    width={105}
                    height={56}
                    className="h-7 w-auto"
                  />
                </div>
              </div>

              {/* セキュリティ・信頼バッジ */}
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                {trustItems.map((item) => (
                  <div key={item.title} className="flex items-center gap-1.5 text-slate-400">
                    <item.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="text-xs font-medium">{item.title}</span>
                  </div>
                ))}
                <span className="text-slate-200 hidden md:inline" aria-hidden="true">
                  |
                </span>
                <a
                  href="https://stripe.com/jp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
                  aria-label="Stripeのウェブサイトへ（新しいタブで開きます）"
                >
                  <Image
                    src="/images/powered-by-stripe.svg"
                    alt="Powered by Stripe"
                    width={100}
                    height={26}
                    className="h-[1.4rem] w-auto"
                  />
                </a>
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
                オンライン集金・振込のしくみを見る →
              </Link>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
};
