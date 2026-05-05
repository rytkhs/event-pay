import React from "react";

import Link from "next/link";

import { ArrowRight, PlayCircle } from "lucide-react";

import { FadeIn } from "./ui/FadeIn";

export const CTASection: React.FC = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-primary/10 via-white to-secondary/10">
      <div className="container mx-auto px-4 md:px-6">
        <FadeIn direction="up" className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
            次の集金から、もっとシンプルに。
          </h2>
          <p className="text-slate-500 text-lg mb-8 leading-relaxed">
            まずは無料でイベントを作成。
            <br />
            もしくはデモで管理画面を体験できます。
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-6">
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
              デモを試す
            </a>
          </div>

          {/* 補助ラベル（再掲） */}
          <p className="text-sm text-slate-400">初期費用・月額費用はかかりません。</p>
        </FadeIn>
      </div>
    </section>
  );
};
