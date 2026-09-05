import type { RequestHandler } from "msw";

import {
  beginExternalHttpSession,
  endExternalHttpSession,
  externalHttpServer,
  recordedRequests,
  takeExternalHttpViolations,
  type ExternalHttpViolation,
  type ExternalService,
  type RecordedRequest,
} from "../setup/external-http";

import { test as baseTest } from "./test";

/**
 * 外部境界（Stripe / QStash / Resend）の fake をテストスコープで扱う fixture。
 *
 * レスポンス列・ネットワークエラー・遅延は MSW の標準機能で表現できるので、
 * 自前のラッパは作らない。
 *
 * - レスポンス列: `http.post(url, resolver, { once: true })` を必要な回数重ねる
 * - ネットワークエラー: `HttpResponse.error()`
 * - 遅延・timeout: `await delay(ms)`
 *
 * ハンドラの解除と記録のクリアは `tests/setup/external-http.ts` の `onTestFinished` が
 * 無条件に行う。fixture を使わずに `externalHttpServer.use()` を直接呼んだテストでも
 * 漏れない。fixture の teardown より後に走るため、teardown からも登録済みハンドラを
 * そのまま使える。
 *
 * `db` プロジェクトには MSW の setup が無いため、基底の `./test` へは入れない
 * （import が評価された時点で `listen()` が走る）。
 */
export type ExternalHttp = {
  /** レスポンスを登録する。`externalHttpServer.use()` と同じくテストごとに解除される。 */
  on(...handlers: RequestHandler[]): void;
  /** 送信された request を到達順に返す。 */
  requests(service?: ExternalService): RecordedRequest[];
  /** 未登録ホストへの通信をドレインする。ドレインしない限りテストは失敗する。 */
  takeViolations(): ExternalHttpViolation[];
};

export type ExternalHttpFixtures = {
  externalHttp: ExternalHttp;
};

/**
 * fixture 定義。既存のチェーン（`./auth` や `./payment`）へ合成できるよう単体で export する。
 *
 * @example
 * import { test as paymentTest } from "./payment";
 * import { externalHttpFixture, type ExternalHttpFixtures } from "./external-http";
 *
 * export const test = paymentTest.extend<ExternalHttpFixtures>(externalHttpFixture);
 */
export const externalHttpFixture = {
  // Vitest は第1引数の分割代入から依存を検出するため、依存がなくても空の分割代入を書く。
  externalHttp: async ({}, use: (value: ExternalHttp) => Promise<void>) => {
    beginExternalHttpSession();

    try {
      await use({
        on: (...handlers: RequestHandler[]) => externalHttpServer.use(...handlers),
        requests: recordedRequests,
        takeViolations: takeExternalHttpViolations,
      });
    } finally {
      endExternalHttpSession();
    }
  },
};

export const test = baseTest.extend<ExternalHttpFixtures>(externalHttpFixture);
