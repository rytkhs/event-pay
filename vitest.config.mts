import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { readLocalSupabaseEnv } from "./tests/setup/local-supabase-env.ts";

const serverOnlyStub = fileURLToPath(new URL("./tests/setup/server-only.ts", import.meta.url));
const localSupabaseGuard = "./tests/setup/local-supabase-env.ts";

// setupFiles はプロジェクトごとに必要なものだけを配線する。
// unit-node は環境固有の初期化を持たないため設定しない。
const jsdomSetup = "./tests/setup/unit-jsdom.ts";
const serverSetup = "./tests/setup/test-environment.ts";
const nextServerSetup = "./tests/setup/next-test-environment.ts";

// prepare 未実行時は空のまま。失敗は db / integration の globalSetup で起こす。
const localSupabaseEnv = readLocalSupabaseEnv() ?? {};

// plugins と alias はプロジェクトごとに新しいインスタンスを生成する。
// 共有設定に `extends: true` を使うと plugins 配列が連結され、重複インスタンスが生まれる。
const createPlugins = () => [react()];

// TypeScript のエイリアスは Vite のネイティブ解決を使う。
// importer から辿った tsconfig を見るため、テストファイルは tests/tsconfig.json で解決される。
const createResolve = () => ({ tsconfigPaths: true });

const createBaseTest = () => ({
  globals: false,
  isolate: true,
  fileParallelism: true,
  clearMocks: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
  alias: [{ find: /^server-only$/, replacement: serverOnlyStub }],
});

export default defineConfig({
  test: {
    projects: [
      {
        plugins: createPlugins(),
        resolve: createResolve(),
        test: {
          ...createBaseTest(),
          name: "unit-node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        plugins: createPlugins(),
        resolve: createResolve(),
        test: {
          ...createBaseTest(),
          name: "unit-jsdom",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          setupFiles: [jsdomSetup],
        },
      },
      {
        plugins: createPlugins(),
        resolve: createResolve(),
        test: {
          ...createBaseTest(),
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.db.test.ts"],
          env: localSupabaseEnv,
          globalSetup: [localSupabaseGuard],
          setupFiles: [serverSetup],
        },
      },
      {
        plugins: createPlugins(),
        resolve: createResolve(),
        test: {
          ...createBaseTest(),
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.integration.test.ts"],
          env: localSupabaseEnv,
          globalSetup: [localSupabaseGuard],
          setupFiles: [nextServerSetup],
        },
      },
    ],
  },
});
