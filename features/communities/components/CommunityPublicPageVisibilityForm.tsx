"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";

import Link from "next/link";

import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type UpdateCommunityPublicPageVisibilityPayload = {
  communityId: string;
  showCommunityLink: boolean;
  showLegalDisclosureLink: boolean;
};

export type UpdateCommunityPublicPageVisibilityFormState =
  ActionResult<UpdateCommunityPublicPageVisibilityPayload>;

export type UpdateCommunityPublicPageVisibilityFormAction = (
  state: UpdateCommunityPublicPageVisibilityFormState,
  formData: FormData
) => Promise<UpdateCommunityPublicPageVisibilityFormState>;

type CommunityPublicPageVisibilityFormProps = {
  defaultShowCommunityLink: boolean;
  defaultShowLegalDisclosureLink: boolean;
  legalPageUrl: string;
  publicPageUrl: string;
  updateCommunityPublicPageVisibilityAction: UpdateCommunityPublicPageVisibilityFormAction;
};

type VisibilityValues = {
  showCommunityLink: boolean;
  showLegalDisclosureLink: boolean;
};

const initialState: UpdateCommunityPublicPageVisibilityFormState = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    correlationId: "",
    retryable: false,
    userMessage: "",
  },
};

export function CommunityPublicPageVisibilityForm({
  defaultShowCommunityLink,
  defaultShowLegalDisclosureLink,
  legalPageUrl,
  publicPageUrl,
  updateCommunityPublicPageVisibilityAction,
}: CommunityPublicPageVisibilityFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateCommunityPublicPageVisibilityAction,
    initialState
  );
  const [values, setValues] = useState<VisibilityValues>({
    showCommunityLink: defaultShowCommunityLink,
    showLegalDisclosureLink: defaultShowLegalDisclosureLink,
  });
  const [baseline, setBaseline] = useState<VisibilityValues>({
    showCommunityLink: defaultShowCommunityLink,
    showLegalDisclosureLink: defaultShowLegalDisclosureLink,
  });
  const error = state.success ? undefined : state.error;
  const isDirty =
    values.showCommunityLink !== baseline.showCommunityLink ||
    values.showLegalDisclosureLink !== baseline.showLegalDisclosureLink;

  useEffect(() => {
    if (!state.success || !state.data) {
      return;
    }

    const updatedValues = {
      showCommunityLink: state.data.showCommunityLink,
      showLegalDisclosureLink: state.data.showLegalDisclosureLink,
    };

    setValues(updatedValues);
    setBaseline(updatedValues);
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!isDirty) {
      event.preventDefault();
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background">
      <form action={formAction} className="flex flex-col" noValidate onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6">
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
            name="showCommunityLink"
            value={values.showCommunityLink ? "true" : "false"}
          />
          <input
            type="hidden"
            name="showLegalDisclosureLink"
            value={values.showLegalDisclosureLink ? "true" : "false"}
          />

          <div className="divide-y divide-border/60 rounded-md border border-border/60">
            <VisibilitySwitchRow
              id="community-profile-visibility"
              checked={values.showCommunityLink}
              disabled={isPending}
              label="コミュニティプロフィール"
              description="招待・ゲストページにコミュニティプロフィールへのリンクを表示します。公開系イベントや問い合わせ導線が必要な場合にオンにします。"
              ariaLabel="コミュニティプロフィールへのリンクを表示"
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, showCommunityLink: checked }))
              }
            />
            <VisibilitySwitchRow
              id="community-legal-disclosure-visibility"
              checked={values.showLegalDisclosureLink}
              disabled={isPending}
              label="特定商取引法に基づく表記"
              description="招待・ゲストページに特商法表記へのリンクを表示します。事業性のあるイベントなどを開く場合にオンにします。"
              ariaLabel="特定商取引法に基づく表記へのリンクを表示"
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, showLegalDisclosureLink: checked }))
              }
            />
          </div>

          <div className="flex justify-end border-t border-border/60 pt-4 sm:pt-5">
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
                "変更を保存"
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-end sm:p-5">
          <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
            <Link href={publicPageUrl} rel="noopener noreferrer" target="_blank">
              <ExternalLink className="size-3.5" />
              コミュニティプロフィールを確認
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
            <Link href={legalPageUrl} rel="noopener noreferrer" target="_blank">
              <ExternalLink className="size-3.5" />
              特商法表記を確認
            </Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

type VisibilitySwitchRowProps = {
  ariaLabel: string;
  checked: boolean;
  description: string;
  disabled: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
};

function VisibilitySwitchRow({
  ariaLabel,
  checked,
  description,
  disabled,
  id,
  label,
  onCheckedChange,
}: VisibilitySwitchRowProps) {
  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="shrink-0"
      />
    </div>
  );
}
