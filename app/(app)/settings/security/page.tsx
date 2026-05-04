export const dynamic = "force-dynamic";

import { PasswordChangeForm } from "@features/settings";

import { changePasswordAction } from "./actions";

export default async function SecuritySettingsPage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-10">
      <section aria-labelledby="security-password-heading">
        <div className="mb-3 flex flex-col gap-1 sm:mb-4">
          <h2 id="security-password-heading" className="text-sm font-semibold">
            パスワード変更
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            現在のパスワードを確認してから、新しいパスワードに更新します。
          </p>
        </div>
        <PasswordChangeForm changePasswordAction={changePasswordAction} />
      </section>
    </div>
  );
}
