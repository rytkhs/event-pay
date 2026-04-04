"use client";

import { useActionState, useEffect, useId, useState } from "react";

import { useRouter } from "next/navigation";

import { Loader2, Trash2 } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type DeleteCommunityPayload = {
  deletedCommunityId: string;
  nextCurrentCommunityId: string | null;
};

export type DeleteCommunityFormState = ActionResult<DeleteCommunityPayload>;

export type DeleteCommunityAction = (
  state: DeleteCommunityFormState,
  formData: FormData
) => Promise<DeleteCommunityFormState>;

type DeleteCommunityDangerZoneProps = {
  communityName: string;
  deleteCommunityAction: DeleteCommunityAction;
};

const initialState: DeleteCommunityFormState = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    correlationId: "",
    retryable: false,
    userMessage: "",
  },
};

export function DeleteCommunityDangerZone({
  communityName,
  deleteCommunityAction,
}: DeleteCommunityDangerZoneProps) {
  const router = useRouter();
  const formId = useId();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(deleteCommunityAction, initialState);
  const error = state.success ? undefined : state.error;

  useEffect(() => {
    if (state.success && state.redirectUrl) {
      setDialogOpen(false);
      router.push(state.redirectUrl);
    }
  }, [router, state]);

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/[0.03] shadow-sm">
      <div className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-destructive">「{communityName}」を削除</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              この操作は取り消せません。コミュニティプロフィールは非表示になり、ホームでの管理はできなくなります。
              代表コミュニティに設定されている場合は削除できません。
            </p>
          </div>

          <form id={formId} action={formAction} />

          <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                className="shrink-0 border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="h-3.5 w-3.5" />
                削除する
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>コミュニティを削除しますか？</DialogTitle>
                <DialogDescription className="space-y-2">
                  <span className="block font-medium text-foreground">
                    「{communityName}」を削除します。
                  </span>
                  <span className="block">この操作は取り消せません。</span>
                </DialogDescription>
              </DialogHeader>
              {error?.userMessage ? (
                <Alert variant="destructive">
                  <AlertTitle>削除できませんでした</AlertTitle>
                  <AlertDescription>{error.userMessage}</AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <Button type="submit" form={formId} variant="destructive" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      削除中...
                    </>
                  ) : (
                    "コミュニティを削除"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
