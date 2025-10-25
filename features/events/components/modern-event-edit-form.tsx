"use client";

import { useState, useEffect, useMemo } from "react";

import { CheckIcon, CalendarIcon, MapPinIcon, UsersIcon } from "lucide-react";

import type { Event } from "@core/types/models";

import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";
import {
  ChangeConfirmationDialog,
  type ChangeItem,
} from "@/components/ui/change-confirmation-dialog";
import { Form } from "@/components/ui/form";

import { useEventEditForm, type EventEditFormDataRHF } from "../hooks/use-event-edit-form";
import { useRestrictionContext, useFormDataSnapshot } from "../hooks/use-unified-restrictions";

import { BasicInfoStep } from "./event-edit-steps/basic-info-step";
import { ConfirmationStep } from "./event-edit-steps/confirmation-step";
import { DetailsStep } from "./event-edit-steps/details-step";
import { PaymentSettingsStep } from "./event-edit-steps/payment-settings-step";
import { UnifiedRestrictionNoticeV2 } from "./unified-restriction-notice-v2";

// ステップの定義
const STEPS = [
  {
    id: "basic",
    title: "基本情報",
    description: "イベント名、日時、参加費",
    icon: CalendarIcon,
  },
  {
    id: "settings",
    title: "受付・決済設定",
    description: "締切と決済方法",
    icon: UsersIcon,
  },
  {
    id: "details",
    title: "詳細情報",
    description: "場所や詳細",
    icon: MapPinIcon,
  },
  {
    id: "confirm",
    title: "確認・更新",
    description: "変更内容を確認",
    icon: CheckIcon,
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

interface ModernEventEditFormProps {
  event: Event;
  attendeeCount: number;
  onSubmit?: (data: Event) => void;
  serverError?: string;
  hasStripePaid?: boolean;
  canUseOnlinePayments?: boolean;
}

/**
 * モダンなマルチステップイベント編集フォーム
 * 作成ページと同様のUXを提供
 */
export function ModernEventEditForm({
  event,
  attendeeCount,
  onSubmit,
  serverError,
  hasStripePaid = false,
  canUseOnlinePayments = false,
}: ModernEventEditFormProps) {
  const [currentStep, setCurrentStep] = useState<StepId>("basic");
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<ChangeItem[]>([]);

  const { form, isPending, hasAttendees, validation, changes, actions, restrictions, isFreeEvent } =
    useEventEditForm({
      event,
      attendeeCount,
      onSubmit,
      hasStripePaid,
    });

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

  const hasStripeSelected = (form.watch("payment_methods") || []).includes("stripe");
  const watchedAllowPaymentAfterDeadline = form.watch("allow_payment_after_deadline") || false;

  // フォーム値を監視（タイムライン表示用）
  const watchedDate = form.watch("date");
  const watchedRegistrationDeadline = form.watch("registration_deadline");
  const watchedPaymentDeadline = form.watch("payment_deadline");
  const watchedGracePeriodDays = form.watch("grace_period_days");

  // 変更されたフィールドを追跡
  const changedFields = useMemo(() => {
    const detectedChanges = changes.detectChanges();
    return new Set(detectedChanges.map((c) => c.field));
  }, [changes]);

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
        const fields: string[] = ["registration_deadline"];
        if (!isFreeEvent) {
          fields.push("payment_methods");
          if (hasStripeSelected) {
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

  // フォーム送信処理
  const handleSubmit = async (_data: EventEditFormDataRHF) => {
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

  const handleConfirmChanges = async (confirmedChanges: ChangeItem[]) => {
    setShowConfirmDialog(false);

    try {
      const formData = form.getValues();
      await actions.submitFormWithChanges(formData, confirmedChanges);
    } catch (_error) {
      form.setError("root", {
        type: "manual",
        message: "更新に失敗しました。もう一度お試しください。",
      });
    }
  };

  const handleResetForm = () => {
    actions.resetForm();
    setCurrentStep("basic");
    setCompletedSteps(new Set());
  };

  // Stripe選択時の即時バリデーション
  useEffect(() => {
    if (hasStripeSelected && !isFreeEvent) {
      void form.trigger("payment_deadline");
    }
  }, [hasStripeSelected, isFreeEvent, form]);

  return (
    <>
      <div className="w-full max-w-4xl mx-auto">
        {/* プログレスヘッダー */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">イベント編集</h2>
              <p className="text-gray-600 mt-1">「{event.title}」を編集します</p>
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
                        isCompleted &&
                          !isActive &&
                          "border-green-500 bg-green-500 text-white shadow-md",
                        !isActive &&
                          !isCompleted &&
                          "border-gray-300 bg-white text-gray-400 hover:border-gray-400",
                        !isClickable && "cursor-not-allowed opacity-50"
                      )}
                      onClick={() => isClickable && goToStep(step.id)}
                      disabled={!isClickable}
                    >
                      {isCompleted && !isActive ? (
                        <CheckIcon className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </button>
                    <div className="mt-2 text-center">
                      <p
                        className={cn(
                          "text-xs font-medium",
                          isActive ? "text-blue-600" : "text-gray-500"
                        )}
                      >
                        {step.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">
                        {step.description}
                      </p>
                    </div>
                    {/* 接続線 */}
                    {index < STEPS.length - 1 && (
                      <div
                        className={cn(
                          "absolute top-5 h-0.5 transition-all duration-300",
                          isCompleted ? "bg-green-500" : "bg-gray-300"
                        )}
                        style={{
                          left: `${((index + 0.5) / STEPS.length) * 100}%`,
                          width: `${100 / STEPS.length}%`,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* サーバーエラーの表示 */}
        {serverError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {serverError}
          </div>
        )}

        {/* 全体エラーの表示 */}
        {form.formState.errors.root && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {form.formState.errors.root.message}
          </div>
        )}

        {/* 統合制限通知（構造的制限のみトップに表示） */}
        <div className="mb-6">
          <UnifiedRestrictionNoticeV2
            restrictions={restrictionContext}
            formData={formDataSnapshot}
            showLevels={["structural"]}
            compact={true}
          />
        </div>

        {/* フォーム */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" noValidate>
            {/* ステップコンテンツ */}
            {currentStep === "basic" && (
              <BasicInfoStep
                control={form.control}
                isPending={isPending}
                changedFields={changedFields}
                errors={form.formState.errors}
                isFieldEditable={restrictions.isFieldEditable}
                event={event}
              />
            )}

            {currentStep === "settings" && (
              <PaymentSettingsStep
                control={form.control}
                isPending={isPending}
                changedFields={changedFields}
                errors={form.formState.errors}
                isFreeEvent={isFreeEvent}
                hasStripeSelected={hasStripeSelected}
                canUseOnlinePayments={canUseOnlinePayments}
                hasStripePaid={hasStripePaid}
                event={event}
                watchedAllowPaymentAfterDeadline={watchedAllowPaymentAfterDeadline}
              />
            )}

            {currentStep === "details" && (
              <DetailsStep
                control={form.control}
                isPending={isPending}
                changedFields={changedFields}
                errors={form.formState.errors}
                hasAttendees={hasAttendees}
                attendeeCount={attendeeCount}
              />
            )}

            {currentStep === "confirm" && (
              <ConfirmationStep
                event={event}
                changes={changes.detectChanges()}
                attendeeCount={attendeeCount}
                hasStripePaid={hasStripePaid}
                watchedDate={watchedDate}
                watchedRegistrationDeadline={watchedRegistrationDeadline}
                watchedPaymentDeadline={watchedPaymentDeadline}
                watchedGracePeriodDays={watchedGracePeriodDays}
              />
            )}

            {/* ナビゲーションボタン */}
            <div className="flex flex-col sm:flex-row gap-4 pt-6">
              {currentStepIndex > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  disabled={isPending}
                  className="flex-1 sm:flex-none sm:min-w-[120px]"
                >
                  ← 前へ
                </Button>
              )}

              {currentStep !== "confirm" && (
                <Button
                  type="button"
                  onClick={nextStep}
                  disabled={isPending}
                  className="flex-1 sm:flex-none sm:min-w-[120px]"
                >
                  次へ →
                </Button>
              )}

              {currentStep === "confirm" && (
                <Button
                  type="submit"
                  disabled={isPending || !changes.hasChanges || validation.hasErrors}
                  className="flex-1 sm:flex-none sm:min-w-[120px]"
                >
                  {isPending ? "更新中..." : "変更を保存"}
                </Button>
              )}

              {currentStep === "confirm" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetForm}
                  disabled={isPending || !changes.hasChanges}
                  className="flex-1 sm:flex-none sm:min-w-[120px]"
                >
                  すべてリセット
                </Button>
              )}

              {changes.hasChanges && (
                <div className="text-sm text-gray-600 flex items-center sm:ml-auto">
                  <span className="text-amber-600">
                    未保存の変更: {changes.getChangeCount()}項目
                  </span>
                </div>
              )}
            </div>
          </form>
        </Form>
      </div>

      {/* 変更確認ダイアログ */}
      <ChangeConfirmationDialog
        isOpen={showConfirmDialog}
        changes={pendingChanges}
        onConfirm={handleConfirmChanges}
        onCancel={() => setShowConfirmDialog(false)}
        attendeeCount={attendeeCount}
        hasStripePaid={hasStripePaid}
      />
    </>
  );
}
