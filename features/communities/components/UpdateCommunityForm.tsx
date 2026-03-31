"use client";

import { useActionState } from "react";

import { CheckCircle2, Loader2 } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
    <div className="rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="space-y-6 p-6">
        {!state.success && error?.userMessage ? (
          <Alert variant="destructive">
            <AlertTitle>更新できませんでした</AlertTitle>
            <AlertDescription>{error.userMessage}</AlertDescription>
          </Alert>
        ) : null}

        {state.success && state.message ? (
          <Alert className="border-primary/30 bg-primary/5 text-primary [&>svg]:text-primary">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>更新しました</AlertTitle>
            <AlertDescription className="text-primary/80">{state.message}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="community-settings-name" className="text-sm font-medium">
              コミュニティ名
            </Label>
            <Input
              id="community-settings-name"
              name="name"
              defaultValue={defaultName}
              required
              className="h-10"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "community-settings-name-error" : undefined}
            />
            <p className="text-xs text-muted-foreground">
              公開ページに表示されます。招待ページや公開ページに表示されます。
            </p>
            {nameError ? (
              <p
                id="community-settings-name-error"
                className="text-xs font-medium text-destructive"
                role="alert"
              >
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="community-settings-description" className="text-sm font-medium">
              コミュニティの説明
              <span className="ml-2 text-xs font-normal text-muted-foreground">任意</span>
            </Label>
            <Textarea
              id="community-settings-description"
              name="description"
              defaultValue={defaultDescription ?? ""}
              placeholder="活動内容や集金内容など"
              className="min-h-28 resize-none"
            />
            <p className="text-xs text-muted-foreground">
              空欄で保存すると説明文は未設定になります。
            </p>
          </div>

          <div className="flex justify-end border-t border-border/60 pt-5">
            <Button type="submit" disabled={isPending} className="min-w-32">
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
      </div>
    </div>
  );
}
