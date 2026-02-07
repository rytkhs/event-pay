import type { SupabaseClient } from "@supabase/supabase-js";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { type AdminReason } from "@core/security/secure-client-factory.types";

import type { Database } from "@/types/database";

import { StripeConnectErrorHandler } from "./error-handler";
import type { IStripeConnectService } from "./interface";
import { StripeConnectService } from "./service";

export const createUserStripeConnectService = (): IStripeConnectService => {
  const secureFactory = SecureSupabaseClientFactory.create();
  const userClient = secureFactory.createAuthenticatedClient();
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(userClient as SupabaseClient<Database>, errorHandler);
};

export const createAdminStripeConnectService = async (
  reason: AdminReason,
  context: string
): Promise<IStripeConnectService> => {
  const secureFactory = SecureSupabaseClientFactory.create();
  const adminClient = await secureFactory.createAuditedAdminClient(reason, context);
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(adminClient as SupabaseClient<Database>, errorHandler);
};

export const createStripeConnectServiceWithClient = (
  adminClient: SupabaseClient<Database>
): IStripeConnectService => {
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(adminClient as SupabaseClient<Database>, errorHandler);
};
