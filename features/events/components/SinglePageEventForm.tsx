"use client";

import { useEffect, useState, type JSX } from "react";

import Link from "next/link";

import { format } from "date-fns";
import {
  MapPinIcon,
  UsersIcon,
  WalletIcon,
  CreditCardIcon,
  InfoIcon,
  ClockIcon,
  AlignLeftIcon,
  CheckIcon,
} from "lucide-react";

import { getCurrentJstTime } from "@core/utils/timezone";

import { useMobileBottomOverlay } from "@/components/layout/mobile-chrome-context";
import { cn } from "@/components/ui/_lib/cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { useEventForm, type CreateEventAction } from "../hooks/useEventForm";

import { EventFormTimeline } from "./EventFormTimeline";
import { FeeCalculatorDisplay } from "./FeeCalculatorDisplay";

type FormSectionProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

function FormSection({ title, description, icon, children, className }: FormSectionProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-lg border border-border/70 bg-card shadow-none",
        className
      )}
    >
      <div className="border-b border-border/70 bg-muted/20 p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          {icon && (
            <div className="hidden size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-primary sm:flex">
              {icon}
            </div>
          )}
          <div>
            <CardTitle className="text-base font-semibold tracking-tight text-foreground md:text-lg">
              {title}
            </CardTitle>
            {description && (
              <CardDescription className="mt-1 text-sm text-muted-foreground">
                {description}
              </CardDescription>
            )}
          </div>
        </div>
      </div>
      <CardContent className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-5">{children}</CardContent>
    </Card>
  );
}

// =====================================================
// SinglePageEventForm - メインフォームコンポーネント
// =====================================================
type SinglePageEventFormProps = {
  canUseOnlinePayments?: boolean;
  connectStatus?: {
    actionUrl?: string;
  };
  currentCommunityName: string;
  createEventAction: CreateEventAction;
};

