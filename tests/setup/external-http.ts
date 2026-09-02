import { http, HttpResponse, passthrough } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach } from "vitest";

/**
 * `integration` プロジェクトの外部境界 fake。
 *
 * Stripe / QStash / Resend への送信内容そのものが保証対象になるため
 * （`TEST_GUARANTEE_REPORT.md` の CHK-04 / WH-05 ほか）、内部モジュールを mock せず
 * HTTP のレイヤーで fake する。決定の経緯は issue #513 のコメントに残してある。
 *
 * ## なぜ MSW か
 *
 * - Vitest 公式が Node 環境の HTTP mock に MSW を推奨している
 * - CHK-08 / CON-08 が timeout と「成功後の応答断」を要求する。Stripe SDK は
 *   `FetchHttpClient` の `makeFetchWithAbortTimeout` で必ず `AbortSignal` を渡すため、
 *   自前ディスパッチャだと abort 処理を自作することになる
 * - ローカル Supabase の素通しを `passthrough()` で表現できる
 *
 * `undici` の `MockAgent` は、未登録ホストのエラーが `TypeError: fetch failed` に潰れて
 * 原因が読めず、ヘッダの再現も不正確なため採らない。
 *
 * ## なぜモジュール評価時に listen するか
 *
 * `beforeAll` は Vitest がテストモジュールを import した後に走る。現状 `getStripe()` は
 * 遅延生成なので `beforeAll` でも間に合うが、将来モジュールのトップレベルで外部
 * クライアントを構築するコードが入ると静かに捕捉漏れする。
 *
 * **これは `isolate: true` を前提にしている。** fetch interceptor は
 * `invariant(!pureFetch[IS_PATCHED_MODULE], 'Failed to patch the "fetch" module: already patched.')`
 * を持ち、`network.enable()` にも "already enabled" の invariant がある。`--no-isolate` で
 * worker が使い回されると二重パッチに当たり得る。
 *
 * ## ベンダー公式ツールを採らない理由と、切り替える条件
 *
 * - `stripe-mock` — OpenAPI からレスポンスを生成するだけで stateless。Stripe 自身が
 *   sanity check 用と位置づけている。受け取ったリクエストを外へ見せないため CHK-04 に
 *   使えず、CHK-06 / CHK-07 の idempotency 再試行にも対応しない。なお Stripe 公式の推奨は
 *   「自前モック + testmode での実検証の二層」であり、integration と External contract の
 *   分割はこれに沿っている
 * - QStash dev server（`npx @upstash/qstash-cli dev`） — WH-05 は「何を送ったか」の観測が
 *   目的なので、実際に重複排除する dev server は不向き。WH-06 は `Receiver` とローカル生成の
 *   署名で足りる。**Schedules / URL Groups / 実際の配信リトライを保証対象にする段階で
 *   dev server へ切り替える**
 *
 * ## request への assert について
 *
 * MSW 公式は送信リクエストへの assert を推奨せず、認める例外は「third-party への一方向
 * リクエスト」だけである。WH-05（QStash publish）と NTF 系（Resend 送信）はその例外に
 * 該当する。CHK-04（Stripe へ渡す amount / destination / application fee）は該当しないが、
 * 送信内容は DB にも公開レスポンスにも現れず、リクエスト検証以外に観測手段が無いため
 * 意図的に逸脱する。それ以外の不変条件はテスト側ではなくハンドラ側に置き
 * （validation-in-handler）、破れたらエラーレスポンスを返すこと。
 */

export type ExternalService = "stripe" | "stripe-ips" | "qstash" | "resend";

/**
 * fake 対象のホスト。`api.stripe.com` と `stripe.com` は別ホストで、後者は
 * WH-03 が踏む Webhook IP 許可リスト（`core/security/stripe-ip-allowlist.ts`）。
 */
const KNOWN_HOSTS = new Map<string, ExternalService>([
  ["api.stripe.com", "stripe"],
  ["stripe.com", "stripe-ips"],
  ["qstash.upstash.io", "qstash"],
  ["api.resend.com", "resend"],
]);

/** ローカル Supabase。integration はここまで実経路を通す契約になっている。 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export type RecordedRequest = {
  service: ExternalService;
  method: string;
  url: URL;
  /** ヘッダ名は小文字に正規化されている。 */
  headers: Record<string, string>;
  /** 送信 body の生文字列。Stripe は form-urlencoded、QStash / Resend は JSON。 */
  text(): Promise<string>;
};

export type ExternalHttpViolation = {
  method: string;
  url: string;
};

const records: RecordedRequest[] = [];
const violations: ExternalHttpViolation[] = [];

