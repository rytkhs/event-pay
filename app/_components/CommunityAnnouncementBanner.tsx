import Link from "next/link";

import { Sparkles, X } from "lucide-react";

import { dismissCommunityAnnouncementAction } from "@/app/_actions/community-announcement";
import { Button } from "@/components/ui/button";

type CommunityAnnouncementBannerProps = {
  userName: string | null;
};

export function CommunityAnnouncementBanner({ userName }: CommunityAnnouncementBannerProps) {
  const defaultCommunityName = userName ? `${userName}のコミュニティ` : "あなたのコミュニティ";

  return (
    <section className="border-b bg-primary/5">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:items-center sm:gap-4 sm:py-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" aria-hidden="true" />

        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex flex-col gap-1 sm:gap-0.5">
            <p className="text-sm font-semibold text-foreground">
              新機能「コミュニティ切り替え」が利用できます
            </p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              あなたのイベントは{" "}
              <span className="font-medium text-primary">「{defaultCommunityName}」</span>{" "}
              にまとめられました。コミュニティ名は設定から変更できます。
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            <Button asChild size="sm" variant="outline" className="h-8 px-3 text-xs font-medium">
              <Link href="/settings/community">設定を確認</Link>
            </Button>
          </div>
        </div>

        <form action={dismissCommunityAnnouncementAction} className="shrink-0">
          <Button
            size="icon"
            type="submit"
            variant="ghost"
            className="-mr-1.5 h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </section>
  );
}