function SinglePageEventForm({
  canUseOnlinePayments = false,
  connectStatus,
  currentCommunityName,
  createEventAction,
}: SinglePageEventFormProps): JSX.Element {
  useMobileBottomOverlay(true);

  const { form, onSubmit, isPending, isFreeEvent } = useEventForm({ createEventAction });

  // 決済方法の選択状態
  const paymentMethods = form.watch("payment_methods");
  const isOnlineSelected = Array.isArray(paymentMethods) && paymentMethods.includes("stripe");

  // 参加費を監視（手取り表示用）
  const watchedFee = form.watch("fee");
  const feeAmount = watchedFee && watchedFee.trim() !== "" ? Number(watchedFee) : 0;

  // SSR不整合を避けるため、DateTimePickerのmin値をクライアント側で設定
  const [minDateObject, setMinDateObject] = useState<Date | undefined>(undefined);

  useEffect(() => {
    const now = getCurrentJstTime();
    now.setHours(now.getHours() + 1);
    setMinDateObject(now);
  }, []);

  // フォームの値を監視（タイムライン表示用）
  const watchedDate = form.watch("date");
  const watchedRegistrationDeadline = form.watch("registration_deadline");
  const watchedPaymentDeadline = form.watch("payment_deadline");
  const watchedGracePeriodDays = form.watch("grace_period_days");
  const watchedAllowPaymentAfterDeadline = form.watch("allow_payment_after_deadline");

  // タイムラインコンポーネント（共通化）
  const TimelinePreview = (
    <EventFormTimeline
      registrationDeadline={watchedRegistrationDeadline}
      paymentDeadline={isOnlineSelected ? watchedPaymentDeadline : undefined}
      eventDate={watchedDate}
      gracePeriodDays={
        isOnlineSelected && watchedAllowPaymentAfterDeadline ? watchedGracePeriodDays : undefined
      }
      className="h-full"
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 pb-28 pt-3 sm:gap-6 sm:px-6 sm:pb-32 lg:px-8 lg:pt-8">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:gap-4 sm:pb-5 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.16em]">
            {currentCommunityName}
          </p>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              新しいイベントを作成
            </h1>
          </div>
        </div>
        <div
          className={cn(
            "inline-flex w-fit max-w-full items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium",
            canUseOnlinePayments
              ? "border-primary/20 bg-primary/5 text-primary"
              : "border-border bg-background text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              canUseOnlinePayments ? "bg-primary" : "bg-muted-foreground/40"
            )}
          />
          {canUseOnlinePayments ? "オンライン集金 利用可" : "オンライン集金 未設定"}
        </div>
      </header>

      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-0" noValidate>
          <div className="grid grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-12 lg:gap-8">
            {/* 左カラム: 入力フォーム */}
            <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-7 xl:col-span-8">
              {/* ============================================= */}
              {/* Section 1: 基本情報 */}
              {/* ============================================= */}
              <FormSection
                title="基本情報"
                description="イベントの内容や場所を入力してください"
                icon={<AlignLeftIcon className="w-5 h-5" />}
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        イベント名 <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="例：勉強会、夏合宿、会費の集金など"
                          disabled={isPending}
                          maxLength={100}
                          className="h-11 bg-background"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">説明・備考（任意）</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="参加者に伝えたいイベントの詳細を入力してください"
                          disabled={isPending}
                          rows={4}
                          maxLength={1000}
                          className="min-h-28 resize-none bg-background"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">場所（任意）</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            {...field}
                            placeholder="例：〇〇会議室、〇〇居酒屋など"
                            disabled={isPending}
                            maxLength={200}
                            className="h-11 bg-background pl-10"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">定員（任意）</FormLabel>
                      <FormControl>
                        <div className="relative w-full sm:max-w-xs">
                          <UsersIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            {...field}
                            type="number"
                            placeholder="例：50"
                            disabled={isPending}
                            min="1"
                            max="10000"
                            className="h-11 bg-background pl-10 pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                            人
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>

              {/* ============================================= */}
              {/* Section 2: 日時・締め切り */}
              {/* ============================================= */}
              <FormSection
                title="日時・締め切り"
                description="開催日時と出欠確認の締め切りを設定します"
                icon={<ClockIcon className="w-5 h-5" />}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          開催日時 <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <DateTimePicker
                            value={field.value ? new Date(field.value) : undefined}
                            onChange={(date) => {
                              if (date) {
                                const formatted = format(date, "yyyy-MM-dd'T'HH:mm");
                                field.onChange(formatted);
                              } else {
                                field.onChange("");
                              }
                            }}
                            placeholder="開催日時を選択"
                            disabled={isPending}
                            minDate={minDateObject}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="registration_deadline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          出欠回答期限 <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <DateTimePicker
                            value={field.value ? new Date(field.value) : undefined}
                            onChange={(date) => {
                              if (date) {
                                const formatted = format(date, "yyyy-MM-dd'T'HH:mm");
                                field.onChange(formatted);
                              } else {
                                field.onChange("");
                              }
                            }}
                            placeholder="出欠回答期限を選択"
                            disabled={isPending}
                            minDate={minDateObject}
                          />
                        </FormControl>
                        {/* <FormDescription>通常、開催日の1〜3日前に設定します</FormDescription> */}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </FormSection>

              {/* ============================================= */}
              {/* Section 3: 参加費・決済 */}
              {/* ============================================= */}
              <FormSection
                title="参加費・集金"
                description="参加費の金額や集金方法を設定します"
                icon={<WalletIcon className="w-5 h-5" />}
              >
                {/* 参加費入力 */}
                <FormField
                  control={form.control}
                  name="fee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        参加費 <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative w-full sm:max-w-xs">
                          <Input
                            {...field}
                            type="number"
                            placeholder="0（無料）または100以上"
                            disabled={isPending}
                            min="0"
                            max="1000000"
                            className="h-11 bg-background pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                            円
                          </span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        0円（無料）または100円以上で設定してください
                      </FormDescription>
                      {feeAmount >= 100 && canUseOnlinePayments && (
                        <div className="mt-4">
                          <FeeCalculatorDisplay fee={feeAmount} />
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 決済方法選択（有料イベント時のみ） */}
                {!isFreeEvent ? (
                  <FormField
                    control={form.control}
                    name="payment_methods"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          集金方法を選択 <span className="text-red-500">*</span>
                        </FormLabel>

                        <div
                          className="mt-3 flex flex-col gap-3 sm:grid sm:grid-cols-2"
                          data-testid="payment-methods"
                        >
                          {/* 現金払い */}
                          <label
                            className={cn(
                              "relative flex min-h-[5.25rem] items-center rounded-lg border p-4 transition-colors sm:min-h-24",
                              isPending ? "opacity-70 cursor-not-allowed" : "cursor-pointer",
                              Array.isArray(field.value) && field.value.includes("cash")
                                ? "border-primary/50 bg-primary/5"
                                : "border-border bg-background hover:border-primary/30"
                            )}
                          >
                            <input
                              type="checkbox"
                              className="absolute opacity-0 w-0 h-0"
                              checked={Array.isArray(field.value) && field.value.includes("cash")}
                              onChange={(e) => {
                                const current = Array.isArray(field.value) ? field.value : [];
                                const next = e.target.checked
                                  ? Array.from(new Set([...current, "cash"]))
                                  : current.filter((m) => m !== "cash");
                                field.onChange(next);
                              }}
                              disabled={isPending}
                            />
                            <div className="flex items-center gap-3 pr-8">
                              <div
                                className={cn(
                                  "flex size-10 items-center justify-center rounded-md border",
                                  Array.isArray(field.value) && field.value.includes("cash")
                                    ? "border-primary/20 bg-primary/10 text-primary"
                                    : "border-border bg-muted/40 text-muted-foreground"
                                )}
                              >
                                <WalletIcon className="w-5 h-5" />
                              </div>
                              <div>
                                <span className="block text-sm font-semibold text-foreground">
                                  現金
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  当日現地などで集金
                                </span>
                              </div>
                            </div>
                            {Array.isArray(field.value) && field.value.includes("cash") && (
                              <div className="absolute right-3 top-3 flex size-5 animate-in items-center justify-center rounded-full bg-primary text-primary-foreground duration-200 zoom-in-50">
                                <CheckIcon className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            )}
                          </label>

                          {/* オンライン決済 */}
                          <label
                            className={cn(
                              "relative flex min-h-[5.25rem] items-center rounded-lg border p-4 transition-colors sm:min-h-24",
                              !canUseOnlinePayments || isPending
                                ? "opacity-60 cursor-not-allowed"
                                : "cursor-pointer",
                              Array.isArray(field.value) && field.value.includes("stripe")
                                ? "border-primary/50 bg-primary/5"
                                : "border-border bg-background hover:border-primary/30"
                            )}
                          >
                            <input
                              type="checkbox"
                              className="absolute opacity-0 w-0 h-0"
                              checked={Array.isArray(field.value) && field.value.includes("stripe")}
                              onChange={(e) => {
                                const current = Array.isArray(field.value) ? field.value : [];
                                const next = e.target.checked
                                  ? Array.from(new Set([...current, "stripe"]))
                                  : current.filter((m) => m !== "stripe");
                                field.onChange(next);
                              }}
                              disabled={isPending || !canUseOnlinePayments}
                            />
                            <div className="flex items-center gap-3 pr-8">
                              <div
                                className={cn(
                                  "flex size-10 items-center justify-center rounded-md border",
                                  Array.isArray(field.value) && field.value.includes("stripe")
                                    ? "border-primary/20 bg-primary/10 text-primary"
                                    : "border-border bg-muted/40 text-muted-foreground"
                                )}
                              >
                                <CreditCardIcon className="w-5 h-5" />
                              </div>
                              <div>
                                <span className="block text-sm font-semibold text-foreground">
                                  オンライン
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  クレジットカード、Apple Pay、Google Payなど
                                </span>
                              </div>
                            </div>
                            {Array.isArray(field.value) && field.value.includes("stripe") && (
                              <div className="absolute right-3 top-3 flex size-5 animate-in items-center justify-center rounded-full bg-primary text-primary-foreground duration-200 zoom-in-50">
                                <CheckIcon className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            )}
                          </label>
                        </div>

                        {!canUseOnlinePayments && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            「オンライン決済」を選択するにはオンライン集金設定が必要です。
                            <Link
                              href={connectStatus?.actionUrl ?? "/settings/payments"}
                              className="ml-1 font-medium underline underline-offset-4"
                            >
                              設定に進む
                            </Link>
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <Alert
                    variant="success"
                    className="border-primary/20 bg-primary/5 text-foreground"
                  >
                    <CheckIcon className="size-4" />
                    <AlertTitle>参加費が0円のため、決済方法の設定は不要です</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                      参加者は無料でイベントに参加できます
                    </AlertDescription>
                  </Alert>
                )}

                {/* オンライン決済設定（Stripe選択時のみ表示） */}
                {!isFreeEvent && isOnlineSelected && (
                  <div
                    className={cn(
                      "flex flex-col gap-6 rounded-lg border border-primary/20 bg-primary/5 p-4 md:p-5",
                      "transition-all duration-300 ease-in-out animate-in fade-in slide-in-from-top-1"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <InfoIcon className="mt-0.5 h-4 w-4 text-primary" />
                      <p className="text-xs text-muted-foreground">
                        オンライン集金を選択した場合、オンライン支払い期限を設定できます。
                      </p>
                    </div>

                    {/* オンライン支払い期限 */}
                    <FormField
                      control={form.control}
                      name="payment_deadline"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">
                            オンライン支払い期限 <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <DateTimePicker
                              value={field.value ? new Date(field.value) : undefined}
                              onChange={(date) => {
                                if (date) {
                                  const formatted = format(date, "yyyy-MM-dd'T'HH:mm");
                                  field.onChange(formatted);
                                } else {
                                  field.onChange("");
                                }
                              }}
                              placeholder="オンライン支払い期限を選択"
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormDescription>（後払いも可能）</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* オンライン支払い期限後の支払い許可設定 */}
                    <div className="rounded-lg border border-border bg-background p-4 md:p-5">
                      <FormField
                        control={form.control}
                        name="allow_payment_after_deadline"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between gap-4 space-y-0">
                            <div className="flex flex-col gap-1 leading-none">
                              <FormLabel className="text-sm font-medium">
                                期限後もオンライン支払いを許可
                              </FormLabel>
                              <FormDescription>
                                オンライン支払い期限後も一定期間オンライン支払いを受け付けます（最長30日まで）
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isPending}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {form.watch("allow_payment_after_deadline") && (
                        <div className="mt-4 border-t border-border pt-4">
                          <FormField
                            control={form.control}
                            name="grace_period_days"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">
                                  猶予期間（日）
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="30"
                                    step="1"
                                    placeholder="7"
                                    disabled={isPending}
                                    className="h-11 w-full bg-background sm:max-w-xs"
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      field.onChange(v);
                                      void form.trigger();
                                    }}
                                  />
                                </FormControl>
                                <FormDescription>
                                  オンライン支払い期限からの猶予日数（0〜30日）
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </FormSection>

              {/* モバイル用: オンライン支払い期限まで入力した後にタイムライン表示 */}
              <div className="lg:hidden">
                {watchedDate && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    {TimelinePreview}
                  </div>
                )}
              </div>
            </div>

            {/* 右カラム: タイムライン & 補足情報 */}
            <div className="sticky top-24 hidden flex-col gap-4 lg:col-span-5 lg:flex xl:col-span-4">
              {/* タイムラインプレビュー (デスクトップ) */}
              {watchedDate && (
                <div className="animate-in fade-in slide-in-from-right-3 duration-300">
                  {TimelinePreview}
                </div>
              )}

              {/* Tipsなどをここに配置可能 */}
              {!watchedDate && (
                <Card className="rounded-lg border border-dashed border-border bg-background/70 shadow-none">
                  <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center text-muted-foreground">
                    <ClockIcon className="mb-4 h-10 w-10 opacity-30" />
                    <p className="text-sm font-medium leading-6">
                      日時を入力すると
                      <br />
                      タイムラインプレビューが表示されます
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* 全体のエラーメッセージ */}
          {form.formState.errors.root && (
            <Alert variant="destructive" className="mt-6">
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}

          {/* Footer Actions */}
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-20px_hsl(var(--foreground)/0.35)] backdrop-blur sm:px-4 sm:pb-[calc(1rem+env(safe-area-inset-bottom))] md:left-[var(--sidebar-width)]">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
              <p className="hidden text-xs text-muted-foreground sm:block">
                入力内容を確認してイベントを作成します。
              </p>
              <div className="ml-auto grid w-full grid-cols-[6.5rem_1fr] items-center gap-2 sm:flex sm:w-auto sm:gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => (window.location.href = "/events")}
                  disabled={isPending}
                  className="h-11 text-muted-foreground"
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="h-11 min-w-0 rounded-md px-4 text-sm font-semibold transition-transform active:scale-[0.98] sm:min-w-36 sm:px-6"
                >
                  {isPending ? (
                    <>
                      <div className="mr-2 size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-b-primary-foreground" />
                      作成中...
                    </>
                  ) : (
                    "イベントを作成"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

export { SinglePageEventForm };
