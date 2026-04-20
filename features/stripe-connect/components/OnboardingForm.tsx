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
    <div className="w-full max-w-2xl mx-auto">
      <OnboardingIntro hasExistingAccount={hasExistingAccount} />

      {/* エラー表示 */}
      {!state.success && error?.userMessage ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>設定を開始できませんでした</AlertTitle>
          <AlertDescription>{error.userMessage}</AlertDescription>
        </Alert>
      ) : null}

      {/* アクションエリア */}
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate>
        {/* 代表コミュニティ選択 — 複数コミュニティ時のみ */}
        {hasMultipleCommunities ? (
          <div className="mb-6">
            <div className="mb-3">
              <Label className="text-sm font-semibold">代表コミュニティを選択</Label>
              <p className="text-xs text-muted-foreground mt-1">
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
                  className={`flex items-center gap-3 rounded-xl border p-3.5 transition-all ${
                    selectedCommunityId === community.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/60 bg-card hover:border-primary/30"
                  }`}
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
          /* 単一コミュニティ — hidden で送信 */
          <input type="hidden" name="representativeCommunityId" value={communities[0]?.id ?? ""} />
        )}
        <input type="hidden" name="communityDescription" value={communityDescription} />
        <input type="hidden" name="intent" value={intent ?? ""} />

        {/* CTA ボタン */}
        <Button
          type="submit"
          className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
          size="lg"
          disabled={isPending || communities.length === 0}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              設定画面を準備しています…
            </>
          ) : hasExistingAccount ? (
            "設定を再開する"
          ) : (
            "オンライン集金を有効にする"
          )}
        </Button>

        {/* セキュリティ補足 — CTA直下 */}
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-3">
          <Lock className="h-3 w-3" />
          Stripeの安全な画面で設定します・約3分で完了
        </p>

        {secondaryAction ? <div className="mt-4">{secondaryAction}</div> : null}
      </form>

      <Dialog open={isDescriptionDialogOpen} onOpenChange={setIsDescriptionDialogOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl duration-500 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[51%] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center gap-3 mb-2 text-left">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <DialogTitle className="text-xl font-bold">コミュニティ説明を入力する</DialogTitle>
            </div>
            <DialogDescription className="text-sm leading-relaxed text-left text-muted-foreground">
              オンライン集金設定のために、簡単にグループやコミュニティの集金内容・活動内容の説明を入力してください。
              あとから変更できます。
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pt-4 pb-0 space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-left">
                <Label
                  htmlFor="onboarding-community-description"
                  className="text-sm font-semibold text-foreground/90"
                >
                  コミュニティ・グループの説明
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

              <div className="relative group">
                <Textarea
                  id="onboarding-community-description"
                  value={communityDescription}
                  onChange={(event) => handleCommunityDescriptionChange(event.target.value)}
                  placeholder="例: 月に1〜2回集まり、テーマに沿った本や最近読んだ一冊について語り合う読書コミュニティです。小説、ビジネス書、エッセイなどジャンルは幅広く、本を通じて新しい考え方や出会いを楽しむ場を目指しています。"
                  className="min-h-40 resize-none bg-muted/20 focus:bg-background transition-all border-border/60 focus:border-primary/50 text-sm leading-relaxed p-4 ring-offset-background placeholder:text-muted-foreground/40"
                  aria-invalid={communityDescriptionError ? true : undefined}
                />
              </div>

              {communityDescriptionError && (
                <div className="flex items-center gap-2 text-destructive animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-[13px] font-medium">{communityDescriptionError}</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="p-6 flex-row sm:justify-between items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDescriptionDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground shrink-0 font-medium"
            >
              キャンセル
            </Button>
            <Button
              type="button"
              onClick={handleConfirmCommunityDescription}
              className="px-8 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all font-bold"
            >
              保存して設定に進む
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ガイドリンク */}
      <div className="mt-8">
        <Link
          href="/settings/payments/guide"
          target="_blank"
          rel="noopener noreferrer"
          className="group block rounded-xl border border-border/60 bg-muted/30 p-4 transition-all hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border border-border/40 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
              <BookOpen className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 group-hover:text-primary transition-colors">
                設定に迷ったら
                <ExternalLink className="h-3 w-3 opacity-40 group-hover:opacity-70" />
              </div>
              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                どのように入力すべきか迷ったときの参考ガイドです。
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* ④ 補足情報（Collapsible） */}
      <Collapsible open={isSupplementOpen} onOpenChange={setIsSupplementOpen} className="mt-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
          >
            設定に必要なもの
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                isSupplementOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
            {/* 準備物 */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-foreground">ご準備いただくもの</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <FileCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  本人確認書類（運転免許証、パスポートなど）
                </li>
                <li className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  銀行口座情報（入金先として登録します）
                </li>
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
