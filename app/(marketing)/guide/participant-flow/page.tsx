import type { ReactNode } from "react";

import Link from "next/link";

import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CreditCard,
  Link2,
  MailCheck,
  ReceiptText,
  UserCheck,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

import { Button } from "@/components/ui/button";

import { GuideBottomCTA } from "../_components/GuideBottomCTA";

export const dynamic = "force-static";

const title = "参加者の登録と支払いの流れ";
const description =
  "みんなの集金で参加者が招待リンクから出欠を回答し、オンライン決済または現金払いを選び、ゲストページで支払い状況を確認するまでの流れをまとめました。";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: getPublicUrl("/guide/participant-flow"),
  },
  openGraph: buildOpenGraphMetadata({
    title: `${title} | みんなの集金`,
    description,
    path: "/guide/participant-flow",
  }),
};

type FlowStep = {
  title: string;
  body: string;
  detail: string;
  icon: LucideIcon;
};

type GuideLink = {
  title: string;
  body: string;
  href: string;
};

const flowSteps: FlowStep[] = [
  {
    title: "招待リンクを開く",
    body: "主催者から届いたリンクを開くと、イベントの参加登録ページが表示されます。",
    detail:
      "LINE、メール、チャットなど、共有されたリンクからそのままアクセスできます。ログインや会員登録は不要です。",
    icon: Link2,
  },
  {
    title: "イベント詳細を確認する",
    body: "日時、場所、参加費、出欠回答期限、定員、説明文を確認します。",
    detail:
      "オンライン決済を受け付けるイベントでは、オンライン支払い期限も表示されます。現金払いだけのイベントでは、現金での支払い案内に従います。",
    icon: CalendarClock,
  },
  {
    title: "出欠を回答する",
    body: "名前(ニックネーム)、メールアドレス、参加ステータスを入力します。",
    detail:
      "参加ステータスは「参加」「未定」「不参加」から選べます。「未定」は定員に含まれず、支払いも発生しません。",
    icon: UserCheck,
  },
  {
    title: "支払い方法を選ぶ",
    body: "有料イベントで参加する場合だけ、オンラインまたは現金を選びます。",
    detail:
      "表示される支払い方法はイベントごとに異なります。無料イベント、未定、不参加の場合は支払い方法の選択は不要です。",
    icon: ReceiptText,
  },
  {
    title: "登録完了メールを受け取る",
    body: "登録が完了すると、確認メールと個人用のゲストページURLが発行されます。",
    detail:
      "ゲストページURLは参加状況や支払い状況を確認するための個人用リンクです。第三者には共有しないでください。",
    icon: MailCheck,
  },
  {
    title: "ゲストページで決済・確認する",
    body: "オンライン決済を選んだ場合は、ゲストページのボタンからStripe Checkoutへ進みます。",
    detail:
      "支払い完了後は、ゲストページや支払い完了メールで状態を確認できます。現金払いの場合は、主催者へ直接支払います。",
    icon: CreditCard,
  },
  {
    title: "必要ならあとから変更する",
    body: "締切までは、ゲストページから出欠や支払い方法を変更できます。",
    detail:
      "出欠回答期限後、イベント中止後、支払い完了後などは変更できない場合があります。画面に表示される案内に従ってください。",
    icon: UserCog,
  },
];

