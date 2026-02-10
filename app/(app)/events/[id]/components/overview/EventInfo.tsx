"use client";

import {
  Calendar,
  MapPin,
  Banknote,
  Clock,
  CreditCard,
  Info,
  Users,
  Tag,
  LucideIcon,
} from "lucide-react";

import { PAYMENT_METHOD_LABELS } from "@core/constants/status-labels";
import type { Event } from "@core/types/models";
import { sanitizeEventDescription, sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface EventInfoProps {
  event: Event;
}

export function EventInfo({ event }: EventInfoProps) {
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

  const InfoItem = ({
    icon: Icon,
    label,
    children,
    className = "",
  }: {
    icon: LucideIcon;
    label: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-sm pl-6">{children}</div>
    </div>
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
          {/* 0. イベント名 */}
          <InfoItem icon={Tag} label="イベント名" className="md:col-span-2">
            <span className="font-bold text-base text-foreground">{event.title}</span>
          </InfoItem>

          {/* 1. 開催日時 */}
          <InfoItem icon={Calendar} label="開催日時">
            <span className="font-medium">{formatUtcToJstByType(event.date, "japanese")}</span>
          </InfoItem>

          {/* 2. 場所 */}
          <InfoItem icon={MapPin} label="場所">
            <span className="font-medium">{sanitizeForEventPay(event.location)}</span>
          </InfoItem>

          {/* 3. 参加費 */}
          <InfoItem icon={Banknote} label="参加費">
            <span className="font-bold">{formatCurrency(event.fee)}</span>
          </InfoItem>

          {/* 4. 定員 */}
          <InfoItem icon={Users} label="定員">
            <span className="font-medium">
              {event.capacity ? `${event.capacity}人` : "定員なし"}
            </span>
          </InfoItem>

          {/* 5. 決済方法 */}
          <InfoItem icon={CreditCard} label="決済方法">
            <div className="flex flex-wrap gap-2">
              {event.payment_methods && event.payment_methods.length > 0 ? (
                event.payment_methods.map((method) => (
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
                ))
              ) : (
                <span className="text-muted-foreground">設定なし</span>
              )}
            </div>
          </InfoItem>

          {/* 6. 申込締切 */}
          <InfoItem icon={Clock} label="申込締切">
            <span className={event.registration_deadline ? "font-medium" : "text-muted-foreground"}>
              {event.registration_deadline
                ? formatUtcToJstByType(event.registration_deadline, "japanese")
                : "設定なし"}
            </span>
          </InfoItem>

          {/* 7. 決済締切 */}
          <InfoItem icon={Clock} label="オンライン決済締切">
            <span className={event.payment_deadline ? "font-medium" : "text-muted-foreground"}>
              {event.payment_deadline
                ? formatUtcToJstByType(event.payment_deadline, "japanese")
                : "設定なし"}
            </span>
          </InfoItem>
        </div>

        <Separator />

        {/* 8. 説明・備考 */}
        <InfoItem icon={Info} label="説明・備考" className="w-full">
          <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed bg-gray-50/50 p-4 rounded-lg border border-gray-100/50">
            {event.description ? (
              sanitizeEventDescription(event.description)
            ) : (
              <span className="text-muted-foreground">説明はありません</span>
            )}
          </div>
        </InfoItem>

        <Separator />

        {/* メタ情報 */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground pt-2">
          <div>
            <span className="font-medium mr-1">作成者:</span>
            {event.creator_name}
          </div>
          <div>
            <span className="font-medium mr-1">作成:</span>
            {formatUtcToJstByType(event.created_at, "compact")}
          </div>
          {event.updated_at !== event.created_at && (
            <div>
              <span className="font-medium mr-1">更新:</span>
              {formatUtcToJstByType(event.updated_at, "compact")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
