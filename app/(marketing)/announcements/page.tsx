import Link from "next/link";

import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  Clock,
  Megaphone,
  ShieldAlert,
} from "lucide-react";
import type { Metadata } from "next";

import { getPublishedAnnouncements } from "@core/announcements/announcement.repository";
import type {
  AnnouncementImportance,
  AnnouncementSummary,
  AnnouncementType,
} from "@core/announcements/announcement.types";
import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";

import { Badge } from "@/components/ui/badge";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "お知らせ",
  description: "みんなの集金の料金、機能、メンテナンス、規約変更などの公式なお知らせです。",
  alternates: {
    canonical: getPublicUrl("/announcements"),
  },
  openGraph: buildOpenGraphMetadata({
    title: "お知らせ | みんなの集金",
    description: "みんなの集金の料金、機能、メンテナンス、規約変更などの公式なお知らせです。",
    path: "/announcements",
  }),
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

function AnnouncementCard({ announcement }: { announcement: AnnouncementSummary }) {
  const isCritical = announcement.importance === "critical";

  return (
    <article
      className={[
        "group relative flex flex-col rounded-lg border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        isCritical ? "border-destructive/30" : "border-slate-200 hover:border-primary/35",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        <Badge variant={getImportanceBadgeVariant(announcement.importance)}>
          {announcementImportanceLabels[announcement.importance]}
        </Badge>
        <Badge variant="outline">{announcementTypeLabels[announcement.type]}</Badge>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {formatAnnouncementDate(announcement.publishedAt)}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {announcement.readingMinutes}分
        </span>
      </div>

      <h2 className="mt-4 text-xl font-bold leading-snug text-slate-900">
        <Link href={announcement.path} className="focus-visible:outline-none">
          <span className="absolute inset-0 rounded-lg" aria-hidden="true" />
          {announcement.title}
        </Link>
      </h2>

      <p className="mt-3 flex-1 text-sm leading-7 text-slate-500">{announcement.description}</p>

      {announcement.effectiveAt ? (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <AlertCircle className="h-4 w-4 text-primary" aria-hidden="true" />
          適用開始日: {formatAnnouncementDate(announcement.effectiveAt)}
        </p>
      ) : null}

      <div className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
        詳細を確認する
        <ArrowUpRight
          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden="true"
        />
      </div>
    </article>
  );
}

export default async function AnnouncementsPage() {
  const announcements = await getPublishedAnnouncements();

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-24 sm:px-6 lg:px-8 lg:pb-20 lg:pt-28">
          <div className="flex max-w-3xl flex-col items-start gap-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-semibold text-slate-700">
              <Megaphone className="h-4 w-4 text-primary" aria-hidden="true" />
              公式なお知らせ
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              みんなの集金からの
              <br className="hidden sm:block" />
              大切なお知らせ
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              料金、機能、メンテナンス、規約変更など、サービス利用に関わる公式情報を掲載します。
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {announcements.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2">
            {announcements.map((announcement) => (
              <AnnouncementCard key={announcement.slug} announcement={announcement} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
            <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="text-base font-medium text-slate-500">
              公開中のお知らせはまだありません。
            </p>
            <p className="mt-1 text-sm text-slate-400">
              料金や機能に関わる重要なお知らせは、こちらに掲載します。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
