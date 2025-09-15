"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useToast } from "@core/contexts/toast-context";
import { getPaymentActions } from "@core/services";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { cancelEventAction } from "../actions/cancel-event";
import { deleteEventAction } from "../actions/delete-event";

interface EventActionsProps {
  eventId: string;
  attendingCount?: number;
  maybeCount?: number;
}

export function EventActions({ eventId, attendingCount = 0, maybeCount = 0 }: EventActionsProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [cancelMessage, setCancelMessage] = useState<string>("");
  const [isUpdatingCash, setIsUpdatingCash] = useState(false);
  const { toast } = useToast();

  const canHardDelete = attendingCount + maybeCount === 0;

  const isDisabled = !eventId || eventId === "";

  const handleEdit = () => {
    if (isDisabled) return;
    router.push(`/events/${eventId}/edit`);
  };

  const handleDelete = () => {
    if (isDisabled) return;
    setShowDeleteDialog(true);
  };

  const handleCancel = () => {
    if (isDisabled) return;
    setShowCancelDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (isDisabled || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteEventAction(eventId);
      if (result.success) {
        router.push("/events");
        router.refresh(); // ページ遷移後にキャッシュを更新
      } else {
        // Server Actionから返される詳細なエラーメッセージを表示
        setDeleteError(result.error || "削除に失敗しました");
      }
    } catch {
      setDeleteError("削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteDialog(false);
    setDeleteError(null);
  };

  const handleCancelConfirm = async () => {
    if (isDisabled || isCanceling) return;
    setIsCanceling(true);
    try {
      const result = await cancelEventAction({ eventId, message: cancelMessage });
      if (result.success) {
        toast({ title: "中止完了", description: "イベントを中止しました" });
        router.refresh();
        setShowCancelDialog(false);
        setCancelMessage("");
      } else {
        toast({
          title: "中止失敗",
          description: result.error || "中止に失敗しました",
          variant: "destructive",
        });
      }
    } finally {
      setIsCanceling(false);
    }
  };

  const handleCancelClose = () => {
    setShowCancelDialog(false);
    setCancelMessage("");
  };

  const handleMarkCashReceived = async () => {
    if (isUpdatingCash) return;
    try {
      setIsUpdatingCash(true);
      const paymentId = window.prompt("受領済みにする現金決済の支払いIDを入力してください");
      if (!paymentId) return;

      const paymentActions = getPaymentActions();
      const result = await paymentActions.updateCashStatus({ paymentId, status: "received" });
      if (result.success) {
        toast({ title: "更新成功", description: "現金決済を受領済みに更新しました" });
        router.refresh();
      } else {
        toast({
          title: "更新失敗",
          description: result.error || "更新に失敗しました",
          variant: "destructive",
        });
      }
    } finally {
      setIsUpdatingCash(false);
    }
  };

  return (
    <div className="flex gap-2" data-testid="event-actions">
      <button
        onClick={handleEdit}
        disabled={isDisabled}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        編集
      </button>

      <button
        onClick={handleMarkCashReceived}
        disabled={isDisabled || isUpdatingCash}
        className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-400"
      >
        {isUpdatingCash ? "更新中..." : "現金受領を反映"}
      </button>

      {canHardDelete ? (
        <button
          onClick={handleDelete}
          disabled={isDisabled}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
        >
          削除
        </button>
      ) : (
        <button
          onClick={handleCancel}
          disabled={isDisabled}
          className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:bg-gray-400"
        >
          イベントを中止する
        </button>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>イベントの削除</DialogTitle>
            <DialogDescription>
              本当に削除しますか？この操作は取り消すことができません。
            </DialogDescription>
          </DialogHeader>

          {deleteError && <div className="text-red-600 text-sm">{deleteError}</div>}

          <DialogFooter>
            <button
              onClick={handleDeleteCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              キャンセル
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
            >
              削除する
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>イベントを中止しますか？</DialogTitle>
            <DialogDescription>
              中止すると新規参加・決済はできなくなります。必要に応じて参加者へのメッセージを入力してください。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="cancelMessage" className="text-sm text-gray-700">
              参加者への通知メッセージ（任意）
            </label>
            <textarea
              id="cancelMessage"
              value={cancelMessage}
              onChange={(e) => setCancelMessage(e.target.value)}
              className="w-full border rounded p-2 h-28"
              placeholder="中止の理由や返金に関する案内など"
            />
          </div>

          <DialogFooter>
            <button
              onClick={handleCancelClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              キャンセル
            </button>
            <button
              onClick={handleCancelConfirm}
              disabled={isCanceling}
              className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:bg-gray-400"
            >
              {isCanceling ? "中止中..." : "通知して中止を確定"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
