import Link from "next/link";

import {
  ArrowRight,
  Banknote,
  Calculator,
  CreditCard,
  JapaneseYen,
  Landmark,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

import { Button } from "@/components/ui/button";

import { GuideBottomCTA } from "../_components/GuideBottomCTA";

export const dynamic = "force-static";

const title = "料金と手数料";
const description =
  "みんなの集金の初期費用、月額費用、現金管理、オンライン集金手数料、主催者の受取目安をまとめた料金ガイドです。";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: getPublicUrl("/guide/pricing-and-fees"),
  },
  openGraph: buildOpenGraphMetadata({
    title: `${title} | みんなの集金`,
    description,
    path: "/guide/pricing-and-fees",
  }),
};

const ONLINE_COLLECTION_FEE_RATE = 0.049;

type PricePoint = {
  title: string;
  value: string;
  body: string;
  icon: LucideIcon;
};

type FeeExample = {
  amount: number;
  note: string;
};

type ExplanationItem = {
  title: string;
  body: string;
  icon: LucideIcon;
};

type GuideLink = {
  title: string;
  body: string;
  href: string;
};

const pricePoints: PricePoint[] = [
  {
    title: "初期費用・固定費用",
    value: "0円",
    body: "アカウント作成、コミュニティ作成、イベント作成に初期費用はかかりません。",
    icon: JapaneseYen,
  },
  {
    title: "現金集金の管理",
    value: "0円",
    body: "現金の受け渡しにシステム手数料はかかりません。",
    icon: Banknote,
  },
  {
    title: "オンライン集金手数料",
    value: "4.9%",
    body: "参加者がオンラインで支払った参加費に対して、主催者負担の手数料が発生します。",
    icon: CreditCard,
  },
];

const feeExamples: FeeExample[] = [
  {
    amount: 1000,
    note: "",
  },
  {
    amount: 3000,
    note: "",
  },
  {
    amount: 3155,
    note: "3,000円を受け取りたい場合の目安",
  },
];

const payerItems: ExplanationItem[] = [
  {
    title: "参加者は、表示された参加費を支払います",
    body: "イベントページに表示された参加費が、参加者にとっての支払額です。オンライン支払いを選んでも、参加者側へ別建てのサービス手数料は上乗せされません。",
    icon: WalletCards,
  },
  {
    title: "オンライン集金手数料は主催者負担です",
    body: "オンラインで支払われた参加費から、オンライン集金手数料が差し引かれます。主催者は、受け取りたい金額に合わせて参加費を設定できます。",
    icon: Calculator,
  },
  {
    title: "入金と残高確認はStripeで行います",
    body: "オンライン決済はStripeを通じて処理されます。残高、入金可能額、入金履歴はStripeの売上・入金確認画面で確認します。",
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
    title: "オンライン集金・入金のしくみ",
    body: "カード決済、Stripe、入金の考え方を詳しく確認できます。",
    href: "/guide/online-collection",
  },
];

function calculateOnlineCollectionFee(amount: number): number {
  return Math.round(amount * ONLINE_COLLECTION_FEE_RATE);
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("ja-JP");
}

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

export default function PricingAndFeesGuidePage() {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-slate-950">
      <section className="border-b border-slate-900/10 bg-[#f7f5f0]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.55fr)] lg:px-8 lg:pb-24 lg:pt-32">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-primary">Pricing and fees</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              料金と
              <span className="text-primary">手数料</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-700">
              みんなの集金は、初期費用・月額費用なしで始められます。
              現金払いの管理は無料です。オンラインで支払われた参加費に対してのみ、オンライン集金手数料が発生します。
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
                <Link href="/guide/online-collection">オンライン集金のしくみを見る</Link>
              </Button>
            </div>
          </div>

          <aside className="border border-slate-900/10 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-bold text-slate-500">オンライン集金手数料</p>
            <div className="mt-4 flex items-end gap-2">
              <span className="font-mono text-6xl font-bold leading-none text-primary">4.9</span>
              <span className="pb-2 text-2xl font-bold text-slate-900">%</span>
            </div>
            <p className="mt-5 text-sm leading-7 text-slate-600">
              オンラインで支払われた参加費に対して発生し、主催者の受取額から差し引かれます。現金払いの記録や無料イベントにはかかりません。
            </p>
            <div className="mt-6 border-t border-slate-900/10 pt-5">
              <p className="text-xs font-bold uppercase text-slate-400">Example</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                参加費3,000円の場合、手数料は147円、受取目安は2,853円です。
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Overview"
          title="固定費なし。必要なイベントから使えます。"
          body="主催者アカウント、コミュニティ、イベント作成には固定費がかかりません。オンラインで支払われた参加費に対してのみ、決済金額に応じたオンライン集金手数料が発生します。"
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {pricePoints.map((point) => {
            const Icon = point.icon;

            return (
              <article key={point.title} className="border border-slate-200 bg-white/70 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-6 text-sm font-bold text-slate-500">{point.title}</p>
                <p className="mt-2 text-4xl font-bold text-slate-950">{point.value}</p>
                <p className="mt-4 text-sm leading-7 text-slate-600">{point.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-900/10 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Fee examples"
            title="参加費から4.9%を差し引いた額が受取目安です。"
            body="オンライン集金手数料は、オンラインで支払われた参加費に4.9%を掛けて円単位に丸めます。受け取りたい金額がある場合は、イベント作成時に参加費を調整できます。"
          />

          <div className="overflow-hidden border border-slate-900/10">
            <div className="grid grid-cols-[1fr_1fr_1fr] bg-slate-950 px-4 py-3 text-xs font-bold text-white sm:px-6">
              <span>参加費</span>
              <span>手数料</span>
              <span>受取目安</span>
            </div>
            <div className="divide-y divide-slate-900/10 bg-[#f7f5f0]">
              {feeExamples.map((example) => {
                const fee = calculateOnlineCollectionFee(example.amount);
                const netAmount = example.amount - fee;

                return (
                  <article
                    key={example.amount}
                    className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-5 sm:px-6"
                  >
                    <div>
                      <p className="font-mono text-lg font-bold text-slate-950">
                        {formatCurrency(example.amount)}円
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{example.note}</p>
                    </div>
                    <p className="font-mono text-lg font-bold text-red-600">
                      -{formatCurrency(fee)}円
                    </p>
                    <p className="font-mono text-lg font-bold text-primary">
                      {formatCurrency(netAmount)}円
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div>
          <SectionHeading
            eyebrow="Who pays"
            title="参加者の支払額と主催者の受取額"
            body="オンライン集金手数料は主催者負担です。参加者には、イベントに設定された参加費が支払額として表示されます。"
          />
          <div className="mt-10 grid gap-4">
            {payerItems.map((item) => {
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
        eyebrow="Start with no fixed cost"
        title="固定費なしで、次のイベントから始められます。"
        body="現金集金だけでも使えます。オンライン集金が必要になったら、Stripe連携を設定して事前回収を始められます。"
        secondaryHref="/guide/getting-started"
        secondaryLabel="主催者ガイドを見る"
      />
    </div>
  );
}
