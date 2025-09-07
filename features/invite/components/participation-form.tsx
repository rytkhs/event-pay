"use client";
import React, { useState, useEffect, useMemo } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";

import { PAYMENT_METHOD_LABELS } from "@core/constants/payment-methods";
import { useParticipationErrorHandler } from "@core/hooks/use-error-handler";
import { EventDetail } from "@core/utils/invite-token";
import {
  createParticipationFormSchema,
  type ParticipationFormData,
} from "@core/validation/participation";

import { ParticipationErrorBoundary } from "@/components/errors";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ParticipationFormProps {
  event: EventDetail;
  inviteToken: string;
  onSubmit: (data: ParticipationFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ParticipationForm({
  event,
  inviteToken,
  onSubmit,
  onCancel,
  isSubmitting: externalIsSubmitting = false,
}: ParticipationFormProps): JSX.Element {
  const [internalIsSubmitting, setInternalIsSubmitting] = useState(false);
  const isSubmitting = externalIsSubmitting || internalIsSubmitting;
  const { handleError, isError, error, clearError } = useParticipationErrorHandler();

  // 外部isSubmittingがfalseになったら内部状態もリセット（競合状態の解決）
  useEffect(() => {
    if (!externalIsSubmitting && internalIsSubmitting) {
      setInternalIsSubmitting(false);
    }
  }, [externalIsSubmitting, internalIsSubmitting]);

  // アクセシビリティ用のID生成
  const formId = "participation-form";
  const errorId = "participation-error";
  const attendanceGroupId = "attendance-status-group";
  const paymentGroupId = "payment-method-group";

  // スキーマのメモ化（毎レンダーでの再生成を防止）
  const validationSchema = useMemo(() => createParticipationFormSchema(event.fee), [event.fee]);

  const form = useForm({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      inviteToken,
      nickname: "",
      email: "",
      attendanceStatus: undefined as "attending" | "not_attending" | "maybe" | undefined,
      paymentMethod: undefined,
    },
    mode: "onChange", // リアルタイムバリデーション
  });

  const watchedAttendanceStatus = form.watch("attendanceStatus");

  // 条件ロジックの一元管理
  const isAttending = watchedAttendanceStatus === "attending";
  const isPaidEvent = event.fee > 0;
  const showPaymentMethod = isAttending && isPaidEvent;
  const showFeeInfo = isAttending; // 参加時は無料・有料問わず費用情報を表示

  const handleFormSubmit = async (data: ParticipationFormData): Promise<void> => {
    try {
      setInternalIsSubmitting(true);
      clearError();

      // バリデーションスキーマで既にサニタイゼーション済みのため、追加処理は不要
      const sanitizedData: ParticipationFormData = {
        inviteToken: data.inviteToken,
        nickname: data.nickname,
        email: data.email,
        attendanceStatus: data.attendanceStatus,
        // 不参加・未定の場合はpaymentMethodをundefinedに確実に設定
        paymentMethod: data.attendanceStatus === "attending" ? data.paymentMethod : undefined,
      };

      await onSubmit(sanitizedData);
    } catch (submitError) {
      // エラーハンドリング
      handleError(submitError, {
        eventId: event.id,
        action: "participation_submit",
        additionalData: {
          attendanceStatus: data.attendanceStatus,
          paymentMethod: data.paymentMethod,
          eventTitle: event.title,
        },
      });
    } finally {
      setInternalIsSubmitting(false);
    }
  };

  return (
    <ParticipationErrorBoundary>
      <Card className="p-4 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h3 id={`${formId}-title`} className="text-lg sm:text-xl font-semibold text-gray-900">
              参加申し込み
            </h3>
            <p id={`${formId}-description`} className="text-sm text-gray-600 mt-1">
              以下の情報を入力して参加申し込みを完了してください
            </p>
          </div>

          {/* エラー表示 */}
          {isError && error && (
            <Card
              className="p-3 sm:p-4 border-red-200 bg-red-50"
              role="alert"
              aria-live="polite"
              id={errorId}
            >
              <div className="flex items-start space-x-2 sm:space-x-3">
                <AlertTriangle
                  className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-red-800 mb-1 text-sm sm:text-base">
                    申し込みでエラーが発生しました
                  </h4>
                  <p className="text-red-700 text-xs sm:text-sm break-words">{error.userMessage}</p>
                  {error.retryable && (
                    <Button
                      onClick={clearError}
                      size="sm"
                      variant="outline"
                      className="mt-2 border-red-300 text-red-700 hover:bg-red-100 text-xs sm:text-sm"
                      aria-describedby={errorId}
                    >
                      再試行
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Form {...form}>
            <form
              id={formId}
              onSubmit={form.handleSubmit(handleFormSubmit)}
              className="space-y-4 sm:space-y-6"
              aria-labelledby={`${formId}-title`}
              aria-describedby={`${formId}-description ${isError ? errorId : ""}`}
              noValidate
            >
              {/* 招待トークン（フォームの堅牢性向上のJavaScript無効環境対応） */}
              <input type="hidden" {...form.register("inviteToken")} value={inviteToken} />
              {/* ニックネーム入力 */}
              <FormField
                control={form.control}
                name="nickname"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      ニックネーム{" "}
                      <span className="text-red-500" aria-label="必須項目">
                        *
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="表示名を入力してください"
                        maxLength={50}
                        className="w-full h-11 sm:h-10 text-base sm:text-sm"
                        autoComplete="name"
                        inputMode="text"
                        aria-required="true"
                        aria-invalid={fieldState.invalid}
                        aria-describedby={fieldState.error ? `${field.name}-error` : undefined}
                      />
                    </FormControl>
                    <FormMessage
                      className="text-xs sm:text-sm"
                      id={fieldState.error ? `${field.name}-error` : undefined}
                      role={fieldState.error ? "alert" : undefined}
                    />
                  </FormItem>
                )}
              />

              {/* メールアドレス入力 */}
              <FormField
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      メールアドレス{" "}
                      <span className="text-red-500" aria-label="必須項目">
                        *
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="example@email.com"
                        maxLength={255}
                        className="w-full h-11 sm:h-10 text-base sm:text-sm"
                        autoComplete="email"
                        inputMode="email"
                        aria-required="true"
                        aria-invalid={fieldState.invalid}
                        aria-describedby={fieldState.error ? `${field.name}-error` : undefined}
                      />
                    </FormControl>
                    <FormMessage
                      className="text-xs sm:text-sm"
                      id={fieldState.error ? `${field.name}-error` : undefined}
                      role={fieldState.error ? "alert" : undefined}
                    />
                  </FormItem>
                )}
              />

              {/* 参加ステータス選択 */}
              <FormField
                control={form.control}
                name="attendanceStatus"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700" id={attendanceGroupId}>
                      参加ステータス{" "}
                      <span className="text-red-500" aria-label="必須項目">
                        *
                      </span>
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value ?? ""}
                        onValueChange={(value) => {
                          field.onChange(value);

                          // 参加ステータスが変更された時の処理
                          if (value !== "attending") {
                            form.setValue("paymentMethod", undefined);
                            form.clearErrors("paymentMethod");
                          }
                          // paymentMethodのみを再検証
                          form.trigger("paymentMethod");
                        }}
                        className="space-y-3 sm:space-y-4"
                        aria-labelledby={attendanceGroupId}
                        aria-required="true"
                        aria-invalid={fieldState.invalid}
                        role="radiogroup"
                      >
                        <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                          <RadioGroupItem
                            value="attending"
                            id={`${formId}-attending`}
                            className="h-5 w-5 sm:h-4 sm:w-4"
                            aria-describedby={`${formId}-attending-description`}
                          />
                          <Label
                            htmlFor={`${formId}-attending`}
                            className="text-sm sm:text-sm font-normal cursor-pointer flex-1 leading-relaxed"
                          >
                            参加
                            {event.capacity && (
                              <span
                                id={`${formId}-attending-description`}
                                className="text-xs text-gray-500 ml-1 block sm:inline"
                              >
                                (定員: {event.attendances_count}/{event.capacity}人)
                              </span>
                            )}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                          <RadioGroupItem
                            value="not_attending"
                            id={`${formId}-not_attending`}
                            className="h-5 w-5 sm:h-4 sm:w-4"
                          />
                          <Label
                            htmlFor={`${formId}-not_attending`}
                            className="text-sm sm:text-sm font-normal cursor-pointer flex-1 leading-relaxed"
                          >
                            不参加
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                          <RadioGroupItem
                            value="maybe"
                            id={`${formId}-maybe`}
                            className="h-5 w-5 sm:h-4 sm:w-4"
                          />
                          <Label
                            htmlFor={`${formId}-maybe`}
                            className="text-sm sm:text-sm font-normal cursor-pointer flex-1 leading-relaxed"
                          >
                            未定
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage
                      className="text-xs sm:text-sm"
                      id={fieldState.error ? `${field.name}-error` : undefined}
                      role={fieldState.error ? "alert" : undefined}
                    />
                  </FormItem>
                )}
              />

              {/* 決済方法選択（参加選択時かつ有料イベントの場合のみ表示） */}
              {showPaymentMethod && (
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700" id={paymentGroupId}>
                        決済方法{" "}
                        <span className="text-red-500" aria-label="必須項目">
                          *
                        </span>
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value ?? ""}
                          onValueChange={(value) => {
                            field.onChange(value);
                          }}
                          className="space-y-3 sm:space-y-4"
                          aria-labelledby={paymentGroupId}
                          aria-required="true"
                          aria-invalid={fieldState.invalid}
                          role="radiogroup"
                        >
                          {event.payment_methods
                            // DBの型は既に"stripe"|"cash"のみで安全
                            .map((method) => (
                              <div
                                key={method}
                                className="flex items-start space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
                              >
                                <RadioGroupItem
                                  value={method}
                                  id={`${formId}-${method}`}
                                  className="h-5 w-5 sm:h-4 sm:w-4 mt-0.5"
                                  aria-describedby={`${formId}-${method}-description`}
                                />
                                <Label
                                  htmlFor={`${formId}-${method}`}
                                  className="text-sm sm:text-sm font-normal cursor-pointer flex-1 leading-relaxed"
                                >
                                  <div className="font-medium">{PAYMENT_METHOD_LABELS[method]}</div>
                                  {method === "stripe" && (
                                    <div
                                      id={`${formId}-${method}-description`}
                                      className="text-xs text-gray-500 mt-1"
                                    >
                                      クレジットカード決済
                                    </div>
                                  )}
                                  {method === "cash" && (
                                    <div
                                      id={`${formId}-${method}-description`}
                                      className="text-xs text-gray-500 mt-1"
                                    >
                                      当日現金支払い
                                    </div>
                                  )}
                                </Label>
                              </div>
                            ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage
                        className="text-xs sm:text-sm"
                        id={fieldState.error ? `${field.name}-error` : undefined}
                        role={fieldState.error ? "alert" : undefined}
                      />
                      <div
                        className="text-xs text-gray-500 mt-2 p-2 bg-blue-50 rounded-lg"
                        role="note"
                        aria-label="決済方法についての注意事項"
                      >
                        決済方法を選択してください。決済は後ほど処理されます。
                      </div>
                    </FormItem>
                  )}
                />
              )}

              {/* 参加費表示 */}
              {showFeeInfo && (
                <div
                  className={`p-3 sm:p-4 rounded-lg ${isPaidEvent ? "bg-blue-50" : "bg-green-50"}`}
                  role="region"
                  aria-label="参加費情報"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">参加費</span>
                    <span
                      className={`text-lg sm:text-xl font-semibold ${
                        isPaidEvent ? "text-blue-600" : "text-green-600"
                      }`}
                      aria-label={
                        isPaidEvent ? `参加費 ${event.fee.toLocaleString()}円` : "参加費 無料"
                      }
                    >
                      {isPaidEvent ? `${event.fee.toLocaleString()}円` : "無料"}
                    </span>
                  </div>
                </div>
              )}

              {/* フォームボタン */}
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 pt-4">
                <Button
                  type="submit"
                  disabled={isSubmitting || !form.formState.isValid}
                  className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 sm:h-10 text-base sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-describedby={
                    isSubmitting
                      ? "submit-status"
                      : !form.formState.isValid
                        ? "form-validation-status"
                        : undefined
                  }
                >
                  {isSubmitting ? "申し込み中..." : "参加申し込みを完了する"}
                  {isSubmitting && (
                    <span id="submit-status" className="sr-only" aria-live="polite">
                      申し込みを処理中です。しばらくお待ちください。
                    </span>
                  )}
                  {!form.formState.isValid && !isSubmitting && (
                    <span id="form-validation-status" className="sr-only" aria-live="polite">
                      フォームに入力エラーがあります。各項目をご確認ください。
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className="w-full sm:flex-1 h-12 sm:h-10 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  キャンセル
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </Card>
    </ParticipationErrorBoundary>
  );
}
