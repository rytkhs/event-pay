import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import type { AppSupabaseClient } from "@core/types/supabase";

import { StripeConnectErrorHandler } from "./error-handler";
import type { IStripeConnectService } from "./interface";
import { StripeConnectService } from "./service";

export const createUserStripeConnectService = (): IStripeConnectService => {
  const secureFactory = getSecureClientFactory();
  const userClient = secureFactory.createAuthenticatedClient();
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(userClient as AppSupabaseClient, errorHandler);
};

export const createStripeConnectServiceWithClient = (
  adminClient: AppSupabaseClient
): IStripeConnectService => {
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(adminClient as AppSupabaseClient, errorHandler);
};
