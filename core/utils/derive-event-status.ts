import { EVENT_CONFIG, TIME_CONSTANTS } from "@core/constants/event-config";

export type DerivedEventStatus = "upcoming" | "ongoing" | "past" | "canceled";

export function deriveEventStatus(
  dateIso: string,
  canceledAt: string | null,
  now: Date = new Date(),
  autoEndHours: number = EVENT_CONFIG.AUTO_END_HOURS
): DerivedEventStatus {
  if (canceledAt) return "canceled";
  const startMs = new Date(dateIso).getTime();
  const t = now.getTime();
  const endMs = startMs + autoEndHours * TIME_CONSTANTS.MS_TO_HOURS;
  if (t < startMs) return "upcoming";
  if (t < endMs) return "ongoing";
  return "past";
}
