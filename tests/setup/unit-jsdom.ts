import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * `unit-jsdom` プロジェクトの setupFiles。
 *
 * `globals: false` のため Testing Library の自動 cleanup は働かない。
 * DOM をテスト間で持ち越さないよう明示的に登録する。
 */
afterEach(() => {
  cleanup();
});
