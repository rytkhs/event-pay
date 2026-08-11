import { randomUUID } from "node:crypto";

import { test as baseTest } from "vitest";

import type { AppSupabaseClient } from "@core/types/supabase";

import { createLocalAdminClient, createLocalAnonClient } from "../setup/local-supabase";

/**
 * ローカル Supabase へ接続するテストの基底 fixture。
 *
 * fixture は分割代入されたものだけが初期化され、teardown は初期化と逆順に走る。
 * 認証済みクライアントや可変レコードはモジュールスコープに持たない。
 *
 * 主催者を必要とするテストは `./auth`、コミュニティも必要なら `./community` から
 * `test` を import する。
 */

/** テストごとに一意な値を作る。ファイル並列実行でも衝突しない。 */
export type UniqueValues = {
  /** このテスト固有のトークン。値の一意性はすべてこれに由来する。 */
  token: string;
  email(): string;
  password(): string;
  organizerName(): string;
  communityName(): string;
};

export type BaseFixtures = {
  /** service_role クライアント。RLS を迂回してセットアップ／後始末に使う。 */
  adminClient: AppSupabaseClient;
  /** 未認証の anon クライアント。サインインさせない（RLS の否定系検証用）。 */
  anonClient: AppSupabaseClient;
  unique: UniqueValues;
};

function createUniqueValues(): UniqueValues {
  const token = randomUUID();
  const shortToken = token.slice(0, 8);

  return {
    token,
    email: () => `organizer-${token}@example.com`,
    // config.toml の minimum_password_length = 6
    password: () => `pw-${shortToken}`,
    organizerName: () => `テスト主催者-${shortToken}`,
    communityName: () => `テストコミュニティ-${shortToken}`,
  };
}

// Vitest は第1引数の分割代入から fixture の依存を検出するため、
// 依存がない fixture でも空の分割代入を書く必要がある。
export const test = baseTest.extend<BaseFixtures>({
  adminClient: async ({}, use) => {
    await use(createLocalAdminClient());
  },

  anonClient: async ({}, use) => {
    await use(createLocalAnonClient());
  },

  unique: async ({}, use) => {
    await use(createUniqueValues());
  },
});
