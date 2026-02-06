"use client";

import { useEffect, useState, useMemo } from "react";

import { format } from "date-fns";
import {
  MapPinIcon,
  UsersIcon,
  WalletIcon,
  CreditCardIcon,
  InfoIcon,
  ClockIcon,
  AlignLeftIcon,
} from "lucide-react";

import type { Event } from "@core/types/models";

import { cn } from "@/components/ui/_lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChangeConfirmationDialog,
  type ChangeItem,
  type ValidationAnalysis,
} from "@/components/ui/change-confirmation-dialog";
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
import type { RestrictableField } from "@/core/domain/event-edit-restrictions";

import {
  useEventEditForm,
  type EventEditFormDataRHF,
  type UpdateEventAction,
} from "../hooks/use-event-edit-form";
import { useRestrictionContext, useFormDataSnapshot } from "../hooks/use-unified-restrictions";

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
        "border-0 shadow-lg shadow-slate-200/40 ring-1 ring-slate-100 overflow-hidden",
        className
      )}
    >
      <div className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 p-4 md:p-6">
        <div className="flex items-start gap-4">
          {icon && (
            <div className="p-2.5 bg-white shadow-sm ring-1 ring-slate-200/50 rounded-xl text-primary shrink-0">
              {icon}
            </div>
          )}
          <div>
            <CardTitle className="text-base md:text-lg font-bold text-slate-900 tracking-tight">
              {title}
            </CardTitle>
            {description && (
              <CardDescription className="mt-1.5 text-slate-500">{description}</CardDescription>
            )}
          </div>
        </div>
      </div>
      <CardContent className="p-4 md:p-6 space-y-6">{children}</CardContent>
    </Card>
  );
}

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
};

