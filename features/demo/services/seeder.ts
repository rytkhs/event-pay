import "server-only";
import { randomBytes } from "crypto";

import { fakerJA as faker } from "@faker-js/faker";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];
type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];
type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];
type StripeAccountStatus = Database["public"]["Enums"]["stripe_account_status_enum"];

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type AttendanceRow = Database["public"]["Tables"]["attendances"]["Row"];
type AttendanceInsert = Database["public"]["Tables"]["attendances"]["Insert"];
type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];

const DEMO_STRIPE_ACCOUNT_ID = process.env.DEMO_STRIPE_ACCOUNT_ID;
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

const makeGuestToken = () => {
  const token = randomBytes(24).toString("base64url");
  return `gst_${token}`;
};

const makeInviteToken = () => {
  const token = randomBytes(24).toString("base64url");
  return `inv_${token}`;
};
const makeStripePI = () => `pi_${randomBytes(12).toString("hex")}`;
const makeStripeCS = () => `cs_test_${randomBytes(12).toString("hex")}`;

async function waitForPublicUserRow(client: SupabaseClient<Database>, userId: string) {
  for (let i = 0; i < 15; i++) {
    const { data, error } = await client.from("users").select("id").eq("id", userId).maybeSingle();
    if (error) throw error;
    if (data?.id) return;
    await sleep(200);
  }
  throw new Error("public.users row was not created by trigger in time.");
}

function jpNickname() {
  const name = faker.person.lastName() + faker.person.firstName();
  return name.slice(0, 20);
}

function weightedStatusForPrimary(i: number, total: number): AttendanceStatus {
  // primaryイベントは必ず混在（attending / maybe / not_attending）
  // 例: attending 65%, maybe 20%, not_attending 15%
  const ratio = i / total;
  if (ratio < 0.65) return "attending";
  if (ratio < 0.85) return "maybe";
  return "not_attending";
}

function statusForOther(): AttendanceStatus {
  // 他イベントは attending 多めだが maybe も少し入れる
  const r = faker.number.float({ min: 0, max: 1 });
  if (r < 0.78) return "attending";
  if (r < 0.92) return "maybe";
  return "not_attending";
}

function assertNonNull<T>(v: T | null | undefined, msg: string): T {
  if (v == null) throw new Error(msg);
  return v;
}

