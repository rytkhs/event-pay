"use client";

import { useState, useEffect } from "react";

import type { Event } from "@core/types/models";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChangeConfirmationDialog,
  type ChangeItem,
} from "@/components/ui/change-confirmation-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useEventEditForm, type EventEditFormDataRHF } from "../hooks/use-event-edit-form";
import { useRestrictionContext, useFormDataSnapshot } from "../hooks/use-unified-restrictions";

import { UnifiedRestrictionNoticeV2 } from "./unified-restriction-notice-v2";

interface EventEditFormProps {
  event: Event;
  attendeeCount: number;
  onSubmit?: (data: Event) => void;
  serverError?: string;
  hasStripePaid?: boolean;
  canUseOnlinePayments?: boolean;
}

export function EventEditForm({
  event,
  attendeeCount,
  onSubmit,
  serverError,
  hasStripePaid = false,
  canUseOnlinePayments = false,
}: EventEditFormProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<ChangeItem[]>([]);

  const {
    form,
    isPending,
    hasAttendees,
    validation,
    changes,
    actions,
    restrictions,
    isFreeEvent, // 無料イベント判定フラグ
  } = useEventEditForm({
    event,
    attendeeCount,
    onSubmit,
    hasStripePaid,
  });

  // 統一制限システム用のデータ（V2表示コンポーネント用）
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

  /**
   * Stripe Connect設定状態の判定
   * - canUseOnlinePayments: Stripe Connect準備完了（ready状態）
   * - hasExistingStripe: 既存イベントでStripe設定済み
   * - hasStripeSelected: 現在フォームでStripeが選択中
   */
  const needsStripeSetup = hasStripeSelected && !canUseOnlinePayments;

  // 型安全な決済方法の選択肢
  // Stripe Connectが準備できていない場合はオンライン決済を選択肢から除外
  // ただし、既存イベントでStripeが設定済みの場合は編集継続のため選択肢として残す
  const hasExistingStripe = event.payment_methods?.includes("stripe");
  const showStripeOption = canUseOnlinePayments || hasExistingStripe;

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

  // Stripe選択時の即時バリデーション
  useEffect(() => {
    if (hasStripeSelected && !isFreeEvent) {
      void form.trigger("payment_deadline");
    }
  }, [hasStripeSelected, isFreeEvent, form]);

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
  };

  return (
    <>
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-4">
            <CardTitle className="text-2xl font-bold">イベント編集</CardTitle>
          </div>

          {/* サーバーエラーの表示 */}
          {serverError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {serverError}
            </div>
          )}

          {/* 全体エラーの表示 */}
          {form.formState.errors.root && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {form.formState.errors.root.message}
            </div>
          )}

          {/* 統合制限通知（V2） */}
          <UnifiedRestrictionNoticeV2
            restrictions={restrictionContext}
            formData={formDataSnapshot}
            showLevels={["structural", "conditional", "advisory"]}
          />
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8" noValidate>
              {/* 基本情報セクション */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">基本情報</h3>
                  <p className="text-sm text-gray-500">イベントの基本的な情報を入力してください</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* タイトル */}
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          タイトル <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isPending} maxLength={100} required />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 場所 */}
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>場所</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isPending} maxLength={200} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 開催日時 */}
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          開催日時 <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} type="datetime-local" disabled={isPending} required />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 定員 */}
                  <FormField
                    control={form.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>定員</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={hasAttendees ? attendeeCount : 1}
                            disabled={isPending}
                            placeholder="制限なしの場合は空欄"
                            value={field.value || ""}
                            onChange={(e) => {
                              // 空文字列の場合は空文字列を維持（NaN防止）
                              const value = e.target.value;
                              field.onChange(value === "" ? "" : value);
                            }}
                          />
                        </FormControl>
                        {hasAttendees && (
                          <FormDescription className="text-xs text-gray-500">
                            参加者がいるため、定員は現在の参加者数（{attendeeCount}
                            名）未満に設定できません。
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 説明 */}
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>説明</FormLabel>
                        <FormControl>
                          <Textarea {...field} disabled={isPending} rows={3} maxLength={1000} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* 料金・決済セクション */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">料金・決済</h3>
                  <p className="text-sm text-gray-500">参加費と決済方法を設定してください</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 参加費 */}
                  <FormField
                    control={form.control}
                    name="fee"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          参加費（円） <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            disabled={isPending || !restrictions.isFieldEditable("fee")}
                            required
                          />
                        </FormControl>
                        {!restrictions.isFieldEditable("fee") ? (
                          <FormDescription className="text-xs text-gray-500">
                            決済済み参加者がいるため、この項目は変更できません。
                          </FormDescription>
                        ) : (
                          <FormDescription className="text-sm text-gray-600">
                            0円（無料）または100円以上で設定してください。
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 決済方法選択 - 条件付き表示 */}
                  {!isFreeEvent && (
                    <FormField
                      control={form.control}
                      name="payment_methods"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            決済方法 <span className="text-red-500">*</span>
                          </FormLabel>
                          <div className="space-y-2">
                            {paymentOptions.map((option) => (
                              <div key={option.value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`payment-${option.value}`}
                                  checked={field.value?.includes(option.value)}
                                  onCheckedChange={(checked) => {
                                    const existingMethods = event.payment_methods || [];
                                    if (checked) {
                                      const next = [
                                        ...new Set([...(field.value || []), option.value]),
                                      ];
                                      field.onChange(next);
                                    } else {
                                      // 既存メソッドの解除は禁止（hasStripePaid時）
                                      if (hasStripePaid && existingMethods.includes(option.value)) {
                                        return;
                                      }
                                      const next = (field.value || []).filter(
                                        (v) => v !== option.value
                                      );
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
                                    Stripe Connectの設定が必要です
                                  </p>
                                  <p className="text-amber-700 mt-1">
                                    オンライン決済を受け取るには、Stripe
                                    Connectアカウントの設定を完了してください。
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
                </div>
              </div>

              {/* 締切設定セクション */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">締切設定</h3>
                  <p className="text-sm text-gray-500">
                    参加申込とオンライン決済の締切日時を設定してください
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 参加申込締切 */}
                  <FormField
                    control={form.control}
                    name="registration_deadline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>参加申込締切</FormLabel>
                        <FormControl>
                          <Input {...field} type="datetime-local" disabled={isPending} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          ※ 未入力時は既存の設定が保持されます。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 支払い締切（オンライン決済選択時のみ表示） */}
                  {hasStripeSelected && !isFreeEvent && (
                    <FormField
                      control={form.control}
                      name="payment_deadline"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>オンライン決済締切</FormLabel>
                          <FormControl>
                            <Input {...field} type="datetime-local" disabled={isPending} />
                          </FormControl>
                          {/* <FormDescription className="text-xs text-red-600">
                            オンライン決済を有効にしたため必須です
                          </FormDescription> */}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* 締切後もオンライン決済を許可 + 猶予（日）: オンライン決済選択時のみ */}
                {hasStripeSelected && !isFreeEvent && (
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="allow_payment_after_deadline"
                      render={() => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={Boolean(form.watch("allow_payment_after_deadline"))}
                              onCheckedChange={(checked) => {
                                form.setValue("allow_payment_after_deadline", checked === true);
                                void form.trigger();
                              }}
                              disabled={isPending}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>締切後もオンライン決済を許可</FormLabel>
                            <FormDescription>
                              オンライン決済締切（または開催日時）後も支払いを受け付けます（最長30日まで）。
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    {form.watch("allow_payment_after_deadline") && (
                      <FormField
                        control={form.control}
                        name="grace_period_days"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>猶予（日）</FormLabel>
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
                                onChange={(e) => {
                                  const v = e.target.value;
                                  field.onChange(v);
                                  void form.trigger();
                                }}
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

              {/* アクションボタン */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <Button
                  type="submit"
                  disabled={isPending || !changes.hasChanges || validation.hasErrors}
                  className="flex-1 sm:flex-none sm:min-w-[120px]"
                >
                  {isPending ? "更新中..." : "変更を保存"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetForm}
                  disabled={isPending || !changes.hasChanges}
                  className="flex-1 sm:flex-none sm:min-w-[120px]"
                >
                  リセット
                </Button>

                <div className="text-sm text-gray-600 flex items-center">
                  {changes.hasChanges ? (
                    <span className="text-amber-600">
                      未保存の変更: {changes.getChangeCount()}項目
                    </span>
                  ) : (
                    <span>変更はありません</span>
                  )}
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

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
