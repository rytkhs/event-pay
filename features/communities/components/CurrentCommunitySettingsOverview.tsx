import Link from "next/link";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import type { CurrentCommunitySettingsReadModel } from "../server";

import { DeleteCommunityDangerZone, type DeleteCommunityAction } from "./DeleteCommunityDangerZone";
import { UpdateCommunityForm, type UpdateCommunityFormAction } from "./UpdateCommunityForm";

type CurrentCommunitySettingsOverviewProps = {
  deleteCommunityAction: DeleteCommunityAction;
  settings: CurrentCommunitySettingsReadModel;
  updateCommunityAction: UpdateCommunityFormAction;
};

export function CurrentCommunitySettingsOverview({
  deleteCommunityAction,
  settings,
  updateCommunityAction,
}: CurrentCommunitySettingsOverviewProps) {
  return (
    <div className="flex flex-col gap-6 sm:gap-10">
      <section aria-labelledby="community-basic-heading">
        <div className="mb-3 flex flex-col gap-1 sm:mb-4">
          <h2 id="community-basic-heading" className="text-sm font-semibold">
            基本情報
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            招待ページと公開プロフィールに表示される情報です。
          </p>
        </div>
        <UpdateCommunityForm
          defaultDescription={settings.community.description}
          defaultName={settings.community.name}
          updateCommunityAction={updateCommunityAction}
        />
      </section>

      <section aria-labelledby="community-profile-heading">
        <div className="mb-3 flex flex-col gap-1 sm:mb-4">
          <h2 id="community-profile-heading" className="text-sm font-semibold">
            コミュニティプロフィール
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Stripe アカウント作成に利用可能なコミュニティプロフィールです
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background">
          <div className="divide-y divide-border/60">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">
                  コミュニティプロフィール URL
                </p>
                <p className="truncate text-sm font-medium text-foreground">
                  {settings.publicPageUrl}
                </p>
              </div>
              <Button variant="outline" size="sm" className="w-full shrink-0 sm:w-auto" asChild>
                <Link href={settings.publicPageUrl} rel="noopener noreferrer" target="_blank">
                  <ExternalLink className="h-3.5 w-3.5" />
                  開く
                </Link>
              </Button>
            </div>
            {/* <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  特定商取引法に基づく表記 URL
                </p>
                <p className="truncate text-sm font-medium text-foreground">
                  {settings.legalPageUrl}
                </p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" asChild>
                <Link href={settings.legalPageUrl} rel="noopener noreferrer" target="_blank">
                  <ExternalLink className="h-3.5 w-3.5" />
                  開く
                </Link>
              </Button>
            </div> */}
          </div>
        </div>
      </section>

      {/* 危険ゾーン区切り */}
      <div className="flex items-center gap-3 pt-1 sm:gap-4 sm:pt-2">
        <Separator className="flex-1" />
        <span className="text-xs font-medium text-muted-foreground">危険な操作</span>
        <Separator className="flex-1" />
      </div>

      <section aria-labelledby="community-danger-heading" className="-mt-3 sm:-mt-4">
        <DeleteCommunityDangerZone
          communityName={settings.community.name}
          deleteCommunityAction={deleteCommunityAction}
        />
      </section>
    </div>
  );
}