export async function seedDemoData(adminClient: SupabaseClient<Database>, userId: string) {
  faker.seed(Number.parseInt(userId.replace(/\+/g, "-").slice(0, 8), 16));

  const now = new Date();

  // 0) public.users 同期（トリガー）待ち＋運営者プロフィール補完
  await waitForPublicUserRow(adminClient, userId);

  const { data: authUserRes, error: authUserErr } =
    await adminClient.auth.admin.getUserById(userId);
  if (authUserErr) throw authUserErr;

  const operatorEmail = authUserRes.user?.email ?? null;

  const { error: userUpsertErr } = await adminClient.from("users").upsert(
    {
      id: userId,
      name: "デモユーザー",
      email: operatorEmail,
      updated_at: iso(now),
    },
    { onConflict: "id" }
  );
  if (userUpsertErr) throw userUpsertErr;

  // 0) Stripe Connect
  const { error } = await adminClient.from("stripe_connect_accounts").upsert(
    {
      user_id: userId,
      stripe_account_id: DEMO_STRIPE_ACCOUNT_ID ?? "",
      status: "verified" as StripeAccountStatus,
      charges_enabled: true,
      payouts_enabled: true,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(`seed stripe_connect_accounts failed: ${error.message}`);

  // 1) events（合計 7件：テニスサークル運用想定）
  const events: EventInsert[] = [
    // 1. 開催前（申込受付中・支払期限あり・stripe+cash）
    // シナリオ：少し高めのイベント（OB会など）で、猶予期間を持たせている
    {
      created_by: userId,
      title: "創立10周年記念 OB・OG交流会",
      date: iso(addDays(now, 20)),
      location: "ホテルメトロポリタン宴会場「富士」",
      fee: 5000,
      capacity: 80,
      description:
        "サークル創立10周年を記念した立食パーティーです。Stripeと現金の両方に対応しています。",
      registration_deadline: iso(addDays(now, 10)),
      payment_deadline: iso(addDays(now, 12)),
      payment_methods: ["stripe", "cash"] as PaymentMethod[],
      invite_token: makeInviteToken(),
      allow_payment_after_deadline: true,
      grace_period_days: 3,
    },

    // 2. 開催前（申込締切間近・capacity小さめ）
    // シナリオ：大会エントリーや合宿の二次募集など、枠が少なく急ぎのもの
    {
      created_by: userId,
      title: "【締切間近】秋季関東学生テニス選手権（予選）エントリー",
      date: iso(addDays(now, 7)),
      location: "有明テニスの森公園",
      fee: 3000,
      capacity: 30,
      description:
        "秋の個人戦のエントリー費です。協会への振込期限の関係上、締切後の支払いは一切受け付けられませんのでご注意ください。",
      registration_deadline: iso(addDays(now, 2)),
      payment_deadline: iso(addDays(now, 3)),
      payment_methods: ["stripe", "cash"] as PaymentMethod[],
      invite_token: makeInviteToken(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    },

    // 3. 開催済み（売上が立っている：Stripe paid と cash received が混在）
    // シナリオ：終わったイベントの収益確認用
    {
      created_by: userId,
      title: "【終了】新入生歓迎 BBQ大会🍖",
      date: iso(addDays(now, -30)),
      location: "昭和記念公園 バーベキューガーデン",
      fee: 4000,
      capacity: 120,
      description:
        "（開催終了）新入生歓迎イベント。Stripe決済済みと、現地での現金回収（受領済み）のデータが混在している状態を確認できます。",
      registration_deadline: iso(addDays(now, -45)),
      payment_deadline: iso(addDays(now, -40)),
      payment_methods: ["stripe", "cash"] as PaymentMethod[],
      invite_token: makeInviteToken(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
      created_at: iso(addDays(now, -50)),
      updated_at: iso(addDays(now, -45)),
    },

    // 4. 無料イベント（fee=0：決済なし/waivedの説明用）
    // シナリオ：自主練やミーティング
    {
      created_by: userId,
      title: "【自由参加】早朝自主練（コート開放）",
      date: iso(addDays(now, 14)),
      location: "大学テニスコート A・B面",
      fee: 0,
      capacity: 200,
      description: "参加費無料の自主練です。決済フローが発生しないため、参加表明のみで完了します。",
      registration_deadline: iso(addDays(now, 12)),
      payment_methods: [],
      invite_token: makeInviteToken(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    },

    // 5. Stripeのみイベント（オンライン完結）
    // シナリオ：物品購入（ウェアなど）
    {
      created_by: userId,
      title: "2026年度 チームウェア購入（パーカー）",
      date: iso(addDays(now, 10)),
      location: "オンライン（後日練習時に配布）",
      fee: 6000,
      capacity: 150,
      description:
        "チームパーカーの購入申し込みです。在庫管理と集金の手間を省くため、オンライン決済のみ受け付けます。",
      registration_deadline: iso(addDays(now, 6)),
      payment_deadline: iso(addDays(now, 7)),
      payment_methods: ["stripe"] as PaymentMethod[],
      invite_token: makeInviteToken(),
      allow_payment_after_deadline: true,
      grace_period_days: 2,
    },

    // 6. 現金のみイベント（従来運用の置き換え）
    // シナリオ：いつもの練習（小銭集金）
    {
      created_by: userId,
      title: "定例練習 @大井ふ頭",
      date: iso(addDays(now, 15)),
      location: "大井ふ頭中央海浜公園スポーツの森",
      fee: 2000,
      capacity: 60,
      description:
        "通常の練習会です。コート代とボール代を現地で集めます。現金のみの設定にしており、管理者が手動で「未受領」→「受領済み」に変更するフローを想定しています。",
      registration_deadline: iso(addDays(now, 11)),
      payment_deadline: iso(addDays(now, 13)),
      payment_methods: ["cash"] as PaymentMethod[],
      invite_token: makeInviteToken(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    },

    // 7. 中止イベント
    // シナリオ：雨天中止になりがちな屋外イベント
    {
      created_by: userId,
      title: "【雨天中止】お花見ミックスダブルス大会🌸",
      date: iso(addDays(now, 11)),
      location: "井の頭恩賜公園",
      fee: 3500,
      capacity: 90,
      description:
        "雨天予報のため中止となりました。中止ステータス（canceled_at）の表示確認用データです。",
      registration_deadline: iso(addDays(now, 4)),
      payment_deadline: iso(addDays(now, 4)),
      payment_methods: ["stripe", "cash"] as PaymentMethod[],
      invite_token: makeInviteToken(),
      allow_payment_after_deadline: false,
      grace_period_days: 0,
      canceled_at: iso(addDays(now, -1)),
      canceled_by: userId,
    },
  ];

  // insert 後に .select() をつけると挿入行を返せる（ID回収用）[web:18]
  const { data: insertedEvents, error: eventsErr } = await adminClient
    .from("events")
    .insert(events, { defaultToNull: false })
    .select("*");
  if (eventsErr) throw eventsErr;

  const eventByTitle = new Map<string, EventRow>();
  for (const e of insertedEvents ?? []) eventByTitle.set(e.title, e);

  const primaryEvent = assertNonNull(
    insertedEvents?.find((e) => e.title.includes("創立10周年記念")),
    "Primary event not found"
  );

  // 2) attendances（各イベント20〜100件で分散、primary は混在必須）
  const allAttendancesToInsert: AttendanceInsert[] = [];
  const attendanceCountByEventId = new Map<string, number>();

  for (const ev of insertedEvents ?? []) {
    let count = ev.id === primaryEvent.id ? int(45, 80) : int(20, 100);

    // 定員オーバーエラー(P0001)回避：定員がある場合は上限を合わせる
    if (ev.capacity !== null && count > ev.capacity) {
      count = ev.capacity;
    }
    attendanceCountByEventId.set(ev.id, count);

    for (let i = 0; i < count; i++) {
      const status: AttendanceStatus =
        ev.id === primaryEvent.id ? weightedStatusForPrimary(i, count) : statusForOther();

      allAttendancesToInsert.push({
        event_id: ev.id,
        nickname: jpNickname(),
        email: faker.internet.email({ provider: "example.com" }).toLowerCase(),
        status,
        guest_token: makeGuestToken(),
        created_at: iso(addDays(now, ev.date < iso(now) ? -int(10, 40) : -int(0, 5))),
        updated_at: iso(now),
      });
    }
  }

  // 大量 insert になるので、ざっくり分割
  const insertedAttendances: AttendanceRow[] = [];
  const CHUNK = 500;

  for (let i = 0; i < allAttendancesToInsert.length; i += CHUNK) {
    const chunk = allAttendancesToInsert.slice(i, i + CHUNK);
    const { data, error } = await adminClient.from("attendances").insert(chunk).select("*");
    if (error) throw error;
    insertedAttendances.push(...(data ?? []));
  }

  // 主要イベントに「maybe→attending に変えた参加者」を作る（更新して updated_at も進める）
  const maybeTarget = insertedAttendances.find(
    (a) => a.event_id === primaryEvent.id && a.status === "maybe"
  );
  if (maybeTarget) {
    const { error: updErr } = await adminClient
      .from("attendances")
      .update({ status: "attending" as AttendanceStatus, updated_at: iso(addHours(now, 1)) })
      .eq("id", maybeTarget.id);
    if (updErr) throw updErr;
    maybeTarget.status = "attending";
  }

  // ==== 3) payments（有料イベントかつ attending のみを対象） ====

  const eventsById = new Map<string, EventRow>();
  for (const ev of insertedEvents ?? []) eventsById.set(ev.id, ev);

  // 有料イベント & attending だけを決済候補とする（作成ルールを順守）
  const paidAttendancePool = insertedAttendances
    .map((a) => {
      const ev = eventsById.get(a.event_id);
      return ev ? { a, ev } : null;
    })
    .filter((x): x is { a: AttendanceRow; ev: EventRow } => !!x)
    .filter(({ a, ev }) => ev.fee > 0 && a.status === "attending");

  // 1. まずプール全体をシャッフルする
  shuffle(paidAttendancePool);

  const stripeCandidates: { attendance: AttendanceRow; event: EventRow }[] = [];
  const cashCandidates: { attendance: AttendanceRow; event: EventRow }[] = [];

  // 2. 1人ずつ取り出して、どちらのリストに入れるか決める（排他的に振り分け）
  for (const item of paidAttendancePool) {
    const methods = item.ev.payment_methods as PaymentMethod[];
    const canStripe = methods.includes("stripe");
    const canCash = methods.includes("cash");

    if (canStripe && canCash) {
      // 両方できるなら、現在の手持ちが少ない方に回す（バランス調整）
      if (stripeCandidates.length <= cashCandidates.length) {
        stripeCandidates.push({ attendance: item.a, event: item.ev });
      } else {
        cashCandidates.push({ attendance: item.a, event: item.ev });
      }
    } else if (canStripe) {
      stripeCandidates.push({ attendance: item.a, event: item.ev });
    } else if (canCash) {
      cashCandidates.push({ attendance: item.a, event: item.ev });
    }
  }

  // 同じ attendance_id に複数決済を付けない
  const usedAttendanceIds = new Set<string>();
  const take = (arr: { attendance: AttendanceRow; event: EventRow }[]) => {
    while (arr.length) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const x = arr.pop()!;
      if (!usedAttendanceIds.has(x.attendance.id)) {
        usedAttendanceIds.add(x.attendance.id);
        return x;
      }
    }
    throw new Error("Not enough attendance candidates to create required payments.");
  };

  const payments: PaymentInsert[] = [];

  const pushStripe = (
    status: PaymentStatus,
    x: { attendance: AttendanceRow; event: EventRow },
    opts?: Partial<PaymentInsert>
  ) => {
    const amount = x.event.fee;
    const base: PaymentInsert = {
      attendance_id: x.attendance.id,
      method: "stripe",
      amount,
      status,
      stripe_payment_intent_id: makeStripePI(),
      stripe_checkout_session_id: makeStripeCS(),
      paid_at: status === "paid" || status === "refunded" ? iso(addDays(now, -int(1, 25))) : null,
      refunded_amount: status === "refunded" ? amount : 0,
      updated_at: iso(now),
      created_at: iso(addDays(now, -int(1, 25))),
      application_fee_amount: 0,
      application_fee_tax_rate: 0,
      application_fee_tax_amount: 0,
      application_fee_excl_tax: 0,
      tax_included: true,
      version: 1,
      checkout_key_revision: 0,
      ...opts,
    };
    payments.push(base);
  };

  const pushCash = (
    status: PaymentStatus,
    x: { attendance: AttendanceRow; event: EventRow },
    opts?: Partial<PaymentInsert>
  ) => {
    const amount = x.event.fee;
    const base: PaymentInsert = {
      attendance_id: x.attendance.id,
      method: "cash",
      amount,
      status,
      paid_at: status === "received" ? iso(addDays(now, -int(1, 25))) : null,
      refunded_amount: 0,
      updated_at: iso(now),
      created_at: iso(addDays(now, -int(1, 25))),
      application_fee_amount: 0,
      application_fee_tax_rate: 0,
      application_fee_tax_amount: 0,
      application_fee_excl_tax: 0,
      tax_included: true,
      version: 1,
      checkout_key_revision: 0,
      ...opts,
    };
    payments.push(base);
  };

  // --- 必須ステータスを 1 件ずつ用意（すべて attending に紐づく） ---

  // Stripe: paid / pending / failed / refunded / waived
  pushStripe("paid", take(stripeCandidates));
  pushStripe("pending", take(stripeCandidates), { paid_at: null });
  pushStripe("failed", take(stripeCandidates), { paid_at: null });
  pushStripe("refunded", take(stripeCandidates));
  pushStripe("waived", take(stripeCandidates), {
    paid_at: null,
    refunded_amount: 0,
    stripe_checkout_session_id: null,
  });

  // Cash: pending / received
  pushCash("pending", take(cashCandidates));
  pushCash("received", take(cashCandidates));

  // 例外: attending + cash + canceled（キャンセル済みだが参加）
  pushCash("canceled", take(cashCandidates), { paid_at: null });

  // --- 残りをランダム生成（現実的な重み付け） ---

  while (stripeCandidates.length > 0 || cashCandidates.length > 0) {
    // StripeとCashのどちらの候補を使うか（候補が残っている方を使う）
    const useStripe =
      stripeCandidates.length > 0 && (cashCandidates.length === 0 || faker.datatype.boolean());

    if (useStripe) {
      const x = take(stripeCandidates);

      // Stripe: 現実的な確率分布でステータスを決定
      // 0.0 ~ 1.0 の乱数を生成
      const r = faker.number.float({ min: 0, max: 1 });
      let st: PaymentStatus;

      if (r < 0.85) {
        st = "paid"; // 85%
      } else if (r < 0.95) {
        st = "pending"; // 10%
      } else if (r < 0.98) {
        st = "failed"; // 3%
      } else {
        st = "refunded"; // 2%
      }

      pushStripe(st, x, {
        // paid/refunded なら支払日を入れる
        paid_at: st === "paid" || st === "refunded" ? iso(addDays(now, -int(1, 20))) : null,
        // refunded なら全額返金扱いにする
        refunded_amount: st === "refunded" ? x.event.fee : 0,
      });
    } else {
      const x = take(cashCandidates);

      // Cash: 現実的な確率分布でステータスを決定
      const r = faker.number.float({ min: 0, max: 1 });
      let st: PaymentStatus;

      if (r < 0.8) {
        st = "received"; // 80%
      } else {
        st = "pending"; // 20%
      }

      pushCash(st, x, {
        // received なら受領日を入れる
        paid_at: st === "received" ? iso(addDays(now, -int(1, 20))) : null,
      });
    }
  }

  // --- not_attending / maybe + canceled を作る ---

  type CanceledUpdate = { attendanceId: string; newStatus: AttendanceStatus };
  const canceledUpdates: CanceledUpdate[] = [];

  const markCanceled = (p: PaymentInsert | undefined, newStatus: AttendanceStatus) => {
    if (!p) return;
    // 確定済みは降格させない
    if (
      p.status === "paid" ||
      p.status === "received" ||
      p.status === "waived" ||
      p.status === "refunded"
    ) {
      return;
    }
    p.status = "canceled";
    canceledUpdates.push({ attendanceId: p.attendance_id, newStatus });
  };

  const stripeCancelable = payments.filter(
    (p) => p.method === "stripe" && (p.status === "pending" || p.status === "failed")
  );
  const cashCancelable = payments.filter((p) => p.method === "cash" && p.status === "pending");

  // not_attending + stripe + canceled
  markCanceled(stripeCancelable[0], "not_attending");
  // maybe + stripe + canceled
  markCanceled(stripeCancelable[1], "maybe");
  // not_attending + cash + canceled
  markCanceled(cashCancelable[0], "not_attending");
  // maybe + cash + canceled
  markCanceled(cashCancelable[1], "maybe");

  // --- DB へ insert / update ---

  if (payments.length > 0) {
    const { error: payErr } = await adminClient
      .from("payments")
      .insert(payments, { defaultToNull: false });
    if (payErr) throw payErr;
  }

  // 対象参加者のステータスを not_attending / maybe に変更（自動キャンセル後の状態を再現）
  if (canceledUpdates.length) {
    const notAttendingIds = canceledUpdates
      .filter((c) => c.newStatus === "not_attending")
      .map((c) => c.attendanceId);
    const maybeIds = canceledUpdates
      .filter((c) => c.newStatus === "maybe")
      .map((c) => c.attendanceId);

    if (notAttendingIds.length) {
      const { error } = await adminClient
        .from("attendances")
        .update({
          status: "not_attending" as AttendanceStatus,
          updated_at: iso(addHours(now, 2)),
        })
        .in("id", notAttendingIds);
      if (error) throw error;
    }

    if (maybeIds.length) {
      const { error } = await adminClient
        .from("attendances")
        .update({
          status: "maybe" as AttendanceStatus,
          updated_at: iso(addHours(now, 2)),
        })
        .in("id", maybeIds);
      if (error) throw error;
    }
  }
}
