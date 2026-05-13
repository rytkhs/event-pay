import type { ReactNode } from "react";

import Link from "next/link";

import {
  ArrowLeft,
  Building2,
  Briefcase,
  CheckCircle2,
  FileText,
  Info,
  Mail,
  SearchX,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { GlobalHeader } from "@/components/layout/GlobalHeader/GlobalHeader";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "設定に迷ったら",
  description: "オンライン集金設定で必要な情報とStripe設定時に入力する項目の参考",
};

type GuideSectionProps = {
  children: ReactNode;
  icon: LucideIcon;
  id?: string;
  title: string;
};

function GuideSection({ children, icon: Icon, id, title }: GuideSectionProps) {
  return (
    <section
      id={id}
      className="scroll-mt-24 grid gap-6 border-t border-border/50 py-10 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-10"
    >
      <div className="flex items-center gap-1 lg:items-start">
        <Icon className="mt-0.5 size-4 text-muted-foreground" />
        <h2 className="text-base font-bold text-slate-900 lg:text-sm">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

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
  const profilePoints = [
    {
      icon: ShieldCheck,
      title: "オンライン集金の確認用です",
      body: "Stripeの確認で必要になるため、みんなの集金がコミュニティ作成時にURLを自動生成します。",
    },
    {
      icon: SearchX,
      title: "検索エンジンには登録されません",
      body: "プロフィールページは検索結果に出ません。URLを知っている人だけアクセスできます。広く参加者を募集するページではありません。",
    },
  ];
  const descriptionExamples = [
    {
      label: "読書会",
      text: "月に1〜2回活動している読書コミュニティです。参加者同士で本の感想や学びを共有するイベントを開催しています。",
    },
    // {
    //   label: "スポーツサークル",
    //   text: "社会人向けのスポーツサークルです。定期的な練習会や交流イベントを開催しており、会場費や参加費の集金に、みんなの集金を利用しています。",
    // },
    // {
    //   label: "大学サークル",
    //   text: "大学内のサークル活動として、定期イベントや交流会を開催しています。イベント参加費や活動費の支払い受付に、みんなの集金を利用しています。",
    // },
  ];
  const writeGuidance = [
    "どのようなコミュニティか",
    "主にどのようなイベントや活動を行うか",
    "主にどのような費用を集金するか",
  ];

  return (
    <div className="min-h-screen bg-slate-50/40">
      <GlobalHeader variant="minimal" />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <Link
          href="/settings/payments"
          className="group mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          オンライン集金設定に戻る
        </Link>

        <header className="mb-4 max-w-2xl pb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            設定に迷ったら
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            オンライン集金設定で必要な情報と、Stripeアカウント作成時に迷いやすい項目の参考です。
          </p>
        </header>

        <div>
          <GuideSection icon={CheckCircle2} title="必要な情報">
            <div className="divide-y divide-border/50 border-y border-border/50">
              {[
                {
                  title: "本人確認情報",
                  body: "Stripeの安全な画面で、本人確認に必要な情報を入力します。",
                },
                {
                  title: "振込先口座",
                  body: "オンライン集金した金額を受け取る銀行口座を登録します。",
                },
                {
                  title: "コミュニティ情報",
                  body: "活動内容や集金内容を確認できるプロフィール情報を使います。",
                },
              ].map((item) => (
                <div key={item.title} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr]">
                  <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                  <p className="text-sm leading-7 text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </GuideSection>

          <GuideSection id="community-profile" icon={FileText} title="コミュニティプロフィール">
            <div className="max-w-2xl">
              <p className="text-sm leading-7 text-slate-700">
                オンライン集金を利用する場合、Stripe設定でウェブサイトのURLが必要になります。
                みんなの集金では、コミュニティ作成時にコミュニティプロフィールのURLを自動で作成しています。
              </p>

              <div className="mt-6 divide-y divide-border/50 border-y border-border/50">
                {profilePoints.map((point) => {
                  const Icon = point.icon;
                  return (
                    <div key={point.title} className="grid gap-3 py-4 sm:grid-cols-[28px_1fr]">
                      <Icon className="mt-0.5 size-4 text-primary" />
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-900">{point.title}</h3>
                        <p className="text-sm leading-7 text-muted-foreground">{point.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-7 border-l-2 border-primary pl-4">
                <h3 className="text-sm font-bold text-slate-900">コミュニティ説明とは</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  コミュニティ説明は、コミュニティプロフィールに表示される説明文です。
                  オンライン集金設定で必要になります。
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  現金集金だけを利用する場合は入力不要です。 説明文はあとから変更できます。
                </p>
              </div>
            </div>

            <div className="mt-10">
              <h3 className="text-sm font-bold text-slate-700 mb-3">入力例</h3>
              <div className="divide-y divide-border/50 border-y border-border/50">
                {descriptionExamples.map((example) => (
                  <div key={example.label} className="grid gap-2 py-4 sm:grid-cols-[120px_1fr]">
                    <p className="text-xs font-bold text-primary">{example.label}</p>
                    <p className="text-sm leading-7 text-slate-700">{example.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <ul className="mt-3 space-y-2">
                {writeGuidance.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </GuideSection>

          <GuideSection icon={Briefcase} title="Stripe入力">
            <div className="mb-8">
              <h3 className="text-sm font-bold text-slate-700 mb-1">業種の選択</h3>
              <p className="text-sm leading-7 text-muted-foreground mb-4">
                コミュニティの活動内容に合わせて、最も近いものを選択してください。多くの場合、
                <strong className="text-slate-800 mx-0.5">「会員制組織」</strong>
                カテゴリが該当します。
              </p>

              <div className="overflow-hidden border-y border-border/60">
                <div className="hidden gap-4 border-b border-border/40 py-2.5 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[1fr_1.4fr_1fr]">
                  <span>コミュニティ</span>
                  <span>選択するカテゴリ</span>
                  <span>補足</span>
                </div>

                <div className="divide-y divide-border/40">
                  {tableData.map((row, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-2 py-3.5 text-sm transition-colors hover:bg-slate-100/50 md:grid md:grid-cols-[1fr_1.4fr_1fr] md:gap-4"
                    >
                      <div className="font-medium text-slate-800 leading-snug">{row.community}</div>
                      <div>
                        <code className="text-[13px] text-primary/90">{row.category}</code>
                      </div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        {row.note}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="divide-y divide-border/50 border-y border-border/50">
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]">
                <h3 className="text-sm font-bold text-slate-900">ウェブサイト</h3>
                <p className="text-sm leading-7 text-muted-foreground">
                  コミュニティプロフィールのURLが自動入力されます。通常は変更せず、そのまま次の項目に進んでください。
                </p>
              </div>

              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]">
                <h3 className="text-sm font-bold text-slate-900">商品の説明</h3>
                <div>
                  <p className="text-sm leading-7 text-muted-foreground">
                    Stripe画面で、どのような費用を受け取るのかを説明する項目です。
                  </p>
                  <p className="mt-3 border-l border-border pl-3 text-sm leading-7 text-slate-700">
                    「イベントを企画・運営しています。イベント管理プラットフォームの「みんなの集金」のシステムを利用して、イベント開催時の参加費や会費の事前決済を行います。」
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    あらかじめ入力されていますが、ご自身の活動内容に合わせて自由に編集・追記してください。
                  </p>
                </div>
              </div>
            </div>
          </GuideSection>

          <GuideSection icon={Building2} title="事業形態">
            <div className="border-l-2 border-primary pl-4">
              <div className="flex gap-3">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="space-y-2">
                  <p className="text-sm leading-7 text-slate-800">
                    会費の徴収やサークル活動、単発のイベント開催など、法人格を持たないほとんどの場合は
                    <strong className="mx-0.5 font-bold underline underline-offset-4 decoration-primary/30">
                      「個人事業主」
                    </strong>
                    を選択してください。
                  </p>
                  <p className="text-sm leading-7 text-muted-foreground">
                    営利目的でない活動でも、担当者個人の名義で登録を進めることができます。
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-7">
              <h3 className="text-sm font-bold text-slate-700 mb-1.5">法人や非営利組織の場合</h3>
              <p className="text-sm text-muted-foreground leading-7">
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
          </GuideSection>
        </div>

        <footer className="border-t border-border/50 pb-12 pt-8">
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
