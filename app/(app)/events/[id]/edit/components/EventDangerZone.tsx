"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { cancelEventAction, deleteEventAction } from "../../actions";

interface EventDangerZoneProps {
  eventId: string;
  eventTitle: string;
  eventStatus: "upcoming" | "ongoing" | "past" | "canceled";
}

export function EventDangerZone({ eventId, eventTitle, eventStatus }: EventDangerZoneProps) {
  const router = useRouter();
  const [isCancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleCancelEvent = () => {
    startTransition(async () => {
      const result = await cancelEventAction({ eventId });
      if (result.success) {
        toast.success("イベントを中止しました", {
          description: "必要に応じて参加者へ連絡してください。",
        });
        setCancelDialogOpen(false);
        router.push(`/events/${eventId}`);
        router.refresh();
      } else {
        toast.error("中止に失敗しました", {
          description: result.error?.userMessage ?? "時間をおいて再度お試しください",
        });
      }
    });
  };

  const handleDeleteEvent = () => {
    startTransition(async () => {
      const result = await deleteEventAction(eventId);
      if (result.success) {
        toast.success("イベントを削除しました", {
          description: "イベント一覧に戻ります",
        });
        setDeleteDialogOpen(false);
        router.push("/events");
      } else {
        toast.error("削除に失敗しました", {
          description:
            result.error?.userMessage ?? "参加者または決済情報が存在する可能性があります",
        });
      }
    });
  };

  // キャンセル済みイベントは削除のみ表示
  const showCancelButton = eventStatus !== "canceled";

  return (
    <Card className="overflow-hidden rounded-lg border border-destructive/30 bg-destructive/5 shadow-none">
      <CardHeader className="border-b border-destructive/20 bg-background/50 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base font-semibold text-destructive md:text-lg">
            イベントの中止
          </CardTitle>
        </div>
        <CardDescription className="text-sm">
          以下の操作は取り消すことができません。慎重に実行してください。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        {showCancelButton && (
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1 text-sm font-semibold">イベントを中止する</h3>
              <p className="text-sm text-muted-foreground">
                参加者の決済リンクが無効になり、イベントは「キャンセル」ステータスになります。
              </p>
            </div>
            <Dialog open={isCancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full flex-shrink-0 sm:w-auto">
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  中止する
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>イベントを中止しますか？</DialogTitle>
                  <DialogDescription className="space-y-2">
                    <p className="font-medium text-foreground">「{eventTitle}」を中止します。</p>
                    <p>
                      参加者の決済リンクが無効になり、イベントは「キャンセル」ステータスになります。
                      この操作は取り消せません。
                    </p>
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setCancelDialogOpen(false)}
                    disabled={isPending}
                  >
                    キャンセル
                  </Button>
                  <Button variant="destructive" onClick={handleCancelEvent} disabled={isPending}>
                    {isPending ? "処理中..." : "イベントを中止"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="mb-1 text-sm font-semibold">イベントを削除する</h3>
            <p className="text-sm text-muted-foreground">
              イベントがデータベースから完全に削除されます。すでに参加者や決済が存在するイベントは削除できません。
            </p>
          </div>
          <Dialog open={isDeleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full flex-shrink-0 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground sm:w-auto"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                削除する
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>イベントを削除しますか？</DialogTitle>
                <DialogDescription className="space-y-2">
                  <p className="font-medium text-foreground">「{eventTitle}」を削除します。</p>
                  <p>
                    参加者や決済が存在するイベントは削除できません。削除すると一覧から完全に消えます。
                  </p>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <Button variant="destructive" onClick={handleDeleteEvent} disabled={isPending}>
                  {isPending ? "処理中..." : "イベントを削除"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