export function SinglePageEventEditForm({
  event,
  attendeeCount,
  onSubmit,
  hasStripePaid = false,
  canUseOnlinePayments = false,
  updateEventAction,
}: SinglePageEventEditFormProps): JSX.Element {
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
      <div className="w-full max-w-7xl mx-auto pb-8">
        {/* 統合制限通知 */}
        <div className="mb-6">
          <UnifiedRestrictionNoticeV2
            restrictions={restrictionContext}
            formData={formDataSnapshot}
            showLevels={["structural", "conditional"]}
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-0" noValidate>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* 左カラム: 入力フォーム */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-8">
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
                            <Badge
                              variant="outline"
                              className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                            >
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
                              "h-12",
                              isChanged("title") && "bg-orange-50/30 border-orange-300"
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
                          <FormLabel className="text-sm font-medium">
                            イベントの説明・詳細（任意）
                          </FormLabel>
                          {isChanged("description") && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                            >
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
                              "resize-none",
                              isChanged("description") && "bg-orange-50/30 border-orange-300"
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
                            <Badge
                              variant="outline"
                              className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                            >
                              変更あり
                            </Badge>
                          )}
                        </div>
                        <FormControl>
                          <div className="relative">
                            <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              {...field}
                              placeholder="例：〇〇会議室、〇〇居酒屋など"
                              disabled={isPending || !restrictions.isFieldEditable("location")}
                              maxLength={200}
                              className={cn(
                                "h-12 pl-10",
                                isChanged("location") && "bg-orange-50/30 border-orange-300"
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
                            <Badge
                              variant="outline"
                              className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                            >
                              変更あり
                            </Badge>
                          )}
                        </div>
                        <FormControl>
                          <div className="relative max-w-xs">
                            <UsersIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              {...field}
                              type="number"
                              placeholder="例：50"
                              disabled={isPending || !restrictions.isFieldEditable("capacity")}
                              min={hasAttendees ? attendeeCount : 1}
                              max="10000"
                              className={cn(
                                "h-12 pl-10 pr-10",
                                isChanged("capacity") && "bg-orange-50/30 border-orange-300"
                              )}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
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
                </FormSection>

                {/* ============================================= */}
                {/* Section 2: 日時・締め切り */}
                {/* ============================================= */}
                <FormSection
                  title="日時・締め切り"
                  description="開催日時と出欠確認の締め切りを編集します"
                  icon={<ClockIcon className="w-5 h-5" />}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                              <Badge
                                variant="outline"
                                className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                              >
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
                              className={cn(
                                isChanged("date") && "bg-orange-50/30 border-orange-300"
                              )}
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
                              参加申込締切 <span className="text-red-500">*</span>
                            </FormLabel>
                            {isChanged("registration_deadline") && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                              >
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
                              placeholder="参加申込締切を選択"
                              disabled={
                                isPending || !restrictions.isFieldEditable("registration_deadline")
                              }
                              className={cn(
                                isChanged("registration_deadline") &&
                                  "bg-orange-50/30 border-orange-300"
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
                  title="参加費・決済"
                  description="参加費の金額や決済方法を編集します"
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
                            <Badge
                              variant="outline"
                              className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                            >
                              変更あり
                            </Badge>
                          )}
                        </div>
                        <FormControl>
                          <div className="relative max-w-xs">
                            <Input
                              {...field}
                              type="number"
                              placeholder="0（無料）または100以上"
                              disabled={isPending || !restrictions.isFieldEditable("fee")}
                              min="0"
                              max="1000000"
                              className={cn(
                                "h-12 pr-10",
                                isChanged("fee") && "bg-orange-50/30 border-orange-300"
                              )}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                              円
                            </span>
                          </div>
                        </FormControl>
                        {!restrictions.isFieldEditable("fee") ? (
                          <FormDescription className="text-xs text-amber-600">
                            決済済み参加者がいるため、参加費は変更できません
                          </FormDescription>
                        ) : (
                          <FormDescription>
                            0円（無料）または100円以上で設定してください
                          </FormDescription>
                        )}

                        {feeAmount >= 100 && (
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
                          <div className="flex items-center gap-2">
                            <FormLabel className="text-sm font-medium">
                              決済方法を選択 <span className="text-red-500">*</span>
                            </FormLabel>
                            {isChanged("payment_methods") && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                              >
                                変更あり
                              </Badge>
                            )}
                          </div>

                          <div
                            className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3"
                            data-testid="payment-methods"
                          >
                            {/* 現金払い */}
                            <label
                              className={cn(
                                "relative flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all",
                                Array.isArray(field.value) && field.value.includes("cash")
                                  ? "border-primary bg-primary/5"
                                  : "border-slate-200 hover:border-slate-300 bg-white"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
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
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "p-2 rounded-lg",
                                    Array.isArray(field.value) && field.value.includes("cash")
                                      ? "bg-primary/20 text-primary"
                                      : "bg-slate-100 text-slate-500"
                                  )}
                                >
                                  <WalletIcon className="w-5 h-5" />
                                </div>
                                <div>
                                  <span className="block font-semibold text-sm text-slate-900">
                                    現金
                                  </span>
                                  <span className="block text-xs text-slate-500">
                                    当日現地などで集金
                                  </span>
                                </div>
                              </div>
                              {Array.isArray(field.value) && field.value.includes("cash") && (
                                <div className="absolute top-4 right-4 h-3 w-3 bg-primary rounded-full" />
                              )}
                            </label>

                            {/* オンライン決済 */}
                            <label
                              className={cn(
                                "relative flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all",
                                !canUseOnlinePayments && "opacity-60",
                                Array.isArray(field.value) && field.value.includes("stripe")
                                  ? "border-primary bg-primary/5"
                                  : "border-slate-200 hover:border-slate-300 bg-white"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
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
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "p-2 rounded-lg",
                                    Array.isArray(field.value) && field.value.includes("stripe")
                                      ? "bg-primary/20 text-primary"
                                      : "bg-slate-100 text-slate-500"
                                  )}
                                >
                                  <CreditCardIcon className="w-5 h-5" />
                                </div>
                                <div>
                                  <span className="block font-semibold text-sm text-slate-900">
                                    オンライン決済
                                  </span>
                                  <span className="block text-xs text-slate-500">
                                    クレジットカード、Apple Payなど
                                  </span>
                                </div>
                              </div>
                              {Array.isArray(field.value) && field.value.includes("stripe") && (
                                <div className="absolute top-4 right-4 h-3 w-3 bg-primary rounded-full" />
                              )}
                            </label>
                          </div>

                          {!canUseOnlinePayments && (
                            <p className="text-xs text-muted-foreground mt-2">
                              オンライン決済を利用するにはStripeアカウントの設定が必要です。
                              <a href="/dashboard/connect" className="underline ml-1">
                                設定に進む
                              </a>
                            </p>
                          )}
                          {!restrictions.isFieldEditable("payment_methods") && (
                            <p className="text-xs text-amber-600 mt-2">
                              決済済み参加者がいるため、決済方法は変更できません
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 text-blue-800 px-6 py-4 rounded-lg">
                      <p className="font-medium">✓ 参加費が0円のため、決済方法の設定は不要です</p>
                    </div>
                  )}

                  {/* オンライン決済設定（Stripe選択時のみ表示） */}
                  {!isFreeEvent && isOnlineSelected && (
                    <div
                      className={cn(
                        "border border-blue-200 rounded-lg p-6 bg-blue-50/30 space-y-6",
                        "transition-all duration-300 ease-in-out"
                      )}
                    >
                      <div className="flex items-start gap-2 mb-3">
                        <InfoIcon className="w-4 h-4 text-blue-500 mt-0.5" />
                        <p className="text-xs text-blue-700">
                          オンライン決済を選択した場合、決済期限を設定できます。
                        </p>
                      </div>

                      {/* オンライン決済締切 */}
                      <FormField
                        control={form.control}
                        name="payment_deadline"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center gap-2">
                              <FormLabel className="text-sm font-medium">
                                オンライン決済締切 <span className="text-red-500">*</span>
                              </FormLabel>
                              {isChanged("payment_deadline") && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                                >
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
                                placeholder="オンライン決済締切を選択"
                                disabled={
                                  isPending || !restrictions.isFieldEditable("payment_deadline")
                                }
                                className={cn(
                                  isChanged("payment_deadline") &&
                                    "bg-orange-50/30 border-orange-300"
                                )}
                              />
                            </FormControl>
                            <FormDescription>（後払いも可能）</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* 締切後決済許可設定 */}
                      <div className="border border-gray-200 rounded-lg p-5 bg-white">
                        <FormField
                          control={form.control}
                          name="allow_payment_after_deadline"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between space-x-3 space-y-0">
                              <div className="space-y-1 leading-none">
                                <div className="flex items-center gap-2">
                                  <FormLabel className="text-sm font-medium">
                                    締切後も決済を許可
                                  </FormLabel>
                                  {isChanged("allow_payment_after_deadline") && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                                    >
                                      変更あり
                                    </Badge>
                                  )}
                                </div>
                                <FormDescription>
                                  決済締切後も一定期間オンライン決済を受け付けます
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
                          <div className="mt-4">
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
                                      <Badge
                                        variant="outline"
                                        className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                                      >
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
                                        "h-12 max-w-xs",
                                        isChanged("grace_period_days") &&
                                          "bg-orange-50/30 border-orange-300"
                                      )}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        field.onChange(v);
                                        void form.trigger();
                                      }}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    オンライン決済締切からの猶予日数（0〜30日）
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
              </div>

              {/* 右カラム: タイムライン & 補足情報 */}
              <div className="hidden lg:block lg:col-span-5 xl:col-span-4 space-y-6 sticky top-24">
                {/* タイムラインプレビュー (デスクトップ) */}
                {watchedDate && (
                  <div className="transition-all duration-500 ease-in-out">{TimelinePreview}</div>
                )}
              </div>

              {/* モバイル用: フォーム下部へのタイムライン表示 */}
              <div className="lg:hidden col-span-1 mt-8">{watchedDate && TimelinePreview}</div>
            </div>

            {/* 全体のエラーメッセージ */}
            {form.formState.errors.root && (
              <div className="mt-8 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                {form.formState.errors.root.message}
              </div>
            )}

            {/* Footer Actions */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-slate-200 z-0">
              <div className="max-w-7xl mx-auto flex items-center justify-end gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => window.history.back()}
                  disabled={isPending}
                  className="text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || !changes.hasChanges}
                  className="h-12 px-8 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 text-sm md:text-base font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                      更新中...
                    </>
                  ) : (
                    "変更を保存"
                  )}
                </Button>
              </div>
            </div>

            {/* Spacer for fixed footer */}
            <div className="h-16" />
          </form>
        </Form>
      </div>

      {/* 変更確認ダイアログ */}
    </>
  );
}
