import Link from "next/link";

import { ArrowUpRight, BookOpenText, CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import { getPublishedArticles } from "@core/articles/article.repository";
import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "記事一覧",
  description:
    "サークルや小規模コミュニティの出欠管理、イベント集金、現金管理をラクにするための実践記事です。",
  alternates: {
    canonical: getPublicUrl("/articles"),
  },
  openGraph: buildOpenGraphMetadata({
    title: "記事一覧 | みんなの集金",
    description:
      "サークルや小規模コミュニティの出欠管理、イベント集金、現金管理をラクにするための実践記事です。",
    path: "/articles",
  }),
};

function formatArticleDate(date: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00+09:00`));
}

export default async function ArticlesPage() {
  const articles = await getPublishedArticles();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/8 via-white to-secondary/5 border-b border-slate-200">
        {/* 背景の装飾 */}
        <div
          className="pointer-events-none absolute -top-24 right-0 h-80 w-80 translate-x-1/3 rounded-full bg-primary/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-16 left-0 h-64 w-64 -translate-x-1/4 rounded-full bg-secondary/15 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-24 sm:px-6 lg:px-8 lg:pb-20 lg:pt-28">
          <div className="flex flex-col items-start gap-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-sm font-semibold text-primary">
              <BookOpenText className="h-4 w-4" aria-hidden="true" />
              実践ガイド
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              コミュニティ運営を
              <br className="hidden sm:block" />
              もっとラクにする記事
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              クローズドコミュニティの出欠管理・イベント集金・現金管理をラクにするための実践的なヒントをお届けします。
            </p>
          </div>
        </div>
      </section>

      {/* 記事一覧 */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {articles.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {articles.map((article) => (
              <article
                key={article.slug}
                className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md"
              >
                {/* メタ情報 */}
                <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium">
                  {article.category ? (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                      {article.category}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatArticleDate(article.publishedAt)}
                  </span>
                </div>

                {/* タイトル */}
                <h2 className="mt-4 text-xl font-bold leading-snug text-slate-900">
                  <Link href={article.path} className="focus-visible:outline-none">
                    {/* カード全体をクリック可能に */}
                    <span className="absolute inset-0 rounded-2xl" aria-hidden="true" />
                    {article.title}
                  </Link>
                </h2>

                {/* 概要 */}
                <p className="mt-3 flex-1 text-sm leading-7 text-slate-500">
                  {article.description}
                </p>

                {/* 読む CTA */}
                <div className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  記事を読む
                  <ArrowUpRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <BookOpenText className="mx-auto mb-4 h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="text-base font-medium text-slate-500">公開中の記事はまだありません。</p>
            <p className="mt-1 text-sm text-slate-400">
              近日公開予定です。しばらくお待ちください。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