/**
 * 未登録リクエストの受け皿。`setupServer()` の初期ハンドラとして1つだけ置く。
 * `server.use()` は prepend するため、テストが登録したハンドラが常に優先される。
 *
 * **throw せずレスポンスを返す。** このコードベースには3段のリトライがあり、
 * fetch が throw すると失敗が遅く、かつ握り潰される。
 *
 * - Stripe SDK は接続エラー（レスポンス無し）を `maxNetworkRetries: 3` で再試行し、
 *   さらに `core/stripe/idempotency-retry.ts` が `StripeConnectionError` を掴んで5回再試行する。
 *   Checkout 1回で最大24回の fetch と20〜35秒を消費し、Vitest 既定の 5s timeout に当たって
 *   「どの外部境界へ漏れたか」ではなく「タイムアウト」としか出ない
 * - `@upstash/qstash` の HTTP クライアントも throw を5回再試行する
 * - Resend は throw を transient 判定して再試行し、最後は `errResult` を返す（throw しない）
 *
 * 400 なら3SDKともリトライせず即座に抜ける。`stripe-should-retry: false` は Stripe SDK の
 * `_shouldRetry` が明示的に見るヘッダ。**409 と 5xx を使ってはならない** —— 409 は
 * `retryWithIdempotency` が、5xx は Stripe SDK 自身が再試行対象にする。
 *
 * レスポンスを返す以上テスト自体は赤くならないので、違反は台帳へ記録して
 * 下の `afterEach` で失敗させる。
 */
const unregisteredRequestHandler = http.all("*", ({ request }) => {
  const url = new URL(request.url);

  if (LOCAL_HOSTS.has(url.hostname)) {
    return passthrough();
  }

  violations.push({ method: request.method, url: request.url });

  return HttpResponse.json(
    {
      error: "external_http_not_registered",
      message:
        `${request.method} ${request.url} に対するレスポンスが登録されていません。` +
        `externalHttp fixture の on() で登録するか、外部通信が意図しないものであれば呼び出し側を直してください。`,
    },
    {
      status: 400,
      headers: { "stripe-should-retry": "false" },
    }
  );
});

export const externalHttpServer = setupServer(unregisteredRequestHandler);

/**
 * 記録はライフサイクルイベントで行う。リスナはモジュール評価時に一度だけ登録する
 * （`resetHandlers()` はハンドラしか戻さず、リスナは `close()` まで残るため、
 * テストごとに登録すると多重になる）。
 *
 * body は `request.clone()` を同期的に保持して遅延読み出しする。リスナの完了を
 * MSW が待つかどうかに依存しなくなる。
 */
externalHttpServer.events.on("request:start", ({ request }) => {
  const url = new URL(request.url);
  const service = KNOWN_HOSTS.get(url.hostname);

  if (!service) return;

  const clone = request.clone();

  records.push({
    service,
    method: request.method,
    url,
    headers: Object.fromEntries(request.headers),
    text: () => clone.text(),
  });
});

externalHttpServer.listen({
  // catch-all があるため通常は発火しない。catch-all の登録漏れに対する二重防御。
  onUnhandledRequest: "error",
});

/** 送信された request を到達順に返す。 */
export function recordedRequests(service?: ExternalService): RecordedRequest[] {
  return service ? records.filter((record) => record.service === service) : [...records];
}

/** 違反台帳をドレインする。未登録ホストを検証するテストだけが使う。 */
export function takeExternalHttpViolations(): ExternalHttpViolation[] {
  return violations.splice(0);
}

/**
 * 同時に有効な fixture を1つに制限する。
 *
 * `isolate: true` + `fileParallelism: true` によりファイル単位では独立するが、
 * 同一ファイル内で `test.concurrent` を使うとハンドラ登録と記録が混ざる。
 * 黙って壊れるより即座に落ちるほうがよい。
 *
 * `.concurrent` が本当に必要になったときの正解は自前の AsyncLocalStorage ではなく
 * MSW 標準の `externalHttpServer.boundary()` なので、そちらへ寄せること。
 */
let activeSessions = 0;

export function beginExternalHttpSession(): void {
  activeSessions += 1;

  if (activeSessions > 1) {
    activeSessions -= 1;
    throw new Error(
      "externalHttp fixture は同時に1つしか使えません。" +
        "test.concurrent で並行させる場合は externalHttpServer.boundary() へ寄せてください。"
    );
  }
}

export function endExternalHttpSession(): void {
  activeSessions = Math.max(0, activeSessions - 1);
}

afterEach(() => {
  externalHttpServer.resetHandlers();
  records.length = 0;

  const leaked = violations.splice(0);

  if (leaked.length > 0) {
    const lines = leaked.map((violation) => `  ${violation.method} ${violation.url}`).join("\n");
    throw new Error(
      `登録されていない外部ホストへリクエストが出ました。\n${lines}\n` +
        "意図した検証であれば externalHttp.takeViolations() でドレインしてください。"
    );
  }
});

afterAll(() => {
  // close() は globalThis.fetch を元へ戻すが、getStripe() のシングルトンは
  // MSW のラッパを掴んだままになる。close 後にリクエストを出してはならない。
  externalHttpServer.close();
});
