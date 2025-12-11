"use client";

import { useState, type ReactNode } from "react";

import { Plus, Download, RefreshCw, Zap, Search, X } from "lucide-react";

import { useToast } from "@core/contexts/toast-context";
import type { Event } from "@core/types/models";

import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { adminAddAttendanceAction } from "@/features/events/actions/admin-add-attendance";
import { exportParticipantsCsvAction } from "@/features/events/actions/export-participants-csv";

interface ParticipantsActionBarV2Props {
  eventId: string;
  eventDetail: Event;
  searchParams: { [key: string]: string | string[] | undefined };
  onFiltersChange: (params: Record<string, string | undefined>) => void;
  filterTrigger: ReactNode;
}

export function ParticipantsActionBarV2({
  eventId,
  eventDetail,
  searchParams,
  onFiltersChange,
  filterTrigger,
}: ParticipantsActionBarV2Props) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addNickname, setAddNickname] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash">("cash");
  const [confirmOverCapacity, setConfirmOverCapacity] = useState<null | {
    capacity?: number | null;
    current?: number;
  }>(null);

  // インライン検索
  const [searchQuery, setSearchQuery] = useState(
    typeof searchParams.search === "string" ? searchParams.search : ""
  );
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // イベントが有料かどうかを判定
  const isPayingEvent = eventDetail.fee > 0;

  const handleOpenAdd = () => {
    setAddNickname("");
    setConfirmOverCapacity(null);
    setAddError(null);
    setPaymentMethod("cash");
    setShowAddDialog(true);
  };

  const handleSubmitAdd = async (forceBypass = false) => {
    if (isAdding) return;
    if (!addNickname || addNickname.trim().length === 0) {
      setAddError("ニックネームを入力してください");
      return;
    }

    if (isPayingEvent && !paymentMethod) {
      setAddError("決済方法を選択してください");
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
        ...(isPayingEvent && { paymentMethod }),
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
      const successDescription = isPayingEvent
        ? "参加者を追加しました。現金決済（未払い）として記録されました。"
        : data.canOnlinePay
          ? "参加者を追加しました（現在オンライン決済が可能です）"
          : "参加者を追加しました（オンライン決済は現在できません）";

      toast({
        title: "参加者を追加しました",
        description: successDescription,
      });
      setShowAddDialog(false);
      setConfirmOverCapacity(null);

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
        filters: {},
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

  const handleToggleSmartSort = () => {
    const smartActive = typeof searchParams.smart === "string";
    if (smartActive) {
      onFiltersChange({ smart: undefined, page: "1", limit: undefined });
    } else {
      onFiltersChange({ smart: "1", page: "1", limit: "200" });
    }
  };

  const handleSearch = () => {
    onFiltersChange({ search: searchQuery || undefined, page: "1" });
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    onFiltersChange({ search: undefined, page: "1" });
  };

  const smartActive = typeof searchParams.smart === "string";

  return (
    <>
      <div className="bg-white rounded-lg border shadow-sm">
        {/* 統合ツールバー */}
        <div className="flex flex-wrap items-center gap-2 p-3">
          {/* インライン検索 - デスクトップ */}
          <div className="hidden md:flex items-center flex-1 max-w-xs">
            <div
              className={cn(
                "relative flex-1 transition-all duration-200",
                isSearchFocused && "ring-2 ring-primary ring-offset-1 rounded-md"
              )}
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                className="pl-9 pr-8 h-9 border-gray-200"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                >
                  <X className="h-3 w-3 text-gray-400" />
                </button>
              )}
            </div>
          </div>

          {/* フィルター */}
          {filterTrigger}

          {/* オートソート */}
          <Button
            variant={smartActive ? "default" : "outline"}
            size="sm"
            onClick={handleToggleSmartSort}
            className="gap-1.5 h-9"
            title="重要度優先のオート並び替え"
          >
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">オートソート</span>
          </Button>

          {/* スペーサー */}
          <div className="flex-1" />

          {/* 右側アクション */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={isExporting}
              className="gap-1.5 h-9"
              title="CSV出力"
            >
              <Download className="h-4 w-4" />
              <span className="hidden lg:inline">{isExporting ? "出力中..." : "CSV"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="gap-1.5 h-9"
              title="更新"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

            <Button size="sm" onClick={handleOpenAdd} className="gap-1.5 h-9">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">追加</span>
            </Button>
          </div>
        </div>

        {/* モバイル検索 - 展開式 */}
        <div className="md:hidden px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ニックネームで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9 pr-8"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-3 w-3 text-gray-400" />
              </button>
            )}
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

            {isPayingEvent && (
              <div className="space-y-2">
                <Label htmlFor="payment-method" className="text-sm font-medium">
                  決済方法 <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value: "cash") => setPaymentMethod(value)}
                  className="flex flex-col space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cash" id="cash" />
                    <Label htmlFor="cash" className="text-sm">
                      現金 ({eventDetail.fee.toLocaleString()}円)
                    </Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  手動追加は現金のみ対応しています。
                  オンライン決済を利用したい場合は招待リンクから登録するよう案内してください。
                </p>
              </div>
            )}

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
