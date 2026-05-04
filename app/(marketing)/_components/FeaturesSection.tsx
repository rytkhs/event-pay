import React from "react";

import Link from "next/link";

import { Share2, CreditCard, BellRing, Check } from "lucide-react";

import { ParticipantTableMock } from "./ParticipantTableMock";
import { FadeIn } from "./ui/FadeIn";

export const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="py-20 bg-slate-900 text-white overflow-hidden">
      <div className="container mx-auto px-4 md:px-6 max-w-7xl">
        <div className="text-center mb-16">
          <FadeIn direction="up">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              集金に必要な作業を、ひとつの画面にまとめます。
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              出欠確認、支払い状況の確認、現金受領の記録、未払いの把握まで。
              <br className="hidden md:block" />
              スプレッドシートや個別メッセージに散らばりがちな情報を、イベントごとに整理できます。
            </p>
          </FadeIn>
        </div>

        <div className="space-y-24">
          {/* Feature 1: 招待リンクを共有するだけ */}
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 order-2 md:order-1">
              <FadeIn direction="right" delay={0.2}>
                <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
                  {/* LINE-style UI */}
                  <div className="bg-slate-800 rounded-lg p-4 max-w-sm mx-auto shadow-2xl border border-slate-700">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-success rounded-full flex items-center justify-center text-xs font-bold p-2">
                        LINE
                      </div>
                      <div className="bg-slate-700 rounded-lg p-3 text-sm text-slate-200">
                        <p>イベントの案内だよ！ここから回答してね👇</p>
                        <Link
                          href={process.env.NEXT_PUBLIC_DEMO_INVITE_LINK || "#"}
                          className="text-primary underline mt-1 block break-all"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          https://minnano-shukin.com/inv/xyz123
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
            <div className="flex-1 order-1 md:order-2">
              <FadeIn direction="left" delay={0.2}>
                <div className="flex items-center gap-3 text-primary font-bold mb-3">
                  <Share2 size={24} aria-hidden="true" />
                  <span>招待リンクを共有するだけ</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">LINEやSNSで送るだけ。</h3>
                <p className="text-slate-300 text-lg leading-relaxed">
                  イベントを作成したら、招待リンクをグループに共有。個別で出欠を確認する必要はありません。参加者はアカウント登録なしで回答できます。
                </p>
              </FadeIn>
            </div>
          </div>

          {/* Feature 2: オンラインも現金も同じリストで */}
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1">
              <FadeIn direction="right" delay={0.2}>
                <div className="flex items-center gap-3 text-primary font-bold mb-3">
                  <CreditCard size={24} aria-hidden="true" />
                  <span>ハイブリッド集金</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  オンライン決済も現金も、
                  <br />
                  同じリストで管理。
                </h3>
                <p className="text-slate-300 text-lg leading-relaxed mb-6">
                  オンラインで払う人も、当日現金で払う人も、同じイベント内でまとめて管理できます。支払い方法が混在しても、管理を分ける必要はありません。
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="bg-primary/20 p-1 rounded-full text-primary mt-0.5">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </div>
                    <span className="text-slate-200">オンライン決済は自動で入金確認</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="bg-primary/20 p-1 rounded-full text-primary mt-0.5">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </div>
                    <span className="text-slate-200">現金は「受領」ボタンひとつで記録</span>
                  </li>
                </ul>
              </FadeIn>
            </div>
            <div className="flex-1">
              <FadeIn direction="left" delay={0.2}>
                <div className="bg-white/5 rounded-2xl px-4 py-8 border border-white/10 flex justify-center">
                  <ParticipantTableMock />
                </div>
              </FadeIn>
            </div>
          </div>

          {/* Feature 3: 未払い確認・催促のストレスを軽減 */}
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 order-2 md:order-1">
              <FadeIn direction="right" delay={0.2}>
                <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
                  <div className="bg-white rounded-xl shadow-2xl max-w-sm mx-auto p-4 flex gap-3 items-start">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <BellRing className="text-primary w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm mb-1">
                        【リマインド】明日はイベント当日です
                      </p>
                      <p className="text-xs text-slate-500">
                        みんなの集金より
                        <br />
                        夏の納涼会に参加予定の皆様へのお知らせです...
                      </p>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
            <div className="flex-1 order-1 md:order-2">
              <FadeIn direction="left" delay={0.2}>
                <div className="flex items-center gap-3 text-primary font-bold mb-3">
                  <BellRing size={24} aria-hidden="true" />
                  <span>自動リマインド</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  未払い確認もリマインドも、
                  <br />
                  システムにおまかせ。
                </h3>
                <p className="text-slate-300 text-lg leading-relaxed">
                  誰が未払いかを一覧で確認できます。開催日前日や決済締切前にはリマインドメールが自動送信されるため、個別に「お金払って」と連絡する必要はありません。
                </p>
              </FadeIn>
            </div>
          </div>
        </div>

        {/* 文脈リンク */}
        <FadeIn direction="up" delay={0.2}>
          <div className="mt-16 text-center">
            <Link
              href="/guide/participant-flow"
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              参加者の登録と支払いの流れを見る →
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};
