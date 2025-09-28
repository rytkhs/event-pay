"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Plus, Edit, Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface FloatingActionMenuProps {
  eventId: string;
  eventStatus?: string;
}

export function FloatingActionMenu({ eventId, eventStatus }: FloatingActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  // 編集可能かどうかの判定（開催済みまたはキャンセル済みは編集不可）
  const canEdit = eventStatus !== "past" && eventStatus !== "canceled";

  // 使用可能なアクションを動的に生成
  const actions = [
    ...(canEdit
      ? [
          {
            id: "edit",
            label: "編集",
            icon: Edit,
            onClick: () => {
              router.push(`/events/${eventId}/edit`);
              setIsOpen(false);
            },
            color: "bg-primary hover:bg-primary/90 text-primary-foreground",
          },
        ]
      : [
          {
            id: "edit-disabled",
            label: `編集不可（${eventStatus === "past" ? "開催済み" : "キャンセル済み"}）`,
            icon: Edit,
            onClick: () => {
              // 何もしない
              setIsOpen(false);
            },
            color: "bg-muted hover:bg-muted/90 text-muted-foreground opacity-50 cursor-not-allowed",
            disabled: true,
          },
        ]),
    {
      id: "settings",
      label: "詳細設定",
      icon: Settings,
      onClick: () => {
        router.push(`/events/${eventId}/settings`);
        setIsOpen(false);
      },
      color: "bg-muted hover:bg-muted/90 text-muted-foreground",
    },
  ];

  return (
    <>
      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsOpen(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="メニューを閉じる"
        />
      )}

      {/* FAB本体とメニュー */}
      <div className="fixed bottom-6 right-6 z-50">
        {/* アクションメニュー（展開時） */}
        {isOpen && (
          <Card className="mb-4 p-2 shadow-lg border-0">
            <div className="flex flex-col gap-2 min-w-[200px]">
              {actions.map((action: any) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={`
                      justify-start gap-3 h-12
                      ${action.color}
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{action.label}</span>
                  </Button>
                );
              })}
            </div>
          </Card>
        )}

        {/* メインFABボタン */}
        <Button
          onClick={() => setIsOpen(!isOpen)}
          size="lg"
          className={`
            h-14 w-14 rounded-full shadow-lg transition-all duration-200
            ${
              isOpen
                ? "bg-destructive hover:bg-destructive/90 rotate-45"
                : "bg-primary hover:bg-primary/90 hover:scale-110"
            }
          `}
        >
          {isOpen ? <X className="h-6 w-6 text-white" /> : <Plus className="h-6 w-6 text-white" />}
        </Button>
      </div>
    </>
  );
}
