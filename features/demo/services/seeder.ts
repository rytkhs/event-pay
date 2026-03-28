import "server-only";
import { randomBytes } from "crypto";

import { fakerJA as faker } from "@faker-js/faker";

import type { AttendanceInsert, AttendanceRow, EventInsert, EventRow } from "@core/types/event";
import type { PaymentInsert } from "@core/types/payment";
import type { AttendanceStatus, PaymentMethod, PaymentStatus } from "@core/types/statuses";
import type { StripeAccountStatus } from "@core/types/stripe-connect";
import type { AppSupabaseClient } from "@core/types/supabase";

// --- 設定 ---
const CONFIG = {
  // DB操作設定
  DB: {
    CHUNK_SIZE: 500,
    RETRY_WAIT_MS: 200,
    RETRY_MAX_ATTEMPTS: 15,
  },
  // 生成数設定
  COUNTS: {
    ATTENDANCE: {
      PRIMARY: { MIN: 45, MAX: 80 },
      OTHERS: { MIN: 20, MAX: 100 },
    },
    PAYMENT_DATE_OFFSET: { MIN: 1, MAX: 25 }, // 支払日・作成日を現在から何日前まで分散させるか
  },
  // 確率設定 (閾値)
  PROBABILITIES: {
    ATTENDANCE: {
      PRIMARY: {
        ATTENDING: 0.65, // 0 ~ 0.65
        MAYBE: 0.85, // 0.65 ~ 0.85
        // 残りが not_attending
      },
      OTHERS: {
        ATTENDING: 0.78,
        MAYBE: 0.92,
      },
    },
    PAYMENT: {
      STRIPE: {
        PAID: 0.85, // 85%
        PENDING: 0.95, // 10% (0.85 ~ 0.95)
        FAILED: 0.98, // 3% (0.95 ~ 0.98)
        // 残り 2% が refunded
      },
      CASH: {
        RECEIVED: 0.8, // 80%
        // 残り 20% が pending
      },
    },
  },
};

// --- 定数・ユーティリティ ---
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const iso = (d: Date) => d.toISOString();
const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};
const addHours = (base: Date, hours: number) => {
  const d = new Date(base);
  d.setHours(d.getHours() + hours);
  return d;
};

const int = (min: number, max: number) => faker.number.int({ min, max });

const shuffle = <T>(array: T[]) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// トークン生成
const makeToken = (prefix: string, bytes: number, encoding: "base64url" | "hex" = "base64url") =>
  `${prefix}_${randomBytes(bytes).toString(encoding)}`;

const tokens = {
  guest: () => makeToken("gst", 24),
  invite: () => makeToken("inv", 24),
  stripePI: () => makeToken("pi", 12, "hex"),
  stripeCS: () => `cs_test_${randomBytes(12).toString("hex")}`,
};

function assertNonNull<T>(v: T | null | undefined, msg: string): T {
  if (v == null) throw new Error(msg);
  return v;
}

// --- データ生成 ---

