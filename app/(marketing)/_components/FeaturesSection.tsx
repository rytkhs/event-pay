import React from "react";

import { Zap, CreditCard, BellRing, Check } from "lucide-react";

import { ParticipantTableMock } from "./ParticipantTableMock";
import { FadeIn } from "./ui/FadeIn";

export const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="py-20 bg-slate-900 text-white overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <FadeIn direction="up">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              その悩み、「みんなの集金」なら解決できます。
            </h2>
            <div className="w-20 h-1.5 bg-primary mx-auto rounded-full" aria-hidden="true"></div>
          </FadeIn>
        </div>

        <div className="space-y-24">
          {/* Feature 1 */}
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 order-2 md:order-1">
              <FadeIn direction="right" delay={0.2}>
                <div className="bg-white/5 rounded-2xl p-8 border border-white/10 relative overflow-hidden">
                  {/* Abstract UI for "Simple Link" */}
                  <div className="bg-slate-800 rounded-lg p-4 max-w-sm mx-auto shadow-2xl border border-slate-700">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-success rounded-full flex items-center justify-center text-xs font-bold">
                        LINE
                      </div>
                      <div className="bg-slate-700 rounded-lg p-3 text-sm text-slate-200">
                        <p>飲み会の案内だよ！ここから回答してね👇</p>
                        <p className="text-primary underline mt-1">
                          https://minnano-shukin.com/inv/xyz123
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
            <div className="flex-1 order-1 md:order-2">
              <FadeIn direction="left" delay={0.2}>
                <div className="flex items-center gap-3 text-primary font-bold mb-3">
                  <Zap size={24} aria-hidden="true" />
                  <span>圧倒的な手軽さ</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  アプリ不要・登録不要。
                  <br />
                  URLを送るだけ。
                </h3>
                <p className="text-slate-300 text-lg leading-relaxed">
                  参加者に新しいアプリを入れてもらう必要はありません。招待リンクをLINEやSlackに貼るだけ。参加者は「ニックネーム」と「メールアドレス」だけで、10秒で参加表明が完了します。
                </p>
              </FadeIn>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1">
              <FadeIn direction="right" delay={0.2}>
                <div className="flex items-center gap-3 text-primary font-bold mb-3">
                  <CreditCard size={24} aria-hidden="true" />
                  <span>ハイブリッド決済</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  「クレカ払い」も「現金払い」も、
                  <br />
                  一つのリストで。
                </h3>
                <p className="text-slate-300 text-lg leading-relaxed mb-6">
                  完全キャッシュレス化が難しいコミュニティでも安心。「事前に払いたい人」はオンライン決済で、「当日払いたい人」は現金で。管理画面では両方のステータスを一元管理できます。
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="bg-primary/20 p-1 rounded-full text-primary mt-0.5">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </div>
                    <span className="text-slate-200 text-md">オンライン決済は自動で入金確認</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="bg-primary/20 p-1 rounded-full text-primary mt-0.5">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </div>
                    <span className="text-slate-200 text-md">
                      現金集金も「受領」ボタン一つで管理
                    </span>
                  </li>
                </ul>
              </FadeIn>
            </div>
            <div className="flex-1">
              <FadeIn direction="left" delay={0.2}>
                <div className="bg-white/5 rounded-2xl px-4 py-8 border border-white/10 flex justify-center">
                  {/* Abstract UI for Hybrid Payment - Participant Table Mock */}
                  <ParticipantTableMock />
                </div>
              </FadeIn>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 order-2 md:order-1">
              <FadeIn direction="right" delay={0.2}>
                <div className="bg-white/5 rounded-2xl p-8 border border-white/10 relative">
                  {/* Abstract UI for Notification */}
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
                  <span>自動化で負担軽減</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  催促のストレスから解放。
                  <br />
                  リマインドは自動で。
                </h3>
                <p className="text-slate-300 text-lg leading-relaxed">
                  開催日前日や決済締切前に、システムが自動でメールを送信。「お金払って」と個別に連絡する気まずさは、もう必要ありません。
                </p>
              </FadeIn>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
