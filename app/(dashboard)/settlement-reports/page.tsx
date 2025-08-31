import React from "react";
import { createClient } from "@core/supabase/server";
import { getCurrentUser } from "@core/auth/auth-utils";
import { redirect } from "next/navigation";
import { SettlementReportList, SettlementReportGenerator } from "@features/settlements/components";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function SettlementReportsPage() {
  // 認証確認
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const supabase = createClient();

  // 利用可能なイベント一覧を取得
  const { data: events } = await supabase
    .from("events")
    .select(
      `
      id,
      title,
      date,
      status,
      settlements!left (
        id,
        settlement_mode,
        generated_at
      )
    `
    )
    .eq("created_by", user.id)
    .order("date", { ascending: false });

  // イベントに既存レポートがあるかチェック
  const availableEvents = (events || []).map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
    status: event.status,
    hasExistingReport:
      (event.settlements as any[])?.some(
        (settlement) => settlement.settlement_mode === "destination_charge"
      ) || false,
  }));

  // 初期レポート一覧を取得（最新10件）- RPC関数で動的計算
  const { data: initialReportsRpc } = await (supabase as any).rpc("get_settlement_report_details", {
    p_created_by: user.id,
    p_event_ids: null,
    p_from_date: null,
    p_to_date: null,
    p_limit: 10,
    p_offset: 0,
  });

  const formattedReports = (initialReportsRpc || []).map((report: any) => ({
    eventId: report.event_id,
    eventTitle: report.event_title,
    eventDate: report.event_date,
    createdBy: user.id,
    stripeAccountId: report.stripe_account_id,
    transferGroup: report.transfer_group,
    generatedAt: new Date(report.generated_at),

    totalStripeSales: report.total_stripe_sales,
    totalStripeFee: report.total_stripe_fee,
    totalApplicationFee: report.total_application_fee,
    netPayoutAmount: report.net_payout_amount,

    // RPC関数により動的計算された実際の値
    totalPaymentCount: report.payment_count,
    refundedCount: report.refunded_count,
    totalRefundedAmount: report.total_refunded_amount,

    settlementMode: report.settlement_mode,
    status: report.status,
  }));

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">清算レポート</h1>
        <p className="text-muted-foreground">
          Destination charges でのイベント清算レポートを管理します
        </p>
      </div>

      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList>
          <TabsTrigger value="reports">レポート一覧</TabsTrigger>
          <TabsTrigger value="generate">レポート生成</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-6">
          <SettlementReportList
            initialReports={formattedReports}
            availableEvents={availableEvents}
          />
        </TabsContent>

        <TabsContent value="generate" className="space-y-6">
          <SettlementReportGenerator
            availableEvents={availableEvents}
            onReportGenerated={() => {
              // レポート生成後の処理をここに追加予定
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
