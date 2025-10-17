"use client";

import { Check } from "lucide-react";

import type { Event } from "@core/types/models";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ChangeItem } from "@/components/ui/change-confirmation-dialog";

import { EventFormTimeline } from "../event-form-timeline";

interface ConfirmationStepProps {
  event: Event;
  changes: ChangeItem[];
  attendeeCount: number;
  hasStripePaid: boolean;
  // タイムライン表示用のフォーム値
  watchedDate?: string;
  watchedRegistrationDeadline?: string;
  watchedPaymentDeadline?: string;
  watchedGracePeriodDays?: string;
}

/**
 * イベント編集: 確認・更新ステップ
 * 変更内容の一覧とタイムラインを表示
 */
export function ConfirmationStep({
  event,
  changes,
  attendeeCount,
  hasStripePaid,
  watchedDate,
  watchedRegistrationDeadline,
  watchedPaymentDeadline,
  watchedGracePeriodDays,
}: ConfirmationStepProps) {
  const formatValue = (value: string | string[] | undefined | null): string => {
    if (!value) return "（未設定）";
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(", ") : "（未設定）";
    }
    return value;
  };

  const formatPaymentMethod = (method: string): string => {
    const methods: Record<string, string> = {
      stripe: "オンライン決済",
      cash: "現金",
    };
    return methods[method] || method;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
              <Check className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">確認・更新</h3>
              <p className="text-sm text-muted-foreground">変更内容を確認して更新してください</p>
            </div>
          </div>

          {/* 変更サマリー */}
          <div>
            <h4 className="text-sm font-semibold mb-3">変更内容</h4>
            {changes.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                変更はありません
              </div>
            ) : (
              <div className="space-y-3">
                {changes.map((change, index) => (
                  <div
                    key={`${change.field}-${index}`}
                    className="bg-orange-50/50 border border-orange-200 rounded-lg p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs bg-white">
                        {change.fieldName}
                      </Badge>
                      <span className="text-xs text-gray-500">が変更されます</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-gray-500 block mb-1">変更前</span>
                        <div className="font-medium text-gray-700 bg-white rounded px-3 py-2">
                          {change.field === "payment_methods" && typeof change.oldValue === "string"
                            ? change.oldValue.split(", ").map(formatPaymentMethod).join(", ")
                            : formatValue(change.oldValue)}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block mb-1">変更後</span>
                        <div className="font-medium text-orange-700 bg-white rounded px-3 py-2">
                          {change.field === "payment_methods" && typeof change.newValue === "string"
                            ? change.newValue.split(", ").map(formatPaymentMethod).join(", ")
                            : formatValue(change.newValue)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 参加者への影響通知 */}
          {attendeeCount > 0 && changes.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <div className="text-blue-600 mt-0.5">ℹ️</div>
                <div className="text-sm">
                  <p className="font-medium text-blue-900 mb-1">参加者への通知について</p>
                  <p className="text-blue-800">
                    現在 <strong>{attendeeCount}名</strong>{" "}
                    の参加者がいます。変更内容は自動で通知されませんので、必要に応じて個別に連絡してください。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 決済制限の通知 */}
          {hasStripePaid && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <div className="text-amber-600 mt-0.5">⚠️</div>
                <div className="text-sm">
                  <p className="font-medium text-amber-900 mb-1">編集制限について</p>
                  <p className="text-amber-800">
                    決済済み参加者がいるため、参加費と既存の決済方法は変更できません。
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* タイムライン表示 */}
      <EventFormTimeline
        registrationDeadline={watchedRegistrationDeadline}
        paymentDeadline={watchedPaymentDeadline}
        eventDate={watchedDate}
        gracePeriodDays={watchedGracePeriodDays}
      />

      {/* 現在の設定サマリー */}
      <Card>
        <CardContent className="pt-6">
          <h4 className="text-sm font-semibold mb-3">更新後の設定</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">タイトル</span>
              <span className="font-medium">{event.title}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">参加費</span>
              <span className="font-medium">
                {event.fee === 0 ? "無料" : `${event.fee?.toLocaleString()}円`}
              </span>
            </div>
            {event.capacity && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">定員</span>
                <span className="font-medium">{event.capacity}名</span>
              </div>
            )}
            {event.location && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">場所</span>
                <span className="font-medium">{event.location}</span>
              </div>
            )}
            {event.payment_methods && event.payment_methods.length > 0 && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">決済方法</span>
                <span className="font-medium">
                  {event.payment_methods.map(formatPaymentMethod).join(", ")}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
