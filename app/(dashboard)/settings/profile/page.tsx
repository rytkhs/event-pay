import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmailChangeForm } from "@/features/settings/components/email-change-form";
import { ProfileForm } from "@/features/settings/components/profile-form";

export default async function ProfileSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // ユーザープロフィール情報を取得
  const { data: profile } = await supabase
    .from("users")
    .select("id, name, created_at")
    .eq("id", user.id)
    .single();

  // プロフィール完了度の計算
  const completionPercentage = (() => {
    let completed = 0;
    const total = 3;

    if (profile?.name) completed++;
    if (user.email) completed++;
    if (user.email_confirmed_at) completed++;

    return Math.round((completed / total) * 100);
  })();

  return (
    <div className="space-y-6">
      {/* プロフィール概要 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">プロフィール完了度</CardTitle>
              <CardDescription>プロフィール情報の設定状況</CardDescription>
            </div>
            <Badge variant={completionPercentage === 100 ? "default" : "secondary"}>
              {completionPercentage}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={completionPercentage} className="w-full" />
          <div className="mt-2 text-sm text-muted-foreground">
            {completionPercentage === 100
              ? "すべての設定が完了しています！"
              : "設定を完了してアカウントを安全に保ちましょう"}
          </div>
        </CardContent>
      </Card>

      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基本情報</CardTitle>
          <CardDescription>イベント作成時に表示される情報を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm currentName={profile?.name || ""} />
        </CardContent>
      </Card>

      {/* メールアドレス設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">メールアドレス</CardTitle>
          <CardDescription>ログインとお知らせの受信に使用されます</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailChangeForm currentEmail={user.email || ""} />
        </CardContent>
      </Card>
    </div>
  );
}
