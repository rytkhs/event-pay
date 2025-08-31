"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/contexts/toast-context";
import { SettlementReportCard } from "./settlement-report-card";
import { SettlementReportData } from "@/lib/services/settlement-report/types";
import {
  getSettlementReportsAction,
  exportSettlementReportsAction,
  regenerateAfterRefundAction,
} from "@/app/actions/settlement-report-actions";
import { FileDownIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { formatUtcToJstByType } from "@/lib/utils/timezone";

interface SettlementReportListProps {
  initialReports?: SettlementReportData[];
  availableEvents?: { id: string; title: string; date: string }[];
}

export function SettlementReportList({
  initialReports = [],
  availableEvents = [],
}: SettlementReportListProps) {
  const { toast } = useToast();
  const [reports, setReports] = useState<SettlementReportData[]>(initialReports);
  const [loading, setLoading] = useState(false);
  const [regeneratingEventIds, setRegeneratingEventIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // フィルタ状態
  const [filters, setFilters] = useState({
    eventId: "",
    fromDate: "",
    toDate: "",
    limit: 50,
    offset: 0,
  });

  // 検索実行（必要に応じて一時的に filters を上書き）
  const handleSearch = async (override?: Partial<typeof filters>) => {
    setLoading(true);
    try {
      const effective = { ...filters, ...(override ?? {}) };
      const params = {
        eventIds: effective.eventId ? [effective.eventId] : undefined,
        fromDate: effective.fromDate || undefined,
        toDate: effective.toDate || undefined,
        limit: effective.limit,
        offset: effective.offset,
      };

      const result = await getSettlementReportsAction(params);

      if (result.success) {
        setReports(result.reports);
      } else {
        toast({
          title: "検索エラー",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (_error) {
      toast({
        title: "検索エラー",
        description: "予期しないエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // CSV エクスポート
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {
        eventIds: filters.eventId ? [filters.eventId] : undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
      };

      const result = await exportSettlementReportsAction(params);

      if (!result.success) {
        toast({
          title: "エクスポートエラー",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      // CSV ダウンロード（成功時）
      const blob = new Blob([result.csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", result.filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "エクスポート完了",
        description: `${result.filename} をダウンロードしました`,
      });

      if (result.truncated) {
        toast({
          title: "注意: 一部データを省略",
          description:
            "1,001 件以上のデータが存在したため、先頭 1,000 件のみを出力しました。フィルターで範囲を絞って再度エクスポートしてください。",
        });
      }
    } catch (_error) {
      toast({
        title: "エクスポートエラー",
        description: "予期しないエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  // 再集計
  const handleRegenerate = async (eventId: string) => {
    setRegeneratingEventIds((prev) => new Set([...prev, eventId]));

    try {
      const formData = new FormData();
      formData.append("eventId", eventId);

      const result = await regenerateAfterRefundAction(formData);

      if (result.success) {
        toast({
          title: "再集計完了",
          description: "レポートが更新されました",
        });

        // レポート一覧を再読み込み
        await handleSearch();
      } else {
        toast({
          title: "再集計エラー",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (_error) {
      toast({
        title: "再集計エラー",
        description: "予期しないエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setRegeneratingEventIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(eventId);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 検索・フィルタ */}
      <Card>
        <CardHeader>
          <CardTitle>清算レポート検索</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-select">イベント</Label>
              <Select
                value={filters.eventId}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, eventId: value }))}
              >
                <SelectTrigger id="event-select">
                  <SelectValue placeholder="すべてのイベント" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">すべてのイベント</SelectItem>
                  {availableEvents.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title} ({formatUtcToJstByType(event.date, "japanese").replace(" ", "")}
                      ）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from-date">開始日</Label>
              <Input
                id="from-date"
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-date">終了日</Label>
              <Input
                id="to-date"
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="limit">表示件数</Label>
              <Select
                value={filters.limit.toString()}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, limit: parseInt(value) }))
                }
              >
                <SelectTrigger id="limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10件</SelectItem>
                  <SelectItem value="25">25件</SelectItem>
                  <SelectItem value="50">50件</SelectItem>
                  <SelectItem value="100">100件</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex space-x-2">
            <Button
              onClick={() => {
                // 新しい検索は常に 1 ページ目から
                setFilters((prev) => {
                  const next = { ...prev, offset: 0 };
                  void handleSearch(next);
                  return next;
                });
              }}
              disabled={loading}
            >
              <SearchIcon className="w-4 h-4 mr-2" />
              {loading ? "検索中..." : "検索"}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <FileDownIcon className="w-4 h-4 mr-2" />
              {exporting ? "エクスポート中..." : "CSV エクスポート"}
            </Button>
            <Button variant="outline" onClick={() => handleSearch()}>
              <RefreshCwIcon className="w-4 h-4 mr-2" />
              更新
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* レポート一覧 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">清算レポート ({reports.length} 件)</h2>
        </div>

        {reports.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">
                  {loading ? "読み込み中..." : "清算レポートが見つかりませんでした"}
                </p>
                {!loading && (
                  <p className="text-sm text-muted-foreground">
                    清算レポートは手動で生成してください。レポート生成タブから実行できます。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <SettlementReportCard
                key={`${report.eventId}-${report.generatedAt.getTime()}`}
                report={report}
                onRegenerate={handleRegenerate}
                isRegenerating={regeneratingEventIds.has(report.eventId)}
                showActions={true}
              />
            ))}
          </div>
        )}
      </div>

      {/* ページネーション */}
      {reports.length >= filters.limit && (
        <div className="flex justify-center space-x-2">
          <Button
            variant="outline"
            disabled={filters.offset === 0}
            onClick={() => {
              const newOffset = Math.max(0, filters.offset - filters.limit);
              setFilters((prev) => {
                const next = { ...prev, offset: newOffset };
                void handleSearch(next);
                return next;
              });
            }}
          >
            前のページ
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const newOffset = filters.offset + filters.limit;
              setFilters((prev) => {
                const next = { ...prev, offset: newOffset };
                void handleSearch(next);
                return next;
              });
            }}
          >
            次のページ
          </Button>
        </div>
      )}
    </div>
  );
}
