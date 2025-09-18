"use client";

import { Calendar, MapPin, Users, CreditCard, Clock, Info, Banknote } from "lucide-react";

import { PAYMENT_METHOD_LABELS } from "@core/constants/payment-methods";
import type { Event } from "@core/types/models";
import { sanitizeEventDescription, sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface EventOverviewProps {
  event: Event;
}

export function EventOverview({ event }: EventOverviewProps) {
  if (!event?.id || !event.title) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-gray-500">イベント情報が正しく読み込まれませんでした。</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return amount === 0 ? "無料" : `¥${amount.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* 基本情報カード */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            基本情報
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左列 */}
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">開催日時</p>
                    <p className="text-base text-gray-900 mt-1">
                      {formatUtcToJstByType(event.date, "japanese")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">開催場所</p>
                    <p className="text-base text-gray-900 mt-1">
                      {sanitizeForEventPay(event.location)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">定員</p>
                    <p className="text-base text-gray-900 mt-1">{event.capacity}人</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Banknote className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">参加費</p>
                    <p className="text-base text-gray-900 mt-1">{formatCurrency(event.fee)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 右列 */}
            <div className="space-y-6">
              {/* 締切情報 */}
              <div className="space-y-3">
                {event.registration_deadline && (
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">申込締切</p>
                      <p className="text-base text-gray-900 mt-1">
                        {formatUtcToJstByType(event.registration_deadline, "japanese")}
                      </p>
                    </div>
                  </div>
                )}

                {event.payment_deadline && (
                  <div className="flex items-start gap-3">
                    <CreditCard className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">オンライン決済締切</p>
                      <p className="text-base text-gray-900 mt-1">
                        {formatUtcToJstByType(event.payment_deadline, "japanese")}
                      </p>
                    </div>
                  </div>
                )}

                {event.fee > 0 && event.payment_methods && event.payment_methods.length > 0 && (
                  <div className="flex items-start gap-3">
                    <CreditCard className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">決済方法</p>
                      <div className="flex flex-wrap gap-2">
                        {event.payment_methods.map((method) => (
                          <Badge
                            key={method}
                            variant="outline"
                            className={`
                              ${method === "stripe" ? "border-purple-300 text-purple-700 bg-purple-50" : ""}
                              ${method === "cash" ? "border-orange-300 text-orange-700 bg-orange-50" : ""}
                            `}
                          >
                            {PAYMENT_METHOD_LABELS[method]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 詳細説明 */}
      {event.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              詳細説明
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none">
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {sanitizeEventDescription(event.description)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* メタ情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">作成・更新情報</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div className="space-y-1">
              <p className="font-medium text-gray-700">作成者</p>
              <p>{event.creator_name}</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-gray-700">作成日時</p>
              <p>{formatUtcToJstByType(event.created_at, "japanese")}</p>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="text-sm text-gray-500">
            <p>最終更新: {formatUtcToJstByType(event.updated_at, "japanese")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
