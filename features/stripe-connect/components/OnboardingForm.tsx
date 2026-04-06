/**
 * Stripe 入金設定オンボーディングフォームコンポーネント
 */

"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import {
  Loader2,
  Smartphone,
  ShieldCheck,
  Zap,
  ChevronDown,
  BookOpen,
  ExternalLink,
  FileCheck,
  Building2,
  Lock,
} from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type StartOnboardingPayload = Record<string, never>;

type StartOnboardingResult = ActionResult<StartOnboardingPayload>;

type OnboardingFormAction = (
  state: StartOnboardingResult,
  formData: FormData
) => Promise<StartOnboardingResult>;

type RepresentativeCommunityOption = {
  id: string;
  name: string;
  publicPageUrl: string;
  slug: string;
};

interface OnboardingFormProps {
  communities: RepresentativeCommunityOption[];
  defaultRepresentativeCommunityId: string;
  hasExistingAccount?: boolean;
  onStartOnboarding: OnboardingFormAction;
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

const BENEFITS = [
  {
    icon: Smartphone,
    title: "かんたん",
    description: "参加者はリンクからすぐに支払い。現金の手間ゼロ",
  },
  {
    icon: ShieldCheck,
    title: "安全",
    description: "Stripeが決済を安全に処理。個人情報は当サービスに保存されません",
  },
  {
    icon: Zap,
    title: "自動送金",
    description: "集金は自動であなたの銀行口座に入金されます",
  },
] as const;

export function OnboardingForm({
  communities,
  defaultRepresentativeCommunityId,
  hasExistingAccount = false,
  onStartOnboarding,
}: OnboardingFormProps) {
  const [selectedCommunityId, setSelectedCommunityId] = useState(defaultRepresentativeCommunityId);
  const [state, formAction, isPending] = useActionState(onStartOnboarding, initialState);
  const [isSupplementOpen, setIsSupplementOpen] = useState(false);

  const error = state.success ? undefined : state.error;
  const representativeCommunityError = error?.fieldErrors?.representativeCommunityId?.[0];
  const hasMultipleCommunities = communities.length > 1;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* ① ヒーローセクション */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          {hasExistingAccount ? "オンライン集金の設定を再開" : "オンライン集金を始めよう"}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
          参加費や会費をオンラインで受け取れるようになります。
          <br className="hidden sm:block" />
          現金管理の手間から解放されましょう。
        </p>
      </div>

      {/* ② メリットグリッド */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div
              key={benefit.title}
              className="flex flex-col items-center text-center rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 mb-3">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-semibold mb-1">{benefit.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{benefit.description}</p>
            </div>
          );
        })}
      </div>

      {/* エラー表示 */}
      {!state.success && error?.userMessage ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>設定を開始できませんでした</AlertTitle>
          <AlertDescription>{error.userMessage}</AlertDescription>
        </Alert>
      ) : null}

      {/* ③ アクションエリア */}
      <form action={formAction} noValidate>
        {/* 代表コミュニティ選択 — 複数コミュニティ時のみ */}
        {hasMultipleCommunities ? (
          <div className="mb-6">
            <div className="mb-3">
              <Label className="text-sm font-semibold">代表コミュニティを選択</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Stripe
                アカウントに紐づくコミュニティです。設定完了後、すべてのコミュニティでオンライン集金が利用可能になります。
              </p>
            </div>
            <RadioGroup
              value={selectedCommunityId}
              onValueChange={setSelectedCommunityId}
              className="grid gap-2"
              aria-invalid={representativeCommunityError ? true : undefined}
              aria-describedby={
                representativeCommunityError ? "representative-community-error" : undefined
              }
            >
              {communities.map((community) => (
                <label
                  key={community.id}
                  htmlFor={`community-${community.id}`}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                    selectedCommunityId === community.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/60 bg-card hover:border-primary/30"
                  }`}
                >
                  <RadioGroupItem value={community.id} id={`community-${community.id}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{community.name}</p>
                  </div>
                </label>
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
      </form>

      {/* ④ 補足情報（Collapsible） */}
      <Collapsible open={isSupplementOpen} onOpenChange={setIsSupplementOpen} className="mt-8">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
          >
            設定に必要なもの・ガイド
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

            {/* ガイドリンク */}
            <div className="border-t border-border/40 pt-3">
              <Link
                href="/settings/payments/guide"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <BookOpen className="h-3.5 w-3.5" />
                回答に迷ったら：設定ガイドを見る
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
