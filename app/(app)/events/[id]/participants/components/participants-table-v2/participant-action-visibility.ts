"use client";

import { toSimplePaymentStatus } from "@core/utils/payment-status-mapper";
import type { ParticipantView } from "@core/validation/participant-management";

export function canShowDeleteMistakenAttendanceAction(participant: ParticipantView): boolean {
  return participant.can_delete_mistaken_attendance === true;
}

export function getParticipantActionState(
  participant: ParticipantView,
  opts: { isSelectionMode?: boolean } = {}
) {
  const simplePaymentStatus = toSimplePaymentStatus(participant.payment_status);
  const isCashPayment =
    participant.payment_method === "cash" &&
    Boolean(participant.payment_id) &&
    participant.payment_status !== "canceled";
  const canReceiveCash =
    participant.status === "attending" &&
    isCashPayment &&
    (participant.payment_status === "pending" || participant.payment_status === "failed");
  const canCancelCashReceipt =
    participant.status === "attending" &&
    isCashPayment &&
    (simplePaymentStatus === "paid" || simplePaymentStatus === "waived");
  const canDeleteMistakenAttendance = canShowDeleteMistakenAttendanceAction(participant);
  const canUpdateAttendanceStatus = true;

  return {
    canReceiveCash,
    canCancelCashReceipt,
    canDeleteMistakenAttendance,
    canUpdateAttendanceStatus,
    showSecondaryMenu:
      !opts.isSelectionMode &&
      (canUpdateAttendanceStatus || canCancelCashReceipt || canDeleteMistakenAttendance),
  };
}
