import {
  createServerActionSupabaseClient,
  createServerComponentSupabaseClient,
} from "@core/supabase/factory";
import type { AppSupabaseClient } from "@core/types/supabase";

import { StripeConnectErrorHandler } from "./error-handler";
import type { IStripeConnectService } from "./interface";
import { StripeConnectService } from "./service";

export const createUserStripeConnectServiceForServerAction =
  async (): Promise<IStripeConnectService> => {
    const userClient = await createServerActionSupabaseClient();
    const errorHandler = new StripeConnectErrorHandler();
    return new StripeConnectService(userClient as AppSupabaseClient, errorHandler);
  };

export const createUserStripeConnectServiceForServerComponent =
  async (): Promise<IStripeConnectService> => {
    const userClient = await createServerComponentSupabaseClient();
    const errorHandler = new StripeConnectErrorHandler();
    return new StripeConnectService(userClient as AppSupabaseClient, errorHandler);
  };

export const createStripeConnectServiceWithClient = (
  adminClient: AppSupabaseClient
): IStripeConnectService => {
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(adminClient as AppSupabaseClient, errorHandler);
};
