import Link from "next/link";

import {
  ArrowRight,
  BanknoteArrowDown,
  Clock,
  CreditCard,
  FileText,
  Landmark,
  ReceiptText,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

import { GuideBottomCTA } from "../_components/GuideBottomCTA";

export const dynamic = "force-static";

const title = "オンライン集金・振込のしくみ";
const description =
  "みんなの集金でオンライン決済を受け付けたときのお金の流れ、振込操作、振込タイミングの目安を主催者向けにまとめました。";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: getPublicUrl("/guide/online-collection"),
  },
  openGraph: buildOpenGraphMetadata({
    title: `${title} | みんなの集金`,
    description,
    path: "/guide/online-collection",
  }),
};

type FlowStep = {
  title: string;
  body: string;
  icon: LucideIcon;
};

type PayoutItem = {
  title: string;
  body: string;
  icon: LucideIcon;
};

type PrepareItem = {
  label: string;
  body: string;
};

const prepareItems: PrepareItem[] = [
  {
    label: "本人確認書類",
    body: "運転免許証やマイナンバーカードなど、Stripeが受け付ける本人確認書類。",
  },
  {
    label: "振込先銀行口座",
    body: "集金した参加費を受け取る銀行口座。",
  },
  {
    label: "コミュニティの説明",
    body: "コミュニティの簡単な説明文。",
  },
];

const flowSteps: FlowStep[] = [
  {
    title: "参加者がオンラインで支払う",
    body: "参加者はゲストページからStripeの決済画面へ進み、カードやウォレットで支払います。カード情報は当サービスでは保持しません。",
    icon: CreditCard,
  },
  {
    title: "支払い状況が自動で反映される",
    body: "決済が完了すると、参加者リストやゲストページの支払い状況が自動で更新されます。",
    icon: ReceiptText,
  },
  {
    title: "Stripe残高に反映される",
    body: "集金分は主催者のStripeアカウント残高に反映されます。決済直後は処理中の残高として扱われ、Stripe側の処理後に振込可能残高へ移ります。",
    icon: Wallet,
  },
  {
    title: "集金を引き出す",
    body: "振込可能残高になったら、振込操作画面から登録済みの銀行口座へ振り込みます。",
    icon: BanknoteArrowDown,
  },
];

const payoutItems: PayoutItem[] = [
  {
    title: "振込タイミング",
    body: "通常、決済完了から数営業日で振込可能残高になります。振込申請から口座着金までは数営業日程度です。初回振込は7〜14日程度が目安です。銀行営業日やStripeの状況によって前後します。",
    icon: Clock,
  },
  {
    title: "残高と振込の確認",
    body: "振込可能額、処理中の残高、振込履歴などの詳細をStripeダッシュボードで確認できます。振込操作はアプリ内から行うことができます。",
    icon: Landmark,
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

export default function OnlineCollectionGuidePage() {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-slate-950">
      <section className="border-b border-slate-900/10 bg-[#f7f5f0]">
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8 lg:pb-24 lg:pt-32">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-primary">Online collection</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              オンライン集金・
              <span className="text-primary">振込のしくみ</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-700">
              参加者がオンラインで支払った参加費が、主催者の銀行口座に届くまでの流れをまとめました。
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-900/10 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
          <div>
            <SectionHeading
              eyebrow="Setup"
              title="オンライン集金設定の準備"
              body="オンライン集金設定を行うと、イベントでオンラインで参加費を受け付けられるようになります。この設定で、集金を受け取るのためのStripeアカウントを作成します。以下を用意してください。"
            />
          </div>

          <div className="grid gap-3">
            {prepareItems.map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-4 border-b border-slate-900/10 py-5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-950">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.body}</p>
                </div>
              </div>
            ))}
            <p className="text-sm leading-7 text-slate-500">
              Stripeの安全な画面で入力します。設定はイベント作成前でも、あとからでも可能です。
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Money flow"
          title="支払いから振込までの流れ"
          body=""
        />

        <div className="mt-12 divide-y divide-slate-900/10 border-y border-slate-900/10 bg-white/60">
          {flowSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <article
                key={step.title}
                className="grid gap-5 px-5 py-7 sm:grid-cols-[72px_minmax(0,1fr)] sm:px-7 lg:items-start lg:px-8"
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
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-900/10 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Payout"
            title="振込のタイミングと確認"
            body=""
          />

          <div className="grid gap-4">
            {payoutItems.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className="grid gap-4 border border-slate-200 bg-[#f7f5f0] p-5 sm:grid-cols-[48px_minmax(0,1fr)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-900/10 bg-[#e9f2ef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <SectionHeading eyebrow="Next" title="次に読む" body="" />

            <div>
              <Link
                href="/guide/pricing-and-fees"
                className="group grid gap-3 border border-slate-900/10 bg-white/70 px-5 py-6 transition-colors hover:bg-white sm:grid-cols-[minmax(0,1fr)_32px] sm:items-center sm:px-7"
              >
                <span>
                  <span className="block text-lg font-bold text-slate-950">
                    料金と手数料を確認する
                  </span>
                  <span className="mt-2 block text-sm leading-7 text-slate-600">
                    オンライン集金手数料の計算例と受取目安を確認できます。
                  </span>
                </span>
                <ArrowRight
                  className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Link
                  href="/guide/getting-started"
                  className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-primary"
                >
                  主催者のはじめ方
                </Link>
                <Link
                  href="/guide/participant-flow"
                  className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-primary"
                >
                  参加者の登録と支払いの流れ
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <GuideBottomCTA
        eyebrow="Start online collection"
        title="オンライン集金は、必要なイベントから始められます。"
        body="オンライン集金を設定すれば、参加費の事前回収と出欠管理をまとめて行えます。"
        secondaryHref="/guide/pricing-and-fees"
        secondaryLabel="料金と手数料を見る"
      />
    </div>
  );
}
