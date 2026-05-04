import Link from "next/link";

import { ArrowLeft, Building2, Briefcase, Info, Mail } from "lucide-react";
import type { Metadata } from "next";

import { GlobalHeader } from "@/components/layout/GlobalHeader/GlobalHeader";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "設定に迷ったら",
  description: "Stripe設定時に入力する項目と回答の参考",
};

export default function OnboardingGuidePage() {
  const tableData = [
    {
      community: "大学・社会人サークル、勉強会、技術コミュニティ",
      category: "会員制組織 > 市民、友愛または社会団体",
      note: "会費や参加費が中心の運営であり、社会的な任意団体としての実態に最も近い。",
    },
    {
      community: "PTA、自治会、NPO等（会費中心）",
      category: "会員制組織 > 市民、友愛または社会団体",
      note: "会員向けの費用徴収が主目的であり、広義の市民・社会団体として扱うのが一般的。",
    },
    {
      community: "スポーツチーム、レクリエーション系サークル",
      category: "会員制組織 > 市民、友愛または社会団体",
      note: "メンバーシップに基づいた内部的な費用徴収が主であり、会員制組織としての分類が実態に一致しやすい。",
    },
    {
      community: "不特定多数向けの公開チケット販売が主な場合",
      category: "エンターテイメント、レクリエーション > イベントチケット代理店",
      note: "入場券や参加券の一般販売に該当する可能性が高い。",
    },
    {
      community: "個人のワークショップ・講座",
      category: "教育 > その他の教育サービス",
      note: "参加費を伴う講座やレッスン等の教育サービスとして分類するのが一般的。",
    },
    {
      community: "上記に当てはまらない・迷う場合",
      category: "近いグループの「その他」を選択（例：会員制組織 > その他）",
      note: "一覧にない場合は、最も近いカテゴリ内の「その他」を選択してください。",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50/40">
      <GlobalHeader variant="minimal" />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        {/* ナビゲーション */}
        <Link
          href="/settings/payments"
          className="group mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          オンライン集金設定に戻る
        </Link>

        {/* ヘッダー */}
        <header className="mb-12">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">設定に迷ったら</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Stripeアカウント作成時に入力する項目と設定の参考です。
          </p>
        </header>

        <div className="space-y-14">
          {/* セクション1: ビジネスの詳細 */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Briefcase className="size-4 text-muted-foreground" />
              <h2 className="text-base font-bold text-slate-800">「ビジネスの詳細」について</h2>
            </div>

            {/* 業種の選択 */}
            <div className="mb-8">
              <h3 className="text-sm font-bold text-slate-700 mb-1">業種の選択</h3>
              <p className="text-sm text-muted-foreground mb-4">
                コミュニティの活動内容に合わせて、最も近いものを選択してください。多くの場合、
                <strong className="text-slate-800 mx-0.5">「会員制組織」</strong>
                カテゴリが該当します。
              </p>

              <div className="rounded-xl border border-border/60 overflow-hidden">
                {/* テーブルヘッダー（デスクトップ） */}
                <div className="hidden md:grid md:grid-cols-[1fr_1.4fr_1fr] gap-4 px-4 py-2.5 bg-slate-100/70 text-xs font-medium text-muted-foreground border-b border-border/40">
                  <span>コミュニティ</span>
                  <span>選択するカテゴリ</span>
                  <span>補足</span>
                </div>

                <div className="divide-y divide-border/40">
                  {tableData.map((row, index) => (
                    <div
                      key={index}
                      className="flex flex-col md:grid md:grid-cols-[1fr_1.4fr_1fr] gap-2 md:gap-4 px-4 py-3.5 text-sm hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="font-medium text-slate-800 leading-snug">{row.community}</div>
                      <div>
                        <code className="text-[13px] text-primary/90 bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                          {row.category}
                        </code>
                      </div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        {row.note}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ウェブサイト */}
            <div className="mb-6">
              <h3 className="text-sm font-bold text-slate-700 mb-1">ウェブサイト</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                みんなの集金で公開しているコミュニティプロフィールのURLが自動入力されているので、そのまま次の項目に進んでください。
              </p>
            </div>

            {/* 商品の説明 */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-1">商品の説明</h3>
              <p className="text-sm text-muted-foreground mb-3">
                どのような費用を受け取るのかを説明する項目です。
              </p>
              <div className="rounded-lg border border-border/50 bg-slate-50/50 px-4 py-3 mb-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">入力例</p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  「イベントを企画・運営しています。イベント管理プラットフォームの「みんなの集金」のシステムを利用して、イベント開催時の参加費や会費の事前決済を行います。」
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                ※
                あらかじめ入力されていますが、ご自身の活動内容に合わせて自由に編集・追記してください。
              </p>
            </div>
          </section>

          <hr className="border-border/40" />

          {/* セクション2: 事業形態 */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Building2 className="size-4 text-muted-foreground" />
              <h2 className="text-base font-bold text-slate-800">事業形態の選択</h2>
            </div>

            {/* メインの推奨 */}
            <div className="rounded-xl border border-blue-200/70 bg-blue-50/50 px-5 py-4 mb-6">
              <div className="flex gap-3">
                <Info className="size-4 shrink-0 text-blue-600 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="text-sm leading-relaxed text-blue-900">
                    会費の徴収やサークル活動、単発のイベント開催など、法人格を持たないほとんどの場合は
                    <strong className="mx-0.5 font-bold underline underline-offset-4 decoration-blue-300">
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

            {/* 法人の場合 */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-1.5">法人や非営利組織の場合</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                一般社団法人、NPO法人、株式会社などの法人格をお持ちの場合は、
                <Badge
                  variant="secondary"
                  className="rounded bg-slate-100 text-slate-700 border-none font-bold mx-0.5"
                >
                  法人
                </Badge>
                または
                <Badge
                  variant="secondary"
                  className="rounded bg-slate-100 text-slate-700 border-none font-bold mx-0.5"
                >
                  非営利組織
                </Badge>
                を選択して登録を進めてください。
              </p>
            </div>
          </section>
        </div>

        {/* フッター */}
        <footer className="mt-16 pt-8 border-t border-border/40 pb-12">
          <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              <span>解決しない場合</span>
              <Link
                href="/contact"
                className="font-medium text-primary hover:text-primary/80 transition-colors"
              >
                お問い合わせはこちら
              </Link>
            </div>
            <Link
              href="/settings/payments"
              className="group flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
              オンライン集金設定に戻る
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
