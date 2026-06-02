/**
 * Stripe 入金設定オンボーディングフォームコンポーネント
 */

"use client";

import { useActionState, useState, type ReactNode } from "react";

import {
  Loader2,
  ChevronDown,
  FileCheck,
  Building2,
  Lock,
} from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { cn } from "@/components/ui/_lib/cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { OnboardingIntro } from "./OnboardingIntro";

type StartOnboardingPayload = Record<string, never>;

type StartOnboardingResult = ActionResult<StartOnboardingPayload>;

type OnboardingFormAction = (
  state: StartOnboardingResult,
  formData: FormData
) => Promise<StartOnboardingResult>;

type RepresentativeCommunityOption = {
  description: string | null;
  id: string;
  name: string;
  publicPageUrl: string;
  slug: string;
};

interface OnboardingFormProps {
  communities: RepresentativeCommunityOption[];
  defaultRepresentativeCommunityId: string;
  hasExistingAccount?: boolean;
  intent?: string;
  onStartOnboarding: OnboardingFormAction;
  secondaryAction?: ReactNode;
}

const initialState: StartOnboardingResult = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    correlationId: "",
    retryable: false,
    userMessage: "",
  },
};

export function OnboardingForm({
  communities,
  defaultRepresentativeCommunityId,
  hasExistingAccount = false,
  intent,
  onStartOnboarding,
  secondaryAction,
}: OnboardingFormProps) {
  const [selectedCommunityId, setSelectedCommunityId] = useState(defaultRepresentativeCommunityId);
  const [state, formAction, isPending] = useActionState(onStartOnboarding, initialState);
  const [isSupplementOpen, setIsSupplementOpen] = useState(false);

  const error = state.success ? undefined : state.error;
  const representativeCommunityError = error?.fieldErrors?.representativeCommunityId?.[0];
  const hasMultipleCommunities = communities.length > 1;

  function handleRepresentativeCommunityChange(communityId: string) {
    setSelectedCommunityId(communityId);
  }

  return (
    <div className="w-full">
      <OnboardingIntro />

      {!state.success && error?.userMessage ? (
        <Alert variant="destructive" className="mb-5 sm:mb-6">
          <AlertTitle>設定を開始できませんでした</AlertTitle>
          <AlertDescription>{error.userMessage}</AlertDescription>
        </Alert>
      ) : null}

      <form action={formAction} noValidate>
        {hasMultipleCommunities ? (
          <div className="mb-5 sm:mb-6">
            <div className="mb-3 flex flex-col gap-1">
              <Label className="text-sm font-semibold">代表コミュニティを選択</Label>
              <p className="text-xs leading-5 text-muted-foreground">
                Stripeに登録する情報の代表として使用されます。
                どれを選んでも、すべてのコミュニティで集金機能を利用できます。
              </p>
            </div>
            <RadioGroup
              value={selectedCommunityId}
              onValueChange={handleRepresentativeCommunityChange}
              className="grid gap-2"
              aria-invalid={representativeCommunityError ? true : undefined}
              aria-describedby={
                representativeCommunityError ? "representative-community-error" : undefined
              }
            >
              {communities.map((community) => (
                <div
                  key={community.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 transition-colors sm:p-3.5",
                    selectedCommunityId === community.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-background hover:border-primary/30 hover:bg-muted/30"
                  )}
                >
                  <RadioGroupItem value={community.id} id={`community-${community.id}`} />
                  <Label
                    htmlFor={`community-${community.id}`}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <span className="block text-sm font-medium truncate">{community.name}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {/* hidden input で formData に値を送信 */}
            <input type="hidden" name="representativeCommunityId" value={selectedCommunityId} />
            {representativeCommunityError ? (
              <p
                id="representative-community-error"
                className="text-sm font-medium text-destructive mt-2"
                role="alert"
              >
                {representativeCommunityError}
              </p>
            ) : null}
          </div>
        ) : (
          <input type="hidden" name="representativeCommunityId" value={communities[0]?.id ?? ""} />
        )}
        <input type="hidden" name="intent" value={intent ?? ""} />

        <Button
          type="submit"
          className="h-11 w-full text-sm font-semibold sm:h-12 sm:text-base"
          size="lg"
          disabled={isPending || communities.length === 0}
        >
          {isPending ? (
            <>
              <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
              設定画面を準備しています…
            </>
          ) : hasExistingAccount ? (
            "設定を再開する"
          ) : (
            "オンライン集金を有効にする"
          )}
        </Button>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="size-3" />
          Stripeの安全な画面で設定します・約3分で完了
        </p>

        {secondaryAction ? <div className="mt-3 sm:mt-4">{secondaryAction}</div> : null}
      </form>

      <Collapsible
        open={isSupplementOpen}
        onOpenChange={setIsSupplementOpen}
        className="mt-3 sm:mt-4"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            設定に必要なもの
            <ChevronDown
              className={`size-3.5 transition-transform duration-200 motion-reduce:transition-none ${
                isSupplementOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-lg border border-border/60 bg-muted/20 p-3.5 sm:p-4">
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-semibold text-foreground">ご準備いただくもの</p>
              <ul className="flex flex-col gap-2">
                <li className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <FileCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  本人確認書類（運転免許証、パスポートなど）
                </li>
                <li className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <Building2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  銀行口座情報（振込先として登録します）
                </li>
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
