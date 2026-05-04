import Link from "next/link";

import {
  ArrowRight,
  BanknoteArrowDown,
  Clock,
  CreditCard,
  Landmark,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

import { Button } from "@/components/ui/button";

export const dynamic = "force-static";

const title = "オンライン集金・入金のしくみ";
const description =
  "みんなの集金でオンライン決済を受け付けたときのお金の流れ、Stripeの売上・入金確認画面での手動入金、入金タイミングの目安を主催者向けにまとめました。";

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
  detail: string;
  icon: LucideIcon;
};

type DashboardItem = {
  title: string;
  body: string;
  icon: LucideIcon;
};

type GuideLink = {
  title: string;
  body: string;
  href: string;
};

const flowSteps: FlowStep[] = [
  {
    title: "オンライン集金を有効にする",
    body: "主催者がStripe連携を完了すると、イベントでオンライン決済を選べるようになります。",
    detail:
      "コミュニティの説明を入力後、本人確認情報、入金先銀行口座、コミュニティ情報をStripeの安全な画面で登録します。",
    icon: ShieldCheck,
  },
  {
    title: "参加者がオンラインで支払う",
    body: "参加者はゲストページからStripeの決済画面へ進み、カードやウォレットで支払います。",
    detail: "決済画面と決済処理はStripeが提供します。カード情報は当サービスでは保持しません。",
    icon: CreditCard,
  },
  {
    title: "支払い状況が反映される",
    body: "決済が完了すると、参加者一覧やゲストページの支払い状況が更新されます。",
    detail: "オンラインでの集金は集金状況が自動で更新されます。",
    icon: ReceiptText,
  },
  {
    title: "Stripe残高を確認する",
    body: "オンライン集金分は、主催者用のStripeアカウントの残高として確認できます。",
    detail:
      "残高には、すぐ入金できる金額と、まだ処理中の金額があります。入金操作前にStripeの売上・入金確認画面で状態を確認します。",
    icon: Wallet,
  },
  {
    title: "口座に入金する",
    body: "利用可能残高になったら、Stripeの売上・入金確認画面で入金操作を行います。",
    detail:
      "みんなの集金の管理画面にあるリンクからStripeダッシュボードへ移動し、主催者自身が入金先口座への入金を実行します。",
    icon: BanknoteArrowDown,
  },
];

const timingNotes = [
  {
    title: "決済直後に銀行へ入るわけではありません",
    body: "支払い完了後、Stripe側で売上処理が行われ、残高が利用可能になるまで待つ必要があります。",
  },
  {
    title: "初回入金は7〜14日程度が目安です",
    body: "初めてオンライン集金を使う場合、本人確認や口座確認のため、通常より時間がかかることがあります。",
  },
  {
    title: "2回目以降も状況により変わります",
    body: "入金タイミングはStripeの処理状況、銀行営業日、追加確認の有無によって前後します。",
  },
];

const dashboardItems: DashboardItem[] = [
  {
    title: "残高と入金可能額",
    body: "現在の残高、利用可能になった金額、まだ処理中の金額を確認します。",
    icon: Wallet,
  },
  {
    title: "入金予定と入金履歴",
    body: "銀行口座への入金予定日や、過去の入金履歴を確認します。",
    icon: Clock,
  },
  {
    title: "支払い履歴",
    body: "参加者のオンライン決済がStripe上でどのように処理されたかを確認します。",
    icon: ReceiptText,
  },
  {
    title: "銀行口座と追加確認",
    body: "入金先口座や、Stripeから求められている追加確認事項を確認します。",
    icon: Landmark,
  },
];

const guideLinks: GuideLink[] = [
  {
    title: "主催者のはじめ方",
    body: "イベント作成、招待リンク共有、参加者一覧での確認までの主催者向け手順を確認できます。",
    href: "/guide/getting-started",
  },
  {
    title: "参加者の登録と支払いの流れ",
    body: "参加者に見える画面、入力項目、オンライン支払いまでの流れを確認できます。",
    href: "/guide/participant-flow",
  },
  {
    title: "料金と手数料",
    body: "オンライン決済時の手数料や、受取額の見方を確認できます。",
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

export default function OnlineCollectionGuidePage() {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-slate-950">
      <section className="border-b border-slate-900/10 bg-[#f7f5f0]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,0.7fr)] lg:px-8 lg:pb-24 lg:pt-32">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-primary">Online collection</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              オンライン集金・
              <span className="text-primary">入金のしくみ</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-700">
              参加者がオンラインで支払った参加費は、Stripeを通じて主催者の残高に反映されます。
              銀行口座への入金は、主催者がStripeの売上・入金確認画面で手動で行います。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-6">
                <Link href="/register">
                  オンライン集金を始める
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
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Money flow"
          title="参加者の支払いから、主催者の入金操作まで。"
          body="オンライン集金では、参加者の支払い、みんなの集金上の支払い状況、Stripe上の残高、銀行口座への入金を分けて考えると流れを理解しやすくなります。"
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

      <section className="border-y border-slate-900/10 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Payout timing"
            title="Stripe残高と銀行口座への入金"
            body="オンライン決済が完了しても、すぐに銀行口座へ入るわけではありません。Stripe上で残高が利用可能になってから、主催者が入金操作を行います。"
          />

          <div className="grid gap-4">
            {timingNotes.map((note, index) => (
              <article
                key={note.title}
                className="grid gap-4 border border-slate-200 bg-[#f7f5f0] p-5 sm:grid-cols-[48px_minmax(0,1fr)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-bold text-primary">
                    Timing {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-950">{note.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{note.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6　lg:px-8 lg:py-24">
        <div>
          <SectionHeading
            eyebrow="Payout dashboard"
            title="売上と入金は、Stripeで確認します。"
            body="みんなの集金の管理画面からStripeの売上・入金確認画面へ移動すると、オンライン集金分の残高、入金、支払い履歴を確認できます。"
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {dashboardItems.map((item) => {
              const Icon = item.icon;

              return (
                <article key={item.title} className="border-b border-slate-900/10 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <h3 className="text-base font-bold text-slate-950">{item.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.body}</p>
                </article>
              );
            })}
          </div>
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

      <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-bold text-primary">Start online collection</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              オンライン集金は、必要なイベントから始められます。
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-300">
              現金集金と併用しながら、参加費の事前回収と入金管理をStripeでまとめて確認できます。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
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
              className="h-12 rounded-full border-white/20 bg-transparent px-6 text-white hover:bg-white hover:text-slate-950"
            >
              <Link href="/guide/participant-flow">参加者の流れを見る</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
