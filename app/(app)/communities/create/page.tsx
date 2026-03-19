export const dynamic = "force-dynamic";

import Link from "next/link";

import { ArrowLeft, Building2, CheckCircle2 } from "lucide-react";

import { resolveAppWorkspaceForServerComponent } from "@core/community/app-workspace";

import { CreateCommunityForm } from "@features/communities";

import { createCommunityAction } from "@/app/(app)/actions/communities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function CreateCommunityPage() {
  const workspace = await resolveAppWorkspaceForServerComponent();

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Button variant="ghost" size="sm" asChild className="px-0 text-muted-foreground">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              ダッシュボードに戻る
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="space-y-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-sm text-muted-foreground shadow-sm">
                <Building2 className="h-4 w-4" />
                Community workspace
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {workspace.hasOwnedCommunities
                    ? "運営先をもう1つ追加する"
                    : "最初のコミュニティを作成する"}
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  {workspace.hasOwnedCommunities
                    ? "サークルや企画ごとに運営単位を分けられます。作成直後から、そのコミュニティのダッシュボードへ切り替わります。"
                    : "イベント、集金状況、Stripe設定はコミュニティ単位でまとまります。まずは運営の土台になる1件を作成してください。"}
                </p>
              </div>
            </div>

            <Card className="border-border/70 bg-background/80 shadow-sm">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">この画面で決めること</p>
                    <p className="text-sm text-muted-foreground">
                      コミュニティ名と説明文だけです。公開URL用 slug や current community
                      切り替えは自動で処理されます。
                    </p>
                  </div>
                </div>
                {workspace.hasOwnedCommunities && workspace.currentCommunity ? (
                  <div className="rounded-xl border border-dashed border-border/80 bg-background px-4 py-3 text-sm text-muted-foreground">
                    現在のコミュニティは{" "}
                    <span className="font-medium text-foreground">
                      {workspace.currentCommunity.name}
                    </span>
                    です。作成完了後は新しいコミュニティへ切り替わります。
                  </div>
                ) : null}
              </CardContent>
            </Card>
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
