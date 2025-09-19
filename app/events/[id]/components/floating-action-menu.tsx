"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Plus, Edit, Share2, Mail, Download, Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface FloatingActionMenuProps {
  eventId: string;
  eventTitle: string;
  inviteToken?: string;
  onCopyInviteLink: () => void;
  onSendReminder?: () => void;
  onExportData?: () => void;
}

export function FloatingActionMenu({
  eventId,
  eventTitle,
  inviteToken,
  onCopyInviteLink,
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
      color: "bg-blue-600 hover:bg-blue-700 text-white",
    },
    {
      id: "share",
      label: "招待リンク共有",
      icon: Share2,
      onClick: () => {
        onCopyInviteLink();
        setIsOpen(false);
      },
      color: "bg-green-600 hover:bg-green-700 text-white",
      disabled: !inviteToken,
    },
    {
      id: "reminder",
      label: "リマインド送信",
      icon: Mail,
      onClick: () => {
        onSendReminder?.();
        setIsOpen(false);
      },
      color: "bg-orange-600 hover:bg-orange-700 text-white",
    },
    {
      id: "export",
      label: "データ出力",
      icon: Download,
      onClick: () => {
        onExportData?.();
        setIsOpen(false);
      },
      color: "bg-purple-600 hover:bg-purple-700 text-white",
    },
    {
      id: "settings",
      label: "詳細設定",
      icon: Settings,
      onClick: () => {
        router.push(`/events/${eventId}/settings`);
        setIsOpen(false);
      },
      color: "bg-gray-600 hover:bg-gray-700 text-white",
    },
  ];

  return (
    <>
      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
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
                    disabled={action.disabled}
                    className={`
                      justify-start gap-3 h-12
                      ${action.color}
                      disabled:opacity-50 disabled:cursor-not-allowed
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
                ? "bg-red-600 hover:bg-red-700 rotate-45"
                : "bg-blue-600 hover:bg-blue-700 hover:scale-110"
            }
          `}
        >
          {isOpen ? <X className="h-6 w-6 text-white" /> : <Plus className="h-6 w-6 text-white" />}
        </Button>
      </div>
    </>
  );
}
