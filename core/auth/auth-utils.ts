import { cache } from "react";

import { redirect } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import { isMissingAuthSessionError } from "@core/supabase/auth-guards";
import {
  createServerActionSupabaseClient,
  createServerComponentSupabaseClient,
} from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";

type AuthLookupContext = "server_action" | "server_component";
type CreateUserClient = () => ReturnType<typeof createServerComponentSupabaseClient>;
type UserLookupResult = Awaited<ReturnType<typeof getCurrentUserWithClient>>;

export type CurrentAppUser = {
  id: string;
  email?: string | null;
  name: string | null;
};

const LOGIN_PATH = "/login";

async function getCurrentUserWithClient(createClient: CreateUserClient) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  return { supabase, user, authError };
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

function isUnauthenticatedLookupResult(result: UserLookupResult): boolean {
  if (!result.user && !result.authError) {
    return true;
  }

  return !result.user && isMissingAuthSessionError(result.authError);
}

function resolveRequiredUser(result: UserLookupResult, context: AuthLookupContext): User {
  if (context === "server_component" && isUnauthenticatedLookupResult(result)) {
    redirect(LOGIN_PATH);
  }

  if (result.authError) {
    logAuthLookupError(context, result.authError);
    throw new Error("Failed to resolve authenticated user from Supabase Auth.");
  }
  if (!result.user) {
    throwMissingAuthenticatedUser(context);
  }
  return result.user;
}

const getCachedCurrentUserWithServerComponent = cache(async () => {
  return await getCurrentUserWithClient(createServerComponentSupabaseClient);
});

async function getCurrentUserLookup(context: AuthLookupContext): Promise<UserLookupResult> {
  if (context === "server_component") {
    return await getCachedCurrentUserWithServerComponent();
  }
  return await getCurrentUserWithClient(createServerActionSupabaseClient);
}

async function getOptionalCurrentUser(context: AuthLookupContext): Promise<User | null> {
  const result = await getCurrentUserLookup(context);

  if (isUnauthenticatedLookupResult(result)) {
    return null;
  }

  if (result.authError) {
    logAuthLookupError(context, result.authError);
    return null;
  }

  return result.user;
}

async function requireCurrentUser(context: AuthLookupContext): Promise<User> {
  const result = await getCurrentUserLookup(context);
  return resolveRequiredUser(result, context);
}

export async function getOptionalCurrentUserForServerAction() {
  return await getOptionalCurrentUser("server_action");
}

export async function getOptionalCurrentUserForServerComponent() {
  return await getOptionalCurrentUser("server_component");
}

export async function requireCurrentUserForServerAction() {
  return await requireCurrentUser("server_action");
}

export async function requireCurrentUserForServerComponent() {
  return await requireCurrentUser("server_component");
}

export async function getCurrentUserForServerAction() {
  return await getOptionalCurrentUserForServerAction();
}

export async function getCurrentUserForServerComponent() {
  return await getOptionalCurrentUserForServerComponent();
}

const getCachedCurrentAppUserForServerComponent = cache(async (): Promise<CurrentAppUser> => {
  const result = await getCachedCurrentUserWithServerComponent();
  const user = resolveRequiredUser(result, "server_component");

  const { data: profile, error } = await result.supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    handleServerError(error, {
      category: "authentication",
      action: "current_app_user_profile_lookup_failed",
      actorType: "system",
      userId: user.id,
      additionalData: { context: "server_component" },
    });
  }

  return {
    id: user.id,
    email: user.email,
    name: error ? (user.email ?? null) : (profile?.name ?? user.email ?? null),
  };
});

export async function requireCurrentAppUserForServerComponent(): Promise<CurrentAppUser> {
  return await getCachedCurrentAppUserForServerComponent();
}