function getEventScenarios(
  userId: string,
  now: Date,
  communityId: string,
  payoutProfileId: string | null
): EventInsert[] {
  // ヘルパー
  const day = (offset: number) => iso(addDays(now, offset));
  // イベント作成時の snapshot として current community の payout_profile_id を保持
  const ppForMethods = (_methods: string[]) => payoutProfileId;

  return [
    {
      // 1. 開催前（申込受付中・支払期限あり・stripe+cash）
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe", "cash"]),
      title: "創立10周年記念 OB・OG交流会",
      date: day(20),
      location: "ホテルメトロポリタン宴会場「富士」",
      fee: 5000,
      capacity: 80,
      description:
        "サークル創立10周年を記念した立食パーティーです。Stripeと現金の両方に対応しています。",
      registration_deadline: day(10),
      payment_deadline: day(12),
      payment_methods: ["stripe", "cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: true,
      grace_period_days: 3,
    },
    {
      // 2. 開催前（申込締切間近・capacity小さめ）
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe", "cash"]),
      title: "【締切間近】秋季関東学生テニス選手権（予選）エントリー",
      date: day(7),
      location: "有明テニスの森公園",
      fee: 3000,
      capacity: 30,
      description:
        "秋の個人戦のエントリー費です。協会への振込期限の関係上、締切後の支払いは一切受け付けられませんのでご注意ください。",
      registration_deadline: day(2),
      payment_deadline: day(3),
      payment_methods: ["stripe", "cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    },
    {
      // 3. 開催済み（売上が立っている：Stripe paid と cash received が混在）
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe", "cash"]),
      title: "【終了】新入生歓迎 BBQ大会🍖",
      date: day(-30),
      location: "昭和記念公園 バーベキューガーデン",
      fee: 4000,
      capacity: 120,
      description:
        "（開催終了）新入生歓迎イベント。オンライン決済済みと、現地での現金回収（受領済み）のデータが混在している状態を確認できます。",
      registration_deadline: day(-45),
      payment_deadline: day(-40),
      payment_methods: ["stripe", "cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
      created_at: day(-50),
      updated_at: day(-45),
    },
    {
      // 4. 無料イベント
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods([]),
      title: "【自由参加】早朝自主練（コート開放）",
      date: day(14),
      location: "大学テニスコート A・B面",
      fee: 0,
      capacity: 200,
      description: "参加費無料の自主練です。決済フローが発生しないため、参加表明のみで完了します。",
      registration_deadline: day(12),
      payment_methods: [],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    },
    {
      // 5. Stripeのみイベント
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe"]),
      title: "2026年度 チームウェア購入（パーカー）",
      date: day(10),
      location: "オンライン（後日練習時に配布）",
      fee: 6000,
      capacity: 150,
      description:
        "チームパーカーの購入申し込みです。在庫管理と集金の手間を省くため、オンライン決済のみ受け付けます。",
      registration_deadline: day(6),
      payment_deadline: day(7),
      payment_methods: ["stripe"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: true,
      grace_period_days: 2,
    },
    {
      // 6. 現金のみイベント
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["cash"]),
      title: "定例練習 @大井ふ頭",
      date: day(15),
      location: "大井ふ頭中央海浜公園スポーツの森",
      fee: 2000,
      capacity: 60,
      description:
        "通常の練習会です。コート代とボール代を現地で集めます。現金のみの設定にしており、管理者が手動で「未受領」→「受領済み」に変更するフローを想定しています。",
      registration_deadline: day(11),
      payment_deadline: day(13),
      payment_methods: ["cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    },
    {
      // 7. 中止イベント
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe", "cash"]),
      title: "【雨天中止】お花見ミックスダブルス大会🌸",
      date: day(11),
      location: "井の頭恩賜公園",
      fee: 3500,
      capacity: 90,
      description:
        "雨天予報のため中止となりました。中止ステータス（canceled_at）の表示確認用データです。",
      registration_deadline: day(4),
      payment_deadline: day(4),
      payment_methods: ["stripe", "cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
      canceled_at: day(-1),
      canceled_by: userId,
    },
  ];
}

function getBookClubEventScenarios(
  userId: string,
  now: Date,
  communityId: string,
  payoutProfileId: string | null
): EventInsert[] {
  const day = (offset: number) => iso(addDays(now, offset));
  // イベント作成時の snapshot として current community の payout_profile_id を保持
  const ppForMethods = (_methods: string[]) => payoutProfileId;

  return [
    {
      // 1. 開催前（申込受付中・支払期限あり・stripe+cash）
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe", "cash"]),
      title: "読書会1周年記念オフ会 & 交流会",
      date: day(20),
      location: "渋谷貸し会議室 + 交流会会場",
      fee: 5000,
      capacity: 80,
      description:
        "読書会コミュニティの1周年を記念した交流イベントです。会場費と懇親会費を含み、オンラインと現金の両方に対応しています。",
      registration_deadline: day(10),
      payment_deadline: day(12),
      payment_methods: ["stripe", "cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: true,
      grace_period_days: 3,
    },
    {
      // 2. 開催前（申込締切間近・capacity小さめ）
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe", "cash"]),
      title: "【締切間近】外部セミナー参加費",
      date: day(7),
      location: "都内セミナー会場",
      fee: 3000,
      capacity: 30,
      description:
        "外部セミナーへの団体参加です。支払い期限があるため、締切後の支払いは受け付けません。",
      registration_deadline: day(2),
      payment_deadline: day(3),
      payment_methods: ["stripe", "cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    },
    {
      // 3. 開催済み（売上が立っている：Stripe paid と cash received が混在）
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe", "cash"]),
      title: "【終了】新メンバー歓迎 読書会 & 懇親会",
      date: day(-30),
      location: "池袋駅前イベントスペース",
      fee: 4000,
      capacity: 120,
      description:
        "（開催終了）新メンバー向け歓迎イベントです。オンライン決済済みと、当日の現金回収（受領済み）が混在している状態を確認できます。",
      registration_deadline: day(-45),
      payment_deadline: day(-40),
      payment_methods: ["stripe", "cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
      created_at: day(-50),
      updated_at: day(-45),
    },
    {
      // 4. 無料イベント
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods([]),
      title: "【自由参加】朝のもくもく読書会",
      date: day(14),
      location: "オンライン（Zoom）",
      fee: 0,
      capacity: 200,
      description:
        "参加費無料の朝活イベントです。決済フローが発生しないため、参加表明のみで完了します。",
      registration_deadline: day(12),
      payment_methods: [],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    },
    {
      // 5. Stripeのみイベント
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe"]),
      title: "今月の課題本",
      date: day(10),
      location: "オンライン（手渡し・配送）",
      fee: 2500,
      capacity: 150,
      description: "今月の課題本です。オンライン決済のみ受け付けます。",
      registration_deadline: day(6),
      payment_deadline: day(7),
      payment_methods: ["stripe"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: true,
      grace_period_days: 2,
    },
    {
      // 6. 現金のみイベント
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["cash"]),
      title: "定例読書会 @ 市民センター",
      date: day(15),
      location: "渋谷区立市民センター 第2会議室",
      fee: 1500,
      capacity: 60,
      description:
        "定例の読書会イベントです。会場費を当日現地で集めます。現金のみの設定にしており、管理者が手動で「未受領」→「受領済み」に変更するフローを想定しています。",
      registration_deadline: day(11),
      payment_deadline: day(13),
      payment_methods: ["cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    },
    {
      // 7. 中止イベント
      created_by: userId,
      community_id: communityId,
      payout_profile_id: ppForMethods(["stripe", "cash"]),
      title: "文章術ミニ勉強会",
      date: day(11),
      location: "新宿ワークラウンジ",
      fee: 3500,
      capacity: 90,
      description: "中止となった勉強会です。中止ステータスの表示確認用データです。",
      registration_deadline: day(4),
      payment_deadline: day(4),
      payment_methods: ["stripe", "cash"],
      invite_token: tokens.invite(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
      canceled_at: day(-1),
      canceled_by: userId,
    },
  ];
}

// --- ロジックヘルパー ---

function jpNickname() {
  return (faker.person.lastName() + faker.person.firstName()).slice(0, 20);
}

function determineAttendanceStatus(
  isPrimary: boolean,
  index: number,
  total: number
): AttendanceStatus {
  if (isPrimary) {
    const ratio = index / total;
    if (ratio < CONFIG.PROBABILITIES.ATTENDANCE.PRIMARY.ATTENDING) return "attending";
    if (ratio < CONFIG.PROBABILITIES.ATTENDANCE.PRIMARY.MAYBE) return "maybe";
    return "not_attending";
  }
  const r = faker.number.float({ min: 0, max: 1 });
  if (r < CONFIG.PROBABILITIES.ATTENDANCE.OTHERS.ATTENDING) return "attending";
  if (r < CONFIG.PROBABILITIES.ATTENDANCE.OTHERS.MAYBE) return "maybe";
  return "not_attending";
}

// --- DB 操作 ---

async function waitForPublicUserRow(client: AppSupabaseClient, userId: string) {
  for (let i = 0; i < CONFIG.DB.RETRY_MAX_ATTEMPTS; i++) {
    const { data, error } = await client.from("users").select("id").eq("id", userId).maybeSingle();
    if (error) throw error;
    if (data?.id) return;
    await sleep(CONFIG.DB.RETRY_WAIT_MS);
  }
  throw new Error("public.users row was not created by trigger in time.");
}

type SetupResult = {
  communityId: string;
  bookClubCommunityId: string;
  payoutProfileId: string | null;
};

async function setupUserAndCommunity(
  client: AppSupabaseClient,
  userId: string,
  now: Date
): Promise<SetupResult> {
  const demoStripeAccountId = process.env.DEMO_STRIPE_ACCOUNT_ID;

  await waitForPublicUserRow(client, userId);

  const { data: authUserRes, error: authUserErr } = await client.auth.admin.getUserById(userId);
  if (authUserErr) throw authUserErr;

  const { error: userUpsertErr } = await client.from("users").upsert(
    {
      id: userId,
      name: "デモユーザー",
      email: authUserRes.user?.email ?? null,
      updated_at: iso(now),
    },
    { onConflict: "id" }
  );
  if (userUpsertErr) throw userUpsertErr;

  // payout_profiles の作成
  let payoutProfileId: string | null = null;
  if (demoStripeAccountId) {
    const { data: ppData, error: ppErr } = await client
      .from("payout_profiles")
      .upsert(
        {
          owner_user_id: userId,
          stripe_account_id: demoStripeAccountId,
          status: "verified" as StripeAccountStatus,
          charges_enabled: true,
          payouts_enabled: true,
        },
        { onConflict: "owner_user_id" }
      )
      .select("id")
      .single();
    if (ppErr) throw new Error(`seed payout_profiles failed: ${ppErr.message}`);
    payoutProfileId = ppData.id;
  }

  // communities の作成（slug / legal_slug は DB デフォルト関数で自動生成）
  const { data: communityData, error: communityErr } = await client
    .from("communities")
    .insert({
      created_by: userId,
      name: "デモ テニスサークル",
      description:
        "みんなの集金のデモ用サークルです。イベント作成・出欠管理・集金フローを体験できます。",
      current_payout_profile_id: payoutProfileId,
    })
    .select("id")
    .single();
  if (communityErr) throw new Error(`seed communities failed: ${communityErr.message}`);

  const { data: bookClubCommunityData, error: bookClubCommunityErr } = await client
    .from("communities")
    .insert({
      created_by: userId,
      name: "デモ 読書会同好会",
      description:
        "みんなの集金のデモ用コミュニティです。読書会・勉強会・懇親会の出欠管理と集金フローを体験できます。",
      current_payout_profile_id: payoutProfileId,
    })
    .select("id")
    .single();
  if (bookClubCommunityErr)
    throw new Error(`seed book club communities failed: ${bookClubCommunityErr.message}`);

  // payout_profile の representative_community_id を設定
  if (payoutProfileId) {
    const { error: ppUpdateErr } = await client
      .from("payout_profiles")
      .update({ representative_community_id: communityData.id })
      .eq("id", payoutProfileId);
    if (ppUpdateErr)
      throw new Error(`update payout_profiles representative failed: ${ppUpdateErr.message}`);
  }

  return {
    communityId: communityData.id,
    bookClubCommunityId: bookClubCommunityData.id,
    payoutProfileId,
  };
}

async function insertEvents(
  client: AppSupabaseClient,
  userId: string,
  now: Date,
  communityId: string,
  payoutProfileId: string | null,
  scenarioFactory: (
    userId: string,
    now: Date,
    communityId: string,
    payoutProfileId: string | null
  ) => EventInsert[] = getEventScenarios
) {
  const events = scenarioFactory(userId, now, communityId, payoutProfileId);
  const { data: insertedEvents, error } = await client
    .from("events")
    .insert(events, { defaultToNull: false })
    .select("*");

  if (error) throw error;
  return insertedEvents ?? [];
}

async function insertAttendances(
  client: AppSupabaseClient,
  events: EventRow[],
  primaryEventId: string,
  now: Date
) {
  const allAttendancesToInsert: AttendanceInsert[] = [];

  for (const ev of events) {
    const isPrimary = ev.id === primaryEventId;
    const { MIN, MAX } = isPrimary
      ? CONFIG.COUNTS.ATTENDANCE.PRIMARY
      : CONFIG.COUNTS.ATTENDANCE.OTHERS;

    let count = int(MIN, MAX);
    if (ev.capacity !== null && count > ev.capacity) {
      count = ev.capacity;
    }

    for (let i = 0; i < count; i++) {
      const status = determineAttendanceStatus(isPrimary, i, count);
      allAttendancesToInsert.push({
        event_id: ev.id,
        nickname: jpNickname(),
        email: faker.internet.email({ provider: "example.com" }).toLowerCase(),
        status,
        guest_token: tokens.guest(),
        created_at: iso(addDays(now, ev.date < iso(now) ? -int(10, 40) : -int(0, 5))),
        updated_at: iso(now),
      });
    }
  }

  const maybeTargetIndex = allAttendancesToInsert.findIndex(
    (a) => a.event_id === primaryEventId && a.status === "maybe"
  );
  if (maybeTargetIndex !== -1) {
    allAttendancesToInsert[maybeTargetIndex].status = "attending";
  }

  const insertedAttendances: AttendanceRow[] = [];
  const CHUNK = CONFIG.DB.CHUNK_SIZE;

  for (let i = 0; i < allAttendancesToInsert.length; i += CHUNK) {
    const chunk = allAttendancesToInsert.slice(i, i + CHUNK);
    const { data, error } = await client.from("attendances").insert(chunk).select("*");
    if (error) throw error;
    insertedAttendances.push(...(data ?? []));
  }

  return insertedAttendances;
}

// --- 決済ロジック ---

type PaymentCandidate = { attendance: AttendanceRow; event: EventRow };

function createPaymentRecord(
  method: "stripe" | "cash",
  status: PaymentStatus,
  candidate: PaymentCandidate,
  now: Date,
  payoutProfileId: string | null,
  overrides: Partial<PaymentInsert> = {}
): PaymentInsert {
  const amount = candidate.event.fee;
  const isPaidOrRefunded = ["paid", "refunded", "received", "waived"].includes(status);
  const isStripe = method === "stripe";
  const { MIN, MAX } = CONFIG.COUNTS.PAYMENT_DATE_OFFSET;

  // paid_at と ID のデフォルトロジック
  const paid_at =
    isPaidOrRefunded && status !== "waived" ? iso(addDays(now, -int(MIN, MAX))) : null;
  const stripe_payment_intent_id = isStripe ? tokens.stripePI() : null;
  const stripe_checkout_session_id = isStripe ? tokens.stripeCS() : null;

  return {
    attendance_id: candidate.attendance.id,
    method,
    amount,
    status,
    paid_at,
    payout_profile_id: isStripe ? payoutProfileId : null,
    refunded_amount: status === "refunded" ? amount : 0,
    updated_at: iso(now),
    created_at: iso(addDays(now, -int(MIN, MAX))),
    application_fee_amount: 0,
    application_fee_tax_rate: 0,
    application_fee_tax_amount: 0,
    application_fee_excl_tax: 0,
    tax_included: true,
    version: 1,
    checkout_key_revision: 0,
    stripe_payment_intent_id,
    stripe_checkout_session_id,
    ...overrides,
  };
}

function distributeCandidates(attendances: AttendanceRow[], events: EventRow[]) {
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const pool = attendances
    .map((a) => {
      const ev = eventsById.get(a.event_id);
      return ev ? { attendance: a, event: ev } : null;
    })
    .filter((x): x is PaymentCandidate => !!x)
    .filter(({ attendance, event }) => event.fee > 0 && attendance.status === "attending");

  shuffle(pool);

  const stripe: PaymentCandidate[] = [];
  const cash: PaymentCandidate[] = [];

  for (const item of pool) {
    const methods = item.event.payment_methods as PaymentMethod[];
    const canStripe = methods.includes("stripe");
    const canCash = methods.includes("cash");

    if (canStripe && canCash) {
      // 50/50 でバランスを取る
      if (stripe.length <= cash.length) stripe.push(item);
      else cash.push(item);
    } else if (canStripe) {
      stripe.push(item);
    } else if (canCash) {
      cash.push(item);
    }
  }

  return { stripe, cash };
}

type AttendanceUpdate = { id: string; status: AttendanceStatus };

function generatePaymentPlan(
  attendances: AttendanceRow[],
  events: EventRow[],
  now: Date,
  payoutProfileId: string | null
): { payments: PaymentInsert[]; attendanceUpdates: AttendanceUpdate[] } {
  const { stripe: stripeCandidates, cash: cashCandidates } = distributeCandidates(
    attendances,
    events
  );
  const payments: PaymentInsert[] = [];

  // 候補者を安全に取り出すためのヘルパー
  const take = (list: PaymentCandidate[]) => {
    const item = list.pop();
    if (!item) throw new Error("Not enough candidates for mandatory payment scenarios.");
    return item;
  };

  // 1. 必須シナリオの設定
  const MANDATORY_SCENARIOS: Array<{
    method: "stripe" | "cash";
    status: PaymentStatus;
    overrides?: Partial<PaymentInsert>;
  }> = [
    { method: "stripe", status: "paid" },
    { method: "stripe", status: "pending", overrides: { paid_at: null } },
    { method: "stripe", status: "failed", overrides: { paid_at: null } },
    { method: "stripe", status: "refunded" },
    {
      method: "stripe",
      status: "waived",
      overrides: { paid_at: null, refunded_amount: 0, stripe_checkout_session_id: null },
    },
    { method: "cash", status: "pending" },
    { method: "cash", status: "received" },
    { method: "cash", status: "canceled", overrides: { paid_at: null } },
  ];

  // 必須シナリオを適用
  for (const scenario of MANDATORY_SCENARIOS) {
    const list = scenario.method === "stripe" ? stripeCandidates : cashCandidates;
    payments.push(
      createPaymentRecord(
        scenario.method,
        scenario.status,
        take(list),
        now,
        payoutProfileId,
        scenario.overrides
      )
    );
  }

  // 2. ランダムに補完
  const getRandomStripeStatus = (): PaymentStatus => {
    const r = faker.number.float({ min: 0, max: 1 });
    const { PAID, PENDING, FAILED } = CONFIG.PROBABILITIES.PAYMENT.STRIPE;
    if (r < PAID) return "paid";
    if (r < PENDING) return "pending";
    if (r < FAILED) return "failed";
    return "refunded";
  };

  const getRandomCashStatus = (): PaymentStatus => {
    const r = faker.number.float({ min: 0, max: 1 });
    return r < CONFIG.PROBABILITIES.PAYMENT.CASH.RECEIVED ? "received" : "pending";
  };

  while (stripeCandidates.length > 0 || cashCandidates.length > 0) {
    const useStripe =
      stripeCandidates.length > 0 && (cashCandidates.length === 0 || faker.datatype.boolean());

    if (useStripe) {
      const candidate = stripeCandidates.pop();
      if (candidate) {
        payments.push(
          createPaymentRecord("stripe", getRandomStripeStatus(), candidate, now, payoutProfileId)
        );
      }
    } else {
      const candidate = cashCandidates.pop();
      if (candidate) {
        payments.push(
          createPaymentRecord("cash", getRandomCashStatus(), candidate, now, payoutProfileId)
        );
      }
    }
  }

  // 3. キャンセルの決定（後処理）
  const attendanceUpdates: AttendanceUpdate[] = [];

  const markCanceled = (p: PaymentInsert, newStatus: AttendanceStatus) => {
    p.status = "canceled";
    if (p.attendance_id) {
      attendanceUpdates.push({ id: p.attendance_id, status: newStatus });
    }
  };

  const stripeCancelable = payments.filter(
    (p) => p.method === "stripe" && p.status && ["pending", "failed"].includes(p.status)
  );
  const cashCancelable = payments.filter((p) => p.method === "cash" && p.status === "pending");

  if (stripeCancelable[0]) markCanceled(stripeCancelable[0], "not_attending");
  if (stripeCancelable[1]) markCanceled(stripeCancelable[1], "maybe");
  if (cashCancelable[0]) markCanceled(cashCancelable[0], "not_attending");
  if (cashCancelable[1]) markCanceled(cashCancelable[1], "maybe");

  return { payments, attendanceUpdates };
}

async function processPaymentsAndCancellations(
  client: AppSupabaseClient,
  attendances: AttendanceRow[],
  events: EventRow[],
  now: Date,
  payoutProfileId: string | null
) {
  const { payments, attendanceUpdates } = generatePaymentPlan(
    attendances,
    events,
    now,
    payoutProfileId
  );

  if (payments.length > 0) {
    const { error } = await client.from("payments").insert(payments, { defaultToNull: false });
    if (error) throw error;
  }

  if (attendanceUpdates.length > 0) {
    const notAttendingIds = attendanceUpdates
      .filter((u) => u.status === "not_attending")
      .map((u) => u.id);
    const maybeIds = attendanceUpdates.filter((u) => u.status === "maybe").map((u) => u.id);

    const updateTime = iso(addHours(now, 2));

    if (notAttendingIds.length) {
      await client
        .from("attendances")
        .update({ status: "not_attending", updated_at: updateTime })
        .in("id", notAttendingIds);
    }
    if (maybeIds.length) {
      await client
        .from("attendances")
        .update({ status: "maybe", updated_at: updateTime })
        .in("id", maybeIds);
    }
  }
}

// --- メイン関数 ---

export async function seedDemoData(
  adminClient: AppSupabaseClient,
  userId: string
): Promise<{ communityId: string }> {
  // シードの初期化
  faker.seed(Number.parseInt(userId.replace(/\+/g, "-").slice(0, 8), 16));
  const now = new Date();

  // 1. ユーザー＆コミュニティのセットアップ
  const { communityId, bookClubCommunityId, payoutProfileId } = await setupUserAndCommunity(
    adminClient,
    userId,
    now
  );

  // 2. イベント
  const insertedEvents = await insertEvents(adminClient, userId, now, communityId, payoutProfileId);
  const primaryEvent = assertNonNull(
    insertedEvents.find((e) => e.title.includes("創立10周年記念")),
    "Primary event not found"
  );

  // 3. 出欠参加データ
  const insertedAttendances = await insertAttendances(
    adminClient,
    insertedEvents,
    primaryEvent.id,
    now
  );

  // 4. 決済＆キャンセル
  await processPaymentsAndCancellations(
    adminClient,
    insertedAttendances,
    insertedEvents,
    now,
    payoutProfileId
  );

  // 5. 読書会コミュニティのイベント
  const insertedBookClubEvents = await insertEvents(
    adminClient,
    userId,
    now,
    bookClubCommunityId,
    payoutProfileId,
    getBookClubEventScenarios
  );
  const bookClubPrimaryEvent = assertNonNull(
    insertedBookClubEvents.find((e) => e.title.includes("読書会1周年記念")),
    "Book club primary event not found"
  );

  // 6. 読書会コミュニティの出欠参加データ
  const insertedBookClubAttendances = await insertAttendances(
    adminClient,
    insertedBookClubEvents,
    bookClubPrimaryEvent.id,
    now
  );

  // 7. 読書会コミュニティの決済＆キャンセル
  await processPaymentsAndCancellations(
    adminClient,
    insertedBookClubAttendances,
    insertedBookClubEvents,
    now,
    payoutProfileId
  );

  return { communityId };
}
