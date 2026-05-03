import React from "react";

import Link from "next/link";

import { Check } from "lucide-react";

import { FadeIn } from "./ui/FadeIn";

export const PricingSection: React.FC = () => {
  return (
    <section id="pricing" className="py-20 bg-slate-900 text-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <FadeIn direction="up" className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              初期費用・月額費用は0円。
              <br className="md:hidden" />
              オンライン集金を使ったときだけ手数料。
            </h2>
            <p className="text-slate-400">
              固定費なしで始められます。
              <br className="hidden md:block" />
              現金払いの管理には費用はかかりません。オンライン集金を利用した場合のみ、決済金額に応じた手数料が発生します。
            </p>
          </FadeIn>

          <FadeIn direction="up" delay={0.2}>
            <div className="bg-white text-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl flex flex-col md:flex-row gap-12 items-center">
              <div className="flex-1 space-y-6">
                <h3 className="text-2xl font-bold text-slate-800">基本プラン</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-success/10 p-1 rounded-full">
                      <Check size={16} className="text-success" aria-hidden="true" />
                    </div>
                    <span className="font-medium">
                      イベント作成数：<span className="font-bold">無制限</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-1 rounded-full">
                      <Check size={16} className="text-green-600" aria-hidden="true" />
                    </div>
                    <span className="font-medium">招待リンクの発行</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-1 rounded-full">
                      <Check size={16} className="text-green-600" aria-hidden="true" />
                    </div>
                    <span className="font-medium">Stripe連携によるオンライン決済</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-1 rounded-full">
                      <Check size={16} className="text-green-600" aria-hidden="true" />
                    </div>
                    <span className="font-medium">自動リマインドメール</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-1 rounded-full">
                      <Check size={16} className="text-green-600" aria-hidden="true" />
                    </div>
                    <span className="font-medium">参加者リストのCSV出力</span>
                  </div>
                </div>
              </div>

              <div className="w-px h-32 bg-slate-200 hidden md:block" aria-hidden="true"></div>
              <div className="h-px w-full bg-slate-200 md:hidden" aria-hidden="true"></div>

              <div className="flex-1 text-center md:text-left">
                <div className="mb-8">
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-wider mb-1">
                    現金払いの管理
                  </p>
                  <div className="flex items-baseline justify-center md:justify-start gap-1">
                    <span className="text-4xl font-bold text-slate-800">0</span>
                    <span className="text-xl font-bold text-slate-700">円</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    現金の受け渡しにシステム手数料はかかりません
                  </p>
                </div>

                <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">
                    オンライン集金手数料
                  </p>
                </div>
                <div className="flex items-baseline justify-center md:justify-start gap-1">
                  <span className="text-5xl font-bold text-primary">4.9</span>
                  <span className="text-2xl font-bold text-slate-700">%</span>
                </div>

                <div className="mt-4 bg-slate-50 border border-slate-200 p-4 rounded-xl text-left">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    主催者が受け取りたい金額に合わせて、手数料を考慮した参加費を設定できます。
                    <span className="text-xs text-slate-400 mt-1 block">
                      例: 3,000円を受け取りたい場合 → 参加費を約3,155円に設定
                      <br />
                      （自動計算ツール内蔵）
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* 文脈リンク */}
          <FadeIn direction="up" delay={0.2}>
            <div className="mt-8 text-center">
              <Link
                href="/guide/pricing-and-fees"
                className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
              >
                料金と手数料について →
              </Link>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
};
