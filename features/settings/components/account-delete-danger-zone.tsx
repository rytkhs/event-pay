"use client";

import { useState, useTransition } from "react";

import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/core/contexts/toast-context";
import { requestAccountDeletionAction } from "@/features/settings/actions/request-account-deletion";

export function AccountDeleteDangerZone(): JSX.Element {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [agreeIrreversible, setAgreeIrreversible] = useState(false);
  const [agreeFinanceRetention, setAgreeFinanceRetention] = useState(false);
  const [agreeStripeDisable, setAgreeStripeDisable] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const canSubmit =
    agreeIrreversible &&
    agreeFinanceRetention &&
    agreeStripeDisable &&
    confirmText.trim().length > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("confirmText", confirmText);
      formData.append("agreeIrreversible", agreeIrreversible ? "on" : "");
      formData.append("agreeFinanceRetention", agreeFinanceRetention ? "on" : "");
      formData.append("agreeStripeDisable", agreeStripeDisable ? "on" : "");

      const result = await requestAccountDeletionAction(formData);
      if (result.success) {
        toast({ title: "処理完了", description: result.message });
        if (result.redirectUrl) {
          window.location.href = result.redirectUrl;
        }
      } else {
        toast({ title: "エラー", description: result.error, variant: "destructive" });
      }
    });
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" /> アカウント削除
        </CardTitle>
        <CardDescription>
          この操作は取り消せません。会計・清算等の記録は法令等に基づき保持されます。Stripe連携は無効化/解除されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="agreeIrreversible"
              checked={agreeIrreversible}
              onCheckedChange={(v) => setAgreeIrreversible(Boolean(v))}
            />
            <Label htmlFor="agreeIrreversible" className="text-sm">
              不可逆な操作であることを理解しました
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="agreeFinanceRetention"
              checked={agreeFinanceRetention}
              onCheckedChange={(v) => setAgreeFinanceRetention(Boolean(v))}
            />
            <Label htmlFor="agreeFinanceRetention" className="text-sm">
              財務記録は保持されることを理解しました
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="agreeStripeDisable"
              checked={agreeStripeDisable}
              onCheckedChange={(v) => setAgreeStripeDisable(Boolean(v))}
            />
            <Label htmlFor="agreeStripeDisable" className="text-sm">
              Stripe連携が無効化/解除されることを理解しました
            </Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmText" className="text-sm">
            確認のため、次を入力してください：「削除します」
          </Label>
          <Input
            id="confirmText"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="削除します"
            autoComplete="off"
          />
        </div>

        <div className="pt-2">
          <Button
            variant="destructive"
            disabled={!canSubmit || isPending}
            onClick={onSubmit}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> 処理中...
              </span>
            ) : (
              "アカウント削除"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
