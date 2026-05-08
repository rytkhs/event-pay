"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";

import { CheckCircle2, Loader2 } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type UpdateCommunityProfileVisibilityPayload = {
  communityId: string;
  showCommunityLink: boolean;
};

export type UpdateCommunityProfileVisibilityFormState =
  ActionResult<UpdateCommunityProfileVisibilityPayload>;

export type UpdateCommunityProfileVisibilityFormAction = (
  state: UpdateCommunityProfileVisibilityFormState,
  formData: FormData
) => Promise<UpdateCommunityProfileVisibilityFormState>;

type CommunityProfileVisibilityFormProps = {
  defaultShowCommunityLink: boolean;
  updateCommunityProfileVisibilityAction: UpdateCommunityProfileVisibilityFormAction;
};

const initialState: UpdateCommunityProfileVisibilityFormState = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    correlationId: "",
    retryable: false,
    userMessage: "",
  },
};

export function CommunityProfileVisibilityForm({
  defaultShowCommunityLink,
  updateCommunityProfileVisibilityAction,
}: CommunityProfileVisibilityFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateCommunityProfileVisibilityAction,
    initialState
  );
  const [showCommunityLink, setShowCommunityLink] = useState(defaultShowCommunityLink);
  const [baselineShowCommunityLink, setBaselineShowCommunityLink] =
    useState(defaultShowCommunityLink);
  const error = state.success ? undefined : state.error;
  const isDirty = showCommunityLink !== baselineShowCommunityLink;

  useEffect(() => {
    if (!state.success || !state.data) {
      return;
    }

    setShowCommunityLink(state.data.showCommunityLink);
    setBaselineShowCommunityLink(state.data.showCommunityLink);
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!isDirty) {
      event.preventDefault();
    }
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 p-4 sm:p-5"
      noValidate
      onSubmit={handleSubmit}
    >
      {!state.success && error?.userMessage ? (
        <Alert variant="destructive">
          <AlertTitle>更新できませんでした</AlertTitle>
          <AlertDescription>{error.userMessage}</AlertDescription>
        </Alert>
      ) : null}

      {state.success && state.message && !isDirty ? (
        <Alert className="border-primary/30 bg-primary/5 text-primary [&>svg]:text-primary">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>更新しました</AlertTitle>
          <AlertDescription className="text-primary/80">{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <input type="hidden" name="showCommunityLink" value={showCommunityLink ? "true" : "false"} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Label htmlFor="community-profile-visibility" className="text-sm font-medium">
            招待・ゲストページにコミュニティプロフィールへのリンクを表示
          </Label>
          <p className="text-xs leading-5 text-muted-foreground">
            招待ページやゲストページに「コミュニティ」リンクを表示します。
            参加者はコミュニティページから主催者へのお問い合わせに進めます。
          </p>
        </div>
        <Switch
          id="community-profile-visibility"
          checked={showCommunityLink}
          onCheckedChange={setShowCommunityLink}
          disabled={isPending}
          aria-label="参加者向けページにコミュニティプロフィールへのリンクを表示"
          className="shrink-0"
        />
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
        <p className="text-xs font-medium text-foreground">主催者へのお問い合わせについて</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          お問い合わせが送信されると、内容は主催者アカウントのメールアドレスに通知されます。
          送信後の返信や連絡は通常のメールで直接行ってください。
          プラットフォーム内に受信箱・チャット・返信管理機能はありません。
        </p>
      </div>

      <div className="flex justify-end border-t border-border/60 pt-4">
        <Button
          type="submit"
          disabled={isPending || !isDirty}
          className="w-full sm:w-auto sm:min-w-32"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              更新中...
            </>
          ) : (
            "表示設定を保存"
          )}
        </Button>
      </div>
    </form>
  );
}
