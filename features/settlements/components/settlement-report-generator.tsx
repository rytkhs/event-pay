"use client";

import React, { useState } from "react";

import { CalculatorIcon, FileTextIcon, AlertTriangleIcon } from "lucide-react";

import { useToast } from "@core/contexts/toast-context";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  GenerateSettlementReportSuccess,
  GenerateSettlementReportFailure,
} from "../actions/settlement-reports";

interface SettlementReportGeneratorProps {
  availableEvents?: {
    id: string;
    title: string;
    date: string;
    status: string;
    hasExistingReport?: boolean;
  }[];
  onReportGenerated?: (reportId: string) => void;
  onGenerateReport: (
    formData: FormData
  ) => Promise<GenerateSettlementReportSuccess | GenerateSettlementReportFailure>;
}

export function SettlementReportGenerator({
  availableEvents = [],
  onReportGenerated,
  onGenerateReport,
}: SettlementReportGeneratorProps) {
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState("");
  const [generating, setGenerating] = useState(false);

  const selectedEvent = availableEvents.find((event) => event.id === selectedEventId);

  const handleGenerate = async () => {
    if (!selectedEventId) {
      toast({
        title: "イベント選択エラー",
        description: "レポートを生成するイベントを選択してください",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);

    try {
      const formData = new FormData();
      formData.append("eventId", selectedEventId);

      // 統一されたサービス経由でRPC呼び出し
      const result = await onGenerateReport(formData);

      if (result.success) {
        // alreadyExistsプロパティは通常のアクションでのみ存在する
        const hasAlreadyExists = "alreadyExists" in result && result.alreadyExists === true;
        if (hasAlreadyExists) {
          toast({
            title: "レポート生成完了",
            description: "本日のレポートを更新しました",
          });
        } else {
          toast({
            title: "レポート生成完了",
            description: "清算レポートが正常に生成されました",
          });
        }

        // 生成完了コールバック
        if (onReportGenerated && result.reportId) {
          onReportGenerated(result.reportId);
        }

        // フォームリセット
        setSelectedEventId("");
      } else {
        toast({
          title: "レポート生成エラー",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (_error) {
      toast({
        title: "レポート生成エラー",
        description: "予期しないエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  // 生成可能なイベントのフィルタ
  const eligibleEvents = availableEvents.filter((event) => event.status === "past");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <FileTextIcon className="w-5 h-5" />
          <span>清算レポート生成</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* イベント選択 */}
        <div className="space-y-2">
          <Label htmlFor="event-select">イベント選択</Label>
          <Select value={selectedEventId} onValueChange={setSelectedEventId} disabled={generating}>
            <SelectTrigger id="event-select">
              <SelectValue placeholder="レポートを生成するイベントを選択" />
            </SelectTrigger>
            <SelectContent>
              {eligibleEvents.length === 0 ? (
                <SelectItem value="__no_options__" disabled>
                  生成可能なイベントがありません
                </SelectItem>
              ) : (
                eligibleEvents.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>
                        {event.title} (
                        {formatUtcToJstByType(event.date, "japanese").replace(" ", "")}）
                      </span>
                      {event.hasExistingReport && (
                        <span className="text-xs text-muted-foreground ml-2">(レポート済み)</span>
                      )}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {eligibleEvents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              完了済みのイベントのみレポート生成が可能です
            </p>
          )}
        </div>

        {/* 警告表示 */}
        {selectedEvent?.hasExistingReport && (
          <div className="flex items-start space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <AlertTriangleIcon className="w-5 h-5 text-blue-500 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-800">既存レポートがあります</p>
              <p className="text-sm text-blue-700">
                このイベントには既にレポートが存在します。同日の再実行時は既存レポートを上書き更新します。
              </p>
            </div>
          </div>
        )}

        {/* 選択中のイベント情報 */}
        {selectedEvent && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="font-medium text-blue-900 mb-2">選択中のイベント</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="font-medium text-blue-800">イベント名:</span>
                <br />
                <span className="text-blue-700">{selectedEvent.title}</span>
              </div>
              <div>
                <span className="font-medium text-blue-800">開催日:</span>
                <br />
                <span className="text-blue-700">
                  {formatUtcToJstByType(selectedEvent.date, "japanese").replace(" ", "")}
                </span>
              </div>
              <div>
                <span className="font-medium text-blue-800">ステータス:</span>
                <br />
                <span className="text-blue-700">{selectedEvent.status}</span>
              </div>
              <div>
                <span className="font-medium text-blue-800">既存レポート:</span>
                <br />
                <span className="text-blue-700">
                  {selectedEvent.hasExistingReport ? "あり" : "なし"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 生成ボタン */}
        <div className="flex justify-end">
          <Button
            onClick={handleGenerate}
            disabled={!selectedEventId || generating}
            className="min-w-[140px]"
          >
            <CalculatorIcon className="w-4 h-4 mr-2" />
            {generating ? "生成中..." : "レポート生成"}
          </Button>
        </div>

        {/* 説明 */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>• Destination charges 方式で手動集計されたレポートが生成されます</p>
          <p>• 売上、Stripe手数料、プラットフォーム手数料、手取り額が含まれます</p>
          <p>• 同日内の再実行時は既存レポートを上書き更新します</p>
          <p>• 返金・Dispute発生時は再集計を推奨します</p>
        </div>
      </CardContent>
    </Card>
  );
}
