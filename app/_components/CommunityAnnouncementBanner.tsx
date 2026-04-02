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
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-sm text-foreground">
          あなたのイベントは <span className="font-semibold">「{defaultCommunityName}」</span>{" "}
          にまとめられました
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <Link href="/settings/community">設定を確認</Link>
          </Button>
          <form action={dismissCommunityAnnouncementAction}>
            <Button
              size="icon"
              type="submit"
              variant="ghost"
              className="h-7 w-7"
              aria-label="閉じる"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
