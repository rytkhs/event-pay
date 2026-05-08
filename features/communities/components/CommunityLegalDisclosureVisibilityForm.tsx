"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";

import { CheckCircle2, Loader2 } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type UpdateCommunityLegalDisclosureVisibilityPayload = {
  communityId: string;
  showLegalDisclosureLink: boolean;
};

export type UpdateCommunityLegalDisclosureVisibilityFormState =
  ActionResult<UpdateCommunityLegalDisclosureVisibilityPayload>;

export type UpdateCommunityLegalDisclosureVisibilityFormAction = (
  state: UpdateCommunityLegalDisclosureVisibilityFormState,
  formData: FormData
) => Promise<UpdateCommunityLegalDisclosureVisibilityFormState>;

type CommunityLegalDisclosureVisibilityFormProps = {
  defaultShowLegalDisclosureLink: boolean;
  updateCommunityLegalDisclosureVisibilityAction: UpdateCommunityLegalDisclosureVisibilityFormAction;
};

const initialState: UpdateCommunityLegalDisclosureVisibilityFormState = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    correlationId: "",
    retryable: false,
    userMessage: "",
  },
};

export function CommunityLegalDisclosureVisibilityForm({
  defaultShowLegalDisclosureLink,
  updateCommunityLegalDisclosureVisibilityAction,
}: CommunityLegalDisclosureVisibilityFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateCommunityLegalDisclosureVisibilityAction,
    initialState
  );
  const [showLegalDisclosureLink, setShowLegalDisclosureLink] = useState(
    defaultShowLegalDisclosureLink
  );
  const [baselineShowLegalDisclosureLink, setBaselineShowLegalDisclosureLink] = useState(
    defaultShowLegalDisclosureLink
  );
  const error = state.success ? undefined : state.error;
  const isDirty = showLegalDisclosureLink !== baselineShowLegalDisclosureLink;

  useEffect(() => {
    if (!state.success || !state.data) {
      return;
    }

    setShowLegalDisclosureLink(state.data.showLegalDisclosureLink);
    setBaselineShowLegalDisclosureLink(state.data.showLegalDisclosureLink);
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

      <input
        type="hidden"
        name="showLegalDisclosureLink"
        value={showLegalDisclosureLink ? "true" : "false"}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Label htmlFor="community-legal-disclosure-visibility" className="text-sm font-medium">
            招待・ゲストページに特定商取引法に基づく表記リンクを表示
          </Label>
          <p className="text-xs leading-5 text-muted-foreground">
            参加者向けの招待ページやゲストページに、イベント向けの特定商取引法に基づく表記へのリンクを表示します。
          </p>
        </div>
        <Switch
          id="community-legal-disclosure-visibility"
          checked={showLegalDisclosureLink}
          onCheckedChange={setShowLegalDisclosureLink}
          disabled={isPending}
          aria-label="招待・ゲストページに特定商取引法に基づく表記リンクを表示"
          className="shrink-0"
        />
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
