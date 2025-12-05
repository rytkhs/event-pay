"use client";

import { useEffect, useState } from "react";

import { format } from "date-fns";
import {
  MapPinIcon,
  UsersIcon,
  WalletIcon,
  CreditCardIcon,
  InfoIcon,
  ChevronLeftIcon,
  ClockIcon,
  AlignLeftIcon,
} from "lucide-react";

import { calculateNetAmount, formatCurrency } from "@core/utils/fee-calculator";
import { getCurrentJstTime } from "@core/utils/timezone";

import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

import { useEventForm } from "../hooks/use-event-form";

import { EventFormTimeline } from "./event-form-timeline";

// =====================================================
// FormSection - モックのSectionを参考にしたUIコンポーネント
// =====================================================
type FormSectionProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
};

function FormSection({ title, description, icon, children }: FormSectionProps) {
  return (
    <Card className="mb-6 border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-4">
          {icon && <div className="p-2 bg-primary/10 text-primary rounded-lg shrink-0">{icon}</div>}
          <div>
            <CardTitle className="text-lg font-bold text-slate-900">{title}</CardTitle>
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
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
};

function SinglePageEventForm({
  canUseOnlinePayments = false,
  connectStatus,
}: SinglePageEventFormProps): JSX.Element {
  const { form, onSubmit, isPending, isFreeEvent } = useEventForm();

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

  return (
    <div className="w-full max-w-2xl mx-auto pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 -mx-4 px-4 mb-8">
        <div className="h-16 flex items-center justify-between">
          <a
            href="/dashboard"
            className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </a>
          <h1 className="font-bold text-lg text-slate-900">イベント作成</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </header>

      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-0" noValidate>
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
                      placeholder="例: 月例勉強会、夏合宿、会費の集金など"
                      disabled={isPending}
                      maxLength={100}
                      className="h-12"
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
                  <FormLabel className="text-sm font-medium">イベントの説明・詳細</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="参加者に伝えたいイベントの詳細を入力してください"
                      disabled={isPending}
                      rows={4}
                      maxLength={1000}
                      className="resize-none"
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
                  <FormLabel className="text-sm font-medium">開催場所</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        {...field}
                        placeholder="例：市民センター会議室、〇〇居酒屋 渋谷店"
                        disabled={isPending}
                        maxLength={200}
                        className="h-12 pl-10"
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
                    <div className="relative max-w-xs">
                      <UsersIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        {...field}
                        type="number"
                        placeholder="例：50"
                        disabled={isPending}
                        min="1"
                        max="10000"
                        className="h-12 pl-10 pr-10"
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
                      参加申込締切 <span className="text-red-500">*</span>
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
                        placeholder="参加申込締切を選択"
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
            title="参加費・決済"
            description="参加費の金額や決済方法を設定します"
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
                    <div className="relative max-w-xs">
                      <Input
                        {...field}
                        type="number"
                        placeholder="0（無料）または100以上"
                        disabled={isPending}
                        min="0"
                        max="1000000"
                        className="h-12 pr-10 text-lg"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        円
                      </span>
                    </div>
                  </FormControl>
                  <FormDescription>0円（無料）または100円以上で設定してください</FormDescription>
                  {feeAmount >= 100 && canUseOnlinePayments && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-900">
                        オンライン決済時の予想手取り:{" "}
                        {formatCurrency(calculateNetAmount(feeAmount))}円
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        （参加費 {formatCurrency(feeAmount)}円 - 手数料）
                      </p>
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
                      決済方法を選択 <span className="text-red-500">*</span>
                    </FormLabel>

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
                            const next = e.target.checked
                              ? Array.from(new Set([...current, "cash"]))
                              : current.filter((m) => m !== "cash");
                            field.onChange(next);
                          }}
                          disabled={isPending}
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
                              現金払い
                            </span>
                            <span className="block text-xs text-slate-500">当日現地で集金</span>
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
                              Stripe (カード/Pay)
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
                        <a
                          href={connectStatus?.actionUrl ?? "/dashboard/connect"}
                          className="underline ml-1"
                        >
                          設定に進む
                        </a>
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 text-blue-800 px-6 py-4 rounded-lg">
                <p className="font-medium">✓ 参加費が0円のため、決済方法の設定は不要です</p>
                <p className="text-sm mt-1 text-blue-700">参加者は無料でイベントに参加できます</p>
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
                      <FormLabel className="text-sm font-medium">
                        オンライン決済締切 <span className="text-red-500">*</span>
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
                          placeholder="オンライン決済締切を選択"
                          disabled={isPending}
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
                          <FormLabel className="text-sm font-medium">締切後も決済を許可</FormLabel>
                          <FormDescription>
                            決済締切後も一定期間オンライン決済を受け付けます（最長30日まで）
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
                    <div className="mt-4">
                      <FormField
                        control={form.control}
                        name="grace_period_days"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">猶予期間（日）</FormLabel>
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
                                className="h-12 max-w-xs"
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

          {/* タイムラインプレビュー */}
          {watchedRegistrationDeadline && watchedDate && (
            <EventFormTimeline
              registrationDeadline={watchedRegistrationDeadline}
              paymentDeadline={isOnlineSelected ? watchedPaymentDeadline : undefined}
              eventDate={watchedDate}
              gracePeriodDays={
                isOnlineSelected && watchedAllowPaymentAfterDeadline
                  ? watchedGracePeriodDays
                  : undefined
              }
              className="mb-6"
            />
          )}

          {/* 全体のエラーメッセージ */}
          {form.formState.errors.root && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {form.formState.errors.root.message}
            </div>
          )}

          {/* Footer Actions (Sticky on Mobile) */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 md:static md:bg-transparent md:border-0 md:p-0 z-20">
            <div className="max-w-2xl mx-auto flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => (window.location.href = "/dashboard")}
                disabled={isPending}
                className="flex-1 md:flex-none md:w-32 h-12"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="flex-1 h-12 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30"
              >
                {isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    作成中...
                  </>
                ) : (
                  "イベントを作成"
                )}
              </Button>
            </div>
          </div>

          {/* Spacer for fixed footer on mobile */}
          <div className="h-20 md:hidden" />
        </form>
      </Form>
    </div>
  );
}

export { SinglePageEventForm };
