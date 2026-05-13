"use client";

import { useState, useTransition } from "react";

import Link from "next/link";

import { Info, X } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Button } from "@/components/ui/button";

type AppAnnouncementBannerProps = {
  announcementPath: string;
  dismissAction: () => Promise<ActionResult>;
};

export function AppAnnouncementBanner({
  announcementPath,
  dismissAction,
}: AppAnnouncementBannerProps) {
  const [isHidden, setIsHidden] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (isHidden) {
    return null;
  }

  const handleDismiss = () => {
    startTransition(async () => {
      await dismissAction();
      setIsHidden(true);
    });
  };

  return (
    <div className="relative border-b border-border bg-primary/5 px-3 py-3 text-foreground sm:px-4">
      <div className="mx-auto flex w-full max-w-7xl items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-background text-primary">
          <Info className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 pr-8">
          <p className="text-sm font-semibold">振込操作がアプリ内から行えるようになりました</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            今後はStripeダッシュボードではなく、「設定」&gt;「オンライン集金」から登録口座への振込を実行できます。
            <Button
              asChild
              variant="link"
              className="h-auto p-0 px-1 font-semibold text-primary underline-offset-4"
            >
              <Link href={announcementPath}>詳しく見る</Link>
            </Button>
          </p>
        </div>
      </div>
      <Button
        type="button"
        aria-label="お知らせを閉じる"
        disabled={isPending}
        onClick={handleDismiss}
        size="icon"
        variant="ghost"
        className="absolute right-2 top-2 size-8 text-muted-foreground hover:text-foreground sm:right-4 sm:top-3"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
