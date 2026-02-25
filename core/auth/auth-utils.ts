import {
  createServerActionSupabaseClient,
  createServerComponentSupabaseClient,
} from "@core/supabase/factory";

async function getCurrentUserWithClient(
  createClient: () => ReturnType<typeof createServerComponentSupabaseClient>
) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getCurrentUserForServerAction() {
  return await getCurrentUserWithClient(createServerActionSupabaseClient);
}

export async function getCurrentUserForServerComponent() {
  return await getCurrentUserWithClient(createServerComponentSupabaseClient);
}
