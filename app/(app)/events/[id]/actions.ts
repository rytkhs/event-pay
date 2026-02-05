"use server";

import {
  cancelEventAction as cancelEventActionImpl,
  deleteEventAction as deleteEventActionImpl,
  generateInviteTokenAction as generateInviteTokenActionImpl,
  getEventDetailAction as getEventDetailActionImpl,
  getEventParticipantsAction as getEventParticipantsActionImpl,
  getEventPaymentsAction as getEventPaymentsActionImpl,
  getEventStatsAction as getEventStatsActionImpl,
} from "@features/events/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

type GenerateInviteTokenOptions = Parameters<typeof generateInviteTokenActionImpl>[1];
export type GetEventParticipantsParams = Parameters<typeof getEventParticipantsActionImpl>[0];

export async function getEventDetailAction(eventId: string) {
  ensureFeaturesRegistered();
  return getEventDetailActionImpl(eventId);
}

export async function getEventParticipantsAction(params: GetEventParticipantsParams) {
  ensureFeaturesRegistered();
  return getEventParticipantsActionImpl(params);
}

export async function getEventPaymentsAction(eventId: string) {
  ensureFeaturesRegistered();
  return getEventPaymentsActionImpl(eventId);
}

export async function getEventStatsAction(eventId: string) {
  ensureFeaturesRegistered();
  return getEventStatsActionImpl(eventId);
}

export async function generateInviteTokenAction(
  eventId: string,
  options?: GenerateInviteTokenOptions
) {
  ensureFeaturesRegistered();
  if (options === undefined) {
    return generateInviteTokenActionImpl(eventId);
  }
  return generateInviteTokenActionImpl(eventId, options);
}

export async function cancelEventAction(params: Parameters<typeof cancelEventActionImpl>[0]) {
  ensureFeaturesRegistered();
  return cancelEventActionImpl(params);
}

export async function deleteEventAction(eventId: string) {
  ensureFeaturesRegistered();
  return deleteEventActionImpl(eventId);
}
