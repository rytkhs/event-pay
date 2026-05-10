import type { EventStatus, PaymentMethod } from "@core/types/statuses";

import type { Database } from "@/types/database";

export type RpcPublicGetEventRow =
  Database["public"]["Functions"]["rpc_public_get_event"]["Returns"][number] & {
    community_show_legal_disclosure_link: boolean;
  };

export type RpcGuestGetAttendanceRow =
  Database["public"]["Functions"]["rpc_guest_get_attendance"]["Returns"][number] & {
    community_show_legal_disclosure_link: boolean;
  };

export type InviteValidationErrorCode =
  | "INVALID_TOKEN"
  | "TOKEN_NOT_FOUND"
  | "EVENT_CANCELED"
  | "EVENT_ENDED"
  | "REGISTRATION_DEADLINE_PASSED"
  | "UNKNOWN_ERROR";

export interface InviteEventDetail {
  id: string;
  community: {
    name: string;
    legalSlug: string;
    showCommunityLink: boolean;
    showLegalDisclosureLink: boolean;
    slug: string;
  };
  title: string;
  date: string;
  location: string | null;
  description: string | null;
  fee: number;
  capacity: number | null;
  show_participant_count: boolean;
  payment_methods: PaymentMethod[];
  registration_deadline: string | null;
  payment_deadline: string | null;
  status: EventStatus;
  invite_token: string;
  attendances_count?: number;
  is_capacity_reached: boolean;
  capacityStatus:
    | {
        participantCountVisible: true;
        attendingCount: number;
        capacity: number | null;
      }
    | {
        participantCountVisible: false;
        capacity: number | null;
      };
}

export interface InviteValidationResult {
  isValid: boolean;
  event?: InviteEventDetail;
  canRegister: boolean;
  errorMessage?: string;
  errorCode?: InviteValidationErrorCode;
}
