"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteEventAction } from '@/app/events/actions/delete-event';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventActionsProps {
  eventId: string;
}

export function EventActions({ eventId }: EventActionsProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isDisabled = !eventId || eventId === '';

  const handleEdit = () => {
    if (isDisabled) return;
    router.push(`/events/${eventId}/edit`);
  };

  const handleDelete = () => {
    if (isDisabled) return;
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (isDisabled || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteEventAction(eventId);
      if (result.success) {
        router.push('/events');
        router.refresh(); // ページ遷移後にキャッシュを更新
      } else {
        // Server Actionから返される詳細なエラーメッセージを表示
        setDeleteError(result.error?.message || '削除に失敗しました');
      }
    } catch (error) {
      setDeleteError('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteDialog(false);
    setDeleteError(null);
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
        onClick={handleDelete}
        disabled={isDisabled}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
      >
        削除
      </button>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>イベントの削除</DialogTitle>
            <DialogDescription>
              本当に削除しますか？この操作は取り消すことができません。
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="text-red-600 text-sm">{deleteError}</div>
          )}

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
    </div>
  );
}
