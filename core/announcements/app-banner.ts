import { cookies } from "next/headers";

export const PAYOUT_REQUEST_IN_APP_BANNER = {
  cookieName: "app_banner_dismissed_payout_request_in_app",
  announcementPath: "/announcements/payout-request-in-app",
  startsAt: "2026-05-13T00:00:00+09:00",
  endsAt: "2026-05-27T00:00:00+09:00",
  existingUserCutoffExclusive: "2026-05-14T00:00:00+09:00",
} as const;

function isInDisplayPeriod(now: Date): boolean {
  const startsAt = new Date(PAYOUT_REQUEST_IN_APP_BANNER.startsAt).getTime();
  const endsAt = new Date(PAYOUT_REQUEST_IN_APP_BANNER.endsAt).getTime();
  const current = now.getTime();

  return startsAt <= current && current < endsAt;
}

function isExistingUser(userCreatedAt: string): boolean {
  const createdAt = new Date(userCreatedAt).getTime();
  const cutoff = new Date(PAYOUT_REQUEST_IN_APP_BANNER.existingUserCutoffExclusive).getTime();

  return Number.isFinite(createdAt) && createdAt < cutoff;
}

export async function shouldShowPayoutRequestInAppBanner(
  userCreatedAt: string,
  now: Date = new Date()
): Promise<boolean> {
  if (!isInDisplayPeriod(now) || !isExistingUser(userCreatedAt)) {
    return false;
  }

  const cookieStore = await cookies();
  return cookieStore.get(PAYOUT_REQUEST_IN_APP_BANNER.cookieName)?.value !== "1";
}

export async function dismissPayoutRequestInAppBannerCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PAYOUT_REQUEST_IN_APP_BANNER.cookieName, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(PAYOUT_REQUEST_IN_APP_BANNER.endsAt),
  });
}
