import Link from "next/link";

import {
  ArrowRight,
  Banknote,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Link2,
  MailCheck,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

import { Button } from "@/components/ui/button";

import { GuideBottomCTA } from "../_components/GuideBottomCTA";

export const dynamic = "force-static";

const title = "主催者のはじめ方";
const description =
  "みんなの集金でイベントを作成し、招待リンクで出欠と集金を管理するまでの主催者向けスタートガイドです。現金集金だけで始める場合とオンライン集金を使う場合の違いも確認できます。";
const demoStartUrl = `${process.env.NEXT_PUBLIC_DEMO_URL || "https://demo.minnano-shukin.com"}/start-demo`;

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: getPublicUrl("/guide/getting-started"),
  },
  openGraph: buildOpenGraphMetadata({
    title: title,
    description,
    path: "/guide/getting-started",
  }),
};

type Step = {
  title: string;
  body: string;
  detail: string;
  icon: LucideIcon;
};

type Scenario = {
  title: string;
  body: string;
  icon: LucideIcon;
};

type GuideLink = {
  title: string;
  body: string;
  href: string;
};

const steps: Step[] = [
  {
    title: "アカウントを作成する",
    body: "LINE、Google、メールアドレスで主催者アカウントを作成します。",
    detail: "メールアドレスはログインや重要なお知らせに使います。",
    icon: UsersRound,
  },
  {
    title: "コミュニティを作成する",
    body: "サークル、読書会、勉強会など、イベントを管理する単位を登録します。",
    detail:
      "最初のコミュニティを作成します。コミュニティとは、イベントをまとめて管理するための運営単位です。グループ名、サークル名や勉強会名など、参加者に伝わる名前で作成します。コミュニティを複数作成して切り替えることもできます。",
    icon: ClipboardList,
  },
  {
    title: "必要な場合だけオンライン集金を設定する",
    body: "クレジットカード決済やApple Pay、Google Payによる集金を有効にしたい場合は設定を行います。",
    detail:
      "コミュニティの簡単な説明を入力後、本人確認書類と入金先口座を用意して、Stripeの安全な画面で進めます。設定はあとからでも可能です。",
    icon: ShieldCheck,
  },
  {
    title: "イベントを作成する",
    body: "イベント名、日時、申込締切、参加費、支払い方法を入力します。",
    detail:
      "有料イベントでは支払い方法を選びます。オンライン集金を選ぶ場合は、支払期限も設定します。無料イベントなら支払い設定は不要です。",
    icon: CalendarPlus,
  },
  {
    title: "招待リンクを共有する",
    body: "イベント作成後、管理画面で招待リンクを発行して参加者へ送ります。",
    detail:
      "LINEグループ、メール、チャットなど、いつもの連絡手段に貼るだけです。リンクが漏洩した場合は再生成することができます。古いリンクは使えなくなるので新しいリンクを案内してください。",
    icon: Link2,
  },
  {
    title: "参加状況と集金状況を見る",
    body: "参加者一覧で、出欠、支払い方法、支払い状況をまとめて確認します。",
    detail: "未回答、未払い、現金予定、オンライン支払い済みを一覧で追えます。",
    icon: CheckCircle2,
  },
  {
    title: "現金集金に対応する",
    body: "現金で受け取った参加費は、管理画面から受領済みに変更します。",
    detail:
      "集金したら「受領」を押下して集金済みにすることで現金集金を管理します。現金の未払いだけを絞り込んだり、まとめて受領済みにしたりできます。必要に応じてCSVで参加者一覧も出力できます。",
    icon: Banknote,
  },
];

const scenarios: Scenario[] = [
  {
    title: "現金集金だけで始める",
    body: "最短でイベント作成まで進めます。オンライン集金の設定は不要です。まず参加者一覧を作り、当日受け取った現金を受領済みにして管理します。",
    icon: Banknote,
  },
  {
    title: "オンライン集金も使う",
    body: "イベント作成前にオンライン集金を有効化します。参加者は招待リンクから支払い方法を選び、オンライン決済に進めます。",
    icon: CreditCard,
  },
  {
    title: "無料イベントを作る",
    body: "参加費を0円にすると、支払い方法の設定は不要です。出欠確認と参加者一覧の管理だけに使えます。",
    icon: CircleDollarSign,
  },
];

const eventFields = [
  "イベント名",
  "説明・備考（任意）",
  "場所（任意）",
  "定員（任意）",
  "開催日時",
  "出欠回答期限",
  "参加費",
  "支払い方法",
  "オンライン支払期限",
];

const guideLinks: GuideLink[] = [
  {
    title: "参加者の登録と支払いの流れ",
    body: "参加者に見える画面、入力項目、オンライン支払いまでの流れを確認できます。",
    href: "/guide/participant-flow",
  },
  {
    title: "オンライン集金・入金のしくみ",
    body: "カード決済、入金、Stripe設定の考え方を詳しく確認できます。",
    href: "/guide/online-collection",
  },
  {
    title: "料金と手数料",
    body: "主催者と参加者に関係する料金、手数料、受取額の見方を確認できます。",
    href: "/guide/pricing-and-fees",
  },
];

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-bold text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-8 text-slate-600">{body}</p>
    </div>
  );
}

