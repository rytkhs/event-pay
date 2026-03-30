export const dynamic = "force-dynamic";

import { PasswordChangeForm } from "@features/settings";

import { changePasswordAction } from "./actions";

export default async function SecuritySettingsPage() {
  return (
    <div className="space-y-10">
      <section aria-labelledby="security-password-heading">
        <div className="mb-5">
          <h2
            id="security-password-heading"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            <span className="inline-block h-3.5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
            パスワード変更
          </h2>
        </div>
        <PasswordChangeForm changePasswordAction={changePasswordAction} />
      </section>
    </div>
  );
}
