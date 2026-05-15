"use client";

import { useEffect, useState, useMemo, type JSX } from "react";

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
  ChevronRightIcon,
} from "lucide-react";

import type { RestrictableField } from "@core/domain/event-edit-restrictions";
import type { PlatformFeeConfig } from "@core/stripe/fee-config/service";
import type { Event } from "@core/types/event";

import { useMobileBottomOverlay } from "@/components/layout/mobile-chrome-context";
import { cn } from "@/components/ui/_lib/cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChangeConfirmationDialog,
  type ChangeItem,
  type ValidationAnalysis,
} from "@/components/ui/change-confirmation-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

import {
  useEventEditForm,
  type EventEditFormDataRHF,
  type UpdateEventAction,
} from "../hooks/useEventEditForm";
import { useRestrictionContext, useFormDataSnapshot } from "../hooks/useUnifiedRestrictions";

import { EventFormTimeline } from "./EventFormTimeline";
import { FeeCalculatorDisplay } from "./FeeCalculatorDisplay";
import { UnifiedRestrictionNoticeV2 } from "./UnifiedRestrictionNoticeV2";

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

const changedBadgeClass =
  "border-primary/20 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/5";
const changedFieldClass = "border-primary/40 bg-primary/5";

// =====================================================
// SinglePageEventEditForm - 編集用メインフォームコンポーネント
// =====================================================
type SinglePageEventEditFormProps = {
  event: Event;
  attendeeCount: number;
  onSubmit?: (data: Event) => void;
  hasStripePaid?: boolean;
  canUseOnlinePayments?: boolean;
  updateEventAction: UpdateEventAction;
  feeEstimateConfig?: PlatformFeeConfig | null;
};

