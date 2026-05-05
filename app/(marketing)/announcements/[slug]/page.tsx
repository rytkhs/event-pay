import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, ArrowUpRight, CalendarDays, Clock, Tags } from "lucide-react";
import type { Metadata } from "next";

import {
  getAnnouncementStaticParams,
  getPublishedAnnouncementBySlug,
} from "@core/announcements/announcement.repository";
import { generateAnnouncementJsonLd } from "@core/announcements/announcement.seo";
import type {
  AnnouncementAudience,
  AnnouncementImportance,
  AnnouncementType,
} from "@core/announcements/announcement.types";
import { getPublicUrl, siteName, siteOgImage } from "@core/seo/metadata";

import { JsonLd } from "@components/seo/JsonLd";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-static";
export const dynamicParams = false;

type AnnouncementPageProps = {
  params: Promise<{ slug: string }>;
};

const announcementTypeLabels: Record<AnnouncementType, string> = {
  pricing: "料金",
  feature: "機能",
  maintenance: "メンテナンス",
  legal: "規約",
  incident: "障害",
  other: "その他",
};

const announcementImportanceLabels: Record<AnnouncementImportance, string> = {
  normal: "通常",
  important: "重要",
  critical: "緊急",
};

const announcementAudienceLabels: Record<AnnouncementAudience, string> = {
  organizer: "主催者",
  participant: "参加者",
  all: "すべてのユーザー",
};

function formatAnnouncementDate(date: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00+09:00`));
}

function getImportanceBadgeVariant(importance: AnnouncementImportance) {
  if (importance === "critical") {
    return "destructive" as const;
  }

  if (importance === "important") {
    return "default" as const;
  }

  return "secondary" as const;
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
        <header className="relative overflow-hidden border-b border-slate-200 bg-white">
          <div className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />
          <div className="relative mx-auto w-full max-w-3xl px-4 pb-12 pt-24 sm:px-6 lg:px-8 lg:pb-16 lg:pt-28">
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

            <div className="mt-7 flex flex-wrap items-center gap-2.5 text-sm font-medium">
              <Badge variant={getImportanceBadgeVariant(announcement.importance)}>
                {announcementImportanceLabels[announcement.importance]}
              </Badge>
              <Badge variant="outline">{announcementTypeLabels[announcement.type]}</Badge>
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {formatAnnouncementDate(announcement.publishedAt)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {announcement.readingMinutes}分で読めます
              </span>
            </div>

            <h1 className="mt-5 text-3xl font-bold leading-snug tracking-tight text-slate-900 sm:text-[2.625rem]">
              {announcement.title}
            </h1>

            <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
              {announcement.description}
            </p>

            <dl className="mt-7 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm sm:grid-cols-2">
              {announcement.effectiveAt ? (
                <div>
                  <dt className="font-semibold text-slate-500">適用開始日</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {formatAnnouncementDate(announcement.effectiveAt)}
                  </dd>
                </div>
              ) : null}
              {announcement.audience.length > 0 ? (
                <div>
                  <dt className="font-semibold text-slate-500">対象</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {announcement.audience
                      .map((audience) => announcementAudienceLabels[audience])
                      .join("、")}
                  </dd>
                </div>
              ) : null}
            </dl>

            {announcement.tags.length > 0 ? (
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Tags className="h-4 w-4 text-slate-400" aria-hidden="true" />
                {announcement.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
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

          <aside className="mt-16 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">お問い合わせ</p>
            <h2 className="mt-3 text-2xl font-bold leading-snug tracking-tight text-slate-900">
              このお知らせについて確認したいことがありますか
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              料金、規約、機能変更などについて不明点がある場合は、お問い合わせフォームからご連絡ください。
            </p>
            <Button asChild className="mt-6">
              <Link href="/contact">
                お問い合わせへ
                <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          </aside>
        </div>
      </article>
    </div>
  );
}
