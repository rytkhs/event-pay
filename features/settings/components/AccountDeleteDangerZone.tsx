"use client";

import { useState, useTransition, type JSX } from "react";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountDeleteDangerZoneProps = {
  requestAccountDeletionAction: (formData: FormData) => Promise<ActionResult>;
};

export function AccountDeleteDangerZone({
  requestAccountDeletionAction,
}: AccountDeleteDangerZoneProps): JSX.Element {
  const [isPending, startTransition] = useTransition();

  const [agreeIrreversible, setAgreeIrreversible] = useState(false);
  const [agreeStripeDisable, setAgreeStripeDisable] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const canSubmit = agreeIrreversible && agreeStripeDisable && confirmText.trim().length > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("confirmText", confirmText);
      formData.append("agreeIrreversible", agreeIrreversible ? "on" : "");
      formData.append("agreeStripeDisable", agreeStripeDisable ? "on" : "");

      const result = await requestAccountDeletionAction(formData);
      if (result.success) {
        toast("処理完了", { description: result.message });
        if (result.redirectUrl) {
          window.location.href = result.redirectUrl;
        }
      } else {
        toast.error("エラー", { description: result.error?.userMessage });
      }
    });
  };

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/[0.03]">
      <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-destructive">アカウントを削除</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            この操作は取り消せません。Stripe連携は無効化/解除されます。
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="agreeIrreversible"
              checked={agreeIrreversible}
              onCheckedChange={(v) => setAgreeIrreversible(Boolean(v))}
              className="mt-0.5"
            />
            <Label htmlFor="agreeIrreversible" className="text-xs leading-relaxed cursor-pointer">
              不可逆な操作であることを理解しました
            </Label>
          </div>

          <div className="flex items-start gap-2.5">
            <Checkbox
              id="agreeStripeDisable"
              checked={agreeStripeDisable}
              onCheckedChange={(v) => setAgreeStripeDisable(Boolean(v))}
              className="mt-0.5"
            />
            <Label htmlFor="agreeStripeDisable" className="text-xs leading-relaxed cursor-pointer">
              Stripe連携が無効化/解除されることを理解しました
            </Label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmText" className="text-xs font-medium text-muted-foreground">
            確認のため「削除します」と入力してください
          </Label>
          <Input
            id="confirmText"
            className="h-10"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="削除します"
            autoComplete="off"
          />
        </div>

        <div className="flex justify-end border-t border-destructive/20 pt-4 sm:pt-5">
          <Button
            variant="destructive"
            size="sm"
            disabled={!canSubmit || isPending}
            onClick={onSubmit}
            className="w-full sm:w-auto sm:min-w-32"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                処理中...
              </>
            ) : (
              "アカウント削除"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
