import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import {
  getAnnouncementStaticParams,
  getPublishedAnnouncementBySlug,
} from "@core/announcements/announcement.repository";
import { generateAnnouncementJsonLd } from "@core/announcements/announcement.seo";
import { getPublicUrl, siteName, siteOgImage } from "@core/seo/metadata";

import { JsonLd } from "@components/seo/JsonLd";

import { Button } from "@/components/ui/button";

export const dynamic = "force-static";
export const dynamicParams = false;

type AnnouncementPageProps = {
  params: Promise<{ slug: string }>;
};

function formatAnnouncementDate(date: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${date}T00:00:00+09:00`));
}

export async function generateStaticParams() {
  return getAnnouncementStaticParams();
}

export async function generateMetadata({ params }: AnnouncementPageProps): Promise<Metadata> {
  const { slug } = await params;
  const announcement = await getPublishedAnnouncementBySlug(slug);

  if (!announcement) {
    notFound();
  }

  return {
    title: announcement.title,
    description: announcement.description,
    alternates: {
      canonical: getPublicUrl(announcement.path),
    },
    openGraph: {
      title: `${announcement.title} | ${siteName}`,
      description: announcement.description,
      type: "article",
      locale: "ja_JP",
      url: getPublicUrl(announcement.path),
      siteName,
      publishedTime: announcement.publishedAt,
      modifiedTime: announcement.updatedAt ?? announcement.publishedAt,
      images: [siteOgImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `${announcement.title} | ${siteName}`,
      description: announcement.description,
      images: [siteOgImage.url],
    },
  };
}

export default async function AnnouncementPage({ params }: AnnouncementPageProps) {
  const { slug } = await params;
  const announcement = await getPublishedAnnouncementBySlug(slug);

  if (!announcement) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <JsonLd data={generateAnnouncementJsonLd(announcement)} />

      <article>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pb-12 lg:pt-28">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-ml-2 text-slate-500 hover:text-slate-700"
            >
              <Link href="/announcements">
                <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                お知らせ一覧へ
              </Link>
            </Button>

            <p className="mt-8 inline-flex items-center gap-1.5 text-sm text-slate-500">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {formatAnnouncementDate(announcement.publishedAt)}
            </p>

            <h1 className="mt-5 text-2xl font-semibold leading-snug tracking-tight text-slate-900 sm:text-3xl">
              {announcement.title}
            </h1>

            <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
              {announcement.description}
            </p>

            {announcement.effectiveAt ? (
              <dl className="mt-7 border-l-2 border-slate-300 pl-4 text-sm">
                <div>
                  <dt className="font-semibold text-slate-500">適用開始日</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {formatAnnouncementDate(announcement.effectiveAt)}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div
            className={[
              "prose prose-slate max-w-none",
              "prose-headings:font-bold prose-headings:tracking-tight",
              "prose-h2:mt-14 prose-h2:border-l-[3px] prose-h2:border-primary prose-h2:pl-4 prose-h2:text-2xl",
              "prose-h3:mt-8 prose-h3:text-xl",
              "prose-p:leading-8 prose-li:leading-8",
              "prose-a:font-medium prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
              "prose-blockquote:border-l-primary/50 prose-blockquote:bg-primary/5 prose-blockquote:py-0.5 prose-blockquote:text-slate-600",
              "prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-slate-800 prose-code:before:content-none prose-code:after:content-none",
              "prose-pre:rounded-xl prose-pre:bg-slate-900 prose-pre:shadow-md",
            ].join(" ")}
            dangerouslySetInnerHTML={{ __html: announcement.html }}
          />
        </div>
      </article>
    </div>
  );
}
