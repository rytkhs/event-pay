import React from "react";

import { CalendarPlus, Share2, PiggyBank } from "lucide-react";

import { FadeIn } from "./ui/FadeIn";
import { StaggerContainer, StaggerItem } from "./ui/StaggerContainer";

export const HowItWorksSection: React.FC = () => {
  return (
    <section id="how-it-works" className="py-20 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <FadeIn direction="up" className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-800">使い方は、たったの3ステップ</h2>
        </FadeIn>

        <StaggerContainer className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting Line (Desktop) */}
          <div
            className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-slate-100 -z-10 transform scale-x-75"
            aria-hidden="true"
          ></div>

          {/* Step 1 */}
          <StaggerItem className="flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-white border-4 border-primary/20 rounded-full flex items-center justify-center mb-6 shadow-sm">
              <CalendarPlus className="text-primary w-10 h-10" aria-hidden="true" />
            </div>
            <span className="text-primary font-bold mb-2 tracking-widest">STEP 01</span>
            <h3 className="text-xl font-bold text-slate-800 mb-3">イベント作成</h3>
            <p className="text-slate-600 text-sm leading-relaxed max-w-xs">
              日時・場所・会費を入力してイベントを作成します。
            </p>
          </StaggerItem>

          {/* Step 2 */}
          <StaggerItem className="flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-white border-4 border-primary/20 rounded-full flex items-center justify-center mb-6 shadow-sm">
              <Share2 className="text-primary w-10 h-10" aria-hidden="true" />
            </div>
            <span className="text-primary font-bold mb-2 tracking-widest">STEP 02</span>
            <h3 className="text-xl font-bold text-slate-800 mb-3">リンクをシェア</h3>
            <p className="text-slate-600 text-sm leading-relaxed max-w-xs">
              発行されたURLをグループLINEなどで共有。参加者は登録不要で回答できます。
            </p>
          </StaggerItem>

          {/* Step 3 */}
          <StaggerItem className="flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-white border-4 border-primary/20 rounded-full flex items-center justify-center mb-6 shadow-sm">
              <PiggyBank className="text-primary w-10 h-10" aria-hidden="true" />
            </div>
            <span className="text-primary font-bold mb-2 tracking-widest">STEP 03</span>
            <h3 className="text-xl font-bold text-slate-800 mb-3">あとは待つだけ</h3>
            <p className="text-slate-600 text-sm leading-relaxed max-w-xs">
              参加状況と入金状況はリアルタイムで更新。集まった売上は後日口座へ振込。
            </p>
          </StaggerItem>
        </StaggerContainer>
      </div>
    </section>
  );
};
