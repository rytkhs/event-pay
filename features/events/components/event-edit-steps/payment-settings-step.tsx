"use client";

import { Users } from "lucide-react";
import type { Control, FieldErrors } from "react-hook-form";

import type { Event } from "@core/types/models";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import type { EventEditFormDataRHF } from "../../hooks/use-event-edit-form";

interface PaymentSettingsStepProps {
  control: Control<EventEditFormDataRHF>;
  isPending: boolean;
  changedFields: Set<string>;
  errors: FieldErrors<EventEditFormDataRHF>;
  isFreeEvent: boolean;
  hasStripeSelected: boolean;
  canUseOnlinePayments: boolean;
  hasStripePaid: boolean;
  event: Event;
  watchedAllowPaymentAfterDeadline: boolean;
}

/**
 * イベント編集: 受付・決済設定ステップ
 * 決済方法、申込締切、決済締切、猶予設定を入力
 */
export function PaymentSettingsStep({
  control,
  isPending,
  changedFields,
  errors,
  isFreeEvent,
  hasStripeSelected,
  canUseOnlinePayments,
  hasStripePaid,
  event,
  watchedAllowPaymentAfterDeadline,
}: PaymentSettingsStepProps) {
  const hasExistingStripe = event.payment_methods?.includes("stripe");
  const showStripeOption = canUseOnlinePayments || hasExistingStripe;
  const needsStripeSetup = hasStripeSelected && !canUseOnlinePayments;

  const paymentOptions: { value: Event["payment_methods"][number]; label: string }[] = [
    ...(showStripeOption
      ? [
          {
            value: "stripe" as const,
            label:
              hasExistingStripe && !canUseOnlinePayments
                ? "オンライン決済（要設定確認）"
                : "オンライン決済",
          },
        ]
      : []),
    { value: "cash", label: "現金" },
  ];

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b">
          <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">受付・決済設定</h3>
            <p className="text-sm text-muted-foreground">締切と決済方法を設定してください</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* 申込締切 */}
          <FormField
            control={control}
            name="registration_deadline"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  {changedFields.has("registration_deadline") && (
                    <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                  )}
                  <FormLabel>
                    参加申込締切
                    {changedFields.has("registration_deadline") && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-xs bg-orange-50 text-orange-700"
                      >
                        変更済み
                      </Badge>
                    )}
                  </FormLabel>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    type="datetime-local"
                    disabled={isPending}
                    className={
                      changedFields.has("registration_deadline")
                        ? "bg-orange-50/30 border-orange-200"
                        : ""
                    }
                  />
                </FormControl>
                <FormDescription className="text-xs text-gray-500">
                  ※ 未入力時は既存の設定が保持されます。
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 決済方法選択 - 無料イベントでない場合のみ表示 */}
          {!isFreeEvent && (
            <FormField
              control={control}
              name="payment_methods"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    {changedFields.has("payment_methods") && (
                      <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                    )}
                    <FormLabel>
                      決済方法 <span className="text-red-500">*</span>
                      {changedFields.has("payment_methods") && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-xs bg-orange-50 text-orange-700"
                        >
                          変更済み
                        </Badge>
                      )}
                    </FormLabel>
                  </div>
                  <div className="space-y-2">
                    {paymentOptions.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`payment-${option.value}`}
                          checked={field.value?.includes(option.value)}
                          onCheckedChange={(checked) => {
                            const existingMethods = event.payment_methods || [];
                            if (checked) {
                              const next = [...new Set([...(field.value || []), option.value])];
                              field.onChange(next);
                            } else {
                              // 既存メソッドの解除は禁止（hasStripePaid時）
                              if (hasStripePaid && existingMethods.includes(option.value)) {
                                return;
                              }
                              const next = (field.value || []).filter((v) => v !== option.value);
                              field.onChange(next);
                            }
                          }}
                          disabled={isPending}
                        />
                        <label
                          htmlFor={`payment-${option.value}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Stripe Connect設定が必要な場合の警告 */}
                  {needsStripeSetup && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <div className="flex items-start space-x-2">
                        <div className="text-amber-600 mt-0.5">⚠️</div>
                        <div className="text-sm">
                          <p className="text-amber-800 font-medium">
                            Stripeアカウントの設定が必要です
                          </p>
                          <p className="text-amber-700 mt-1">
                            オンライン決済を受け取るには、Stripe
                            アカウントの設定を完了してください。
                          </p>
                          <a
                            href="/dashboard/connect"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-amber-700 hover:text-amber-800 underline text-xs mt-1"
                          >
                            設定画面を開く →
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {hasStripePaid ? (
                    <FormDescription className="text-xs text-gray-500">
                      決済済み参加者がいるため、既存の決済方法は解除できません。新しい決済方法の追加は可能です。
                    </FormDescription>
                  ) : (
                    <FormDescription className="text-xs text-gray-500">
                      オンライン決済を選択する場合は、下部でオンライン決済締切を必ず設定してください
                      <span className="text-red-500 ml-1 font-bold">*</span>
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* 無料イベント用の説明 */}
          {isFreeEvent && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
              <p className="text-sm">ℹ️ 参加費が0円のため、決済方法の設定は不要です。</p>
            </div>
          )}

          {/* オンライン決済締切（オンライン決済選択時のみ表示） */}
          {hasStripeSelected && !isFreeEvent && (
            <FormField
              control={control}
              name="payment_deadline"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    {changedFields.has("payment_deadline") && (
                      <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                    )}
                    <FormLabel>
                      オンライン決済締切
                      {changedFields.has("payment_deadline") && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-xs bg-orange-50 text-orange-700"
                        >
                          変更済み
                        </Badge>
                      )}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      type="datetime-local"
                      disabled={isPending}
                      className={
                        changedFields.has("payment_deadline")
                          ? "bg-orange-50/30 border-orange-200"
                          : ""
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* 締切後もオンライン決済を許可 + 猶予（日）: オンライン決済選択時のみ */}
          {hasStripeSelected && !isFreeEvent && (
            <div className="space-y-3">
              <FormField
                control={control}
                name="allow_payment_after_deadline"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between space-x-3 space-y-0">
                    <div className="space-y-1 leading-none">
                      <div className="flex items-center gap-2">
                        {changedFields.has("allow_payment_after_deadline") && (
                          <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                        )}
                        <FormLabel>
                          締切後も決済を許可
                          {changedFields.has("allow_payment_after_deadline") && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-xs bg-orange-50 text-orange-700"
                            >
                              変更済み
                            </Badge>
                          )}
                        </FormLabel>
                      </div>
                      <FormDescription>
                        オンライン決済締切（または開催日時）後も支払いを受け付けます（最長30日まで）。
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

              {watchedAllowPaymentAfterDeadline && (
                <FormField
                  control={control}
                  name="grace_period_days"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        {changedFields.has("grace_period_days") && (
                          <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                        )}
                        <FormLabel>
                          猶予（日）
                          {changedFields.has("grace_period_days") && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-xs bg-orange-50 text-orange-700"
                            >
                              変更済み
                            </Badge>
                          )}
                        </FormLabel>
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max="30"
                          step="1"
                          placeholder="例：7"
                          disabled={isPending}
                          className={
                            changedFields.has("grace_period_days")
                              ? "bg-orange-50/30 border-orange-200"
                              : ""
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        オンライン決済締切（または開催日時）からの猶予日数（最大30日）。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
