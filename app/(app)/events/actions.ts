"use server";

import {
  getDashboardStatsAction as getDashboardStatsActionImpl,
  getEventsAction as getEventsActionImpl,
  getRecentEventsAction as getRecentEventsActionImpl,
} from "@features/events/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

type GetEventsOptions = Parameters<typeof getEventsActionImpl>[0];

export async function getEventsAction(options: GetEventsOptions = {}) {
  ensureFeaturesRegistered();
  return getEventsActionImpl(options);
}

export async function getDashboardStatsAction() {
  ensureFeaturesRegistered();
  return getDashboardStatsActionImpl();
}

export async function getRecentEventsAction() {
  ensureFeaturesRegistered();
  return getRecentEventsActionImpl();
}
