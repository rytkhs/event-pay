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
    <div className="min-h-screen bg-slate-50">
      <JsonLd data={generateArticleJsonLd(article)} />

      <article>
        {/* ヘッダー */}
        <header className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-primary/8 via-white to-secondary/5">
          {/* 背景の装飾 */}
          <div
            className="pointer-events-none absolute -top-20 right-0 h-72 w-72 translate-x-1/3 rounded-full bg-primary/15 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-12 left-0 h-56 w-56 -translate-x-1/4 rounded-full bg-secondary/15 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative mx-auto w-full max-w-3xl px-4 pb-12 pt-24 sm:px-6 lg:px-8 lg:pb-16 lg:pt-28">
            {/* 戻るリンク */}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-ml-2 text-slate-500 hover:text-slate-700"
            >
              <Link href="/articles">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                記事一覧へ
              </Link>
            </Button>

            {/* メタ情報 */}
            <div className="mt-7 flex flex-wrap items-center gap-2.5 text-sm font-medium">
              {article.category ? (
                <span className="rounded-full bg-primary/10 px-3.5 py-1 text-sm text-primary">
                  {article.category}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {formatArticleDate(article.publishedAt)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {article.readingMinutes}分で読めます
              </span>
            </div>

            {/* タイトル */}
            <h1 className="mt-5 text-3xl font-bold leading-snug tracking-tight text-slate-900 sm:text-[2.625rem]">
              {article.title}
            </h1>

            {/* ディスクリプション */}
            <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
              {article.description}
            </p>

            {/* タグ */}
            {article.tags.length > 0 ? (
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Tags className="h-4 w-4 text-slate-400" aria-hidden="true" />
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-xs text-slate-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        {/* 本文エリア */}
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          {/* Markdown 本文 */}
          <div
            className={[
              "prose prose-slate max-w-none",
              // 見出し
              "prose-headings:font-bold prose-headings:tracking-tight",
              "prose-h2:mt-14 prose-h2:border-l-[3px] prose-h2:border-primary prose-h2:pl-4 prose-h2:text-2xl",
              "prose-h3:mt-8 prose-h3:text-xl",
              // 段落・リスト
              "prose-p:leading-8 prose-li:leading-8",
              // リンク
              "prose-a:font-medium prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
              // 引用
              "prose-blockquote:border-l-primary/50 prose-blockquote:bg-primary/5 prose-blockquote:py-0.5 prose-blockquote:text-slate-600",
              // コード
              "prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-slate-800 prose-code:before:content-none prose-code:after:content-none",
              "prose-pre:rounded-xl prose-pre:bg-slate-900 prose-pre:shadow-md",
            ].join(" ")}
            dangerouslySetInnerHTML={{ __html: article.html }}
          />

          {/* 記事末 CTA */}
          <aside className="mt-16 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-white to-secondary/5 shadow-sm">
            <div className="p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                みんなの集金
              </p>
              <h2 className="mt-3 text-2xl font-bold leading-snug tracking-tight text-slate-900">
                次のイベントから、出欠と集金を
                <br />
                同じ一覧で管理する。
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                招待リンクを共有するだけで参加表明を集め、オンライン決済と現金集金をまとめて確認できます。
              </p>
              <Button asChild className="mt-6">
                <Link href="/start-demo">
                  無料でイベントを作成する
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}
