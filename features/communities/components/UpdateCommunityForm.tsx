"use client";

import { useActionState } from "react";

import { CheckCircle2, Loader2, Pencil } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type UpdateCommunityPayload = {
  communityId: string;
  description: string | null;
  name: string;
};

export type UpdateCommunityFormState = ActionResult<UpdateCommunityPayload>;

export type UpdateCommunityFormAction = (
  state: UpdateCommunityFormState,
  formData: FormData
) => Promise<UpdateCommunityFormState>;

type UpdateCommunityFormProps = {
  defaultDescription: string | null;
  defaultName: string;
  updateCommunityAction: UpdateCommunityFormAction;
};

const initialState: UpdateCommunityFormState = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    correlationId: "",
    retryable: false,
    userMessage: "",
  },
};

export function UpdateCommunityForm({
  defaultDescription,
  defaultName,
  updateCommunityAction,
}: UpdateCommunityFormProps) {
  const [state, formAction, isPending] = useActionState(updateCommunityAction, initialState);
  const error = state.success ? undefined : state.error;
  const nameError = error?.fieldErrors?.name?.[0];

  return (
    <Card className="border-border/70 bg-background/90 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Pencil className="h-5 w-5" />
          基本情報を編集
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!state.success && error?.userMessage ? (
          <Alert variant="destructive">
            <AlertTitle>更新できませんでした</AlertTitle>
            <AlertDescription>{error.userMessage}</AlertDescription>
          </Alert>
        ) : null}

        {state.success && state.message ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>更新しました</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-6" noValidate>
          <div className="space-y-2">
            <Label htmlFor="community-settings-name">コミュニティ名</Label>
            <Input
              id="community-settings-name"
              name="name"
              defaultValue={defaultName}
              required
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "community-settings-name-error" : undefined}
            />
            <p className="text-sm text-muted-foreground">
              参加者や公開ページに表示される名前です。
            </p>
            {nameError ? (
              <p
                id="community-settings-name-error"
                className="text-sm font-medium text-destructive"
                role="alert"
              >
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="community-settings-description">説明文</Label>
            <Textarea
              id="community-settings-description"
              name="description"
              defaultValue={defaultDescription ?? ""}
              placeholder="活動内容や参加者への案内を書けます"
              className="min-h-32"
            />
            <p className="text-sm text-muted-foreground">
              任意です。空欄で保存すると説明文は未設定になります。
            </p>
          </div>

          <div className="flex justify-end border-t pt-5">
            <Button type="submit" disabled={isPending} className="min-w-36">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  更新中...
                </>
              ) : (
                "変更を保存"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
