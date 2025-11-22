import React from "react";

import { Check } from "lucide-react";
import Image from "next/image";

import { FadeIn } from "./ui/FadeIn";

export const PricingSection: React.FC = () => {
  return (
    <section id="pricing" className="py-20 bg-slate-900 text-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <FadeIn direction="up" className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              初期費用・月額固定費はずっと 0円
            </h2>
            <p className="text-slate-400">
              イベントを開催して売上が発生しない限り、費用は一切かかりません。
            </p>
          </FadeIn>

          <FadeIn direction="up" delay={0.2}>
            <div className="bg-white text-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl flex flex-col md:flex-row gap-12 items-center">
              <div className="flex-1 space-y-6">
                <h3 className="text-2xl font-bold text-slate-800">基本プラン</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-success/10 p-1 rounded-full">
                      <Check size={16} className="text-success" />
                    </div>
                    <span className="font-medium">
                      イベント作成数：<span className="font-bold">無制限</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-1 rounded-full">
                      <Check size={16} className="text-green-600" />
                    </div>
                    <span className="font-medium">招待リンクの発行</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-1 rounded-full">
                      <Check size={16} className="text-green-600" />
                    </div>
                    <span className="font-medium">Stripe連携によるオンライン決済</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-1 rounded-full">
                      <Check size={16} className="text-green-600" />
                    </div>
                    <span className="font-medium">自動リマインドメール</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-1 rounded-full">
                      <Check size={16} className="text-green-600" />
                    </div>
                    <span className="font-medium">参加者リストのCSV出力</span>
                  </div>
                </div>
              </div>

              <div className="w-px h-32 bg-slate-200 hidden md:block"></div>
              <div className="h-px w-full bg-slate-200 md:hidden"></div>

              <div className="flex-1 text-center md:text-left">
                <div className="mb-8">
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-wider mb-1">
                    現金集金の手数料
                  </p>
                  <div className="flex items-baseline justify-center md:justify-start gap-1">
                    <span className="text-4xl font-bold text-slate-800">0</span>
                    <span className="text-xl font-bold text-slate-700">%</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    ※現金の受け渡しにシステム手数料はかかりません
                  </p>
                </div>

                <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">
                    オンライン集金の手数料
                  </p>
                  <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">
                    業界最安水準
                  </span>
                </div>
                <div className="flex items-baseline justify-center md:justify-start gap-1">
                  <span className="text-5xl font-bold text-primary">1.3</span>
                  <span className="text-2xl font-bold text-slate-700">%</span>
                  <span className="text-sm text-slate-500 ml-2">+ Stripe手数料 3.6%</span>
                </div>

                <div className="mt-4 bg-primary/5 border border-primary/20 p-4 rounded-xl text-left">
                  <p className="text-sm font-bold text-slate-800 mb-1">幹事さんの負担は実質0円に</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    参加費に手数料分を上乗せして設定すれば、幹事さんの持ち出しはありません。
                    <br />
                    <span className="text-xs text-slate-400 mt-1 block">
                      例: 3,800円集めたい場合 → 参加費を4000円に設定
                      <br />
                      (自動計算ツール内蔵)
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Payment Methods Trust Badge */}
          <FadeIn direction="up" delay={0.4}>
            <div className="mt-12 pt-8 border-t border-slate-700">
              <p className="text-center text-slate-400 text-sm mb-6">対応している支払い方法</p>
              <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-4 opacity-90">
                {/* Credit Cards */}
                <div className="flex items-center gap-4">
                  <Image
                    src="/images/cards/visa.svg"
                    alt="Visa"
                    width={48}
                    height={32}
                    className="h-7 w-auto brightness-0 invert"
                  />
                  <Image
                    src="/images/cards/mastercard.svg"
                    alt="Mastercard"
                    width={48}
                    height={32}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/jcb.gif"
                    alt="JCB"
                    width={48}
                    height={32}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/amex.png"
                    alt="Amex"
                    width={48}
                    height={32}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/diners.gif"
                    alt="Diners"
                    width={48}
                    height={32}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/discover.png"
                    alt="Discover"
                    width={48}
                    height={32}
                    className="h-7 w-auto"
                  />
                </div>

                {/* Divider for desktop */}
                <div className="hidden lg:block h-8 w-px bg-slate-600"></div>

                {/* Wallets & Stripe */}
                <div className="flex items-center gap-5">
                  <Image
                    src="/images/cards/apple-pay.svg"
                    alt="Apple Pay"
                    width={56}
                    height={32}
                    className="h-7 w-auto"
                  />
                  <Image
                    src="/images/cards/google-pay.png"
                    alt="Google Pay"
                    width={56}
                    height={32}
                    className="h-7 w-auto"
                  />
                  <div className="h-6 w-px bg-slate-600 mx-1"></div>
                  <Image
                    src="/images/powered-by-stripe.svg"
                    alt="Powered by Stripe"
                    width={120}
                    height={32}
                    className="h-7 w-auto brightness-0 invert opacity-90"
                  />
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
};
