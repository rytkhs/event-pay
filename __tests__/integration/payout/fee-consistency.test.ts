import { createClient } from "@supabase/supabase-js";
import { PayoutCalculator, DEFAULT_PLATFORM_FEE_CONFIG } from "@/lib/services/payout/calculation";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL as string;
const SUPABASE_KEY = process.env.SUPABASE_TEST_KEY as string;

(SUPABASE_URL && SUPABASE_KEY ? describe : describe.skip)("SQL vs JS fee consistency", () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  it("calc_total_stripe_fee matches JS calculation", async () => {
    // テスト用イベントを作成
    const eventRes = await supabase.from("events").insert({
      title: "Consistency Test Event",
      date: new Date().toISOString(),
      fee: 0,
      status: "past",
      created_by: "00000000-0000-0000-0000-000000000000",
    }).select("id").single();

    const eventId = eventRes.data!.id as string;

    // ダミー attendance/payment を作成
    const insertPayments = async (amounts: number[]) => {
      for (const amt of amounts) {
        const attendanceRes = await supabase.from("attendances").insert({
          event_id: eventId,
          status: "attending",
        }).select("id").single();
        await supabase.from("payments").insert({
          attendance_id: attendanceRes.data!.id,
          method: "stripe",
          amount: amt,
          status: "paid",
        });
      }
    };

    const amounts = [1000, 2000, 3000];
    await insertPayments(amounts);

    // DB 手数料
    const { data: dbFeeRow } = await supabase.rpc("calc_total_stripe_fee", { p_event_id: eventId });
    const dbFee = dbFeeRow as number;

    // JS 計算
    // fee_config を取得
    const { data: feeRow } = await supabase.from("fee_config").select("stripe_base_rate, stripe_fixed_fee").single();
    const stripeConfig = {
      baseRate: Number(feeRow!.stripe_base_rate),
      fixedFee: Number(feeRow!.stripe_fixed_fee),
    };
    const calc = new PayoutCalculator(stripeConfig, DEFAULT_PLATFORM_FEE_CONFIG);
    const payments = amounts.map(a => ({ amount: a, method: "stripe", status: "paid" }));
    const jsFee = calc.calculateBasicPayout(payments).totalStripeFee;

    expect(jsFee).toBe(dbFee);
  });
});
