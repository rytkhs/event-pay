import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, ArrowUpRight, CalendarDays, Clock, Tags } from "lucide-react";
import type { Metadata } from "next";

import {
  getArticleStaticParams,
  getPublishedArticleBySlug,
} from "@core/articles/article.repository";
import { generateArticleJsonLd, getArticleImage } from "@core/articles/article.seo";
import { getPublicUrl, siteName } from "@core/seo/metadata";

import { JsonLd } from "@components/seo/JsonLd";

import { Button } from "@/components/ui/button";

export const dynamic = "force-static";
export const dynamicParams = false;

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

function formatArticleDate(date: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00+09:00`));
}

export async function generateStaticParams() {
  return getArticleStaticParams();
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const image = getArticleImage(article);

  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical: getPublicUrl(article.path),
    },
    openGraph: {
      title: `${article.title} | ${siteName}`,
      description: article.description,
      type: "article",
      locale: "ja_JP",
      url: getPublicUrl(article.path),
      siteName,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt ?? article.publishedAt,
      authors: [article.author ?? siteName],
      tags: article.tags,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: `${article.title} | ${siteName}`,
      description: article.description,
      images: [image.url],
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#f7fbfa]">
      <JsonLd data={generateArticleJsonLd(article)} />

      <article>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pb-14 lg:pt-12">
            <Button asChild variant="ghost" className="-ml-3 text-slate-600">
              <Link href="/articles">
                <ArrowLeft className="h-4 w-4" />
                記事一覧へ
              </Link>
            </Button>

            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
              {article.category ? (
                <span className="rounded-md bg-teal-50 px-2.5 py-1 text-teal-800">
                  {article.category}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {formatArticleDate(article.publishedAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {article.readingMinutes}分で読めます
              </span>
            </div>

            <h1 className="mt-5 text-3xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl">
              {article.title}
            </h1>
            <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
              {article.description}
            </p>

            {article.tags.length > 0 ? (
              <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <Tags className="h-4 w-4" />
                {article.tags.map((tag) => (
                  <span key={tag} className="rounded-md border border-slate-200 px-2.5 py-1">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div
            className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-normal prose-h2:mt-12 prose-h2:border-l-4 prose-h2:border-teal-300 prose-h2:pl-4 prose-p:leading-8 prose-a:text-teal-700 prose-a:no-underline hover:prose-a:underline prose-li:leading-8"
            dangerouslySetInnerHTML={{ __html: article.html }}
          />

          <aside className="mt-14 rounded-lg border border-teal-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-teal-800">みんなの集金</p>
            <h2 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">
              次のイベントから、出欠と集金を同じ一覧で管理する。
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              招待リンクを共有するだけで参加表明を集め、オンライン決済と現金集金をまとめて確認できます。
            </p>
            <Button asChild className="mt-5">
              <Link href="/start-demo">
                無料でイベントを作成する
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </aside>
        </div>
      </article>
    </div>
  );
}
