import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>プロフィール情報</CardTitle>
          <CardDescription>あなたの基本的なプロフィール情報を管理します</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm currentName={profile?.name || ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>メールアドレス変更</CardTitle>
          <CardDescription>
            メールアドレスを変更します。確認メールが送信されるため、新しいメールアドレスにアクセスできることを確認してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailChangeForm currentEmail={user.email || ""} />
        </CardContent>
      </Card>
    </div>
  );
}
