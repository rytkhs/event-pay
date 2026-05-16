import Link from "next/link";

import { ArrowRight, Banknote, BanknoteArrowDown, CreditCard, JapaneseYen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

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
const ONLINE_COLLECTION_FEE_FIXED = 50;
const PAYOUT_FEE = 260;

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
    value: "4.9% + 50円",
    body: "オンラインで支払われた参加費に対して、1決済あたり決済金額の4.9% + 50円が発生します。主催者の受取額から差し引かれ、参加者への上乗せはありません。",
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
    amount: 3210,
    note: "3,000円を受け取りたい場合の目安",
  },
];

function calculateOnlineCollectionFee(amount: number): number {
  return Math.round(amount * ONLINE_COLLECTION_FEE_RATE) + ONLINE_COLLECTION_FEE_FIXED;
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
      {body && <p className="mt-4 text-base leading-8 text-slate-600">{body}</p>}
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
              オンラインで支払われた参加費に対してのみ、手数料が発生します。
            </p>
          </div>

          {/* <aside className="border border-slate-900/10 bg-white p-6 shadow-sm sm:p-8">
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
          </aside> */}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Overview"
          title="固定費なし。必要なイベントから使えます。"
          body=""
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
            title="参加費から4.9% + 50円を差し引いた額が受取目安です。"
            body="受け取りたい金額がある場合は、イベント作成時に参加費を調整できます。"
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

      <section className="border-b border-slate-900/10 bg-[#f7f5f0]">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-8 lg:py-20">
          <SectionHeading eyebrow="Payout fee" title="振込手数料" body="" />

          <article className="grid gap-4 border border-slate-200 bg-white/70 p-6 sm:grid-cols-[48px_minmax(0,1fr)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white">
              <BanknoteArrowDown className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-950">
                {formatCurrency(PAYOUT_FEE)}円
                <span className="ml-1 text-base font-bold text-slate-500">/ 回</span>
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                オンライン集金で集めた売上を登録口座へ振り込む際、振込1回ごとに発生します。振込操作はアプリ内から行います。
              </p>
            </div>
          </article>
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
                  <span className="block text-lg font-bold text-slate-950">さっそく始める</span>
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
                  href="/guide/participant-flow"
                  className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-primary"
                >
                  参加者の登録と支払いの流れ
                </Link>
                <Link
                  href="/guide/online-collection"
                  className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-primary"
                >
                  オンライン集金のしくみ
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <GuideBottomCTA
        eyebrow="Start with no fixed cost"
        title="固定費なしで、次のイベントから始められます。"
        body="アカウント作成は無料。オンライン集金が必要になったら設定するだけです。"
        secondaryHref="/guide/getting-started"
        secondaryLabel="主催者ガイドを見る"
      />
    </div>
  );
}
