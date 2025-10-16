"use client";

import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import {
  CalendarIcon,
  MapPinIcon,
  CreditCardIcon,
  UsersIcon,
  ClockIcon,
  FileTextIcon,
  EditIcon,
} from "lucide-react";
import { UseFormReturn } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { EventFormData } from "../hooks/use-event-form";

type EventConfirmationSummaryProps = {
  form: UseFormReturn<EventFormData>;
  isFreeEvent: boolean;
  onEditStep: (stepId: "basic" | "settings" | "details") => void;
};

/**
 * 日時を人間が読みやすい形式にフォーマット
 * @example "2025-09-30T14:00" → "2025年9月30日（火）14:00"
 */
function formatDateTimeLocal(dateTimeLocal: string | undefined): string {
  if (!dateTimeLocal) return "未設定";
  try {
    const date = parseISO(dateTimeLocal);
    return format(date, "yyyy年M月d日（E）HH:mm", { locale: ja });
  } catch {
    return dateTimeLocal;
  }
}

/**
 * 金額を3桁カンマ区切りでフォーマット
 */
function formatCurrency(amount: string | number | undefined): string {
  if (amount === undefined || amount === null || amount === "") return "0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0";
  return num.toLocaleString("ja-JP");
}

/**
 * 決済方法を日本語に変換
 */
function formatPaymentMethod(method: string): string {
  const methodMap: Record<string, string> = {
    stripe: "オンライン決済",
    cash: "現金",
  };
  return methodMap[method] || method;
}

/**
 * イベント作成の確認画面用サマリーコンポーネント
 */
export function EventConfirmationSummary({
  form,
  isFreeEvent,
  onEditStep,
}: EventConfirmationSummaryProps): JSX.Element {
  const formData = form.getValues();

  const paymentMethodsArray = Array.isArray(formData.payment_methods)
    ? formData.payment_methods
    : [];
  const isOnlineSelected = paymentMethodsArray.includes("stripe");

  return (
    <div className="space-y-6">
      {/* 基本情報カード */}
      <Card className="border-2 border-blue-100 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CalendarIcon className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-lg">基本情報</CardTitle>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEditStep("basic")}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <EditIcon className="w-4 h-4 mr-1" />
              編集
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* タイトル */}
          <div>
            <div className="text-xs text-gray-500 mb-1">タイトル</div>
            <div className="text-base font-semibold text-gray-900">
              {formData.title || <span className="text-red-500">未設定</span>}
            </div>
          </div>

          {/* 開催日時 */}
          <div>
            <div className="text-xs text-gray-500 mb-1">開催日時</div>
            <div className="flex items-center space-x-2">
              <CalendarIcon className="w-4 h-4 text-gray-400" />
              <div className="text-base text-gray-900">{formatDateTimeLocal(formData.date)}</div>
            </div>
          </div>

          {/* 開催場所 */}
          <div>
            <div className="text-xs text-gray-500 mb-1">開催場所</div>
            <div className="flex items-center space-x-2">
              <MapPinIcon className="w-4 h-4 text-gray-400" />
              <div className="text-base text-gray-900">
                {formData.location || <span className="text-gray-400 italic">設定なし</span>}
              </div>
            </div>
          </div>

          {/* 定員 */}
          <div>
            <div className="text-xs text-gray-500 mb-1">定員</div>
            <div className="flex items-center space-x-2">
              <UsersIcon className="w-4 h-4 text-gray-400" />
              <div className="text-base text-gray-900">
                {formData.capacity ? (
                  <>
                    <span className="font-semibold">{formData.capacity}</span>名
                  </>
                ) : (
                  <span className="text-gray-500">制限なし</span>
                )}
              </div>
            </div>
          </div>

          {/* イベント説明 */}
          {formData.description && (
            <div>
              <div className="text-xs text-gray-500 mb-1">イベントの説明</div>
              <div className="flex items-start space-x-2">
                <FileTextIcon className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-gray-50 rounded p-3 w-full">
                  {formData.description}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 決済・締切設定カード */}
      <Card className="border-2 border-purple-100 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCardIcon className="w-5 h-5 text-purple-600" />
              <CardTitle className="text-lg">決済・締切設定</CardTitle>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEditStep("settings")}
              className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
            >
              <EditIcon className="w-4 h-4 mr-1" />
              編集
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 参加費 */}
          <div>
            <div className="text-xs text-gray-500 mb-1">参加費</div>
            <div className="text-2xl font-bold text-gray-900">
              {isFreeEvent ? (
                <Badge
                  variant="secondary"
                  className="text-base px-3 py-1 bg-green-100 text-green-700"
                >
                  無料
                </Badge>
              ) : (
                <span>¥{formatCurrency(formData.fee)}</span>
              )}
            </div>
          </div>

          {/* 決済方法 */}
          {!isFreeEvent && paymentMethodsArray.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2">利用可能な決済方法</div>
              <div className="flex flex-wrap gap-2">
                {paymentMethodsArray.map((method) => (
                  <Badge
                    key={method}
                    variant="outline"
                    className="text-sm px-3 py-1.5 bg-blue-50 border-blue-200 text-blue-700"
                  >
                    {formatPaymentMethod(method)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* タイムライン表示 */}
          <div className="border-t pt-4 mt-4">
            <div className="text-xs text-gray-500 mb-3">締切とイベントのタイムライン</div>
            <div className="space-y-3">
              {/* 申込締切 */}
              {formData.registration_deadline && (
                <div className="flex items-start space-x-3">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <div className="w-0.5 h-6 bg-gray-300"></div>
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="text-xs font-medium text-orange-700 mb-0.5">参加申込締切</div>
                    <div className="text-sm text-gray-900">
                      {formatDateTimeLocal(formData.registration_deadline)}
                    </div>
                  </div>
                </div>
              )}

              {/* オンライン決済締切 */}
              {!isFreeEvent && isOnlineSelected && formData.payment_deadline && (
                <div className="flex items-start space-x-3">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    <div className="w-0.5 h-6 bg-gray-300"></div>
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="text-xs font-medium text-purple-700 mb-0.5">
                      オンライン決済締切
                    </div>
                    <div className="text-sm text-gray-900">
                      {formatDateTimeLocal(formData.payment_deadline)}
                    </div>
                    {formData.allow_payment_after_deadline && (
                      <div className="text-xs text-gray-600 mt-1 flex items-center space-x-1">
                        <ClockIcon className="w-3 h-3" />
                        <span>締切後も{formData.grace_period_days || 0}日間の猶予期間あり</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* イベント開催日 */}
              {formData.date && (
                <div className="flex items-start space-x-3">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-blue-700 mb-0.5">イベント開催</div>
                    <div className="text-sm text-gray-900">
                      {formatDateTimeLocal(formData.date)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
