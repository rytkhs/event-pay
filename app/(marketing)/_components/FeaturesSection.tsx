import React from "react";

import { Zap, CreditCard, BellRing } from "lucide-react";

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
            <div className="w-20 h-1.5 bg-primary mx-auto rounded-full"></div>
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
                  <Zap size={24} />
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
                  <CreditCard size={24} />
                  <span>ハイブリッド決済</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  「クレカ払い」も「現金払い」も、
                  <br />
                  一つのリストで。
                </h3>
                <p className="text-slate-300 text-lg leading-relaxed">
                  完全キャッシュレス化が難しいコミュニティでも安心。「事前に払いたい人」はオンライン決済（Stripe）で、「当日払いたい人」は現金で。管理画面では両方のステータスを一元管理できます。
                </p>
              </FadeIn>
            </div>
            <div className="flex-1">
              <FadeIn direction="left" delay={0.2}>
                <div className="bg-white/5 rounded-2xl p-8 border border-white/10 flex justify-center">
                  {/* Abstract UI for Hybrid Payment - Participant Table Mock */}
                  <div className="w-full max-w-md bg-white rounded-xl text-slate-800 overflow-hidden shadow-2xl text-sm">
                    {/* Header */}
                    <div className="bg-slate-100 border-b border-slate-200 px-4 py-3 flex items-center">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"></div>
                        <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
                        <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"></div>
                      </div>
                      <div className="flex-1 text-center font-bold text-slate-600 text-xs">
                        参加者一覧
                      </div>
                      <div className="w-10"></div>
                    </div>

                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-2 p-2 bg-slate-50/50 border-b border-slate-100 text-xs font-medium text-slate-500">
                      <div className="col-span-3 pl-2">ニックネーム</div>
                      <div className="col-span-2 text-center">参加</div>
                      <div className="col-span-3 text-center">決済方法</div>
                      <div className="col-span-2 text-center">状況</div>
                      <div className="col-span-2 text-center">アクション</div>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-slate-100">
                      {/* Row 1: Online Payment (Paid) */}
                      <div className="grid grid-cols-12 gap-2 p-3 items-center hover:bg-slate-50 transition-colors">
                        <div className="col-span-3 font-bold text-slate-700 truncate pl-2">
                          田中 太郎
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200">
                            参加
                          </span>
                        </div>
                        <div className="col-span-3 flex justify-center">
                          <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold border border-purple-200">
                            オンライン
                          </span>
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold border border-green-200">
                            済
                          </span>
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <div className="w-6 h-6 rounded bg-slate-100 text-slate-300 flex items-center justify-center">
                            -
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Cash Payment (Pending) */}
                      <div className="grid grid-cols-12 gap-2 p-3 items-center hover:bg-slate-50 transition-colors bg-orange-50/30">
                        <div className="col-span-3 font-bold text-slate-700 truncate pl-2">
                          鈴木 次郎
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200">
                            参加
                          </span>
                        </div>
                        <div className="col-span-3 flex justify-center">
                          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold border border-orange-200">
                            現金
                          </span>
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">
                            未
                          </span>
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <button className="bg-green-500 hover:bg-green-600 text-white text-[10px] px-2 py-1 rounded font-bold shadow-sm transition-all transform hover:scale-105">
                            受領
                          </button>
                        </div>
                      </div>

                      {/* Row 3: Cash Payment (Paid) */}
                      <div className="grid grid-cols-12 gap-2 p-3 items-center hover:bg-slate-50 transition-colors">
                        <div className="col-span-3 font-bold text-slate-700 truncate pl-2">
                          佐藤 花子
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200">
                            参加
                          </span>
                        </div>
                        <div className="col-span-3 flex justify-center">
                          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold border border-orange-200">
                            現金
                          </span>
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold border border-green-200">
                            済
                          </span>
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <div className="w-6 h-6 rounded bg-slate-100 text-slate-300 flex items-center justify-center">
                            -
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
                      <BellRing className="text-primary w-5 h-5" />
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
                  <BellRing size={24} />
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
