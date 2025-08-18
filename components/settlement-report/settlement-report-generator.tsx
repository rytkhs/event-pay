"use client";

import React, { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  generateSettlementReportAction,
  generateSettlementReportRpcAction,
} from "@/app/actions/settlement-report-actions";
import { CalculatorIcon, FileTextIcon, AlertTriangleIcon } from "lucide-react";

interface SettlementReportGeneratorProps {
  availableEvents?: {
    id: string;
    title: string;
    date: string;
    status: string;
    hasExistingReport?: boolean;
  }[];
  onReportGenerated?: (reportId: string) => void;
}

export function SettlementReportGenerator({
  availableEvents = [],
  onReportGenerated,
}: SettlementReportGeneratorProps) {
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState("");
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [useRpcMethod, setUseRpcMethod] = useState(false);
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
      formData.append("forceRegenerate", forceRegenerate.toString());

      let result;

      if (useRpcMethod) {
        // RPC関数を直接使用
        result = await generateSettlementReportRpcAction(formData);
      } else {
        // サービス経由
        result = await generateSettlementReportAction(formData);
      }

      if (result.success) {
        // alreadyExistsプロパティは通常のアクションでのみ存在する
        const hasAlreadyExists = "alreadyExists" in result && result.alreadyExists === true;
        if (hasAlreadyExists) {
          toast({
            title: "レポート生成完了",
            description: "本日のレポートは既に存在します",
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
        setForceRegenerate(false);
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
  const eligibleEvents = availableEvents.filter(
    (event) => event.status === "completed" || event.status === "past"
  );

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
                <SelectItem value="" disabled>
                  生成可能なイベントがありません
                </SelectItem>
              ) : (
                eligibleEvents.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>
                        {event.title} ({new Date(event.date).toLocaleDateString("ja-JP")})
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
        {selectedEvent?.hasExistingReport && !forceRegenerate && (
          <div className="flex items-start space-x-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <AlertTriangleIcon className="w-5 h-5 text-orange-500 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-orange-800">既存レポートがあります</p>
              <p className="text-sm text-orange-700">
                このイベントには既にレポートが存在します。再生成する場合は「強制再生成」をチェックしてください。
              </p>
            </div>
          </div>
        )}

        {/* オプション設定 */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="force-regenerate"
              checked={forceRegenerate}
              onCheckedChange={(checked) => {
                if (typeof checked === "boolean") {
                  setForceRegenerate(checked);
                }
              }}
              disabled={generating}
            />
            <Label htmlFor="force-regenerate" className="text-sm">
              強制再生成（既存レポートがある場合でも新規作成）
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="use-rpc"
              checked={useRpcMethod}
              onCheckedChange={(checked) => {
                if (typeof checked === "boolean") {
                  setUseRpcMethod(checked);
                }
              }}
              disabled={generating}
            />
            <Label htmlFor="use-rpc" className="text-sm">
              RPC関数を直接使用（開発・デバッグ用）
            </Label>
          </div>
        </div>

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
                  {new Date(selectedEvent.date).toLocaleDateString("ja-JP")}
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
          <p>• Destination charges 方式で自動集計されたレポートが生成されます</p>
          <p>• 売上、Stripe手数料、プラットフォーム手数料、手取り額が含まれます</p>
          <p>• 返金・Dispute発生時は再集計を推奨します</p>
        </div>
      </CardContent>
    </Card>
  );
}
