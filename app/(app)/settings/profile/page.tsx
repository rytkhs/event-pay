import { requireCurrentAppUserForServerComponent } from "@core/auth/auth-utils";

export const dynamic = "force-dynamic";

import { AccountDeleteDangerZone, EmailChangeForm, ProfileForm } from "@features/settings";

import { Separator } from "@/components/ui/separator";

import { requestAccountDeletionAction, updateEmailAction, updateProfileAction } from "./actions";

export default async function ProfileSettingsPage() {
  const user = await requireCurrentAppUserForServerComponent();

  return (
    <div className="flex flex-col gap-6 sm:gap-10">
      <section aria-labelledby="profile-basic-heading">
        <div className="mb-3 flex flex-col gap-1 sm:mb-4">
          <h2 id="profile-basic-heading" className="text-sm font-semibold">
            ユーザーネーム
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            アプリ内で表示する名前を変更します。
          </p>
        </div>
        <ProfileForm currentName={user.name || ""} updateProfileAction={updateProfileAction} />
      </section>

      <section aria-labelledby="profile-email-heading">
        <div className="mb-3 flex flex-col gap-1 sm:mb-4">
          <h2 id="profile-email-heading" className="text-sm font-semibold">
            メールアドレス
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            変更後のメールアドレスに確認メールを送信します。
          </p>
        </div>
        <EmailChangeForm currentEmail={user.email || ""} updateEmailAction={updateEmailAction} />
      </section>

      <div className="flex items-center gap-3 pt-1 sm:gap-4 sm:pt-2">
        <Separator className="flex-1" />
        <span className="text-xs font-medium text-muted-foreground">危険な操作</span>
        <Separator className="flex-1" />
      </div>

      <section aria-labelledby="profile-danger-heading" className="-mt-3 sm:-mt-4">
        <AccountDeleteDangerZone requestAccountDeletionAction={requestAccountDeletionAction} />
      </section>
    </div>
  );
}
