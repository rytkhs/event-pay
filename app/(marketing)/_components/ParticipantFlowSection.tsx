import React from "react";

import Link from "next/link";

import { FadeIn } from "./ui/FadeIn";
import { StaggerContainer, StaggerItem } from "./ui/StaggerContainer";

export const ParticipantFlowSection: React.FC = () => {
  const steps = [
    {
      step: "01",
      title: "招待リンクを開く",
      desc: "イベント名、日時、場所、参加費、案内文を確認します。",
      visual: (
        <div className="bg-white rounded-xl shadow-lg p-4 border border-slate-100">
          <div className="text-xs font-bold text-primary mb-1">8/25 (土) 18:00〜</div>
          <div className="font-bold text-slate-800 text-sm">夏の納涼会🍺 @渋谷</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <span className="bg-success/10 text-success px-2 py-0.5 rounded">募集中</span>
            <span>参加費: ¥3,500</span>
          </div>
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">
            今年も夏の納涼会を開催します！皆さんのご参加をお待ちしています...
          </p>
        </div>
      ),
    },
    {
      step: "02",
      title: "情報を入力",
      desc: "ニックネームとメールアドレスを入力。アカウント作成は不要です。",
      visual: (
        <div className="bg-white rounded-xl shadow-lg p-4 border border-slate-100 space-y-3">
          <div>
            <span className="text-xs font-bold text-slate-600 block mb-1">ニックネーム</span>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700">
              山田 太郎
            </div>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-600 block mb-1">メールアドレス</span>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400">
              taro@example.com
            </div>
          </div>
        </div>
      ),
    },
    {
      step: "03",
      title: "支払い方法を選ぶ",
      desc: "オンライン決済または現金払いを選択できます。",
      visual: (
        <div className="bg-white rounded-xl shadow-lg p-4 border border-slate-100 space-y-2">
          <div className="flex items-center p-3 border-2 border-primary bg-primary/5 rounded-lg">
            <div className="w-4 h-4 rounded-full bg-primary mr-3 flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            </div>
            <span className="text-xs font-bold text-slate-800">オンライン決済</span>
          </div>
          <div className="flex items-center p-3 border border-slate-200 rounded-lg">
            <div className="w-4 h-4 rounded-full border border-slate-300 mr-3"></div>
            <span className="text-xs text-slate-600">現金払い</span>
          </div>
        </div>
      ),
    },
    {
      step: "04",
      title: "登録完了",
      desc: "登録後、自分の参加状況や支払い状況を確認できます。",
      visual: (
        <div className="bg-white rounded-xl shadow-lg p-4 border border-slate-100 text-center">
          <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-bold text-slate-800 text-sm mb-1">参加登録が完了しました</p>
          <p className="text-xs text-slate-500">確認メールを送信しました</p>
        </div>
      ),
    },
  ];

  return (
    <section className="py-20 bg-slate-50">
      <div className="container mx-auto px-4 md:px-6">
        <FadeIn direction="up" className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
            参加者はリンクを開くだけ。アカウント登録不要。
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            参加者にアプリのインストールや会員登録をお願いする必要はありません。
            <br className="hidden md:block" />
            招待リンクを開き、必要な情報を入力して、支払い方法を選ぶだけで参加登録できます。
          </p>
        </FadeIn>

        <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((item) => (
            <StaggerItem key={item.step} className="flex flex-col">
              {/* ステップ番号 */}
              <div className="mb-4">
                <span className="text-primary font-bold text-sm tracking-widest">
                  STEP {item.step}
                </span>
                <h3 className="text-lg font-bold text-slate-800 mt-1">{item.title}</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
              </div>

              {/* スマホ風ビジュアル */}
              <div className="flex-1 flex items-start">
                <div className="w-full">{item.visual}</div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* 文脈リンク */}
        <FadeIn direction="up" delay={0.2}>
          <div className="mt-12 text-center">
            <Link
              href="/guide/participant-flow"
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              詳しい参加者画面の流れ →
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};
