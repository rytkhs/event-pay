"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EventDetail } from "@/lib/utils/invite-token";
import {
  participationFormSchema,
  type ParticipationFormData,
  validateParticipationField,
  sanitizeParticipationInput,
} from "@/lib/validations/participation";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants/payment-methods";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ErrorBoundary, ParticipationErrorFallback } from "./error-boundary";
import { useParticipationErrorHandler } from "@/hooks/use-error-handler";
import { AlertTriangle } from "lucide-react";

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
}: ParticipationFormProps) {
  const [internalIsSubmitting, setInternalIsSubmitting] = useState(false);
  const isSubmitting = externalIsSubmitting || internalIsSubmitting;
  const { handleError, isError, error, clearError } = useParticipationErrorHandler();

  const form = useForm<ParticipationFormData>({
    resolver: zodResolver(participationFormSchema),
    defaultValues: {
      inviteToken,
      nickname: "",
      email: "",
      attendanceStatus: undefined,
      paymentMethod: undefined,
    },
    mode: "onChange", // リアルタイムバリデーション
  });

  const watchedAttendanceStatus = form.watch("attendanceStatus");
  const showPaymentMethod = watchedAttendanceStatus === "attending" && event.fee > 0;

  // フィールドレベルのリアルタイムバリデーション（セキュリティ対策強化版）
  const handleFieldChange = (fieldName: keyof ParticipationFormData, value: string) => {
    // クライアントサイドでは詳細なセキュリティログは記録しない
    // （サーバーサイドで包括的にログ記録される）
    const errors = validateParticipationField(fieldName, value, form.getValues());

    // エラーがある場合は表示、ない場合はクリア
    if (errors[fieldName]) {
      form.setError(fieldName, { message: errors[fieldName] });
    } else {
      form.clearErrors(fieldName);
    }
  };

  const handleFormSubmit = async (data: ParticipationFormData) => {
    try {
      setInternalIsSubmitting(true);
      clearError(); // 前回のエラーをクリア

      // 入力データのサニタイゼーション（クライアントサイド）
      // サーバーサイドでも再度サニタイゼーションが実行される
      const sanitizedData: ParticipationFormData = {
        ...data,
        nickname: sanitizeParticipationInput.nickname(data.nickname),
        email: sanitizeParticipationInput.email(data.email),
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
    <ErrorBoundary fallback={ParticipationErrorFallback}>
      <Card className="p-4 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900">参加申し込み</h3>
            <p className="text-sm text-gray-600 mt-1">
              以下の情報を入力して参加申し込みを完了してください
            </p>
          </div>

          {/* エラー表示 */}
          {isError && error && (
            <Card className="p-3 sm:p-4 border-red-200 bg-red-50">
              <div className="flex items-start space-x-2 sm:space-x-3">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 flex-shrink-0 mt-0.5" />
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
                    >
                      再試行
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 sm:space-y-6">
              {/* ニックネーム入力 */}
              <FormField
                control={form.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      ニックネーム <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="表示名を入力してください"
                        maxLength={50}
                        onChange={(e) => {
                          field.onChange(e);
                          handleFieldChange("nickname", e.target.value);
                        }}
                        className="w-full h-11 sm:h-10 text-base sm:text-sm"
                        autoComplete="name"
                        inputMode="text"
                      />
                    </FormControl>
                    <FormMessage className="text-xs sm:text-sm" />
                  </FormItem>
                )}
              />

              {/* メールアドレス入力 */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      メールアドレス <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="example@email.com"
                        maxLength={255}
                        onChange={(e) => {
                          field.onChange(e);
                          handleFieldChange("email", e.target.value);
                        }}
                        className="w-full h-11 sm:h-10 text-base sm:text-sm"
                        autoComplete="email"
                        inputMode="email"
                      />
                    </FormControl>
                    <FormMessage className="text-xs sm:text-sm" />
                  </FormItem>
                )}
              />

              {/* 参加ステータス選択 */}
              <FormField
                control={form.control}
                name="attendanceStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      参加ステータス <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          handleFieldChange("attendanceStatus", value);

                          // 参加ステータスが変更された時の処理
                          if (value !== "attending") {
                            form.setValue("paymentMethod", undefined);
                            form.clearErrors("paymentMethod");
                          }
                        }}
                        className="space-y-3 sm:space-y-4"
                      >
                        <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          <RadioGroupItem
                            value="attending"
                            id="attending"
                            className="h-5 w-5 sm:h-4 sm:w-4"
                          />
                          <Label
                            htmlFor="attending"
                            className="text-sm sm:text-sm font-normal cursor-pointer flex-1 leading-relaxed"
                          >
                            参加
                            {event.capacity && (
                              <span className="text-xs text-gray-500 ml-1 block sm:inline">
                                (定員: {event.attendances_count}/{event.capacity}人)
                              </span>
                            )}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          <RadioGroupItem
                            value="not_attending"
                            id="not_attending"
                            className="h-5 w-5 sm:h-4 sm:w-4"
                          />
                          <Label
                            htmlFor="not_attending"
                            className="text-sm sm:text-sm font-normal cursor-pointer flex-1 leading-relaxed"
                          >
                            不参加
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          <RadioGroupItem
                            value="maybe"
                            id="maybe"
                            className="h-5 w-5 sm:h-4 sm:w-4"
                          />
                          <Label
                            htmlFor="maybe"
                            className="text-sm sm:text-sm font-normal cursor-pointer flex-1 leading-relaxed"
                          >
                            未定
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage className="text-xs sm:text-sm" />
                  </FormItem>
                )}
              />

              {/* 決済方法選択（参加選択時かつ有料イベントの場合のみ表示） */}
              {showPaymentMethod && (
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        決済方法 <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            handleFieldChange("paymentMethod", value);
                          }}
                          className="space-y-3 sm:space-y-4"
                          aria-label="決済方法"
                        >
                          {event.payment_methods
                            .filter((method) => method !== "free") // 無料決済方法は除外
                            .map((method) => (
                              <div
                                key={method}
                                className="flex items-start space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                              >
                                <RadioGroupItem
                                  value={method}
                                  id={method}
                                  className="h-5 w-5 sm:h-4 sm:w-4 mt-0.5"
                                />
                                <Label
                                  htmlFor={method}
                                  className="text-sm sm:text-sm font-normal cursor-pointer flex-1 leading-relaxed"
                                >
                                  <div className="font-medium">{PAYMENT_METHOD_LABELS[method]}</div>
                                  {method === "stripe" && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      クレジットカード決済
                                    </div>
                                  )}
                                  {method === "cash" && (
                                    <div className="text-xs text-gray-500 mt-1">当日現金支払い</div>
                                  )}
                                </Label>
                              </div>
                            ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage className="text-xs sm:text-sm" />
                      <div className="text-xs text-gray-500 mt-2 p-2 bg-blue-50 rounded-lg">
                        決済方法を選択してください。決済は後ほど処理されます。
                      </div>
                    </FormItem>
                  )}
                />
              )}

              {/* 参加費表示 */}
              {watchedAttendanceStatus === "attending" && event.fee > 0 && (
                <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">参加費</span>
                    <span className="text-lg sm:text-xl font-semibold text-blue-600">
                      {event.fee.toLocaleString()}円
                    </span>
                  </div>
                </div>
              )}

              {/* 無料イベントの場合の表示 */}
              {watchedAttendanceStatus === "attending" && event.fee === 0 && (
                <div className="bg-green-50 p-3 sm:p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">参加費</span>
                    <span className="text-lg sm:text-xl font-semibold text-green-600">無料</span>
                  </div>
                </div>
              )}

              {/* フォームボタン */}
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 pt-4">
                <Button
                  type="submit"
                  disabled={isSubmitting || !form.formState.isValid}
                  className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 sm:h-10 text-base sm:text-sm font-medium"
                >
                  {isSubmitting ? "申し込み中..." : "参加申し込みを完了する"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className="w-full sm:flex-1 h-12 sm:h-10 text-base sm:text-sm"
                >
                  キャンセル
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </Card>
    </ErrorBoundary>
  );
}
