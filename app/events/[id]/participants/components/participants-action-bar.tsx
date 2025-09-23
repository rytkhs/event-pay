"use client";

import { useState } from "react";

import { Plus, Download, Filter, RefreshCw } from "lucide-react";

import { useToast } from "@core/contexts/toast-context";
import type { Event } from "@core/types/models";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adminAddAttendanceAction } from "@/features/events/actions/admin-add-attendance";
import { exportParticipantsCsvAction } from "@/features/events/actions/export-participants-csv";

interface ParticipantsActionBarProps {
  eventId: string;
  eventDetail: Event;
  onFiltersToggle: () => void;
  filtersExpanded: boolean;
}

export function ParticipantsActionBar({
  eventId,
  eventDetail: _eventDetail,
  onFiltersToggle,
  filtersExpanded,
}: ParticipantsActionBarProps) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addNickname, setAddNickname] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmOverCapacity, setConfirmOverCapacity] = useState<null | {
    capacity?: number | null;
    current?: number;
  }>(null);

  const handleOpenAdd = () => {
    setAddNickname("");
    setConfirmOverCapacity(null);
    setAddError(null);
    setShowAddDialog(true);
  };

  const handleSubmitAdd = async (forceBypass = false) => {
    if (isAdding) return;
    if (!addNickname || addNickname.trim().length === 0) {
      setAddError("ニックネームを入力してください");
      return;
    }
    setAddError(null);
    setIsAdding(true);

    try {
      const result = await adminAddAttendanceAction({
        eventId,
        nickname: addNickname,
        status: "attending",
        bypassCapacity: forceBypass,
      });

      if (!result.success) {
        if ((result as any).data?.confirmRequired || (result as any).confirmRequired) {
          const payload = (result as any).data || result;
          setConfirmOverCapacity({ capacity: payload.capacity, current: payload.current });
          return;
        }
        toast({
          title: "追加に失敗しました",
          description: result.error || "参加者の追加に失敗しました",
          variant: "destructive",
        });
        return;
      }

      const data = result.data as any;
      await navigator.clipboard.writeText(data.guestUrl);
      toast({
        title: "参加者を追加しました",
        description: data.canOnlinePay
          ? "ゲストURLをコピーしました（現在オンライン決済が可能です）"
          : "ゲストURLをコピーしました（オンライン決済は現在できません）",
      });
      setShowAddDialog(false);
      setConfirmOverCapacity(null);

      // ページを再読み込みしてデータを更新
      window.location.reload();
    } catch (error) {
      toast({
        title: "エラーが発生しました",
        description: "参加者の追加に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      toast({
        title: "CSV エクスポート",
        description: "個人情報の取り扱いには十分注意してください。(最大 1,000 件まで)",
        duration: 3000,
      });

      const result = await exportParticipantsCsvAction({
        eventId,
        filters: {}, // 全件エクスポート
      });

      if (result.success && result.csvContent) {
        const blob = new Blob([result.csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute("download", result.filename ?? "participants.csv");
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: "エクスポート完了",
          description: `${result.filename ?? "participants.csv"} をダウンロードしました。`,
        });
      } else {
        toast({
          title: "エクスポート失敗",
          description: result.error || "CSVエクスポートに失敗しました。",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "エクスポート失敗",
        description: "CSVエクスポートでエラーが発生しました。",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <>
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="flex flex-col gap-4">
          {/* メイン操作ボタン */}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleOpenAdd} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              参加者を追加
            </Button>

            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={isExporting}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "エクスポート中..." : "CSV出力"}
            </Button>

            <Button variant="outline" onClick={handleRefresh} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              更新
            </Button>

            <Button
              variant={filtersExpanded ? "default" : "outline"}
              onClick={onFiltersToggle}
              className="flex items-center gap-2 ml-auto sm:ml-0"
            >
              <Filter className="h-4 w-4" />
              フィルター
              {filtersExpanded && (
                <Badge variant="secondary" className="ml-1">
                  展開中
                </Badge>
              )}
            </Button>
          </div>

          {/* 簡潔な説明文 */}
          <div className="text-sm text-gray-600 flex items-center gap-2">
            <span>💡</span>
            各参加者の決済状況を個別に管理できます
          </div>
        </div>
      </div>

      {/* 参加者追加ダイアログ */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>参加者を追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="ニックネーム"
              value={addNickname}
              onChange={(e) => setAddNickname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleSubmitAdd(false);
                }
              }}
              required
            />
            {addError && <div className="text-sm text-red-600">{addError}</div>}
            {confirmOverCapacity && (
              <div className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
                定員（{confirmOverCapacity.capacity ?? "-"}）を超過しています（現在{" "}
                {confirmOverCapacity.current ?? "-"} 名）。本当に追加しますか？
              </div>
            )}
          </div>
          <DialogFooter>
            {!confirmOverCapacity ? (
              <Button
                onClick={() => void handleSubmitAdd(false)}
                disabled={isAdding || !addNickname || addNickname.trim().length === 0}
                className="w-full sm:w-auto"
              >
                {isAdding ? "追加中..." : "追加"}
              </Button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <Button
                  variant="outline"
                  onClick={() => setConfirmOverCapacity(null)}
                  disabled={isAdding}
                  className="w-full sm:w-auto"
                >
                  戻る
                </Button>
                <Button
                  onClick={() => void handleSubmitAdd(true)}
                  disabled={isAdding}
                  className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                >
                  {isAdding ? "処理中..." : "定員超過で追加"}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
