"use client";

import { Users, DollarSign, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ParticipantsStatusCardsProps {
  attendingCount: number;
  capacity: number | null;
  totalRevenue: number;
  unpaidCount: number;
}

export function ParticipantsStatusCards({
  attendingCount,
  capacity,
  totalRevenue,
  unpaidCount,
}: ParticipantsStatusCardsProps) {
  // 定員超過状態の判定
  const isOverCapacity = capacity ? attendingCount > capacity : false;
  const capacityUtilization = capacity ? Math.round((attendingCount / capacity) * 100) : 0;

  // 緊急度の判定
  const hasUnpaidPayments = unpaidCount > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* 参加者数 */}
      <Card className={isOverCapacity ? "border-red-200 bg-red-50" : ""}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">参加者数</p>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-3xl font-bold text-gray-900">{attendingCount}</p>
                {capacity && <p className="text-lg text-gray-500">/ {capacity}</p>}
              </div>
              {capacity && (
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs text-gray-500">稼働率 {capacityUtilization}%</p>
                  {isOverCapacity && (
                    <Badge variant="destructive" className="text-xs">
                      定員超過
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className={`p-2 rounded-full ${isOverCapacity ? "bg-red-100" : "bg-blue-100"}`}>
              <Users className={`h-6 w-6 ${isOverCapacity ? "text-red-600" : "text-blue-600"}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 総収益 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">総収益</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                ¥{totalRevenue.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-2">決済済み分のみ</p>
            </div>
            <div className="p-2 rounded-full bg-green-100">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 未決済 */}
      <Card className={hasUnpaidPayments ? "border-orange-200 bg-orange-50" : ""}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">未決済</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{unpaidCount}</p>
              <p className="text-xs text-gray-500 mt-2">件の未処理</p>
              {hasUnpaidPayments && (
                <Badge variant="secondary" className="text-xs mt-1 bg-orange-100 text-orange-800">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  要確認
                </Badge>
              )}
            </div>
            <div
              className={`p-2 rounded-full ${hasUnpaidPayments ? "bg-orange-100" : "bg-gray-100"}`}
            >
              <AlertTriangle
                className={`h-6 w-6 ${hasUnpaidPayments ? "text-orange-600" : "text-gray-400"}`}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
