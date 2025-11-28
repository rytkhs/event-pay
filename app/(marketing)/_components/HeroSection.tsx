"use client";

import React from "react";

import Image from "next/image";
import Link from "next/link";

import { CheckCircle2, ArrowRight } from "lucide-react";
import { m } from "motion/react";

import { FadeIn } from "./ui/FadeIn";

export const HeroSection: React.FC = () => {
  return (
    <section className="relative pt-24 pb-20 md:pt-28 md:pb-32 overflow-hidden bg-gradient-to-br from-primary/5 via-white to-secondary/5">
      {/* Decorative Background Shapes */}
      <div
        className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-80 h-80 bg-secondary/20 rounded-full blur-3xl"
        aria-hidden="true"
      ></div>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-20">
          {/* Text Content */}
          <div className="flex-1 text-center md:text-left">
            <FadeIn delay={0.1}>
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-bold mb-6">
                <span className="relative flex h-3 w-3" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
                集金ストレスをゼロに
              </div>
            </FadeIn>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight mb-6">
              イベントの集金
              <br />
              出欠確認は、これひとつ。
              <br />
              <span className="text-primary">キャッシュレス派も現金派も。</span>
            </h1>

            <FadeIn delay={0.3}>
              <p className="text-lg md:text-xl text-slate-600 mb-8 leading-relaxed">
                アプリ不要、ログイン不要。招待リンクを送るだけで、
                <br className="hidden md:block" />
                面倒なExcel管理や小銭のやり取りから解放されます。
                <br className="hidden md:block" />
                幹事の負担を劇的に減らす、新しいスタンダード。
              </p>
            </FadeIn>

            <FadeIn delay={0.4}>
              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
                <Link
                  href="/register"
                  className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-bold px-8 py-4 rounded-full shadow-xl hover:shadow-primary/20 transition-all flex items-center justify-center gap-2"
                >
                  今すぐ無料でイベントを作る
                  <ArrowRight size={20} aria-hidden="true" />
                </Link>
              </div>
              <p className="mt-4 text-slate-500 text-sm mb-6">
                初期費用・月額費 0円 / 現金集金なら完全無料
              </p>

              <div className="flex flex-wrap justify-center md:justify-start items-center gap-x-6 gap-y-4">
                {/* Credit Cards */}
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
                    src="/images/cards/google-pay.webp"
                    alt="Google Pay"
                    width={105}
                    height={56}
                    className="h-7 w-auto"
                  />
                  <div className="h-6 w-px bg-slate-300 mx-1" aria-hidden="true"></div>
                  <Image
                    src="/images/powered-by-stripe.svg"
                    alt="Powered by Stripe"
                    width={120}
                    height={32}
                    className="h-7 w-auto"
                  />
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Graphic/Mockup Content */}
          <div className="flex-1 w-full max-w-lg md:max-w-none flex justify-center relative">
            <FadeIn direction="up" delay={0.5} className="relative z-10">
              {/* Phone Mockup - CSS Only */}
              <div
                className="relative w-72 h-[550px] bg-slate-900 rounded-[3rem] border-8 border-slate-900 shadow-2xl overflow-hidden"
                aria-hidden="true"
              >
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-32 bg-slate-900 rounded-b-xl z-20"></div>

                {/* Screen Content */}
                <div className="w-full h-full bg-white flex flex-col pt-8">
                  {/* App Header */}
                  <div className="px-4 pb-4 border-b border-slate-100">
                    <div className="text-xs font-bold text-primary mb-1">8/25 (土) 18:00〜</div>
                    <div className="font-bold text-slate-800 text-lg leading-tight">
                      夏の納涼会🍺 @渋谷
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <span className="bg-success/10 text-success px-2 py-0.5 rounded">募集中</span>
                      <span>参加費: ¥3,500</span>
                    </div>
                  </div>

                  {/* Attendance Form UI Mock */}
                  <div className="p-4 flex-1 overflow-y-auto bg-slate-50" aria-hidden="true">
                    <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                      <p className="font-bold text-slate-700 mb-3">参加ステータス</p>
                      <div className="flex gap-2 mb-4">
                        <div className="flex-1 bg-primary/5 border-2 border-primary text-primary text-center py-2 rounded-lg font-bold text-sm">
                          参加
                        </div>
                        <div className="flex-1 border border-slate-200 text-slate-500 text-center py-2 rounded-lg text-sm">
                          不参加
                        </div>
                        <div className="flex-1 border border-slate-200 text-slate-500 text-center py-2 rounded-lg text-sm">
                          未定
                        </div>
                      </div>

                      <p className="font-bold text-slate-700 mb-2 mt-6">お支払い方法</p>
                      <div className="space-y-2">
                        <div className="flex items-center p-3 border-2 border-primary bg-primary/5 rounded-lg cursor-pointer">
                          <div className="w-4 h-4 rounded-full bg-primary mr-3 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                          </div>
                          <span className="text-sm font-bold text-slate-800">オンライン決済</span>
                        </div>
                        <div className="flex items-center p-3 border border-slate-200 rounded-lg cursor-pointer">
                          <div className="w-4 h-4 rounded-full border border-slate-300 mr-3"></div>
                          <span className="text-sm text-slate-600">現金払い</span>
                        </div>
                      </div>

                      <div className="w-full mt-6 bg-primary text-primary-foreground font-bold py-3 rounded-lg text-sm shadow-lg text-center">
                        参加を確定する
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Floating Badge */}
            <m.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="absolute top-20 -left-12 md:-left-20 z-20"
            >
              <div
                className="bg-white p-4 rounded-xl shadow-xl border border-slate-100 animate-bounce"
                style={{ animationDuration: "3s" }}
              >
                <div className="flex items-center gap-3">
                  <div className="bg-success/10 p-2 rounded-full">
                    <CheckCircle2 className="text-success w-6 h-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase">集金完了!</p>
                    <p className="text-sm font-bold text-slate-800">¥35,000 集金済み</p>
                  </div>
                </div>
              </div>
            </m.div>
          </div>
        </div>
      </div>
    </section>
  );
};
