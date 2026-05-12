/**
 * Stripe 入金設定オンボーディングフォームコンポーネント
 */

"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import Link from "next/link";

import {
  Loader2,
  ChevronDown,
  BookOpen,
  FileCheck,
  Building2,
  Lock,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { cn } from "@/components/ui/_lib/cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

import {
  COMMUNITY_DESCRIPTION_MIN_LENGTH,
  COMMUNITY_DESCRIPTION_MIN_LENGTH_MESSAGE,
} from "../validation";

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

// const COMMUNITY_DESCRIPTION_TEMPLATE =
//   "本コミュニティでは、サークル・グループの活動やイベント等の企画・運営を行っています。\nイベント管理プラットフォーム「みんなの集金」を利用して、イベント開催時の参加費や会費の支払い受付を行っています。\n詳細な内容や料金、支払方法は各イベントの案内で確認できます。";

const COMMUNITY_DESCRIPTION_REQUIRED_MESSAGE = "コミュニティ説明を入力してください";

export function OnboardingForm({
  communities,
  defaultRepresentativeCommunityId,
  hasExistingAccount = false,
  intent,
  onStartOnboarding,
  secondaryAction,
}: OnboardingFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedCommunityId, setSelectedCommunityId] = useState(defaultRepresentativeCommunityId);
  const [state, formAction, isPending] = useActionState(onStartOnboarding, initialState);
  const [isSupplementOpen, setIsSupplementOpen] = useState(false);
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false);
  const [isDescriptionConfirmed, setIsDescriptionConfirmed] = useState(false);
  const [communityDescription, setCommunityDescription] = useState("");
  const [communityDescriptionError, setCommunityDescriptionError] = useState<string>();

  const error = state.success ? undefined : state.error;
  const representativeCommunityError = error?.fieldErrors?.representativeCommunityId?.[0];
  const communityDescriptionServerError = error?.fieldErrors?.communityDescription?.[0];
  const hasMultipleCommunities = communities.length > 1;
  const selectedCommunity =
    communities.find((community) => community.id === selectedCommunityId) ?? communities[0] ?? null;
  const selectedCommunityNeedsDescription =
    selectedCommunity !== null && (selectedCommunity.description?.trim() ?? "").length === 0;

  useEffect(() => {
    if (!communityDescriptionServerError) {
      return;
    }

    setCommunityDescriptionError(communityDescriptionServerError);
    setIsDescriptionConfirmed(false);
    setIsDescriptionDialogOpen(true);
  }, [communityDescriptionServerError, state]);

  useEffect(() => {
    if (!isDescriptionConfirmed || isDescriptionDialogOpen) {
      return;
    }

    formRef.current?.requestSubmit();
  }, [isDescriptionConfirmed, isDescriptionDialogOpen]);

  function handleRepresentativeCommunityChange(communityId: string) {
    setSelectedCommunityId(communityId);
    setIsDescriptionConfirmed(false);
    setCommunityDescription("");
    setCommunityDescriptionError(undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!selectedCommunityNeedsDescription || isDescriptionConfirmed) {
      return;
    }

    event.preventDefault();
    setCommunityDescriptionError(undefined);
    setIsDescriptionDialogOpen(true);
  }

  function handleCommunityDescriptionChange(value: string) {
    setCommunityDescription(value);
    if (value.trim().length > 0) {
      setCommunityDescriptionError(undefined);
    }
  }

  // function handleInsertTemplate() {
  //   setCommunityDescription(COMMUNITY_DESCRIPTION_TEMPLATE);
  //   setCommunityDescriptionError(undefined);
  // }

  function handleConfirmCommunityDescription() {
    const normalizedDescription = communityDescription.trim();
    if (!normalizedDescription) {
      setCommunityDescriptionError(COMMUNITY_DESCRIPTION_REQUIRED_MESSAGE);
      return;
    }

    if (normalizedDescription.length < COMMUNITY_DESCRIPTION_MIN_LENGTH) {
      setCommunityDescriptionError(COMMUNITY_DESCRIPTION_MIN_LENGTH_MESSAGE);
      return;
    }

    setCommunityDescription(normalizedDescription);
    setCommunityDescriptionError(undefined);
    setIsDescriptionConfirmed(true);
    setIsDescriptionDialogOpen(false);
  }

  return (
    <div className="w-full">
      <OnboardingIntro hasExistingAccount={hasExistingAccount} />

      {!state.success && error?.userMessage ? (
        <Alert variant="destructive" className="mb-5 sm:mb-6">
          <AlertTitle>設定を開始できませんでした</AlertTitle>
          <AlertDescription>{error.userMessage}</AlertDescription>
        </Alert>
      ) : null}

      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate>
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
        <input type="hidden" name="communityDescription" value={communityDescription} />
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

      <Dialog open={isDescriptionDialogOpen} onOpenChange={setIsDescriptionDialogOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto p-0 sm:max-w-[500px]">
          <DialogHeader className="p-5 pb-0 sm:p-6 sm:pb-0">
            <div className="mb-2 flex items-center gap-3 text-left">
              <div className="rounded-md border border-border/60 p-2 text-primary">
                <Building2 className="size-5" />
              </div>
              <DialogTitle className="text-lg font-semibold sm:text-xl">
                コミュニティ説明を入力する
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm leading-relaxed text-left text-muted-foreground">
              オンライン集金設定のために、グループやコミュニティについて、主にどのようなイベント・活動を行うか、主にどのような費用を集金するかの簡単な説明を入力してください。
              あとから変更できます。{" "}
              <Link
                href="/settings/payments/guide#community-profile"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                詳しく見る
              </Link>
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 px-5 pb-0 pt-4 sm:px-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 text-left">
                <Label
                  htmlFor="onboarding-community-description"
                  className="text-sm font-semibold text-foreground/90"
                >
                  コミュニティ説明
                </Label>
                {/* <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-[11px] font-medium gap-1.5 border-primary/20 hover:border-primary/50 hover:bg-primary/5 text-primary transition-all shadow-sm"
                  onClick={handleInsertTemplate}
                >
                  <FileText className="h-3 w-3" />
                  <span className="hidden sm:inline text-muted-foreground">定型文を挿入</span>
                  <span className="sm:hidden text-muted-foreground">定型文</span>
                </Button> */}
              </div>

              <div className="relative">
                <Textarea
                  id="onboarding-community-description"
                  value={communityDescription}
                  onChange={(event) => handleCommunityDescriptionChange(event.target.value)}
                  placeholder="例: 月に1〜2回集まり、テーマに沿った本や最近読んだ一冊について語り合う読書コミュニティです。小説、ビジネス書、エッセイなどジャンルは幅広く、本を通じて新しい考え方や出会いを楽しむ場を目指しています。"
                  className="min-h-36 resize-none border-border/60 bg-muted/20 p-3.5 text-sm leading-relaxed transition-colors placeholder:text-muted-foreground/40 focus:bg-background sm:min-h-40 sm:p-4"
                  aria-invalid={communityDescriptionError ? true : undefined}
                />
              </div>

              {communityDescriptionError && (
                <div
                  className="flex items-center gap-2 text-destructive animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
                  role="alert"
                >
                  <AlertCircle className="size-4" />
                  <p className="text-[13px] font-medium">{communityDescriptionError}</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col-reverse items-stretch gap-2 p-5 sm:flex-row sm:items-center sm:gap-3 sm:p-6 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDescriptionDialogOpen(false)}
              className="w-full shrink-0 font-medium text-muted-foreground hover:text-foreground sm:w-auto"
            >
              キャンセル
            </Button>
            <Button
              type="button"
              onClick={handleConfirmCommunityDescription}
              className="w-full px-4 font-semibold sm:w-auto sm:px-8"
            >
              保存して設定に進む
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-6 sm:mt-8">
        <Link
          href="/settings/payments/guide#community-profile"
          target="_blank"
          rel="noopener noreferrer"
          className="group block rounded-lg border border-border/60 bg-muted/30 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/40 bg-background text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary sm:size-9">
              <BookOpen className="size-4" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 transition-colors group-hover:text-primary">
                設定に迷ったら
                <ExternalLink className="size-3 opacity-40 group-hover:opacity-70" />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground/70">
                どのように入力すべきか迷ったときの参考ガイドです。
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* ④ 補足情報（Collapsible） */}
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
