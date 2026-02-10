import type { EventStatus, PaymentMethod } from "@core/types/statuses";

import type { Database } from "@/types/database";

export type RpcPublicGetEventRow =
  Database["public"]["Functions"]["rpc_public_get_event"]["Returns"][number];

export type RpcGuestGetAttendanceRow =
  Database["public"]["Functions"]["rpc_guest_get_attendance"]["Returns"][number];

export type InviteValidationErrorCode =
  | "INVALID_TOKEN"
  | "TOKEN_NOT_FOUND"
  | "EVENT_CANCELED"
  | "EVENT_ENDED"
  | "REGISTRATION_DEADLINE_PASSED"
  | "UNKNOWN_ERROR";

export interface InviteEventDetail {
  id: string;
  created_by: string;
  organizer_name: string;
  title: string;
  date: string;
  location: string | null;
  description: string | null;
  fee: number;
  capacity: number | null;
  payment_methods: PaymentMethod[];
  registration_deadline: string | null;
  payment_deadline: string | null;
  status: EventStatus;
  invite_token: string;
  attendances_count: number;
}

export interface InviteValidationResult {
  isValid: boolean;
  event?: InviteEventDetail;
  canRegister: boolean;
  errorMessage?: string;
  errorCode?: InviteValidationErrorCode;
}
