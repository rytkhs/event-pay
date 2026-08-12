import type { AppSupabaseClient } from "@core/types/supabase";

import {
  createLocalAnonClient,
  createLocalSsrClient,
  createTestCookieJar,
  type TestCookie,
} from "../setup/local-supabase";

import { test as baseTest } from "./test";

/**
 * テストスコープの認証済み主催者。
 *
 * `public.users` 行は `auth.users` の AFTER INSERT トリガー（`handle_new_user`）が
 * 同一トランザクションで作るため、作成後のポーリングやリトライは不要。
 */

export type Organizer = {
  id: string;
  email: string;
  password: string;
  name: string;
};

export type AuthFixtures = {
  organizer: Organizer;
  otherOrganizer: Organizer;
  organizerRequestCookies: TestCookie[];
  /** `organizer` としてサインイン済みの anon キークライアント。 */
  organizerClient: AppSupabaseClient;
};

async function createOrganizer(options: {
  adminClient: AppSupabaseClient;
  email: string;
  password: string;
  name: string;
}): Promise<Organizer> {
  const { data, error } = await options.adminClient.auth.admin.createUser({
    email: options.email,
    password: options.password,
    email_confirm: true,
    user_metadata: { name: options.name },
  });

  if (error || !data.user) {
    throw new Error(`テスト主催者の作成に失敗しました: ${error?.message ?? "user が空です"}`);
  }

  return {
    id: data.user.id,
    email: options.email,
    password: options.password,
    name: options.name,
  };
}

async function deleteOrganizer(
  adminClient: AppSupabaseClient,
  organizer: Organizer
): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(organizer.id);

  if (error && error.status !== 404) {
    throw new Error(`テスト主催者の削除に失敗しました: ${error.message}`);
  }
}

export const test = baseTest.extend<AuthFixtures>({
  organizer: async ({ adminClient, unique }, use) => {
    const email = unique.email();
    const password = unique.password();
    const name = unique.organizerName();

    const organizer = await createOrganizer({ adminClient, email, password, name });

    try {
      await use(organizer);
    } finally {
      // public.users / communities は ON DELETE CASCADE で連鎖削除される。
      // 既に削除済みでも失敗しないよう、user not found は無視する。
      await deleteOrganizer(adminClient, organizer);
    }
  },

  otherOrganizer: async ({ adminClient, unique }, use) => {
    const organizer = await createOrganizer({
      adminClient,
      email: unique.email("other-organizer"),
      password: unique.password(),
      name: unique.organizerName("別主催者"),
    });

    try {
      await use(organizer);
    } finally {
      await deleteOrganizer(adminClient, organizer);
    }
  },

  organizerClient: async ({ organizer }, use) => {
    // anonClient は未認証のまま使えるようにしておくため、専用のクライアントを作る。
    const client = createLocalAnonClient();

    const { error } = await client.auth.signInWithPassword({
      email: organizer.email,
      password: organizer.password,
    });

    if (error) {
      throw new Error(`テスト主催者のサインインに失敗しました: ${error.message}`);
    }

    try {
      await use(client);
    } finally {
      await client.auth.signOut();
    }
  },

  organizerRequestCookies: async ({ organizer }, use) => {
    const cookieJar = createTestCookieJar();
    const client = createLocalSsrClient(cookieJar);
    const { error } = await client.auth.signInWithPassword({
      email: organizer.email,
      password: organizer.password,
    });

    if (error) {
      throw new Error(`テスト主催者の認証Cookie生成に失敗しました: ${error.message}`);
    }

    await use(cookieJar.getAll());
  },
});
