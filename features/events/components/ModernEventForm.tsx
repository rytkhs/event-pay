"use client";

import { useEffect, useState } from "react";

import { format } from "date-fns";
import { CheckIcon, CalendarIcon, MapPinIcon, UsersIcon } from "lucide-react";

import { calculateNetAmount, formatCurrency } from "@core/utils/fee-calculator";
import { getCurrentJstTime } from "@core/utils/timezone";

import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

import { useEventForm, type CreateEventAction } from "../hooks/use-event-form";

import { EventConfirmationSummary } from "./EventConfirmationSummary";
import { EventFormTimeline } from "./EventFormTimeline";

// ステップの定義
const STEPS = [
  {
    id: "basic",
    title: "基本情報",
    description: "イベントの基本的な情報を入力",
    icon: CalendarIcon,
  },
  {
    id: "settings",
    title: "受付・決済設定",
    description: "締切と決済方法を設定",
    icon: UsersIcon,
  },
  {
    id: "details",
    title: "詳細情報",
    description: "場所や詳細を入力",
    icon: MapPinIcon,
  },
  {
    id: "confirm",
    title: "確認・送信",
    description: "内容を確認して作成",
    icon: CheckIcon,
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/**
 * モダンなマルチステップイベント作成フォーム
 */
type ModernEventFormProps = {
  canUseOnlinePayments?: boolean;
  connectStatus?: {
    actionUrl?: string;
  };
  createEventAction: CreateEventAction;
};

function ModernEventForm({
  canUseOnlinePayments = false,
  connectStatus,
  createEventAction,
}: ModernEventFormProps): JSX.Element {
  const { form, onSubmit, isPending, isFreeEvent } = useEventForm({ createEventAction });
  const [currentStep, setCurrentStep] = useState<StepId>("basic");
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());

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

  // ステップの進行状況を管理
  const currentStepIndex = STEPS.findIndex((step) => step.id === currentStep);

  // ステップの妥当性をチェック
  const validateStep = async (stepId: StepId): Promise<boolean> => {
    switch (stepId) {
      case "basic": {
        const basicFields = ["title", "date", "fee"] as const;
        const result = await form.trigger(basicFields);
        return result;
      }
      case "settings": {
        const fields: string[] = ["registration_deadline"]; // 常に申込締切は対象
        if (!isFreeEvent) {
          fields.push("payment_methods");
          if (isOnlineSelected) {
            fields.push("payment_deadline");
            if (form.watch("allow_payment_after_deadline")) {
              fields.push("grace_period_days");
            }
          }
        }
        const result = await form.trigger(fields as any);
        return result;
      }
      case "details": {
        const detailFields = ["location", "description", "capacity"] as const;
        const result = await form.trigger(detailFields);
        return result;
      }
      case "confirm":
        return form.formState.isValid;
      default:
        return false;
    }
  };

  // 次のステップへ進む
  const nextStep = async () => {
    const isValid = await validateStep(currentStep);
    if (!isValid) return;

    setCompletedSteps((prev) => new Set([...prev, currentStep]));

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  // 前のステップへ戻る
  const prevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  // ステップクリック時の処理
  const goToStep = (stepId: StepId) => {
    const targetIndex = STEPS.findIndex((step) => step.id === stepId);
    if (targetIndex <= currentStepIndex || completedSteps.has(stepId)) {
      setCurrentStep(stepId);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* プログレスヘッダー */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">新しいイベントを作成</h1>
            <p className="text-gray-600 mt-1">ステップに従って情報を入力してください</p>
          </div>
          <div className="text-sm text-gray-500">
            {currentStepIndex + 1} / {STEPS.length}
          </div>
        </div>

        {/* プログレスバー */}
        <div className="relative">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = completedSteps.has(step.id);
              const isClickable = index <= currentStepIndex || isCompleted;

              return (
                <div key={step.id} className="flex flex-col items-center flex-1">
                  <button
                    type="button"
                    className={cn(
                      "relative z-10 w-10 h-10 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500",
                      isActive && "border-blue-500 bg-blue-500 text-white shadow-lg scale-110",
                      isCompleted && !isActive && "border-green-500 bg-green-500 text-white",
                      !isActive && !isCompleted && "border-gray-300 bg-white text-gray-400",
                      isClickable && !isActive && "hover:border-gray-400 hover:bg-gray-50"
                    )}
                    onClick={() => isClickable && goToStep(step.id)}
                    aria-current={isActive ? "step" : undefined}
                  >
                    {isCompleted && !isActive ? (
                      <CheckIcon className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </button>
                  <div className="mt-2 text-center">
                    <div
                      className={cn(
                        "text-sm font-medium transition-colors duration-200",
                        isActive && "text-blue-600",
                        isCompleted && !isActive && "text-green-600",
                        !isActive && !isCompleted && "text-gray-500"
                      )}
                    >
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 hidden sm:block">
                      {step.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* プログレスライン */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-0">
            <div
              className="h-full bg-blue-500 transition-all duration-300 ease-out"
              style={{ width: `${(currentStepIndex / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* フォームコンテンツ */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-8">
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-6" noValidate>
              {/* ステップ1: 基本情報 */}
              {currentStep === "basic" && (
                <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
                  <div className="text-center mb-8">
                    <CalendarIcon className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">イベントの基本情報</h2>
                    <p className="text-gray-600 mt-2">
                      まずはイベントの基本的な情報を入力しましょう
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          イベント名 <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="例：月例勉強会、夏合宿、会費の集金など"
                            disabled={isPending}
                            maxLength={100}
                            className="h-12 text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-medium">
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
                      name="fee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="fee-input" className="text-base font-medium">
                            参加費 <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <div className="relative max-w-xs">
                              <Input
                                {...field}
                                id="fee-input"
                                type="number"
                                placeholder="0または100以上"
                                disabled={isPending}
                                min="0"
                                max="1000000"
                                className="h-12 pr-8 text-lg"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                                円
                              </span>
                            </div>
                          </FormControl>
                          <FormDescription className="text-sm text-gray-600">
                            0円（無料）または100円以上で設定してください。
                          </FormDescription>
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
                  </div>
                </div>
              )}

              {/* ステップ2: 受付・決済設定 */}
              {currentStep === "settings" && (
                <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
                  <div className="text-center mb-8">
                    <UsersIcon className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">受付・決済設定</h2>
                    <p className="text-gray-600 mt-2">
                      参加申込と決済の締切、決済方法を設定しましょう
                    </p>
                  </div>

                  {/* 参加申込締切 */}
                  <FormField
                    control={form.control}
                    name="registration_deadline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
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
                        <FormDescription>この日時以降は申込できません</FormDescription>
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
                          <FormLabel className="text-base font-medium">
                            利用可能な決済方法 <span className="text-red-500">*</span>
                          </FormLabel>
                          <div
                            className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3"
                            data-testid="payment-methods"
                          >
                            <div
                              className={cn(
                                "border-2 rounded-lg p-4 transition-all duration-200",
                                Array.isArray(field.value) && field.value.includes("stripe")
                                  ? "border-blue-500 bg-blue-50"
                                  : "border-gray-200 hover:border-gray-300"
                              )}
                            >
                              <div className="flex items-start space-x-3">
                                <Checkbox
                                  id="method-stripe"
                                  checked={
                                    Array.isArray(field.value) && field.value.includes("stripe")
                                  }
                                  onCheckedChange={(checked: boolean) => {
                                    const current = Array.isArray(field.value) ? field.value : [];
                                    const next =
                                      checked === true
                                        ? Array.from(new Set([...current, "stripe"]))
                                        : current.filter((m) => m !== "stripe");
                                    field.onChange(next);
                                  }}
                                  disabled={isPending || !canUseOnlinePayments}
                                  className="mt-1"
                                />
                                <label
                                  htmlFor="method-stripe"
                                  className="cursor-pointer select-none"
                                >
                                  <div className="font-medium text-gray-900">オンライン決済</div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    クレジットカード、Apple Pay、Google Pay など
                                  </div>
                                </label>
                              </div>
                              {!canUseOnlinePayments && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  オンライン決済を利用するにはStripeアカウントの設定が必要です。
                                  <a
                                    href={connectStatus?.actionUrl ?? "/settings/payments"}
                                    className="underline ml-1"
                                  >
                                    設定に進む
                                  </a>
                                </p>
                              )}
                            </div>

                            <div
                              className={cn(
                                "border-2 rounded-lg p-4 transition-all duration-200",
                                Array.isArray(field.value) && field.value.includes("cash")
                                  ? "border-blue-500 bg-blue-50"
                                  : "border-gray-200 hover:border-gray-300"
                              )}
                            >
                              <div className="flex items-start space-x-3">
                                <Checkbox
                                  id="method-cash"
                                  checked={
                                    Array.isArray(field.value) && field.value.includes("cash")
                                  }
                                  onCheckedChange={(checked: boolean) => {
                                    const current = Array.isArray(field.value) ? field.value : [];
                                    const next =
                                      checked === true
                                        ? Array.from(new Set([...current, "cash"]))
                                        : current.filter((m) => m !== "cash");
                                    field.onChange(next);
                                  }}
                                  disabled={isPending}
                                  className="mt-1"
                                />
                                <label htmlFor="method-cash" className="cursor-pointer select-none">
                                  <div className="font-medium text-gray-900">現金</div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    当日会場などで現金で集金
                                  </div>
                                </label>
                              </div>
                            </div>
                          </div>
                          <FormDescription>
                            有料イベントでは決済方法の選択が必要です
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 text-blue-800 px-6 py-4 rounded-lg">
                      <div className="flex items-center">
                        <CheckIcon className="w-5 h-5 mr-2 text-green-600" />
                        <p className="font-medium">参加費が0円のため、決済方法の設定は不要です</p>
                      </div>
                      <p className="text-sm mt-1 text-blue-700">
                        参加者は無料でイベントに参加できます
                      </p>
                    </div>
                  )}

                  {!isFreeEvent && isOnlineSelected && (
                    <div className="border border-blue-200 rounded-lg p-6 bg-blue-50/30 space-y-6">
                      <div className="flex items-center space-x-2 mb-4">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <h3 className="text-lg font-medium text-blue-900">オンライン決済設定</h3>
                      </div>

                      {/* オンライン決済締切 */}
                      <FormField
                        control={form.control}
                        name="payment_deadline"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-medium">
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
                                <FormLabel className="text-base font-medium">
                                  締切後も決済を許可
                                </FormLabel>
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
                                  <FormLabel className="text-base font-medium">
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

                  {/* タイムライン表示（提案3） - オンライン決済設定の後に表示 */}
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
                      className="mt-6"
                    />
                  )}
                </div>
              )}

              {/* ステップ3: 詳細情報 */}
              {currentStep === "details" && (
                <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
                  <div className="text-center mb-8">
                    <MapPinIcon className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">詳細情報</h2>
                    <p className="text-gray-600 mt-2">
                      開催場所や説明、定員を入力しましょう（任意）
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">開催場所</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="東京都渋谷区..."
                            disabled={isPending}
                            maxLength={200}
                            className="h-12"
                          />
                        </FormControl>
                        <FormDescription>任意で入力してください</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          イベントの説明・詳細
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="参加者に伝えたいイベントの詳細を入力してください"
                            disabled={isPending}
                            rows={5}
                            maxLength={1000}
                            className="resize-none"
                          />
                        </FormControl>
                        <FormDescription>任意で入力してください（最大1000文字）</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">定員</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            placeholder="60"
                            disabled={isPending}
                            min="1"
                            max="10000"
                            className="h-12 max-w-xs"
                          />
                        </FormControl>
                        <FormDescription>任意で設定してください</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* ステップ4: 確認・送信 */}
              {currentStep === "confirm" && (
                <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
                  <div className="text-center mb-8">
                    <CheckIcon className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">内容確認</h2>
                    <p className="text-gray-600 mt-2">
                      入力内容を確認して、イベントを作成しましょう
                    </p>
                  </div>

                  {/* 改善された確認サマリー */}
                  <EventConfirmationSummary
                    form={form}
                    isFreeEvent={isFreeEvent}
                    onEditStep={goToStep}
                  />

                  {/* 全体のエラーメッセージ */}
                  {form.formState.errors.root && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                      {form.formState.errors.root.message}
                    </div>
                  )}
                </div>
              )}

              {/* ナビゲーションボタン */}
              <div className="flex justify-between pt-8 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  disabled={currentStepIndex === 0 || isPending}
                  className="h-12 px-6"
                >
                  前に戻る
                </Button>

                <div className="flex space-x-3">
                  {currentStep !== "confirm" && (
                    <Button
                      type="button"
                      onClick={nextStep}
                      disabled={isPending}
                      className="h-12 px-8"
                    >
                      次へ進む
                    </Button>
                  )}

                  {currentStep === "confirm" && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => form.reset()}
                        disabled={isPending}
                        className="h-12 px-6"
                      >
                        リセット
                      </Button>
                      <Button
                        type="submit"
                        disabled={isPending || !form.formState.isValid}
                        className="h-12 px-8 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                      >
                        {isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            作成中...
                          </>
                        ) : (
                          "イベントを作成"
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ModernEventForm;
export { ModernEventForm };
