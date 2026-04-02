import { requireCurrentAppUserForServerComponent } from "@core/auth/auth-utils";

export const dynamic = "force-dynamic";

import { AccountDeleteDangerZone, EmailChangeForm, ProfileForm } from "@features/settings";

import { Separator } from "@/components/ui/separator";

import { requestAccountDeletionAction, updateEmailAction, updateProfileAction } from "./actions";

export default async function ProfileSettingsPage() {
  const user = await requireCurrentAppUserForServerComponent();

  return (
    <div className="space-y-10">
      {/* 基本情報 */}
      <section aria-labelledby="profile-basic-heading">
        <div className="mb-5">
          <h2
            id="profile-basic-heading"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            <span className="inline-block h-3.5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
            基本情報
          </h2>
        </div>
        <ProfileForm currentName={user.name || ""} updateProfileAction={updateProfileAction} />
      </section>

      {/* メールアドレス */}
      <section aria-labelledby="profile-email-heading">
        <div className="mb-5">
          <h2
            id="profile-email-heading"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            <span className="inline-block h-3.5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
            メールアドレス
          </h2>
        </div>
        <EmailChangeForm currentEmail={user.email || ""} updateEmailAction={updateEmailAction} />
      </section>

      {/* 危険ゾーン区切り */}
      <div className="flex items-center gap-4 pt-2">
        <Separator className="flex-1" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          危険な操作
        </span>
        <Separator className="flex-1" />
      </div>

      {/* アカウント削除 */}
      <section aria-labelledby="profile-danger-heading" className="-mt-4">
        <AccountDeleteDangerZone requestAccountDeletionAction={requestAccountDeletionAction} />
      </section>
    </div>
  );
}
