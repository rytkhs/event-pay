import { redirect } from "next/navigation";

import { createServerComponentSupabaseClient } from "@core/supabase/factory";

export const dynamic = "force-dynamic";

import { PasswordChangeForm } from "@features/settings";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { changePasswordAction } from "./actions";

export default async function SecuritySettingsPage() {
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">パスワード変更</CardTitle>
          <CardDescription>アカウントのログインパスワードを変更できます</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm changePasswordAction={changePasswordAction} />
        </CardContent>
      </Card>
    </div>
  );
}
