"use client";

import { useActionState, useEffect, useId, useState } from "react";

import { useRouter } from "next/navigation";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="border-destructive/50 bg-destructive/5 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl text-destructive">
          <AlertTriangle className="h-5 w-5" />
          コミュニティを削除
        </CardTitle>
        <CardDescription>
          この操作は取り消せません。公開ページは非表示になり、ダッシュボードでの管理ができなくなります。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!state.success && error?.userMessage ? (
          <Alert variant="destructive">
            <AlertTitle>削除できませんでした</AlertTitle>
            <AlertDescription>{error.userMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-xl border border-destructive/30 bg-background p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h3 className="font-semibold">現在のコミュニティを削除します</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                「{communityName}
                」を削除すると、このコミュニティの設定画面や公開ページには戻れません。
                代表コミュニティに設定されている場合は削除できません。
              </p>
            </div>

            <form id={formId} action={formAction} />

            <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={isPending}
                  className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 className="h-4 w-4" />
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
      </CardContent>
    </Card>
  );
}
