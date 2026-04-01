"use server";

import { dismissCommunityAnnouncement } from "@core/announcements/community-announcement";
import { requireCurrentUserForServerAction } from "@core/auth/auth-utils";

export async function dismissCommunityAnnouncementAction(): Promise<void> {
  await requireCurrentUserForServerAction();
  await dismissCommunityAnnouncement();
}
