import Link from "next/link";

import { ArrowUpRight, BookOpenText, CalendarDays, Clock } from "lucide-react";
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
    <div className="min-h-screen bg-[#f7fbfa]">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-12 pt-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-16 lg:pt-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">
              <BookOpenText className="h-4 w-4" />
              集金と運営の実践ノート
            </div>
            <h1 className="mt-6 text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">
              イベント集金を、手作業から仕組みに変える。
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              サークル、勉強会、同窓会などの小規模イベントで起きやすい出欠確認・未払い管理・現金集金の悩みを、実務目線で整理します。
            </p>
          </div>
          <div className="self-end border-l-4 border-amber-300 bg-amber-50 px-5 py-5 text-sm leading-7 text-slate-700">
            幹事や会計担当者が、次のイベントからすぐ見直せる運用を中心にまとめています。
            参加者に負担をかけず、管理側の確認作業を減らすことを重視しています。
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        {articles.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {articles.map((article) => (
              <article
                key={article.slug}
                className="group relative rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                  {article.category ? (
                    <span className="rounded-md bg-teal-50 px-2 py-1 text-teal-800">
                      {article.category}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatArticleDate(article.publishedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {article.readingMinutes}分
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-bold leading-8 text-slate-950">
                  <Link href={article.path} className="focus-visible:outline-none">
                    <span className="absolute inset-0" aria-hidden="true" />
                    {article.title}
                  </Link>
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{article.description}</p>
                <div className="relative mt-5 inline-flex items-center gap-2 text-sm font-semibold text-teal-700">
                  記事を読む
                  <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            公開中の記事はまだありません。
          </div>
        )}
      </section>
    </div>
  );
}
