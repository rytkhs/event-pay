import { ChevronDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

import type { CurrentCommunitySettingsReadModel } from "../server";

import {
  CommunityPublicPageVisibilityForm,
  type UpdateCommunityPublicPageVisibilityFormAction,
} from "./CommunityPublicPageVisibilityForm";
import { DeleteCommunityDangerZone, type DeleteCommunityAction } from "./DeleteCommunityDangerZone";
import {
  UpdateCommunityBasicInfoForm,
  type UpdateCommunityBasicInfoFormAction,
} from "./UpdateCommunityBasicInfoForm";

type CurrentCommunitySettingsOverviewProps = {
  deleteCommunityAction: DeleteCommunityAction;
  settings: CurrentCommunitySettingsReadModel;
  updateCommunityBasicInfoAction: UpdateCommunityBasicInfoFormAction;
  updateCommunityPublicPageVisibilityAction: UpdateCommunityPublicPageVisibilityFormAction;
};

export function CurrentCommunitySettingsOverview({
  deleteCommunityAction,
  settings,
  updateCommunityBasicInfoAction,
  updateCommunityPublicPageVisibilityAction,
}: CurrentCommunitySettingsOverviewProps) {
  return (
    <div className="flex flex-col gap-6 sm:gap-10">
      <section aria-labelledby="community-basic-heading">
        <div className="mb-3 flex flex-col gap-1 sm:mb-4">
          <h2 id="community-basic-heading" className="text-sm font-semibold">
            基本情報
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            招待ページとコミュニティプロフィールに表示される情報です。
          </p>
        </div>
        <UpdateCommunityBasicInfoForm
          defaultDescription={settings.community.description}
          defaultName={settings.community.name}
          updateCommunityBasicInfoAction={updateCommunityBasicInfoAction}
        />
      </section>

      <section aria-labelledby="community-public-page-heading">
        <h2 id="community-public-page-heading" className="sr-only">
          参加者向け表示
        </h2>
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3.5 text-left transition-colors hover:border-border hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:items-center sm:px-5 sm:py-4">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors group-hover:text-foreground sm:mt-0">
              <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-semibold leading-5">参加者向け表示</span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  コミュニティプロフィールや特商法表記へのリンク表示
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5 sm:justify-end">
                <VisibilityStatus
                  label="プロフィール"
                  enabled={settings.community.showCommunityLink}
                />
                <VisibilityStatus
                  label="特商法"
                  enabled={settings.community.showLegalDisclosureLink}
                />
              </span>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden pt-3 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down sm:pt-4">
            <CommunityPublicPageVisibilityForm
              defaultShowCommunityLink={settings.community.showCommunityLink}
              defaultShowLegalDisclosureLink={settings.community.showLegalDisclosureLink}
              legalPageUrl={settings.legalPageUrl}
              publicPageUrl={settings.publicPageUrl}
              updateCommunityPublicPageVisibilityAction={updateCommunityPublicPageVisibilityAction}
            />
          </CollapsibleContent>
        </Collapsible>
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

type VisibilityStatusProps = {
  enabled: boolean;
  label: string;
};

function VisibilityStatus({ enabled, label }: VisibilityStatusProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs leading-none text-muted-foreground">
      <span>{label}:</span>
      <span className={enabled ? "font-medium text-foreground" : undefined}>
        {enabled ? "表示" : "非表示"}
      </span>
    </span>
  );
}
