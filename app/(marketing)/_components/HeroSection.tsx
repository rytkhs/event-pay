import React from "react";

import Link from "next/link";

import { ArrowRight, PlayCircle } from "lucide-react";

import { DashboardMock } from "./DashboardMock";
import { FadeIn } from "./ui/FadeIn";

export const HeroSection: React.FC = () => {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden bg-gradient-to-br from-primary/5 via-white to-secondary/5">
      {/* Decorative Background Shapes */}
      <div
        className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-80 h-80 bg-secondary/20 rounded-full blur-3xl"
        aria-hidden="true"
      ></div>

      <div className="container max-w-7xl mx-auto px-4 md:px-6 relative z-10">
        <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-20">
          {/* Text Content */}
          <div className="md:w-5/12 text-center md:text-left">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-800 leading-snug mb-6">
              参加費・会費の集金を、
              <br />
              リンク1本でまとめて管理。
            </h1>

            <FadeIn delay={0.3} className="w-full">
              <p className="text-lg md:text-xl text-slate-600 mb-8 leading-relaxed">
                招待リンクを送るだけ。
                <br className="hidden md:block" />
                参加者はアカウント登録不要で、オンライン決済・現金払いどちらも選べます。
                <br className="hidden md:block" />
                主催者は出欠・支払い状況・未払いをひとつの画面で管理できます。
              </p>
            </FadeIn>

            <FadeIn delay={0.4} className="w-full">
              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
                <Link
                  href="/register"
                  className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-bold px-8 py-4 rounded-full shadow-xl hover:shadow-primary/20 transition-all flex items-center justify-center gap-2"
                >
                  無料ではじめる
                  <ArrowRight size={20} aria-hidden="true" />
                </Link>
                <a
                  href={`${process.env.NEXT_PUBLIC_DEMO_URL || "https://demo.minnano-shukin.com"}/start-demo`}
                  className="w-full sm:w-auto bg-white hover:bg-primary/5 text-primary border-2 border-primary text-lg font-bold px-8 py-4 rounded-full transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-primary/10"
                >
                  <PlayCircle size={24} aria-hidden="true" />
                  デモを見る
                </a>
              </div>

              {/* 補助ラベル */}
              <div className="mt-6 flex flex-wrap justify-center md:justify-start items-center gap-x-4 gap-y-2">
                <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  初期費用・月額費用 0円
                </span>
                <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  参加者アカウント登録不要
                </span>
                <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  オンライン決済・現金払い対応
                </span>
              </div>

              {/* Stripe注記 */}
              <p className="mt-3 text-xs text-slate-400">
                ※ オンライン集金の利用には、主催者によるStripe連携が必要です。
              </p>
            </FadeIn>
          </div>

          {/* Dashboard Mock Visual */}
          <div className="md:w-7/12 w-full flex justify-center md:justify-end">
            <FadeIn
              direction="up"
              delay={0.5}
              className="w-full flex justify-center md:justify-end"
            >
              <DashboardMock />
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
};
