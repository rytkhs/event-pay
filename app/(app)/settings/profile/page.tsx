import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

export const dynamic = "force-dynamic";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountDeleteDangerZone } from "@/features/settings/components/AccountDeleteDangerZone";
import { EmailChangeForm } from "@/features/settings/components/EmailChangeForm";
import { ProfileForm } from "@/features/settings/components/ProfileForm";

import { requestAccountDeletionAction } from "./actions";

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

  return (
    <div className="space-y-6">
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

      {/* アカウント削除（デンジャーゾーン） */}
      <AccountDeleteDangerZone requestAccountDeletionAction={requestAccountDeletionAction} />
    </div>
  );
}
