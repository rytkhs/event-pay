import type { User } from "@supabase/supabase-js";

import {
  createServerActionSupabaseClient,
  createServerComponentSupabaseClient,
} from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";

type AuthLookupContext = "server_action" | "server_component";
type CreateUserClient = () => ReturnType<typeof createServerComponentSupabaseClient>;

async function getCurrentUserWithClient(createClient: CreateUserClient) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  return { user, authError };
}

function logAuthLookupError(context: AuthLookupContext, error: unknown): void {
  handleServerError(error, {
    category: "authentication",
    action: "current_user_lookup_failed",
    actorType: "system",
    additionalData: { context },
  });
}

function throwMissingAuthenticatedUser(context: AuthLookupContext): never {
  const error = new Error("Authenticated user is required in this execution context.");
  handleServerError(error, {
    category: "authentication",
    action: "authenticated_user_missing",
    actorType: "system",
    additionalData: { context },
  });
  throw error;
}

async function getOptionalCurrentUser(
  createClient: CreateUserClient,
  context: AuthLookupContext
): Promise<User | null> {
  const { user, authError } = await getCurrentUserWithClient(createClient);
  if (authError) {
    logAuthLookupError(context, authError);
    return null;
  }
  return user;
}

async function requireCurrentUser(
  createClient: CreateUserClient,
  context: AuthLookupContext
): Promise<User> {
  const { user, authError } = await getCurrentUserWithClient(createClient);
  if (authError) {
    logAuthLookupError(context, authError);
    throw new Error("Failed to resolve authenticated user from Supabase Auth.");
  }
  if (!user) {
    throwMissingAuthenticatedUser(context);
  }
  return user;
}

export async function getOptionalCurrentUserForServerAction() {
  return await getOptionalCurrentUser(createServerActionSupabaseClient, "server_action");
}

export async function getOptionalCurrentUserForServerComponent() {
  return await getOptionalCurrentUser(createServerComponentSupabaseClient, "server_component");
}

export async function requireCurrentUserForServerAction() {
  return await requireCurrentUser(createServerActionSupabaseClient, "server_action");
}

export async function requireCurrentUserForServerComponent() {
  return await requireCurrentUser(createServerComponentSupabaseClient, "server_component");
}

export async function getCurrentUserForServerAction() {
  return await getOptionalCurrentUserForServerAction();
}

export async function getCurrentUserForServerComponent() {
  return await getOptionalCurrentUserForServerComponent();
}
