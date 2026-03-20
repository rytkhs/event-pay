export const dynamic = "force-dynamic";

import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { resolveAppWorkspaceForServerComponent } from "@core/community/app-workspace";

import { CreateCommunityForm } from "@features/communities";

import { createCommunityAction } from "@/app/(app)/actions/communities";
import { Button } from "@/components/ui/button";

export default async function CreateCommunityPage() {
  const workspace = await resolveAppWorkspaceForServerComponent();

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <Button variant="ghost" size="sm" asChild className="px-0 text-muted-foreground">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              ダッシュボードに戻る
            </Link>
          </Button>
        </div>

        <div className="space-y-10">
          <section className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">
              {workspace.hasOwnedCommunities
                ? "コミュニティを追加する"
                : "最初のコミュニティを作成する"}
            </h1>
            <p className="mx-auto max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
              {workspace.hasOwnedCommunities
                ? "コミュニティや企画ごとに運営単位を分けられます。"
                : "イベント管理、集金状況はコミュニティ単位でまとまります。まずは運営の土台になる1件を作成してください。"}
            </p>
          </section>

          <CreateCommunityForm
            createCommunityAction={createCommunityAction}
            currentCommunityName={workspace.currentCommunity?.name ?? null}
            hasOwnedCommunities={workspace.hasOwnedCommunities}
          />
        </div>
      </div>
    </div>
  );
}
