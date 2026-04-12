"use client";

import React from "react";

import { MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";

import { hasPaymentId } from "@core/utils/payment-status-mapper";
import type { ParticipantView } from "@core/validation/participant-management";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ButtonSize = React.ComponentProps<typeof Button>["size"];

interface ParticipantActionMenuProps {
  participant: ParticipantView;
  canCancel: boolean;
  canDeleteMistaken: boolean;
  isUpdating?: boolean;
  onCancel: (paymentId: string) => void;
  onDeleteMistaken: (participant: ParticipantView) => void;
  triggerSize: ButtonSize;
  triggerClassName: string;
  contentClassName: string;
  cancelItemClassName: string;
  deleteItemClassName: string;
  itemIconClassName: string;
  triggerAriaLabel?: string;
}

export function ParticipantActionMenu({
  participant,
  canCancel,
  canDeleteMistaken,
  isUpdating,
  onCancel,
  onDeleteMistaken,
  triggerSize,
  triggerClassName,
  contentClassName,
  cancelItemClassName,
  deleteItemClassName,
  itemIconClassName,
  triggerAriaLabel,
}: ParticipantActionMenuProps) {
  if (!canCancel && !canDeleteMistaken) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={triggerSize}
          variant="ghost"
          className={triggerClassName}
          disabled={!!isUpdating}
          {...(triggerAriaLabel ? { "aria-label": triggerAriaLabel } : {})}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={contentClassName}>
        <DropdownMenuGroup>
          {canCancel && (
            <DropdownMenuItem
              onClick={() => hasPaymentId(participant) && onCancel(participant.payment_id)}
              className={cancelItemClassName}
            >
              <RotateCcw className={itemIconClassName} />
              受領を取り消し
            </DropdownMenuItem>
          )}
          {canDeleteMistaken && (
            <DropdownMenuItem
              onClick={() => onDeleteMistaken(participant)}
              className={deleteItemClassName}
            >
              <Trash2 className={itemIconClassName} />
              参加者を削除
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
