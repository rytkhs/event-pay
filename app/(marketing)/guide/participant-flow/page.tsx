import type { ReactNode } from "react";

import Link from "next/link";

import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CreditCard,
  Link2,
  Mail,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

import { GuideBottomCTA } from "../_components/GuideBottomCTA";

export const dynamic = "force-static";

const title = "参加者の登録と支払いの流れ";
const description =
  "みんなの集金で参加者が招待リンクから出欠を回答し、ゲストページで決済・確認するまでの流れをまとめました。";

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

type Phase = {
  eyebrow: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  points: { label: string; body: string }[];
};

type AutoEmail = {
  label: string;
  body: string;
};

const phases: Phase[] = [
  {
    eyebrow: "招待ページ",
    title: "リンクを開いて、出欠と支払い方法を回答する。",
    summary:
      "主催者から届いたリンクを開くと、イベントの参加登録ページが表示されます。ログインや会員登録は不要です。",
    icon: Link2,
    points: [
      {
        label: "イベント内容の確認",
        body: "日時、場所、参加費、出欠回答期限、定員を確認します。",
      },
      {
        label: "出欠の回答",
        body: "名前（ニックネーム）、メールアドレス、参加ステータス（参加・未定・不参加）を回答します。",
      },
      {
        label: "支払い方法の選択",
        body: "有料イベントに参加する場合、オンラインまたは現金を選びます。無料イベントや不参加の場合は不要です。",
      },
    ],
  },
  {
    eyebrow: "ゲストページ",
    title: "決済と変更は、ゲストページから。",
    summary:
      "登録完了後に届くメールに含まれる個人用URLからアクセスします。第三者には共有しないでください。",
    icon: UserCog,
    points: [
      {
        label: "オンライン決済",
        body: "オンライン支払いを選んだ場合は、ボタンからStripeの決済ページへ進みます。支払い完了後は状態が自動で更新されます。",
      },
      {
        label: "状況の確認",
        body: "支払い状況や参加ステータスをいつでも確認できます。",
      },
      {
        label: "出欠・支払い方法の変更",
        body: "回答期限までは出欠や支払い方法を変更できます。変更できない場合は画面に案内が表示されます。",
      },
    ],
  },
];

const autoEmails: AutoEmail[] = [
  { label: "登録完了", body: "ゲストページURLを含む確認メール" },
  { label: "出欠回答期限リマインド", body: "回答期限が近い未回答者へ" },
  { label: "支払い期限リマインド", body: "支払い期限が近い未払い者へ" },
  { label: "イベント前日リマインド", body: "参加予定者へ" },
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
            {/* <p className="mt-1 text-[9px] opacity-90">決済を完了してください。</p> */}
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
                <p className="text-[8px] font-bold uppercase text-slate-400">Mail</p>
                <p className="font-semibold text-slate-800">ta***.com</p>
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
              参加者が操作する画面は、招待ページとゲストページの2つです。
              それぞれの画面で何ができるかをまとめました。
            </p>
          </div>

          <ParticipantFlowMockup />
        </div>
      </section>

      {phases.map((phase) => {

        return (
          <section key={phase.eyebrow} className="border-b border-slate-900/10">
            <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
              <div>
                <SectionHeading eyebrow={phase.eyebrow} title={phase.title} body={phase.summary} />
              </div>

              <div className="grid gap-4">
                {phase.points.map((point) => (
                  <article
                    key={point.label}
                    className="border border-slate-200 bg-white/70 p-5"
                  >
                    <h3 className="text-base font-bold text-slate-950">{point.label}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{point.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <section className="border-b border-slate-900/10 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Auto emails"
            title="自動で届くメール"
            body="参加者には、以下のタイミングでゲストページURLを含むメールが届きます。"
          />

          <div className="grid gap-3">
            {autoEmails.map((email) => (
              <div
                key={email.label}
                className="flex items-center gap-4 border-b border-slate-900/10 py-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-950">{email.label}</p>
                  <p className="text-sm text-slate-500">{email.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-900/10 bg-[#e9f2ef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <SectionHeading eyebrow="Next" title="次に読む" body="" />

            <div>
              <Link
                href="/guide/getting-started"
                className="group grid gap-3 border border-slate-900/10 bg-white/70 px-5 py-6 transition-colors hover:bg-white sm:grid-cols-[minmax(0,1fr)_32px] sm:items-center sm:px-7"
              >
                <span>
                  <span className="block text-lg font-bold text-slate-950">
                    主催者として始める
                  </span>
                  <span className="mt-2 block text-sm leading-7 text-slate-600">
                    アカウント作成からイベント公開までの主催者向け手順を確認できます。
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
        eyebrow="Share the link"
        title="参加者には、招待リンクを送るだけ。"
        body="回答から決済まで、参加者自身で進められます。主催者は管理画面で状況をまとめて確認できます。"
        secondaryHref="/guide/getting-started"
        secondaryLabel="主催者ガイドを見る"
      />
    </div>
  );
}
