import React from "react";

import Image from "next/image";

import { Check } from "lucide-react";

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
                <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">
                    プラットフォーム利用料
                  </p>
                  <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">
                    業界最安水準
                  </span>
                </div>
                <div className="flex items-baseline justify-center md:justify-start gap-1">
                  <span className="text-5xl font-bold text-primary">1.3</span>
                  <span className="text-2xl font-bold text-slate-700">%</span>
                </div>
                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  ※利用料はオンライン決済に対して申し受けます。また、別途Stripe手数料(3.6%)が差し引かれます。
                  <br />
                  ※「参加費」に手数料を含めて設定することで、幹事さんの持ち出し負担をゼロにできます。
                </p>
                <div className="mt-6 flex justify-center md:justify-start">
                  <Image
                    src="/images/powered-by-stripe.svg"
                    alt="Powered by Stripe"
                    width={120}
                    height={26}
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
