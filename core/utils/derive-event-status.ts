export type DerivedEventStatus = "upcoming" | "ongoing" | "past" | "canceled";

export function deriveEventStatus(
  dateIso: string,
  canceledAt: string | null,
  now: Date = new Date(),
  autoEndHours: number = 24
): DerivedEventStatus {
  if (canceledAt) return "canceled";
  const startMs = new Date(dateIso).getTime();
  const t = now.getTime();
  const endMs = startMs + autoEndHours * 60 * 60 * 1000;
  if (t < startMs) return "upcoming";
  if (t < endMs) return "ongoing";
  return "past";
}
