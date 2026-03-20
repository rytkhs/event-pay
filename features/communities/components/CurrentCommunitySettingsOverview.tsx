import { Building2, ExternalLink, Globe2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="space-y-6">
      <Card className="border-border/70 bg-background/90 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-5 w-5" />
            コミュニティ基本情報
          </CardTitle>
          <CardDescription>現在選択中コミュニティの基本情報です。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="text-sm text-muted-foreground">コミュニティ名</div>
            <div className="mt-2 text-lg font-semibold">{settings.community.name}</div>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="text-sm text-muted-foreground">説明文</div>
            <p className="mt-2 text-sm leading-6 text-foreground">
              {settings.community.description?.trim() || "説明文はまだ設定されていません。"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-background/90 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Globe2 className="h-5 w-5" />
            公開ページ
          </CardTitle>
          <CardDescription>問い合わせ導線などで使う community 固定 URL です。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="text-sm text-muted-foreground">公開ページ URL</div>
            <div className="mt-2 break-all text-sm font-medium text-foreground">
              {settings.publicPageUrl}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              実ページの公開とプレビュー導線は CC-07 で有効化します。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled>
              <ExternalLink className="h-4 w-4" />
              公開ページを開く
            </Button>
          </div>
        </CardContent>
      </Card>

      <UpdateCommunityForm
        defaultDescription={settings.community.description}
        defaultName={settings.community.name}
        updateCommunityAction={updateCommunityAction}
      />

      <DeleteCommunityDangerZone
        communityName={settings.community.name}
        deleteCommunityAction={deleteCommunityAction}
      />
    </div>
  );
}
