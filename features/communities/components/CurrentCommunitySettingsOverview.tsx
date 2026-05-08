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
        <div className="mb-3 flex flex-col gap-1 sm:mb-4">
          <h2 id="community-public-page-heading" className="text-sm font-semibold">
            コミュニティプロフィールと参加者向け表示
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Stripe設定などで利用するページです。必要な場合は、招待・ゲストページにリンクを表示できます。
          </p>
        </div>
        <CommunityPublicPageVisibilityForm
          defaultShowCommunityLink={settings.community.showCommunityLink}
          defaultShowLegalDisclosureLink={settings.community.showLegalDisclosureLink}
          legalPageUrl={settings.legalPageUrl}
          publicPageUrl={settings.publicPageUrl}
          updateCommunityPublicPageVisibilityAction={updateCommunityPublicPageVisibilityAction}
        />
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
