"use client";

import { useState } from "react";

import {
  Calendar,
  MapPin,
  Users,
  Banknote,
  Clock,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

import { PAYMENT_METHOD_LABELS } from "@core/constants/payment-methods";
import type { Event } from "@core/types/models";
import { sanitizeEventDescription, sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

interface EventInfoCompactProps {
  event: Event;
}

export function EventInfoCompact({ event }: EventInfoCompactProps) {
  const [showDetails, setShowDetails] = useState(false);

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

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* 基本情報（常時表示） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 日時・場所 */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">開催日時</p>
                  <p className="text-sm text-foreground leading-tight">
                    {formatUtcToJstByType(event.date, "japanese")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">開催場所</p>
                  <p className="text-sm text-foreground leading-tight">
                    {sanitizeForEventPay(event.location)}
                  </p>
                </div>
              </div>
            </div>

            {/* 定員・参加費 */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">定員</p>
                  <p className="text-sm text-foreground leading-tight">{event.capacity}人</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Banknote className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">参加費</p>
                  <p className="text-sm text-foreground leading-tight">
                    {formatCurrency(event.fee)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 詳細情報（展開可能） */}
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" />
                    詳細を閉じる
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    詳細を表示
                  </>
                )}
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <Separator className="my-3" />

              <div className="space-y-4">
                {/* 締切情報 */}
                {(event.registration_deadline || event.payment_deadline) && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">締切情報</span>
                    </div>

                    {event.registration_deadline && (
                      <div className="pl-6">
                        <p className="text-xs font-medium text-muted-foreground mb-1">申込締切</p>
                        <p className="text-sm text-foreground">
                          {formatUtcToJstByType(event.registration_deadline, "japanese")}
                        </p>
                      </div>
                    )}

                    {event.payment_deadline && (
                      <div className="pl-6">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          オンライン決済締切
                        </p>
                        <p className="text-sm text-foreground">
                          {formatUtcToJstByType(event.payment_deadline, "japanese")}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 決済方法 */}
                {event.fee > 0 && event.payment_methods && event.payment_methods.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">決済方法</span>
                    </div>
                    <div className="pl-6">
                      <div className="flex flex-wrap gap-2">
                        {event.payment_methods.map((method) => (
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
                  </div>
                )}

                {/* 説明 */}
                {event.description && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">詳細説明</span>
                    </div>
                    <div className="pl-6">
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {sanitizeEventDescription(event.description)}
                      </p>
                    </div>
                  </div>
                )}

                {/* メタ情報 */}
                <div className="pt-3 border-t border-muted">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium">作成者:</span> {event.creator_name}
                    </div>
                    <div>
                      <span className="font-medium">作成:</span>{" "}
                      {formatUtcToJstByType(event.created_at, "japanese")}
                    </div>
                  </div>
                  {event.updated_at !== event.created_at && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">更新:</span>{" "}
                      {formatUtcToJstByType(event.updated_at, "japanese")}
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}
