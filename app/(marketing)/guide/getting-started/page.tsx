import Link from "next/link";

import {
  ArrowRight,
  Banknote,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

import { GuideBottomCTA } from "../_components/GuideBottomCTA";

export const dynamic = "force-static";

const title = "主催者のはじめ方";
const description =
  "みんなの集金でイベントを作成し、招待リンクで出欠と集金を管理するまでの主催者向けスタートガイドです。";
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

type Feature = {
  title: string;
  body: string;
  icon: LucideIcon;
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
    body: "サークル、読書会、勉強会など、イベントを管理する単位を作成します。",
    detail:
      "コミュニティとは、イベントを束ねて管理する運営単位です。グループ名やサークル名などで作成します。コミュニティを複数作成して切り替えることもできます。",
    icon: ClipboardList,
  },
  {
    title: "イベントを作成して招待リンクを共有する",
    body: "イベント名、日時、出欠回答期限、参加費などを入力して作成します。発行された招待リンクをLINEやメールで共有すれば、参加者が回答を始められます。",
    detail:
      "オンライン集金を使う場合は、イベント作成前にオンライン集金設定を行います。設定はあとからでも可能です。",
    icon: CalendarPlus,
  },
];

const managementFeatures: Feature[] = [
  {
    title: "参加状況と集金状況の確認",
    body: "未定、未集金、現金で集金予定、オンライン集金済みなどを参加者リストでまとめて確認できます。必要に応じてCSVで参加者一覧も出力できます。",
    icon: CheckCircle2,
  },
  {
    title: "現金受領の記録",
    body: "現金で受け取った参加費は管理画面から受領済みに変更します。未払いだけの絞り込みやまとめて受領済みにする操作も可能です。",
    icon: Banknote,
  },
];

const scenarios: Feature[] = [
  {
    title: "現金集金だけで始める",
    body: "オンライン集金の設定は不要です。参加者一覧と現金受領の記録だけで運用できます。",
    icon: Banknote,
  },
  {
    title: "オンライン集金も使う",
    body: "オンライン集金を設定すると、参加者はカードやウォレットで事前に支払えます。",
    icon: CreditCard,
  },
  {
    title: "無料イベントを作る",
    body: "参加費を0円にすると、出欠確認と参加者リストの管理だけに使えます。",
    icon: CircleDollarSign,
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
      {body && <p className="mt-4 text-base leading-8 text-slate-600">{body}</p>}
    </div>
  );
}

export default function OrganizerGettingStartedPage() {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-slate-950">
      <section className="border-b border-slate-900/10 bg-[#f7f5f0]">
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8 lg:pb-24 lg:pt-32">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-primary">Organizer guide</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              主催者の
              <span className="text-primary">はじめ方</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-700">
              アカウント登録からイベント作成、招待リンクの共有まで。
              最初のイベントを作成するまでの流れをまとめました。
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="3 steps"
          title="3ステップで、最初のイベントを作成できます。"
          body=""
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
            eyebrow="After publishing"
            title="イベント公開後にできること。"
            body="参加状況と集金の管理は、イベントの管理画面から行います。"
          />

          <div className="grid gap-4">
            {managementFeatures.map((feature) => {
              const Icon = feature.icon;

              return (
                <article
                  key={feature.title}
                  className="grid gap-4 border border-slate-200 bg-[#f7f5f0] p-5 sm:grid-cols-[48px_minmax(0,1fr)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{feature.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Variations"
          title="現金集金だけでも、すぐに始められます。"
          body=""
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {scenarios.map((scenario) => {
            const Icon = scenario.icon;

            return (
              <article key={scenario.title} className="border border-slate-200 bg-white/70 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-950">{scenario.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{scenario.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-900/10 bg-[#e9f2ef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <SectionHeading eyebrow="Next" title="次に読む" body="" />

            <div>
              <Link
                href="/guide/participant-flow"
                className="group grid gap-3 border border-slate-900/10 bg-white/70 px-5 py-6 transition-colors hover:bg-white sm:grid-cols-[minmax(0,1fr)_32px] sm:items-center sm:px-7"
              >
                <span>
                  <span className="block text-lg font-bold text-slate-950">
                    参加者にはこう見えます
                  </span>
                  <span className="mt-2 block text-sm leading-7 text-slate-600">
                    招待リンクから出欠回答、ゲストページでの決済まで、参加者目線の流れを確認できます。
                  </span>
                </span>
                <ArrowRight
                  className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Link
                  href="/guide/online-collection"
                  className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-primary"
                >
                  オンライン集金のしくみ
                </Link>
                <Link
                  href="/guide/pricing-and-fees"
                  className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-primary"
                >
                  料金と手数料
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <GuideBottomCTA
        eyebrow="Start now"
        title="まずは、次のイベントを1つ作ってみる。"
        body="アカウント作成は無料です。3ステップで最初のイベントを公開できます。"
        secondaryHref={demoStartUrl}
        secondaryLabel="デモを試す"
      />
    </div>
  );
}
