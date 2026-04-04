/**
 * Stripe 入金設定オンボーディングフォームコンポーネント
 */

"use client";

import { useActionState, useState, type ReactNode } from "react";

import Link from "next/link";

import {
  Loader2,
  CreditCard,
  BookOpen,
  ExternalLink,
  FileCheck,
  Building2,
  Clock,
  Link2,
} from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

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

export function OnboardingForm({
  communities,
  defaultRepresentativeCommunityId,
  hasExistingAccount = false,
  onStartOnboarding,
}: OnboardingFormProps) {
  const [selectedCommunityId, setSelectedCommunityId] = useState(defaultRepresentativeCommunityId);
  const [state, formAction, isPending] = useActionState(onStartOnboarding, initialState);

  const error = state.success ? undefined : state.error;
  const representativeCommunityError = error?.fieldErrors?.representativeCommunityId?.[0];
  const selectedCommunity =
    communities.find((community) => community.id === selectedCommunityId) ?? communities[0] ?? null;

  return (
    <Card className="w-full max-w-4xl mx-auto shadow-lg">
      <CardHeader className="space-y-4">
        <CardTitle className="flex items-center gap-2 text-xl">
          <div className="p-2 rounded-lg bg-primary/10">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          Stripe アカウント設定
        </CardTitle>
        <CardDescription className="text-base leading-relaxed">
          オンライン集金を有効化するため、Stripe アカウントの設定が必要です。
        </CardDescription>
        <div className="pt-2">
          <Link
            href="/settings/payments/guide"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors border border-primary/20"
          >
            <BookOpen className="h-4 w-4" />
            回答に迷ったら：設定回答の参考ページを見る
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {!state.success && error?.userMessage ? (
          <Alert variant="destructive">
            <AlertTitle>設定を開始できませんでした</AlertTitle>
            <AlertDescription>{error.userMessage}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-6" noValidate>
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            {communities.length === 1 ? (
              <>
                <input type="hidden" name="representativeCommunityId" value={communities[0].id} />
                <p className="text-sm text-muted-foreground">
                  <span className="font-bold"> {communities[0].name} </span>をStripe
                  アカウント設定に使用します。
                </p>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="representative-community">代表コミュニティの選択</Label>
                  <p className="text-sm text-muted-foreground">
                    Stripe アカウント設定で使う代表コミュニティを1つ選択してください。
                    <br />
                    設定が完了すると、ここで選択したコミュニティだけでなく、あなたが管理するすべてのコミュニティでオンライン集金が利用可能になります。
                  </p>
                </div>
                <select
                  id="representative-community"
                  name="representativeCommunityId"
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedCommunityId}
                  onChange={(event) => setSelectedCommunityId(event.target.value)}
                  aria-invalid={representativeCommunityError ? true : undefined}
                  aria-describedby={
                    representativeCommunityError ? "representative-community-error" : undefined
                  }
                >
                  {communities.map((community) => (
                    <option key={community.id} value={community.id}>
                      {community.name}
                    </option>
                  ))}
                </select>
                {representativeCommunityError ? (
                  <p
                    id="representative-community-error"
                    className="text-sm font-medium text-destructive"
                    role="alert"
                  >
                    {representativeCommunityError}
                  </p>
                ) : null}
              </>
            )}

            {selectedCommunity ? (
              <div className="rounded-lg border bg-background/80 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Link2 className="h-4 w-4 text-primary" />
                  コミュニティプロフィール URL
                </div>
                <Link
                  href={selectedCommunity.publicPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-start gap-1 text-sm text-primary hover:underline break-all"
                >
                  <span>{selectedCommunity.publicPageUrl}</span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                </Link>
              </div>
            ) : null}
          </div>

          <Alert variant="default" className="border-muted bg-muted/30">
            <div className="space-y-3">
              <p className="font-semibold text-sm">ご準備いただくもの</p>
              <ul className="space-y-2">
                <PreparationItem
                  icon={<FileCheck className="h-4 w-4" />}
                  text="本人確認書類（運転免許証、パスポートなど）"
                />
                <PreparationItem
                  icon={<Building2 className="h-4 w-4" />}
                  text="銀行口座情報（Stripeのページで入力します）"
                />
                <PreparationItem
                  icon={<Clock className="h-4 w-4" />}
                  text="所要時間：約3〜5分（途中保存可能）"
                />
              </ul>
            </div>
          </Alert>

          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
            size="lg"
            disabled={isPending || communities.length === 0}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                設定を開始しています...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-5 w-5" />
                {hasExistingAccount ? "設定を再開する" : "設定を始める"}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface PreparationItemProps {
  icon: ReactNode;
  text: string;
}

function PreparationItem({ icon, text }: PreparationItemProps) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <div className="flex-shrink-0 mt-0.5 text-primary">{icon}</div>
      <span className="text-muted-foreground">{text}</span>
    </li>
  );
}
