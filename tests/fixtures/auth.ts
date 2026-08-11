import type { AppSupabaseClient } from "@core/types/supabase";

import { createLocalAnonClient } from "../setup/local-supabase";

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
  /** `organizer` としてサインイン済みの anon キークライアント。 */
  organizerClient: AppSupabaseClient;
};

export const test = baseTest.extend<AuthFixtures>({
  organizer: async ({ adminClient, unique }, use) => {
    const email = unique.email();
    const password = unique.password();
    const name = unique.organizerName();

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error || !data.user) {
      throw new Error(`テスト主催者の作成に失敗しました: ${error?.message ?? "user が空です"}`);
    }

    const organizer: Organizer = { id: data.user.id, email, password, name };

    try {
      await use(organizer);
    } finally {
      // public.users / communities は ON DELETE CASCADE で連鎖削除される。
      // 既に削除済みでも失敗しないよう、user not found は無視する。
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(organizer.id);

      if (deleteError && deleteError.status !== 404) {
        throw new Error(`テスト主催者の削除に失敗しました: ${deleteError.message}`);
      }
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
});