const guideLinks: GuideLink[] = [
  {
    title: "主催者のはじめ方",
    body: "イベント作成、招待リンク共有、参加者一覧での確認までの主催者向け手順を確認できます。",
    href: "/guide/getting-started",
  },
  {
    title: "オンライン集金・入金のしくみ",
    body: "カード決済、Stripe、入金の考え方を詳しく確認できます。",
    href: "/guide/online-collection",
  },
  {
    title: "料金と手数料",
    body: "オンライン集金手数料や、参加者・主催者に関係する料金を確認できます。",
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

function PhoneFrame({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-[230px] rounded-[2rem] bg-slate-950 p-2 shadow-2xl ${className}`}>
      <div className="flex h-[420px] flex-col overflow-hidden rounded-[1.45rem] bg-slate-50">
        <div className="flex h-7 shrink-0 items-center justify-center border-b border-slate-900/5 bg-white">
          <span className="h-1.5 w-16 rounded-full bg-slate-200" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function InvitePhoneMock() {
  return (
    <PhoneFrame label="招待ページ">
      <div className="flex flex-1 flex-col text-[11px]">
        <div className="border-b border-slate-100 bg-white px-4 py-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
              募集中
            </span>
            <span className="text-[9px] font-medium text-slate-400">テニスサークル</span>
          </div>
          <h3 className="text-sm font-bold leading-tight text-slate-950">夏の納涼会</h3>
        </div>

        <div className="grid gap-2 bg-white px-4 py-3 text-slate-700">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>8月25日 18:00から</span>
          </div>
          <div className="flex items-center gap-2">
            <Banknote className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="font-bold">3,500円</span>
          </div>
        </div>

        <div className="h-2 bg-slate-100" />

        <div className="flex flex-1 flex-col bg-white px-4 py-3">
          <p className="mb-3 text-xs font-bold text-slate-800">参加登録</p>
          <div className="mb-2">
            <span className="mb-1 block text-[9px] font-bold text-slate-500">
              名前・ニックネーム
            </span>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-600">
              たなか
            </div>
          </div>
          <div className="mb-2">
            <span className="mb-1 block text-[9px] font-bold text-slate-500">出欠</span>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-lg border-2 border-primary bg-primary/10 p-1.5 text-center font-bold text-primary">
                参加
              </div>
              <div className="rounded-lg border border-slate-200 p-1.5 text-center text-slate-400">
                未定
              </div>
              <div className="rounded-lg border border-slate-200 p-1.5 text-center text-slate-400">
                不参加
              </div>
            </div>
          </div>
          <div className="mb-3">
            <span className="mb-1 block text-[9px] font-bold text-slate-500">支払い方法</span>
            <div className="mb-1 flex items-center gap-2 rounded-lg border-2 border-primary bg-primary/5 p-2 font-bold text-slate-800">
              <CreditCard className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              オンライン
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-slate-500">
              <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
              現金
            </div>
          </div>
          <div className="mt-auto flex items-center justify-center gap-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-white">
            登録する
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

function GuestPhoneMock() {
  return (
    <PhoneFrame label="ゲストページ" className="lg:-ml-12 lg:mt-16">
      <div className="flex flex-1 flex-col bg-slate-100 px-3 py-4 text-[11px]">
        <div className="overflow-hidden rounded-2xl shadow-md">
          <div className="bg-amber-500 px-5 py-5 text-center text-white">
            <CreditCard className="mx-auto mb-2 h-7 w-7" aria-hidden="true" />
            <p className="text-sm font-bold">参加予定・決済待ち</p>
            <p className="mt-1 text-[9px] opacity-90">決済を完了してください。</p>
            <div className="mx-auto mt-3 min-w-[138px] rounded-lg bg-white/20 px-4 py-2">
              <p className="text-[9px] opacity-80">参加費</p>
              <p className="font-mono text-xl font-bold">3,500円</p>
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase text-slate-400">Guest</p>
                <p className="truncate font-semibold text-slate-800">たなか</p>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase text-slate-400">Status</p>
                <p className="font-semibold text-slate-800">未払い</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold text-amber-700">
              ACTION
            </span>
            <span className="text-[10px] font-bold text-slate-700">決済が完了していません</span>
          </div>
          <div className="flex items-center justify-center gap-1 rounded-lg bg-slate-900 py-2.5 text-[10px] font-bold text-white">
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            オンライン決済へ進む
          </div>
          <p className="mt-1.5 text-center text-[8px] text-slate-400">
            Stripeの安全な決済ページへ移動します
          </p>
        </div>

        <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-600">
              ステータス・支払い方法の変更
            </span>
            <UserCog className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

function ParticipantFlowMockup() {
  return (
    <div className="relative">
      <div className="absolute inset-x-8 top-10 hidden h-24 rounded-full bg-primary/10 blur-3xl lg:block" />
      <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:justify-center lg:justify-end">
        <InvitePhoneMock />
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white shadow-xl sm:-mx-5 sm:mt-10">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </div>
        <GuestPhoneMock />
      </div>
    </div>
  );
}

export default function ParticipantFlowGuidePage() {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-slate-950">
      <section className="border-b border-slate-900/10 bg-[#f7f5f0]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(520px,1fr)] lg:px-8 lg:pb-12 lg:pt-32">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-primary">Participant guide</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              参加者の登録と
              <span className="text-primary">支払いの流れ</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-700">
              招待リンクを開いて、イベント内容を確認し、出欠を回答するまで。
              オンライン決済、現金払い、登録後の確認・変更までを参加者目線でまとめました。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-6">
                <Link href="/register">
                  主催者としてはじめる
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full border-slate-300 bg-white/60 px-6"
              >
                <Link href="/guide/getting-started">主催者ガイドを見る</Link>
              </Button>
            </div>
          </div>

          <ParticipantFlowMockup />
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Registration flow"
          title="招待リンクから、ゲストページまで。"
          body="参加者が操作する画面は、招待ページとゲストページの2つです。まず招待ページで回答し、登録後に発行されるゲストページで支払い状況の確認やオンライン決済を行います。"
        />

        <div className="mt-12 divide-y divide-slate-900/10 border-y border-slate-900/10 bg-white/60">
          {flowSteps.map((step, index) => {
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

      <section className="bg-[#e9f2ef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24 grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
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
                  <span className="mt-2 block text-sm leading-7 text-slate-600">{guide.body}</span>
                </span>
                <ArrowRight
                  className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <GuideBottomCTA
        eyebrow="Share the link"
        title="参加者には、招待リンクを送るだけ。"
        body="回答、支払い方法の選択、ゲストページでの確認まで、参加者自身で進められます。主催者は参加者一覧で出欠と支払い状況をまとめて確認できます。"
        secondaryHref="/guide/getting-started"
        secondaryLabel="主催者ガイドを見る"
      />
    </div>
  );
}
