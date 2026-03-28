import Link from "next/link";

import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function CommunityEmptyState() {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
      <Card className="w-full max-w-2xl border-dashed">
        <CardHeader className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <CardTitle>コミュニティをまだ作成していません</CardTitle>
            <CardDescription>
              管理画面を使い始めるには、最初のコミュニティ作成が必要です。作成後はそのコミュニティが現在の作業対象になります。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild className="w-full sm:w-fit">
            <Link href="/communities/create">最初のコミュニティを作成</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            名前と説明文だけで作成できます。公開URL用の slug と current community
            の切り替えは自動で処理されます。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