export default function OrganizerGettingStartedPage() {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-slate-950">
      <section className="border-b border-slate-900/10 bg-[#f7f5f0]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8 lg:pb-24 lg:pt-32">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-primary">Organizer guide</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              主催者の
              <span className="text-primary">はじめ方</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-700">
              アカウント作成からイベント公開、招待リンクの共有、参加状況と集金状況の確認まで。
              最初のイベントを作る前に知っておきたい流れをまとめました。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-6">
                <Link href="/register">
                  無料ではじめる
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full border-slate-300 bg-white/60 px-6"
              >
                <Link href={demoStartUrl}>デモを試す</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="First run"
          title="最初のイベントは、この順番で作ります。"
          body="みんなの集金は、コミュニティを作ってからイベントを作成します。オンライン集金を使わない場合は、決済設定を飛ばしてすぐにイベント作成へ進めます。"
        />

        <div className="mt-12 divide-y divide-slate-900/10 border-y border-slate-900/10 bg-white/60">
          {steps.map((step, index) => {
            const Icon = step.icon;

            return (
              <article
                key={step.title}
                className="grid gap-5 px-5 py-7 sm:grid-cols-[72px_minmax(0,1fr)] sm:px-7 lg:grid-cols-[88px_minmax(0,280px)_minmax(0,1fr)] lg:items-start lg:px-8"
              >
                <div className="flex items-center gap-3 sm:block">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="font-mono text-sm font-bold text-primary sm:mt-3">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-bold leading-snug text-slate-950">{step.title}</h3>
                  <p className="mt-3 text-base leading-8 text-slate-700">{step.body}</p>
                </div>
                <p className="text-sm leading-7 text-slate-500 lg:pt-1">{step.detail}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-900/10 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Payment setup"
            title="まずは現金集金の管理に使ってみるのも。"
            body="現金だけのイベント、無料イベント、オンライン集金ありのイベント、様々対応できます。"
          />

          <div className="grid gap-4">
            {scenarios.map((scenario) => {
              const Icon = scenario.icon;

              return (
                <article
                  key={scenario.title}
                  className="grid gap-4 border border-slate-200 bg-[#f7f5f0] p-5 sm:grid-cols-[48px_minmax(0,1fr)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">{scenario.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{scenario.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.65fr)] lg:px-8 lg:py-24">
        <div>
          <SectionHeading
            eyebrow="Event form"
            title="イベント作成で決めること。"
            body="イベント作成フォームでは以下を入力することができます。"
          />
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {eventFields.map((field) => (
              <div
                key={field}
                className="flex items-center gap-3 border-b border-slate-900/10 py-3 text-sm font-semibold text-slate-800"
              >
                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                {field}
              </div>
            ))}
          </div>
        </div>

        <aside className="bg-slate-950 p-6 text-white sm:p-8">
          <MailCheck className="h-9 w-9 text-primary" aria-hidden="true" />
          <h3 className="mt-6 text-2xl font-bold leading-tight">
            招待リンクを送った後は、参加者が自分で回答します。
          </h3>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            参加者はリンクから、名前・ニックネーム、メールアドレス、参加ステータス、支払い方法を入力します。
            オンライン支払いを選んだ場合は、ゲストページから決済画面へ進めます。
          </p>
          <div className="mt-8 border-t border-white/15 pt-6">
            <p className="text-sm font-bold text-white">自動で届く案内</p>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              回答締切、支払期限、イベント前日のリマインド対象者には、参加者用URLを含むメールが送られます。
            </p>
          </div>
        </aside>
      </section>

      <section className="border-y border-slate-900/10 bg-[#e9f2ef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <SectionHeading eyebrow="Next guides" title="関連ガイド" body="" />

            <div className="divide-y divide-slate-900/10 border-y border-slate-900/10 bg-white/70">
              {guideLinks.map((guide) => (
                <Link
                  key={guide.href}
                  href={guide.href}
                  className="group grid gap-3 px-5 py-6 transition-colors hover:bg-white sm:grid-cols-[minmax(0,1fr)_32px] sm:items-center sm:px-7"
                >
                  <span>
                    <span className="block text-lg font-bold text-slate-950">{guide.title}</span>
                    <span className="mt-2 block text-sm leading-7 text-slate-600">
                      {guide.body}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <GuideBottomCTA
        eyebrow="Start now"
        title="まずは、次のイベントを1つ作ってみる。"
        body="現金集金だけでも始められます。オンライン集金は、必要なイベントが出てきたタイミングで設定できます。"
        secondaryHref={demoStartUrl}
        secondaryLabel="デモを試す"
      />
    </div>
  );
}