export function SinglePageEventEditForm({
  event,
  attendeeCount,
  onSubmit,
  hasStripePaid = false,
  canUseOnlinePayments = false,
  updateEventAction,
  feeEstimateConfig = null,
}: SinglePageEventEditFormProps): JSX.Element {
  useMobileBottomOverlay(true);

  const { form, isPending, hasAttendees, changes, actions, restrictions, isFreeEvent } =
    useEventEditForm({
      event,
      attendeeCount,
      onSubmit,
      hasStripePaid,
      updateEventAction,
    });

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<ChangeItem[]>([]);

  // 統一制限システム用のデータ
  const restrictionContext = useRestrictionContext(
    {
      fee: event.fee,
      capacity: event.capacity,
      payment_methods: event.payment_methods,
      title: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      date: event.date,
      registration_deadline: event.registration_deadline ?? undefined,
      payment_deadline: event.payment_deadline ?? undefined,
      allow_payment_after_deadline: event.allow_payment_after_deadline ?? undefined,
      grace_period_days: event.grace_period_days ?? undefined,
    },
    { hasAttendees, attendeeCount, hasStripePaid },
    event.status ?? "upcoming"
  );
  const formDataSnapshot = useFormDataSnapshot(form.watch());

  // 決済方法の選択状態
  const paymentMethods = form.watch("payment_methods");
  const isOnlineSelected = Array.isArray(paymentMethods) && paymentMethods.includes("stripe");

  // 参加費を監視（手取り表示用）
  const watchedFee = form.watch("fee");
  const feeAmount = watchedFee && watchedFee.trim() !== "" ? Number(watchedFee) : 0;

  // 定員を監視（参加人数表示トグルのヒント用）
  const watchedCapacity = form.watch("capacity");
  const watchedShowCapacity = form.watch("show_capacity");

  // フォームの値を監視（タイムライン表示用）
  const watchedDate = form.watch("date");
  const watchedRegistrationDeadline = form.watch("registration_deadline");
  const watchedPaymentDeadline = form.watch("payment_deadline");
  const watchedGracePeriodDays = form.watch("grace_period_days");
  const watchedAllowPaymentAfterDeadline = form.watch("allow_payment_after_deadline");

  // Stripe選択時の即時バリデーション
  useEffect(() => {
    if (isOnlineSelected && !isFreeEvent) {
      void form.trigger("payment_deadline");
    }
  }, [isOnlineSelected, isFreeEvent, form]);

  // タイムラインコンポーネント
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

  // フォーム送信処理
  const handleFormSubmit = async (_data: EventEditFormDataRHF) => {
    // 変更検出
    const detectedChanges = changes.detectChanges();

    if (detectedChanges.length === 0) {
      form.setError("root", {
        type: "manual",
        message: "変更がありません",
      });
      return;
    }

    // 変更確認ダイアログを表示
    setPendingChanges(detectedChanges);
    setShowConfirmDialog(true);
  };

  // 変更検出
  const validationAnalysis = useMemo<ValidationAnalysis>(() => {
    const blockingErrors: string[] = [];
    const advisoryWarnings: string[] = [];
    const secondaryChanges: ChangeItem[] = [];
    const normalChanges: ChangeItem[] = [];
    const r = restrictions.details; // Unified Restriction Result

    pendingChanges.forEach((change) => {
      // 1. 副次的変更の検出
      if (
        change.newValue.includes("（無料化により自動クリア）") ||
        change.newValue.includes("（オンライン決済選択解除により自動クリア）")
      ) {
        secondaryChanges.push(change);
        return;
      }

      // 2. 統一制限システムによるバリデーション
      const field = change.field as RestrictableField;
      const restrictionMessage = r.getFieldMessage(field);
      const restrictionLevel = r.getFieldRestrictionLevel(field);

      if (
        r.isFieldRestricted(field) &&
        restrictionMessage &&
        (restrictionLevel === "structural" || restrictionLevel === "conditional")
      ) {
        blockingErrors.push(`${change.fieldName}: ${restrictionMessage}`);
      } else if (restrictionMessage && restrictionLevel === "advisory") {
        if (!advisoryWarnings.includes(restrictionMessage)) {
          advisoryWarnings.push(restrictionMessage);
        }
      }

      normalChanges.push(change);
    });

    return {
      blockingErrors,
      advisoryWarnings,
      secondaryChanges,
      normalChanges,
      hasBlockingErrors: blockingErrors.length > 0,
    };
  }, [pendingChanges, restrictions.details]);

  const handleConfirmChanges = async () => {
    setShowConfirmDialog(false);
    const formData = form.getValues();
    await actions.submitFormWithChanges(formData, pendingChanges);
  };

  // 変更検知ヘルパー
  const isChanged = (field: string) => changes.hasFieldChanged(field);

  return (
    <>
      <ChangeConfirmationDialog
        isOpen={showConfirmDialog}
        analysis={validationAnalysis}
        attendeeCount={attendeeCount}
        onConfirm={handleConfirmChanges}
        onCancel={() => setShowConfirmDialog(false)}
        isLoading={isPending}
      />
      <div className="w-full">
        <header className="mb-5 flex flex-col gap-3 border-b border-border/70 pb-4 sm:mb-6 sm:gap-4 sm:pb-5 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.16em]">
              {event.title}
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              イベント編集
            </h1>
          </div>
          <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            参加者 {attendeeCount}人
          </div>
        </header>

        {/* 統合制限通知 */}
        <div className="mb-5 sm:mb-6">
          <UnifiedRestrictionNoticeV2
            restrictions={restrictionContext}
            formData={formDataSnapshot}
            showLevels={["structural", "conditional"]}
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-0" noValidate>
            <div className="grid grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-12 lg:gap-8">
              {/* 左カラム: 入力フォーム */}
              <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-7 xl:col-span-8">
                {/* ============================================= */}
                {/* Section 1: 基本情報 */}
                {/* ============================================= */}
                <FormSection
                  title="基本情報"
                  description="イベントの内容や場所を編集してください"
                  icon={<AlignLeftIcon className="w-5 h-5" />}
                >
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel className="text-sm font-medium">
                            イベント名 <span className="text-red-500">*</span>
                          </FormLabel>
                          {isChanged("title") && (
                            <Badge variant="outline" className={changedBadgeClass}>
                              変更あり
                            </Badge>
                          )}
                        </div>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="例：勉強会、夏合宿、会費の集金など"
                            disabled={isPending || !restrictions.isFieldEditable("title")}
                            maxLength={100}
                            className={cn(
                              "h-11 bg-background",
                              isChanged("title") && changedFieldClass
                            )}
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
                        <div className="flex items-center gap-2">
                          <FormLabel className="text-sm font-medium">説明・備考（任意）</FormLabel>
                          {isChanged("description") && (
                            <Badge variant="outline" className={changedBadgeClass}>
                              変更あり
                            </Badge>
                          )}
                        </div>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="参加者に伝えたいイベントの詳細を入力してください"
                            disabled={isPending || !restrictions.isFieldEditable("description")}
                            rows={4}
                            maxLength={1000}
                            className={cn(
                              "min-h-28 resize-none bg-background",
                              isChanged("description") && changedFieldClass
                            )}
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
                        <div className="flex items-center gap-2">
                          <FormLabel className="text-sm font-medium">開催場所（任意）</FormLabel>
                          {isChanged("location") && (
                            <Badge variant="outline" className={changedBadgeClass}>
                              変更あり
                            </Badge>
                          )}
                        </div>
                        <FormControl>
                          <div className="relative">
                            <MapPinIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              {...field}
                              placeholder="例：〇〇会議室、〇〇居酒屋など"
                              disabled={isPending || !restrictions.isFieldEditable("location")}
                              maxLength={200}
                              className={cn(
                                "h-11 bg-background pl-10",
                                isChanged("location") && changedFieldClass
                              )}
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
                        <div className="flex items-center gap-2">
                          <FormLabel className="text-sm font-medium">定員（任意）</FormLabel>
                          {isChanged("capacity") && (
                            <Badge variant="outline" className={changedBadgeClass}>
                              変更あり
                            </Badge>
                          )}
                        </div>
                        <FormControl>
                          <div className="relative w-full sm:max-w-xs">
                            <UsersIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              {...field}
                              type="number"
                              placeholder="例：50"
                              disabled={isPending || !restrictions.isFieldEditable("capacity")}
                              min={hasAttendees ? attendeeCount : 1}
                              max="10000"
                              className={cn(
                                "h-11 bg-background pl-10 pr-10",
                                isChanged("capacity") && changedFieldClass
                              )}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                              人
                            </span>
                          </div>
                        </FormControl>
                        {!restrictions.isFieldEditable("capacity") && (
                          <FormDescription className="text-xs text-amber-600">
                            現在の参加者数より少なく設定することはできません
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Collapsible defaultOpen={event.show_capacity || event.show_participant_count}>
                    <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                      <ChevronRightIcon className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                      表示設定
                      {(isChanged("show_capacity") || isChanged("show_participant_count")) && (
                        <Badge variant="outline" className={changedBadgeClass}>
                          変更あり
                        </Badge>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                      <div className="flex flex-col gap-4 rounded-lg border border-border/70 bg-muted/10 p-4 mt-2">
                        {watchedCapacity && watchedCapacity.trim() !== "" && (
                          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                            <FormField
                              control={form.control}
                              name="show_capacity"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center gap-3">
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      disabled={isPending}
                                    />
                                  </FormControl>
                                  <div className="flex flex-col gap-0.5 leading-none">
                                    <FormLabel className="text-sm font-medium">
                                      定員を表示する
                                    </FormLabel>
                                    <FormDescription className="text-xs animate-in fade-in duration-200">
                                      招待・ゲストページに定員を表示します
                                    </FormDescription>
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>
                        )}

                        <FormField
                          control={form.control}
                          name="show_participant_count"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center gap-3">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  disabled={isPending}
                                />
                              </FormControl>
                              <div className="flex flex-col gap-0.5 leading-none">
                                <FormLabel className="text-sm font-medium">
                                  参加人数を表示する
                                </FormLabel>
                                <FormDescription className="text-xs animate-in fade-in duration-200">
                                  {watchedCapacity &&
                                  watchedCapacity.trim() !== "" &&
                                  watchedShowCapacity
                                    ? `招待ページに参加状況バー（○名 / ${watchedCapacity}名）を表示します`
                                    : "招待ページに現在の参加人数を表示します"}
                                </FormDescription>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </FormSection>

                {/* ============================================= */}
                {/* Section 2: 日時・締め切り */}
                {/* ============================================= */}
                <FormSection
                  title="日時・締め切り"
                  description="開催日時と出欠確認の締め切りを編集します"
                  icon={<ClockIcon className="w-5 h-5" />}
                >
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <FormLabel className="text-sm font-medium">
                              開催日時 <span className="text-red-500">*</span>
                            </FormLabel>
                            {isChanged("date") && (
                              <Badge variant="outline" className={changedBadgeClass}>
                                変更あり
                              </Badge>
                            )}
                          </div>
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
                              disabled={isPending || !restrictions.isFieldEditable("date")}
                              className={cn(isChanged("date") && changedFieldClass)}
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
                          <div className="flex items-center gap-2">
                            <FormLabel className="text-sm font-medium">
                              出欠回答期限 <span className="text-red-500">*</span>
                            </FormLabel>
                            {isChanged("registration_deadline") && (
                              <Badge variant="outline" className={changedBadgeClass}>
                                変更あり
                              </Badge>
                            )}
                          </div>
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
                              disabled={
                                isPending || !restrictions.isFieldEditable("registration_deadline")
                              }
                              className={cn(
                                isChanged("registration_deadline") && changedFieldClass
                              )}
                            />
                          </FormControl>
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
                  description="参加費の金額や集金方法を編集します"
                  icon={<WalletIcon className="w-5 h-5" />}
                >
                  {/* 参加費入力 */}
                  <FormField
                    control={form.control}
                    name="fee"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel className="text-sm font-medium">
                            参加費 <span className="text-red-500">*</span>
                          </FormLabel>
                          {isChanged("fee") && (
                            <Badge variant="outline" className={changedBadgeClass}>
                              変更あり
                            </Badge>
                          )}
                        </div>
                        <FormControl>
                          <div className="relative w-full sm:max-w-xs">
                            <Input
                              {...field}
                              type="number"
                              placeholder="0（無料）または100以上"
                              disabled={isPending || !restrictions.isFieldEditable("fee")}
                              min="0"
                              max="1000000"
                              className={cn(
                                "h-11 bg-background pr-10",
                                isChanged("fee") && changedFieldClass
                              )}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                              円
                            </span>
                          </div>
                        </FormControl>
                        {!restrictions.isFieldEditable("fee") ? (
                          <FormDescription className="text-xs text-amber-600">
                            集金済み参加者がいるため、参加費は変更できません
                          </FormDescription>
                        ) : (
                          <FormDescription>
                            0円（無料）または100円以上で設定してください
                          </FormDescription>
                        )}

                        {feeAmount >= 100 && canUseOnlinePayments && (
                          <div className="mt-4">
                            <FeeCalculatorDisplay
                              fee={feeAmount}
                              platformFeeConfig={feeEstimateConfig}
                            />
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 決済方法選択（有料イベント時のみ） */}
                  {!isFreeEvent && (
                    <FormField
                      control={form.control}
                      name="payment_methods"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <FormLabel className="text-sm font-medium">
                              集金方法を選択 <span className="text-red-500">*</span>
                            </FormLabel>
                            {isChanged("payment_methods") && (
                              <Badge variant="outline" className={changedBadgeClass}>
                                変更あり
                              </Badge>
                            )}
                          </div>

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
                                  if (e.target.checked) {
                                    const next = Array.from(new Set([...current, "cash"]));
                                    field.onChange(next);
                                  } else {
                                    // 参加者がいる場合、既存の決済方法は解除できない
                                    if (hasAttendees && event.payment_methods?.includes("cash")) {
                                      return;
                                    }
                                    const next = current.filter((m) => m !== "cash");
                                    field.onChange(next);
                                  }
                                }}
                                disabled={
                                  isPending || !restrictions.isFieldEditable("payment_methods")
                                }
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
                                checked={
                                  Array.isArray(field.value) && field.value.includes("stripe")
                                }
                                onChange={(e) => {
                                  const current = Array.isArray(field.value) ? field.value : [];
                                  if (e.target.checked) {
                                    const next = Array.from(new Set([...current, "stripe"]));
                                    field.onChange(next);
                                  } else {
                                    // 参加者がいる場合、既存の決済方法は解除できない
                                    if (hasAttendees && event.payment_methods?.includes("stripe")) {
                                      return;
                                    }
                                    const next = current.filter((m) => m !== "stripe");
                                    field.onChange(next);
                                  }
                                }}
                                disabled={
                                  isPending ||
                                  (!canUseOnlinePayments && !field.value?.includes("stripe")) ||
                                  !restrictions.isFieldEditable("payment_methods")
                                }
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
                              「オンライン」を選択するにはオンライン集金設定が必要です。
                              <Link
                                href="/settings/payments"
                                className="ml-1 font-medium underline underline-offset-4"
                              >
                                設定に進む
                              </Link>
                            </p>
                          )}
                          {!restrictions.isFieldEditable("payment_methods") && (
                            <p className="mt-2 text-xs text-amber-600">
                              参加者がいるため、集金方法の解除はできません
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                            <div className="flex items-center gap-2">
                              <FormLabel className="text-sm font-medium">
                                オンライン支払い期限 <span className="text-red-500">*</span>
                              </FormLabel>
                              {isChanged("payment_deadline") && (
                                <Badge variant="outline" className={changedBadgeClass}>
                                  変更あり
                                </Badge>
                              )}
                            </div>
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
                                disabled={
                                  isPending || !restrictions.isFieldEditable("payment_deadline")
                                }
                                className={cn(isChanged("payment_deadline") && changedFieldClass)}
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
                                <div className="flex items-center gap-2">
                                  <FormLabel className="text-sm font-medium">
                                    期限後もオンライン支払いを許可
                                  </FormLabel>
                                  {isChanged("allow_payment_after_deadline") && (
                                    <Badge variant="outline" className={changedBadgeClass}>
                                      変更あり
                                    </Badge>
                                  )}
                                </div>
                                <FormDescription>
                                  オンライン支払い期限後も一定期間オンライン支払いを受け付けます
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  disabled={
                                    isPending ||
                                    !restrictions.isFieldEditable("allow_payment_after_deadline")
                                  }
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
                                  <div className="flex items-center gap-2">
                                    <FormLabel className="text-sm font-medium">
                                      猶予期間（日）
                                    </FormLabel>
                                    {isChanged("grace_period_days") && (
                                      <Badge variant="outline" className={changedBadgeClass}>
                                        変更あり
                                      </Badge>
                                    )}
                                  </div>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="number"
                                      inputMode="numeric"
                                      min="0"
                                      max="30"
                                      step="1"
                                      placeholder="7"
                                      disabled={
                                        isPending ||
                                        !restrictions.isFieldEditable("grace_period_days")
                                      }
                                      className={cn(
                                        "h-11 w-full bg-background sm:max-w-xs",
                                        isChanged("grace_period_days") && changedFieldClass
                                      )}
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
                  変更内容を確認してイベントを更新します。
                </p>
                <div className="ml-auto grid w-full grid-cols-[6.5rem_1fr] items-center gap-2 sm:flex sm:w-auto sm:gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => window.history.back()}
                    disabled={isPending}
                    className="h-11 text-muted-foreground"
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending || !changes.hasChanges}
                    className="h-11 min-w-0 rounded-md px-4 text-sm font-semibold transition-transform active:scale-[0.98] sm:min-w-36 sm:px-6"
                  >
                    {isPending ? (
                      <>
                        <div className="mr-2 size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-b-primary-foreground" />
                        更新中...
                      </>
                    ) : (
                      "変更を保存"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Form>
      </div>

      {/* 変更確認ダイアログ */}
    </>
  );
}
