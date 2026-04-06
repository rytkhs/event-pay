import Link from "next/link";

import { Building2, Briefcase, ArrowLeft, Info, HelpCircle, Mail } from "lucide-react";
import type { Metadata } from "next";

import { cn } from "@core/utils";

import { GlobalHeader } from "@/components/layout/GlobalHeader/GlobalHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "設定に迷ったら",
  description: "Stripe設定時に入力する項目と回答の参考",
};

export default function OnboardingGuidePage() {
  const tableData = [
    {
      community: "大学・社会人サークル、\n勉強会、技術コミュニティ",
      category: "会員制組織 > 市民、友愛または社会団体",
      note: "会費や参加費が中心の運営であり、社会的な任意団体としての実態に最も近い。",
    },
    {
      community: "PTA、自治会、NPO等\n（会費中心）",
      category: "会員制組織 > 市民、友愛または社会団体",
      note: "会員向けの費用徴収が主目的であり、広義の市民・社会団体として扱うのが一般的。",
    },
    {
      community: "スポーツチーム、\nレクリエーション系サークル",
      category: "会員制組織 > 市民、友愛または社会団体",
      note: "メンバーシップに基づいた内部的な費用徴収が主であり、会員制組織としての分類が実態に一致しやすい。",
    },
    {
      community: "不特定多数向けの公開\nチケット販売が主な場合",
      category: "エンターテイメント、レクリエーション > イベントチケット代理店",
      note: "入場券や参加券の一般販売に該当する可能性が高い。",
    },
    {
      community: "個人のワークショップ・講座",
      category: "教育 > その他の教育サービス",
      note: "参加費を伴う講座やレッスン等の教育サービスとして分類するのが一般的。",
    },
    {
      community: "上記に当てはまらない・\n迷う場合",
      category: "近いグループの「その他」を選択\n（例：会員制組織 > その他）",
      note: "一覧にない場合は、最も近いカテゴリ内の「その他」を選択してください。",
    },
  ];

  const cardBaseStyles =
    "rounded-2xl border border-border/50 bg-white/50 backdrop-blur-[2px] shadow-[0_1px_1px_rgba(0,0,0,0.02),0_4px_12px_-4px_rgba(0,0,0,0.03)]";

  return (
    <div className="min-h-screen bg-slate-50/40">
      <GlobalHeader variant="minimal" />

      <main className="container mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <div className="space-y-12">
          {/* ナビゲーション & ヘッダー */}
          <div className="space-y-6">
            <Link
              href="/settings/payments"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>オンライン集金設定に戻る</span>
            </Link>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <HelpCircle className="size-4.5" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">設定に迷ったら</h1>
              </div>
              <p className="text-md leading-relaxed text-muted-foreground/85">
                Stripeアカウント作成時に入力する項目と設定の参考です。
                <br />
                スムーズなオンボーディングのために、以下のガイドを参考にしてください。
              </p>
            </div>
          </div>

          <div className="grid gap-12">
            {/* セクション1: ビジネスの詳細 */}
            <section className="space-y-4">
              <div className="flex items-center gap-2.5 mb-1 px-1">
                <Briefcase className="size-5 text-primary/70" />
                <h2 className="text-lg font-bold text-slate-800">「ビジネスの詳細」について</h2>
              </div>

              <Card className={cn(cardBaseStyles, "overflow-hidden")}>
                <CardHeader className="bg-slate-50/60 pb-5 pt-6 border-b border-border/40">
                  <CardTitle className="text-md font-bold">業種の選択</CardTitle>
                  <CardDescription className="text-sm">
                    コミュニティの活動内容に合わせて、最も近いものを選択してください。多くの場合、
                    <span className="font-bold text-slate-900 mx-1">「会員制組織」</span>
                    がカテゴリが該当します。
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/40">
                    {tableData.map((row, index) => (
                      <div
                        key={index}
                        className="group flex flex-col md:flex-row md:items-start gap-3 md:gap-6 p-5 transition-colors hover:bg-slate-50/40"
                      >
                        <div className="md:w-[28%]">
                          <p className="text-sm font-bold leading-relaxed whitespace-pre-line text-slate-800">
                            {row.community}
                          </p>
                        </div>
                        <div className="md:w-[35%]">
                          <code className="inline-block text-sm font-semibold text-primary bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
                            {row.category}
                          </code>
                        </div>
                        <div className="md:flex-1">
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {row.note}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-5 mt-6">
                <Card className={cardBaseStyles}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-md font-bold">ウェブサイト</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground leading-relaxed">
                    みんなの集金で公開しているコミュニティプロフィールのURLが自動入力されているので、そのまま次の項目に進んでください。
                  </CardContent>
                </Card>

                <Card className={cardBaseStyles}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-md font-bold">商品の説明</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-1">
                      どのような費用を受け取るのかを説明する項目です。
                    </p>
                    <div className="p-3 bg-secondary/5 border border-secondary/20 rounded-xl">
                      <p className="text-sm font-medium text-slate-700 mb-1">入力例</p>
                      <p className="text-sm text-slate-700 italic leading-relaxed">
                        「イベントを企画・運営しています。イベント管理プラットフォームの「みんなの集金」のシステムを利用して、イベント開催時の参加費や会費の事前決済を行います。」
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      ※
                      あらかじめ入力されていますが、ご自身の活動内容に合わせて自由に編集・追記してください。
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* セクション2: 事業形態 */}
            <section className="space-y-4">
              <div className="flex items-center gap-2.5 mb-1 px-1">
                <Building2 className="size-4 text-primary/70" />
                <h2 className="text-lg font-bold text-slate-800">事業形態の選択</h2>
              </div>

              <div className="grid gap-5">
                <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
                  <div className="relative flex gap-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                      <Info className="size-4" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm leading-relaxed text-blue-900 font-medium">
                        会費の徴収やサークル活動、単発のイベント開催など、法人格を持たないほとんどの場合は
                        <strong className="mx-1 font-bold decoration-blue-300 underline underline-offset-4">
                          「個人事業主」
                        </strong>
                        を選択してください。
                      </p>
                      <p className="text-sm text-blue-700/80">
                        営利目的でない活動でも、担当者個人の名義で登録を進めることができます。
                      </p>
                    </div>
                  </div>
                </div>

                <Card className={cn(cardBaseStyles, "bg-white/40")}>
                  <CardHeader className="pb-3 border-b border-border/30 mb-4 bg-slate-50/30">
                    <CardTitle className="text-md font-bold flex items-center gap-2">
                      法人や非営利組織の場合
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground leading-relaxed items-center gap-x-1.5 gap-y-2">
                      一般社団法人、NPO法人、株式会社などの法人格をお持ちの場合は、
                      <Badge
                        variant="secondary"
                        className="rounded-lg bg-slate-100 text-slate-700 border-none font-bold"
                      >
                        法人
                      </Badge>
                      または
                      <Badge
                        variant="secondary"
                        className="rounded-lg bg-slate-100 text-slate-700 border-none font-bold"
                      >
                        非営利組織
                      </Badge>
                      を選択して登録を進めてください。
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* フッターアクション */}
            <div className="flex flex-col items-center gap-6 pt-8 border-t border-border/40 pb-16">
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-100/50 text-xs sm:text-sm text-muted-foreground border border-slate-200/50">
                <Mail className="h-3.5 w-3.5" />
                <span>解決しない場合</span>
                <Link
                  href="/contact"
                  className="font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  お問い合わせはこちら
                </Link>
              </div>
              <Link
                href="/settings/payments"
                className="group flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                オンライン集金設定に戻る
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
