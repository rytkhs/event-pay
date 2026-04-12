"use client";

import type { ParticipantView } from "@core/validation/participant-management";

export function canShowDeleteMistakenAttendanceAction(participant: ParticipantView): boolean {
  return participant.can_delete_mistaken_attendance === true;
}
