"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Plus, Edit, Mail, Download, Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface FloatingActionMenuProps {
  eventId: string;
  onSendReminder?: () => void;
  onExportData?: () => void;
}

export function FloatingActionMenu({
  eventId,
  onSendReminder,
  onExportData,
}: FloatingActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const actions = [
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
    {
      id: "reminder",
      label: "リマインド送信",
      icon: Mail,
      onClick: () => {
        onSendReminder?.();
        setIsOpen(false);
      },
      color: "bg-warning hover:bg-warning/90 text-warning-foreground",
    },
    {
      id: "export",
      label: "データ出力",
      icon: Download,
      onClick: () => {
        onExportData?.();
        setIsOpen(false);
      },
      color: "bg-secondary hover:bg-secondary/90 text-secondary-foreground",
    },
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
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    onClick={action.onClick}
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
