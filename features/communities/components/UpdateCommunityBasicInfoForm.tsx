"use client";

import { useActionState } from "react";

import Link from "next/link";

import { CheckCircle2, Loader2 } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type UpdateCommunityBasicInfoPayload = {
  communityId: string;
  description: string | null;
  name: string;
};

export type UpdateCommunityBasicInfoFormState = ActionResult<UpdateCommunityBasicInfoPayload>;

export type UpdateCommunityBasicInfoFormAction = (
  state: UpdateCommunityBasicInfoFormState,
  formData: FormData
) => Promise<UpdateCommunityBasicInfoFormState>;

type UpdateCommunityBasicInfoFormProps = {
  defaultDescription: string | null;
  defaultName: string;
  updateCommunityBasicInfoAction: UpdateCommunityBasicInfoFormAction;
};

const initialState: UpdateCommunityBasicInfoFormState = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    correlationId: "",
    retryable: false,
    userMessage: "",
  },
};

export function UpdateCommunityBasicInfoForm({
  defaultDescription,
  defaultName,
  updateCommunityBasicInfoAction,
}: UpdateCommunityBasicInfoFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateCommunityBasicInfoAction,
    initialState
  );
  const error = state.success ? undefined : state.error;
  const nameError = error?.fieldErrors?.name?.[0];

  return (
    <div className="rounded-lg border border-border/60 bg-background">
      <div className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-6">
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

        <form action={formAction} className="flex flex-col gap-4 sm:gap-5" noValidate>
          <div className="flex flex-col gap-2">
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
              招待ページやコミュニティプロフィールに表示されます。
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

          <div className="flex flex-col gap-2">
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
              コミュニティプロフィールに表示されます。{" "}
              <Link
                href="/settings/payments/guide#community-profile"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                詳しく見る
              </Link>
            </p>
          </div>

          <div className="flex justify-end border-t border-border/60 pt-4 sm:pt-5">
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto sm:min-w-32">
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
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
