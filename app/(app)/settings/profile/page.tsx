import { requireCurrentAppUserForServerComponent } from "@core/auth/auth-utils";

export const dynamic = "force-dynamic";

import { AccountDeleteDangerZone, EmailChangeForm, ProfileForm } from "@features/settings";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { requestAccountDeletionAction, updateEmailAction, updateProfileAction } from "./actions";

export default async function ProfileSettingsPage() {
  const user = await requireCurrentAppUserForServerComponent();

  return (
    <div className="space-y-6">
      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基本情報</CardTitle>
          <CardDescription>イベント作成時に表示される情報を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm currentName={user.name || ""} updateProfileAction={updateProfileAction} />
        </CardContent>
      </Card>

      {/* メールアドレス設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">メールアドレス</CardTitle>
          <CardDescription>ログインとお知らせの受信に使用されます</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailChangeForm currentEmail={user.email || ""} updateEmailAction={updateEmailAction} />
        </CardContent>
      </Card>

      {/* アカウント削除（デンジャーゾーン） */}
      <AccountDeleteDangerZone requestAccountDeletionAction={requestAccountDeletionAction} />
    </div>
  );
}
