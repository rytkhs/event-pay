"use client";

import {
  Calendar,
  MapPin,
  Banknote,
  Clock,
  CreditCard,
  Info,
  ChevronDown,
  Users,
} from "lucide-react";

import { PAYMENT_METHOD_LABELS } from "@core/constants/payment-methods";
import type { Event } from "@core/types/models";
import { sanitizeEventDescription, sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface EventInfoAccordionProps {
  event: Event;
}

export function EventInfoAccordion({ event }: EventInfoAccordionProps) {
  if (!event?.id || !event.title) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">イベント情報が正しく読み込まれませんでした。</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return amount === 0 ? "無料" : `¥${amount.toLocaleString()}`;
  };

  // 詳細情報があるかどうかをチェック
  const hasDeadlines = event.registration_deadline || event.payment_deadline;
  const hasPaymentMethods =
    event.fee > 0 && event.payment_methods && event.payment_methods.length > 0;
  const hasDescription = event.description;
  const hasDetailContent = hasDeadlines || hasPaymentMethods || hasDescription;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        {/* 基本情報（常時表示 - 3列ハイライト） */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* 日時 */}
          <div className="flex flex-col items-center p-3 bg-gray-50 rounded-xl text-center">
            <Calendar className="h-5 w-5 text-primary mb-1.5" />
            <span className="text-xs text-muted-foreground mb-0.5">開催日時</span>
            <span className="text-sm font-medium text-foreground leading-tight">
              {formatUtcToJstByType(event.date, "compact")}
            </span>
          </div>

          {/* 場所 */}
          <div className="flex flex-col items-center p-3 bg-gray-50 rounded-xl text-center">
            <MapPin className="h-5 w-5 text-primary mb-1.5" />
            <span className="text-xs text-muted-foreground mb-0.5">場所</span>
            <span className="text-sm font-medium text-foreground leading-tight truncate w-full px-1">
              {sanitizeForEventPay(event.location)}
            </span>
          </div>

          {/* 参加費 */}
          <div className="flex flex-col items-center p-3 bg-gray-50 rounded-xl text-center">
            <Banknote className="h-5 w-5 text-primary mb-1.5" />
            <span className="text-xs text-muted-foreground mb-0.5">参加費</span>
            <span className="text-sm font-bold text-foreground">{formatCurrency(event.fee)}</span>
          </div>
        </div>

        {/* 定員（設定されている場合のみ） */}
        {event.capacity !== null && (
          <div className="flex items-center justify-center gap-2 mb-4 py-2 px-3 bg-blue-50 rounded-lg">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-700">
              定員: <span className="font-bold">{event.capacity}人</span>
            </span>
          </div>
        )}

        {/* 詳細情報（アコーディオン） */}
        {hasDetailContent && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details" className="border-0">
              <AccordionTrigger className="py-2 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 hover:no-underline [&[data-state=open]]:rounded-b-none">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                  <span>締切・決済方法・詳細説明</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-0">
                <div className="space-y-4 p-4 bg-gray-50 rounded-b-lg">
                  {/* 締切情報 */}
                  {hasDeadlines && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">締切情報</span>
                      </div>

                      <div className="grid gap-2 pl-6">
                        {event.registration_deadline && (
                          <div className="flex items-center justify-between py-2 px-3 bg-white rounded-lg">
                            <span className="text-xs text-muted-foreground">申込締切</span>
                            <span className="text-sm font-medium">
                              {formatUtcToJstByType(event.registration_deadline, "japanese")}
                            </span>
                          </div>
                        )}

                        {event.payment_deadline && (
                          <div className="flex items-center justify-between py-2 px-3 bg-white rounded-lg">
                            <span className="text-xs text-muted-foreground">
                              オンライン決済締切
                            </span>
                            <span className="text-sm font-medium">
                              {formatUtcToJstByType(event.payment_deadline, "japanese")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 決済方法 */}
                  {hasPaymentMethods && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">決済方法</span>
                      </div>
                      <div className="flex flex-wrap gap-2 pl-6">
                        {event.payment_methods?.map((method) => (
                          <Badge
                            key={method}
                            variant="outline"
                            className={`text-xs ${
                              method === "stripe"
                                ? "border-purple-300 text-purple-700 bg-purple-50"
                                : "border-orange-300 text-orange-700 bg-orange-50"
                            }`}
                          >
                            {PAYMENT_METHOD_LABELS[method]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 説明 */}
                  {hasDescription && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">詳細説明</span>
                      </div>
                      <div className="pl-6">
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-white p-3 rounded-lg">
                          {sanitizeEventDescription(event.description || "")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* メタ情報（フッター） */}
        <Separator className="my-4" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div>
            <span className="font-medium">作成者:</span> {event.creator_name}
          </div>
          <div>
            <span className="font-medium">作成:</span>{" "}
            {formatUtcToJstByType(event.created_at, "compact")}
          </div>
          {event.updated_at !== event.created_at && (
            <div>
              <span className="font-medium">更新:</span>{" "}
              {formatUtcToJstByType(event.updated_at, "compact")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
