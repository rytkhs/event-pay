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

  // フィールドレベルのリアルタイムバリデーション
  const handleFieldChange = (fieldName: keyof ParticipationFormData, value: string) => {
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

      // 入力データのサニタイゼーション
      const sanitizedData: ParticipationFormData = {
        ...data,
        nickname: sanitizeParticipationInput.nickname(data.nickname),
        email: sanitizeParticipationInput.email(data.email),
      };

      await onSubmit(sanitizedData);
    } catch (error) {
      // エラーハンドリングは親コンポーネントで行う
    } finally {
      setInternalIsSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">参加申し込み</h3>
          <p className="text-sm text-gray-600 mt-1">
            以下の情報を入力して参加申し込みを完了してください
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
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
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage />
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
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage />
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
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="attending" id="attending" />
                        <Label htmlFor="attending" className="text-sm font-normal cursor-pointer">
                          参加
                          {event.capacity && (
                            <span className="text-xs text-gray-500 ml-1">
                              (定員: {event.attendances_count}/{event.capacity}人)
                            </span>
                          )}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="not_attending" id="not_attending" />
                        <Label
                          htmlFor="not_attending"
                          className="text-sm font-normal cursor-pointer"
                        >
                          不参加
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="maybe" id="maybe" />
                        <Label htmlFor="maybe" className="text-sm font-normal cursor-pointer">
                          未定
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
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
                        className="space-y-3"
                        aria-label="決済方法"
                      >
                        {event.payment_methods
                          .filter((method) => method !== "free") // 無料決済方法は除外
                          .map((method) => (
                            <div key={method} className="flex items-center space-x-2">
                              <RadioGroupItem value={method} id={method} />
                              <Label
                                htmlFor={method}
                                className="text-sm font-normal cursor-pointer"
                              >
                                {PAYMENT_METHOD_LABELS[method]}
                                {method === "stripe" && (
                                  <span className="text-xs text-gray-500 ml-1">
                                    (クレジットカード決済)
                                  </span>
                                )}
                                {method === "cash" && (
                                  <span className="text-xs text-gray-500 ml-1">
                                    (当日現金支払い)
                                  </span>
                                )}
                              </Label>
                            </div>
                          ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                    <div className="text-xs text-gray-500 mt-2">
                      決済方法を選択してください。決済は後ほど処理されます。
                    </div>
                  </FormItem>
                )}
              />
            )}

            {/* 参加費表示 */}
            {watchedAttendanceStatus === "attending" && event.fee > 0 && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">参加費</span>
                  <span className="text-lg font-semibold text-blue-600">
                    {event.fee.toLocaleString()}円
                  </span>
                </div>
              </div>
            )}

            {/* 無料イベントの場合の表示 */}
            {watchedAttendanceStatus === "attending" && event.fee === 0 && (
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">参加費</span>
                  <span className="text-lg font-semibold text-green-600">無料</span>
                </div>
              </div>
            )}

            {/* フォームボタン */}
            <div className="flex space-x-4 pt-4">
              <Button
                type="submit"
                disabled={isSubmitting || !form.formState.isValid}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? "申し込み中..." : "参加申し込みを完了する"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
                className="flex-1"
              >
                キャンセル
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Card>
  );
}
